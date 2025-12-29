// === IMPORTAR DEPENDENCIAS ===
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');
const path = require('path');

// === CONFIGURACIÓN DE EXPRESS ===
const app = express();

// === VARIABLES GLOBALES ===
let qrCodeData = null;
let qrCodeBase64 = null;
let botStatus = '⏳ Inicializando bot...';
let ultimaConexion = Date.now();
let conexionActiva = false;

// === FLAGS CRÍTICOS ANTI LOOP ===
let isInitializing = false;
let isClientReady = false;
let hasSession = false;

// === CONFIGURACIÓN DE MEMORIA ===
const CONFIG = {
  MAX_CONVERSACIONES_ACTIVAS: 5,
  MAX_TIEMPO_INACTIVO: 30 * 60 * 1000
};

const conversacionesActivas = new Map();
const colaEspera = [];

// === GOOGLE SHEETS ===
let creds;
if (process.env.GOOGLE_CREDS) {
  creds = JSON.parse(process.env.GOOGLE_CREDS);
} else {
  creds = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
}

const SHEET_ID = '1UiMYK8odWxwMTFnJTlpHn5Eg3iVKTqPlWHIu4_8DAgA';
const doc = new GoogleSpreadsheet(SHEET_ID);

// === GUARDAR EN SHEETS ===
async function guardarEnSheets(datos) {
  try {
    await doc.useServiceAccountAuth({
      client_email: creds.client_email,
      private_key: creds.private_key.replace(/\\n/g, '\n'),
    });

    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    try {
      await sheet.loadHeaderRow();
    } catch {
      await sheet.setHeaderRow([
        'Nombre','Direccion','CodigoPostal','GradoEstudios','Vacante',
        'ContinuaProceso','AñosExperiencia','LaborandoActual',
        'UltimoSalario','ExpectativaSalarial','CV_Recibido','Telefono','Fecha'
      ]);
    }

    await sheet.addRow({
      Nombre: datos.nombre || '',
      Direccion: datos.direccion || '',
      CodigoPostal: datos.codigoPostal || '',
      GradoEstudios: datos.gradoEstudios || '',
      Vacante: datos.vacante || '',
      ContinuaProceso: datos.continuaProceso || '',
      AñosExperiencia: datos.añosExperiencia || '',
      LaborandoActual: datos.laborandoActual || '',
      UltimoSalario: datos.ultimoSalario || '',
      ExpectativaSalarial: datos.expectativaSalarial || '',
      CV_Recibido: datos.cvRecibido || 'No',
      Telefono: datos.telefono || '',
      Fecha: new Date().toLocaleString()
    });

    return true;
  } catch (e) {
    console.error('❌ Error Google Sheets:', e);
    return false;
  }
}

// === SESIÓN WHATSAPP ===
const SESSION_PATH = path.join(__dirname, '.wwebjs_auth');

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: 'metaoil-reclutador-prod-v2'
  }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

// === INICIALIZACIÓN SEGURA ===
async function initializeWhatsAppSafe() {
  if (isInitializing || isClientReady || hasSession) {
    console.log('⏸️ Inicialización ignorada');
    return;
  }

  try {
    isInitializing = true;
    console.log('🚀 Inicializando WhatsApp...');
    await client.initialize();
  } catch (err) {
    console.error('❌ Error inicializando:', err);
  } finally {
    isInitializing = false;
  }
}

// === EVENTOS WHATSAPP ===
client.on('qr', async (qr) => {
  if (hasSession || isClientReady) {
    console.log('🚫 QR ignorado (sesión activa)');
    return;
  }

  console.log('📱 QR generado');
  qrcode.generate(qr, { small: true });

  botStatus = '🟡 Esperando escaneo de QR...';
  conexionActiva = false;

  qrCodeBase64 = await QRCode.toDataURL(qr);
});

client.on('ready', () => {
  console.log('✅ BOT CONECTADO');
  isClientReady = true;
  hasSession = true;
  conexionActiva = true;
  ultimaConexion = Date.now();
  botStatus = '🟢 Bot conectado y funcionando';
  qrCodeBase64 = null;
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Desconectado:', reason);

  isClientReady = false;
  hasSession = false;
  conexionActiva = false;
  botStatus = '🔴 Desconectado';

  if (reason === 'NAVIGATION') {
    if (fs.existsSync(SESSION_PATH)) {
      fs.rmSync(SESSION_PATH, { recursive: true, force: true });
    }
    setTimeout(initializeWhatsAppSafe, 5000);
  }
});

// === IMÁGENES VACANTES ===
async function enviarImagenVacante(chatId, num) {
  const imgs = {
    1: 'https://i.ibb.co/yFkPX4Ht/T-cnico-en-operaciones-2.jpg',
    2: 'https://i.ibb.co/RwfWKdc/Ingeniero-de-Calidad.jpg',
    3: 'https://i.ibb.co/rKD351zz/Aux-Mtto-Industrial.jpg'
  };
  if (!imgs[num]) return;
  const media = await MessageMedia.fromUrl(imgs[num]);
  await client.sendMessage(chatId, media);
}

