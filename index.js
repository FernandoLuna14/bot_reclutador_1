const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');

// === CONFIGURAR GOOGLE SHEETS ===
const creds = JSON.parse(process.env.GOOGLE_CREDS); // archivo descargado de Google Cloud
const SHEET_ID = '1UiMYK8odWxwMTFnJTlpHn5Eg3iVKTqPlWHIu4_8DAgA'; // <-- cambia esto
const doc = new GoogleSpreadsheet(SHEET_ID);

// === FUNCIÓN PARA GUARDAR DATOS ===
async function guardarEnSheets(datos) {
  await doc.useServiceAccountAuth(creds);
  await doc.loadInfo();
  const sheet = doc.sheetsByIndex[0];
  await sheet.addRow({
    Nombre: datos.nombre,
    Edad: datos.edad,
    Correo: datos.correo,
    Telefono: datos.telefono,
    Vacante: datos.vacante,
    Fecha: new Date().toLocaleString()
  });
}

// === CONFIGURAR WHATSAPP ===
const client = new Client({
  authStrategy: new LocalAuth()
});

client.on('qr', qr => {
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot conectado a WhatsApp');
});

// === LÓGICA DE CONVERSACIÓN ===
const usuarios = {};

client.on('message', async msg => {
  const chatId = msg.from;
  const texto = msg.body.trim().toLowerCase();

  // Si no hay registro previo y el mensaje contiene "interesado"
  if (!usuarios[chatId] && texto.includes('interesado')) {
    usuarios[chatId] = { paso: 0, datos: {} };
    msg.reply('👋 ¡Hola! Soy el asistente de reclutamiento.\nPor favor dime tu *nombre completo*.');
    return;
  }

  // Si no está en conversación, ignorar
  if (!usuarios[chatId]) return;

  const user = usuarios[chatId];

  // Flujo de preguntas
  if (user.paso === 0) {
    user.datos.nombre = msg.body.trim();
    user.paso++;
    msg.reply('Perfecto 👍 Ahora dime tu *edad*.');
  } else if (user.paso === 1) {
    user.datos.edad = msg.body.trim();
    user.paso++;
    msg.reply('Gracias. Ahora tu *correo electrónico* 📧');
  } else if (user.paso === 2) {
    user.datos.correo = msg.body.trim();
    user.paso++;
    msg.reply('Excelente. Ahora tu *número de teléfono* 📞');
  } else if (user.paso === 3) {
    user.datos.telefono = msg.body.trim();
    user.paso++;
    msg.reply('Por último, ¿a qué *vacante* deseas aplicar? 💼');
  } else if (user.paso === 4) {
    user.datos.vacante = msg.body.trim();
    await guardarEnSheets(user.datos);
    msg.reply('✅ ¡Gracias! Hemos registrado tu información. Pronto nos pondremos en contacto contigo.');
    delete usuarios[chatId];
  }
});

client.initialize();

