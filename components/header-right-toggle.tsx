import { useI18n } from '@/services/i18n';
import { syncService, SyncTask, DetailedSyncProgress } from '@/services/sync-service';
import { modeHUDService, ModeHUDState } from '@/services/mode-hud-service';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    View,
    DeviceEventEmitter,
} from 'react-native';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/services/supabase';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NotificationService } from '@/services/notification-service';
import { systemAnnouncementService } from '@/services/system-announcement-service';

export function HeaderRightToggle() {
    const { t } = useI18n();
    const insets = useSafeAreaInsets();
    const router = useRouter();

    const [isOfflineMode, setIsOfflineMode] = useState(syncService.isOfflineModeEnabled());
    const [optimisticOnline, setOptimisticOnline] = useState(!syncService.isOfflineModeEnabled());
    const [isConnected, setIsConnected] = useState(true);
    const [isSyncing, setIsSyncing] = useState(syncService.getSyncingState());
    const [isLoading, setIsLoading] = useState(false);
    const [hasUnread, setHasUnread] = useState(false);

    // Painel retrátil
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const panelAnimation = useRef(new Animated.Value(0)).current;

    // Fila e progresso detalhado
    const [queue, setQueue] = useState<SyncTask[]>([]);
    const [pendingCount, setPendingCount] = useState(0);
    const [syncProgress, setSyncProgress] = useState<DetailedSyncProgress>(syncService.getProgress());
    const [modeState, setModeState] = useState<ModeHUDState>(modeHUDService.getState());

    const isBusy = isLoading || isSyncing;
    const isOnline = optimisticOnline;

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
            const hasUnreadAnnouncement = await systemAnnouncementService.hasUnread();
            setHasUnread(Boolean(unreadFound || hasUnreadAnnouncement));

            NotificationService.syncAppIconBadge().catch(() => {});
        } catch {
            // quiet fail
        }
    };

    const refreshQueue = async () => {
        try {
            const q = await syncService.getQueue();
            setQueue(q);
            const pending = q.filter(task => task.status === 'pending' || task.status === 'error').length;
            setPendingCount(pending);
        } catch {
            // quiet fail
        }
    };

    const [ordersMap, setOrdersMap] = useState<Record<string, any>>({});

    const loadOrdersMap = async () => {
        try {
            const today = await syncService.getTodayOrders();
            const map: Record<string, any> = {};
            (today || []).forEach((o: any) => {
                if (o?.id) map[o.id] = o;
            });
            setOrdersMap(map);
        } catch (_) {}
    };

    const formatOrderDisplayTitle = (task: SyncTask): string => {
        const raw = task.payload?.displayId || task.payload?.display_id || task.payload?.os_number;
        if (raw && typeof raw === 'string' && raw.trim() !== '' && raw !== task.orderId && raw.length <= 25) {
            return raw.toUpperCase().startsWith('OS') ? raw : `OS-${raw}`;
        }
        const cached = ordersMap[task.orderId];
        if (cached?.displayId || cached?.display_id) {
            const d = String(cached.displayId || cached.display_id).trim();
            return d.toUpperCase().startsWith('OS') ? d : `OS-${d}`;
        }
        const shortId = task.orderId ? task.orderId.substring(0, 8).toUpperCase() : 'N/A';
        return `OS-${shortId}`;
    };

    useEffect(() => {
        checkUnreadNotifications();
        refreshQueue();
        loadOrdersMap();

        const unNotif = DeviceEventEmitter?.addListener?.('refreshNotifications', checkUnreadNotifications);
        const unNet = NetInfo.addEventListener(s => setIsConnected(!!s.isConnected));

        const unQueue = syncService.subscribe((updatedQueue) => {
            const offlineActive = syncService.isOfflineModeEnabled();
            setIsOfflineMode(offlineActive);
            setOptimisticOnline(!offlineActive);
            setQueue(updatedQueue);
            const pending = updatedQueue.filter(task => task.status === 'pending' || task.status === 'error').length;
            setPendingCount(pending);
        });

        const unSync = syncService.subscribeSyncing((syncing) => {
            setIsSyncing(syncing);
            refreshQueue();
        });

        const unProgress = syncService.subscribeProgress((progress) => {
            setSyncProgress(progress);
        });

        const unModeHUD = modeHUDService.subscribe((state) => {
            setModeState(state);
        });

        const unAnnounce = systemAnnouncementService.subscribe(() => {
            checkUnreadNotifications();
        });

        return () => {
            unNet();
            unQueue();
            unSync();
            unProgress();
            unModeHUD();
            unAnnounce();
            unNotif?.remove?.();
        };
    }, []);

    // Animação de abertura/recolhimento do painel
    const togglePanel = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        if (isPanelOpen) {
            closePanel();
        } else {
            openPanel();
        }
    };

    const openPanel = () => {
        setIsPanelOpen(true);
        Animated.timing(panelAnimation, {
            toValue: 1,
            duration: 200,
            useNativeDriver: true,
        }).start();
    };

    const closePanel = () => {
        Animated.timing(panelAnimation, {
            toValue: 0,
            duration: 160,
            useNativeDriver: true,
        }).start(() => {
            setIsPanelOpen(false);
        });
    };

    // Alternar modo online / offline
    const handleToggle = async (newValue: boolean) => {
        if (isLoading) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});

        // 🚀 Feedback instantâneo no toque: o switch e o label viram na mesma fração de segundo!
        setOptimisticOnline(newValue);
        setIsLoading(true);

        if (!newValue) {
            // ══════════════════════════════════════════════
            // GOING OFFLINE
            // ══════════════════════════════════════════════
            if (!isConnected) {
                const cachedOrders = await syncService.getTodayOrders();
                if (cachedOrders && cachedOrders.length > 0) {
                    await syncService.toggleOfflineMode(true);
                    setIsOfflineMode(true);
                    setOptimisticOnline(false);
                    DeviceEventEmitter.emit('offlineModeChanged', true);
                    modeHUDService.show({
                        type: 'offline',
                        status: 'success',
                        title: 'Modo Offline Ativado',
                        subtitle: `${cachedOrders.length} ordens disponíveis em cache local.`,
                    });
                    setIsLoading(false);
                    return;
                } else {
                    setOptimisticOnline(true);
                    setIsLoading(false);
                    modeHUDService.show({
                        type: 'offline',
                        status: 'error',
                        title: 'Sem Conexão',
                        subtitle: 'Conecte-se à internet para baixar suas Ordens de Serviço antes de ativar o modo offline.',
                    });
                    openPanel();
                    return;
                }
            }

            modeHUDService.show({
                type: 'offline',
                status: 'progress',
                title: 'Preparando Modo Offline...',
                subtitle: 'Baixando formulários, regras e OSs em andamento...',
                progress: 0.1,
            });

            try {
                const result = await syncService.prefetchAllForOffline((current, total, step) => {
                    modeHUDService.update({
                        subtitle: step || `Baixando dados ${current}/${total}...`,
                        progress: total > 0 ? current / total : undefined,
                    });
                });

                await syncService.toggleOfflineMode(true);
                setIsOfflineMode(true);
                setOptimisticOnline(false);

                // ⚡ Notifica a tela Home para recarregar e fixar as ordens offline imediatamente!
                DeviceEventEmitter.emit('offlineModeChanged', true);

                modeHUDService.show({
                    type: 'offline',
                    status: 'success',
                    title: 'Modo Offline Ativado',
                    subtitle: result.count > 0
                        ? `${result.count} ordens (<30d) e formulários salvos para campo.`
                        : 'Nenhuma OS aberta no momento. Base local validada com sucesso.',
                });
            } catch (err: any) {
                console.error('[HeaderRightToggle] Falha ao preparar Modo Offline:', err);
                setOptimisticOnline(true);
                setIsOfflineMode(false);
                DeviceEventEmitter.emit('offlineModeChanged', false);

                modeHUDService.show({
                    type: 'offline',
                    status: 'error',
                    title: 'Falha no Modo Offline',
                    subtitle: err?.message || 'Não foi possível baixar os dados para o celular.',
                });
                openPanel();
            } finally {
                setIsLoading(false);
                refreshQueue();
            }
        } else {
            // ══════════════════════════════════════════════
            // GOING ONLINE
            // ══════════════════════════════════════════════
            modeHUDService.show({
                type: 'online',
                status: 'progress',
                title: 'Ativando Modo Online...',
                subtitle: 'Verificando qualidade da conexão de rede...',
            });

            try {
                const isStable = await syncService.testConnectionQuality();
                if (!isStable) {
                    setOptimisticOnline(false);
                    setIsOfflineMode(true);
                    modeHUDService.show({
                        type: 'online',
                        status: 'error',
                        title: 'Internet Instável',
                        subtitle: 'A conexão está muito lenta ou oscilando. Os dados permanecem preservados em cache local.',
                    });
                    openPanel();
                    return;
                }

                await syncService.toggleOfflineMode(false);
                setIsOfflineMode(false);
                setOptimisticOnline(true);

                // ⚡ Notifica a tela Home para recarregar do servidor imediatamente!
                DeviceEventEmitter.emit('offlineModeChanged', false);

                const q = await syncService.getQueue();
                const count = q.filter(t => t.status === 'pending' || t.status === 'error').length;
                setPendingCount(count);

                if (count > 0) {
                    modeHUDService.show({
                        type: 'online',
                        status: 'progress',
                        title: 'Subindo Ordens de Serviço...',
                        subtitle: `${count} OS(s) pendente(s) sincronizando com a nuvem...`,
                    });
                    syncService.processSyncQueueWithProgress(true).catch((e) => {
                        console.error('[HeaderRightToggle] Erro na sincronização em segundo plano:', e);
                    });
                } else {
                    modeHUDService.show({
                        type: 'online',
                        status: 'success',
                        title: 'Modo Online Ativado',
                        subtitle: 'Conexão ativa • Sistema 100% sincronizado em tempo real.',
                    });
                }
            } catch (err: any) {
                console.error('[HeaderRightToggle] Erro ao alternar para Online:', err);
                setOptimisticOnline(false);
                setIsOfflineMode(true);
                DeviceEventEmitter.emit('offlineModeChanged', true);
                modeHUDService.show({
                    type: 'online',
                    status: 'error',
                    title: 'Erro ao Ativar Online',
                    subtitle: err?.message || 'Falha ao conectar aos servidores.',
                });
            } finally {
                setIsLoading(false);
                refreshQueue();
            }
        }
    };

    const handleManualSync = () => {
        if (isBusy) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
        syncService.processSyncQueueWithProgress(true).catch((e) => {
            console.error('[HeaderRightToggle] Erro no acionamento manual de sync:', e);
        });
    };

    // Posição vertical calculada dinamicamente com safe area
    const headerHeight = insets.top + (Platform.OS === 'ios' ? 44 : 54);
    const panelTop = headerHeight + 6;

    // Cálculo do progresso ativo (seja de modo HUD ou de sync)
    const activePercent = isSyncing
        ? syncProgress.percent
        : typeof modeState.progress === 'number'
        ? Math.round(modeState.progress * 100)
        : null;

    return (
        <View style={styles.container}>
            {/* Notification Bell */}
            <Pressable
                onPress={() => router.push('/notifications')}
                style={styles.bellContainer}
                hitSlop={15}
            >
                <IconSymbol name="bell.fill" size={21} color="#cbd5e1" />
                {hasUnread && <View style={styles.unreadBadge} />}
            </Pressable>

            {/* BOTÃO RETRÁTIL PRINCIPAL (Pílula no Cabeçalho — Tamanho Equilibrado) */}
            <Pressable
                onPress={togglePanel}
                style={[
                    styles.pill,
                    isBusy && styles.pillBusy,
                    isPanelOpen && styles.pillOpen,
                    pendingCount > 0 && !isBusy && styles.pillPending,
                ]}
                hitSlop={6}
            >
                {/* Spinner ou Ícone de Estado */}
                <View style={styles.pillLeft}>
                    {isBusy ? (
                        <ActivityIndicator
                            size="small"
                            color={isOnline ? '#ffffff' : '#fbbf24'}
                            style={styles.spinner}
                        />
                    ) : (
                        <View style={[styles.statusDot, { backgroundColor: isOnline ? '#10b981' : '#f59e0b' }]} />
                    )}

                    <Text style={styles.statusLabel}>
                        {isOnline ? 'Online' : 'Offline'}
                    </Text>

                    {/* Micro-badge de OSs pendentes */}
                    {pendingCount > 0 && (
                        <View style={styles.pendingBadge}>
                            <Ionicons name="cloud-upload" size={10} color="#ffffff" style={{ marginRight: 2 }} />
                            <Text style={styles.pendingBadgeText}>{pendingCount}</Text>
                        </View>
                    )}

                    {/* Indicador de expansão sutil */}
                    <Ionicons
                        name={isPanelOpen ? 'chevron-up' : 'chevron-down'}
                        size={11}
                        color="rgba(255,255,255,0.7)"
                        style={{ marginLeft: 3 }}
                    />
                </View>

                {/* Switch de ativação ampliado mantendo o card intacto */}
                <View style={styles.switchWrapper}>
                    <Switch
                        trackColor={{ false: '#ef4444', true: '#10b981' }}
                        thumbColor="#ffffff"
                        ios_backgroundColor="#ef4444"
                        onValueChange={handleToggle}
                        value={isOnline}
                        disabled={false}
                        style={{ transform: [{ scaleX: 0.85 }, { scaleY: 0.85 }], marginHorizontal: -2 }}
                    />
                </View>
            </Pressable>

            {/* MODAL RETRÁTIL ANEXADO AO BOTÃO (Sem poluir a tela do app) */}
            <Modal
                transparent
                visible={isPanelOpen}
                animationType="none"
                onRequestClose={closePanel}
            >
                {/* Backdrop invisível/toque para recolher */}
                <Pressable style={styles.modalBackdrop} onPress={closePanel}>
                    <View style={StyleSheet.absoluteFill} />
                </Pressable>

                {/* Card Retrátil Flutuante */}
                <Animated.View
                    style={[
                        styles.dropdownCard,
                        {
                            top: panelTop,
                            opacity: panelAnimation,
                            transform: [
                                {
                                    translateY: panelAnimation.interpolate({
                                        inputRange: [0, 1],
                                        outputRange: [-12, 0],
                                    }),
                                },
                            ],
                        },
                    ]}
                >
                    {/* Header do Painel Retrátil */}
                    <View style={styles.drawerHeader}>
                        <View style={styles.drawerHeaderTitleRow}>
                            <View style={[styles.headerModeBadge, isOnline ? styles.badgeOnline : styles.badgeOffline]}>
                                <Ionicons
                                    name={isOnline ? 'wifi' : 'cloud-offline'}
                                    size={13}
                                    color={isOnline ? '#059669' : '#d97706'}
                                />
                                <Text style={[styles.headerModeBadgeText, { color: isOnline ? '#059669' : '#d97706' }]}>
                                    {isOnline ? 'Modo Online' : 'Modo Offline'}
                                </Text>
                            </View>
                        </View>

                        <Pressable onPress={closePanel} hitSlop={10} style={styles.closeBtn}>
                            <Ionicons name="close" size={18} color="#64748b" />
                        </Pressable>
                    </View>

                    <ScrollView
                        style={styles.drawerScroll}
                        contentContainerStyle={styles.drawerScrollContent}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* 1. SEÇÃO DE PROCESSO EM ANDAMENTO (Quando o spinner estiver girando) */}
                        {isBusy && (
                            <View style={styles.activeProcessCard}>
                                <View style={styles.processHeaderRow}>
                                    <ActivityIndicator size="small" color="#1c2d4f" />
                                    <Text style={styles.processTitle}>
                                        {isSyncing
                                            ? 'Sincronizando Ordens de Serviço'
                                            : modeState.title || 'Processando Solicitação'}
                                    </Text>
                                    {activePercent !== null && (
                                        <Text style={styles.processPercent}>{activePercent}%</Text>
                                    )}
                                </View>

                                {/* Barra de progresso azul padrão Nexus */}
                                {activePercent !== null && (
                                    <View style={styles.progressBarTrack}>
                                        <View
                                            style={[
                                                styles.progressBarFill,
                                                { width: `${Math.min(Math.max(activePercent, 5), 100)}%` },
                                            ]}
                                        />
                                    </View>
                                )}

                                <Text style={styles.processSubtitle}>
                                    {isSyncing
                                        ? syncProgress.currentStep || `Enviando item ${syncProgress.completed + 1} de ${syncProgress.total || 1}...`
                                        : modeState.subtitle || 'Preparando dados locais no aparelho...'}
                                </Text>

                                {syncProgress.isStalled && (
                                    <View style={styles.stalledWarning}>
                                        <Ionicons name="warning-outline" size={13} color="#b45309" />
                                        <Text style={styles.stalledWarningText}>
                                            Conexão lenta detectada. O envio continuará em segundo plano.
                                        </Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* 2. MENSAGEM DE SUCESSO / FEEDBACK DO ÚLTIMO MODO (Se não estiver ocupado) */}
                        {!isBusy && modeState.status === 'success' && modeState.title ? (
                            <View style={styles.feedbackSuccessCard}>
                                <Ionicons name="checkmark-circle" size={18} color="#10b981" />
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                    <Text style={styles.feedbackSuccessTitle}>{modeState.title}</Text>
                                    <Text style={styles.feedbackSuccessSubtitle}>{modeState.subtitle}</Text>
                                </View>
                            </View>
                        ) : null}

                        {/* 3. MENSAGEM DE ERRO (Se houver) */}
                        {!isBusy && (modeState.status === 'error' || syncProgress.status === 'error') ? (
                            <View style={styles.feedbackErrorCard}>
                                <Ionicons name="alert-circle" size={18} color="#ef4444" />
                                <View style={{ flex: 1, marginLeft: 8 }}>
                                    <Text style={styles.feedbackErrorTitle}>
                                        {modeState.title || syncProgress.errorMessage || 'Falha na Operação'}
                                    </Text>
                                    <Text style={styles.feedbackErrorSubtitle}>
                                        {modeState.subtitle || 'Verifique sua conexão e tente novamente.'}
                                    </Text>
                                </View>
                            </View>
                        ) : null}

                        {/* 4. SEÇÃO DE ORDENS DE SERVIÇO PENDENTES PARA SUBIR */}
                        <View style={styles.sectionBox}>
                            <View style={styles.sectionBoxHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                    <Ionicons
                                        name={pendingCount > 0 ? 'cloud-upload' : 'cloud-done'}
                                        size={18}
                                        color={pendingCount > 0 ? '#1c2d4f' : '#10b981'}
                                    />
                                    <Text style={styles.sectionTitle}>
                                        {pendingCount > 0
                                            ? `${pendingCount} OS(s) Pendente(s) de Envio`
                                            : 'Sincronização em Dia'}
                                    </Text>
                                </View>
                                {pendingCount > 0 && (
                                    <View style={styles.pendingCounterPill}>
                                        <Text style={styles.pendingCounterText}>{pendingCount}</Text>
                                    </View>
                                )}
                            </View>

                            {pendingCount > 0 ? (
                                <>
                                    <Text style={styles.sectionDescription}>
                                        {isOfflineMode
                                            ? 'Ordens salvas no celular. Ao retornar para a base com internet, ative o Modo Online para subir os dados, fotos e vídeos.'
                                            : 'Ordens concluídas aguardando transmissão completa para os servidores.'}
                                    </Text>

                                    {/* Lista resumida de tarefas pendentes */}
                                    <View style={styles.queueList}>
                                        {queue
                                            .filter(item => item.status === 'pending' || item.status === 'error' || item.status === 'syncing')
                                            .slice(0, 4)
                                            .map((task) => (
                                                <View key={task.id} style={styles.queueItemRow}>
                                                    <Ionicons
                                                        name={
                                                            task.status === 'syncing'
                                                                ? 'sync'
                                                                : task.status === 'error'
                                                                ? 'alert-circle'
                                                                : 'time-outline'
                                                        }
                                                        size={14}
                                                        color={
                                                            task.status === 'syncing'
                                                                ? '#1c2d4f'
                                                                : task.status === 'error'
                                                                ? '#ef4444'
                                                                : '#64748b'
                                                        }
                                                    />
                                                    <Text style={styles.queueItemTitle} numberOfLines={1}>
                                                        {formatOrderDisplayTitle(task)}
                                                    </Text>
                                                    <Text style={styles.queueItemType}>
                                                        {task.type === 'complete_os' ? 'Conclusão' : 'Impedimento'}
                                                    </Text>
                                                    {task.localPhotos && task.localPhotos.length > 0 && (
                                                        <View style={styles.photoCountBadge}>
                                                            <Ionicons name="camera" size={10} color="#1c2d4f" />
                                                            <Text style={styles.photoCountText}>{task.localPhotos.length}</Text>
                                                        </View>
                                                    )}
                                                </View>
                                            ))}
                                        {pendingCount > 4 && (
                                            <Text style={styles.moreItemsText}>
                                                + {pendingCount - 4} outra(s) ordem(ns) na fila local
                                            </Text>
                                        )}
                                    </View>

                                    {/* Botão de sincronização manual se estiver online e não estiver sincronizando */}
                                    {isOnline && !isBusy && (
                                        <Pressable
                                            style={styles.syncNowBtn}
                                            onPress={handleManualSync}
                                            hitSlop={5}
                                        >
                                            <Ionicons name="cloud-upload-outline" size={15} color="#ffffff" style={{ marginRight: 6 }} />
                                            <Text style={styles.syncNowBtnText}>Subir Ordens Agora</Text>
                                        </Pressable>
                                    )}
                                </>
                            ) : (
                                <Text style={styles.allSyncedText}>
                                    Todas as suas Ordens de Serviço estão 100% salvas e sincronizadas na nuvem.
                                </Text>
                            )}
                        </View>

                        {/* 5. RESUMO DE CONECTIVIDADE */}
                        <View style={styles.networkStatusRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[styles.networkDot, { backgroundColor: isConnected ? '#10b981' : '#ef4444' }]} />
                                <Text style={styles.networkStatusText}>
                                    {isConnected ? 'Dispositivo conectado à internet' : 'Sem sinal de internet no dispositivo'}
                                </Text>
                            </View>
                        </View>

                        {/* Botão Inferior de Recolher */}
                        <Pressable style={styles.collapseBtn} onPress={closePanel}>
                            <Ionicons name="chevron-up" size={14} color="#64748b" />
                            <Text style={styles.collapseBtnText}>Recolher painel</Text>
                        </Pressable>
                    </ScrollView>
                </Animated.View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginRight: 8,
        flexDirection: 'row',
        alignItems: 'center',
    },
    bellContainer: {
        marginRight: 8,
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

    // ── BOTÃO PÍLULA NO HEADER (Tamanho Equilibrado) ────────────────────────────
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'rgba(255,255,255,0.15)',
        borderRadius: 18,
        paddingLeft: 8,
        paddingRight: 2,
        paddingVertical: 2.5,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1.5 },
        shadowOpacity: 0.16,
        shadowRadius: 3.5,
        elevation: 2,
        ...Platform.select({
            web: { outlineStyle: 'none' } as any,
            default: {},
        }),
    },
    pillBusy: {
        borderColor: 'rgba(255, 255, 255, 0.45)',
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
    },
    pillOpen: {
        borderColor: 'rgba(255, 255, 255, 0.55)',
        backgroundColor: 'rgba(255, 255, 255, 0.22)',
    },
    pillPending: {
        borderColor: 'rgba(251, 191, 36, 0.5)',
    },
    pillLeft: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingRight: 2,
    },
    spinner: {
        marginRight: 5,
    },
    statusDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 5,
    },
    statusLabel: {
        fontSize: 11.5,
        fontWeight: '700',
        color: '#ffffff',
        letterSpacing: 0.15,
    },
    pendingBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1c2d4f',
        paddingHorizontal: 4.5,
        paddingVertical: 1,
        borderRadius: 9,
        marginLeft: 4,
        borderWidth: 1,
        borderColor: 'rgba(255, 255, 255, 0.35)',
    },
    pendingBadgeText: {
        color: '#ffffff',
        fontSize: 9.5,
        fontWeight: '800',
    },
    switchWrapper: {
        marginLeft: 0,
    },

    // ── MODAL RETRÁTIL ANEXADO ─────────────────────────────
    modalBackdrop: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(0, 0, 0, 0.22)',
    },
    dropdownCard: {
        position: 'absolute',
        right: 8,
        width: Math.min(Dimensions.get('window').width - 32, 280),
        maxHeight: Dimensions.get('window').height * 0.72,
        backgroundColor: '#ffffff',
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(28, 45, 79, 0.12)',
        shadowColor: '#1c2d4f',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.14,
        shadowRadius: 16,
        elevation: 10,
        overflow: 'hidden',
        ...Platform.select({
            web: { outlineStyle: 'none' } as any,
            default: {},
        }),
    },
    drawerHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 12,
        paddingTop: 12,
        paddingBottom: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    drawerHeaderTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    headerModeBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 10,
        gap: 4,
    },
    badgeOnline: {
        backgroundColor: '#ecfdf5',
    },
    badgeOffline: {
        backgroundColor: '#fffbeb',
    },
    headerModeBadgeText: {
        fontSize: 12,
        fontWeight: '700',
    },
    closeBtn: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: '#f1f5f9',
        alignItems: 'center',
        justifyContent: 'center',
    },
    drawerScroll: {
        maxHeight: Dimensions.get('window').height * 0.65,
    },
    drawerScrollContent: {
        padding: 14,
        gap: 12,
    },

    // ── PROCESSO EM ANDAMENTO ──────────────────────────────
    activeProcessCard: {
        backgroundColor: '#f8fafc',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    processHeaderRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
    },
    processTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1c2d4f',
        flex: 1,
        marginLeft: 8,
    },
    processPercent: {
        fontSize: 12,
        fontWeight: '800',
        color: '#1c2d4f',
    },
    progressBarTrack: {
        height: 6,
        backgroundColor: '#e2e8f0',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 8,
    },
    progressBarFill: {
        height: '100%',
        backgroundColor: '#1c2d4f',
        borderRadius: 3,
    },
    processSubtitle: {
        fontSize: 11,
        color: '#475569',
        lineHeight: 15,
    },
    stalledWarning: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
        backgroundColor: '#fffbeb',
        padding: 6,
        borderRadius: 8,
    },
    stalledWarningText: {
        fontSize: 10,
        color: '#b45309',
        flex: 1,
    },

    // ── FEEDBACKS ──────────────────────────────────────────
    feedbackSuccessCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#ecfdf5',
        borderRadius: 12,
        padding: 10,
        borderWidth: 1,
        borderColor: '#a7f3d0',
    },
    feedbackSuccessTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#065f46',
        marginBottom: 2,
    },
    feedbackSuccessSubtitle: {
        fontSize: 11,
        color: '#047857',
        lineHeight: 15,
    },
    feedbackErrorCard: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        backgroundColor: '#fef2f2',
        borderRadius: 12,
        padding: 10,
        borderWidth: 1,
        borderColor: '#fecaca',
    },
    feedbackErrorTitle: {
        fontSize: 12,
        fontWeight: '700',
        color: '#991b1b',
        marginBottom: 2,
    },
    feedbackErrorSubtitle: {
        fontSize: 11,
        color: '#b91c1c',
        lineHeight: 15,
    },

    // ── SEÇÃO DE OSs PENDENTES ─────────────────────────────
    sectionBox: {
        backgroundColor: '#f8fafc',
        borderRadius: 14,
        padding: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    sectionBoxHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    sectionTitle: {
        fontSize: 13,
        fontWeight: '700',
        color: '#1c2d4f',
    },
    pendingCounterPill: {
        backgroundColor: '#1c2d4f',
        paddingHorizontal: 7,
        paddingVertical: 2,
        borderRadius: 10,
    },
    pendingCounterText: {
        fontSize: 11,
        fontWeight: '800',
        color: '#ffffff',
    },
    sectionDescription: {
        fontSize: 11,
        color: '#64748b',
        lineHeight: 16,
        marginBottom: 10,
    },
    queueList: {
        gap: 6,
        marginBottom: 10,
    },
    queueItemRow: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        paddingHorizontal: 10,
        paddingVertical: 7,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        gap: 8,
    },
    queueItemTitle: {
        fontSize: 11,
        fontWeight: '700',
        color: '#1e293b',
        flex: 1,
    },
    queueItemType: {
        fontSize: 10,
        color: '#64748b',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
    },
    photoCountBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 6,
        gap: 3,
    },
    photoCountText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#1c2d4f',
    },
    moreItemsText: {
        fontSize: 10,
        color: '#94a3b8',
        textAlign: 'center',
        marginTop: 2,
    },
    syncNowBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1c2d4f',
        borderRadius: 10,
        paddingVertical: 9,
        paddingHorizontal: 14,
        marginTop: 4,
    },
    syncNowBtnText: {
        color: '#ffffff',
        fontSize: 12,
        fontWeight: '700',
    },
    allSyncedText: {
        fontSize: 11,
        color: '#10b981',
        fontWeight: '600',
        lineHeight: 16,
    },

    // ── STATUS DE REDE ─────────────────────────────────────
    networkStatusRow: {
        paddingVertical: 6,
        paddingHorizontal: 4,
    },
    networkDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    networkStatusText: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: '500',
    },

    // ── BOTÃO RECOLHER ─────────────────────────────────────
    collapseBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        gap: 4,
        marginTop: 4,
    },
    collapseBtnText: {
        fontSize: 11,
        color: '#64748b',
        fontWeight: '600',
    },
});

