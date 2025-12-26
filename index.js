// === IMPORTAR DEPENDENCIAS ===
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const fs = require('fs');
const path = require('path');

// === CONFIGURACIÓN DE EXPRESS MEJORADA ===
const app = express();

// === SISTEMA ANTI-BUCLE - VARIABLES GLOBALES CRÍTICAS ===
let qrCodeData = null;
let qrCodeBase64 = null;
let botStatus = '⏳ Inicializando bot...';
let ultimaConexion = Date.now();
let conexionActiva = false;

// Variables para controlar el bucle de QR
let qrTimeout = null;
let qrAttempts = 0;
let isInitializing = false;
let initializationAttempts = 0;
const MAX_QR_ATTEMPTS = 3;
const MAX_INITIALIZATION_ATTEMPTS = 5;

// === GESTIÓN DE MEMORIA ===
const CONFIG = {
  MAX_CONVERSACIONES_ACTIVAS: 5,
  MAX_TIEMPO_INACTIVO: 30 * 60 * 1000
};
const conversacionesActivas = new Map();
const colaEspera = [];

// === RUTAS DE EXPRESS ===
app.get('/', (req, res) => {
  const estadoConexion = conexionActiva ? '🟢 Conectado' : '🔴 Desconectado';
  const tiempoConectado = conexionActiva
    ? `Hace ${Math.floor((Date.now() - ultimaConexion) / 1000)} segundos`
    : 'Desconectado';

  let html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>🤖 Bot Reclutador MetaOil</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      
      body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        color: white;
        min-height: 100vh;
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 20px;
      }
      
      .container {
        background: rgba(255, 255, 255, 0.1);
        backdrop-filter: blur(15px);
        border-radius: 20px;
        padding: 30px;
        width: 100%;
        max-width: 800px;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.2);
      }
      
      .header {
        text-align: center;
        margin-bottom: 30px;
      }
      
      .header h1 {
        font-size: 2.5rem;
        margin-bottom: 10px;
        text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
      }
      
      .header p {
        font-size: 1.1rem;
        opacity: 0.9;
      }
      
      .status-box {
        background: rgba(255, 255, 255, 0.2);
        border-radius: 15px;
        padding: 20px;
        margin: 20px 0;
        text-align: center;
        font-size: 1.2rem;
        border: 2px solid rgba(255, 255, 255, 0.3);
      }
      
      .qr-section {
        background: white;
        border-radius: 15px;
        padding: 25px;
        margin: 30px 0;
        text-align: center;
      }
      
      .qr-section h2 {
        color: #333;
        margin-bottom: 20px;
        font-size: 1.8rem;
      }
      
      .qr-container {
        margin: 0 auto;
        padding: 20px;
        background: #f8f9fa;
        border-radius: 10px;
        display: inline-block;
      }
      
      .qr-image {
        width: 280px;
        height: 280px;
        border-radius: 10px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.1);
      }
      
      .instructions {
        background: rgba(255, 255, 255, 0.15);
        border-radius: 15px;
        padding: 25px;
        margin-top: 25px;
      }
      
      .instructions h3 {
        color: #ffd700;
        margin-bottom: 15px;
        font-size: 1.5rem;
      }
      
      .instructions ol {
        padding-left: 25px;
        margin-bottom: 20px;
      }
      
      .instructions li {
        margin-bottom: 10px;
        line-height: 1.6;
      }
      
      .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 15px;
        margin: 25px 0;
      }
      
      .stat-box {
        background: rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 15px;
        text-align: center;
      }
      
      .stat-value {
        font-size: 1.8rem;
        font-weight: bold;
        color: #ffd700;
        margin: 5px 0;
      }
      
      .stat-label {
        font-size: 0.9rem;
        opacity: 0.8;
      }
      
      .action-buttons {
        display: flex;
        gap: 15px;
        justify-content: center;
        margin-top: 25px;
        flex-wrap: wrap;
      }
      
      .action-button {
        display: inline-block;
        padding: 12px 25px;
        border-radius: 50px;
        text-decoration: none;
        font-weight: bold;
        transition: transform 0.3s, box-shadow 0.3s;
        border: none;
        cursor: pointer;
        font-size: 1rem;
      }
      
      .btn-danger {
        background: #ff6b6b;
        color: white;
      }
      
      .btn-success {
        background: #4ecdc4;
        color: white;
      }
      
      .btn-primary {
        background: #ffd700;
        color: #333;
      }
      
      .action-button:hover {
        transform: translateY(-2px);
        box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
      }
      
      .connected {
        color: #4CAF50;
        font-size: 48px;
        margin: 20px 0;
      }
      
      .disconnected {
        color: #ff6b6b;
        font-size: 48px;
        margin: 20px 0;
      }
      
      .tip {
        background: rgba(255, 215, 0, 0.1);
        border-left: 4px solid #ffd700;
        padding: 15px;
        margin-top: 20px;
        border-radius: 0 10px 10px 0;
        font-size: 0.9rem;
      }
      
      @media (max-width: 600px) {
        .container {
          padding: 20px;
        }
        
        .header h1 {
          font-size: 2rem;
        }
        
        .qr-image {
          width: 220px;
          height: 220px;
        }
        
        .stats-grid {
          grid-template-columns: 1fr;
        }
        
        .action-buttons {
          flex-direction: column;
          align-items: center;
        }
        
        .action-button {
          width: 100%;
          max-width: 300px;
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>🤖 Bot Reclutador MetaOil</h1>
        <p>Sistema automatizado de reclutamiento vía WhatsApp</p>
      </div>
      
      <div class="status-box">
        ${botStatus}
      </div>
      
      ${qrCodeBase64 ? `
      <div class="qr-section">
        <h2>📱 Escanea este QR con WhatsApp</h2>
        <div class="qr-container">
          <img src="${qrCodeBase64}" alt="QR Code" class="qr-image">
        </div>
        <p style="margin-top: 15px; color: #666;">El QR expira en 60 segundos</p>
        ${qrAttempts > 0 ? `<p style="color: #ff6b6b;">Intento ${qrAttempts}/${MAX_QR_ATTEMPTS}</p>` : ''}
      </div>
      
      <div class="instructions">
        <h3>📋 Instrucciones paso a paso:</h3>
        <ol>
          <li>Abre WhatsApp en tu teléfono empresarial</li>
          <li>Toca los 3 puntos (⋮) → WhatsApp Web</li>
          <li>Apuntar la cámara al código QR</li>
          <li>Esperar la confirmación de conexión</li>
        </ol>
      </div>
      ` : conexionActiva ? `
      <div style="text-align: center;">
        <div class="connected">✅</div>
        <h2 style="margin: 20px 0;">¡Bot Conectado Correctamente!</h2>
        <p>El sistema de reclutamiento está funcionando y listo para recibir candidatos.</p>
      </div>
      ` : `
      <div style="text-align: center;">
        <div class="disconnected">❌</div>
        <h2 style="margin: 20px 0;">Bot Desconectado</h2>
        <p>Es necesario escanear el código QR para conectar WhatsApp.</p>
      </div>
      `}
      
      <div class="stats-grid">
        <div class="stat-box">
          <div class="stat-value">${conversacionesActivas ? conversacionesActivas.size : 0}/5</div>
          <div class="stat-label">Conversaciones Activas</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${colaEspera ? colaEspera.length : 0}</div>
          <div class="stat-label">En Cola de Espera</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${estadoConexion}</div>
          <div class="stat-label">Estado WhatsApp</div>
        </div>
        <div class="stat-box">
          <div class="stat-value">${tiempoConectado}</div>
          <div class="stat-label">Última Actividad</div>
        </div>
      </div>
      
      <div class="action-buttons">
        <a href="/limpiar-sesion" class="action-button btn-danger" onclick="return confirm('¿Estás seguro de reiniciar la sesión? Esto generará un nuevo QR.')">
          🔄 Reiniciar Sesión
        </a>
        <a href="/" class="action-button btn-success">
          🔁 Actualizar Página
        </a>
        <a href="https://docs.google.com/spreadsheets/d/${SHEET_ID}" class="action-button btn-primary" target="_blank">
          📊 Ver Google Sheets
        </a>
      </div>
      
      <div class="tip">
        💡 <strong>Consejo:</strong> Si desvinculaste WhatsApp desde tu teléfono, haz clic en "Reiniciar Sesión" y escanea el nuevo QR.
      </div>
    </div>
    
    <script>
      // Auto-refresh si hay QR pendiente
      if(${qrCodeBase64 ? 'true' : 'false'}) {
        setTimeout(() => {
          location.reload();
        }, 5000);
      }
      
      // Mostrar hora actual
      function updateTime() {
        const now = new Date();
        document.getElementById('time').textContent = now.toLocaleTimeString();
      }
      
      setInterval(updateTime, 1000);
      updateTime();
    </script>
    
    <div style="text-align: center; margin-top: 20px; opacity: 0.7; font-size: 0.9rem;">
      Hora del servidor: <span id="time"></span>
    </div>
  </body>
  </html>
  `;
  res.send(html);
});

// Ruta para forzar limpieza de sesión
app.get('/limpiar-sesion', (req, res) => {
  try {
    const sessionPath = path.join(__dirname, '.wwebjs_auth');
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
      console.log('🧹 Sesión limpiada manualmente desde /limpiar-sesion');

      // Reiniciar cliente
      setTimeout(() => {
        client.destroy();
        setTimeout(() => {
          client.initialize();
        }, 2000);
      }, 1000);

      res.send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Sesión Limpiada</title>
          <meta http-equiv="refresh" content="3;url=/" />
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 50px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .message {
              background: rgba(255, 255, 255, 0.1);
              padding: 30px;
              border-radius: 15px;
              backdrop-filter: blur(10px);
              display: inline-block;
            }
          </style>
        </head>
        <body>
          <div class="message">
            <h1>✅ Sesión Limpiada</h1>
            <p>Redirigiendo a la página principal en 3 segundos...</p>
          </div>
        </body>
        </html>
      `);
    } else {
      res.send('ℹ️ No hay sesión activa para limpiar. <a href="/">Volver</a>');
    }
  } catch (error) {
    console.error('❌ Error limpiando sesión:', error);
    res.send('❌ Error limpiando sesión. <a href="/">Volver</a>');
  }
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🌐 Servidor web escuchando en el puerto ${PORT}`);
  console.log(`📱 Accede a la interfaz web en: http://localhost:${PORT}`);
  console.log(`🌍 URL pública: https://bot-reclutador-1.onrender.com`);
});

