/**
 * 🏗️ Root Layout — Pure Delegation
 * 
 * This file delegates 100% to AppLifecycleManager.
 * 
 * It does NOT contain:
 * - Authentication logic
 * - GPS logic
 * - Realtime channel logic
 * - Notification listener logic
 * - AppState handlers
 * 
 * It ONLY:
 * 1. Calls appLifecycle.initialize()
 * 2. Redirects if not authenticated
 * 3. Provides the notification tap handler (for routing)
 * 4. Calls appLifecycle.destroy() on unmount
 */

import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { I18nProvider, useI18n } from '@/services/i18n';
import { appLifecycle } from '@/services/app-lifecycle';
import { useEffect, useState } from 'react';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

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

  useEffect(() => {
    // ── Single entry point: lifecycle handles EVERYTHING ──
    const initialize = async () => {
      const isAuthenticated = await appLifecycle.initialize();
      if (!isAuthenticated) {
        router.replace('/login');
        // Give the router enough time to execute the replacement and render the login screen
        // before dropping the native Splash Screen curtain.
        setTimeout(() => {
          SplashScreen.hideAsync();
        }, 200);
      } else {
        await SplashScreen.hideAsync();
      }
    };

    // ── Provide notification tap handler for deep linking ──
    // This is the ONLY thing _layout needs to contribute:
    // the router reference for navigation on notification tap.
    appLifecycle.setNotificationResponseHandler((orderId: string) => {
      router.push(`/os/${orderId}`);
    });

    initialize();

    return () => {
      appLifecycle.destroy();
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
          headerBackTitle: '',
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
