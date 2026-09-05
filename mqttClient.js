/**
 * mqttClient.js — Cliente MQTT con firma SigV4 para AWS IoT Core
 * ================================================================
 * Este módulo encapsula la conexión MQTT sobre WebSockets hacia AWS IoT Core.
 *
 * Protocolo: MQTT 3.1.1 sobre WSS (puerto 443)
 * Autenticación: AWS Signature Version 4 (SigV4) mediante URL pre-firmada.
 *
 * ⚠️ REGLA CRÍTICA (SDK 57 / Expo Go):
 *    La firma SigV4 se implementa con `crypto-js` (puro JavaScript).
 *    NUNCA usar `aws-signature-v4` ni ningún paquete que haga `require("crypto")`
 *    porque el runtime de React Native NO incluye la librería estándar de Node.js.
 *
 * Variables de entorno requeridas (en .env):
 *  - EXPO_PUBLIC_AWS_IOT_ENDPOINT   : Endpoint de IoT Core (ats)
 *  - EXPO_PUBLIC_AWS_REGION         : Región AWS (ej: us-east-2)
 *  - EXPO_PUBLIC_AWS_ACCESS_KEY_ID  : Access Key ID
 *  - EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY : Secret Access Key
 *  - EXPO_PUBLIC_DEVICE_MAC         : MAC Address del dispositivo simulado
 *
 * Uso:
 *   import { conectarMQTT } from '../mqttClient';
 *   const { client, conectado } = await conectarMQTT(onMensajeRecibido);
 */

import mqtt from 'mqtt';
import CryptoJS from 'crypto-js';

// ─── Constantes del contrato de tópicos ───────────────────────────────────────
export const TOPICO_TX = 'coco/simulador/tx';
export const TOPICO_RX = 'coco/simulador/rx';

// ─── Lectura de variables de entorno ─────────────────────────────────────────
// Expo expone las variables EXPO_PUBLIC_* de .env automáticamente en tiempo de ejecución.
export const AWS_IOT_ENDPOINT  = process.env.EXPO_PUBLIC_AWS_IOT_ENDPOINT  ?? '';
export const AWS_REGION        = process.env.EXPO_PUBLIC_AWS_REGION        ?? 'us-east-2';
export const AWS_ACCESS_KEY_ID = process.env.EXPO_PUBLIC_AWS_ACCESS_KEY_ID ?? '';
export const AWS_SECRET_KEY    = process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY ?? '';
export const DEVICE_MAC        = process.env.EXPO_PUBLIC_DEVICE_MAC        ?? '00:11:22:33:44:55';

// ─── Utilidades para SigV4 (puro JavaScript con crypto-js) ───────────────────

/**
 * Genera un hash SHA-256 en hexadecimal.
 * @param {string} str - Cadena a hashear
 * @returns {string} Hash SHA-256 en lowercase hex
 */
function sha256(str) {
  return CryptoJS.SHA256(str).toString(CryptoJS.enc.Hex);
}

/**
 * Genera HMAC-SHA256.
 * @param {CryptoJS.lib.WordArray|string} key - Clave (puede ser WordArray o string)
 * @param {string} data - Datos a firmar
 * @returns {CryptoJS.lib.WordArray} HMAC resultado (WordArray para encadenar)
 */
function hmacSha256(key, data) {
  return CryptoJS.HmacSHA256(data, key);
}

/**
 * Genera la clave de firma derivada de SigV4.
 * kSecret → kDate → kRegion → kService → kSigning
 */
function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate    = hmacSha256('AWS4' + secretKey, dateStamp);
  const kRegion  = hmacSha256(kDate, region);
  const kService = hmacSha256(kRegion, service);
  const kSigning = hmacSha256(kService, 'aws4_request');
  return kSigning;
}

/**
 * Formatea una fecha para SigV4 (YYYYMMDD'T'HHMMSS'Z')
 * @param {Date} date
 * @returns {{ amzDate: string, dateStamp: string }}
 */
function getDateStrings(date) {
  const iso = date.toISOString().replace(/[:\-]|\.\d{3}/g, '');
  return {
    amzDate:   iso.substring(0, 15) + 'Z',  // 20260905T183500Z
    dateStamp: iso.substring(0, 8),           // 20260905
  };
}

/**
 * construirUrlSigV4
 * -----------------
 * Genera una URL WebSocket pre-firmada con AWS Signature V4.
 * AWS IoT Core valida esta firma para autenticar la conexión sin certificados.
 *
 * Implementación basada en la documentación oficial de AWS:
 * https://docs.aws.amazon.com/iot/latest/developerguide/mqtt-ws.html
 *
 * @returns {string} URL WSS firmada lista para conectar con mqtt.connect()
 */
