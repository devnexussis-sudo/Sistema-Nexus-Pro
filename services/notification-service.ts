import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { Platform } from 'react-native';

// Configuração Global de Handler
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
    }),
});

export const NotificationService = {

    /**
     * Registra o dispositivo para receber Push Notifications e salva o token no Supabase.
     */
    async registerForPushNotificationsAsync() {
        let token;

        if (Platform.OS === 'android') {
            await Notifications.setNotificationChannelAsync('default', {
                name: 'default',
                importance: Notifications.AndroidImportance.MAX,
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

            // Obtém o token do Expo
            const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;

            try {
                token = (await Notifications.getExpoPushTokenAsync({
                    projectId: projectId
                })).data;
                console.log('Expo Push Token:', token);

                // Salvar Token no Supabase se houver usuário logado
                const { data: { user } } = await supabase.auth.getUser();
                if (user && token) {
                    const { error } = await supabase.from('user_push_tokens').upsert({
                        user_id: user.id,
                        token: token,
                        platform: Platform.OS,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'user_id, token' });

                    if (error) console.error("Erro ao salvar token de push:", error);
                }
            } catch (e) {
                console.error("Erro ao obter push token:", e);
            }
        } else {
            console.log('Must use physical device for Push Notifications');
        }

        return token;
    },

    /**
     * Agenda lembretes locais para uma Ordem de Serviço (30min e 60min antes)
     */
    async scheduleOrderReminders(orderId: string, scheduledDate: string, scheduledTime: string, displayId: string) {
        if (!scheduledDate || !scheduledTime) return;

        try {
            // Concatena data e hora corretamente considerando timezone local ou UTC
            // Assumindo input 'YYYY-MM-DD' e 'HH:MM'
            const dateStr = `${scheduledDate}T${scheduledTime}:00`;
            const scheduledDateTime = new Date(dateStr);

            // Verifica se data é válida
            if (isNaN(scheduledDateTime.getTime())) return;

            const now = new Date();

            // Lembrete 60 min (1h) antes
            const time60 = new Date(scheduledDateTime.getTime() - 60 * 60 * 1000);
            if (time60 > now) {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: `⏰ Lembrete: OS #${displayId}`,
                        body: `Falta 1 hora para o atendimento agendado.`,
                        data: { orderId, type: 'REMINDER_60' },
                        sound: true
                    },
                    trigger: { date: time60 },
                    identifier: `reminder-60-${orderId}`
                });
            }

            // Lembrete 30 min antes
            const time30 = new Date(scheduledDateTime.getTime() - 30 * 60 * 1000);
            if (time30 > now) {
                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: `🚀 Prepare-se: OS #${displayId}`,
                        body: `Seu atendimento começa em 30 minutos!`,
                        data: { orderId, type: 'REMINDER_30' },
                        sound: true
                    },
                    trigger: { date: time30 },
                    identifier: `reminder-30-${orderId}`
                });
            }
        } catch (e) {
            console.error("Erro ao agendar lembrete:", e);
        }
    },

    /**
     * Cancela lembretes agendados para uma OS (útil se cancelada ou reagendada)
     */
    async cancelOrderReminders(orderId: string) {
        await Notifications.cancelScheduledNotificationAsync(`reminder-60-${orderId}`);
        await Notifications.cancelScheduledNotificationAsync(`reminder-30-${orderId}`);
    },

    /**
     * Agenda notificação de nova OS (chamada quando recebe evento realtime)
     */
    async triggerLocalNotification(title: string, body: string, data: any = {}) {
        await Notifications.scheduleNotificationAsync({
            content: {
                title,
                body,
                data,
                sound: true
            },
            trigger: null, // Imediato
        });
    }
};
