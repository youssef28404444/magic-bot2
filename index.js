const { Client, LocalAuth } = require("whatsapp-web.js");
const axios = require("axios");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
// تأكد أن هذا الرابط هو الصحيح (بدون كلمة test إذا أردت الـ Production)
const N8N_WEBHOOK_URL = "https://youssef28505.app.n8n.cloud/webhook-test/custom_wa_bot";

const SESSION_PATH = "/app/.wwebjs_auth";

function cleanLockFiles() {
    const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket"];
    lockFiles.forEach(file => {
        const filePath = path.join(SESSION_PATH, file);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`🧹 تم حذف ملف القفل: ${file}`);
            } catch (e) {
                console.error(`⚠️ تعذر حذف ${file}:`, e.message);
            }
        }
    });
}

console.log("🚀 Starting WhatsApp AI Bot...");

function cleanLockFiles() {
    const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket", ".lock"];
    lockFiles.forEach(file => {
        const filePath = path.join(SESSION_PATH, file);
        if (fs.existsSync(filePath)) {
            try {
                // استخدام unlinkSync هو الصح
                fs.unlinkSync(filePath);
                console.log(`🧹 تم حذف ملف القفل القديم: ${file}`);
            } catch (e) {
                console.error(`⚠️ تعذر حذف ${file} (غالباً مفتوح):`, e.message);
            }
        }
    });
}
app.listen(PORT, () => console.log(`🌐 الصفحة شغالة على port ${PORT}`));

const client = new Client({
    authStrategy: new LocalAuth({ 
        dataPath: '/app/.wwebjs_auth'
    }),
    puppeteer: {
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    },
});

client.on("qr", (qr) => {
    currentQR = qr;
    isConnected = false;
    qrcode.generate(qr, { small: true });
});

client.on("ready", () => {
    currentQR = null;
    isConnected = true;
    console.log("✅ WhatsApp جاهز!");
});

client.on("disconnected", (reason) => {
    isConnected = false;
    console.log("⚠️ انقطع الاتصال:", reason);
    cleanLockFiles();
    process.exit(1);
});

client.on("message_create", async (msg) => {
    if (msg.id.fromMe) return; 
    console.log("💬 رسالة جديدة من:", msg.from, ":", msg.body);
    await respond_to_message(msg);
});

const respond_to_message = async (msg) => {
    console.log("📤 جاري إرسال الطلب لـ n8n...");
    try {
        const response = await axios.post(N8N_WEBHOOK_URL, {
            msg: msg.body,
            from: msg.from,
            from_name: msg._data?.notifyName || "Unknown"
        }, { timeout: 30000 });
        
        console.log("✅ الرد وصل من n8n:", response.data);
        if (response.data) await msg.reply(response.data.output || "تم الاستلام");
    } catch (error) {
        console.error("❌ خطأ الاتصال بـ n8n:", error.message);
    }
};

client.initialize();
