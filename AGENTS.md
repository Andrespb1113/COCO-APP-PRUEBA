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

#### Próximos pasos pendientes (superados en iteración 5)
- [x] Refactorizar salida de datos de Supabase → AWS IoT Core (MQTT).
- [x] Crear módulo `iotContract.js` con validación estricta del Contrato IoT.
- [x] Implementar conversión Base64 nativa para audios con `expo-file-system`.
- [ ] Rellenar `AWS_ENDPOINT`, `ACCESS_KEY`, `SECRET_KEY` en `iotContract.js`.
- [ ] Implementar grabación de audio en vivo con `expo-audio` (botón inferior).

---

### Iteración 5 — 2026-08-27: Refactorización hacia Contrato IoT MQTT + conversión Base64

#### ¿Qué hicimos?
Se refactorizó la salida de datos para cumplir con el Contrato IoT MQTT, implementando conversión Base64 nativa para audios.

- Creamos `iotContract.js` como módulo central del contrato de datos IoT.
- Instalamos `expo-mqtt` (cliente MQTT nativo para Expo/React Native).
- Instalamos `expo-file-system` (ya incluido en el SDK, ahora usado explícitamente).
- Refactorizamos `app/index.tsx` eliminando toda referencia a Supabase y conectando cada acción al pipeline MQTT.

#### Archivos creados/modificados
- `iotContract.js` — **[NUEVO]** Módulo del Contrato IoT con:
  - Constantes: `AWS_ENDPOINT`, `ACCESS_KEY`, `SECRET_KEY` (vacías, pendientes), `TOPICO_TX = 'coco/simulador/tx'`.
  - `generarPayload(mac_address, tipo_evento, formato_payload, data)`: valida estrictamente `tipo_evento` ('MENSAJE' | 'ALERTA_SOS') y `formato_payload` ('TEXTO' | 'AUDIO_B64'); lanza `Error` si son inválidos. Agrega `timestamp_iso` automático.
- `app/index.tsx` — **[MODIFICADO]** Refactorización completa:
  - Nueva función `despachaMQTT(tipo_evento, formato_payload, data)`: ensambla el payload via `generarPayload`, imprime el JSON en consola con `console.log` y publica en el tópico MQTT si hay conexión.
  - `animarPresionSOS` → llama `despachaMQTT('ALERTA_SOS', 'TEXTO', ...)`.
  - `alEnviarTexto` → llama `despachaMQTT('MENSAJE', 'TEXTO', texto)`.
  - `alEnviarAudio` → lee el archivo con `FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })` y llama `despachaMQTT('MENSAJE', 'AUDIO_B64', base64Data)`.
  - Indicador de conexión en cabecera: verde si `connected`, amarillo si no hay MQTT activo.

#### Librerías instaladas
- `expo-mqtt` — `npx expo install expo-mqtt` (cliente MQTT nativo para Expo/RN).
- `expo-file-system` — ya estaba en el SDK; ahora se usa `FileSystem.EncodingType.Base64`.

#### Arquitectura de salida (nueva)
```
[Acción del usuario]
       ↓
generarPayload()  ← iotContract.js (valida + ensambla)
       ↓
console.log(JSON)  ← inspeccionable en terminal
       ↓
publish(TOPICO_TX, payload)  ← expo-mqtt → AWS IoT Core
```

#### Qué salió mal / decisiones tomadas
- Se eligió `expo-mqtt` sobre `paho-mqtt` porque es la librería recomendada para Expo SDK 54+: usa implementaciones nativas (Swift/Kotlin) en vez de polyfills de Node.js que son inestables en React Native.
- `AWS_ENDPOINT` queda vacío intencionalmente; `despachaMQTT` detecta la falta de conexión con `connected === false` y advierte en consola sin crashear la app.
- El `console.log` del payload es **intencional y permanente** en esta fase: permite visualizar la cadena Base64 completa en el terminal del desarrollador para validar la conversión antes de integrar el broker real.

