import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getStatusConfig, getPriorityConfig, OrderStatus } from '@/constants/mock-data';
import { appLifecycle } from '@/services/app-lifecycle';
import { NotificationService } from '@/services/notification-service';
import { OrderService } from '@/services/order-service';
import { supabase } from '@/services/supabase';
import { syncService } from '@/services/sync-service';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Platform, Pressable, RefreshControl, Share, StyleSheet, Text, View, Linking, Modal } from 'react-native';
import { BlurView } from 'expo-blur';
import { useI18n } from '@/services/i18n';
import { TenantService } from '@/services/tenant-service';

const ITEMS_PER_PAGE = 10;

// Internal Order Card Component
const OrderCard = ({ order, onShare, onPress, allowShare, showClientContact, t }: { order: any; onShare: any; onPress: any; allowShare: boolean; showClientContact: boolean; t: any }) => (
  <Pressable style={styles.orderCard} onPress={onPress}>
    <View style={styles.orderHeader}>
      <Text style={styles.orderId}>
        {order.displayId || order.id}
        {order.visitCount ? ` - ${order.visitCount} ${order.visitCount > 1 ? t('homeVisits') : t('homeVisit')}` : ''}
      </Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {order.priority && getPriorityConfig(t as any)[order.priority] && (
          <View style={[styles.statusBadge, { backgroundColor: getPriorityConfig(t as any)[order.priority].bg }]}>
            <Text style={[styles.statusText, { color: getPriorityConfig(t as any)[order.priority].color }]}>
              {getPriorityConfig(t as any)[order.priority].label}
            </Text>
          </View>
        )}
        <View style={[styles.statusBadge, { backgroundColor: getStatusConfig(t as any)[order.status as OrderStatus]?.color + '20' || '#f0f0f0' }]}>
          <Text style={[styles.statusText, { color: getStatusConfig(t as any)[order.status as OrderStatus]?.color || '#666' }]}>
            {getStatusConfig(t as any)[order.status as OrderStatus]?.label || t('statusPending')}
          </Text>
        </View>
      </View>
    </View>

    <Text style={styles.customerName}>{order.customer}</Text>
    
    {(order.operationType || order.type) && (
      <View style={{ marginBottom: 6, alignSelf: 'flex-start' }}>
         <View style={[styles.statusBadge, { backgroundColor: '#e0e7ff', borderWidth: 1, borderColor: '#c7d2fe' }]}>
            <Text style={[styles.statusText, { color: '#4338ca' }]}>
               {order.operationType || order.type}
            </Text>
         </View>
      </View>
    )}

    <View style={styles.detailRow}>
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name="location-outline" size={14} color="#666" />
        <Text style={[styles.addressText, { flex: 1 }]} numberOfLines={1}>{order.address}</Text>
      </View>
    </View>

    {/* Horário do Agendamento */}
    {(order.scheduledDate || order.scheduledTime) && (
      <View style={styles.scheduleRow}>
        <Ionicons name="time-outline" size={14} color="#6366f1" />
        <Text style={styles.scheduleText}>
          <Text style={{ fontWeight: '500', color: '#666' }}>{t('homeSchedule')} </Text>
          {order.scheduledDate
            ? new Date(order.scheduledDate + 'T00:00:00').toLocaleDateString('pt-BR', { timeZone: 'UTC' })
            : ''}
          {order.scheduledTime ? ` ${t('homeAt')} ${order.scheduledTime.substring(0, 5)}` : ''}
        </Text>
      </View>
    )}

    <View style={[styles.cardFooter, { flexDirection: 'row', gap: 8 }]}>
      {(() => {
        if (!showClientContact) return null;
        return (
          <Pressable 
            style={[styles.whatsappButton, { flex: 1, backgroundColor: '#f0fdf4', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: '#bbf7d0', justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }]} 
            onPress={async (e) => {
               e.stopPropagation();
               let currentPhone = order.customerPhone || order.contactPhone || order.whatsapp || order.phone;
               
               if (!currentPhone && order.customer) {
                 try {
                   const { data, error } = await supabase
                     .from('customers')
                     .select('whatsapp, phone')
                     .eq('name', order.customer)
                     .single();
                     
                   if (!error && data) {
                     currentPhone = data.whatsapp || data.phone;
                   }
                 } catch (err) {
                   console.log('Error fetching customer phone:', err);
                 }
               }

               if (currentPhone) {
                 const numbersOnly = String(currentPhone).replace(/\D/g, '');
                 if (numbersOnly.length >= 8) {
                    Linking.openURL(`https://wa.me/55${numbersOnly.startsWith('55') ? numbersOnly.substring(2) : numbersOnly}`);
                    return;
                 }
               }
               
               Alert.alert(t('homeWarning'), t('homeWhatsappNotRegistered'));
            }}
          >
            <Ionicons name="logo-whatsapp" size={16} color="#16a34a" />
            <Text style={{ color: '#16a34a', fontSize: 12, fontWeight: '800', textAlign: 'center' }}>WhatsApp</Text>
          </Pressable>
        );
      })()}

      <Pressable 
        style={[styles.gpsButton, { flex: 1, backgroundColor: '#eff6ff', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 8, borderColor: '#bfdbfe', justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }]} 
        onPress={(e) => {
          e.stopPropagation();
          const query = encodeURIComponent(order.address);
          const iosUrl = `http://maps.apple.com/?daddr=${query}`;
          const androidUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
          const url = Platform.select({ ios: iosUrl, android: androidUrl });
          
          if (Linking && url) {
              Linking.openURL(url).catch(() => {
                  Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
              });
          }
        }}
      >
        <Ionicons name="navigate-circle" size={16} color="#2563eb" />
        <Text style={[styles.gpsButtonText, { color: '#2563eb', fontSize: 12, fontWeight: 'bold', textAlign: 'center' }]}>{t('homeOpenGPS')}</Text>
      </Pressable>

      {allowShare && order.status === 'completed' && order.publicToken ? (
        <Pressable
          style={[styles.shareButton, { flex: 1, paddingVertical: 10, paddingHorizontal: 12, justifyContent: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }]}
          onPress={(e) => {
            e.stopPropagation();
            onShare(order.publicToken, order.displayId || order.id);
          }}
        >
          <Ionicons name="share-social-outline" size={16} color="#10b981" />
          <Text style={[styles.shareButtonText, { fontSize: 12, textAlign: 'center' }]}>{t('homeShare')}</Text>
        </Pressable>
      ) : null}
    </View>
  </Pressable>
);

