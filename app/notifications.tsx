import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { supabase } from '@/services/supabase';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useI18n } from '@/services/i18n';

export default function NotificationsScreen() {
    const router = useRouter();
    const { t } = useI18n();
    const [notifications, setNotifications] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const LIMIT = 15;

    useEffect(() => {
        fetchNotifications(0);
    }, []);

    const fetchNotifications = async (pageIndex: number) => {
        try {
            if (pageIndex === 0) setLoading(true);
            else setLoadingMore(true);

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

            const unreadIds = fetchedData.filter(n => !n.is_read && n.user_id === session.user.id).map(n => n.id);
            if (unreadIds.length > 0) {
                await supabase.from('notifications').update({ is_read: true }).in('id', unreadIds);
            }
        } catch (error) {
            console.error('Error fetching notifications:', error);
        } finally {
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

    const renderItem = ({ item }: { item: any }) => (
        <View style={[styles.card, !item.is_read ? styles.unreadCard : null]}>
            <View style={styles.cardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="notifications" size={18} color={!item.is_read ? '#6366f1' : '#94a3b8'} />
                    <Text style={[styles.title, !item.is_read && styles.unreadTitle]}>{item.title}</Text>
                </View>
                {!item.is_read && <View style={styles.unreadDot} />}
            </View>
            <Text style={styles.body}>{item.body}</Text>
            <View style={styles.footer}>
                <Ionicons name="time-outline" size={12} color="#94a3b8" />
                <Text style={styles.date}>{formatDate(item.created_at)}</Text>
            </View>
        </View>
    );

    return (
        <ThemedView style={styles.container}>
            <View style={styles.header}>
                <Pressable onPress={() => router.back()} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={24} color="#1c2d4f" />
                </Pressable>
                <ThemedText type="title" style={styles.headerTitle}>Notificações</ThemedText>
                <View style={{ width: 24 }} />
            </View>

            {loading ? (
                <View style={styles.centerContainer}>
                    <ActivityIndicator size="large" color="#1c2d4f" />
                </View>
            ) : notifications.length === 0 ? (
                <View style={styles.centerContainer}>
                    <Ionicons name="notifications-off-outline" size={48} color="#cbd5e1" />
                    <Text style={styles.emptyText}>Nenhuma notificação encontrada.</Text>
                </View>
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={(item) => item.id}
                    renderItem={renderItem}
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
    }
});
