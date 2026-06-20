const { Client, LocalAuth } = require("whatsapp-web.js");
const axios = require("axios");
const qrcode = require("qrcode-terminal");
const QRCode = require("qrcode");
const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const N8N_WEBHOOK_URL = "https://youssef28505.app.n8n.cloud/webhook-test/custom_wa_bot";
const SESSION_PATH = "/app/.wwebjs_auth";

// تعريف المتغيرات المفقودة
let currentQR = null;
let isConnected = false;

// دالة التنظيف الموحدة
function cleanLockFiles() {
    const lockFiles = ["SingletonLock", "SingletonCookie", "SingletonSocket", ".lock"];
    lockFiles.forEach(file => {
        const filePath = path.join(SESSION_PATH, file);
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
                console.log(`🧹 تم حذف ملف القفل: ${file}`);
            } catch (e) { }
        }
    });
}

console.log("🚀 Starting WhatsApp AI Bot...");
cleanLockFiles();

// الروت الأساسي لحل مشكلة Cannot GET /
app.get("/", async (req, res) => {
    if (isConnected) return res.send("<h1>✅ البوت متصل وشغال!</h1>");
    if (!currentQR) return res.send("<h1>⏳ جاري تحميل الـ QR، انتظر ثواني...</h1>");
    
    try {
        const qrImage = await QRCode.toDataURL(currentQR);
        res.send(`<h1>📱 امسح الـ QR</h1><img src="${qrImage}"/>`);
    } catch (e) {
        res.send("خطأ في عرض الـ QR");
    }
});

app.listen(PORT, () => console.log(`🌐 الصفحة شغالة على port ${PORT}`));

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: '/app/.wwebjs_auth' }),
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

client.on("message_create", async (msg) => {
    if (msg.id.fromMe) return; 
    await respond_to_message(msg);
});

const respond_to_message = async (msg) => {
    try {
        const response = await axios.post(N8N_WEBHOOK_URL, {
            msg: msg.body,
            from: msg.from,
            from_name: msg._data?.notifyName || "Unknown"
        }, { timeout: 30000 });
        if (response.data) await msg.reply(response.data.output || "تم الاستلام");
    } catch (error) {
        console.error("❌ خطأ n8n:", error.message);
    }
};

client.initialize();