export default function HomeScreen() {
  const router = useRouter();
  const { t, lang } = useI18n();
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
  const params = useLocalSearchParams();

  // Ref para sempre ter a versão mais atual de fetchOrders (evita closure stale)
  const fetchOrdersRef = useRef<((force?: boolean) => void) | null>(null);
  const flatListRef = useRef<FlatList>(null);
  // 🛡️ Race condition guard — tracks current fetch generation
  const fetchIdRef = useRef(0);

  // Offline Sync State
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  // Tenant feature flags
  const [allowOsSharing, setAllowOsSharing] = useState(true);
  const [showClientContact, setShowClientContact] = useState(true);

  // Load tenant settings in Realtime (allowOsSharing, showClientContact)
  useEffect(() => {
    TenantService.getSettings(true).then(settings => {
      setAllowOsSharing(settings.allowOsSharing);
      setShowClientContact(settings.showClientContact);
    }).catch(() => {});

    const unsub = TenantService.onSettingsChange(settings => {
      console.log('[HomeScreen] ⚡ Atualizando configurações de compartilhamento e contato em tempo real!');
      setAllowOsSharing(settings.allowOsSharing);
      setShowClientContact(settings.showClientContact);
    });

    return () => unsub();
  }, []);

  useEffect(() => {
    fetchOrdersRef.current = fetchOrders;
  });

  useEffect(() => {
    if (params.filter && ['pending', 'in_progress', 'blocked', 'completed'].includes(params.filter as string)) {
      setSelectedFilter(params.filter as OrderStatus);
    }
  }, [params.filter]);

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
    const startTime = Date.now();
    // 🛡️ Race condition guard: increment ID before fetching
    const thisId = ++fetchIdRef.current;
    if (!isBackground) setIsLoading(true);

    // ── MODO OFFLINE: ler do cache local ──────────────────────────────
    if (syncService.isOfflineModeEnabled()) {
      try {
        const raw = await syncService.getTodayOrders();
        if (fetchIdRef.current !== thisId) return; // 🛡️ Stale — discard
        const mapped = raw.map((o: any) => OrderService.mapDbOrderToApp(o));

        // Filtrar pelo status selecionado
        const filtered = selectedFilter === 'all'
          ? mapped
          : mapped.filter((o: any) => {
            if (selectedFilter === 'pending') return ['pending', 'assigned', 'traveling'].includes(o.status);
            return o.status === selectedFilter;
          });

        filtered.sort((a, b) => {
          let dateA = new Date(a.scheduledDate || a.createdAt).getTime();
          let dateB = new Date(b.scheduledDate || b.createdAt).getTime();

          if (selectedFilter === 'completed') {
             dateA = new Date(a.endDate || a.updatedAt || a.createdAt).getTime();
             dateB = new Date(b.endDate || b.updatedAt || b.createdAt).getTime();
          } else if (selectedFilter === 'blocked') {
             dateA = new Date(a.updatedAt || a.createdAt).getTime();
             dateB = new Date(b.updatedAt || b.createdAt).getTime();
          }

          if (isNaN(dateA)) dateA = 0;
          if (isNaN(dateB)) dateB = 0;

          return dateB - dateA;
        });

        setOrders(filtered);
        setTotalOrders(filtered.length);
        const stats: Record<string, number> = { all: mapped.length, pending: 0, in_progress: 0, blocked: 0, completed: 0 };
        mapped.forEach((o: any) => {
          if (stats[o.status] !== undefined) stats[o.status]++;
          if (['assigned', 'traveling', 'pending'].includes(o.status)) stats.pending++;
        });
        setServerStats(stats);
      } catch (e) {
        console.error('[Home] Error fetching offline orders:', e);
      } finally {
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 1000 - elapsed);
        if (remaining > 0) {
          await new Promise(resolve => setTimeout(resolve, remaining));
        }
        
        if (fetchIdRef.current === thisId) {
          setIsLoading(false);
          setRefreshing(false);
        }
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

        if (fetchIdRef.current !== thisId) return; // 🛡️ Stale — discard

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

      if (fetchIdRef.current !== thisId) return; // 🛡️ Stale — discard

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
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 1000 - elapsed);
      if (remaining > 0) {
        await new Promise(resolve => setTimeout(resolve, remaining));
      }
      
      if (fetchIdRef.current === thisId) {
        setIsLoading(false);
        setRefreshing(false);
      }
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders(true);
  }, [cacheKey]);

  // Realtime Listener — uses singleton from AppLifecycleManager
  // No more re-subscribing on filter changes = no more duplicate WebSocket connections
  useEffect(() => {
    const unsubscribe = appLifecycle.onOrderChange((payload: any) => {
      console.log('[HomeScreen] 🔄 OS Change (via lifecycle singleton):', payload.eventType);
      // Throttled by lifecycle manager — safe to call directly
      if (fetchOrdersRef.current) {
        fetchOrdersRef.current(true);
      }
    });

    return unsubscribe;
  }, []);

  // Fetch orders when filters change
  // ⚠️ REMOVED: startBackgroundLocation() fallback that restarted GPS on every filter change
  //    GPS is now a singleton managed by AppLifecycleManager
  useEffect(() => {
    fetchOrders();
  }, [cacheKey]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedFilter, startDate, endDate]);

  const totalPages = Math.ceil(totalOrders / ITEMS_PER_PAGE);

  const MAX_RANGE_DAYS = 183; // ~6 meses

  const onChangeStartDate = (event: any, selectedDate?: Date) => {
    setShowStartPicker(false);
    if (!selectedDate) return;

    // Valida se o novo início não cria um intervalo maior que 6 meses com a data fim atual
    if (endDate) {
      const diffMs = endDate.getTime() - selectedDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > MAX_RANGE_DAYS) {
        Alert.alert(
          t('homeDateRangeTooLargeTitle'),
          t('homeDateRangeTooLarge'),
          [{ text: t('homeUnderstood'), style: 'default' }]
        );
        return;
      }
      if (diffDays < 0) {
        Alert.alert(
          t('homeDateInvalidTitle'),
          t('homeDateInvalid'),
          [{ text: t('homeUnderstood'), style: 'default' }]
        );
        return;
      }
    }
    setStartDate(selectedDate);
  };

  const onChangeEndDate = (event: any, selectedDate?: Date) => {
    setShowEndPicker(false);
    if (!selectedDate) return;

    // Valida se o novo fim não cria um intervalo maior que 6 meses com a data início atual
    if (startDate) {
      const diffMs = selectedDate.getTime() - startDate.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);
      if (diffDays > MAX_RANGE_DAYS) {
        Alert.alert(
          t('homeDateRangeTooLargeTitle'),
          t('homeDateRangeTooLarge'),
          [{ text: t('homeUnderstood'), style: 'default' }]
        );
        return;
      }
      if (diffDays < 0) {
        Alert.alert(
          t('homeDateInvalidTitle'),
          t('homeDateInvalidEnd'),
          [{ text: t('homeUnderstood'), style: 'default' }]
        );
        return;
      }
    }
    setEndDate(selectedDate);
  };

  const dashboardStats = useMemo(() => {
    return {
      pending: { color: '#d97706', bg: '#fef3c7', label: t('statusOpen') },
      in_progress: { color: '#2563eb', bg: '#dbeafe', label: t('statusExecution') },
      blocked: { color: '#e11d48', bg: '#ffe4e6', label: t('statusBlocked') },
      completed: { color: '#059669', bg: '#d1fae5', label: t('statusCompleted') },
    };
  }, [t, lang]);

  const handleShareOS = async (publicToken: string, displayId: string) => {
    if (publicToken) {
      const url = `https://app.dunoup.com.br/#/order/view/${publicToken}`;
      try {
        await Share.share({
          message: `${t('homeShareMessage')} ${displayId}:\n${t('homeClickToAccess')} ${url}`,
          url,
        });
      } catch (error) {
        Alert.alert(t('alertError'), t('homeShareError'));
      }
    }
  };

  const STATUS_ICONS: Record<string, any> = {
    pending: 'time-outline',
    in_progress: 'construct-outline',
    blocked: 'warning-outline',
    completed: 'checkmark-circle-outline',
  };

  const renderDashboardCard = (status: string, data: any) => {
    const isSelected = selectedFilter === status;
    const count = serverStats[status] ?? 0;
    const icon = STATUS_ICONS[status] || 'ellipse-outline';

    return (
      <Pressable
        key={status}
        style={[
          styles.dashboardCard,
          { backgroundColor: isSelected ? data.color : data.bg },
          isSelected && {
            shadowColor: data.color,
            shadowOpacity: 0.4,
            shadowRadius: 8,
            elevation: 8,
            transform: [{ scale: 1.04 }],
          },
        ]}
        onPress={() => setSelectedFilter(status as any)}
      >
        {/* Checkmark badge no canto superior direito */}
        {isSelected && (
          <View style={[styles.selectedBadge, { backgroundColor: '#ffffff' }]}>
            <Ionicons name="checkmark" size={10} color={data.color} />
          </View>
        )}

        <Ionicons
          name={icon}
          size={18}
          color={isSelected ? 'rgba(255,255,255,0.9)' : data.color}
          style={{ marginBottom: 4 }}
        />

        <Text style={[
          styles.dashboardCount,
          { color: isSelected ? '#fff' : data.color },
        ]}>
          {count}
        </Text>

        <Text style={[
          styles.dashboardLabel,
          { color: isSelected ? 'rgba(255,255,255,0.9)' : data.color },
        ]}>
          {data.label}
        </Text>

        {/* Barra inferior de seleção */}
        {isSelected && (
          <View style={[styles.selectedBar, { backgroundColor: 'rgba(255,255,255,0.5)' }]} />
        )}
      </Pressable>
    );
  };



  return (
    <ThemedView style={styles.container}>
      {/* OFFLINE SYNC BADGE */}
      {pendingSyncCount > 0 && syncService.isOfflineModeEnabled() && (
        <View style={styles.offlineBadge}>
          <Ionicons name="cloud-offline-outline" size={20} color="#fff" />
          <Text style={styles.offlineBadgeText}>
            {pendingSyncCount} {pendingSyncCount === 1 ? t('homeOsPending') : t('homeOsPendings')} {t('homeOsSyncMessage')}
          </Text>
          <View style={styles.syncBtn}>
            <Ionicons name="information-circle-outline" size={16} color="#fff" />
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold', marginLeft: 4 }}>{t('homeOfflineSwitch')}</Text>
          </View>
        </View>
      )}

      <View style={styles.dashboardContainer}>
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <ThemedText style={styles.sectionTitle}>{t('homeOverview')}</ThemedText>
        </View>

        <View style={styles.dashboardGrid}>
          {Object.entries(dashboardStats).map(([key, value]) => renderDashboardCard(key, value))}
        </View>
      </View>

      <View style={styles.listContainer}>
        <View style={styles.dateFilterContainer}>
          <Pressable style={styles.dateInput} onPress={() => setShowStartPicker(true)}>
            <Text style={startDate ? styles.dateTextActive : styles.dateTextPlaceholder}>
              {startDate ? startDate.toLocaleDateString('pt-BR') : t('homeDateStart')}
            </Text>
            <Ionicons name="calendar-outline" size={16} color="#666" />
          </Pressable>

          <Pressable style={styles.dateInput} onPress={() => setShowEndPicker(true)}>
            <Text style={endDate ? styles.dateTextActive : styles.dateTextPlaceholder}>
              {endDate ? endDate.toLocaleDateString('pt-BR') : t('homeDateEnd')}
            </Text>
            <Ionicons name="calendar-outline" size={16} color="#666" />
          </Pressable>
        </View>

        {showStartPicker && (
          <DateTimePicker
            value={startDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onValueChange={onChangeStartDate}
            onDismiss={() => setShowStartPicker(false)}
            maximumDate={new Date()}
          />
        )}

        {showEndPicker && (
          <DateTimePicker
            value={endDate || new Date()}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            onValueChange={onChangeEndDate}
            onDismiss={() => setShowEndPicker(false)}
            minimumDate={startDate || undefined}
          />
        )}

        <View style={styles.listHeader}>
          <ThemedText style={styles.sectionTitle}>{t('homeServiceOrders')}</ThemedText>
          <Pressable
            style={styles.filterButton}
            onPress={() => {
              setSelectedFilter('pending');
              setStartDate(new Date());
              setEndDate(new Date());
            }}>
            <Ionicons name="filter" size={18} color="#1c2d4f" />
            <Text style={styles.filterButtonText}>{t('homeClear')}</Text>
          </Pressable>
        </View>

        <FlatList
          ref={flatListRef}
          data={orders}
          extraData={[allowOsSharing, showClientContact]}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <OrderCard
              order={item}
              onShare={handleShareOS}
              allowShare={allowOsSharing}
              showClientContact={showClientContact}
              t={t}
              onPress={() => {
                const isExecuting = item.status === 'in_progress' || item.status === 'EM ANDAMENTO';
                if (isExecuting) {
                  router.push({ pathname: '/os/execute', params: { id: item.id } });
                } else {
                  router.push({ pathname: '/os/[id]', params: { id: item.id } });
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
                <Text style={styles.emptyText}>{t('homeNoOrders')}</Text>
              </View>
            )
          }
          ListFooterComponent={
            totalOrders > 0 ? (
              <View style={styles.paginationContainer}>
                <Pressable
                  disabled={currentPage === 1}
                  onPress={() => {
                    setCurrentPage(p => Math.max(1, p - 1));
                    flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
                  }}
                  style={[styles.pageButton, currentPage === 1 && styles.disabledButton]}
                >
                  <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? "#ccc" : "#1c2d4f"} />
                </Pressable>

                <Text style={styles.pageText}>{t('homePage')} {currentPage} {t('homeOf')} {totalPages || 1}</Text>

                <Pressable
                  disabled={currentPage === totalPages}
                  onPress={() => {
                    setCurrentPage(p => Math.min(totalPages, p + 1));
                    flatListRef.current?.scrollToOffset({ animated: true, offset: 0 });
                  }}
                  style={[styles.pageButton, currentPage === totalPages && styles.disabledButton]}
                >
                  <Ionicons name="chevron-forward" size={20} color={currentPage === totalPages ? "#ccc" : "#1c2d4f"} />
                </Pressable>
              </View>
            ) : null
          }
        />

        <Modal transparent={true} visible={isLoading} animationType="fade">
          <BlurView intensity={30} tint="light" style={styles.loaderOverlayModal}>
            <ActivityIndicator size="large" color="#1c2d4f" />
            <Text style={{ marginTop: 10, color: '#1c2d4f', fontWeight: '500' }}>{t('homeFiltering')}</Text>
          </BlurView>
        </Modal>
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
    height: 80,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
    position: 'relative',
  },
  dashboardCount: { fontSize: 16, fontWeight: '900', lineHeight: 18 },
  dashboardLabel: { fontSize: 10, fontWeight: '800', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.3, marginTop: 1 },
  selectedBadge: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
  },
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
  loaderOverlayModal: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
  },
  orderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  orderId: { fontWeight: 'bold', fontSize: 16, color: '#1c2d4f' },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  statusText: { fontSize: 10, fontWeight: 'bold', textTransform: 'uppercase' },
  offlineBadge: { backgroundColor: '#e11d48', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', padding: 8, gap: 8, zIndex: 99 },
  offlineBadgeText: { color: '#fff', fontSize: 13, fontWeight: 'bold', flex: 1 },
  syncBtn: { backgroundColor: 'rgba(0,0,0,0.2)', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, flexDirection: 'row', alignItems: 'center' },
  customerName: { fontSize: 14, color: '#333', fontWeight: '600', marginBottom: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  addressText: { fontSize: 12, color: '#666' },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12, backgroundColor: '#f5f3ff', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e9e5ff' },
  scheduleText: { fontSize: 12, color: '#6366f1', fontWeight: '700' },
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
  gpsButton: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#e2e8f0' },
  gpsButtonText: { fontSize: 10, fontWeight: 'bold', color: '#1c2d4f' },
});
