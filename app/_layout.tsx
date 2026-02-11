import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar, setStatusBarBackgroundColor, setStatusBarStyle } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { startBackgroundLocation } from '@/services/location-service';
import { logger } from '@/services/logger';
import { useEffect } from 'react';
import { authService } from '@/services/auth-service';

export const unstable_settings = {
  anchor: '(tabs)',
};

import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import { Alert, Platform } from 'react-native';

// Configure Notification Handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    // Enable system-wide log capture immediately
    logger.enableGlobalCapture();

    const setupPermissionsAndNotifications = async () => {
      // 1. Request Permissions
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      if (locationStatus !== 'granted') {
        Alert.alert('Permissão necessária', 'Precisamos de acesso à sua localização para o funcionamento correto do app.');
      }

      const { status: notifStatus } = await Notifications.requestPermissionsAsync();
      if (notifStatus !== 'granted') {
        // Optional: Alert user or handled silently
      }

      // 2. Auth Check
      const isAuthenticated = await authService.checkAuthStatus();
      if (!isAuthenticated) {
        router.replace('/login');
      } else {
        router.replace('/(tabs)');
      }
    };

    setupPermissionsAndNotifications();
    startBackgroundLocation();

    // Force status bar to be white with dark icons on Android
    setStatusBarBackgroundColor('#ffffff', false);
    setStatusBarStyle('dark');

    // Notification Listeners
    const subscription = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1c2d4f' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          headerBackTitleVisible: false, // Cleaner back button
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="os/[id]" options={{ title: 'Detalhes da OS' }} />
        <Stack.Screen name="settings" options={{ title: 'Configurações' }} />
        <Stack.Screen name="profile" options={{ title: 'Meu Perfil' }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </ThemeProvider>
  );
}
