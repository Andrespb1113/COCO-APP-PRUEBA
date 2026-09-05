/**
 * Layout raíz del simulador COCO.
 * Configuración mínima: una sola pantalla, sin tabs, sin header.
 * La barra de estado se oculta para simular un dispositivo de hardware.
 *
 * SafeAreaProvider es obligatorio para que SafeAreaView funcione
 * correctamente en todos los dispositivos (notch, barra de navegación, etc.)
 */
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      {/* Pantalla principal: sin header para experiencia Zero-UI */}
      <Stack screenOptions={{ headerShown: false }} />
      {/* Barra de estado oscura para contraste con el fondo negro */}
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}