#### Próximos pasos pendientes (superados en iteración 6)
- [x] Reemplazar `expo-mqtt` por librería compatible con Expo Go.
- [x] Corregir error `FileSystem.EncodingType.Base64 is undefined`.
- [x] Implementar grabación de audio en vivo con `expo-audio` Recording API.

---

### Iteración 6 — 2026-08-27: Fix expo-mqtt + Fix Base64 + Grabación de audio en vivo

#### ¿Qué bugs se corrigieron?

**Bug 1 — `expo-mqtt` crashea en Expo Go**
- **Error:** `Cannot find native module 'ExpoMqtt'`
- **Causa:** `expo-mqtt` usa módulos nativos compilados (Swift/Kotlin) que no están incluidos en Expo Go. Solo funciona en un Development Build (`eas build`).
- **Fix:** Se desinstaló `expo-mqtt` y se instaló `mqtt` (MQTT.js puro JavaScript).
  - `mqtt` usa **WebSocket** como transporte → compatible con Expo Go sin compilación.
  - AWS IoT Core acepta MQTT sobre WebSocket (`wss://<endpoint>:443/mqtt`).
  - El cliente se gestiona con `useRef` + `useEffect` para no provocar re-renders innecesarios.
  - Si `AWS_ENDPOINT` está vacío, el cliente no intenta conectar y la app funciona normalmente.

**Bug 2 — `FileSystem.EncodingType.Base64` es `undefined`**
- **Error:** `[TypeError: Cannot read property 'Base64' of undefined]`
- **Causa:** `expo-file-system` en SDK 54 no re-exporta el enum `EncodingType` correctamente en el contexto de Metro bundler.
- **Fix:** Se reemplazó `FileSystem.EncodingType.Base64` por el string literal `'base64' as any`. La API de `readAsStringAsync` acepta ambas formas; el string literal siempre funciona.

#### ¿Qué se implementó?

**Botón "Mantener presionado y hablar" — Grabación en vivo completa**

Ahora es el flujo principal del dispositivo. Implementado con `useAudioRecorder` de `expo-audio`:

```
[onPressIn] → requestMicrophonePermissionsAsync()
            → audioRecorder.prepareToRecordAsync()
            → audioRecorder.record()  ← mic activo
            → UI: botón rojo 🔴 "● Grabando... / Suelta para enviar"

[onPressOut] → audioRecorder.stop()
             → FileSystem.readAsStringAsync(uri, { encoding: 'base64' })
             → despachaMQTT('MENSAJE', 'AUDIO_B64', base64)
             → console.log(JSON completo con cadena Base64)
```

#### Librerías cambiadas
- `expo-mqtt` — **ELIMINADA** (requiere native build, incompatible con Expo Go)
- `mqtt` — **INSTALADA** (`npm install mqtt`) — MQTT.js puro JS, funciona en Expo Go vía WebSocket

#### Regla crítica a recordar
> **NUNCA usar `expo-mqtt` en este proyecto mientras se use Expo Go.**
> Usar siempre `mqtt` (MQTT.js). Si en el futuro se migra a un Development Build, se puede reconsiderar.

#### Regla crítica a recordar (2)
> **NUNCA usar `FileSystem.EncodingType.Base64`** en SDK 54.
> Usar siempre el string literal `'base64' as any` con `FileSystem.readAsStringAsync`.

#### Regla crítica a recordar (3)
> **La función de permisos de micrófono en `expo-audio` se llama `requestRecordingPermissionsAsync`**, NO `requestMicrophonePermissionsAsync`.
> La función `requestMicrophonePermissionsAsync` **no existe** en `expo-audio`. Usar siempre `requestRecordingPermissionsAsync`.

#### Regla crítica a recordar (4)
> **`readAsStringAsync` está ELIMINADO en `expo-file-system` SDK 54.** No es un deprecation warning, lanza un `Error` real que crashea.
> Usar siempre la nueva API: `import { File } from 'expo-file-system'` → `new File(uri).base64()` para Base64, `new File(uri).text()` para texto.
> **NUNCA usar** `import * as FileSystem from 'expo-file-system'` con los métodos legacy (`readAsStringAsync`, `writeAsStringAsync`, etc.).

