import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { authService } from '@/services/auth-service';
import { startBackgroundLocation } from '@/services/location-service';
import { logger } from '@/services/logger';
import { useEffect, useRef } from 'react';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

import { NotificationService } from '@/services/notification-service';
import { supabase } from '@/services/supabase';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { Alert, Platform } from 'react-native';

const isExpoGoAndroid = Platform.OS === 'android' && Constants.appOwnership === 'expo';
const Notifications = isExpoGoAndroid ? null : require('expo-notifications');

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    // Enable system-wide log capture immediately
    logger.enableGlobalCapture();

    const initialize = async () => {
      // 1. Request Permissions & Auth
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      if (locationStatus !== 'granted') {
        Alert.alert('Permissão de Localização', 'Precisamos de acesso para registrar atendimento.');
      }

      const isAuthenticated = await authService.checkAuthStatus();

      if (isAuthenticated) {
        // Start Background Services
        startBackgroundLocation().catch(err => console.error(err));

        // 2. Setup Push Notifications & Realtime Listener
        const token = await NotificationService.registerForPushNotificationsAsync();

        // Setup Realtime Listener for Instant Notifications (In-App)
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          console.log("Setting up Realtime Notification Listener for:", user.id);
          const channel = supabase
            .channel(`notifications:user:${user.id}`)
            .on(
              'postgres_changes',
              {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: `user_id=eq.${user.id}`
              },
              (payload: any) => {
                console.log("🔔 Realtime Notification Received:", payload);
                const notif = payload.new;
                NotificationService.triggerLocalNotification(notif.title, notif.body, notif.data);
              }
            )
            .subscribe();
        }
      }

      if (!isAuthenticated) {
        router.replace('/login');
      } else {
        router.replace('/');
      }
    };

    initialize();

    // Listeners for foreground/background interaction
    if (Notifications) {
      notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
        console.log("Notification Received in Foreground:", notification);
      });

      responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
        console.log("User tapped notification:", response);
        const data = response.notification.request.content.data;
        if (data?.orderId) {
          router.push(`/os/${data.orderId}`);
        }
      });
    }

    return () => {
      if (Notifications && typeof Notifications.removeNotificationSubscription === 'function') {
        if (notificationListener.current) Notifications.removeNotificationSubscription(notificationListener.current);
        if (responseListener.current) Notifications.removeNotificationSubscription(responseListener.current);
      }
      supabase.removeAllChannels();
    };
  }, []);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <StatusBar style="light" backgroundColor="#1c2d4f" translucent={false} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1c2d4f' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          headerBackTitle: '', // Hides back title on iOS
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
