/**
 * 🏗️ Root Layout — Pure Delegation + Bootstrap Integration
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
 * 1. Runs BootstrapService.init() for cold start validation
 * 2. Calls appLifecycle.initialize()
 * 3. Redirects if not authenticated
 * 4. Provides the notification tap handler (for routing with bootstrap)
 * 5. Calls appLifecycle.destroy() on unmount
 * 6. Shows "Sincronizando..." overlay when bootstrap >1s
 */

import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';
import { I18nProvider, useI18n } from '@/services/i18n';
import { appLifecycle } from '@/services/app-lifecycle';
import { BootstrapService } from '@/services/bootstrap-service';
import { autoCheckinEvents, AUTO_CHECKIN_EVENT } from '@/services/auto-checkin-service';
import { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: '(tabs)',
};

import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { GlobalLoadingProvider } from '@/contexts/GlobalLoadingContext';

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <GlobalLoadingProvider>
        <I18nProvider>
          <LayoutContent />
        </I18nProvider>
      </GlobalLoadingProvider>
    </GestureHandlerRootView>
  );
}

function LayoutContent() {
  const router = useRouter();
  const { t } = useI18n();
  const [showSyncOverlay, setShowSyncOverlay] = useState(false);

  useEffect(() => {
    const initialize = async () => {
      // Bootstrap checks if session exists:
      // - No session → returns immediately (no smoke test!) → go to login
      // - Session exists → smoke test → validate → proceed
      const bootstrapResult = await BootstrapService.init();

      if (!bootstrapResult.authenticated) {
        // No session or auth failed — go to login
        // Login page will call appLifecycle.initialize() after successful login
        router.replace('/login');
        setTimeout(() => { SplashScreen.hideAsync(); }, 200);
        return;
      }

      if (bootstrapResult.status === 'OFFLINE') {
        // Authenticated but offline — proceed with cached data
        console.log('[Layout] 📦 Offline mode: proceeding with cached session');
      }

      // Full lifecycle initialization (GPS, realtime, polling, notifications)
      const isAuthenticated = await appLifecycle.initialize();
      if (!isAuthenticated) {
        router.replace('/login');
        setTimeout(() => { SplashScreen.hideAsync(); }, 200);
      } else {
        await SplashScreen.hideAsync();
      }
    };

    // Push notification tap handler — bootstrap before navigating
    appLifecycle.setNotificationResponseHandler(async (orderId: string) => {
      console.log(`[Layout] 🔔 Push tap for OS ${orderId} — bootstrapping...`);

      // Show "Sincronizando..." if bootstrap takes >1s
      const overlayTimer = setTimeout(() => setShowSyncOverlay(true), 1000);

      try {
        const result = await BootstrapService.init({ osId: orderId });
        clearTimeout(overlayTimer);
        setShowSyncOverlay(false);

        // Navigate regardless — screen will handle missing data
        router.push(`/os/${orderId}`);
      } catch (e) {
        clearTimeout(overlayTimer);
        setShowSyncOverlay(false);
        router.push(`/os/${orderId}`);
      }
    });

    initialize();

    // Auto check-in navigation listener
    const handleAutoCheckin = ({ order }: { order: { id: string; displayId?: string } }) => {
      console.log(`[Layout] 🗺️ Auto check-in realizado para OS ${order.displayId || order.id} — navegando...`);
      router.push(`/os/${order.id}`);
    };
    autoCheckinEvents.on(AUTO_CHECKIN_EVENT, handleAutoCheckin);

    return () => {
      appLifecycle.destroy();
      autoCheckinEvents.off(AUTO_CHECKIN_EVENT, handleAutoCheckin);
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
        <Stack.Screen name="settings" options={{ title: t('menuSettings') }} />
        <Stack.Screen name="profile" options={{ title: t('menuProfile') }} />
        <Stack.Screen name="login" options={{ headerShown: false }} />
        <Stack.Screen name="+not-found" />
      </Stack>

      {/* "Sincronizando..." overlay — never shows error */}
      {showSyncOverlay && (
        <View style={styles.syncOverlay}>
          <View style={styles.syncBox}>
            <ActivityIndicator size="large" color="#4A90D9" />
            <Text style={styles.syncText}>Sincronizando...</Text>
          </View>
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  syncOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9999,
  },
  syncBox: {
    backgroundColor: '#1c2d4f',
    borderRadius: 16,
    padding: 32,
    alignItems: 'center',
    gap: 16,
  },
  syncText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