// === CONFIGURACIÓN DE GOOGLE SHEETS ===
let creds;
const SHEET_ID = '1UiMYK8odWxwMTFnJTlpHn5Eg3iVKTqPlWHIu4_8DAgA';
const doc = new GoogleSpreadsheet(SHEET_ID);

// Usa variable de entorno si existe (Render)
if (process.env.GOOGLE_CREDS) {
  creds = JSON.parse(process.env.GOOGLE_CREDS);
} else {
  // Si no existe, usar el modo local
  creds = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
}

async function guardarEnSheets(datos) {
  try {
    console.log('📊 Intentando guardar en Sheets...');

    // Autenticación
    await doc.useServiceAccountAuth({
      client_email: creds.client_email,
      private_key: creds.private_key.replace(/\\n/g, '\n'),
    });

    await doc.loadInfo();
    console.log('📄 Hoja cargada:', doc.title);

    let sheet = doc.sheetsByIndex[0];
    console.log('📋 Usando hoja:', sheet.title);

    // Forzar la creación de encabezados si es necesario
    try {
      await sheet.loadHeaderRow();
      console.log('✅ Encabezados existentes cargados');
    } catch (e) {
      console.log('📝 Creando nuevos encabezados...');
      await sheet.setHeaderRow([
        'Nombre', 'Direccion', 'CodigoPostal', 'GradoEstudios', 'Vacante',
        'ContinuaProceso', 'AñosExperiencia', 'LaborandoActual', 'UltimoSalario',
        'ExpectativaSalarial', 'CV_Recibido', 'Telefono', 'Fecha'
      ]);
    }

    // Preparar datos para guardar
    const filaDatos = {
      Nombre: datos.nombre || 'No proporcionado',
      Direccion: datos.direccion || 'No proporcionado',
      CodigoPostal: datos.codigoPostal || 'No proporcionado',
      GradoEstudios: datos.gradoEstudios || 'No proporcionado',
      Vacante: datos.vacante || 'No proporcionado',
      ContinuaProceso: datos.continuaProceso || 'No proporcionado',
      AñosExperiencia: datos.añosExperiencia || 'No proporcionado',
      LaborandoActual: datos.laborandoActual || 'No proporcionado',
      UltimoSalario: datos.ultimoSalario || 'No proporcionado',
      ExpectativaSalarial: datos.expectativaSalarial || 'No proporcionado',
      CV_Recibido: datos.cvRecibido || 'No',
      Telefono: datos.telefono || 'No proporcionado',
      Fecha: new Date().toLocaleString()
    };

    console.log('💾 Guardando datos:', filaDatos.Nombre);
    await sheet.addRow(filaDatos);
    console.log('✅ Datos guardados exitosamente en Google Sheets');
    return true;

  } catch (err) {
    console.error('❌ Error detallado al guardar en Google Sheets:', err);
    console.error('❌ Stack trace:', err.stack);
    return false;
  }
}

