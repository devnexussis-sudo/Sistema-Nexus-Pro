
import { Tabs } from 'expo-router';
import { useState } from 'react';
import { Pressable, View, useColorScheme as useDeviceColorScheme } from 'react-native';

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
  const [hasUnread, setHasUnread] = useState(false);
  const { t } = useI18n();

  const checkUnreadNotifications = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) return;
      
      const { data, error } = await supabase
        .from('notifications')
        .select('id')
        .eq('is_read', false)
        .or(`user_id.eq.${session.user.id},user_id.is.null`)
        .limit(1);
        
      if (!error && data && data.length > 0) {
        setHasUnread(true);
      } else {
        setHasUnread(false);
      }
    } catch (e) {
      // quiet fail
    }
  };

  useFocusEffect(
    useCallback(() => {
      checkUnreadNotifications();
    }, [])
  );

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
              style={{ marginLeft: 15, position: 'relative' }}
              onPress={() => setMenuVisible(true)}
            >
              <IconSymbol name="line.3.horizontal" size={28} color="#fff" />
              {hasUnread && (
                <View style={{
                  position: 'absolute',
                  top: -2,
                  right: -2,
                  width: 10,
                  height: 10,
                  borderRadius: 5,
                  backgroundColor: '#ef4444',
                  borderWidth: 2,
                  borderColor: '#1c2d4f'
                }} />
              )}
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
        onClose={() => {
          setMenuVisible(false);
          checkUnreadNotifications();
        }}
        hasUnread={hasUnread}
      />
    </>
  );
}
