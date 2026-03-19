import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { OrderStatus, PRIORITY_CONFIG, STATUS_CONFIG } from '@/constants/mock-data';
import { startBackgroundLocation } from '@/services/location-service';
import { NotificationService } from '@/services/notification-service';
import { OrderService } from '@/services/order-service';
import { supabase } from '@/services/supabase';
import { syncService } from '@/services/sync-service';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, RefreshControl, Share, StyleSheet, Text, View } from 'react-native';

const ITEMS_PER_PAGE = 10;

// Internal Order Card Component
const OrderCard = ({ order, onShare, onPress }: { order: any; onShare: any; onPress: any }) => (
  <Pressable style={styles.orderCard} onPress={onPress}>
    <View style={styles.orderHeader}>
      <Text style={styles.orderId}>{order.displayId || order.id}</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {order.priority && PRIORITY_CONFIG[order.priority] && (
          <View style={[styles.statusBadge, { backgroundColor: PRIORITY_CONFIG[order.priority].bg }]}>
            <Text style={[styles.statusText, { color: PRIORITY_CONFIG[order.priority].color }]}>
              {PRIORITY_CONFIG[order.priority].label}
            </Text>
          </View>
        )}
        <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[order.status as OrderStatus]?.color + '20' || '#f0f0f0' }]}>
          <Text style={[styles.statusText, { color: STATUS_CONFIG[order.status as OrderStatus]?.color || '#666' }]}>
            {STATUS_CONFIG[order.status as OrderStatus]?.label || order.status}
          </Text>
        </View>
      </View>
    </View>

    <Text style={styles.customerName}>{order.customer}</Text>
    <View style={styles.detailRow}>
      <Ionicons name="location-outline" size={14} color="#666" />
      <Text style={styles.addressText}>{order.address}</Text>
    </View>

    <View style={styles.cardFooter}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name={order.status === 'completed' ? "checkmark-circle-outline" : "calendar-outline"} size={14} color={order.status === 'completed' ? '#10b981' : "#999"} />
        <Text style={[styles.dateText, order.status === 'completed' && { color: '#059669', fontWeight: 'bold' }]}>
          {order.status === 'completed' ? `Concluída em: ${order.date}` : order.date}
        </Text>
      </View>

      {order.status === 'completed' && order.publicToken ? (
        <Pressable
          style={styles.shareButton}
          onPress={(e) => {
            e.stopPropagation();
            onShare(order.publicToken, order.displayId || order.id);
          }}
        >
          <Ionicons name="share-social-outline" size={16} color="#10b981" />
          <Text style={styles.shareButtonText}>Compartilhar</Text>
        </Pressable>
      ) : (
        <Ionicons name="chevron-forward" size={20} color="#ccc" />
      )}
    </View>
  </Pressable>
);

