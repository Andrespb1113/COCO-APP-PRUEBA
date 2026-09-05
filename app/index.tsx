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
 * Herramientas de debugging presentes:
 *  - Boton SOS (rojo, centro): publica evento tipo 'ALERTA_SOS' via MQTT.
 *  - Input de texto libre + boton Enviar: publica evento tipo 'MENSAJE' / 'TEXTO'.
 *  - Boton Cargar Audio: selecciona un archivo, lo convierte a Base64 y publica via MQTT.
 *  - Boton Reproducir (sonido/pausa): preescucha el audio cargado antes de enviarlo.
 *  - Boton "Mantener presionado y hablar" (inferior): graba audio en vivo, convierte a Base64
 *    y publica via MQTT al soltar (igual que el flujo de cargar archivo, pero desde el mic).
 */

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import {
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
  RecordingPresets,
  setAudioModeAsync,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import mqtt, { MqttClient } from 'mqtt';

// Importamos el Contrato IoT: funcion de validacion + ensamblaje + constantes
import {
  generarPayload,
  TOPICO_TX,
  AWS_ENDPOINT,
} from '../iotContract';

const { width } = Dimensions.get('window');

// Tamano del boton SOS: 65% del ancho de pantalla
const SOS_BUTTON_SIZE = width * 0.65;

// MAC Address del dispositivo simulado (identificador de hardware)
const MAC_ADDRESS_SIMULADOR = '00:11:22:33:44:55';

export default function PantallaPrincipal() {
  // Estado del campo de texto libre
  const [textoComando, setTextoComando] = useState('');

  // Estado que muestra el nombre del archivo de audio seleccionado
  const [nombreAudio, setNombreAudio] = useState<string | null>(null);

  // URI local del archivo cargado (necesario para leer como Base64)
  const [uriAudio, setUriAudio] = useState<string | null>(null);

  // Player de expo-audio — se crea con el URI del archivo cuando hay uno cargado.
  const player = useAudioPlayer(uriAudio ? { uri: uriAudio } : null);

  // Estado en tiempo real del player (isPlaying, didJustFinish, etc.)
  const estadoPlayer = useAudioPlayerStatus(player);

  // Alias legible para saber si esta sonando ahora mismo
  const reproduciendo = estadoPlayer.playing ?? false;

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

  // ─────────────────────────────────────────────────────────────
  // Cliente MQTT (mqtt / MQTT.js — pure JS, compatible con Expo Go)
  // Nota: AWS_ENDPOINT esta vacio hasta recibir credenciales.
  //       El cliente intentara conectar; si falla lo registra en consola
  //       pero la app sigue funcionando (el payload se imprime siempre).
  // ─────────────────────────────────────────────────────────────

  // Referencia al cliente MQTT (no provoca re-renders al cambiar)
  const mqttClientRef = useRef<MqttClient | null>(null);

  // Estado de conexion visible en la UI
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    // Solo intentar conectar si existe un endpoint configurado
    if (!AWS_ENDPOINT) {
      console.log(
        '[COCO MQTT] AWS_ENDPOINT vacio. ' +
        'El cliente no se conectara hasta configurar las credenciales en iotContract.js.'
      );
      return;
    }

    // Formato de URL para AWS IoT Core via WebSocket:
    // wss://<endpoint>:443/mqtt
    const brokerUrl = `wss://${AWS_ENDPOINT}:443/mqtt`;

    const client = mqtt.connect(brokerUrl, {
      clientId: `coco-simulador-${MAC_ADDRESS_SIMULADOR.replace(/:/g, '')}`,
      // username: ACCESS_KEY,   // Descomentar al tener credenciales
      // password: SECRET_KEY,   // Descomentar al tener credenciales
      clean: true,
      reconnectPeriod: 5000,    // Reintentar cada 5s si se pierde conexion
    });

    client.on('connect', () => {
      console.log('[COCO MQTT] Conectado a AWS IoT Core.');
      setConnected(true);
    });

    client.on('error', (err) => {
      console.warn('[COCO MQTT] Error de conexion:', err.message);
      setConnected(false);
    });

    client.on('close', () => {
      console.log('[COCO MQTT] Conexion cerrada.');
      setConnected(false);
    });

    mqttClientRef.current = client;

    // Limpieza al desmontar el componente
    return () => {
      client.end();
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
    despachaMQTT('ALERTA_SOS', 'TEXTO', 'El usuario presiono el boton de emergencia SOS.');
  };

  // ─────────────────────────────────────────────────────────────
  // Input de texto libre
  // ─────────────────────────────────────────────────────────────

  /**
   * Envia el texto escrito como un MENSAJE de tipo TEXTO hacia IoT Core.
   */
  const alEnviarTexto = () => {
    if (!textoComando.trim()) return;
    despachaMQTT('MENSAJE', 'TEXTO', textoComando.trim());
    setTextoComando(''); // Limpia el campo tras el envio
  };

  // ─────────────────────────────────────────────────────────────
  // Selector de archivo de audio local
  // ─────────────────────────────────────────────────────────────

  /**
   * Abre el explorador de archivos del dispositivo filtrando por audio.
   * Permite seleccionar un .mp3 o .wav ya guardado localmente.
   */
  const alCargarAudio = async () => {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav', 'audio/*'],
        copyToCacheDirectory: true, // Copia al cache para garantizar acceso de lectura
      });

      if (!resultado.canceled && resultado.assets.length > 0) {
        const archivo = resultado.assets[0];
        // Detener reproduccion si habia algo sonando antes de cambiar el archivo
        if (reproduciendo) {
          player.pause();
        }
        setNombreAudio(archivo.name);
        setUriAudio(archivo.uri);
        console.log(`[COCO] Audio seleccionado: ${archivo.name} | URI: ${archivo.uri}`);
      } else {
        console.log('[COCO] Seleccion de audio cancelada.');
      }
    } catch (error) {
      console.error('[COCO] Error al abrir el selector de archivos:', error);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Reproduccion local del audio cargado (pre-envio)
  // ─────────────────────────────────────────────────────────────

  /**
   * Alterna entre reproducir y pausar el audio cargado localmente.
   * Usa expo-audio (reemplazo de expo-av en SDK 54).
   */
  const alReproducirAudio = async () => {
    if (!uriAudio) return;

    try {
      // Configura el modo de audio: suena aunque el telefono este en silencio (iOS)
      await setAudioModeAsync({ playsInSilentModeIOS: true });

      if (reproduciendo) {
        player.pause();
      } else {
        if (estadoPlayer.didJustFinish) {
          player.seekTo(0);
        }
        player.play();
      }
    } catch (error) {
      console.error('[COCO] Error al reproducir el audio:', error);
    }
  };

  // ─────────────────────────────────────────────────────────────
  // Envio del audio como Base64 via MQTT
  // ─────────────────────────────────────────────────────────────

  /**
   * Flujo completo de conversion y despacho de audio:
   *
   *  1. Lee el archivo local con FileSystem.readAsStringAsync en modo Base64.
   *  2. Llama a despachaMQTT con tipo_evento='MENSAJE', formato_payload='AUDIO_B64'.
   *  3. despachaMQTT ensamblara el payload via el Contrato IoT e imprimira el
   *     JSON en consola (incluyendo la cadena Base64 completa).
   *  4. Intenta publicar en coco/simulador/tx si hay conexion MQTT activa.
   *  5. Limpia el estado local para la proxima accion.
   */
  const alEnviarAudio = async () => {
    if (!uriAudio || !nombreAudio) return;

    console.log(`[COCO] Leyendo archivo de audio como Base64: ${nombreAudio}`);

    try {
      // Nueva API de expo-file-system SDK 54: la clase File reemplaza a readAsStringAsync.
      // new File(uri).base64() retorna una Promise<string> con el contenido en Base64.
      const archivo = new File(uriAudio);
      const base64Data = await archivo.base64();

      console.log(
        `[COCO] Conversion Base64 exitosa. ` +
        `Longitud de la cadena: ${base64Data.length} caracteres.`
      );

      // Despacha el audio como payload AUDIO_B64 siguiendo el Contrato IoT
      await despachaMQTT('MENSAJE', 'AUDIO_B64', base64Data);

      // Limpia el estado tras el despacho
      if (reproduciendo) {
        player.pause();
      }
      setUriAudio(null);
      setNombreAudio(null);
    } catch (error) {
      console.error('[COCO] Error al leer o enviar el audio como Base64:', error);
    }
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

      await despachaMQTT('MENSAJE', 'AUDIO_B64', base64Data);
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

      await setAudioModeAsync({ playsInSilentModeIOS: true });

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

  return (
    <SafeAreaView style={estilos.contenedor}>
      <KeyboardAvoidingView
        style={estilos.inner}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >

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

        {/* Herramientas de debugging */}
        <View style={estilos.seccionDebug}>

          {/* Separador con titulo */}
          <View style={estilos.encabezadoDebug}>
            <View style={estilos.lineaDivisora} />
            <Text style={estilos.tituloDebug}>Herramientas de prueba</Text>
            <View style={estilos.lineaDivisora} />
          </View>

          {/* Input de texto libre */}
          <View style={estilos.filaTexto}>
            <TextInput
              style={estilos.inputTexto}
              value={textoComando}
              onChangeText={setTextoComando}
              placeholder="Escribe un comando de texto..."
              placeholderTextColor="#4B5563"
              returnKeyType="send"
              onSubmitEditing={alEnviarTexto}
              accessibilityLabel="Campo de texto para enviar comandos"
            />
            <TouchableOpacity
              style={[estilos.botonEnviar, !textoComando.trim() && estilos.botonDesactivado]}
              onPress={alEnviarTexto}
              disabled={!textoComando.trim()}
              activeOpacity={0.7}
              accessibilityLabel="Enviar comando de texto"
            >
              <Text style={estilos.textoBotonEnviar}>Enviar</Text>
            </TouchableOpacity>
          </View>

          {/* Boton Cargar Audio */}
          <TouchableOpacity
            style={estilos.botonCargarAudio}
            onPress={alCargarAudio}
            activeOpacity={0.75}
            accessibilityLabel="Cargar archivo de audio desde el dispositivo"
          >
            <Text style={estilos.iconoCargar}>📂</Text>
            <View style={estilos.textoCargarWrapper}>
              <Text style={estilos.textoCargarAudio}>Cargar Audio</Text>
              {nombreAudio ? (
                <Text style={estilos.nombreArchivoSeleccionado} numberOfLines={1}>
                  ✓ {nombreAudio}
                </Text>
              ) : (
                <Text style={estilos.textoCargarSub}>.mp3 / .wav desde tu dispositivo</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* Controles de audio: aparecen solo cuando hay un archivo cargado */}
          {uriAudio && (
            <View style={estilos.filaControlesAudio}>

              {/* Boton Reproducir / Pausar */}
              <TouchableOpacity
                style={[
                  estilos.botonReproducir,
                  reproduciendo && estilos.botonReproduciendose,
                ]}
                onPress={alReproducirAudio}
                activeOpacity={0.75}
                accessibilityLabel={reproduciendo ? 'Pausar audio' : 'Reproducir audio'}
              >
                <Text style={estilos.iconoReproducir}>
                  {reproduciendo ? '⏸' : '🔊'}
                </Text>
                <Text style={estilos.textoReproducir}>
                  {reproduciendo ? 'Pausar' : 'Escuchar'}
                </Text>
              </TouchableOpacity>

              {/* Boton Enviar Audio como Base64 via MQTT */}
              <TouchableOpacity
                style={[estilos.botonEnviarAudio, { flex: 1 }]}
                onPress={alEnviarAudio}
                activeOpacity={0.75}
                accessibilityLabel="Convertir audio a Base64 y enviar via MQTT"
              >
                <Text style={estilos.iconoEnviarAudio}>📤</Text>
                <View style={estilos.textoEnviarWrapper}>
                  <Text style={estilos.textoEnviarAudio}>Enviar Audio (B64)</Text>
                  <Text style={estilos.textoEnviarSub} numberOfLines={1}>
                    {nombreAudio}
                  </Text>
                </View>
              </TouchableOpacity>

            </View>
          )}

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

      </KeyboardAvoidingView>
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

  // Seccion de debugging
  seccionDebug: {
    width: '100%',
    paddingHorizontal: 20,
    gap: 12,
  },
  encabezadoDebug: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  lineaDivisora: {
    flex: 1,
    height: 1,
    backgroundColor: '#1F2937',
  },
  tituloDebug: {
    fontSize: 11,
    fontWeight: '600',
    color: '#4B5563',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },

  // Input de texto libre
  filaTexto: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
  inputTexto: {
    flex: 1,
    backgroundColor: '#111827',
    borderWidth: 1.5,
    borderColor: '#1F2937',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    color: '#F9FAFB',
  },
  botonEnviar: {
    backgroundColor: '#2563EB',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  botonDesactivado: {
    backgroundColor: '#1F2937',
    opacity: 0.5,
  },
  textoBotonEnviar: {
    fontSize: 15,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Boton Cargar Audio
  botonCargarAudio: {
    flexDirection: 'row',
    backgroundColor: '#111827',
    borderWidth: 1.5,
    borderColor: '#1F2937',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  iconoCargar: {
    fontSize: 30,
  },
  textoCargarWrapper: {
    flex: 1,
    gap: 2,
  },
  textoCargarAudio: {
    fontSize: 16,
    fontWeight: '700',
    color: '#F9FAFB',
  },
  textoCargarSub: {
    fontSize: 12,
    color: '#6B7280',
  },
  nombreArchivoSeleccionado: {
    fontSize: 12,
    color: '#22C55E',
    fontWeight: '600',
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

  // Boton Enviar Audio (aparece dinamicamente tras cargar un archivo)
  botonEnviarAudio: {
    flexDirection: 'row',
    backgroundColor: '#052e16',
    borderWidth: 1.5,
    borderColor: '#16a34a',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    gap: 14,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  iconoEnviarAudio: {
    fontSize: 28,
  },
  textoEnviarWrapper: {
    flex: 1,
    gap: 2,
  },
  textoEnviarAudio: {
    fontSize: 16,
    fontWeight: '700',
    color: '#4ade80',
  },
  textoEnviarSub: {
    fontSize: 12,
    color: '#6b7280',
  },

  // Fila de controles de audio (Escuchar + Enviar, uno al lado del otro)
  filaControlesAudio: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },

  // Boton Reproducir / Pausar
  botonReproducir: {
    backgroundColor: '#0c1a2e',
    borderWidth: 1.5,
    borderColor: '#1d4ed8',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minWidth: 80,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  // Estado activo (mientras suena): borde azul mas brillante
  botonReproduciendose: {
    borderColor: '#60a5fa',
    backgroundColor: '#0f2340',
    shadowOpacity: 0.5,
  },
  iconoReproducir: {
    fontSize: 24,
  },
  textoReproducir: {
    fontSize: 11,
    fontWeight: '600',
    color: '#60a5fa',
    letterSpacing: 0.5,
  },
});
