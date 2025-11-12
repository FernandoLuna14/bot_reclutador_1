// === IMPORTAR DEPENDENCIAS ===
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleSpreadsheet } = require('google-spreadsheet');

// === CONFIGURACIÓN DE EXPRESS PARA RENDER Y UPTIMEBOT ===
const app = express();
app.get('/', (req, res) => res.send('🤖 Bot Reclutador activo y funcionando correctamente'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Servidor web escuchando en el puerto ${PORT}`));

// === configuracion de google sheets ===
const fs = require('fs');
let creds;

// usa variable de entorno si existe (Render)
if (process.env.GOOGLE_CREDS) {
  creds = JSON.parse(process.env.GOOGLE_CREDS);
} else {
  // si no existe, usar el modo local
  creds = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
}
const SHEET_ID = '1UiMYK8odWxwMTFnJTlpHn5Eg3iVKTqPlWHIu4_8DAgA';
const doc = new GoogleSpreadsheet(SHEET_ID);

async function guardarEnSheets(datos) {
  try {
    console.log('📊 Intentando guardar en Sheets...');
    
    // autenticación
    await doc.useServiceAccountAuth({
      client_email: creds.client_email,
      private_key: creds.private_key.replace(/\\n/g, '\n'),
    });

    await doc.loadInfo();
    console.log('📄 Hoja cargada:', doc.title);

    let sheet = doc.sheetsByIndex[0];
    console.log('📋 Usando hoja:', sheet.title);

    // forzar la creación de encabezados si es necesario
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

    // preparar datos para guardar
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

// === CONFIGURAR WHATSAPP ===
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  }
});

client.on('qr', qr => {
  console.clear();
  console.log('📱 Escanea este código QR con el WhatsApp del cliente:');
  qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
  console.log('✅ Bot conectado correctamente a WhatsApp');
  console.log('🧠 Sistema de gestión de memoria ACTIVADO');
  console.log(`📊 Configuración: ${CONFIG.MAX_CONVERSACIONES_ACTIVAS} conversaciones activas máximo`);
});

client.on('disconnected', (reason) => {
  console.log('⚠️ Se perdió la conexión a WhatsApp:', reason);
  console.log('🔄 Reiniciando en 5 segundos...');
  setTimeout(() => {
    client.initialize();
  }, 5000);
});

// === SISTEMA DE GESTIÓN DE MEMORIA ===
const CONFIG = {
  MAX_CONVERSACIONES_ACTIVAS: 5,
  MAX_TIEMPO_INACTIVO: 30 * 60 * 1000 // 30 minutos
};

const conversacionesActivas = new Map(); // Máximo 5 conversaciones en memoria
const colaEspera = []; // Usuarios esperando turno

// === FUNCIÓN PARA ENVIAR IMAGEN SEGÚN LA VACANTE ===
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
    // El flujo continúa aunque falle la imagen
  }
}

// === SISTEMA DE GESTIÓN DE MEMORIA ===
function gestionarMemoria() {
  // Si tenemos espacio, sacar usuarios de la cola
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
  
  // Enviar mensaje de bienvenida
  client.sendMessage(chatId, `👋 *Gracias por tu interés*, soy el asistente virtual de reclutamiento de *MetaOil*, para poder brindarte el servicio que mereces estaré recopilando algunos datos.\n\n*Me puedes dar tu nombre completo?*`);
  console.log(`🎯 Nueva conversación iniciada: ${chatId}`);
}

// === FUNCIÓN PARA FINALIZAR Y LIMPIAR MEMORIA ===
async function finalizarConversacion(chatId, datos, completo = true) {
  try {
    // Guardar en Google Sheets
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
    // LIMPIAR MEMORIA - esto es clave
    conversacionesActivas.delete(chatId);
    console.log(`🧹 Memoria liberada para: ${chatId}`);
    
    // Activar siguiente usuario en cola
    gestionarMemoria();
  }
}

// === PROCESAR MENSAJES DE USUARIOS EXISTENTES ===
async function procesarMensajeExistente(chatId, msg) {
  const user = conversacionesActivas.get(chatId);
  user.lastActivity = Date.now();

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
            
            // Mensaje final y guardado
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
  const texto = msg.body.trim().toLowerCase();

  // Si el usuario ya está en conversación activa
  if (conversacionesActivas.has(chatId)) {
    await procesarMensajeExistente(chatId, msg);
    return;
  }

  // Si es nuevo usuario y dice "interesado"
  if (texto.includes('interesado')) {
    // Verificar si hay espacio en memoria
    if (conversacionesActivas.size < CONFIG.MAX_CONVERSACIONES_ACTIVAS) {
      iniciarConversacion(chatId);
    } else {
      // Poner en cola de espera
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
      
      // Notificar al usuario
      client.sendMessage(chatId, '⏰ *La conversación se ha cerrado por inactividad.*\n\nSi deseas continuar, escribe *"Interesado"* nuevamente.');
    }
  }
  
  if (limpiados > 0) {
    console.log(`🧹 Limpiadas ${limpiados} conversaciones inactivas`);
    gestionarMemoria();
  }
}, 60 * 1000); // Revisar cada minuto

// Iniciar gestión de memoria cada 30 segundos
setInterval(gestionarMemoria, 30 * 1000);

// Manejar errores no capturados
process.on('unhandledRejection', (error) => {
  console.error('❌ Error no manejado:', error);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Excepción no capturada:', error);
});

// === INICIALIZAR BOT ===
console.log('🚀 Inicializando bot de WhatsApp...');
console.log('🧠 Sistema de gestión de memoria implementado');
client.initialize();

// Iniciar gestión de memoria después de 10 segundos
setTimeout(gestionarMemoria, 10000);