export default function HomeScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<OrderStatus | 'all'>('pending');
  const [isLoading, setIsLoading] = useState(true);
  const [totalOrders, setTotalOrders] = useState(0);
  const [serverStats, setServerStats] = useState<Record<string, number>>({});

  const [startDate, setStartDate] = useState<Date | null>(new Date());
  const [endDate, setEndDate] = useState<Date | null>(new Date());
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [refreshing, setRefreshing] = useState(false);

  // Ref para sempre ter a versão mais atual de fetchOrders (evita closure stale)
  const fetchOrdersRef = useRef<((force?: boolean) => void) | null>(null);

  // Offline Sync State
  const [pendingSyncCount, setPendingSyncCount] = useState(0);

  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  });

  useEffect(() => {
    // Subscribe na fila para contagem
    const unQueue = syncService.subscribe((queue) => {
      setPendingSyncCount(queue.filter(q => q.status === 'pending').length);
    });
    // Subscribe no estado de sync: quando termina (false), faz refresh
    const unSync = syncService.subscribeSyncing((syncing) => {
      if (!syncing && fetchOrdersRef.current) {
        fetchOrdersRef.current(true);
      }
    });
    return () => { unQueue(); unSync(); };
  }, []);

  const cacheKey = useMemo(() => {
    return `${selectedFilter}-${startDate?.getTime() || 0}-${endDate?.getTime() || 0}-${currentPage}`;
  }, [selectedFilter, startDate, endDate, currentPage]);

  const fetchOrders = async (isBackground = false) => {
    if (!isBackground) setIsLoading(true);

    // ── MODO OFFLINE: ler do cache local ──────────────────────────────
    if (syncService.isOfflineModeEnabled()) {
      try {
        const raw = await syncService.getTodayOrders();
        const mapped = raw.map((o: any) => OrderService.mapDbOrderToApp(o));

        // Filtrar pelo status selecionado
        const filtered = selectedFilter === 'all'
          ? mapped
          : mapped.filter((o: any) => {
            if (selectedFilter === 'pending') return ['pending', 'assigned', 'traveling'].includes(o.status);
            return o.status === selectedFilter;
          });

        setOrders(filtered);
        setTotalOrders(filtered.length);
        const stats: Record<string, number> = { all: mapped.length, pending: 0, in_progress: 0, blocked: 0, completed: 0 };
        mapped.forEach((o: any) => {
          if (stats[o.status] !== undefined) stats[o.status]++;
          if (['assigned', 'traveling', 'pending'].includes(o.status)) stats.pending++;
        });
        setServerStats(stats);
      } finally {
        setIsLoading(false);
        setRefreshing(false);
      }
      return;
    }
    // ─────────────────────────────────────────────────────────────────

    try {
      // 1. Fetch from Cache first (fast load)
      let cachedResponse = null;
      if (!isBackground) {
        cachedResponse = await OrderService.getAllOrders({
          page: currentPage,
          pageSize: ITEMS_PER_PAGE,
          statusFilter: selectedFilter,
          startDate,
          endDate,
          forceRefresh: false
        });

        if (cachedResponse?.orders?.length) {
          setOrders(cachedResponse.orders);
          setTotalOrders(cachedResponse.total);
          setServerStats(cachedResponse.stats);
          setIsLoading(false); // Cache was fast, remove loader!
        }
      }

      // 2. Fetch from Network implicitly (Background update / SWR pattern)
      const freshResponse = await OrderService.getAllOrders({
        page: currentPage,
        pageSize: ITEMS_PER_PAGE,
        statusFilter: selectedFilter,
        startDate,
        endDate,
        forceRefresh: true // Bypass cache
      });

      // 3. Update state with fresh data
      setOrders(freshResponse.orders || []);
      setTotalOrders(freshResponse.total);
      setServerStats(freshResponse.stats);

      // 🚀 Date Reminders
      if (freshResponse.orders && Array.isArray(freshResponse.orders)) {
        freshResponse.orders.forEach(order => {
          if ((order.status === 'pending' || order.status === 'assigned') && order.scheduledDate && order.scheduledTime) {
            NotificationService.scheduleOrderReminders(
              order.id,
              order.scheduledDate,
              order.scheduledTime,
              order.displayId || 'S/N'
            );
          }
        });
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders(true);
  }, [cacheKey]);

  // Realtime Listener for Instant Updates
  useEffect(() => {
    let channel: any;

    const setupRealtime = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId) return;

      console.log('[HomeScreen] 📡 Subscribing to OS Realtime Updates for:', userId);

      channel = supabase
        .channel('os-updates')
        .on(
          'postgres_changes',
          {
            event: '*', // Listen to INSERT, UPDATE, DELETE
            schema: 'public',
            table: 'orders',
            filter: `assigned_to=eq.${userId}`
          },
          (payload: any) => {
            console.log('[HomeScreen] 🔄 OS Change Detected:', payload.eventType);

            // 🔥 Automically refresh the data
            fetchOrders(true);

            // 🔔 If it's a NEW assignment, trigger a local notification
            if (payload.eventType === 'INSERT') {
              NotificationService.triggerLocalNotification(
                "Nova OS Atribuída!",
                `Você recebeu uma nova Ordem de Serviço: ${payload.new.display_id || 'S/N'}`,
                { orderId: payload.new.id }
              );
            } else if (payload.eventType === 'UPDATE' && payload.old.status !== payload.new.status) {
              // Notify on status changes if relevant
            }
          }
        )
        .subscribe();
    };

    setupRealtime();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [selectedFilter, startDate, endDate, currentPage]); // Re-subscribe if filter context changes if needed, but usually one subs is enough

  useEffect(() => {
    fetchOrders();

    // ✅ Fallback: Ensure GPS is running when entering Home
    const timer = setTimeout(() => {
      startBackgroundLocation().catch(e => console.error('[Home] GPS Error:', e));
    }, 1000);

    return () => clearTimeout(timer);
  }, [cacheKey]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFilter, startDate, endDate]);

  const totalPages = Math.ceil(totalOrders / ITEMS_PER_PAGE);

  const onChangeStartDate = (event: any, selectedDate?: Date) => {
    setShowStartPicker(false);
    if (selectedDate) setStartDate(selectedDate);
  };

  const onChangeEndDate = (event: any, selectedDate?: Date) => {
    setShowEndPicker(false);
    if (selectedDate) setEndDate(selectedDate);
  };

  const dashboardStats = useMemo(() => {
    return {
      pending: { color: '#d97706', bg: '#fef3c7', label: 'Abertas' },
      in_progress: { color: '#2563eb', bg: '#dbeafe', label: 'Execução' },
      blocked: { color: '#e11d48', bg: '#ffe4e6', label: 'Impedidas' },
      completed: { color: '#059669', bg: '#d1fae5', label: 'Finalizadas' },
    };
  }, []);

  const handleShareOS = async (publicToken: string, displayId: string) => {
    if (publicToken) {
      const url = `https://app.dunoup.com.br/#/order/view/${publicToken}`;
      try {
        await Share.share({
          message: `📄 Resumo da Ordem de Serviço ${displayId}:\nClique para acessar: ${url}`,
          url,
        });
      } catch (error) {
        Alert.alert("Erro", "Não foi possível compartilhar.");
      }
    }
  };

  const renderDashboardCard = (status: string, data: any) => (
    <Pressable
      key={status}
      style={[
        styles.dashboardCard,
        { backgroundColor: data.bg, borderColor: data.color + '20' },
        selectedFilter === status && { backgroundColor: data.color, borderColor: data.color },
      ]}
      onPress={() => setSelectedFilter(status as any)}>
      <Text style={[
        styles.dashboardLabel,
        { color: data.color },
        selectedFilter === status && { color: '#fff' }
      ]}>
        {data.label}
      </Text>
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      {/* OFFLINE SYNC BADGE */}
      {pendingSyncCount > 0 && syncService.isOfflineModeEnabled() && (
        <View style={styles.offlineBadge}>
          <Ionicons name="cloud-offline-outline" size={20} color="#fff" />
          <Text style={styles.offlineBadgeText}>
            {pendingSyncCount} {pendingSyncCount === 1 ? 'OS Pendente' : 'OS Pendentes'} de Sincronização
          </Text>
          <Pressable onPress={() => syncService.triggerSync()} style={styles.syncBtn}>
            <Ionicons name="sync-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 12, fontWeight: 'bold', marginLeft: 4 }}>Sincronizar</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.dashboardContainer}>
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <ThemedText style={styles.sectionTitle}>Visão Geral</ThemedText>
        </View>

        <View style={styles.dashboardGrid}>
          {Object.entries(dashboardStats).map(([key, value]) => renderDashboardCard(key, value))}
        </View>
      </View>

      <View style={styles.listContainer}>
        <View style={styles.dateFilterContainer}>
          <Pressable style={styles.dateInput} onPress={() => setShowStartPicker(true)}>
            <Text style={startDate ? styles.dateTextActive : styles.dateTextPlaceholder}>
              {startDate ? startDate.toLocaleDateString('pt-BR') : 'Data Início'}
            </Text>
            <Ionicons name="calendar-outline" size={16} color="#666" />
          </Pressable>

          <Pressable style={styles.dateInput} onPress={() => setShowEndPicker(true)}>
            <Text style={endDate ? styles.dateTextActive : styles.dateTextPlaceholder}>
              {endDate ? endDate.toLocaleDateString('pt-BR') : 'Data Fim'}
            </Text>
            <Ionicons name="calendar-outline" size={16} color="#666" />
          </Pressable>
        </View>

        {showStartPicker && (
          <DateTimePicker
            value={startDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onChangeStartDate}
            maximumDate={new Date()}
          />
        )}

        {showEndPicker && (
          <DateTimePicker
            value={endDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onChange={onChangeEndDate}
            minimumDate={startDate || undefined}
          />
        )}

        <View style={styles.listHeader}>
          <ThemedText style={styles.sectionTitle}>Ordens de Serviço</ThemedText>
          <Pressable
            style={styles.filterButton}
            onPress={() => {
              setSelectedFilter('pending');
              setStartDate(new Date());
              setEndDate(new Date());
            }}>
            <Ionicons name="filter" size={18} color="#1c2d4f" />
            <Text style={styles.filterButtonText}>Limpar</Text>
          </Pressable>
        </View>

        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onShare={handleShareOS}
              onPress={() => {
                const isExecuting = item.status === 'in_progress' || item.status === 'EM ANDAMENTO';
                if (isExecuting) {
                  router.push({ pathname: '/os/execute', params: { id: item.id } });
                } else {
                  router.push(`/os/${item.id}`);
                }
              }}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1c2d4f']} />
          }
          ListEmptyComponent={
            isLoading ? null : (
              <View style={styles.emptyContainer}>
                <Ionicons name="documents-outline" size={48} color="#ccc" />
                <Text style={styles.emptyText}>Nenhuma ordem encontrada</Text>
              </View>
            )
          }
          ListFooterComponent={
            totalOrders > 0 ? (
              <View style={styles.paginationContainer}>
                <Pressable
                  disabled={currentPage === 1}
                  onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                  style={[styles.pageButton, currentPage === 1 && styles.disabledButton]}
                >
                  <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? "#ccc" : "#1c2d4f"} />
                </Pressable>

                <Text style={styles.pageText}>Página {currentPage} de {totalPages || 1}</Text>

                <Pressable
                  disabled={currentPage === totalPages}
                  onPress={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  style={[styles.pageButton, currentPage === totalPages && styles.disabledButton]}
                >
                  <Ionicons name="chevron-forward" size={20} color={currentPage === totalPages ? "#ccc" : "#1c2d4f"} />
                </Pressable>
              </View>
            ) : null
          }
        />

        {isLoading && (
          <View style={styles.loaderOverlay}>
            <ActivityIndicator size="large" color="#1c2d4f" />
            <Text style={{ marginTop: 10, color: '#1c2d4f', fontWeight: '500' }}>Carregando dados...</Text>
          </View>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f7fa' },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1c2d4f' },
  dashboardContainer: { paddingVertical: 12, paddingHorizontal: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#ebebeb' },
  dashboardGrid: { flexDirection: 'row', justifyContent: 'space-between', gap: 6 },
  dashboardCard: {
    flex: 1,
    height: 58,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3
  },
  dashboardLabel: { fontSize: 12, fontWeight: '900', textAlign: 'center' },
  listContainer: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  dateFilterContainer: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, gap: 10 },
  dateInput: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  dateTextPlaceholder: { fontSize: 12, color: '#999' },
  dateTextActive: { fontSize: 12, color: '#333', fontWeight: '500' },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  filterButton: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  filterButtonText: { color: '#1c2d4f', fontSize: 12, fontWeight: '600' },
  listContent: { paddingBottom: 20 },
  orderCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, borderLeftWidth: 4, borderLeftColor: '#1c2d4f', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(245, 247, fa, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderId: { fontWeight: 'bold', fontSize: 16, color: '#1c2d4f' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  offlineBadge: { backgroundColor: '#e11d48', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8, gap: 8, zIndex: 99 },
  offlineBadgeText: { color: '#fff', fontSize: 13, fontWeight: 'bold', flex: 1 },
  syncBtn: { backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, flexDirection: 'row', alignItems: 'center' },
  customerName: { fontSize: 14, color: '#333', fontWeight: '600', marginBottom: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  addressText: { fontSize: 12, color: '#666' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 12 },
  dateText: { fontSize: 12, color: '#999' },
  shareButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#ecfdf5', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#a7f3d0', gap: 6 },
  shareButtonText: { fontSize: 12, color: '#10b981', fontWeight: '700' },
  emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 40 },
  emptyText: { marginTop: 10, color: '#999', fontSize: 14 },
  paginationContainer: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 10, gap: 20 },
  pageButton: { padding: 8, borderRadius: 8, backgroundColor: '#f0f0f0' },
  disabledButton: { opacity: 0.5 },
  pageText: { fontSize: 14, color: '#333', fontWeight: '600' },
});
