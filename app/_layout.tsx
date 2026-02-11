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

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const router = useRouter();

  useEffect(() => {
    // Enable system-wide log capture immediately
    logger.enableGlobalCapture();

    // Start tracking on app mount if desired, or maybe only after login? 
    // Keeping it here for now as per previous logic, but ideally should be after login.

    const checkAuth = async () => {
      const isAuthenticated = await authService.checkAuthStatus();
      if (!isAuthenticated) {
        router.replace('/login');
      } else {
        router.replace('/(tabs)');
      }
    };

    // Check auth after a brief delay to ensure navigation is ready or just run it
    checkAuth();

    startBackgroundLocation();

    // Force status bar to be white with dark icons on Android
    setStatusBarBackgroundColor('#ffffff', false);
    setStatusBarStyle('dark');
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
