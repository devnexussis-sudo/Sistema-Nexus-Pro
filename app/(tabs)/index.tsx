import { useRouter, useFocusEffect } from 'expo-router';
import React, { useState, useMemo, useCallback } from 'react';
import { StyleSheet, FlatList, Pressable, View, Text, Platform, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { OrderStatus, STATUS_CONFIG } from '@/constants/mock-data';
import { OrderService } from '@/services/order-service';

const ITEMS_PER_PAGE = 10;


export default function HomeScreen() {
  const router = useRouter();
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<OrderStatus | 'all'>('all');
  const [isLoading, setIsLoading] = useState(true);

  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const [refreshing, setRefreshing] = useState(false);

  const fetchOrders = async () => {
    setIsLoading(true);
    try {
      const result = await OrderService.getAllOrders();
      setOrders(result);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchOrders();
  }, []);

  // Refresh orders when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchOrders();
    }, [])
  );

  // Filter Logic: Status + Dates
  const filteredOrders = useMemo(() => {
    let result = orders;

    // 1. Status Filter
    if (selectedFilter !== 'all') {
      result = result.filter((order) => order.status === selectedFilter);
    }

    // 2. Date Filter
    if (startDate || endDate) {
      result = result.filter((order) => {
        // Handle both YYYY-MM-DD (from DB) and DD/MM/YYYY (from Mock) formats
        let orderDate;
        if (order.date.includes('-')) {
          orderDate = new Date(order.date);
        } else {
          const parts = order.date.split('/');
          orderDate = new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
        }

        if (startDate && orderDate < startDate) return false;

        if (endDate) {
          const endOfDay = new Date(endDate);
          endOfDay.setHours(23, 59, 59, 999);
          if (orderDate > endOfDay) return false;
        }

        return true;
      });
    }

    return result;
  }, [orders, selectedFilter, startDate, endDate]);

  // Pagination Logic
  const totalPages = Math.ceil(filteredOrders.length / ITEMS_PER_PAGE);
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredOrders.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredOrders, currentPage]);

  // Reset pagination when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [selectedFilter, startDate, endDate]);

  const onChangeStartDate = (event: any, selectedDate?: Date) => {
    setShowStartPicker(false);
    if (selectedDate) {
      setStartDate(selectedDate);
    }
  };

  const onChangeEndDate = (event: any, selectedDate?: Date) => {
    setShowEndPicker(false);
    if (selectedDate) {
      setEndDate(selectedDate);
    }
  };

  const dashboardStats = useMemo(() => {
    const stats: Record<string, number> = {
      all: orders.length,
      pending: orders.filter((o) => o.status === 'pending').length,
      in_progress: orders.filter((o) => o.status === 'in_progress').length,
      completed: orders.filter((o) => o.status === 'completed').length,
      canceled: orders.filter((o) => o.status === 'canceled').length,
    };
    return stats;
  }, [orders]);

  const renderDashboardCard = (status: OrderStatus | 'all', label: string, count: number, color: string) => (
    <Pressable
      key={status}
      style={[
        styles.dashboardCard,
        selectedFilter === status && { backgroundColor: color + '20', borderColor: color },
      ]}
      onPress={() => setSelectedFilter(status)}>
      <View style={[styles.statusIndicator, { backgroundColor: color }]} />
      <Text style={styles.dashboardCount}>{count}</Text>
      <Text style={styles.dashboardLabel}>{label}</Text>
    </Pressable>
  );

  return (
    <ThemedView style={styles.container}>
      {/* Dashboard Section */}
      <View style={styles.dashboardContainer}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <ThemedText style={styles.sectionTitle}>Visão Geral</ThemedText>
          {isLoading && <Text style={{ fontSize: 10, color: '#666' }}>Atualizando...</Text>}
        </View>

        <View style={styles.dashboardGrid}>
          {renderDashboardCard('all', 'Total', dashboardStats.all, '#1c2d4f')}
          {renderDashboardCard('pending', 'Pendentes', dashboardStats.pending, STATUS_CONFIG.pending.color)}
          {renderDashboardCard('in_progress', 'Em And.', dashboardStats.in_progress, STATUS_CONFIG.in_progress.color)}
          {renderDashboardCard('completed', 'Concluídas', dashboardStats.completed, STATUS_CONFIG.completed.color)}
        </View>
      </View>

      <View style={styles.listContainer}>
        {/* Date Filter Inputs */}
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
          <ThemedText style={styles.sectionTitle}>
            Ordens de Serviço
            {selectedFilter !== 'all' && ` (${STATUS_CONFIG[selectedFilter].label})`}
          </ThemedText>
          <Pressable
            style={styles.filterButton}
            onPress={() => {
              setSelectedFilter('all');
              setStartDate(null);
              setEndDate(null);
            }}>
            <Ionicons name="filter" size={18} color="#1c2d4f" />
            <Text style={styles.filterButtonText}>Limpar</Text>
          </Pressable>
        </View>

        <FlatList
          data={paginatedOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.orderCard}
              onPress={() => router.push(`/os/${item.id}`)}
            >
              <View style={styles.orderHeader}>
                <Text style={styles.orderId}>{item.displayId || item.id}</Text>
                <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[item.status].color + '20' }]}>
                  <Text style={[styles.statusText, { color: STATUS_CONFIG[item.status].color }]}>
                    {STATUS_CONFIG[item.status].label}
                  </Text>
                </View>
              </View>

              <Text style={styles.customerName}>{item.customer}</Text>
              <View style={styles.detailRow}>
                <Ionicons name="location-outline" size={14} color="#666" />
                <Text style={styles.addressText}>{item.address}</Text>
              </View>

              <View style={styles.cardFooter}>
                <Text style={styles.dateText}>{item.date}</Text>
                <Ionicons name="chevron-forward" size={20} color="#ccc" />
              </View>
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="documents-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>
                {filteredOrders.length === 0 ? 'Nenhuma OS encontrada.' : ''}
              </Text>
            </View>
          }
          ListFooterComponent={
            filteredOrders.length > 0 ? (
              <View style={styles.paginationContainer}>
                <Pressable
                  disabled={currentPage === 1}
                  onPress={() => setCurrentPage(p => Math.max(1, p - 1))}
                  style={[styles.pageButton, currentPage === 1 && styles.disabledButton]}
                >
                  <Ionicons name="chevron-back" size={20} color={currentPage === 1 ? "#ccc" : "#1c2d4f"} />
                </Pressable>

                <Text style={styles.pageText}>
                  Página {currentPage} de {totalPages || 1}
                </Text>

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
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f7fa',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1c2d4f',
  },
  dashboardContainer: {
    padding: 16,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ebebeb',
  },
  dashboardGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  dashboardCard: {
    width: '23%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 8,
  },
  dashboardCount: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  dashboardLabel: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
    textAlign: 'center',
  },
  listContainer: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  dateFilterContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 10,
  },
  dateInput: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dateTextPlaceholder: {
    fontSize: 12,
    color: '#999',
  },
  dateTextActive: {
    fontSize: 12,
    color: '#333',
    fontWeight: '500',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  filterButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  filterButtonText: {
    color: '#1c2d4f',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 20,
  },
  orderCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#1c2d4f',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  orderId: {
    fontWeight: 'bold',
    fontSize: 16,
    color: '#1c2d4f',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  customerName: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
    marginBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 12,
  },
  addressText: {
    fontSize: 12,
    color: '#666',
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    paddingTop: 12,
  },
  dateText: {
    fontSize: 12,
    color: '#999',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  emptyText: {
    marginTop: 10,
    color: '#999',
    fontSize: 14,
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
    gap: 20,
  },
  pageButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  disabledButton: {
    opacity: 0.5,
  },
  pageText: {
    fontSize: 14,
    color: '#333',
    fontWeight: '600',
  },
});
