import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
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
                await Notifications.setNotificationChannelAsync('default', {
                    name: 'default',
                    importance: Notifications.AndroidImportance?.MAX,
                    vibrationPattern: [0, 250, 250, 250],
                    lightColor: '#FF231F7C',
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
                        sound: true
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
                        sound: true
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
                    channelId: 'default'
                },
                trigger: null,
            });
        } catch (e) {
            console.error("Erro ao disparar notificação local:", e);
        }
    }
};
