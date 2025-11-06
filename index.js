// === IMPORTAR DEPENDENCIAS ===
const express = require('express');
const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { GoogleSpreadsheet } = require('google-spreadsheet');

// === CONFIGURAR EXPRESS PARA RENDER Y UPTIMEROBOT ===
const app = express();
app.get('/', (req, res) => res.send('🤖 Bot Reclutador activo y funcionando correctamente'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => console.log(`🌐 Servidor web escuchando en el puerto ${PORT}`));

// === CONFIGURAR GOOGLE SHEETS ===
const fs = require('fs');
let creds;

// Usa variable de entorno si existe (Render)
if (process.env.GOOGLE_CREDS) {
  creds = JSON.parse(process.env.GOOGLE_CREDS);
} else {
  // Si no existe, usa el archivo local (modo local)
  creds = JSON.parse(fs.readFileSync('./credentials.json', 'utf8'));
}
const SHEET_ID = '1UiMYK8odWxwMTFnJTlpHn5Eg3iVKTqPlWHIu4_8DAgA'; // <-- usa tu ID real
const doc = new GoogleSpreadsheet(SHEET_ID);

async function guardarEnSheets(datos) {
  try {
    // Autenticación
    await doc.useServiceAccountAuth({
      client_email: creds.client_email,
      private_key: creds.private_key.replace(/\\n/g, '\n'),
    });

    // Cargar hoja
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];

    // Verificar si las columnas existen, si no crearlas
    if (sheet.headerValues.length === 0) {
      await sheet.setHeaderRow([
        'Nombre', 'Direccion', 'CodigoPostal', 'GradoEstudios', 'Vacante',
        'ContinuaProceso', 'AniosExperiencia', 'LaborandoActual', 'UltimoSalario',
        'ExpectativaSalarial', 'CV_Recibido', 'Telefono', 'Fecha'
      ]);
    }

    // Agregar fila
    await sheet.addRow({
      Nombre: datos.nombre,
      Direccion: datos.direccion,
      CodigoPostal: datos.codigoPostal,
      GradoEstudios: datos.gradoEstudios,
      Vacante: datos.vacante,
      ContinuaProceso: datos.continuaProceso,
      AniosExperiencia: datos.aniosExperiencia,
      LaborandoActual: datos.laborandoActual,
      UltimoSalario: datos.ultimoSalario,
      ExpectativaSalarial: datos.expectativaSalarial,
      CV_Recibido: datos.cvRecibido || 'No',
      Telefono: datos.telefono,
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

// Función para enviar imagen según la vacante
async function enviarImagenVacante(chatId, vacanteNumero) {
  const imagenes = {
    1: 'https://i.ibb.co/yFkPX4Ht/T-cnico-en-operaciones-2.jpg',
    2: 'https://i.ibb.co/RwfWKdc/Ingeniero-de-Calidad.jpg',
    3: 'https://i.ibb.co/rKD351zz/Aux-Mtto-Industrial.jpg'
    // Nota: Te falta la imagen para la vacante 4 (Seguridad Industrial)
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

client.on('message', async msg => {
  const chatId = msg.from;
  const texto = msg.body.trim().toLowerCase();

  // Iniciar conversación si el mensaje contiene la palabra "interesado"
  if (!usuarios[chatId] && texto.includes('interesado')) {
    usuarios[chatId] = { 
      paso: 0, 
      datos: {
        telefono: chatId.replace('@c.us', '')
      }
    };
    
    const mensajeInicial = `👋 *Gracias por tu interés*, soy el asistente virtual de reclutamiento de *MetaOil*, para poder brindarte el servicio que mereces estaré recopilando algunos datos.\n\n*Me puedes dar tu nombre completo?*`;
    
    await msg.reply(mensajeInicial);
    return;
  }

  if (!usuarios[chatId]) return; // Ignorar mensajes fuera del flujo

  const user = usuarios[chatId];

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
                             `3. Auxiliar de Mantenimiento\n` +
                             `*Responde solo con el número (1, 2 o 3)*`;
      
      await msg.reply(mensajeVacantes);
      break;
      
    case 4: // Selección de vacante
      const vacanteNumero = msg.body.trim();
      const vacantes = {
        '1': 'Técnico en Operaciones',
        '2': 'Ingeniero de Calidad',
        '3': 'Auxiliar de Mantenimiento',
      };
      
      if (vacantes[vacanteNumero]) {
        user.datos.vacante = vacantes[vacanteNumero];
        user.paso++;
        
        // Enviar imagen de la vacante (opcional)
        await enviarImagenVacante(chatId, vacanteNumero);
        
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
        await msg.reply('❌ Por favor, responde solo con el número de la vacante (1, 2, 3 o 4)');
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
        user.paso = 99; // Saltar al final
        await msg.reply('👋 *Muchas gracias por tu interés en MetaOil. Te deseamos mucho éxito en tu búsqueda laboral.*');
        
        // Guardar datos y finalizar
        try {
          await guardarEnSheets(user.datos);
          delete usuarios[chatId];
        } catch (err) {
          console.error('Error guardando datos:', err);
        }
      } else {
        await msg.reply('❌ Por favor, responde *SI* o *NO*');
      }
      break;
      
    case 6: // Años de experiencia
      user.datos.aniosExperiencia = msg.body.trim();
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
      
    case 10: // Recepción de CV (PDF o cualquier documento)
      // Verificar si es un documento
      if (msg.hasMedia) {
        const media = await msg.downloadMedia();
        if (media.mimetype === 'application/pdf') {
          user.datos.cvRecibido = 'Sí';
          await msg.reply('✅ *CV recibido correctamente*');
        } else {
          user.datos.cvRecibido = 'Documento no PDF';
          await msg.reply('⚠️ *Se recibió un archivo, pero no es PDF. Por favor envía tu CV en formato PDF.*');
          break; // No avanzar hasta recibir PDF
        }
      } else {
        await msg.reply('📄 *Por favor, envía tu CV en formato PDF*');
        break; // No avanzar hasta recibir archivo
      }
      
      // Mensaje final
      user.paso++;
      const mensajeFinal = `🙏 *Muchas gracias por tu tiempo.*\n\n` +
                          `Debido a la cantidad de postulaciones que recibimos, nuestro equipo de reclutamiento estará analizando tus datos y uno de ellos te contactará para informarte sobre la decisión, lo que regularmente toma un par de semanas.\n\n` +
                          `*Que tengas un excelente día.* 🌟`;
      
      await msg.reply(mensajeFinal);
      
      // Guardar todos los datos en Google Sheets
      try {
        await guardarEnSheets(user.datos);
        console.log('✅ Datos del candidato guardados:', user.datos.nombre);
        delete usuarios[chatId];
      } catch (err) {
        console.error('❌ Error guardando datos finales:', err);
        await msg.reply('⚠️ Ocurrió un problema al guardar tus datos, pero hemos recibido tu información. Gracias por tu interés.');
        delete usuarios[chatId];
      }
      break;
  }
});

// === INICIALIZAR BOT ===
client.initialize();