// === FUNCIONES DEL SISTEMA ANTI-BUCLE ===
async function initializeWhatsAppSafely() {
  if (isInitializing) {
    console.log('⚠️ Ya se está inicializando, esperando...');
    return;
  }
  
  initializationAttempts++;
  console.log(`🔄 Intento de inicialización ${initializationAttempts}/${MAX_INITIALIZATION_ATTEMPTS}`);
  
  if (initializationAttempts > MAX_INITIALIZATION_ATTEMPTS) {
    console.log('🛑 DEMASIADOS REINICIOS. Deteniendo por 5 minutos...');
    botStatus = '🛑 Error: Demasiados reinicios. Esperando...';
    setTimeout(() => {
      initializationAttempts = 0;
      botStatus = '🔄 Reintentando conexión...';
      initializeWhatsAppSafely();
    }, 5 * 60 * 1000);
    return;
  }
  
  isInitializing = true;
  
  try {
    await client.initialize();
  } catch (error) {
    console.error('❌ Error en initialize():', error.message);
  } finally {
    isInitializing = false;
  }
}

function reiniciarClienteConDelay() {
  if (qrTimeout) clearTimeout(qrTimeout);
  qrTimeout = null;
  
  console.log('🔄 Programando reinicio controlado en 10 segundos...');
  botStatus = '🔴 Reconectando...';
  conexionActiva = false;
  
  setTimeout(() => {
    console.log('🔄 Ejecutando reinicio controlado.');
    if (client) {
      client.destroy().then(() => {
        setTimeout(() => {
          initializationAttempts = 0;
          qrAttempts = 0;
          initializeWhatsAppSafely();
        }, 2000);
      }).catch(err => {
        console.error('Error al destruir cliente:', err);
        setTimeout(() => initializeWhatsAppSafely(), 5000);
      });
    }
  }, 10000);
}

