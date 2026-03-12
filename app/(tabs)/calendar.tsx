
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { STATUS_CONFIG } from '@/constants/mock-data';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

// Configure locale for Portuguese
LocaleConfig.locales['pt-br'] = {
  monthNames: [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ],
  monthNamesShort: ['Jan.', 'Fev.', 'Mar.', 'Abr.', 'Mai.', 'Jun.', 'Jul.', 'Ago.', 'Set.', 'Out.', 'Nov.', 'Dez.'],
  dayNames: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'],
  dayNamesShort: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'],
  today: 'Hoje'
};
LocaleConfig.defaultLocale = 'pt-br';

import { ExtendedServiceOrder, OrderService } from '@/services/order-service';
import { ActivityIndicator } from 'react-native';

export default function CalendarScreen() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState(new Date().getMonth() + 1);
  const [orders, setOrders] = useState<ExtendedServiceOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchMonthOrders = async (isBackground = false) => {
    if (!isBackground) setIsLoading(true);
    try {
      // 1. Fetch from Cache first (fast load)
      if (!isBackground) {
        const cachedData = await OrderService.getCalendarOrders(currentYear, currentMonth, false);
        if (cachedData && cachedData.length > 0) {
          setOrders(cachedData);
          setIsLoading(false); // Cache was fast, remove loader!
        }
      }

      // 2. Fetch from Network implicitly (Background update / SWR pattern)
      const freshData = await OrderService.getCalendarOrders(currentYear, currentMonth, true);
      setOrders(freshData);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMonthOrders();
  }, [currentYear, currentMonth]);

  // Convert real orders to markedDates
  const markedDates = useMemo(() => {
    const marks: any = {};
    const countPerDay: Record<string, number> = {};

    orders.forEach(order => {
      if (order.scheduledDate) {
        // Parse date. In DB, it's typically YYYY-MM-DD
        const dateKey = order.scheduledDate.includes('T') ? order.scheduledDate.split('T')[0] : order.scheduledDate;
        countPerDay[dateKey] = (countPerDay[dateKey] || 0) + 1;
      }
    });

    // Create marks with text/badges
    Object.keys(countPerDay).forEach(date => {
      marks[date] = {
        marked: true,
        // Since react-native-calendars default 'marked' just shows a dot,
        // we can use a custom style or we can let it be a dot.
        // But the user requested to see "quantas OS ele tem por dia" (how many OS per day).
        // Let's use `customStyles` to show number if possible, or just standard text customization.
        // Actually, react-native-calendars allows passing raw text or we can just use dots for visual.
        // The most compatible way in basic RN Calendars is either 'dots' array or passing custom property if we customize the Day component.
        // For simplicity with default Day component, we'll add `osCount` properties here and a subtitle, or multiple dots.
        // We will make `dots` array.
        dots: Array.from({ length: Math.min(countPerDay[date], 3) }).map(() => ({ color: '#1c2d4f' })),
      };
    });

    // Highlight selected date
    marks[selectedDate] = {
      ...marks[selectedDate],
      selected: true,
      selectedColor: '#1c2d4f',
    };

    return marks;
  }, [orders, selectedDate]);

  // Filter orders for the selected date
  const selectedDateOrders = useMemo(() => {
    return orders.filter(order => {
      if (!order.scheduledDate) return false;
      const dateKey = order.scheduledDate.includes('T') ? order.scheduledDate.split('T')[0] : order.scheduledDate;
      return dateKey === selectedDate;
    });
  }, [orders, selectedDate]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.calendarContainer}>
        <Calendar
          onDayPress={(day: any) => setSelectedDate(day.dateString)}
          onMonthChange={(month: any) => {
            setCurrentYear(month.year);
            setCurrentMonth(month.month);
          }}
          markedDates={markedDates}
          markingType={'multi-dot'}
          theme={{
            selectedDayBackgroundColor: '#1c2d4f',
            todayTextColor: '#1c2d4f',
            arrowColor: '#1c2d4f',
            textMonthFontWeight: 'bold',
          }}
        />
        {isLoading && (
          <View style={{ position: 'absolute', top: 10, right: 10 }}>
            <ActivityIndicator size="small" color="#1c2d4f" />
          </View>
        )}
      </View>

      <View style={styles.listContainer}>
        <ThemedText style={styles.sectionTitle}>
          Agendamentos do Dia ({selectedDate.split('-').reverse().join('/')})
        </ThemedText>

        <FlatList
          data={selectedDateOrders}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={48} color="#ccc" />
              <Text style={styles.emptyText}>Nenhum agendamento para este dia.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.orderCard}
              onPress={() => router.push(`/os/${item.id}`)}
            >
              <View style={styles.timeIndicator}>
                <Text style={styles.timeText}>{item.scheduledTime?.substring(0, 5) || '12:00'}</Text>
              </View>

              <View style={styles.cardContent}>
                <View style={styles.orderHeader}>
                  <Text style={styles.orderId}>{item.displayId || item.id}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[item.status as OrderStatus]?.color + '20' }]}>
                    <Text style={[styles.statusText, { color: STATUS_CONFIG[item.status as OrderStatus]?.color }]}>
                      {STATUS_CONFIG[item.status as OrderStatus]?.label}
                    </Text>
                  </View>
                </View>
                <Text style={styles.customerName}>{item.customer}</Text>
                <Text style={styles.addressText} numberOfLines={1}>{item.address}</Text>
              </View>
            </Pressable>
          )}
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
  calendarContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  listContainer: {
    flex: 1,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#333',
  },
  listContent: {
    paddingBottom: 20,
  },
  orderCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  timeIndicator: {
    backgroundColor: '#f0f4ff',
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    width: 60,
  },
  timeText: {
    fontWeight: 'bold',
    color: '#1c2d4f',
    fontSize: 14,
  },
  cardContent: {
    flex: 1,
    padding: 12,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  orderId: {
    fontWeight: 'bold',
    fontSize: 14,
    color: '#1c2d4f',
  },
  statusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
  },
  statusText: {
    fontSize: 8,
    fontWeight: 'bold',
    textTransform: 'uppercase',
  },
  customerName: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  addressText: {
    fontSize: 12,
    color: '#666',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  emptyText: {
    color: '#999',
    marginTop: 8,
  },
});
