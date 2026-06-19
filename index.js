/**
 * WhatsApp Bot — whatsapp-web.js + Axios + Express
 * -------------------------------------------------
 * Features:
 *   • LocalAuth session persistence (no re-scan on restart)
 *   • QR code printed in terminal via qrcode-terminal
 *   • Forwards every incoming message to an n8n webhook (Axios POST)
 *   • Express server on :3000 with POST /send-message endpoint
 */

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const express = require('express');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

// 🔗 Replace with your real n8n webhook URL
const N8N_WEBHOOK_URL = 'https://your-n8n-instance.com/webhook/YOUR_WEBHOOK_ID';

const EXPRESS_PORT = 3000;

// ─── WHATSAPP CLIENT ─────────────────────────────────────────────────────────

const client = new Client({
  authStrategy: new LocalAuth({
    // Session data is saved under ./.wwebjs_auth/
    dataPath: './.wwebjs_auth',
  }),
  puppeteer: {
    // Run headless Chrome inside Docker / servers with no display
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  },
});

// Print QR code in the terminal so the user can scan with WhatsApp
client.on('qr', (qr) => {
  console.log('\n📱  Scan the QR code below with WhatsApp:\n');
  qrcode.generate(qr, { small: true });
});

// Fired once authentication is complete
client.on('authenticated', () => {
  console.log('✅  Authenticated — session saved locally.');
});

// Fired when the client is fully ready to send/receive messages
client.on('ready', () => {
  console.log('🚀  WhatsApp client is ready!');
});

// Handle authentication failures
client.on('auth_failure', (msg) => {
  console.error('❌  Authentication failed:', msg);
});

// Handle disconnections
client.on('disconnected', (reason) => {
  console.warn('⚠️  Client disconnected:', reason);
  // Optionally re-initialize: client.initialize();
});

// ─── INCOMING MESSAGE HANDLER ─────────────────────────────────────────────────

client.on('message', async (msg) => {
  try {
    const sender = msg.from;           // e.g. "9201234567890@c.us"
    const body = msg.body;             // Message text
    const chat = await msg.getChat();
    const chatName = chat.name || sender;

    // 1️⃣  Log to console
    console.log(`\n📨  New message`);
    console.log(`   From  : ${sender}`);
    console.log(`   Chat  : ${chatName}`);
    console.log(`   Text  : ${body}`);

    // 2️⃣  Forward to n8n webhook
    const payload = {
      sender,
      chatName,
      message: body,
      timestamp: new Date().toISOString(),
    };

    const response = await axios.post(N8N_WEBHOOK_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10_000, // 10 s timeout
    });

    console.log(`   ✅  Forwarded to n8n — status ${response.status}`);
  } catch (err) {
    console.error('   ❌  Error handling incoming message:', err.message);
  }
});

// ─── EXPRESS SERVER ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

/**
 * POST /send-message
 * Body: { "to": "9201234567890@c.us", "message": "Hello!" }
 *
 * The `to` field must be a WhatsApp ID in the format:
 *   • Individual : <country-code><number>@c.us
 *   • Group      : <group-id>@g.us
 */
app.post('/send-message', async (req, res) => {
  const { to, message } = req.body;

  // ── Validation ──────────────────────────────────────────────────────────────
  if (!to || !message) {
    return res.status(400).json({
      success: false,
      error: 'Both "to" and "message" fields are required.',
    });
  }

  // Basic WhatsApp ID format check
  if (!to.includes('@')) {
    return res.status(400).json({
      success: false,
      error: '"to" must be a valid WhatsApp ID, e.g. "9201234567890@c.us"',
    });
  }

  // ── Send ────────────────────────────────────────────────────────────────────
  try {
    await client.sendMessage(to, message);
    console.log(`📤  Sent message to ${to}: "${message}"`);
    return res.status(200).json({ success: true, to, message });
  } catch (err) {
    console.error(`❌  Failed to send message to ${to}:`, err.message);
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Health-check endpoint
app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── BOOT ─────────────────────────────────────────────────────────────────────

app.listen(EXPRESS_PORT, () => {
  console.log(`\n🌐  Express server listening on http://localhost:${EXPRESS_PORT}`);
  console.log(`   POST /send-message  { to, message }`);
  console.log(`   GET  /health\n`);
});

// Initialize the WhatsApp client (opens Chromium, shows QR, etc.)
client.initialize();