// === CONFIGURACIÓN Y EVENTOS DEL CLIENTE WHATSAPP ===
console.log('🧹 Verificando sesiones anteriores de WhatsApp...');
const sessionPath = path.join(__dirname, '.wwebjs_auth');
if (fs.existsSync(sessionPath)) {
  const stats = fs.statSync(sessionPath);
  const tiempoSesion = Date.now() - stats.mtimeMs;

  if (tiempoSesion > 24 * 60 * 60 * 1000) {
    console.log('🕒 Sesión antigua detectada (>1 día), limpiando...');
    fs.rmSync(sessionPath, { recursive: true, force: true });
  } else {
    console.log('✅ Sesión reciente encontrada');
  }
}

const client = new Client({
  authStrategy: new LocalAuth({
    clientId: "metaoil-reclutador-prod-v2",
    dataPath: process.env.NODE_ENV === 'production' ? '/tmp/.wwebjs_auth' : undefined
  }),
  puppeteer: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--single-process',
      '--disable-gpu'
    ]
  },
  restartOnAuthFail: false,
});

// Evento QR - CON SISTEMA ANTI-BUCLE
client.on('qr', async (qr) => {
  qrAttempts++;
  
  if (qrAttempts > MAX_QR_ATTEMPTS) {
    console.log(`🛑 Límite de QRs alcanzado (${MAX_QR_ATTEMPTS}). Deteniendo bucle.`);
    botStatus = '🛑 Error: Muchos QRs. Reiniciando...';
    reiniciarClienteConDelay();
    return;
  }
  
  console.clear();
  console.log('='.repeat(60));
  console.log(`📱 QR GENERADO - Intento ${qrAttempts}/${MAX_QR_ATTEMPTS}`);
  console.log(`🌐 https://bot-reclutador-1.onrender.com`);
  console.log('='.repeat(60));
  
  qrcode.generate(qr, { small: true });
  
  qrCodeData = qr;
  botStatus = `🟡 Esperando QR (${qrAttempts}/${MAX_QR_ATTEMPTS})`;
  conexionActiva = false;
  
  try {
    qrCodeBase64 = await QRCode.toDataURL(qr, {
      width: 280,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    });
    console.log('✅ QR convertido para página web');
  } catch (error) {
    console.error('❌ Error convirtiendo QR:', error);
  }
  
  // Timeout para este QR específico
  if (qrTimeout) clearTimeout(qrTimeout);
  qrTimeout = setTimeout(() => {
    if (!conexionActiva) {
      console.log('⏰ QR no escaneado en 60s. Generando nuevo...');
      reiniciarClienteConDelay();
    }
  }, 60000);
});

