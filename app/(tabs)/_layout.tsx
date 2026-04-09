
import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Pressable, useColorScheme as useDeviceColorScheme } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { HeaderRightToggle } from '@/components/header-right-toggle';
import { MenuModal } from '@/components/menu-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useI18n } from '@/services/i18n';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const deviceTheme = useDeviceColorScheme();
  const isDarkDevice = deviceTheme === 'dark';
  const [isMenuVisible, setMenuVisible] = useState(false);
  const { t } = useI18n();

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
          },
          headerStyle: {
            backgroundColor: '#1c2d4f',
          },
          headerTintColor: '#fff',
          headerLeft: () => (
            <Pressable
              style={{ marginLeft: 15 }}
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
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
            headerRight: () => <HeaderRightToggle />
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: t('tabCalendar'),
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="stock"
          options={{
            title: t('tabStock'),
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="cube.fill" color={color} />,
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
