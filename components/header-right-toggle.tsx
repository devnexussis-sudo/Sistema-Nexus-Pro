import { useI18n } from '@/services/i18n';
import { syncService } from '@/services/sync-service';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Switch, Text, View, Pressable, DeviceEventEmitter } from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useRouter } from 'expo-router';
import { supabase } from '@/services/supabase';

import { NotificationService } from '@/services/notification-service';

export function HeaderRightToggle() {
    const { t } = useI18n();
    const [isOfflineMode, setIsOfflineMode] = useState(syncService.isOfflineModeEnabled());
    const [isConnected, setIsConnected] = useState(true);
    const [isSyncing, setIsSyncing] = useState(syncService.getSyncingState());
    const [isLoading, setIsLoading] = useState(false);
    const [label, setLabel] = useState('');

    const [hasUnread, setHasUnread] = useState(false);
    const router = useRouter();

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
            const unreadFound = !error && data && data.length > 0;
            setHasUnread(unreadFound);

            // Sincroniza o ícone do app no sistema operacional do celular
            NotificationService.syncAppIconBadge().catch(() => {});
        } catch (e) {
            // quiet fail
        }
    };

    useEffect(() => {
        checkUnreadNotifications();
        
        // Proteção para plataformas (ex: Web) onde DeviceEventEmitter não existe
        // O AppLifecycleManager centraliza a escuta de notificações com filtro de user_id
        // e emite 'refreshNotifications', evitando conexões duplicadas ou vazamento de canais.
        const unNotif = DeviceEventEmitter?.addListener?.('refreshNotifications', checkUnreadNotifications);

        const unNet = NetInfo.addEventListener(s => setIsConnected(!!s.isConnected));
        const unQueue = syncService.subscribe(() => {
            setIsOfflineMode(syncService.isOfflineModeEnabled());
        });
        const unSync = syncService.subscribeSyncing((syncing) => {
            setIsSyncing(syncing);
            setLabel(syncing ? t('toggleSyncing') : '');
        });

        return () => { 
            unNet(); 
            unQueue(); 
            unSync(); 
            unNotif?.remove?.();
        };
    }, []);

    const isBusy = isLoading || isSyncing;
    const busyLabel = isSyncing ? t('toggleSyncing') : label;

    // newValue=true → ONLINE (switch right, green)
    // newValue=false → OFFLINE (switch left, red)
    const handleToggle = async (newValue: boolean) => {
        if (isBusy) return;

        if (!newValue) {
            // ══════════════════════════════════════════════
            // GOING OFFLINE
            // ══════════════════════════════════════════════
            if (!isConnected) {
                Alert.alert(
                    t('toggleOfflineNoNetTitle'),
                    t('toggleOfflineNoNetMsg'),
                    [{ text: t('homeUnderstood'), style: 'default' }]
                );
                return;
            }

            setIsLoading(true);
            setLabel(t('toggleDownloading'));
            try {
                // Enable offline mode first
                await syncService.toggleOfflineMode(true);
                setIsOfflineMode(true);

                // Download all orders + forms + templates
                const count = await syncService.prefetchTodayOrders((current, total) => {
                    setLabel(`${t('toggleDownloading')} ${current}/${total}`);
                });

                // Only show success after everything is actually downloaded
                Alert.alert(
                    t('toggleOfflineActiveTitle'),
                    count > 0
                        ? t('toggleOfflineActiveMsg').replace('%n', String(count))
                        : t('toggleOfflineEmptyMsg'),
                    [{ text: t('homeUnderstood'), style: 'default' }]
                );
            } catch (_) {
                // Download failed — revert to online
                await syncService.toggleOfflineMode(false);
                setIsOfflineMode(false);
                Alert.alert(
                    t('toggleOfflineFailTitle'),
                    t('toggleOfflineFailMsg')
                );
            } finally {
                setIsLoading(false);
                setLabel('');
            }
        } else {
            // ══════════════════════════════════════════════
            // GOING ONLINE
            // ══════════════════════════════════════════════
            setIsLoading(true);
            setLabel(t('toggleTestingConnection'));

            try {
                // Step 1: Test connection quality with real round-trip
                const isStable = await syncService.testConnectionQuality();
                if (!isStable) {
                    Alert.alert(
                        t('toggleUnstableTitle'),
                        t('toggleUnstableMsg'),
                        [{ text: t('homeUnderstood'), style: 'default' }]
                    );
                    return; // Do NOT switch to online
                }

                // Step 2: Check if there are pending tasks to sync
                const queue = await syncService.getQueue();
                const pendingCount = queue.filter(task => task.status === 'pending' || task.status === 'error').length;

                if (pendingCount > 0) {
                    // Step 3: Sync pending tasks
                    setLabel(t('toggleSyncing'));

                    const result = await syncService.safeSyncBeforeOnline();

                    if (result.failed > 0) {
                        // Some tasks failed — keep offline, cache preserved
                        Alert.alert(
                            t('toggleSyncFailTitle'),
                            t('toggleSyncFailMsg')
                                .replace('%s', String(result.success))
                                .replace('%f', String(result.failed)),
                            [{ text: t('homeUnderstood'), style: 'default' }]
                        );
                        return; // Stay offline — cache preserved
                    }
                }

                // Step 4: Everything synced (or nothing to sync) — go online
                setIsOfflineMode(false);
                await syncService.toggleOfflineMode(false);

                Alert.alert(
                    t('toggleOnlineTitle'),
                    pendingCount > 0
                        ? t('toggleOnlineSyncedMsg')
                        : t('toggleOnlineMsg'),
                    [{ text: t('toggleOnlineOk'), style: 'default' }]
                );
            } catch (err: any) {
                console.error('[HeaderRightToggle] Erro ao alternar para Online:', err);
                Alert.alert('Erro ao ativar Modo Online', err?.message || 'Falha ao sincronizar dados. Tente novamente.');
            } finally {
                setIsLoading(false);
                setLabel('');
            }
        }
    };

    const isOnline = !isOfflineMode;

    return (
        <View style={styles.container}>
            {/* Notification Bell */}
            <Pressable 
                onPress={() => router.push('/notifications')} 
                style={styles.bellContainer}
                hitSlop={15}
            >
                <IconSymbol name="bell.fill" size={22} color="#cbd5e1" />
                {hasUnread && (
                    <View style={styles.unreadBadge} />
                )}
            </Pressable>

            {isBusy ? (
                <View style={[styles.pill, { borderColor: '#f59e0b', paddingHorizontal: 8 }]}>
                    <ActivityIndicator size="small" color="#f59e0b" />
                    <Text style={[styles.statusLabel, { color: '#f59e0b', marginLeft: 5 }]}>{busyLabel}</Text>
                </View>
            ) : (
                <View style={styles.pill}>
                    <Text style={styles.statusLabel}>
                        {isOnline ? 'Online' : 'Offline'}
                    </Text>
                    <Switch
                        trackColor={{ false: '#ef4444', true: '#10b981' }}
                        thumbColor="#ffffff"
                        ios_backgroundColor="#ef4444"
                        onValueChange={handleToggle}
                        value={isOnline}
                        disabled={isBusy}
                        style={{ transform: [{ scaleX: 0.9 }, { scaleY: 0.9 }] }}
                    />
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginRight: 16,
        flexDirection: 'row',
        alignItems: 'center',
    },
    bellContainer: {
        marginRight: 14,
        position: 'relative',
        justifyContent: 'center',
    },
    unreadBadge: {
        position: 'absolute',
        top: -3,
        right: -2,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#ef4444',
        borderWidth: 2,
        borderColor: '#1c2d4f',
    },
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.12)',
        borderRadius: 20,
        paddingLeft: 7,
        paddingRight: 0,
        paddingVertical: 0,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 4,
    },
    statusLabel: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 0.2,
        color: 'rgba(255,255,255,0.9)',
    },
});