client.on('ready', () => {
  console.log('='.repeat(60));
  console.log('✅ BOT CONECTADO CORRECTAMENTE A WHATSAPP');
  console.log('🧠 Sistema de gestión de memoria: ACTIVADO');
  console.log(`📊 Configuración: ${CONFIG.MAX_CONVERSACIONES_ACTIVAS} conversaciones activas máximo`);
  console.log('='.repeat(60));

  // Resetear todos los contadores de bucle
  qrAttempts = 0;
  initializationAttempts = 0;
  if (qrTimeout) clearTimeout(qrTimeout);
  qrTimeout = null;
  
  // Actualizar estado global
  conexionActiva = true;
  ultimaConexion = Date.now();
  botStatus = '🟢 Bot conectado y funcionando';
  qrCodeData = null;
  qrCodeBase64 = null;
});

client.on('disconnected', (reason) => {
  console.log(`⚠️ Se perdió la conexión a WhatsApp: ${reason}`);
  botStatus = '🔴 Desconectado - Programando reconexión...';
  conexionActiva = false;
  
  // Limpiar sesión si fue desvinculado manualmente
  if (reason === 'NAVIGATION') {
    console.log('🧹 Limpiando sesión por desvinculación manual...');
    const sessionPath = path.join(__dirname, '.wwebjs_auth');
    if (fs.existsSync(sessionPath)) {
      fs.rmSync(sessionPath, { recursive: true, force: true });
    }
  }
  
  reiniciarClienteConDelay();
});

// === HEARTBEAT MEJORADO ===
setInterval(async () => {
  if (conexionActiva) {
    const tiempoInactivo = Date.now() - ultimaConexion;
    if (tiempoInactivo > 3 * 60 * 1000) {
      console.log('🕒 Sin actividad reciente. Verificando estado...');
      try {
        const state = await client.getState();
        if (state !== 'CONNECTED') {
          console.log('🔌 Estado incorrecto. Forzando reconexión...');
          reiniciarClienteConDelay();
        }
      } catch (error) {
        console.log('⚠️ Error en heartbeat:', error.message);
        reiniciarClienteConDelay();
      }
    }
  }
}, 2 * 60 * 1000);

