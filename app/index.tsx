/**
 * SIMULADOR COCO — Pantalla Principal
 * =====================================
 * Esta pantalla simula la interfaz fisica del dispositivo COCO (Proyecto Zero-UI).
 * Disenada para adultos mayores: botones gigantes, alto contraste, sin menus complejos.
 *
 * Arquitectura de salida (Contrato IoT):
 *  - Todos los eventos se publican hacia AWS IoT Core via MQTT.
 *  - Topico de publicacion: coco/simulador/tx
 *  - El payload se valida y ensambla en iotContract.js antes del envio.
 *
 * Libreria MQTT: 'mqtt' (MQTT.js puro JS via WebSocket).
 *  - Compatible con Expo Go sin necesidad de Development Build.
 *  - AWS IoT Core acepta conexiones MQTT sobre WebSocket (wss://).
 *
 * Controles principales:
 *  - Boton SOS (rojo, centro): publica evento tipo 'ALERTA_SOS' via MQTT.
 *  - Panel de Recepcion (centro inferior): indicador visual animado que reacciona
 *    a los estados de reproduccion del rxPlayer (audio entrante desde la IA).
 *    Estado Inactivo: circulo neutro estatico.
 *    Estado Activo: circulo azul con animacion de pulso/respiracion continua.
 *    Restauracion: vuelve suavemente al estado inactivo al terminar la reproduccion.
 *  - Boton "Toca para hablar" (inferior): graba audio en vivo con VAD adaptativo de
 *    2 fases y publica via MQTT al detectar silencio.
 *
 * Flujo de dos pasos — Notas de Voz (AUDIO_DIRECTO):
 *  Cuando el backend envia una confirmacion de escucha (tipo_evento: 'CONFIRMACION_ESCUCHA'),
 *  se activa isDirectAudioMode=true. El siguiente audio grabado se publica con
 *  tipo_evento: 'AUDIO_DIRECTO' en vez de 'MENSAJE', indicandole al backend que NO
 *  debe transcribirlo. Tras el envio, el estado vuelve automaticamente a false.
 *
 * Auto-grabacion Zero-UI:
 *  Al terminar de sonar el audio de confirmacion (didJustFinish en rxPlayer),
 *  el microfono se activa automaticamente si isDirectAudioMode=true, sin que el
 *  adulto mayor tenga que volver a tocar la pantalla. Replica el comportamiento
 *  del altavoz fisico COCO.
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { File, Paths } from 'expo-file-system';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { MqttClient } from 'mqtt';

// Contrato IoT: validacion y ensamblaje de payloads
import {
  generarPayload,
  TOPICO_TX,
} from '../iotContract';

// Cliente MQTT con firma SigV4 para AWS IoT Core
import {
  conectarMQTT,
  DEVICE_MAC,
  AWS_IOT_ENDPOINT,
} from '../mqttClient';

const { width } = Dimensions.get('window');

// Tamano del boton SOS: 65% del ancho de pantalla
const SOS_BUTTON_SIZE = width * 0.65;

// MAC Address leida desde .env (EXPO_PUBLIC_DEVICE_MAC)
const MAC_ADDRESS_SIMULADOR = DEVICE_MAC;

export default function PantallaPrincipal() {

  // ─── Grabacion de audio en vivo con deteccion de silencio adaptativa (VAD) ──────
  const [grabando, setGrabando] = useState(false);
  const [haHablado, setHaHablado] = useState(false); // Estado para UI (Esperando vs Escuchando)
  const grabandoRef = useRef(false);
  const haHabladoRef = useRef(false);

  // Timestamps y contadores para medir voz y silencio
  const inicioGrabacionRef = useRef<number>(0);
  const ultimoSonidoRef = useRef<number>(0);
  const conteoVozMsRef = useRef<number>(0);
  const intervaloMonitoreoRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Parametros de calibracion VAD (Voice Activity Detection):
  // -32 dB es el umbral para discriminar ruido ambiente normal (-40 a -32 dB) de voz (-25 a -5 dB)
  const UMBRAL_VOZ_DB = -32;
  const TIEMPO_ESPERA_INICIO_MS = 8000;    // 8s para que el adulto mayor empiece a hablar
  const VOZ_SOSTENIDA_MIN_MS = 200;        // 200ms de audio continuo para confirmar que empezo a hablar
  const DURACION_SILENCIO_MS = 1500;       // 1.5s de silencio continuo para auto-enviar tras hablar
  const TIEMPO_MAXIMO_MS = 20000;          // 20s maximo total de seguridad

  const audioRecorder = useAudioRecorder(
    { ...RecordingPresets.HIGH_QUALITY, isMeteringEnabled: true }
  );

  // Estado reactivo del grabador con muestreo rapido (100ms)
  const estadoRecorder = useAudioRecorderState(audioRecorder, 100);

  // Animacion de pulsacion para el boton SOS
  const latidoSOS = useRef(new Animated.Value(1)).current;

  // ─── Animacion del Panel de Recepcion (Rx) ───────────────────────────────────
  // Controla la escala del efecto de pulso/respiracion cuando llega audio de la IA.
  // En estado inactivo vale 1 (sin transformacion); al reproducir, oscila entre 1 y 1.18.
  const pulsoRx = useRef(new Animated.Value(1)).current;

  // Opacidad del anillo exterior animado del panel Rx (0 en reposo, 1 al reproducir)
  const opacidadAnilloRx = useRef(new Animated.Value(0)).current;

  // Referencia al loop de animacion para poder detenerlo limpiamente
  const animacionRxRef = useRef<Animated.CompositeAnimation | null>(null);

  // ─────────────────────────────────────────────────────────────
  // Cliente MQTT con SigV4 — AWS IoT Core via WebSocket
  // Las credenciales se leen de .env (EXPO_PUBLIC_AWS_*)
  // mqttClient.js maneja la firma SigV4 y la suscripcion al topico RX.
  // ─────────────────────────────────────────────────────────────

  // Referencia al cliente MQTT (no provoca re-renders al cambiar)
  const mqttClientRef = useRef<MqttClient | null>(null);

  // Estado de conexion visible en la UI
  const [connected, setConnected] = useState(false);

  // ─── Modo Nota de Voz Directa (flujo de dos pasos) ───────────────────────────
  // Cuando este flag es true, el siguiente audio se publica como 'AUDIO_DIRECTO'
  // (nota de voz para el familiar) en vez de 'MENSAJE' (comando para la IA).
  // Se activa al recibir la confirmacion de escucha de la IA por el canal RX,
  // y se resetea automaticamente despues de cada envio directo.
  const [isDirectAudioMode, setIsDirectAudioMode] = useState(false);
  // Ref sincronizada para acceso imperativo desde callbacks asincrono
  const isDirectAudioModeRef = useRef(false);

  // Ultimo mensaje recibido desde el backend (topico RX)
  const [ultimoMensajeRx, setUltimoMensajeRx] = useState<string | null>(null);

  // ─── Control de reproduccion de audio entrante (Rx) ─────────────────────────
  // URI del audio Rx a reproducir — al cambiar, useAudioPlayer crea un nuevo player.
  // Se usa nombre de archivo único con timestamp para forzar la re-creación del hook.
  const [rxAudioUri, setRxAudioUri] = useState<string | null>(null);

  // Player dedicado al audio entrante (Rx) — se recrea automáticamente al cambiar rxAudioUri.
  const rxPlayer = useAudioPlayer(rxAudioUri ? { uri: rxAudioUri } : null);

  // Estado reactivo del player Rx: permite detectar didJustFinish para la auto-grabacion.
  const estadoRxPlayer = useAudioPlayerStatus(rxPlayer);

  // Ref sincronizada con rxPlayer para acceso imperativo (barge-in desde el callback MQTT).
  const rxPlayerRef = useRef(rxPlayer);
  rxPlayerRef.current = rxPlayer;

  // Auto-play: cuando llega un nuevo URI de audio Rx, reproducirlo inmediatamente.
  useEffect(() => {
    if (rxAudioUri && rxPlayer) {
      rxPlayer.play();
      console.log('[MQTT ← RX] ▶️  Reproduciendo audio entrante...');
    }
  }, [rxAudioUri]);

  // ─── Animacion del Panel Rx: reacciona al estado de reproduccion ─────────────
  // Cuando rxPlayer empieza a sonar → inicia el loop de pulso/respiracion.
  // Cuando rxPlayer termina (didJustFinish) → detiene el loop y vuelve a idle.
  useEffect(() => {
    const reproduciendo = estadoRxPlayer.playing ?? false;

    if (reproduciendo) {
      // Limpiar animacion previa si existia
      animacionRxRef.current?.stop();

      // Fade-in del anillo exterior
      Animated.timing(opacidadAnilloRx, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();

      // Loop de pulso/respiracion: la escala oscila entre 1 y 1.18 continuamente
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulsoRx, {
            toValue: 1.18,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulsoRx, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      animacionRxRef.current = loop;
      loop.start();
    } else {
      // Detener el loop y volver suavemente al estado inactivo
      animacionRxRef.current?.stop();
      animacionRxRef.current = null;

      Animated.parallel([
        Animated.timing(pulsoRx, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(opacidadAnilloRx, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [estadoRxPlayer.playing]);

  // ─── Auto-grabacion Zero-UI ──────────────────────────────────────────────────
  // Cuando el audio de confirmacion de la IA termina de sonar (didJustFinish)
  // y isDirectAudioMode esta activo, se activa el microfono automaticamente.
  // Esto replica el comportamiento del altavoz fisico: el adulto mayor escucha
  // "Ok, te escucho" y comienza a hablar sin tocar ninguna pantalla.
  useEffect(() => {
    if (estadoRxPlayer.didJustFinish && isDirectAudioModeRef.current) {
      console.log(
        '[COCO Zero-UI] 🎙 Audio de confirmacion finalizado — ' +
        'Abriendo microfono automaticamente para Nota de Voz Directa...'
      );
      // Pequeño delay de 300ms para que no se corte abruptamente tras el audio
      const timer = setTimeout(() => {
        alPresionarHablar();
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [estadoRxPlayer.didJustFinish]);

  useEffect(() => {
    // Verificacion rapida de credenciales antes de conectar
    if (!AWS_IOT_ENDPOINT) {
      console.log(
        '[MQTT] EXPO_PUBLIC_AWS_IOT_ENDPOINT no configurado. ' +
        'Completa el archivo .env con las credenciales de AWS IoT Core.'
      );
      return;
    }

    // Callback que se ejecuta cuando llega un mensaje desde el backend (RX)
    // Soporta el Contrato Rx de Vicente:
    //   { mac_address, tipo_evento, formato_payload, data, prioridad }
    //   formato_payload: 'AUDIO_B64' → decodifica, escribe en caché y reproduce.
    //   prioridad: 'URGENTE' → barge-in (interrumpe el audio actual antes de reproducir).
    const alRecibirMensaje = async (topico: string, payloadStr: string) => {
      console.log(`[MQTT ← RX] Mensaje recibido en '${topico}':`, payloadStr);
      setUltimoMensajeRx(payloadStr);

      // ── 1. Parsear el payload ────────────────────────────────────────────────
      let payload: {
        mac_address?: string;
        tipo_evento?: string;
        formato_payload?: string;
        data?: string;
        prioridad?: string;
      };
      try {
        payload = JSON.parse(payloadStr);
      } catch {
        console.warn('[MQTT ← RX] Payload no es JSON válido, se ignora.');
        return;
      }

      // ── 2. Detectar confirmacion de escucha → activar modo AUDIO_DIRECTO ────
      // El backend senaliza que el siguiente audio debe ser una nota directa
      // enviando tipo_evento: 'CONFIRMACION_ESCUCHA'. Al detectarlo, activamos
      // el flag para que el proximo audio se publique como 'AUDIO_DIRECTO'.
      if (payload.tipo_evento === 'CONFIRMACION_ESCUCHA') {
        isDirectAudioModeRef.current = true;
        setIsDirectAudioMode(true);
        console.log(
          '[MQTT ← RX] 🎙 Confirmacion de escucha recibida — ' +
          'Modo AUDIO_DIRECTO activado. El proximo audio sera una Nota de Voz.'
        );
        // Si el payload NO trae audio adjunto, podemos salir aqui.
        // Si SI trae audio (el sintetico de confirmacion), continuamos para reproducirlo.
        if (payload.formato_payload !== 'AUDIO_B64' || !payload.data) return;
      }

      // ── 3. Solo procesar si el formato es audio Base64 ──────────────────────
      if (payload.formato_payload !== 'AUDIO_B64' || !payload.data) {
        console.log(`[MQTT ← RX] Formato '${payload.formato_payload}' recibido — sin reproducción de audio.`);
        return;
      }

      console.log(`[MQTT ← RX] 🎵 Audio Base64 recibido. Tipo: ${payload.tipo_evento} | Prioridad: ${payload.prioridad ?? 'NORMAL'}`);

      // ── 3. Barge-in: si llega prioridad URGENTE, interrumpir sonido actual ───
      if (payload.prioridad === 'URGENTE' && rxPlayerRef.current) {
        try {
          console.log('[MQTT ← RX] ⚡ Prioridad URGENTE — interrumpiendo audio en curso...');
          rxPlayerRef.current.pause();
          console.log('[MQTT ← RX] Audio anterior detenido.');
        } catch (e: any) {
          console.warn('[MQTT ← RX] Error al detener audio anterior:', e.message);
        }
      }

      // ── 4. Escribir el archivo de audio temporal en caché ────────────────────
      // Nueva API de expo-file-system SDK 54: File + Paths reemplaza a writeAsStringAsync.
      // Se decodifica Base64 → Uint8Array y se escribe con file.write().
      const nombreArchivo = `rx_audio_${Date.now()}.wav`;
      const archivoTemporal = new File(Paths.cache, nombreArchivo);
      try {
        // Decodificar Base64 a bytes binarios para escritura correcta del .wav
        const raw = atob(payload.data);
        const bytes = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) {
          bytes[i] = raw.charCodeAt(i);
        }
        archivoTemporal.create();
        archivoTemporal.write(bytes);
        console.log(`[MQTT ← RX] Archivo temporal escrito en: ${archivoTemporal.uri}`);
      } catch (e: any) {
        console.error('[MQTT ← RX] Error al escribir archivo temporal:', e.message);
        return;
      }

      // ── 5. Disparar reproducción via cambio de estado (useAudioPlayer + useEffect) ──
      // Al actualizar rxAudioUri, el hook useAudioPlayer recrea el player
      // y el useEffect de auto-play lo reproduce automáticamente.
      setRxAudioUri(archivoTemporal.uri);
      console.log('[MQTT ← RX] 🎵 Audio encolado para reproducción.');
    };

    // Conectar usando la logica de SigV4 encapsulada en mqttClient.js
    conectarMQTT(alRecibirMensaje)
      .then(({ client, conectado }) => {
        if (client) {
          mqttClientRef.current = client;
          setConnected(conectado);

          // Actualizar estado si la conexion cambia despues de establecerse
          client.on('close', () => setConnected(false));
          client.on('error', () => setConnected(false));
          client.on('connect', () => setConnected(true));
        }
      })
      .catch((err) => {
        console.error('[MQTT] Error al inicializar cliente:', err.message);
      });

    // Limpieza al desmontar el componente
    return () => {
      mqttClientRef.current?.end();
      mqttClientRef.current = null;
    };
  }, []); // Solo se ejecuta una vez al montar

  /**
   * publish
   * -------
   * Wrapper de publicacion MQTT que verifica la conexion antes de enviar.
   */
  const publish = useCallback(
    (topico: string, mensaje: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        const client = mqttClientRef.current;
        if (!client || !client.connected) {
          reject(new Error('Cliente MQTT no conectado.'));
          return;
        }
        client.publish(topico, mensaje, { qos: 1 }, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    },
    []
  );

  // ─────────────────────────────────────────────────────────────
  // Funcion central de despacho MQTT
  // ─────────────────────────────────────────────────────────────

  /**
   * despachaMQTT
   * ------------
   * Valida el payload via el Contrato IoT, lo imprime en consola para
   * inspeccion y lo publica en el topico coco/simulador/tx.
   *
   * @param {string} tipo_evento     - 'MENSAJE' o 'ALERTA_SOS'
   * @param {string} formato_payload - 'TEXTO' o 'AUDIO_B64'
   * @param {string} data            - Contenido del evento
   */
  const despachaMQTT = useCallback(
    async (tipo_evento: string, formato_payload: string, data: string) => {
      try {
        // Ensambla y valida segun el Contrato IoT (lanza Error si es invalido)
        const payload = generarPayload(
          MAC_ADDRESS_SIMULADOR,
          tipo_evento,
          formato_payload,
          data
        );

        // Inspeccion en terminal (clave para verificar la conversion Base64)
        console.log('[COCO → IoT] Payload generado:');
        console.log(JSON.stringify(payload, null, 2));

        // Intenta publicar si hay conexion activa
        if (connected) {
          await publish(TOPICO_TX, JSON.stringify(payload));
          console.log(`[COCO → IoT] Publicado en topico: ${TOPICO_TX}`);
        } else {
          console.warn(
            '[COCO → IoT] Sin conexion MQTT activa. ' +
            'El payload se genero correctamente pero no fue enviado. ' +
            '(Normal mientras AWS_ENDPOINT este vacio)'
          );
        }
      } catch (error) {
        console.error('[COCO → IoT] Error en el despacho:', error);
      }
    },
    [connected, publish]
  );

  // ─────────────────────────────────────────────────────────────
  // Boton SOS
  // ─────────────────────────────────────────────────────────────

  /**
   * Anima el boton SOS con efecto de pulsacion y publica el evento ALERTA_SOS
   * hacia AWS IoT Core via MQTT.
   */
  const animarPresionSOS = () => {
    Animated.sequence([
      Animated.timing(latidoSOS, { toValue: 0.92, duration: 100, useNativeDriver: true }),
      Animated.spring(latidoSOS, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();

    // Publica la alerta de panico siguiendo el Contrato IoT
    // Payload de panico siguiendo el Contrato IoT (campo data estandarizado)
    despachaMQTT('ALERTA_SOS', 'TEXTO', 'EMERGENCIA_BOTON_PANICO');
  };



  // ─────────────────────────────────────────────────────────────
  // Boton de hablar en vivo — tap para iniciar, auto-para por silencio
  // ─────────────────────────────────────────────────────────────

  /**
   * detenerGrabacion
   * ----------------
   * Detiene el grabador, convierte el audio a Base64 y lo despacha via MQTT.
   * Es llamada tanto por el timer de silencio como por el boton manual.
   */
  /**
   * detenerGrabacion
   * ----------------
   * Detiene el grabador, limpia timers/intervalos, convierte el audio
   * a Base64 y lo despacha via MQTT cumpliendo el Contrato IoT.
   * @param {boolean} enviar - Si es true procesa y envía el audio; si es false lo descarta.
   */
  const detenerGrabacion = useCallback(async (enviar: boolean = true) => {
    // Limpiar intervalo de monitoreo
    if (intervaloMonitoreoRef.current) {
      clearInterval(intervaloMonitoreoRef.current);
      intervaloMonitoreoRef.current = null;
    }

    if (!grabandoRef.current) return;
    grabandoRef.current = false;
    haHabladoRef.current = false;
    setGrabando(false);
    setHaHablado(false);

    try {
      await audioRecorder.stop();

      if (!enviar) {
        console.log('[COCO] Grabacion descartada (sin voz detectada del usuario).');
        return;
      }

      const uri = audioRecorder.uri;
      if (!uri) {
        console.warn('[COCO] La grabacion no produjo un archivo. Intenta de nuevo.');
        return;
      }

      console.log(`[COCO] Grabacion finalizada. URI: ${uri}`);
      console.log('[COCO] Convirtiendo a Base64...');

      const archivo = new File(uri);
      const base64Data = await archivo.base64();

      console.log(
        `[COCO] Conversion Base64 exitosa. ` +
        `Longitud de la cadena: ${base64Data.length} caracteres.`
      );

      // ── Flujo de dos pasos: Notas de Voz ────────────────────────────────────
      // Si isDirectAudioMode esta activo, publicamos como 'AUDIO_DIRECTO' para
      // indicarle al backend que NO debe transcribir este audio (es una nota
      // directa al familiar). Reseteamos el flag inmediatamente despues.
      if (isDirectAudioModeRef.current) {
        isDirectAudioModeRef.current = false;
        setIsDirectAudioMode(false);
        console.log('[COCO] 📨 Modo AUDIO_DIRECTO — enviando Nota de Voz directa al familiar.');
        await despachaMQTT('AUDIO_DIRECTO', 'AUDIO_B64', base64Data);
      } else {
        console.log('[COCO] 🎙 Modo MENSAJE — enviando comando de voz a la IA.');
        await despachaMQTT('MENSAJE', 'AUDIO_B64', base64Data);
      }
    } catch (error) {
      console.error('[COCO] Error al procesar la grabacion:', error);
    }
  }, [audioRecorder, despachaMQTT]);

  /**
   * Detector de voz activa (VAD)
   * Monitorea el nivel dB y detecta:
   * 1. Si el usuario empezo a hablar (voz sostenida por >= 200ms).
   * 2. El ultimo momento en que se escucho voz.
   */
  useEffect(() => {
    if (!grabandoRef.current || !estadoRecorder.isRecording) return;

    const db = estadoRecorder.metering ?? -160;

    if (db >= UMBRAL_VOZ_DB) {
      conteoVozMsRef.current += 100;
      ultimoSonidoRef.current = Date.now();

      // Confirmar que empezo a hablar con voz sostenida (200ms)
      if (!haHabladoRef.current && conteoVozMsRef.current >= VOZ_SOSTENIDA_MIN_MS) {
        haHabladoRef.current = true;
        setHaHablado(true);
        console.log('[COCO VAD] Voz detectada — El usuario comenzo a hablar.');
      }
    } else {
      // Si todavia no habia empezado a hablar, reiniciamos contador para evitar falsos positivos
      if (!haHabladoRef.current) {
        conteoVozMsRef.current = 0;
      }
    }
  }, [estadoRecorder.metering, estadoRecorder.isRecording]);

  /**
   * alPresionarHablar
   * -----------------
   * Tap para iniciar grabacion con VAD de 2 fases:
   * Fase 1: Da hasta 8s de espera generosa para que el adulto mayor comience a hablar.
   * Fase 2: Una vez que hablo, espera 1.5s de silencio para auto-enviar.
   */
  const alPresionarHablar = async () => {
    // Si ya esta grabando, un toque manual permite enviar inmediatamente
    if (grabandoRef.current) {
      console.log('[COCO] Detencion manual por toque.');
      await detenerGrabacion(true);
      return;
    }

    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        console.warn('[COCO] Permiso de microfono denegado.');
        return;
      }

      await setAudioModeAsync({ playsInSilentMode: true });

      try {
        await audioRecorder.prepareToRecordAsync();
      } catch {
        await audioRecorder.stop();
        await audioRecorder.prepareToRecordAsync();
      }

      const ahora = Date.now();
      inicioGrabacionRef.current = ahora;
      ultimoSonidoRef.current = ahora;
      conteoVozMsRef.current = 0;
      haHabladoRef.current = false;

      audioRecorder.record();
      grabandoRef.current = true;
      setGrabando(true);
      setHaHablado(false);
      console.log('[COCO VAD] Grabacion iniciada — Esperando que el usuario comience a hablar (hasta 8s)...');

      // Iniciar bucle de monitoreo cada 100ms
      if (intervaloMonitoreoRef.current) {
        clearInterval(intervaloMonitoreoRef.current);
      }

      intervaloMonitoreoRef.current = setInterval(() => {
        if (!grabandoRef.current) {
          if (intervaloMonitoreoRef.current) {
            clearInterval(intervaloMonitoreoRef.current);
            intervaloMonitoreoRef.current = null;
          }
          return;
        }

        const ahoraLoop = Date.now();
        const duracionTotal = ahoraLoop - inicioGrabacionRef.current;
        const tiempoSilencio = ahoraLoop - ultimoSonidoRef.current;

        // FASE 1: El usuario AUN NO ha comenzado a hablar
        if (!haHabladoRef.current) {
          if (duracionTotal >= TIEMPO_ESPERA_INICIO_MS) {
            console.log('[COCO VAD] Tiempo de espera agotado (8s sin voz detectada). Cancelando.');
            detenerGrabacion(false);
            return;
          }
          return; // Continua esperando
        }

        // FASE 2: El usuario YA HABLO -> Detectar cuando finaliza (1.5s de silencio continuo)
        if (tiempoSilencio >= DURACION_SILENCIO_MS) {
          console.log(`[COCO VAD] Fin de voz detectado (${(tiempoSilencio / 1000).toFixed(1)}s de silencio). Auto-enviando...`);
          detenerGrabacion(true);
          return;
        }

        // FASE 3: Timeout maximo total de seguridad (20s)
        if (duracionTotal >= TIEMPO_MAXIMO_MS) {
          console.log('[COCO VAD] Tiempo maximo total alcanzado (20s). Auto-enviando...');
          detenerGrabacion(true);
          return;
        }
      }, 100);

    } catch (error) {
      console.error('[COCO] Error al iniciar la grabacion:', error);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────

  // Alias reactivo para saber si el audio Rx esta sonando ahora mismo
  const rxReproduciendo = estadoRxPlayer.playing ?? false;

  return (
    <SafeAreaView style={estilos.contenedor}>
      <View style={estilos.inner}>

        {/* Cabecera */}
        <View style={estilos.cabecera}>
          <Text style={estilos.logoTexto}>COCO</Text>
          <View style={estilos.indicadorOnline}>
            {/* El punto cambia de color segun el estado de conexion MQTT */}
            <View style={[estilos.puntito, connected ? estilos.puntitoCnx : estilos.puntitoDesconectado]} />
            <Text style={estilos.textoOnline}>
              {connected ? 'MQTT conectado' : 'Simulador activo (sin MQTT)'}
            </Text>
          </View>
          {/* Indicador del modo Nota de Voz Directa */}
          {isDirectAudioMode && (
            <View style={estilos.indicadorModoDirecto}>
              <View style={estilos.puntitoPurpura} />
              <Text style={estilos.textoModoDirecto}>NOTA DE VOZ DIRECTA</Text>
            </View>
          )}
        </View>

        {/* Boton SOS */}
        <View style={estilos.areaSOS}>
          <View style={estilos.anilloExterior}>
            <View style={estilos.anilloMedio}>
              <Animated.View style={{ transform: [{ scale: latidoSOS }] }}>
                <TouchableOpacity
                  style={estilos.botonSOS}
                  onPress={animarPresionSOS}
                  activeOpacity={0.85}
                  accessibilityLabel="Boton de emergencia SOS"
                >
                  <Text style={estilos.textoSOS}>SOS</Text>
                  <Text style={estilos.subtextoSOS}>EMERGENCIA</Text>
                </TouchableOpacity>
              </Animated.View>
            </View>
          </View>
          <Text style={estilos.instruccionSOS}>Presiona si necesitas ayuda urgente</Text>
        </View>

        {/* ─── Panel de Recepcion Visual (Rx) ─────────────────────────────────── */}
        {/* Indicador circular animado que reacciona al audio entrante de la IA.  */}
        {/* Estado Inactivo: circulo gris oscuro, sin animacion.                  */}
        {/* Estado Activo: circulo azul con efecto de pulso/respiracion continuo. */}
        <View style={estilos.seccionRx}>

          {/* Etiqueta superior */}
          <View style={estilos.encabezadoRx}>
            <View style={estilos.lineaDivisora} />
            <Text style={estilos.tituloRx}>
              {rxReproduciendo ? 'COCO está hablando' : 'Esperando respuesta'}
            </Text>
            <View style={estilos.lineaDivisora} />
          </View>

          {/* Indicador circular con animacion de pulso */}
          <View style={estilos.contenedorPanelRx} accessibilityLabel="Indicador de audio entrante">

            {/* Anillo exterior — aparece y desaparece con fade al cambiar estado */}
            <Animated.View
              style={[
                estilos.anilloRxExterior,
                {
                  opacity: opacidadAnilloRx,
                  transform: [{ scale: pulsoRx }],
                },
              ]}
            />

            {/* Circulo principal — cambia de color segun estado */}
            <Animated.View
              style={[
                estilos.circuloRx,
                rxReproduciendo && estilos.circuloRxActivo,
                { transform: [{ scale: pulsoRx }] },
              ]}
            >
              <Text style={estilos.iconoRx}>
                {rxReproduciendo ? '🔊' : '💤'}
              </Text>
              <Text style={[
                estilos.textoEstadoRx,
                rxReproduciendo && estilos.textoEstadoRxActivo,
              ]}>
                {rxReproduciendo ? 'Reproduciendo' : 'En espera'}
              </Text>
            </Animated.View>

          </View>

        </View>

        {/* Boton de hablar en vivo — Zero-UI con VAD adaptativo para adultos mayores */}
        <View style={estilos.areaInferior}>
          <TouchableOpacity
            style={[estilos.botonHablar, grabando && estilos.botonGrabando]}
            onPress={alPresionarHablar}
            activeOpacity={0.85}
            accessibilityLabel="Grabar mensaje de voz en vivo"
            accessibilityHint="Toca para hablar, se detiene solo cuando quedes en silencio"
          >
            <Text style={estilos.iconoMicrofono}>
              {grabando ? (haHablado ? '🔴' : '⏳') : '🎙'}
            </Text>
            <Text style={[estilos.textoHablar, grabando && estilos.textoHablarGrabando]}>
              {grabando
                ? (haHablado ? '● Escuchando voz...' : '● Esperando que hables...')
                : 'Toca para hablar'}
            </Text>
            <Text style={estilos.textoHablarSub}>
              {grabando
                ? (haHablado ? 'Para solo cuando termines' : 'Tómate tu tiempo para empezar')
                : 'Para automáticamente al silencio'}
            </Text>
          </TouchableOpacity>
        </View>

      </View>
    </SafeAreaView>
  );
}

/* =================================================================
   ESTILOS
   ================================================================= */
const estilos = StyleSheet.create({

  contenedor: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  inner: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },

  // Cabecera
  cabecera: {
    alignItems: 'center',
    gap: 4,
    paddingTop: 4,
  },
  logoTexto: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 12,
  },
  indicadorOnline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  puntito: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  puntitoCnx: {
    backgroundColor: '#22C55E',  // verde cuando hay conexion MQTT
  },
  puntitoDesconectado: {
    backgroundColor: '#F59E0B',  // amarillo cuando no hay conexion
  },
  textoOnline: {
    fontSize: 12,
    color: '#6B7280',
    letterSpacing: 1,
  },

  // Indicador de modo Nota de Voz Directa (AUDIO_DIRECTO activo)
  indicadorModoDirecto: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(139,92,246,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(139,92,246,0.5)',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  puntitoPurpura: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#A78BFA',
  },
  textoModoDirecto: {
    fontSize: 10,
    fontWeight: '700',
    color: '#A78BFA',
    letterSpacing: 1.5,
  },

  // Area SOS
  areaSOS: {
    alignItems: 'center',
    gap: 12,
  },
  anilloExterior: {
    width: SOS_BUTTON_SIZE + 40,
    height: SOS_BUTTON_SIZE + 40,
    borderRadius: (SOS_BUTTON_SIZE + 40) / 2,
    backgroundColor: 'rgba(239,68,68,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  anilloMedio: {
    width: SOS_BUTTON_SIZE + 18,
    height: SOS_BUTTON_SIZE + 18,
    borderRadius: (SOS_BUTTON_SIZE + 18) / 2,
    backgroundColor: 'rgba(239,68,68,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonSOS: {
    width: SOS_BUTTON_SIZE,
    height: SOS_BUTTON_SIZE,
    borderRadius: SOS_BUTTON_SIZE / 2,
    backgroundColor: '#DC2626',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 28,
    elevation: 24,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.15)',
    gap: 4,
  },
  textoSOS: {
    fontSize: 68,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 6,
    lineHeight: 76,
  },
  subtextoSOS: {
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 4,
  },
  instruccionSOS: {
    fontSize: 13,
    color: '#6B7280',
    letterSpacing: 0.5,
  },

  // ─── Panel de Recepcion Visual (Rx) ──────────────────────────────────────────
  // Contenedor de la nueva seccion que reemplaza las herramientas de debugging.
  seccionRx: {
    width: '100%',
    paddingHorizontal: 20,
    gap: 16,
    alignItems: 'center',
  },
  encabezadoRx: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  lineaDivisora: {
    flex: 1,
    height: 1,
    backgroundColor: '#1F2937',
  },
  tituloRx: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Contenedor del circulo indicador
  contenedorPanelRx: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 140,
    height: 140,
  },

  // Anillo exterior animado (solo visible cuando Rx esta activo)
  anilloRxExterior: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 2,
    borderColor: 'rgba(59,130,246,0.4)',
    backgroundColor: 'rgba(59,130,246,0.06)',
  },

  // Circulo principal del panel Rx
  circuloRx: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: '#111827',
    borderWidth: 2,
    borderColor: '#1F2937',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  },

  // Estado activo: fondo azul oscuro con borde luminoso
  circuloRxActivo: {
    backgroundColor: '#0c1a3a',
    borderColor: '#3B82F6',
    shadowColor: '#3B82F6',
    shadowOpacity: 0.7,
    shadowRadius: 18,
    elevation: 16,
  },

  iconoRx: {
    fontSize: 28,
  },

  textoEstadoRx: {
    fontSize: 10,
    fontWeight: '600',
    color: '#4B5563',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },

  // Texto en azul brillante cuando esta reproduciendo
  textoEstadoRxActivo: {
    color: '#60A5FA',
  },

  // Area inferior
  areaInferior: {
    width: '100%',
    paddingHorizontal: 24,
    paddingBottom: 4,
  },
  botonHablar: {
    backgroundColor: '#1F2937',
    borderRadius: 22,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#374151',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    gap: 2,
  },
  // Estado activo: rojo intenso para indicar que el mic esta capturando
  botonGrabando: {
    backgroundColor: '#1a0000',
    borderColor: '#EF4444',
    shadowColor: '#EF4444',
    shadowOpacity: 0.7,
    shadowRadius: 16,
    elevation: 14,
  },
  iconoMicrofono: {
    fontSize: 32,
    marginBottom: 2,
  },
  textoHablar: {
    fontSize: 18,
    fontWeight: '700',
    color: '#F9FAFB',
    letterSpacing: 0.5,
  },
  // Texto en rojo mientras graba
  textoHablarGrabando: {
    color: '#EF4444',
  },
  textoHablarSub: {
    fontSize: 14,
    color: '#9CA3AF',
  },


});
