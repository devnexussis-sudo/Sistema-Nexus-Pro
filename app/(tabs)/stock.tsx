
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { StockService, TechStockItem, TechStockMovement } from '@/services/stock-service';
import { TenantService } from '@/services/tenant-service';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';
import { useI18n } from '@/services/i18n';

export default function StockScreen() {
    const [stock, setStock] = useState<TechStockItem[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [showPrice, setShowPrice] = useState(false);
    const [showStockHistory, setShowStockHistory] = useState(true);
    const { t } = useI18n();

    // Modal state
    const [selectedItem, setSelectedItem] = useState<TechStockItem | null>(null);
    const [movements, setMovements] = useState<TechStockMovement[]>([]);
    const [isMovementsLoading, setIsMovementsLoading] = useState(false);
    const [movementPage, setMovementPage] = useState(1);
    const MOVEMENTS_PER_PAGE = 10;


    const fetchStock = async (isBackground = false) => {
        if (!isBackground) setIsLoading(true);
        try {
            // 1. Fetch settings (we don't show double UI update for settings to avoid flicker, just get cache first if available)
            const settings = await TenantService.getSettings(isBackground);
            setShowPrice(settings.showStockPrice);
            setShowStockHistory(settings.showStockHistory);

            // 2. Fetch from Cache first
            let cachedData = null;
            if (!isBackground) {
                cachedData = await StockService.getMyStock(false);
                if (cachedData && cachedData.length > 0) {
                    setStock(cachedData);
                    setIsLoading(false); // Cache was fast, remove loader!
                }
            }

            // 3. Fetch from Network implicitly (Background update / SWR pattern)
            const freshData = await StockService.getMyStock(true);
            setStock(freshData);

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
        return stock.filter(item => {
            const descMatch = item.item?.description?.toLowerCase().includes(query) ?? false;
            const codeMatch = item.item?.code?.toLowerCase().includes(query) ?? false;
            const fabMatch = item.item?.manufacturerCode?.toLowerCase().includes(query) ?? false;
            return descMatch || codeMatch || fabMatch;
        });
    }, [stock, searchQuery]);

    const openMovements = async (item: TechStockItem) => {
        setSelectedItem(item);
        setMovementPage(1);
        setIsMovementsLoading(true);
        try {
            const data = await StockService.getItemMovements(item.stockItemId, 1, MOVEMENTS_PER_PAGE);
            setMovements(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsMovementsLoading(false);
        }
    };

    const handlePageChange = async (newPage: number) => {
        if (!selectedItem) return;
        setMovementPage(newPage);
        setIsMovementsLoading(true);
        try {
            const data = await StockService.getItemMovements(selectedItem.stockItemId, newPage, MOVEMENTS_PER_PAGE);
            setMovements(data);
        } catch (error) {
            console.error(error);
        } finally {
            setIsMovementsLoading(false);
        }
    };

    const navigateToOrder = (orderId?: string) => {
        if (!orderId) return;
        setSelectedItem(null);
        router.push(`/os/${orderId}`);
    };

    const renderStockItem = ({ item }: { item: TechStockItem }) => (
        <Pressable onPress={() => showStockHistory ? openMovements(item) : null} disabled={!showStockHistory}>
            <View style={styles.stockCard}>
            <View style={styles.cardHeader}>
                <View style={{ flex: 1, marginRight: 16 }}>
                    <Text style={styles.itemDescription}>{item.item?.description || t('stockItemNoDesc')}</Text>
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                        {item.item?.code && (
                            <View style={styles.codeBadge}>
                                <Ionicons name="barcode-outline" size={12} color="#64748b" style={{ marginRight: 4 }} />
                                <Text style={styles.codeText}>REF: {item.item.code}</Text>
                            </View>
                        )}
                        {item.item?.manufacturerCode && (
                            <View style={[styles.codeBadge, { backgroundColor: '#f3e8ff' }]}>
                                <Ionicons name="pricetag-outline" size={12} color="#9333ea" style={{ marginRight: 4 }} />
                                <Text style={[styles.codeText, { color: '#9333ea' }]}>FAB: {item.item.manufacturerCode}</Text>
                            </View>
                        )}
                    </View>
                </View>

                <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                    <View style={styles.quantityBadge}>
                        <Text style={styles.quantityNumber}>{item.quantity}</Text>
                        <Text style={styles.quantityUnit}>{item.item?.unit || 'UN'}</Text>
                    </View>
                    {(showPrice && item.item?.sellPrice) ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 6 }}>
                            <Ionicons name="cash-outline" size={12} color="#16a34a" />
                            <Text style={{ fontSize: 13, fontWeight: '800', color: '#16a34a' }}>
                                R$ {item.item.sellPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </Text>
                        </View>
                    ) : null}
                </View>
            </View>

            <View style={styles.cardFooter}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 4 }}>
                    <Ionicons name="time-outline" size={14} color="#94a3b8" />
                    <Text style={styles.updatedAt}>{t('stockUpdatedAt')} {new Date(item.updatedAt).toLocaleDateString('pt-BR')}</Text>
                </View>
                
                {showStockHistory && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#f8fafc', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                    <Ionicons name="documents-outline" size={14} color="#3b82f6" />
                    <Text style={{ fontSize: 11, color: '#3b82f6', fontWeight: '700', textTransform: 'uppercase' }}>{t('stockHistory')}</Text>
                    <Ionicons name="chevron-forward" size={12} color="#3b82f6" />
                </View>
                )}
            </View>
        </View>
        </Pressable>
    );

    if (isLoading && !refreshing) {
        return (
            <View style={[styles.container, { justifyContent: 'center', alignItems: 'center', backgroundColor: '#ffffff' }]}>
                <ActivityIndicator size="large" color="#1c2d4f" />
                <Text style={{ marginTop: 12, color: '#1c2d4f', fontWeight: 'bold' }}>{t('stockLoading')}</Text>
            </View>
        );
    }

    return (
        <ThemedView style={styles.container}>
            <View style={styles.headerSection}>
                <ThemedText style={styles.title}>{t('stockTitle')}</ThemedText>
                <Text style={styles.subtitle}>{t('stockSubtitle')}</Text>

                <View style={styles.searchContainer}>
                    <Ionicons name="search-outline" size={20} color="#999" />
                    <TextInput
                        style={styles.searchInput}
                        placeholder={t('stockSearch')}
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
                                {searchQuery ? t('stockSearchEmpty') : t('stockEmpty')}
                            </Text>
                        </View>
                    }
                />
            </View>

            {/* Modal de Movimentações */}
            <Modal
                visible={!!selectedItem}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setSelectedItem(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <View style={{ flex: 1, paddingRight: 10 }}>
                                <Text style={styles.modalTitle}>{t('stockMovementsTitle')}</Text>
                                <Text style={{ fontSize: 13, color: '#64748b', marginTop: 2, fontWeight: '600' }} numberOfLines={1}>
                                    {selectedItem?.item?.description}
                                </Text>
                            </View>
                            <Pressable style={styles.closeButton} onPress={() => setSelectedItem(null)}>
                                <Ionicons name="close" size={24} color="#64748b" />
                            </Pressable>
                        </View>

                        {isMovementsLoading ? (
                            <View style={{ padding: 40, alignItems: 'center' }}>
                                <ActivityIndicator size="large" color="#1c2d4f" />
                                <Text style={{ color: '#64748b', marginTop: 10 }}>{t('stockFetchingHistory')}</Text>
                            </View>
                        ) : movements.length === 0 ? (
                            <View style={{ padding: 40, alignItems: 'center' }}>
                                <Ionicons name="documents-outline" size={48} color="#e2e8f0" />
                                <Text style={{ color: '#94a3b8', marginTop: 10, textAlign: 'center' }}>{t('stockNoMovements')}</Text>
                            </View>
                        ) : (
                            <>
                                <FlatList
                                    data={movements}
                                    keyExtractor={(m) => m.id}
                                    contentContainerStyle={{ padding: 20, paddingBottom: 10 }}
                                    renderItem={({ item: m }) => {
                                        const isConsumption = m.type === 'CONSUMPTION' || (m.order && m.quantity < 0);
                                        return (
                                            <Pressable 
                                                style={styles.movementCard} 
                                                onPress={() => m.order ? navigateToOrder(m.order.id) : null}
                                            >
                                                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                                        <View style={[styles.typeIcon, { backgroundColor: isConsumption ? '#fee2e2' : '#e0e7ff' }]}>
                                                            <Ionicons name={isConsumption ? "construct" : "sync-outline"} size={16} color={isConsumption ? "#ef4444" : "#4f46e5"} />
                                                        </View>
                                                        <View style={{ flex: 1, marginLeft: 12 }}>
                                                            <Text style={styles.movementTypeLabel}>
                                                                {isConsumption ? t('stockUsage') : (m.type === 'RESTOCK' ? t('stockRestock') : t('stockTransfer'))}
                                                            </Text>
                                                            <Text style={styles.movementDate}>
                                                                {new Date(m.createdAt).toLocaleString('pt-BR')}
                                                            </Text>
                                                        </View>
                                                    </View>
                                                    <View style={{ alignItems: 'flex-end', justifyContent: 'center' }}>
                                                        <Text style={[styles.movementQuantity, { color: m.quantity < 0 ? '#ef4444' : '#10b981' }]}>
                                                            {m.quantity > 0 ? '+' : ''}{m.quantity} un
                                                        </Text>
                                                    </View>
                                                </View>
                                                {m.order && (
                                                    <View style={styles.movementOrderInfo}>
                                                        <Ionicons name="document-text-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
                                                        <Text style={{ fontSize: 13, color: '#334155', fontWeight: '600', flex: 1 }} numberOfLines={1}>
                                                            {m.order.displayId ? `#${m.order.displayId} - ` : ''}{m.order.title}
                                                        </Text>
                                                        <Ionicons name="chevron-forward" size={14} color="#cbd5e1" />
                                                    </View>
                                                )}
                                            </Pressable>
                                        );
                                    }}
                                />

                                { (movements.length > 0 || movementPage > 1) && (
                                    <View style={styles.paginationRow}>
                                        <Pressable 
                                            disabled={movementPage === 1}
                                            onPress={() => handlePageChange(movementPage - 1)}
                                            style={[styles.miniPageBtn, movementPage === 1 && { opacity: 0.3 }]}
                                        >
                                            <Ionicons name="chevron-back" size={20} color="#1c2d4f" />
                                        </Pressable>
                                        
                                        <Text style={styles.miniPageText}>
                                            {t('stockPage')} {movementPage}
                                        </Text>

                                        <Pressable 
                                            disabled={movements.length < MOVEMENTS_PER_PAGE}
                                            onPress={() => handlePageChange(movementPage + 1)}
                                            style={[styles.miniPageBtn, movements.length < MOVEMENTS_PER_PAGE && { opacity: 0.3 }]}
                                        >
                                            <Ionicons name="chevron-forward" size={20} color="#1c2d4f" />
                                        </Pressable>
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                </View>
            </Modal>
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
    stockCard: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 5, elevation: 2, borderWidth: 1, borderColor: '#f1f5f9' },
    cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 },
    codeBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6 },
    codeText: { fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase' },
    quantityBadge: { backgroundColor: '#ecfdf5', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1, borderColor: '#d1fae5' },
    quantityNumber: { fontSize: 18, fontWeight: '900', color: '#059669' },
    quantityUnit: { fontSize: 10, fontWeight: '800', color: '#10b981' },
    itemDescription: { fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 20 },
    cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    updatedAt: { fontSize: 11, color: '#64748b', fontWeight: '500' },
    priceText: { fontSize: 15, fontWeight: '800', color: '#16a34a' },
    loaderContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    emptyContainer: { alignItems: 'center', justifyContent: 'center', marginTop: 80, paddingHorizontal: 40 },
    emptyText: { textAlign: 'center', color: '#94a3b8', marginTop: 16, fontSize: 16, lineHeight: 24 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#f8fafc', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingBottom: 30, maxHeight: '85%' },
    modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    modalTitle: { fontSize: 18, fontWeight: '800', color: '#0f172a' },
    closeButton: { padding: 6, backgroundColor: '#f1f5f9', borderRadius: 20 },
    movementCard: { backgroundColor: '#ffffff', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
    typeIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    movementTypeLabel: { fontSize: 13, fontWeight: '800', color: '#1e293b', textTransform: 'uppercase', letterSpacing: 0.5 },
    movementDate: { fontSize: 12, color: '#64748b', marginTop: 2 },
    movementQuantity: { fontSize: 16, fontWeight: '900' },
    movementOrderInfo: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 10, borderRadius: 8, marginTop: 12, borderWidth: 1, borderColor: '#e2e8f0' },
    paginationRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', paddingVertical: 15, borderTopWidth: 1, borderTopColor: '#f1f5f9', gap: 20 },
    miniPageBtn: { padding: 8, backgroundColor: '#f1f5f9', borderRadius: 8 },
    miniPageText: { fontSize: 13, fontWeight: '700', color: '#1c2d4f' },
});