// === FUNCIÓN PARA ENVIAR IMÁGENES DE LAS VACANTES ===
async function enviarImagenVacante(chatId, vacanteNumero) {
  const imagenes = {
    1: 'https://i.ibb.co/yFkPX4Ht/T-cnico-en-operaciones-2.jpg',
    2: 'https://i.ibb.co/RwfWKdc/Ingeniero-de-Calidad.jpg',
    3: 'https://i.ibb.co/rKD351zz/Aux-Mtto-Industrial.jpg'
  };

  const imagenUrl = imagenes[vacanteNumero];

  if (!imagenUrl) {
    console.log(`⚠️ No hay imagen configurada para la vacante ${vacanteNumero}`);
    return;
  }

  try {
    console.log(`📤 Enviando imagen para vacante ${vacanteNumero}`);
    const media = await MessageMedia.fromUrl(imagenUrl);
    await client.sendMessage(chatId, media, {
      caption: '🏭 MetaOil - Beneficios de la vacante'
    });
    console.log('✅ Imagen enviada correctamente');
  } catch (error) {
    console.log('❌ Error enviando imagen:', error.message);
  }
}

// === GESTIÓN DE MEMORIA PARA EVITAR SATURACIÓN ===
function gestionarMemoria() {
  while (conversacionesActivas.size < CONFIG.MAX_CONVERSACIONES_ACTIVAS && colaEspera.length > 0) {
    const chatId = colaEspera.shift();
    iniciarConversacion(chatId);
  }

  console.log(`🧠 Memoria: ${conversacionesActivas.size}/${CONFIG.MAX_CONVERSACIONES_ACTIVAS} activas, ${colaEspera.length} en espera`);
}

function iniciarConversacion(chatId) {
  conversacionesActivas.set(chatId, {
    paso: 0,
    datos: {
      telefono: chatId.replace('@c.us', ''),
      fechaInicio: new Date().toLocaleString()
    },
    lastActivity: Date.now()
  });

  client.sendMessage(chatId, `👋 *Gracias por tu interés*, soy el asistente virtual de reclutamiento de *MetaOil*, para poder brindarte el servicio que mereces estaré recopilando algunos datos.\n\n*Me puedes dar tu nombre completo?*`);
  console.log(`🎯 Nueva conversación iniciada: ${chatId}`);
}

// === FUNCIÓN PARA TERMINAR Y LIMPIAR MEMORIA ===
async function finalizarConversacion(chatId, datos, completo = true) {
  try {
    const guardadoExitoso = await guardarEnSheets(datos);

    if (guardadoExitoso) {
      console.log(`✅ Conversación completada y guardada: ${datos.nombre}`);
      if (completo) {
        await client.sendMessage(chatId, '📝 *Toda tu información ha sido registrada correctamente.*');
      }
    } else {
      await client.sendMessage(chatId, '📝 *Hemos recibido tu información. Gracias por tu interés en MetaOil.*');
    }
  } catch (err) {
    console.error('❌ Error guardando datos:', err);
    await client.sendMessage(chatId, '📝 *Hemos recibido tu información. Gracias por tu interés en MetaOil.*');
  } finally {
    conversacionesActivas.delete(chatId);
    console.log(`🧹 Memoria liberada para: ${chatId}`);
    gestionarMemoria();
  }
}