// === CONVERSACIONES ===
function iniciarConversacion(chatId) {
  conversacionesActivas.set(chatId, {
    paso: 0,
    datos: { telefono: chatId.replace('@c.us','') },
    lastActivity: Date.now()
  });

  client.sendMessage(chatId,
    '👋 *Gracias por tu interés en MetaOil.*\n\n¿Me indicas tu *nombre completo*?'
  );
}

async function finalizarConversacion(chatId, datos, completo = true) {
  await guardarEnSheets(datos);
  conversacionesActivas.delete(chatId);
  if (completo) {
    await client.sendMessage(chatId, '📝 Información registrada correctamente.');
  }
  gestionarMemoria();
}

// === PROCESAR MENSAJES ===
async function procesarMensajeExistente(chatId, msg) {
  const user = conversacionesActivas.get(chatId);
  if (!user) return;

  user.lastActivity = Date.now();
  ultimaConexion = Date.now();

  switch (user.paso) {
    case 0:
      user.datos.nombre = msg.body.trim();
      user.paso++;
      return msg.reply('📍 Dirección completa:');

    case 1:
      user.datos.direccion = msg.body.trim();
      user.paso++;
      return msg.reply('📮 Código Postal:');

    case 2:
      user.datos.codigoPostal = msg.body.trim();
      user.paso++;
      return msg.reply('🎓 Último grado de estudios:');

    case 3:
      user.datos.gradoEstudios = msg.body.trim();
      user.paso++;
      return msg.reply(
        '📋 Vacante:\n1️⃣ Técnico\n2️⃣ Ingeniero\n3️⃣ Auxiliar'
      );

    case 4:
      const map = { '1':'Técnico','2':'Ingeniero','3':'Auxiliar' };
      if (!map[msg.body.trim()]) {
        return msg.reply('❌ Responde 1, 2 o 3');
      }
      user.datos.vacante = map[msg.body.trim()];
      user.paso++;
      await enviarImagenVacante(chatId, msg.body.trim());
      return msg.reply('¿Deseas continuar? *SI / NO*');

    case 5:
      if (msg.body.toLowerCase() === 'no') {
        user.datos.continuaProceso = 'No';
        return finalizarConversacion(chatId, user.datos, false);
      }
      user.datos.continuaProceso = 'Sí';
      user.paso++;
      return msg.reply('📄 Envía tu CV en PDF');

    case 6:
      if (!msg.hasMedia) return msg.reply('⚠️ Envía tu CV en PDF');
      const media = await msg.downloadMedia();
      if (media.mimetype !== 'application/pdf') {
        return msg.reply('⚠️ El archivo debe ser PDF');
      }
      user.datos.cvRecibido = 'Sí';
      return finalizarConversacion(chatId, user.datos, true);
  }
}

// === MENSAJES ENTRANTES ===
client.on('message', async msg => {
  if (msg.fromMe) return;

  const chatId = msg.from;
  const texto = msg.body.trim().toLowerCase();

  ultimaConexion = Date.now();

  if (conversacionesActivas.has(chatId)) {
    return procesarMensajeExistente(chatId, msg);
  }

  if (colaEspera.includes(chatId)) {
    return msg.reply(`⏳ Sigues en espera. Posición: ${colaEspera.indexOf(chatId)+1}`);
  }

  if (texto === 'interesado') {
    if (conversacionesActivas.size < CONFIG.MAX_CONVERSACIONES_ACTIVAS) {
      iniciarConversacion(chatId);
    } else {
      colaEspera.push(chatId);
      msg.reply('⏳ En cola de espera');
    }
  }
});

// === GESTIÓN MEMORIA ===
function gestionarMemoria() {
  while (
    conversacionesActivas.size < CONFIG.MAX_CONVERSACIONES_ACTIVAS &&
    colaEspera.length > 0
  ) {
    iniciarConversacion(colaEspera.shift());
  }
}

// === LIMPIADOR DE INACTIVOS ===
setInterval(() => {
  const ahora = Date.now();
  for (const [chatId, u] of conversacionesActivas) {
    if (ahora - u.lastActivity > CONFIG.MAX_TIEMPO_INACTIVO) {
      conversacionesActivas.delete(chatId);
      client.sendMessage(chatId,
        '⏰ Conversación cerrada por inactividad.\nEscribe *Interesado* para continuar.'
      );
    }
  }
  gestionarMemoria();
}, 60000);

// === SERVIDOR WEB ===
app.get('/', (req, res) => {
  res.send(`<h1>${botStatus}</h1>${qrCodeBase64 ? `<img src="${qrCodeBase64}" width="280">` : ''}`);
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`🌍 Servidor en puerto ${PORT}`));

// === INICIO ===
setTimeout(initializeWhatsAppSafe, 3000);

process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);
