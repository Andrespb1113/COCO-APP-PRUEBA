/**
 * SIMULADOR COCO — Pantalla Principal
 * =====================================
 * Esta pantalla simula la interfaz fisica del dispositivo COCO (Proyecto Zero-UI).
 * Disenada para adultos mayores: botones gigantes, alto contraste, sin menus complejos.
 *
 * Herramientas de debugging presentes (solo UI, logica pendiente):
 *  - Boton SOS (rojo, centro): enviara una alerta de panico a Supabase.
 *  - Input de texto libre + boton Enviar: simula comandos de texto hacia la BD.
 *  - Boton Cargar Audio: abre el explorador de archivos para seleccionar un .mp3/.wav local.
 *  - Boton Reproducir (🔊/⏸): preescucha el audio cargado antes de enviarlo.
 *  - Boton Enviar Audio: sube el archivo a Supabase Storage + registra en BD.
 *  - Boton "Mantener presionado y hablar" (inferior): iniciara grabacion de audio en vivo.
 */

import React, { useRef, useState } from 'react';
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
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio';

const { width } = Dimensions.get('window');

// Tamano del boton SOS: 65% del ancho de pantalla
const SOS_BUTTON_SIZE = width * 0.65;

export default function PantallaPrincipal() {
  // Estado del campo de texto libre
  const [textoComando, setTextoComando] = useState('');

  // Estado que muestra el nombre del archivo de audio seleccionado
  const [nombreAudio, setNombreAudio] = useState<string | null>(null);

  // URI local del archivo cargado (necesario para subirlo a Supabase Storage)
  const [uriAudio, setUriAudio] = useState<string | null>(null);

  // Player de expo-audio — se crea con el URI del archivo cuando hay uno cargado.
  // Cuando uriAudio es null, se pasa una fuente vacia y el player queda inactivo.
  const player = useAudioPlayer(uriAudio ? { uri: uriAudio } : null);

  // Estado en tiempo real del player (isPlaying, didJustFinish, etc.)
  const estadoPlayer = useAudioPlayerStatus(player);

  // Alias legible para saber si esta sonando ahora mismo
  const reproduciendo = estadoPlayer.playing ?? false;

  // Animacion de pulsacion para el boton SOS
  const latidoSOS = useRef(new Animated.Value(1)).current;

  // ─────────────────────────────────────────────────────────────
  // Boton SOS
  // ─────────────────────────────────────────────────────────────

  /**
   * Anima el boton SOS con efecto de pulsacion y dispara el evento.
   * TODO: Insertar evento tipo 'ALERTA_SOS' en historial_interacciones de Supabase.
   */
  const animarPresionSOS = () => {
    Animated.sequence([
      Animated.timing(latidoSOS, { toValue: 0.92, duration: 100, useNativeDriver: true }),
      Animated.spring(latidoSOS, { toValue: 1, friction: 3, useNativeDriver: true }),
    ]).start();
    console.log('[COCO] Boton SOS presionado — logica pendiente.');
  };

  // ─────────────────────────────────────────────────────────────
  // Input de texto libre
  // ─────────────────────────────────────────────────────────────

  /**
   * Envia el texto escrito como un comando de simulacion hacia Supabase.
   * TODO: Insertar { emisor: 'COCO', tipo_evento: 'TEXTO_LIBRE', metadata_payload: { texto } }
   *       en la tabla historial_interacciones.
   */
  const alEnviarTexto = () => {
    if (!textoComando.trim()) return;
    console.log(`[COCO] Texto enviado: "${textoComando.trim()}"`);
    setTextoComando(''); // Limpia el campo tras el envio
  };

  // ─────────────────────────────────────────────────────────────
  // Selector de archivo de audio local
  // ─────────────────────────────────────────────────────────────

  /**
   * Abre el explorador de archivos del dispositivo filtrando por audio.
   * Permite seleccionar un .mp3 o .wav ya guardado localmente.
   * TODO: Con el archivo seleccionado, subirlo a Supabase Storage y crear
   *       un registro en historial_interacciones con tipo_evento: 'AUDIO_DIRECTO'.
   */
  const alCargarAudio = async () => {
    try {
      const resultado = await DocumentPicker.getDocumentAsync({
        type: ['audio/mpeg', 'audio/wav', 'audio/*'],
        copyToCacheDirectory: true, // Copia al cache para acceso rapido
      });

      if (!resultado.canceled && resultado.assets.length > 0) {
        const archivo = resultado.assets[0];
        // Detener reproduccion si habia algo sonando antes de cambiar el archivo
        if (reproduciendo) {
          player.pause();
        }
        setNombreAudio(archivo.name);
        setUriAudio(archivo.uri); // Cambia el URI y expo-audio recarga el player automaticamente
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
   *
   * Flujo:
   *  - Primera llamada: configura el altavoz y empieza a reproducir.
   *  - Segunda llamada (mientras suena): pausa la reproduccion.
   *  - Tercera llamada (pausado): reanuda desde donde quedo.
   *  - Cuando el audio termina solo: estadoPlayer.playing vuelve a false automaticamente.
   */
  const alReproducirAudio = async () => {
    if (!uriAudio) return;

    try {
      // Configura el modo de audio: suena aunque el telefono este en silencio (iOS)
      await setAudioModeAsync({ playsInSilentModeIOS: true });

      if (reproduciendo) {
        // Esta sonando: pausar
        player.pause();
      } else {
        // Esta pausado o no habia empezado: reproducir
        // Si termino, vuelve al inicio automaticamente antes de play
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
  // Envio del audio cargado a Supabase
  // ─────────────────────────────────────────────────────────────

  /**
   * Toma el URI local del archivo cargado y simula el mismo flujo
   * que ocurriria si el usuario hubiera hablado en vivo:
   *
   * Flujo completo (TODO — pendiente de integracion con Supabase):
   *  1. Leer el archivo desde `uriAudio` como un Blob/ArrayBuffer.
   *  2. Subirlo al bucket 'audios-coco' de Supabase Storage:
   *       supabase.storage.from('audios-coco').upload(nombreArchivo, blob)
   *  3. Obtener la URL publica del archivo subido.
   *  4. Insertar en historial_interacciones:
   *       { emisor: 'COCO', tipo_evento: 'AUDIO_DIRECTO',
   *         metadata_payload: { url_audio: urlPublica } }
   *  5. Limpiar el estado (uriAudio, nombreAudio) para la proxima accion.
   */
  const alEnviarAudio = async () => {
    if (!uriAudio || !nombreAudio) return;

    console.log(`[COCO] Enviando audio a Supabase...`);
    console.log(`  Archivo : ${nombreAudio}`);
    console.log(`  URI     : ${uriAudio}`);
    console.log(`  Accion  : subir al Storage → registrar en historial_interacciones`);

    // TODO: Aqui ira la llamada real a Supabase Storage + insercion en BD.

    // Limpia el estado inmediatamente para dar feedback visual al usuario.
    // Al poner uriAudio en null, el player de expo-audio se detiene automaticamente
    // y los botones "Escuchar" y "Enviar Audio" desaparecen de la pantalla.
    if (reproduciendo) {
      player.pause();
    }
    setUriAudio(null);
    setNombreAudio(null);
  };

  // ─────────────────────────────────────────────────────────────
  // Boton de hablar en vivo
  // ─────────────────────────────────────────────────────────────

  /**
   * Inicio de grabacion en vivo.
   * TODO: Iniciar grabacion con expo-av (Audio.Recording).
   */
  const alPresionarHablar = () => {
    console.log('[COCO] Boton Hablar presionado — logica de audio pendiente.');
  };

  /**
   * Fin de grabacion en vivo.
   * TODO: Detener grabacion, subir a Supabase Storage y registrar en historial_interacciones.
   */
  const alSoltarHablar = () => {
    console.log('[COCO] Boton Hablar soltado — finalizando grabacion.');
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

        {/* ── Cabecera ── */}
        <View style={estilos.cabecera}>
          <Text style={estilos.logoTexto}>COCO</Text>
          <View style={estilos.indicadorOnline}>
            <View style={estilos.puntito} />
            <Text style={estilos.textoOnline}>Simulador activo</Text>
          </View>
        </View>

        {/* ── Boton SOS ── */}
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

        {/* ── Herramientas de debugging ── */}
        <View style={estilos.seccionDebug}>

          {/* Separador con titulo */}
          <View style={estilos.encabezadoDebug}>
            <View style={estilos.lineaDivisora} />
            <Text style={estilos.tituloDebug}>Herramientas de prueba</Text>
            <View style={estilos.lineaDivisora} />
          </View>

          {/* ── Input de texto libre ── */}
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

          {/* ── Boton Cargar Audio ── */}
          <TouchableOpacity
            style={estilos.botonCargarAudio}
            onPress={alCargarAudio}
            activeOpacity={0.75}
            accessibilityLabel="Cargar archivo de audio desde el dispositivo"
          >
            <Text style={estilos.iconoCargar}>📂</Text>
            <View style={estilos.textoCargarWrapper}>
              <Text style={estilos.textoCargarAudio}>Cargar Audio</Text>
              {/* Muestra el nombre del archivo seleccionado si hay uno */}
              {nombreAudio ? (
                <Text style={estilos.nombreArchivoSeleccionado} numberOfLines={1}>
                  ✓ {nombreAudio}
                </Text>
              ) : (
                <Text style={estilos.textoCargarSub}>.mp3 / .wav desde tu dispositivo</Text>
              )}
            </View>
          </TouchableOpacity>

          {/* ── Controles de audio: aparecen solo cuando hay un archivo cargado ── */}
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

              {/* Boton Enviar Audio */}
              <TouchableOpacity
                style={[estilos.botonEnviarAudio, { flex: 1 }]}
                onPress={alEnviarAudio}
                activeOpacity={0.75}
                accessibilityLabel="Enviar audio cargado a Supabase"
              >
                <Text style={estilos.iconoEnviarAudio}>📤</Text>
                <View style={estilos.textoEnviarWrapper}>
                  <Text style={estilos.textoEnviarAudio}>Enviar Audio</Text>
                  <Text style={estilos.textoEnviarSub} numberOfLines={1}>
                    {nombreAudio}
                  </Text>
                </View>
              </TouchableOpacity>

            </View>
          )}

        </View>

        {/* ── Boton de hablar en vivo ── */}
        <View style={estilos.areaInferior}>
          <TouchableOpacity
            style={estilos.botonHablar}
            onPressIn={alPresionarHablar}
            onPressOut={alSoltarHablar}
            activeOpacity={0.75}
            accessibilityLabel="Grabar mensaje de voz en vivo"
            accessibilityHint="Manten presionado para hablar y suelta para enviar"
          >
            <Text style={estilos.iconoMicrofono}>🎙</Text>
            <Text style={estilos.textoHablar}>Mantener presionado</Text>
            <Text style={estilos.textoHablarSub}>y hablar</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/* ═══════════════════════════════════════════════════════════════
   ESTILOS
   ═══════════════════════════════════════════════════════════════ */
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

  // ── Cabecera ──
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
    backgroundColor: '#22C55E',
  },
  textoOnline: {
    fontSize: 12,
    color: '#6B7280',
    letterSpacing: 1,
  },

  // ── Area SOS ──
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

  // ── Seccion de debugging ──
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

  // ── Input de texto libre ──
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

  // ── Boton Cargar Audio ──
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

  // ── Area inferior ──
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
  textoHablarSub: {
    fontSize: 14,
    color: '#9CA3AF',
  },

  // ── Boton Enviar Audio (aparece dinamicamente tras cargar un archivo) ──
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
    color: '#4ade80',                     // verde claro — llama la atencion como accion primaria
  },
  textoEnviarSub: {
    fontSize: 12,
    color: '#6b7280',
  },

  // ── Fila de controles de audio (Escuchar + Enviar, uno al lado del otro) ──
  filaControlesAudio: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },

  // Boton Reproducir / Pausar: cuadrado a la izquierda de Enviar
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
