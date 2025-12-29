// === IMPORTAR DEPENDENCIAS ===
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const QRCode = require('qrcode');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');
const path = require('path');

// === EXPRESS ===
const app = express();

// === VARIABLES GLOBALES ===
let qrCodeBase64 = null;
let botStatus = '⏳ Inicializando bot...';
let conexionActiva = false;

// === FLAGS ===
let isInitializing = false;
let isClientReady = false;

// === CONFIG ===
const CONFIG = {
  MAX_CONVERSACIONES_ACTIVAS: 3, // 🔥 REDUCIDO
  MAX_TIEMPO_INACTIVO: 20 * 60 * 1000
};

const conversacionesActivas = new Map();
const colaEspera = [];

// === GOOGLE SHEETS ===
const creds = process.env.GOOGLE_CREDS
  ? JSON.parse(process.env.GOOGLE_CREDS)
  : JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));

const doc = new GoogleSpreadsheet('1UiMYK8odWxwMTFnJTlpHn5Eg3iVKTqPlWHIu4_8DAgA');

// === WHATSAPP CLIENT ===
const client = new Client({
  authStrategy: new LocalAuth({ clientId: 'metaoil-prod' }),
  puppeteer: {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // 🔥 CLAVE
      '--single-process',        // 🔥 CLAVE
      '--no-zygote'              // 🔥 CLAVE
    ]
  }
});

// === INIT SEGURO ===
async function initBot() {
  if (isInitializing || isClientReady) return;
  isInitializing = true;
  try {
    await client.initialize();
  } finally {
    isInitializing = false;
  }
}

// === EVENTOS ===
client.on('qr', async qr => {
  qrCodeBase64 = await QRCode.toDataURL(qr);
  botStatus = '🟡 Escanea el QR';
  conexionActiva = false;
});

client.on('ready', () => {
  isClientReady = true;
  conexionActiva = true;
  qrCodeBase64 = null;
  botStatus = '🟢 Bot conectado';
});

client.on('disconnected', () => {
  isClientReady = false;
  conexionActiva = false;
  botStatus = '🔴 Desconectado';
  setTimeout(initBot, 5000);
});

// === MENSAJES ===
client.on('message', async msg => {
  if (msg.fromMe || !conexionActiva) return;

  const chatId = msg.from;
  const texto = msg.body?.toLowerCase().trim();

  // 🔥 RESPUESTA GARANTIZADA
  if (!conversacionesActivas.has(chatId) && texto === 'interesado') {
    conversacionesActivas.set(chatId, {
      paso: 0,
      datos: { telefono: chatId.replace('@c.us', '') },
      lastActivity: Date.now()
    });

    return client.sendMessage(
      chatId,
      '👋 *Gracias por tu interés en MetaOil.*\n\n¿Me indicas tu *nombre completo*?'
    );
  }
});

// === LIMPIADOR DE MEMORIA ===
setInterval(() => {
  const ahora = Date.now();
  for (const [id, u] of conversacionesActivas) {
    if (ahora - u.lastActivity > CONFIG.MAX_TIEMPO_INACTIVO) {
      conversacionesActivas.delete(id);
    }
  }
}, 60000);

// === WEB QR ===
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <meta charset="UTF-8" />
        ${qrCodeBase64 ? '<meta http-equiv="refresh" content="5">' : ''}
        <title>Bot MetaOil</title>
      </head>
      <body style="text-align:center;font-family:Arial">
        <h2>${botStatus}</h2>
        ${qrCodeBase64 ? `<img src="${qrCodeBase64}" width="280">` : ''}
      </body>
    </html>
  `);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('🌍 Servidor activo'));

initBot();

