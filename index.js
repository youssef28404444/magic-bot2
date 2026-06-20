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

// ✅ امسح كل الـ lock files في كل المجلدات بشكل recursive
function cleanLockFiles(dir) {
  if (!fs.existsSync(dir)) return;
  const lockNames = ["SingletonLock", "SingletonCookie", "SingletonSocket", "lockfile"];
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      const fullPath = path.join(dir, item);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          cleanLockFiles(fullPath); // recursive
        } else if (lockNames.includes(item)) {
          fs.unlinkSync(fullPath);
          console.log("🧹 حذفنا:", fullPath);
        }
      } catch (e) {}
    }
  } catch (e) {}
}

console.log("🚀 Starting WhatsApp AI Bot...");
console.log("📡 n8n Webhook URL:", N8N_WEBHOOK_URL);
console.log("🧹 جاري تنظيف الـ lock files...");
cleanLockFiles(SESSION_PATH);
console.log("✅ تنظيف خلص");

let currentQR = null;
let isConnected = false;

// ✅ صفحة الـ QR
app.get("/", async (req, res) => {
  if (isConnected) {
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>WhatsApp Bot</title>
    <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#111;color:#fff}.box{text-align:center;padding:40px;border-radius:16px;background:#1a1a1a}h1{color:#25D366}p{color:#aaa}</style>
    </head><body><div class="box"><h1>✅ WhatsApp متصل وشغال!</h1><p>البوت جاهز ويرد على الرسائل</p></div></body></html>`);
  }
  if (!currentQR) {
    return res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="5"><title>WhatsApp Bot</title>
    <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#111;color:#fff}.box{text-align:center;padding:40px;border-radius:16px;background:#1a1a1a}h1{color:#f0a500}p{color:#aaa}</style>
    </head><body><div class="box"><h1>⏳ جاري تحميل الـ QR Code...</h1><p>الصفحة هتتحدث تلقائياً كل 5 ثواني</p></div></body></html>`);
  }
  try {
    const qrImage = await QRCode.toDataURL(currentQR);
    res.send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="refresh" content="30"><title>امسح الـ QR</title>
    <style>body{font-family:Arial;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#111;color:#fff}.box{text-align:center;padding:40px;border-radius:16px;background:#1a1a1a}h1{color:#25D366}img{border-radius:12px;margin:20px 0;width:280px;height:280px}p{color:#aaa;font-size:.9rem}</style>
    </head><body><div class="box"><h1>📱 امسح الـ QR بواتساب</h1><img src="${qrImage}"/>
    <p>واتساب ← الأجهزة المرتبطة ← ربط جهاز جديد</p><p>الصفحة بتتحدث كل 30 ثانية</p></div></body></html>`);
  } catch (e) {
    res.send("خطأ في توليد الـ QR");
  }
});

app.listen(PORT, () => console.log(`🌐 الصفحة شغالة على port ${PORT}`));

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
  puppeteer: {
    headless: true,
    // ✅ نقول له يعمل userDataDir منفصل عن الـ session عشان الـ lock ميتعارضش
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu",
      "--disable-extensions",
      "--disable-background-networking",
    ],
  },
});

client.on("qr", (qr) => {
  currentQR = qr;
  isConnected = false;
  console.log("📱 QR جاهز - افتح الرابط");
  qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
  currentQR = null;
  isConnected = true;
  console.log("✅ WhatsApp جاهز وشغال!");
});

client.on("auth_failure", (msg) => {
  isConnected = false;
  console.error("❌ فشل المصادقة:", msg);
});

client.on("disconnected", (reason) => {
  isConnected = false;
  currentQR = null;
  console.log("⚠️ انقطع الاتصال:", reason);
  cleanLockFiles(SESSION_PATH);
  setTimeout(() => {
    console.log("🔄 إعادة التشغيل...");
    client.initialize();
  }, 5000);
});

client.on("message_create", async (msg) => {
  if (msg.id.fromMe) return;
  if (msg.from.includes("@g.us")) return;
  console.log(`💬 رسالة من: ${msg.from} | ${msg.body}`);
  await respond_to_message(msg);
});

const respond_to_message = async (msg) => {
  if (!msg.body) return;
  const data = { msg: msg.body, from: msg.from, from_name: msg._data?.notifyName || "Unknown" };
  try {
    const response = await axios.post(N8N_WEBHOOK_URL, data, { timeout: 30000 });
    const output = response.data?.output || response.data;
    if (output) {
      await msg.reply(typeof output === "string" ? output : JSON.stringify(output));
      console.log("✅ تم الرد");
    }
  } catch (error) {
    console.error("❌ خطأ n8n:", error.message);
  }
};

client.initialize();
