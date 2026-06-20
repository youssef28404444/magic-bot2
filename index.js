const { Client, LocalAuth } = require("whatsapp-web.js");
const axios = require("axios");
const qrcode = require("qrcode-terminal");

// ✅ رابط n8n Webhook - اتحط في Environment Variables على Railway
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "http://localhost:5678/webhook/custom_wa_bot";

// ✅ قائمة الأرقام المسموح ليها (ممكن تحطها في ENV كمان)
const WHITE_LIST_RAW = process.env.WHITE_LIST || "919423177880,917057758867";
const white_list_responders = WHITE_LIST_RAW.split(",").map(n => n.trim() + "@c.us");

console.log("🚀 Starting WhatsApp AI Bot...");
console.log("📡 n8n Webhook URL:", N8N_WEBHOOK_URL);
console.log("✅ Whitelisted numbers:", white_list_responders);

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: process.env.SESSION_PATH || "./.wwebjs_auth"
  }),
  puppeteer: {
    // ✅ ضروري على Railway وأي بيئة Linux/Docker
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
      "--disable-gpu"
    ],
  },
});

client.on("qr", (qr) => {
  console.log("\n📱 امسح الـ QR Code ده بواتساب بتاعك:");
  qrcode.generate(qr, { small: true });
  console.log("\n⚠️  لو شغال على Railway، افتح الـ Logs وامسح الـ QR من هناك\n");
});

client.on("ready", () => {
  console.log("✅ WhatsApp Client جاهز وشغال!");
});

client.on("auth_failure", (msg) => {
  console.error("❌ فشل في المصادقة:", msg);
});

client.on("disconnected", (reason) => {
  console.log("⚠️ انقطع الاتصال:", reason);
  console.log("🔄 جاري إعادة التشغيل...");
  client.initialize();
});

client.on("message_create", async (msg) => {
  console.log(`📩 رسالة جديدة - من: ${msg.from} | النص: ${msg.body}`);

  // تجاهل الرسائل اللي بعتها أنا
  if (msg.id.fromMe) {
    console.log("🔁 رسالة مني - تم تجاهلها");
    return;
  }

  // رسائل جروب
  if (msg.from.includes("@g.us")) {
    console.log("👥 رسالة جروب");
    const mentionedIds = msg.mentionedIds || [];
    const isWhiteListed = mentionedIds.some(
      (id) => white_list_responders.includes(id)
    );
    if (isWhiteListed) {
      await respond_to_message(msg);
    }
  } else {
    // رسائل شخصية
    console.log("💬 رسالة شخصية");
    if (white_list_responders.includes(msg.from)) {
      console.log("✅ الرقم في الـ Whitelist");
      await respond_to_message(msg);
    } else {
      console.log("🚫 الرقم مش في الـ Whitelist:", msg.from);
    }
  }
});

const respond_to_message = async (msg) => {
  if (!msg.body) {
    console.log("⚠️ الرسالة فاضية، مفيش حاجة نبعتها لـ n8n");
    return;
  }

  const data = {
    msg: msg.body,
    from: msg.from,
    from_name: msg._data?.notifyName || "Unknown",
  };

  console.log("📤 بعتالك لـ n8n:", data);

  try {
    const response = await axios.post(N8N_WEBHOOK_URL, data, {
      timeout: 30000, // 30 ثانية timeout
    });

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
    if (error.code === "ECONNREFUSED") {
      console.error("💡 تأكد إن N8N_WEBHOOK_URL صح في الـ Environment Variables");
    }
  }
};

client.initialize();
