# Contexto del Proyecto COCO (Simulador Móvil)

## 1. Objetivo Principal
Esta aplicación móvil NO es para el usuario final (familiar). Esta app **simula ser el dispositivo físico de hardware COCO** (Proyecto Zero-UI) diseñado para adultos mayores. Servirá para hacer pruebas de campo enviando y recibiendo datos hacia la nube como si fuera el altavoz físico.

## 2. Stack Tecnológico
- **Framework:** React Native con Expo.
- **Base de Datos y Almacenamiento:** Supabase.
- **Nube IoT:** AWS IoT Core (para telemetría y estado online - se integrará después).

## 3. Reglas de Negocio y Base de Datos
- **Identidad del Dispositivo:** El identificador principal del dispositivo (el campo `id` de la tabla `dispositivos_coco`) es la **MAC Address** guardada como texto (Ej: "00:11:22:33:44:55"). No se usa UUID para el hardware en esta fase.
- **Grabación de Audio:** Al grabar un mensaje de voz, el archivo temporal debe subirse al "Storage" de Supabase.
- **Historial de Interacciones:** Una vez subido el audio, se debe crear un registro en la tabla `historial_interacciones` con la siguiente estructura:
  - `emisor`: 'COCO'
  - `tipo_evento`: 'AUDIO_DIRECTO'
  - `metadata_payload`: Un objeto JSONB que contenga la URL pública del audio (Ej: `{"url_audio": "https://..."}`).
- **Botón SOS:** Debe existir una función que simule el botón de pánico físico, enviando un evento de tipo `'ALERTA_SOS'` a la base de datos.

## 4. Reglas de Interfaz (UI/UX)
- No usar interfaces gráficas complejas. La pantalla debe tener botones gigantes, de alto contraste y fáciles de presionar, imitando la interacción de un aparato físico. No debe parecer una red social ni una app tradicional.

## 5. Tono del Código
- Escribir código limpio, modular y con comentarios en español para que mis compañeros de la universidad (backend e IA) puedan entender la lógica.

---

## Registro de Desarrollo

### Iteración 1 — 2026-08-19: Limpieza del boilerplate y UI inicial

#### ¿Qué hicimos?
- Leímos el contexto completo del proyecto (este archivo).
- Eliminamos todos los archivos predeterminados de `create-expo-app` que no son útiles para el proyecto COCO.
- Creamos la pantalla principal (`app/index.tsx`) con diseño Zero-UI.
- Simplificamos el layout raíz (`app/_layout.tsx`) a una sola pantalla sin tabs ni header.

#### Archivos eliminados (basura de Expo)
- `app/(tabs)/` — carpeta completa (tabs innecesarios)
- `app/modal.tsx`
- `components/external-link.tsx`, `haptic-tab.tsx`, `hello-wave.tsx`, `parallax-scroll-view.tsx`, `themed-text.tsx`, `themed-view.tsx`
- `components/ui/` — carpeta completa
- `hooks/use-color-scheme.ts`, `use-color-scheme.web.ts`, `use-theme-color.ts`
- `constants/theme.ts`
- `scripts/reset-project.js`

#### Archivos creados/modificados
- `app/_layout.tsx` — Layout raíz mínimo: Stack sin header, StatusBar en modo `light`.
- `app/index.tsx` — Pantalla principal COCO con:
  - Fondo negro profundo (`#0A0A0A`) para estilo hardware.
  - Botón SOS circular rojo (`#DC2626`) con tamaño del 68% del ancho de pantalla.
  - Animación de pulsación (`Animated.spring`) al presionar el SOS.
  - Anillos de "zona de alerta" rojos semitransparentes alrededor del SOS.
  - Botón inferior "Mantener presionado y hablar" con ícono 🎙.
  - `onPressIn` / `onPressOut` preparados para la lógica de audio.
  - Indicador de estado "Simulador activo" con punto verde en la cabecera.
  - Comentarios en español en todos los métodos y estilos.