// === PROCESAR MENSAJES DE USUARIOS EXISTENTES ===
async function procesarMensajeExistente(chatId, msg) {
  const user = conversacionesActivas.get(chatId);
  if (!user) return;

  user.lastActivity = Date.now();
  ultimaConexion = Date.now();

  switch (user.paso) {
    case 0: // Nombre completo
      user.datos.nombre = msg.body.trim();
      user.paso++;
      await msg.reply('📝 *Me puedes proporcionar tu dirección completa?*');
      break;

    case 1: // Dirección
      user.datos.direccion = msg.body.trim();
      user.paso++;
      await msg.reply('📍 *Me puedes indicar tu Código Postal?*');
      break;

    case 2: // Código Postal
      user.datos.codigoPostal = msg.body.trim();
      user.paso++;
      await msg.reply('🎓 *Me podrías indicar tu último grado de estudios y tu especialidad?*');
      break;

    case 3: // Grado de estudios
      user.datos.gradoEstudios = msg.body.trim();
      user.paso++;

      const mensajeVacantes = `📋 *Muchas gracias. Para continuar podrías marcar el número de la vacante que te interesa?*\n\n` +
        `1. Técnico en Operaciones\n` +
        `2. Ingeniero de Calidad\n` +
        `3. Auxiliar de Mantenimiento\n\n` +
        `*Responde solo con el número (1, 2 o 3)*`;
      await msg.reply(mensajeVacantes);
      break;

    case 4: // Selección de vacante
      const vacanteNumero = msg.body.trim();
      const vacantes = {
        '1': 'Técnico en Operaciones',
        '2': 'Ingeniero de Calidad',
        '3': 'Auxiliar de Mantenimiento'
      };

      if (vacantes[vacanteNumero]) {
        user.datos.vacante = vacantes[vacanteNumero];
        user.paso++;

        await enviarImagenVacante(chatId, vacanteNumero);
        await new Promise(resolve => setTimeout(resolve, 1000));

        const beneficios = `✅ *Información de la vacante seleccionada:*\n\n` +
          `*${user.datos.vacante}*\n\n` +
          `🏢 *Beneficios:*\n` +
          `• Horarios: L-V 7:00 am – 5:00 pm y 5:00 pm – 3:00 am\n` +
          `• Comedor habilitado para que calientes y consumas tus alimentos\n` +
          `• Dormitorios para permanecer en la planta hasta un horario adecuado\n` +
          `• Plan de capacitación y desarrollo de carrera\n` +
          `• Uniformes\n` +
          `• Cuenta con todas las prestaciones de ley y superiores\n\n` +
          `*¿Te interesaría continuar en el proceso?*\n\n` +
          `Responde: *SI* o *NO*`;

        await msg.reply(beneficios);
      } else {
        await msg.reply('❌ Por favor, responde solo con el número de la vacante (1, 2 o 3)');
      }
      break;

    case 5: // Continuar proceso (SI/NO)
      const respuesta = msg.body.trim().toLowerCase();

      if (respuesta === 'si' || respuesta === 'sí') {
        user.datos.continuaProceso = 'Sí';
        user.paso++;
        await msg.reply('🎯 *Gracias, me gustaría conocer un poco más de tu perfil.*\n\n' +
          '*Me podrías decir cuántos años de experiencia tienes en el área?*');
      } else if (respuesta === 'no') {
        user.datos.continuaProceso = 'No';
        await msg.reply('👋 *Muchas gracias por tu interés en MetaOil. Te deseamos mucho éxito en tu búsqueda laboral.*');
        await finalizarConversacion(chatId, user.datos, false);
      } else {
        await msg.reply('❌ Por favor, responde *SI* o *NO*');
      }
      break;

    case 6: // Años de experiencia
      user.datos.añosExperiencia = msg.body.trim();
      user.paso++;
      await msg.reply('💼 *Actualmente te encuentras laborando?*');
      break;

    case 7: // Laborando actualmente
      user.datos.laborandoActual = msg.body.trim();
      user.paso++;
      await msg.reply('💰 *Cuál es o fue tu último salario Neto?*');
      break;

    case 8: // Último salario
      user.datos.ultimoSalario = msg.body.trim();
      user.paso++;
      await msg.reply('🎯 *Cuáles son tus expectativas salariales?*');
      break;

    case 9: // Expectativas salariales
      user.datos.expectativaSalarial = msg.body.trim();
      user.paso++;
      await msg.reply('📄 *Por último, me gustaría que me proporcionaras tu CV en formato PDF*');
      break;

    case 10: // Recepción de CV
      if (msg.hasMedia) {
        try {
          const media = await msg.downloadMedia();
          if (media.mimetype === 'application/pdf') {
            user.datos.cvRecibido = 'Sí';
            await msg.reply('✅ *CV recibido correctamente*');

            const mensajeFinal = `🙏 *Muchas gracias por tu tiempo.*\n\n` +
              `Debido a la cantidad de postulaciones que recibimos, nuestro equipo de reclutamiento estará analizando tus datos y uno de ellos te contactará para informarte sobre la decisión, lo que regularmente toma un par de semanas.\n\n` +
              `*Que tengas un excelente día.* 🌟`;
            await msg.reply(mensajeFinal);

            await finalizarConversacion(chatId, user.datos, true);
          } else {
            user.datos.cvRecibido = 'Documento no PDF';
            await msg.reply('⚠️ *Se recibió un archivo, pero no es PDF. Por favor envía tu CV en formato PDF.*');
          }
        } catch (error) {
          console.error('Error descargando media:', error);
          await msg.reply('⚠️ *Error al procesar el archivo. Por favor intenta enviar tu CV nuevamente.*');
        }
      } else {
        await msg.reply('📄 *Por favor, envía tu CV en formato PDF*');
      }
      break;
  }
}

