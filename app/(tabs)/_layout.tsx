
import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Pressable } from 'react-native';

import { HapticTab } from '@/components/haptic-tab';
import { HeaderRightToggle } from '@/components/header-right-toggle';
import { MenuModal } from '@/components/menu-modal';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  const [isMenuVisible, setMenuVisible] = useState(false);

  return (
    <>
      <Tabs
        screenOptions={{
          tabBarActiveTintColor: '#1c2d4f',
          headerShown: true,
          tabBarButton: HapticTab,
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
          headerRight: () => <HeaderRightToggle />
        }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Home',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="house.fill" color={color} />,
          }}
        />
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendário',
            tabBarIcon: ({ color }) => <IconSymbol size={28} name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="stock"
          options={{
            title: 'Estoque',
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