#### Librerías utilizadas (ya incluidas en Expo SDK)
- `react-native` — `View`, `Text`, `TouchableOpacity`, `Animated`, `StyleSheet`, `Dimensions`, `SafeAreaView`
- `expo-router` — `Stack`
- `expo-status-bar` — `StatusBar`

#### Qué salió mal / decisiones tomadas
- Se optó por **no usar** `useColorScheme` ni `ThemeProvider` de `@react-navigation/native` porque la app es siempre oscura (dispositivo de hardware).
- Se usa `Animated.Value` en lugar de `react-native-reanimated` para esta primera pantalla estática (más sencillo y sin dependencias extra).
- El `unstable_settings.anchor` del layout anterior apuntaba a `(tabs)` — se eliminó porque ya no hay tabs.

#### Próximos pasos pendientes
- [ ] Integrar `@supabase/supabase-js` y `AsyncStorage` para la conexión a la base de datos.
- [ ] Implementar lógica del botón SOS (insertar evento `ALERTA_SOS` en `historial_interacciones`).
- [ ] Integrar `expo-av` para grabación de audio con el botón de hablar.
- [ ] Subir audio grabado a Supabase Storage y guardar URL en `historial_interacciones`.

---

### Iteración 2 — 2026-08-19: Sección de Mensajes Rápidos + corrección SafeAreaView

#### ¿Qué hicimos?
- Añadimos la sección "Mensajes Rápidos" en `app/index.tsx`: un `ScrollView` horizontal con 6 botones pregrabados.
- Corregimos el warning `SafeAreaView has been deprecated` migrando a `react-native-safe-area-context`.
- Envolvimos la app en `SafeAreaProvider` en `app/_layout.tsx`.

#### Archivos modificados
- `app/index.tsx` — Nueva sección `seccionMensajes` con array `MENSAJES_RAPIDOS` y función `alEnviarMensajeRapido`.
- `app/_layout.tsx` — Ahora usa `SafeAreaProvider` de `react-native-safe-area-context`.

#### Estructura de MENSAJES_RAPIDOS
Cada item tiene: `id`, `icono` (emoji), `etiqueta` (texto visible), `tipo` ('audio' | 'texto').
- Tipo `'texto'`: insertará la etiqueta en `historial_interacciones` directamente.
- Tipo `'audio'`: subirá un .mp3 pregrabado a Supabase Storage (lógica pendiente).
- Insignia 🔊 = audio, 💬 = texto, diferenciadas visualmente con borde azul vs gris.

#### Librerías corregidas
- `react-native-safe-area-context` — ya estaba instalada en el SDK, solo faltaba usarla correctamente.

#### Qué salió mal / decisiones tomadas
- La herramienta `write_to_file` tuvo un error de parseo interno; se usó PowerShell (`Out-File`) como alternativa para escribir el archivo.
- Se redujo `SOS_BUTTON_SIZE` de 68% a 65% del ancho para dejar espacio a la nueva sección sin que el layout se comprima.

#### Próximos pasos pendientes (superados en iteración 3)
- [x] UI de herramientas de debugging en `app/index.tsx`.

---

### Iteración 3 — 2026-08-19: Corrección — Input de texto libre + Selector de audio local

#### ¿Qué salió mal? (error a recordar)
**Confusión entre menú de mensajes rápidos vs. input de texto libre y selector de archivos locales.**
En la iteración 2 se interpretó "enviar audios pregrabados o texto como instrucción" como un menú de frases fijas preestablecidas. Lo que el usuario necesitaba era:
1. Un campo `TextInput` de texto **completamente libre** para simular cualquier comando.
2. Un botón que abra el **explorador de archivos nativo** del dispositivo para cargar un .mp3/.wav real ya almacenado localmente.
No confundir "mensajes rápidos de usuario final" con "herramientas de debugging para el desarrollador".

#### ¿Qué hicimos?
- Eliminamos completamente la sección de `MENSAJES_RAPIDOS` (array fijo + ScrollView).
- Añadimos en su lugar una sección `seccionDebug` con dos herramientas:
  1. **Input de texto libre** (`TextInput`) + botón **Enviar** (azul, desactivado si el campo está vacío).
  2. **Botón Cargar Audio** que usa `expo-document-picker` para abrir el explorador de archivos nativo, filtrando por `audio/mpeg`, `audio/wav`, `audio/*`.
