import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { authService } from '@/services/auth-service';
import { I18nProvider, useI18n } from '@/services/i18n';
import { startBackgroundLocation } from '@/services/location-service';
import { logger } from '@/services/logger';
import { useEffect, useRef, useState } from 'react';

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

import { NotificationService } from '@/services/notification-service';
import { supabase } from '@/services/supabase';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { ActivityIndicator, Alert, Platform, Text, View } from 'react-native';

const isExpoGoAndroid = Platform.OS === 'android' && Constants.appOwnership === 'expo';
const Notifications = isExpoGoAndroid ? null : require('expo-notifications');

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <I18nProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <LayoutContent />
      </ThemeProvider>
    </I18nProvider>
  );
}

function LayoutContent() {
  const router = useRouter();
  const { t } = useI18n();

  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  useEffect(() => {
    // Enable system-wide log capture immediately
    logger.enableGlobalCapture();

    const initialize = async () => {
      // 1. Request Permissions & Auth
      const { status: locationStatus } = await Location.requestForegroundPermissionsAsync();
      if (locationStatus !== 'granted') {
        Alert.alert(t('permissionLocationTitle'), t('permissionLocationBody'));
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
          const channel = supabase
            .channel(`notifications:user:${user.id}`)
            .on(
              'postgres_changes',
              { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
              (payload: any) => {
                const notif = payload.new;
                NotificationService.showLocalNotification(
                  t('homeNewOsNotif'),
                  `${t('homeNewOsNotifBody')} ${notif.title || '#' + notif.order_id}`
                );
              }
            )
            .subscribe();
        }
      } else {
        router.replace('/login');
      }
    };

    initialize();

    // Listen for incoming notifications while app is open
    if (Notifications) {
      notificationListener.current = Notifications.addNotificationReceivedListener((notification: any) => {
        console.log('[RootLayout] Notification Received:', notification);
      });

      // Handle notification taps
      responseListener.current = Notifications.addNotificationResponseReceivedListener((response: any) => {
        const orderId = response.notification.request.content.data?.orderId;
        if (orderId) {
          router.push(`/os/${orderId}`);
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
    <>
      <StatusBar style="light" backgroundColor="#1c2d4f" translucent={false} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#1c2d4f' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          headerBackTitle: '', // Hides back title on iOS
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="os/[id]" options={{ title: 'OS' }} />
        <Stack.Screen name="os/execute" options={{ title: t('osExecute') }} />
        <Stack.Screen name="settings" options={{ title: t('menuSettings') }} />
        <Stack.Screen name="profile" options={{ title: t('menuProfile') }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>
    </>
  );
}
