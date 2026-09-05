/**
 * CONTRATO IoT — COCO Simulador
 * ===============================
 * Define la estructura estricta de los payloads que el simulador publica
 * hacia AWS IoT Core via MQTT. Centraliza la validacion del contrato para
 * que cualquier modulo que quiera "hablar" con el backend pase por aqui.
 *
 * Topico de publicacion: coco/simulador/tx
 *
 * Tipos de evento validos  : 'MENSAJE' | 'ALERTA_SOS'
 * Formatos de payload validos: 'TEXTO'  | 'AUDIO_B64'
 */

// --- Credenciales AWS IoT Core ---
// TODO: Rellenar con las credenciales reales cuando esten disponibles.
export const AWS_ENDPOINT = '';
export const ACCESS_KEY   = '';
export const SECRET_KEY   = '';

// Topico MQTT donde el simulador publica sus eventos
export const TOPICO_TX = 'coco/simulador/tx';

// --- Conjuntos de valores permitidos ---
const TIPOS_EVENTO_VALIDOS     = ['MENSAJE', 'ALERTA_SOS'];
const FORMATOS_PAYLOAD_VALIDOS = ['TEXTO', 'AUDIO_B64'];

/**
 * generarPayload
 * --------------
 * Ensambla y valida un payload que cumple con el Contrato IoT.
 *
 * @param {string} mac_address     - Identificador del dispositivo (ej: "00:11:22:33:44:55").
 * @param {string} tipo_evento     - Tipo de evento: 'MENSAJE' o 'ALERTA_SOS'.
 * @param {string} formato_payload - Formato del campo data: 'TEXTO' o 'AUDIO_B64'.
 * @param {string} data            - Contenido del evento: texto plano o cadena Base64.
 *
 * @returns {{ mac_address, tipo_evento, formato_payload, data, timestamp_iso }}
 * @throws {Error} Si tipo_evento o formato_payload no son valores permitidos.
 */
export function generarPayload(mac_address, tipo_evento, formato_payload, data) {
  // Validacion estricta del tipo de evento
  if (!TIPOS_EVENTO_VALIDOS.includes(tipo_evento)) {
    throw new Error(
      `[IoT Contract] tipo_evento invalido: "${tipo_evento}". ` +
      `Valores permitidos: ${TIPOS_EVENTO_VALIDOS.join(', ')}.`
    );
  }

  // Validacion estricta del formato del payload
  if (!FORMATOS_PAYLOAD_VALIDOS.includes(formato_payload)) {
    throw new Error(
      `[IoT Contract] formato_payload invalido: "${formato_payload}". ` +
      `Valores permitidos: ${FORMATOS_PAYLOAD_VALIDOS.join(', ')}.`
    );
  }

  // Ensamblaje del payload final
  return {
    mac_address,
    tipo_evento,
    formato_payload,
    data,
    timestamp_iso: new Date().toISOString(),
  };
}
