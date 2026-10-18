import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform, DeviceEventEmitter } from 'react-native';
import { supabase } from './supabase';

// No SDK 55, o pacote expo-notifications causa crash imediato no Android se rodar via Expo Go.
// Usamos require condicional para evitar que a importação estática quebre o registro de rotas.
const isExpoGoAndroid = Platform.OS === 'android' && Constants.appOwnership === 'expo';
const Notifications = isExpoGoAndroid ? null : require('expo-notifications');

// Configuração Global de Handler - Apenas se não for Expo Go Android
if (Notifications && Notifications.setNotificationHandler) {
    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowAlert: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
            shouldShowBanner: true,
            shouldShowList: true
        }),
    });
}

export const NotificationService = {

    /**
     * Registra o dispositivo para receber Push Notifications e salva o token no Supabase.
     */
    async registerForPushNotificationsAsync() {
        if (isExpoGoAndroid || !Notifications) {
            console.log('Skipping push notification registration on Android Expo Go.');
            return null;
        }

        let token;

        try {
            if (Platform.OS === 'android') {
                await Notifications.setNotificationChannelAsync('nexus-alerts', {
                    name: 'Alertas Nexus',
                    importance: Notifications.AndroidImportance?.MAX,
                    vibrationPattern: [0, 250, 250, 250, 500, 250, 250, 250],
                    lightColor: '#FF231F7C',
                    sound: 'default',
                    enableVibrate: true,
                    bypassDnd: true, // Força a tocar mesmo em Não Perturbe
                });
            }

            if (Device.isDevice) {
                const { status: existingStatus } = await Notifications.getPermissionsAsync();
                let finalStatus = existingStatus;

                if (existingStatus !== 'granted') {
                    const { status } = await Notifications.requestPermissionsAsync();
                    finalStatus = status;
                }

                if (finalStatus !== 'granted') {
                    console.log('Permissão de notificações negada!');
                    return null;
                }

                const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

                if (!projectId) {
                    console.log('Push notifications (Expo) desativadas: projectId não encontrado.');
                    return null;
                }

                token = (await Notifications.getExpoPushTokenAsync({
                    projectId: projectId
                })).data;
                console.log('Expo Push Token:', token);

                const { data: { user } } = await supabase.auth.getUser();
                if (user && token) {
                    const { error } = await supabase.from('user_push_tokens').upsert({
                        user_id: user.id,
                        token: token,
                        platform: Platform.OS,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id, token' });

                    if (error) console.log("Erro ao salvar token de push:", error);
                }
            }
        } catch (e) {
            console.log("Aviso: Erro ao gerenciar push notifications:", e);
        }

        return token;
    },

    /**
     * Agenda lembretes locais para uma Ordem de Serviço (30min e 60min antes)
     */
    async scheduleOrderReminders(orderId: string, scheduledDate: string, scheduledTime: string, displayId: string) {
        if (isExpoGoAndroid || !Notifications || !scheduledDate || !scheduledTime) return;

        try {
            const dateStr = `${scheduledDate}T${scheduledTime}:00`;
            const scheduledDateTime = new Date(dateStr);
            if (isNaN(scheduledDateTime.getTime())) return;

            const now = new Date();

            // Lembrete 60 min
            const time60 = new Date(scheduledDateTime.getTime() - 60 * 60 * 1000);
            if (time60 > now) {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: `⏰ Lembrete: OS #${displayId}`,
                        body: `Falta 1 hora para o atendimento agendado.`,
                        data: { orderId, type: 'REMINDER_60' },
                        sound: true,
                        priority: Notifications.AndroidNotificationPriority?.MAX,
                        channelId: 'nexus-alerts'
                    },
                    trigger: { type: Notifications.SchedulableTriggerInputTypes?.DATE, date: time60 },
                    identifier: `reminder-60-${orderId}`
                });
            }

            // Lembrete 30 min
            const time30 = new Date(scheduledDateTime.getTime() - 30 * 60 * 1000);
            if (time30 > now) {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: `🚀 Prepare-se: OS #${displayId}`,
                        body: `Seu atendimento começa em 30 minutos!`,
                        data: { orderId, type: 'REMINDER_30' },
                        sound: true,
                        priority: Notifications.AndroidNotificationPriority?.MAX,
                        channelId: 'nexus-alerts'
                    },
                    trigger: { type: Notifications.SchedulableTriggerInputTypes?.DATE, date: time30 },
                    identifier: `reminder-30-${orderId}`
                });
            }
        } catch (e) {
            console.error("Erro ao agendar lembrete:", e);
        }
    },

    async cancelOrderReminders(orderId: string) {
        if (isExpoGoAndroid || !Notifications) return;
        await Notifications.cancelScheduledNotificationAsync(`reminder-60-${orderId}`);
        await Notifications.cancelScheduledNotificationAsync(`reminder-30-${orderId}`);
    },

    async triggerLocalNotification(title: string, body: string, data: any = {}) {
        if (isExpoGoAndroid || !Notifications) return;
        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title,
                    body,
                    data,
                    sound: true,
                    priority: Notifications.AndroidNotificationPriority?.MAX,
                    channelId: 'nexus-alerts'
                },
                trigger: null,
            });
        } catch (e) {
            console.error("Erro ao disparar notificação local:", e);
        }
    },

    /**
     * Alias for triggerLocalNotification (backward compatibility).
     * Some older code references this as showLocalNotification.
     */
    async showLocalNotification(title: string, body: string, data: any = {}) {
        return this.triggerLocalNotification(title, body, data);
    },

    /**
     * Remove incondicionalmente a bolinha (badge) do ícone do aplicativo e limpa a bandeja de notificações.
     */
    async clearAppIconBadge() {
        if (isExpoGoAndroid || !Notifications) return;
        try {
            await Notifications.setBadgeCountAsync(0).catch(() => {});
            await Notifications.dismissAllNotificationsAsync().catch(() => {});
        } catch (e) {}
    },

    /**
     * Sincroniza a bolinha/badge do ícone do aplicativo (no celular) com o número REAL de notificações não lidas DO USUÁRIO.
     * Se 0 -> remove a bolinha do ícone no Android e iOS e descarta notificações da bandeja do sistema.
     */
    async syncAppIconBadge() {
        if (isExpoGoAndroid || !Notifications) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) {
                await this.clearAppIconBadge();
                return;
            }

            // Busca notificações não lidas deste usuário
            const { count, error } = await supabase
                .from('notifications')
                .select('id', { count: 'exact', head: true })
                .eq('is_read', false)
                .or(`user_id.eq.${session.user.id},user_id.is.null`);

            const unreadCount = (!error && typeof count === 'number') ? count : 0;

            if (unreadCount <= 0) {
                await this.clearAppIconBadge();
            } else {
                await Notifications.setBadgeCountAsync(unreadCount).catch(() => {});
            }
        } catch (e) {
            await this.clearAppIconBadge();
        }
    },

    /**
     * Marca como lidas todas as notificações relacionadas a uma Ordem de Serviço específica
     * e recalcula/zera a bolinha do app imediatamente.
     */
    async markOrderNotificationsAsRead(orderId: string) {
        if (!orderId) return;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;

            const orderIdStr = String(orderId);

            // Busca notificações não lidas desta OS vinculadas ao usuário
            const { data: notifs } = await supabase
                .from('notifications')
                .select('id')
                .eq('is_read', false)
                .or(`user_id.eq.${session.user.id},user_id.is.null`)
                .eq('data->>orderId', orderIdStr);

            if (notifs && notifs.length > 0) {
                const ids = notifs.map(n => n.id);
                await supabase
                    .from('notifications')
                    .update({ is_read: true })
                    .in('id', ids);

                DeviceEventEmitter?.emit?.('refreshNotifications');
            }

            // Sincroniza e zera a badge se todas as notificações tiverem sido vistas
            await this.syncAppIconBadge();
        } catch (err) {
            console.warn('[NotificationService] markOrderNotificationsAsRead error:', err);
        }
    },

    /**
     * Marca uma notificação individual como lida e sincroniza a bolinha do ícone.
     */
    async markNotificationAsRead(notificationId: string) {
        if (!notificationId) return;
        try {
            await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('id', notificationId);

            DeviceEventEmitter?.emit?.('refreshNotifications');
            await this.syncAppIconBadge();
        } catch (err) {
            console.warn('[NotificationService] markNotificationAsRead error:', err);
        }
    },

    /**
     * Marca TODAS as notificações do usuário como lidas e zera instantaneamente o badge no ícone.
     */
    async markAllAsRead() {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;

            await supabase
                .from('notifications')
                .update({ is_read: true })
                .eq('is_read', false)
                .or(`user_id.eq.${session.user.id},user_id.is.null`);

            DeviceEventEmitter?.emit?.('refreshNotifications');
            await this.clearAppIconBadge();
        } catch (err) {
            console.warn('[NotificationService] markAllAsRead error:', err);
        }
    },

    /**
     * Trata o clique/abertura de uma notificação (no iOS e Android).
     * Descarta a notificação da bandeja imediatamente e atualiza/zera o badge.
     */
    async handleNotificationResponse(response: any) {
        if (!response) return;
        try {
            const identifier = response?.notification?.request?.identifier;
            if (identifier && Notifications && typeof Notifications.dismissNotificationAsync === 'function') {
                await Notifications.dismissNotificationAsync(identifier).catch(() => {});
            }

            const data = response?.notification?.request?.content?.data;
            const orderId = data?.orderId;
            const notifId = data?.notificationId || data?.id;

            if (orderId) {
                await this.markOrderNotificationsAsRead(String(orderId));
            } else if (notifId) {
                await this.markNotificationAsRead(String(notifId));
            } else {
                await this.syncAppIconBadge();
            }
        } catch (e) {
            console.warn('[NotificationService] handleNotificationResponse error:', e);
        }
    },
};