// === LÓGICA PRINCIPAL DE MENSAJES ===
client.on('message', async msg => {
  if (msg.fromMe) return;

  const chatId = msg.from;
  const mensajeLimpio = msg.body.trim().toLowerCase();

  ultimaConexion = Date.now();

  if (conversacionesActivas.has(chatId)) {
    await procesarMensajeExistente(chatId, msg);
    return;
  }

  if (colaEspera.includes(chatId)) {
    await msg.reply(`⏳ *Aún estás en cola de espera.*\n\nTu posición: *${colaEspera.indexOf(chatId) + 1}*\nTe avisaremos cuando sea tu turno.`);
    return;
  }

  if (mensajeLimpio === 'interesado') {
    if (conversacionesActivas.size < CONFIG.MAX_CONVERSACIONES_ACTIVAS) {
      iniciarConversacion(chatId);
    } else {
      colaEspera.push(chatId);
      const posicion = colaEspera.length;
      await msg.reply(`⏳ *Estamos al máximo de capacidad momentánea.*\n\nTu posición en cola: *${posicion}*\nTe atenderemos en cuanto tengamos disponibilidad.`);
      console.log(`📥 Usuario agregado a cola: ${chatId}, posición: ${posicion}`);
      gestionarMemoria();
    }
  }
});

// === LIMPIADOR DE CONVERSACIONES INACTIVAS ===
setInterval(() => {
  const ahora = Date.now();
  let limpiados = 0;

  for (const [chatId, user] of conversacionesActivas.entries()) {
    if (ahora - user.lastActivity > CONFIG.MAX_TIEMPO_INACTIVO) {
      console.log(`🕐 Limpiando conversación inactiva: ${chatId}`);
      conversacionesActivas.delete(chatId);
      limpiados++;

      client.sendMessage(chatId, '⏰ *La conversación se ha cerrado por inactividad.*\n\nSi deseas continuar, escribe *"Interesado"* nuevamente.');
    }
  }

  if (limpiados > 0) {
    console.log(`🧹 Limpiadas ${limpiados} conversaciones inactivas`);
    gestionarMemoria();
  }
}, 60 * 1000);

setInterval(gestionarMemoria, 30 * 1000);

// Manejar errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Error no manejado:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
});

// === INICIALIZACIÓN SEGURA FINAL ===
console.log('🚀 Inicializando Bot de Reclutamiento MetaOil...');
console.log('🧠 Sistema de gestión de memoria implementado');
console.log('🛡️  Sistema anti-bucle de QR implementado');
console.log('❤️  Sistema de heartbeat/detección implementado');
console.log('💾 Verificando sesiones anteriores...');
console.log('='.repeat(60));

// Inicializar después de un pequeño delay
setTimeout(() => {
  initializeWhatsAppSafely();
}, 3000);

// Iniciar gestión de memoria después de 10 segundos
setTimeout(gestionarMemoria, 10000);
