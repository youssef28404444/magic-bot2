const { Client, LocalAuth } = require("whatsapp-web.js");
const axios = require("axios");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/custom_wa_bot";
const SESSION_PATH = process.env.SESSION_PATH || "./.wwebjs_auth";

// ✅ امسح الـ lock files اللي بتسبب مشكلة "profile in use"
function cleanLockFiles(dir) {
  try {
    const lockFiles = [
      path.join(dir, "SingletonLock"),
      path.join(dir, "SingletonCookie"),
      path.join(dir, "SingletonSocket"),
    ];
    lockFiles.forEach((f) => {
      if (fs.existsSync(f)) {
        fs.unlinkSync(f);
        console.log("🧹 حذفنا lock file:", f);
      }
    });

    // امسح في كل المجلدات الجوانية كمان
    if (fs.existsSync(dir)) {
      fs.readdirSync(dir).forEach((sub) => {
        const subPath = path.join(dir, sub);
        if (fs.statSync(subPath).isDirectory()) {
          cleanLockFiles(subPath);
        }
      });
    }
  } catch (e) {
    console.log("⚠️ مشكلة في مسح lock files:", e.message);
  }
}

cleanLockFiles(SESSION_PATH);

let currentQR = null;
let isConnected = false;

app.get("/", async (req, res) => {
  if (isConnected) {
    return res.send(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><title>WhatsApp Bot</title>
      <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#111;color:#fff}.box{text-align:center;padding:40px;border-radius:16px;background:#1a1a1a}h1{color:#25D366;font-size:2rem}p{color:#aaa}</style>
      </head><body><div class="box"><h1>✅ WhatsApp متصل وشغال!</h1><p>البوت جاهز ويرد على الرسائل</p></div></body></html>
    `);
  }

  if (!currentQR) {
    return res.send(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="5"><title>WhatsApp Bot</title>
      <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#111;color:#fff}.box{text-align:center;padding:40px;border-radius:16px;background:#1a1a1a}h1{color:#f0a500}p{color:#aaa}</style>
      </head><body><div class="box"><h1>⏳ جاري تحميل الـ QR Code...</h1><p>الصفحة هتتحدث تلقائياً كل 5 ثواني</p></div></body></html>
    `);
  }

  try {
    const qrImage = await QRCode.toDataURL(currentQR);
    res.send(`
      <!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="30"><title>امسح الـ QR</title>
      <style>body{font-family:Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#111;color:#fff}.box{text-align:center;padding:40px;border-radius:16px;background:#1a1a1a}h1{color:#25D366}img{border-radius:12px;margin:20px 0;width:280px;height:280px}p{color:#aaa;font-size:.9rem}</style>
      </head><body><div class="box"><h1>📱 امسح الـ QR بواتساب</h1><img src="${qrImage}" alt="QR Code"/>
      <p>واتساب ← الأجهزة المرتبطة ← ربط جهاز جديد</p><p>الصفحة بتتحدث تلقائياً كل 30 ثانية</p></div></body></html>
    `);
  } catch (err) {
    res.send("خطأ في توليد الـ QR");
  }
});

app.listen(PORT, () => {
  console.log(`🌐 الصفحة شغالة على port ${PORT}`);
});

console.log("🚀 Starting WhatsApp AI Bot...");
console.log("📡 n8n Webhook URL:", N8N_WEBHOOK_URL);

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: SESSION_PATH,
  }),
  puppeteer: {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
    ],
  },
});

client.on("qr", (qr) => {
  currentQR = qr;
  isConnected = false;
  console.log("📱 QR Code جاهز - افتح الرابط العام على Railway");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  currentQR = null;
  isConnected = true;
  console.log("✅ WhatsApp Client جاهز وشغال!");
});

client.on("auth_failure", (msg) => {
  isConnected = false;
  console.error("❌ فشل في المصادقة:", msg);
});

client.on("disconnected", (reason) => {
  isConnected = false;
  currentQR = null;
  console.log("⚠️ انقطع الاتصال:", reason);
  cleanLockFiles(SESSION_PATH);
  console.log("🔄 جاري إعادة التشغيل...");
  setTimeout(() => client.initialize(), 3000);
});

client.on("message_create", async (msg) => {
  console.log(`📩 رسالة جديدة - من: ${msg.from} | النص: ${msg.body}`);

  if (msg.id.fromMe) {
    console.log("🔁 رسالة مني - تم تجاهلها");
    return;
  }

  if (msg.from.includes("@g.us")) {
    console.log("👥 رسالة جروب - تم تجاهلها");
    return;
  }

  console.log("💬 رسالة شخصية - جاري الرد...");
  await respond_to_message(msg);
});

const respond_to_message = async (msg) => {
  if (!msg.body) return;

  const data = {
    msg: msg.body,
    from: msg.from,
    from_name: msg._data?.notifyName || "Unknown",
  };

  console.log("📤 بعتالك لـ n8n:", data);

  try {
    const response = await axios.post(N8N_WEBHOOK_URL, data, { timeout: 30000 });
    console.log("📥 الرد من n8n:", response.data);

    const output = response.data?.output || response.data;
    if (output) {
      await msg.reply(typeof output === "string" ? output : JSON.stringify(output));
      console.log("✅ تم إرسال الرد");
    } else {
      console.log("⚠️ n8n مردتش بيانات");
    }
  } catch (error) {
    console.error("❌ خطأ في الاتصال بـ n8n:", error.message);
  }
};

client.initialize();