#### Regla crítica a recordar (5)
> **`audioRecorder.prepareToRecordAsync()` lanza error si el grabador ya fue preparado.**
> Error: `"AudioRecorder has already been prepared. Stop or release the current session before preparing again."`
> Solución: envolver en `try/catch` — si falla, llamar `audioRecorder.stop()` y luego `prepareToRecordAsync()` de nuevo.

#### Regla crítica a recordar (6)
> **Detección de Silencio para Zero-UI (VAD de 2 Fases):**
> Para accesibilidad de adultos mayores: no cortar por silencio antes de que el usuario comience a hablar.
> - **Fase 1 (Espera de inicio):** Espera hasta 8s dando tiempo al usuario para empezar. Confirma voz sostenida (`>= 200ms` a `db >= -32 dB`).
> - **Fase 2 (Detección de fin):** Una vez confirmada la voz, corta a los `1.5s` de silencio continuo y auto-envía el payload MQTT.

---

### Iteración 8 — 2026-08-27: VAD Adaptativo de 2 Fases para Adultos Mayores

#### ¿Qué problema resolvimos?
- En la iteración anterior, si el adulto mayor tardaba más de 1.5s en formular su frase tras pulsar el botón, el sistema interpretaba silencio prematuro y cerraba la grabación antes de que hablara.

