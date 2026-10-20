import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Platform, Pressable, StyleSheet, Text, View, DeviceEventEmitter, Linking } from 'react-native';
import { useI18n } from '@/services/i18n';
import Constants from 'expo-constants';

// Importação condicional do expo-notifications (crash no Expo Go Android)
const isExpoGoAndroid = Platform.OS === 'android' && Constants.appOwnership === 'expo';
const Notifications = isExpoGoAndroid ? null : require('expo-notifications');

import { NotificationService } from '@/services/notification-service';
import { systemAnnouncementService, SystemAnnouncement } from '@/services/system-announcement-service';

export default function NotificationsScreen() {
    const router = useRouter();
    const { t } = useI18n();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [systemAnnouncements, setSystemAnnouncements] = useState<SystemAnnouncement[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 15;

    useEffect(() => {
        fetchNotifications(0);

        const unAnnounce = systemAnnouncementService.subscribe(() => {
            loadAnnouncements();
        });

        return () => {
            unAnnounce();
        };
    }, []);

    const loadAnnouncements = async () => {
        try {
            const list = await systemAnnouncementService.fetchAnnouncements();
            setSystemAnnouncements(list);
        } catch (_) {}
    };

    const fetchNotifications = async (pageIndex: number) => {
        const startTime = Date.now();
        try {
            if (pageIndex === 0) setLoading(true);
            else setLoadingMore(true);

            // Carrega também os comunicados do sistema no início
            if (pageIndex === 0) {
                await loadAnnouncements();
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;

            const sixMonthsAgo = new Date();
            sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
            const limitDate = sixMonthsAgo.toISOString();

            const from = pageIndex * LIMIT;
            const to = from + LIMIT - 1;

            const { data, error } = await supabase
                .from('notifications')
                .select('*')
                .or(`user_id.eq.${session.user.id},user_id.is.null`)
                .gte('created_at', limitDate)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) throw error;
            
            const fetchedData = data || [];
            
            if (pageIndex === 0) {
                setNotifications(fetchedData);
            } else {
                setNotifications(prev => [...prev, ...fetchedData]);
            }
            
            setHasMore(fetchedData.length === LIMIT);
            setPage(pageIndex);

            const unreadIds = fetchedData.filter(n => !n.is_read).map(n => n.id);
            if (unreadIds.length > 0) {
                // Marca as notificações lidas no Supabase
                await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
                DeviceEventEmitter?.emit?.('refreshNotifications');
            }
            // Zera o badge no ícone do sistema operacional do celular (iOS e Android)
            await NotificationService.clearAppIconBadge();
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, 1000 - elapsed);
            if (remaining > 0 && pageIndex === 0) {
                await new Promise(resolve => setTimeout(resolve, remaining));
            }
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const handleLoadMore = () => {
        if (!loading && !loadingMore && hasMore) {
            fetchNotifications(page + 1);
        }
    };

    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    };

    const handleNotificationPress = (item: any) => {
        if (!item.is_read) {
            item.is_read = true;
            NotificationService.markNotificationAsRead(item.id).catch(() => {});
        }
        if (item.data && item.data.orderId) {
            NotificationService.markOrderNotificationsAsRead(item.data.orderId).catch(() => {});
            router.push(`/os/${item.data.orderId}`);
        }
    };

    const handleAnnouncementAction = async (item: SystemAnnouncement) => {
        await systemAnnouncementService.markAsRead(item.id);
        if (item.actionUrl) {
            try {
                await Linking.openURL(item.actionUrl);
            } catch (e) {
                console.error('Erro ao abrir link do comunicado:', e);
            }
        }
        loadAnnouncements();
    };

    const handleDismissAnnouncement = async (item: SystemAnnouncement) => {
        await systemAnnouncementService.markAsRead(item.id);
        loadAnnouncements();
    };

    const renderAnnouncementCard = (item: SystemAnnouncement) => {
        const isUrgent = item.priority === 'urgent';
        const isWarning = item.priority === 'warning';

        const borderColor = isUrgent ? '#ef4444' : isWarning ? '#f59e0b' : '#3b82f6';
        const badgeBg = isUrgent ? '#fee2e2' : isWarning ? '#fef3c7' : '#dbeafe';
        const badgeColor = isUrgent ? '#b91c1c' : isWarning ? '#b45309' : '#1d4ed8';
        const iconName = isUrgent ? 'alert-circle' : isWarning ? 'warning' : 'megaphone';

        return (
            <View key={item.id} style={[styles.announcementCard, { borderLeftColor: borderColor }]}>
                <View style={styles.cardHeader}>
                    <View style={[styles.announcementBadge, { backgroundColor: badgeBg }]}>
                        <Ionicons name={iconName} size={14} color={badgeColor} />
                        <Text style={[styles.announcementBadgeText, { color: badgeColor }]}>
                            {isUrgent ? 'COMUNICADO URGENTE' : isWarning ? 'AVISO DO SISTEMA' : 'ATUALIZAÇÃO'}
                        </Text>
                    </View>
                    {!item.isRead ? (
                        <View style={styles.newBadge}>
                            <Text style={styles.newBadgeText}>NOVO</Text>
                        </View>
                    ) : (
                        <Text style={styles.readStatusText}>Lido</Text>
                    )}
                </View>

                <Text style={styles.announcementTitle}>{item.title}</Text>
                <Text style={styles.announcementContent}>{item.content}</Text>

                <View style={styles.announcementActions}>
                    {item.actionUrl ? (
                        <Pressable
                            style={[styles.announcementPrimaryBtn, { backgroundColor: borderColor }]}
                            onPress={() => handleAnnouncementAction(item)}
                        >
                            <Ionicons name="arrow-down-circle-outline" size={16} color="#fff" />
                            <Text style={styles.announcementPrimaryBtnText}>
                                {item.actionLabel || 'Baixar Atualização'}
                            </Text>
                        </Pressable>
                    ) : null}

                    {!item.isRead ? (
                        <Pressable
                            style={styles.announcementDismissBtn}
                            onPress={() => handleDismissAnnouncement(item)}
                        >
                            <Ionicons name="checkmark-done" size={16} color="#64748b" />
                            <Text style={styles.announcementDismissBtnText}>Marcar como lido</Text>
                        </Pressable>
                    ) : null}
                </View>

                <View style={styles.footer}>
                    <Ionicons name="time-outline" size={12} color="#94a3b8" />
                    <Text style={styles.date}>{formatDate(item.createdAt)}</Text>
                </View>
            </View>
        );
    };

    const renderHeaderComponent = () => {
        if (systemAnnouncements.length === 0) return null;

        return (
            <View style={styles.announcementsSection}>
                <View style={styles.sectionHeader}>
                    <Ionicons name="megaphone-outline" size={18} color="#1c2d4f" />
                    <Text style={styles.sectionTitle}>Comunicados e Atualizações</Text>
                </View>
                {systemAnnouncements.map(renderAnnouncementCard)}
                {notifications.length > 0 && (
                    <View style={[styles.sectionHeader, { marginTop: 12 }]}>
                        <Ionicons name="list-outline" size={18} color="#1c2d4f" />
                        <Text style={styles.sectionTitle}>Histórico de Ordens de Serviço</Text>
                    </View>
                )}
            </View>
        );
    };

    const renderItem = ({ item }: { item: any }) => {
        let title = item.title;
        let body = item.body;

        if (title) {
            if (title.includes('Nova OS Atribuída')) title = t('homeNewOsNotif');
            else if (title.includes('Alteração de Agendamento')) title = t('notifTitleRescheduled');
            else if (title.includes('OS Alterada')) title = t('notifTitleAltered');
            else if (title.includes('OS Agendada')) title = t('notifTitleScheduled');
            else if (title.includes('OS Cancelada')) title = t('notifTitleCanceled');
        }
        
        if (body) {
            if (body.includes('Você recebeu uma nova Ordem de Serviço')) {
                body = body.replace(/Você recebeu uma nova Ordem de Serviço:?/g, t('homeNewOsNotifBody'));
            } else if (body.includes('foi atribuída a você')) {
                const match = body.match(/OS (.*?) foi atribuída/i);
                if (match && match[1]) {
                    body = t('notifBodyAssignedToYou').replace('%s', match[1].trim());
                }
            } else if (body.includes('horário da OS')) {
                const match = body.match(/OS (.*?) foi alterado/i);
                if (match && match[1]) {
                    body = t('notifBodyRescheduled').replace('%s', match[1].trim());
                }
            } else if (body.includes('Ordem de Serviço foi alterada')) {
                body = body.replace(/A? ?Ordem de Serviço foi alterada:?/g, t('notifBodyAltered'));
            } else if (body.includes('Ordem de Serviço foi agendada')) {
                body = body.replace(/A? ?Ordem de Serviço foi agendada para:?/g, t('notifBodyScheduled'));
            } else if (body.includes('Ordem de Serviço foi cancelada')) {
                body = body.replace(/A? ?Ordem de Serviço foi cancelada:?/g, t('notifBodyCanceled'));
            }
        }

        return (
            <Pressable 
                style={[styles.card, !item.is_read ? styles.unreadCard : null]}
                onPress={() => handleNotificationPress(item)}
            >
                <View style={styles.cardHeader}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Ionicons name="notifications" size={18} color={!item.is_read ? '#6366f1' : '#94a3b8'} />
                        <Text style={[styles.title, !item.is_read && styles.unreadTitle]}>{title}</Text>
                    </View>
                    {!item.is_read && <View style={styles.unreadDot} />}
                </View>
                <Text style={styles.body}>{body}</Text>
                <View style={styles.footer}>
                    <Ionicons name="time-outline" size={12} color="#94a3b8" />
                    <Text style={styles.date}>{formatDate(item.created_at)}</Text>
                </View>
            </Pressable>
        );
    };

    const hasAnyContent = notifications.length > 0 || systemAnnouncements.length > 0;

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen options={{ title: t('notificationsTitle') }} />

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#1c2d4f" />
                </View>
            ) : !hasAnyContent ? (
                <View style={styles.centerContainer}>
                    <Ionicons name="notifications-off-outline" size={48} color="#cbd5e1" />
                    <Text style={styles.emptyText}>{t('notificationsEmpty')}</Text>
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
                    ListHeaderComponent={renderHeaderComponent}
                    contentContainerStyle={styles.listContainer}
                    onEndReached={handleLoadMore}
                    onEndReachedThreshold={0.5}
                    ListFooterComponent={
                        loadingMore ? (
                            <View style={{ paddingVertical: 20 }}>
                                <ActivityIndicator size="small" color="#1c2d4f" />
                            </View>
                        ) : null
                    }
                />
            )}
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f5f7fa',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 20,
        paddingTop: 60,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    backButton: {
        padding: 8,
        marginLeft: -8,
    },
    headerTitle: {
        fontSize: 20,
        color: '#1c2d4f',
    },
    centerContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    emptyText: {
        marginTop: 12,
        color: '#94a3b8',
        fontSize: 16,
    },
    listContainer: {
        padding: 16,
        gap: 12,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    unreadCard: {
        borderLeftWidth: 4,
        borderLeftColor: '#6366f1',
    },
    cardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 8,
    },
    title: {
        fontSize: 16,
        fontWeight: '600',
        color: '#334155',
    },
    unreadTitle: {
        color: '#1e293b',
        fontWeight: '700',
    },
    unreadDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: '#6366f1',
    },
    body: {
        fontSize: 14,
        color: '#64748b',
        lineHeight: 20,
        marginBottom: 12,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    date: {
        fontSize: 12,
        color: '#94a3b8',
    },
    announcementsSection: {
        marginBottom: 16,
        gap: 12,
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginBottom: 4,
        marginTop: 4,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    announcementCard: {
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 16,
        borderLeftWidth: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
    },
    announcementBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    announcementBadgeText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.3,
    },
    newBadge: {
        backgroundColor: '#ef4444',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
    },
    newBadgeText: {
        color: '#fff',
        fontSize: 10,
        fontWeight: '800',
    },
    readStatusText: {
        fontSize: 12,
        color: '#94a3b8',
    },
    announcementTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: '#0f172a',
        marginTop: 10,
        marginBottom: 6,
    },
    announcementContent: {
        fontSize: 14,
        color: '#334155',
        lineHeight: 20,
        marginBottom: 14,
    },
    announcementActions: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    announcementPrimaryBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 9,
        paddingHorizontal: 14,
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    announcementPrimaryBtnText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 13,
    },
    announcementDismissBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingVertical: 9,
        paddingHorizontal: 12,
        borderRadius: 8,
        backgroundColor: '#f1f5f9',
    },
    announcementDismissBtnText: {
        color: '#475569',
        fontWeight: '600',
        fontSize: 13,
    },
});
