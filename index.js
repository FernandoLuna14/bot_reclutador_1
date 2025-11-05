// === IMPORTAR DEPENDENCIAS ===
const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleSpreadsheet } = require('google-spreadsheet');

// === CONFIGURAR EXPRESS PARA RENDER Y UPTIMEROBOT ===
const app = express();
app.get('/', (req, res) => res.send('🤖 Bot Reclutador activo y funcionando correctamente'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Servidor web escuchando en el puerto ${PORT}`));

// === CONFIGURAR GOOGLE SHEETS ===
const creds = JSON.parse(process.env.GOOGLE_CREDS); // Credenciales de Google Cloud en variable de entorno
const SHEET_ID = '1UiMYK8odWxwMTFnJTlpHn5Eg3iVKTqPlWHIu4_8DAgA'; // <-- usa tu ID real
const doc = new GoogleSpreadsheet(SHEET_ID);

async function guardarEnSheets(datos) {
  try {
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
    console.log('✅ Datos guardados en Google Sheets');
  } catch (err) {
    console.error('❌ Error al guardar en Google Sheets:', err);
  }
}

// === CONFIGURAR WHATSAPP ===
const client = new Client({
  authStrategy: new LocalAuth()
});

client.on('qr', qr => {
  console.clear();
  console.log('📱 Escanea este código QR con el WhatsApp del cliente:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot conectado correctamente a WhatsApp');
});

client.on('disconnected', () => {
  console.log('⚠️ Se perdió la conexión a WhatsApp. Reiniciando...');
  client.initialize();
});

// === LÓGICA DE CONVERSACIÓN ===
const usuarios = {};

client.on('message', async msg => {
  const chatId = msg.from;
  const texto = msg.body.trim().toLowerCase();

  // Iniciar conversación si el mensaje contiene la palabra "interesado"
  if (!usuarios[chatId] && texto.includes('interesado')) {
    usuarios[chatId] = { paso: 0, datos: {} };
    msg.reply('👋 ¡Hola! Soy el asistente de reclutamiento.\nPor favor dime tu *nombre completo*.');
    return;
  }

  if (!usuarios[chatId]) return; // Ignorar mensajes fuera del flujo

  const user = usuarios[chatId];

  switch (user.paso) {
    case 0:
      user.datos.nombre = msg.body.trim();
      user.paso++;
      msg.reply('Perfecto 👍 Ahora dime tu *edad*.');
      break;
    case 1:
      user.datos.edad = msg.body.trim();
      user.paso++;
      msg.reply('Gracias. Ahora tu *correo electrónico* 📧');
      break;
    case 2:
      user.datos.correo = msg.body.trim();
      user.paso++;
      msg.reply('Excelente. Ahora tu *número de teléfono* 📞');
      break;
    case 3:
      user.datos.telefono = msg.body.trim();
      user.paso++;
      msg.reply('Por último, ¿a qué *vacante* deseas aplicar? 💼');
      break;
    case 4:
      user.datos.vacante = msg.body.trim();
      await guardarEnSheets(user.datos);
      msg.reply('✅ ¡Gracias! Hemos registrado tu información. Pronto nos pondremos en contacto contigo.');
      delete usuarios[chatId];
      break;
  }
});

// === INICIALIZAR BOT ===
client.initialize();