#### ¿Cómo lo solucionamos?
- Implementamos un **VAD de 2 Fases** en [app/index.tsx](file:///c:/Users/Andres/Desktop/COCO%20APP%20PRUEBA/simulador-coco/app/index.tsx):
  1. **Fase 1 — Espera de Voz (hasta 8 segundos):**
     - Al tocar el botón, el simulador muestra `⏳ Esperando que hables... (Tómate tu tiempo para empezar)`.
     - El micrófono escucha activamente sin apurarse.
     - Detecta voz humana sostenida (`>= 200ms` continuo por encima de `-32 dB`) para confirmar inicio real de voz y descartar ruidos de fondo secos.
  2. **Fase 2 — Captura y Auto-corte por Silencio:**
     - Al detectar voz, la UI pasa a `🔴 Escuchando voz... (Para solo cuando termines)`.
     - Monitorea el momento exacto en que termina de hablar.
     - Tras `1.5s` de silencio continuo, detiene automáticamente, genera Base64 y despacha vía MQTT.
  3. **Protección de Inactividad:**
     - Si pasan 8s sin que se emita voz, la grabación se cancela limpiamente sin enviar payloads vacíos.

#### Próximos pasos pendientes (superados en iteración 9)
- [x] Configurar credenciales reales de AWS IoT Core vía `.env`.
- [x] Validar publicación contra AWS IoT Core real con SigV4.

---

### Iteración 9 — 2026-09-05: Conexión MQTT real con SigV4 a AWS IoT Core

> Se configuró la conexión MQTT sobre WebSockets apuntando a AWS IoT Core (us-east-2) mediante variables de entorno seguras. Se validó la suscripción al tópico `coco/simulador/rx` y el despacho híbrido (SOS directo y Audio Base64) hacia `coco/simulador/tx` cumpliendo el contrato de hardware.

#### ¿Qué hicimos?

**1. Variables de entorno (`.env`)**
- Creado `.env` en la raíz del proyecto con las variables `EXPO_PUBLIC_*` que Expo expone automáticamente en runtime.
- Agregado `.env` al `.gitignore` para proteger las credenciales de commits accidentales.

**2. Módulo `mqttClient.js` [NUEVO]**
- Encapsula toda la lógica de conexión a AWS IoT Core.
- Genera una **URL WebSocket pre-firmada con AWS Signature V4** usando la librería `aws-signature-v4`, que es el mecanismo de autenticación estándar de AWS para IoT Core sin certificados X.509.
- Al conectar exitosamente (`on('connect')`), se suscribe automáticamente al tópico de bajada `coco/simulador/rx`.
- Expone `DEVICE_MAC`, `AWS_IOT_ENDPOINT` y `conectarMQTT(onMensaje)`.

**3. Actualización de `iotContract.js`**
- Las constantes de conexión (`AWS_ENDPOINT`) ahora se re-exportan desde `mqttClient.js`.
- Ya no hay strings hardcodeados con credenciales.

**4. Actualización de `app/index.tsx`**
- La MAC del dispositivo se lee de `DEVICE_MAC` (variable de entorno `EXPO_PUBLIC_DEVICE_MAC`).
- El `useEffect` de MQTT ahora llama a `conectarMQTT()` en vez de construir el cliente directamente.
- Nuevo estado `ultimoMensajeRx` para capturar mensajes que lleguen del backend.
- El SOS ahora usa el campo `data: 'EMERGENCIA_BOTON_PANICO'` exacto del contrato.

#### Archivos modificados
- `.env` — **[NUEVO]** Variables de entorno AWS IoT Core.
- `.gitignore` — Agregada regla `.env` (separada de `.env*.local`).
- `mqttClient.js` — **[NUEVO]** Módulo de conexión con SigV4.
- `iotContract.js` — Actualizado para re-exportar desde `mqttClient.js`.
- `app/index.tsx` — MAC desde env, MQTT vía `conectarMQTT`, SOS con `data` corregido.

#### Librería instalada
- `aws-signature-v4` — `npm install aws-signature-v4` — Genera URLs pre-firmadas con SigV4.

#### ⚠️ Regla crítica a recordar (7)
> **Para conectarse a AWS IoT Core via WebSocket, la URL DEBE estar firmada con AWS Signature V4.**
> No basta con pasar `username`/`password` en las opciones de `mqtt.connect()`.
> Usar `aws-signature-v4` (o equivalente) para generar la URL `wss://` firmada antes de llamar `mqtt.connect(url)`.

#### Próximos pasos pendientes
- [x] Rellenar `EXPO_PUBLIC_AWS_ACCESS_KEY_ID` y `EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY` en `.env` con las credenciales reales.
- [x] Reiniciar Expo (`npx expo start --clear`) para que tome las nuevas variables de entorno.
- [x] Verificar en terminal la línea `[MQTT] Conectado exitosamente a AWS IoT Core.`
- [x] Validar que el botón SOS publica `EMERGENCIA_BOTON_PANICO` en AWS IoT Core Console → Test → Subscribe to topic.

---

### Iteración 10 — 2026-09-05: Flujo Completo Bidireccional MQTT con AWS IoT Core y Upgrade a Expo SDK 57

> **Hito alcanzado:** El simulador COCO cuenta con comunicación bidireccional en tiempo real 100% operativa y validada con AWS IoT Core. Se completó con éxito el despacho ascendente (TX en `coco/simulador/tx`) tanto para emergencias como para audio, y la recepción y procesamiento descendente (RX en `coco/simulador/rx`). Se resolvió la incompatibilidad de Node.js en React Native implementando SigV4 puro en JavaScript y se migró el proyecto a Expo SDK 57.

#### ¿Qué hicimos?

**1. Configuración Segura de Credenciales Reales (`.env`)**
- Se registraron en `.env` las credenciales IAM reales (`EXPO_PUBLIC_AWS_ACCESS_KEY_ID` y `EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY`).
- Se respaldaron los certificados X.509 y llaves RSA en la carpeta `certs/`.
- Se reforzó `.gitignore` para asegurar que ni `.env` ni la carpeta `certs/` jamás sean versionados en el repositorio Git.

**2. Actualización a Expo SDK 57**
- Debido a una actualización de la aplicación móvil Expo Go en el dispositivo físico a SDK 57, se actualizó el proyecto ejecutando `npm install expo@latest` y `npx expo install --fix`.
- Se corrigió la propiedad `backgroundColor` en `<StatusBar />` dentro de `app/_layout.tsx` para cumplir con los tipos de SDK 57.
- Se corrigió `playsInSilentMode` en las llamadas a `setAudioModeAsync` dentro de `app/index.tsx`.
- Verificación exitosa de TypeScript (`npx tsc --noEmit` con 0 errores).

**3. Implementación de SigV4 100% compatible con React Native (`crypto-js`)**
- **Problema detectado:** Al compilar en Expo Go, el paquete `aws-signature-v4` falló con:
  `The package at "node_modules\aws-signature-v4\index.js" attempted to import the Node standard library module "crypto". It failed because the native React runtime does not include the Node standard library.`
- **Solución:** Se desinstaló `aws-signature-v4` y se instaló `crypto-js` (implementación de criptografía en JavaScript puro).
- Se implementó en `mqttClient.js` la generación matemática completa de la firma AWS SigV4:
  - Generación de timestamps ISO y compactos (`X-Amz-Date`, `dateStamp`).
  - Creación de claves derivadas (`kDate`, `kRegion`, `kService`, `kSigning`).
  - Construcción del Canonical Request con parámetros de consulta ordenados alfabéticamente.
  - Generación del String to Sign y cálculo de firma HMAC-SHA256 final en hexadecimal.
  - Retorno de URL WebSocket (`wss://`) pre-firmada para autenticación sin certificados en puerto 443.

**4. Validación en Vivo del Flujo Bidireccional**
- **Conexión:** Establecida exitosamente con el endpoint `a32v3a5dqlwvvo-ats.iot.us-east-2.amazonaws.com` y Client ID `coco-simulador-001122AABBCC`.
- **Suscripción:** Suscrito automáticamente a `coco/simulador/rx` con QoS 1.
- **Flujo Ascendente (TX):** El simulador despacha eventos JSON al pulsar SOS (`ALERTA_SOS` con `EMERGENCIA_BOTON_PANICO`) y al grabar voz (`MENSAJE` con audio Base64), recibidos exitosamente en la consola de AWS IoT Core.
- **Flujo Descendente (RX):** Los payloads JSON enviados desde AWS IoT Core hacia `coco/simulador/rx` son capturados por el cliente MQTT y procesados en tiempo real en la aplicación.

#### Archivos modificados / creados
- `.env` — Credenciales reales de AWS IoT Core cargadas (ignorado en Git).
- `.gitignore` — Protección añadida para `.env`, `.env*.local` y `certs/`.
- `certs/` — Llaves públicas y privadas respaldadas localmente (ignorado en Git).
- `package.json` y `package-lock.json` — Dependencias actualizadas a Expo SDK 57 y `crypto-js`.
- `app/_layout.tsx` — Compatibilidad con StatusBar en SDK 57.
- `app/index.tsx` — Ajuste de parámetros de audio y suscripción a eventos MQTT.
- `mqttClient.js` — Módulo completo de conexión MQTT con firma SigV4 mediante `crypto-js`.
- `AGENTS.md` — Documentación detallada de la arquitectura, reglas y flujo de la iteración.

#### ⚠️ Regla crítica a recordar (8)
> **En React Native / Expo Go NUNCA uses librerías que dependan del módulo `crypto` de Node.js.**
> Librerías como `aws-signature-v4` o el SDK nativo de AWS asumen el entorno de Node.js y fallarán al compilar en el bundler de React Native.
> Usa siempre librerías en JavaScript puro como `crypto-js` para firmas HMAC-SHA256 y SigV4 en el frontend móvil.

#### Estado del Simulador
- [x] Interfaz de hardware Zero-UI.
- [x] Grabación y parada automática por detección de voz / silencio (VAD en 2 fases).
- [x] Conversión y empaquetado de audio en Base64.
- [x] Contrato IoT estricto implementado y validado.
- [x] Conexión MQTT en tiempo real con AWS IoT Core vía WebSockets + SigV4.
- [x] Comunicación bidireccional completa (TX y RX probados con éxito).