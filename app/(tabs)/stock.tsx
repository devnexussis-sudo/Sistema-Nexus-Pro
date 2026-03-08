
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { StyleSheet, View, Text, FlatList, ActivityIndicator, RefreshControl, TextInput } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { StockService, TechStockItem } from '@/services/stock-service';
import { TenantService } from '@/services/tenant-service';

export default function StockScreen() {
    const [stock, setStock] = useState<TechStockItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showPrice, setShowPrice] = useState(true);

    const fetchStock = async (isBackground = false) => {
        if (!isBackground) setIsLoading(true);
        try {
            // First fetch settings
            const settings = await TenantService.getSettings();
            setShowPrice(settings.showStockPrice);

            const data = await StockService.getMyStock();
            setStock(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchStock();
        }, [])
    );

    const onRefresh = useCallback(() => {
        setRefreshing(true);
        fetchStock(true);
    }, []);

    const filteredStock = useMemo(() => {
        if (!searchQuery) return stock;
        const query = searchQuery.toLowerCase();
        return stock.filter(item =>
            item.item?.description.toLowerCase().includes(query) ||
            item.item?.code.toLowerCase().includes(query)
        );
    }, [stock, searchQuery]);

    const renderStockItem = ({ item }: { item: TechStockItem }) => (
        <View style={styles.stockCard}>
            <View style={styles.cardHeader}>
                <View style={styles.codeBadge}>
                    <Text style={styles.codeText}>{item.item?.code || 'S/N'}</Text>
                </View>
                <View style={styles.quantityBadge}>
                    <Text style={styles.quantityText}>{item.quantity} {item.item?.unit || 'UN'}</Text>
                </View>
            </View>
            <Text style={styles.itemDescription}>{item.item?.description || 'Item sem descrição'}</Text>
            <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Ionicons name="time-outline" size={12} color="#999" />
                    <Text style={styles.updatedAt}>Atul: {new Date(item.updatedAt).toLocaleDateString('pt-BR')}</Text>
                </View>
                {(showPrice && item.item?.sellPrice) ? (
                    <Text style={styles.priceText}>
                        R$ {item.item.sellPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </Text>
                ) : null}
            </View>
        </View>
    );

    return (
        <ThemedView style={styles.container}>
            <View style={styles.headerSection}>
                <ThemedText style={styles.title}>Meu Estoque</ThemedText>
                <Text style={styles.subtitle}>Gerencie suas peças e materiais em mãos</Text>

                <View style={styles.searchContainer}>
                    <Ionicons name="search-outline" size={20} color="#999" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder="Buscar por nome ou código..."
                        placeholderTextColor="#999"
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                    />
                    {searchQuery.length > 0 && (
                        <Ionicons
                            name="close-circle"
                            size={18}
                            color="#ccc"
                            onPress={() => setSearchQuery('')}
                        />
                    )}
                </View>
            </View>

            <View style={styles.listContainer}>
                {isLoading && !refreshing ? (
                    <View style={styles.loaderContainer}>
                        <ActivityIndicator size="large" color="#1c2d4f" />
                    </View>
                ) : (
                    <FlatList
                        data={filteredStock}
                        keyExtractor={(item) => item.id}
                        renderItem={renderStockItem}
                        contentContainerStyle={styles.listContent}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#1c2d4f']} />
                        }
                        ListEmptyComponent={
                            <View style={styles.emptyContainer}>
                                <Ionicons name="cube-outline" size={64} color="#e0e0e0" />
                                <Text style={styles.emptyText}>
                                    {searchQuery ? 'Nenhum item encontrado na busca' : 'Você ainda não possui itens no estoque'}
                                </Text>
                            </View>
                        }
                    />
                )}
            </View>
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f7fa' },
    headerSection: { padding: 20, backgroundColor: '#fff', borderBottomLeftRadius: 24, borderBottomRightRadius: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 4 },
    title: { fontSize: 24, fontWeight: 'bold', color: '#1c2d4f' },
    subtitle: { fontSize: 13, color: '#666', marginTop: 4, marginBottom: 16 },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f0f2f5', borderRadius: 12, paddingHorizontal: 12, height: 44 },
    searchInput: { flex: 1, marginLeft: 8, fontSize: 14, color: '#333' },
    listContainer: { flex: 1 },
    listContent: { padding: 20, paddingBottom: 40 },
    stockCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, borderLeftWidth: 4, borderLeftColor: '#1c2d4f' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    codeBadge: { backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
    codeText: { fontSize: 11, fontWeight: 'bold', color: '#64748b', textTransform: 'uppercase' },
    quantityBadge: { backgroundColor: '#ecfdf5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
    quantityText: { fontSize: 13, fontWeight: '800', color: '#10b981' },
    itemDescription: { fontSize: 16, fontWeight: '600', color: '#1e293b', marginBottom: 12 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    updatedAt: { fontSize: 11, color: '#94a3b8' },
    priceText: { fontSize: 14, fontWeight: '700', color: '#1c2d4f' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80, paddingHorizontal: 40 },
    emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 16, fontSize: 16, lineHeight: 24 },
});