- Tras seleccionar un archivo, se muestra el nombre del archivo en verde junto al botón.
- Añadimos `KeyboardAvoidingView` para que el teclado no tape el input en iOS/Android.

#### Librería instalada
- `expo-document-picker` — `npx expo install expo-document-picker`
  - `DocumentPicker.getDocumentAsync({ type: ['audio/*'], copyToCacheDirectory: true })`
  - Retorna un objeto con `assets[0].uri` y `assets[0].name` al seleccionar.
  - Retorna `{ canceled: true }` si el usuario cancela.

#### Archivos modificados
- `app/index.tsx` — Reescrito completamente: eliminados mensajes rápidos, añadidos input libre y cargador de audio.

#### Próximos pasos pendientes
- [ ] Integrar `@supabase/supabase-js` + `@supabase/storage-js` para la conexión a la BD.
- [ ] Implementar lógica del botón SOS → insertar `ALERTA_SOS` en `historial_interacciones`.
- [ ] `alEnviarTexto` → insertar `{ emisor: 'COCO', tipo_evento: 'TEXTO_LIBRE', metadata_payload: { texto } }` en Supabase.
- [ ] `alCargarAudio` → subir `archivo.uri` a Supabase Storage y registrar URL en `historial_interacciones` con `tipo_evento: 'AUDIO_DIRECTO'`.
- [ ] Integrar grabacion de audio en vivo con el boton inferior (usar `expo-audio` que ya está instalado).

---

### Iteración 4 — 2026-08-19: Reproductor de audio + migración expo-av → expo-audio

#### ¿Qué hicimos?
- Añadimos botón **🔊 Escuchar / ⏸ Pausar** que aparece dinámicamente al cargar un archivo.
- Los dos botones (Escuchar + Enviar Audio) quedan en una fila horizontal (`filaControlesAudio`).
- Migramos de `expo-av` (deprecado en SDK 54) a `expo-audio`.

#### ¿Qué salió mal? (error a recordar)
**`expo-av` está deprecado en SDK 54** — El terminal lanzó este WARN:
```
WARN [expo-av]: Expo AV has been deprecated and will be removed in SDK 54.
Use the `expo-audio` and `expo-video` packages instead.
```
No usarlo más. Toda la reproducción de audio debe hacerse con `expo-audio`.

#### Diferencias de API: expo-av vs expo-audio
| expo-av (DEPRECATED) | expo-audio (USAR ESTO) |
|---|---|
| `import { Audio } from 'expo-av'` | `import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from 'expo-audio'` |
| `Audio.Sound.createAsync({ uri })` | `useAudioPlayer({ uri })` (hook) |
| `sound.playAsync()` | `player.play()` |
| `sound.pauseAsync()` | `player.pause()` |
| `sound.seekTo(0)` | `player.seekTo(0)` |
| `sound.unloadAsync()` (cleanup manual) | Automático — el hook maneja el ciclo de vida |
| `sound.setOnPlaybackStatusUpdate(cb)` | `useAudioPlayerStatus(player)` → objeto reactivo con `.playing`, `.didJustFinish` |
| `Audio.setAudioModeAsync({...})` | `setAudioModeAsync({...})` (importado directamente) |

#### Librerías
- `expo-audio` — `npx expo install expo-audio` (reemplaza a expo-av)
- `expo-av` — YA NO USAR (deprecado SDK 54, se eliminará en SDK 55)

#### Próximos pasos pendientes
- [ ] Integrar `@supabase/supabase-js` para la conexión a la BD.
- [ ] Implementar lógica del botón SOS → `ALERTA_SOS` en `historial_interacciones`.
- [ ] `alEnviarTexto` → insertar texto en Supabase.
- [ ] `alEnviarAudio` → subir URI a Storage + registrar en BD.
- [ ] Grabación de audio en vivo con `expo-audio` (botón inferior).