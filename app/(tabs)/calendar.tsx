
import React, { useState, useMemo } from 'react';
import { StyleSheet, View, Text, FlatList, Pressable } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { MOCK_ORDERS, STATUS_CONFIG } from '@/constants/mock-data';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

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

export default function CalendarScreen() {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);

  // Convert MOCK_ORDERS dates (DD/MM/YYYY) to YYYY-MM-DD for the calendar
  const markedDates = useMemo(() => {
    const marks: any = {};
    MOCK_ORDERS.forEach(order => {
      const [day, month, year] = order.date.split('/');
      const dateKey = `${year}-${month}-${day}`;

      if (!marks[dateKey]) {
        marks[dateKey] = {
          marked: true,
          dotColor: '#1c2d4f'
        };
      }
    });

    // Highlight selected date
    marks[selectedDate] = {
      ...marks[selectedDate],
      selected: true,
      selectedColor: '#1c2d4f',
    };

    return marks;
  }, [selectedDate]);

  // Filter orders for the selected date
  const selectedDateOrders = useMemo(() => {
    // selectedDate is YYYY-MM-DD
    // order.date is DD/MM/YYYY
    const [year, month, day] = selectedDate.split('-');
    const formattedSelectedDate = `${day}/${month}/${year}`;

    return MOCK_ORDERS.filter(order => order.date === formattedSelectedDate);
  }, [selectedDate]);

  return (
    <ThemedView style={styles.container}>
      <View style={styles.calendarContainer}>
        <Calendar
          onDayPress={(day: any) => setSelectedDate(day.dateString)}
          markedDates={markedDates}
          theme={{
            selectedDayBackgroundColor: '#1c2d4f',
            todayTextColor: '#1c2d4f',
            arrowColor: '#1c2d4f',
            textMonthFontWeight: 'bold',
          }}
        />
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
                <Text style={styles.timeText}>08:00</Text>
                {/* Mock time since we don't have it in the Interface yet */}
              </View>

              <View style={styles.cardContent}>
                <View style={styles.orderHeader}>
                  <Text style={styles.orderId}>{item.id}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[item.status].color + '20' }]}>
                    <Text style={[styles.statusText, { color: STATUS_CONFIG[item.status].color }]}>
                      {STATUS_CONFIG[item.status].label}
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