function construirUrlSigV4() {
  const host    = AWS_IOT_ENDPOINT.toLowerCase();
  const path    = '/mqtt';
  const service = 'iotdevicegateway';
  const method  = 'GET';

  const now = new Date();
  const { amzDate, dateStamp } = getDateStrings(now);

  const credentialScope = `${dateStamp}/${AWS_REGION}/${service}/aws4_request`;
  const credential      = `${AWS_ACCESS_KEY_ID}/${credentialScope}`;

  // Parámetros del query string en orden alfabético (requerido por SigV4)
  const queryParams = [
    `X-Amz-Algorithm=AWS4-HMAC-SHA256`,
    `X-Amz-Credential=${encodeURIComponent(credential)}`,
    `X-Amz-Date=${amzDate}`,
    `X-Amz-Expires=86400`,
    `X-Amz-SignedHeaders=host`,
  ].join('&');

  // Canonical Request: los 6 componentes que AWS requiere
  const canonicalRequest = [
    method,                              // HTTP method
    path,                                // URI canónica
    queryParams,                         // Query string canónico
    `host:${host}\n`,                    // Headers canónicos (solo host)
    'host',                              // Signed headers
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // SHA256 de body vacío
  ].join('\n');

  // String to Sign
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n');

  // Firma final
  const signingKey = getSignatureKey(AWS_SECRET_KEY, dateStamp, AWS_REGION, service);
  const signature  = hmacSha256(signingKey, stringToSign).toString(CryptoJS.enc.Hex);

  // URL completa firmada
  return `wss://${host}${path}?${queryParams}&X-Amz-Signature=${signature}`;
}

/**
 * conectarMQTT
 * ------------
 * Establece la conexión al broker AWS IoT Core con autenticación SigV4.
 * Al conectar, se suscribe automáticamente al tópico de bajada (RX).
 *
 * @param {function} onMensaje - Callback(topico: string, payload: string)
 *   que se llama cuando llega un mensaje al tópico RX.
 *
 * @returns {Promise<{ client: MqttClient, conectado: boolean }>}
 */
export function conectarMQTT(onMensaje) {
  return new Promise((resolve, reject) => {

    // Validar que existan las credenciales antes de intentar conectar
    if (!AWS_IOT_ENDPOINT || !AWS_ACCESS_KEY_ID || !AWS_SECRET_KEY) {
      console.warn(
        '[MQTT] Credenciales incompletas. Configura EXPO_PUBLIC_AWS_* en el archivo .env.'
      );
      resolve({ client: null, conectado: false });
      return;
    }

    // Construir URL firmada con SigV4
    let brokerUrl;
    try {
      brokerUrl = construirUrlSigV4();
      console.log('[MQTT] URL SigV4 generada correctamente.');
    } catch (e) {
      console.error('[MQTT] Error al generar URL SigV4:', e.message);
      resolve({ client: null, conectado: false });
      return;
    }

    // Client ID único basado en la MAC del dispositivo
    const clientId = `coco-simulador-${DEVICE_MAC.replace(/:/g, '')}`;

    const client = mqtt.connect(brokerUrl, {
      clientId,
      clean:           true,
      reconnectPeriod: 5000,   // Reconectar automáticamente cada 5s si se pierde la señal
      connectTimeout:  10000,  // Timeout de 10s para el handshake inicial
    });

    // ── Evento: Conexión exitosa ──────────────────────────────────────────────
    client.on('connect', () => {
      console.log('[MQTT] Conectado exitosamente a AWS IoT Core.');
      console.log(`[MQTT] Client ID: ${clientId}`);
      console.log(`[MQTT] Endpoint:  ${AWS_IOT_ENDPOINT}`);

      // Suscribirse al canal de bajada (mensajes desde el backend hacia el dispositivo)
      client.subscribe(TOPICO_RX, { qos: 1 }, (err) => {
        if (err) {
          console.error(`[MQTT] Error al suscribirse a ${TOPICO_RX}:`, err.message);
        } else {
          console.log(`[MQTT] Suscrito al tópico de bajada: ${TOPICO_RX}`);
        }
      });

      resolve({ client, conectado: true });
    });

    // ── Evento: Mensaje recibido desde el backend ─────────────────────────────
    client.on('message', (topico, mensaje) => {
      const payloadStr = mensaje.toString();
      console.log(`[MQTT ← RX] Mensaje recibido en '${topico}':`, payloadStr);

      // Llamar al callback del consumidor (index.tsx puede reaccionar al mensaje)
      if (typeof onMensaje === 'function') {
        try {
          onMensaje(topico, payloadStr);
        } catch (e) {
          console.error('[MQTT] Error en callback onMensaje:', e.message);
        }
      }
    });

    // ── Evento: Error de conexión ─────────────────────────────────────────────
    client.on('error', (err) => {
      console.warn('[MQTT] Error de conexión:', err.message);
      // No llamamos reject aquí para permitir reintentos automáticos
    });

    // ── Evento: Conexión cerrada ──────────────────────────────────────────────
    client.on('close', () => {
      console.log('[MQTT] Conexión cerrada. Esperando reconexión...');
    });

    // ── Evento: Reconexión en curso ───────────────────────────────────────────
    client.on('reconnect', () => {
      console.log('[MQTT] Intentando reconectar a AWS IoT Core...');
    });

    // ── Timeout de seguridad si la conexión inicial nunca llega ──────────────
    setTimeout(() => {
      if (!client.connected) {
        console.warn('[MQTT] Timeout: no se pudo conectar en 10s. Verifica credenciales y endpoint.');
        resolve({ client, conectado: false });
      }
    }, 10000);
  });
}
