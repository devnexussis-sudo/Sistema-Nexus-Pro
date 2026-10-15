
import { Tabs } from 'expo-router';
import { useState, useEffect } from 'react';
import { Pressable, View, useColorScheme as useDeviceColorScheme, DeviceEventEmitter, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HapticTab } from '@/components/haptic-tab';
import { HeaderRightToggle } from '@/components/header-right-toggle';
import { MenuModal } from '@/components/menu-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/services/i18n';
import { supabase } from '@/services/supabase';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const deviceTheme = useDeviceColorScheme();
  const isDarkDevice = deviceTheme === 'dark';
  const [isMenuVisible, setMenuVisible] = useState(false);
  const { t } = useI18n();
  const insets = useSafeAreaInsets();

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: isDarkDevice ? '#ffffff' : '#1c2d4f',
          tabBarInactiveTintColor: isDarkDevice ? '#cbd5e1' : '#94a3b8',
          headerShown: true,
          tabBarButton: HapticTab,
          tabBarStyle: {
            backgroundColor: isDarkDevice ? '#1e293b' : '#ffffff',
            borderTopColor: isDarkDevice ? '#334155' : '#e5e7eb',
            borderTopWidth: 1,
            height: 52 + insets.bottom,
            paddingBottom: insets.bottom + 2,
            paddingTop: 4,
          },
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '600',
          },
          headerStyle: {
            backgroundColor: '#1c2d4f',
          },
          headerTitleAlign: 'left',
          headerTintColor: '#fff',
          headerLeft: () => (
            <Pressable
              style={{ marginLeft: 15, position: 'relative' }}
              onPress={() => setMenuVisible(true)}
            >
              <IconSymbol name="line.3.horizontal" size={28} color="#fff" />
            </Pressable>
          ),
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: t('tabHome'),
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="house.fill" color={color} />,
            headerRight: () => <HeaderRightToggle />
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: t('tabCalendar'),
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="stock"
          options={{
            title: t('tabStock'),
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="cube.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="ai"
          options={{
            title: 'Duno IA',
            tabBarIcon: ({ color }) => <IconSymbol size={24} name="sparkles" color={color} />,
          }}
        />
        <Tabs.Screen
          name="os/[id]"
          options={{
            title: 'OS',
            href: null,
          }}
        />
        <Tabs.Screen
          name="os/execute"
          options={{
            title: t('osExecute'),
            href: null,
          }}
        />
      </Tabs>

      <MenuModal
        visible={isMenuVisible}
        onClose={() => setMenuVisible(false)}
      />
    </>
  );
}
