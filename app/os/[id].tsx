
import { HeaderRightToggle } from '@/components/header-right-toggle';
import { ImageViewerModal } from '@/components/image-viewer-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { STATUS_CONFIG } from '@/constants/mock-data';
import { OrderService } from '@/services/order-service';
import { syncService } from '@/services/sync-service';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

export default function OrderDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    // Initialize order state, will be updated via useFocusEffect
    const [order, setOrder] = useState<any | null>(null);
    const [modalVisible, setModalVisible] = useState(false);
    const [impedimentReason, setImpedimentReason] = useState('');
    const [loading, setLoading] = useState(true);

    // Image viewer state
    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    useFocusEffect(
        useCallback(() => {
            let isActive = true;

            const fetchOrder = async () => {
                try {
                    // MODO OFFLINE: tentar cache local primeiro
                    if (syncService.isOfflineModeEnabled()) {
                        const raw = await syncService.getOrderDetail(id as string);
                        if (isActive && raw) {
                            const mapped = OrderService.mapDbOrderToApp(raw);
                            mapped.equipments = raw.equipments || [];
                            setOrder(mapped);
                            return; // Dado encontrado no cache — não vai para rede
                        }
                        // Sem cache local: cai no fluxo normal de rede abaixo
                    }

                    // 1. Fetch from Cache (Fast Load)
                    const cachedOrder = await OrderService.getOrderById(id as string, false);
                    if (isActive && cachedOrder) {
                        setOrder(cachedOrder);
                        setLoading(false);
                    }

                    // 2. Background network refresh
                    const freshOrder = await OrderService.getOrderById(id as string, true);
                    if (isActive && freshOrder) {
                        setOrder(freshOrder);
                    }
                } catch (e) {
                    console.error(e);
                } finally {
                    if (isActive) setLoading(false);
                }
            };

            if (loading) setLoading(true); // Ensure primary loader shows if no cache
            fetchOrder();
            return () => { isActive = false; };
        }, [id])
    );

    if (loading) {
        return (
            <ThemedView style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#1c2d4f" />
            </ThemedView>
        );
    }

    if (!order) {
        return (
            <ThemedView style={styles.container}>
                <ThemedText>Ordem de serviço não encontrada.</ThemedText>
            </ThemedView>
        );
    }

    const isEditable = ['pending', 'assigned', 'traveling', 'in_progress'].includes(order.status);

    const openGPS = () => {
        const query = encodeURIComponent(order.address);
        const url = Platform.select({
            ios: `maps:0,0?q=${query}`,
            android: `geo:0,0?q=${query}`,
        });

        if (url) {
            Linking.openURL(url).catch((err) => console.error('Error opening map: ', err));
        }
    };

    const handleExecute = () => {
        // MODO OFFLINE: ir direto para execução sem mudar status no servidor
        if (syncService.isOfflineModeEnabled()) {
            router.push({ pathname: '/os/execute', params: { id: id as string } });
            return;
        }

        if (order.status === 'assigned') {
            Alert.alert(
                'Iniciar OS',
                'Deseja iniciar o deslocamento ou já está no local do cliente?',
                [
                    { text: 'Cancelar', style: 'cancel' },
                    {
                        text: 'Iniciar Deslocamento', onPress: async () => {
                            try {
                                await OrderService.startDisplacement(id as string);
                                const updated = await OrderService.getOrderById(id as string);
                                setOrder(updated);
                            } catch (err: any) {
                                Alert.alert('Erro no Deslocamento', err?.message || String(err));
                            }
                        }
                    },
                    {
                        text: 'Já estou no cliente', onPress: async () => {
                            try {
                                await OrderService.startExecution(id as string);
                                router.push({ pathname: '/os/execute', params: { id: id as string } });
                            } catch (err: any) {
                                Alert.alert('Erro na Execução', err?.message || String(err));
                            }
                        }
                    }
                ]
            );
        } else if (order.status === 'traveling') {
            Alert.alert(
                'Chegada no Local',
                'Confirmar chegada no local do cliente e iniciar o serviço?',
                [
                    { text: 'Ainda não', style: 'cancel' },
                    {
                        text: 'Cheguei', onPress: async () => {
                            try {
                                await OrderService.startExecution(id as string);
                                router.push({ pathname: '/os/execute', params: { id: id as string } });
                            } catch (err: any) {
                                Alert.alert('Erro na Chegada', err?.message || String(err));
                            }
                        }
                    }
                ]
            );
        } else {
            Alert.alert(
                'Acessar Execução',
                'Deseja ir para a tela de execução?',
                [
                    { text: 'Não', style: 'cancel' },
                    {
                        text: 'Sim',
                        onPress: async () => {
                            try {
                                if (order.status !== 'in_progress' && order.status !== 'EM ANDAMENTO') {
                                    await OrderService.startExecution(id as string);
                                }
                                router.push({
                                    pathname: '/os/execute',
                                    params: { id: id as string }
                                });
                            } catch (err: any) {
                                Alert.alert('Erro na Execução', err?.message || String(err));
                            }
                        }
                    }
                ]
            );
        }
    };

    const handleBlock = () => {
        if (syncService.isOfflineModeEnabled()) {
            Alert.alert('Modo Offline', 'Impedimento de OS não disponível offline. Reative o modo online para registrar.');
            return;
        }
        setModalVisible(true);
    };

    const confirmBlock = async () => {
        if (!impedimentReason.trim()) {
            Alert.alert('Atenção', 'Por favor, informe o motivo do impedimento.');
            return;
        }

        try {
            await OrderService.blockOrder(order.id, impedimentReason);
            Alert.alert('Impedimento Registrado', `Motivo: ${impedimentReason}`);
            setModalVisible(false);
            setImpedimentReason('');

            // re-fetch
            const u = await OrderService.getOrderById(id as string);
            setOrder(u);
        } catch (e) {
            Alert.alert('Erro', 'Não foi possível bloquear a OS.');
        }
    };

    const openImage = (uri: string) => {
        setSelectedImage(uri);
        setViewerVisible(true);
    };

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen options={{ title: 'Detalhes da OS', headerRight: () => <HeaderRightToggle /> }} />
            <ScrollView contentContainerStyle={[styles.content, !isEditable && { paddingBottom: 20 }]}>

                {/* Header Status */}
                <View style={styles.header}>
                    <ThemedText style={styles.title}>{order.displayId || order.id}</ThemedText>
                    <View style={[styles.statusBadge, { backgroundColor: STATUS_CONFIG[order.status].color + '20' }]}>
                        <Text style={[styles.statusText, { color: STATUS_CONFIG[order.status].color }]}>
                            {STATUS_CONFIG[order.status].label}
                        </Text>
                    </View>
                </View>

                {/* Customer Info */}
                <View style={styles.card}>
                    <ThemedText type="subtitle">Cliente</ThemedText>
                    <Text style={styles.infoText}>{order.customer}</Text>
                </View>

                {/* Problem Description */}
                <View style={styles.card}>
                    <ThemedText type="subtitle">Problema Relatado</ThemedText>
                    <Text style={styles.infoText}>{order.description}</Text>
                    {order.problemReason && (
                        <Text style={[styles.infoText, { marginTop: 8, fontStyle: 'italic', color: '#666' }]}>
                            "{order.problemReason}"
                        </Text>
                    )}
                </View>

                {/* Equipment Info */}
                <View style={styles.card}>
                    <ThemedText type="subtitle">Equipamentos</ThemedText>
                    {order.equipments && order.equipments.length > 0 ? (
                        order.equipments.map((eq: any, index: number) => (
                            <View key={eq.id || index} style={{ marginTop: index > 0 ? 12 : 8, paddingTop: index > 0 ? 12 : 0, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: '#f0f0f0' }}>
                                <View style={styles.detailRow}>
                                    <Ionicons name="hardware-chip-outline" size={18} color="#666" />
                                    <Text style={styles.infoTextLabel}>Modelo:</Text>
                                    <Text style={styles.infoTextValue}>{eq.equipment_model || eq.equipment_name || 'N/A'}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Ionicons name="barcode-outline" size={18} color="#666" />
                                    <Text style={styles.infoTextLabel}>S/N:</Text>
                                    <Text style={styles.infoTextValue}>{eq.equipment_serial || 'N/A'}</Text>
                                </View>
                            </View>
                        ))
                    ) : (
                        <View style={{ marginTop: 8 }}>
                            <View style={styles.detailRow}>
                                <Ionicons name="hardware-chip-outline" size={18} color="#666" />
                                <Text style={styles.infoTextLabel}>Modelo:</Text>
                                <Text style={styles.infoTextValue}>{order.equipment || 'N/A'}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Ionicons name="barcode-outline" size={18} color="#666" />
                                <Text style={styles.infoTextLabel}>S/N:</Text>
                                <Text style={styles.infoTextValue}>{order.serialNumber || 'N/A'}</Text>
                            </View>
                        </View>
                    )}
                </View>

                {/* Address & GPS */}
                <View style={styles.card}>
                    <ThemedText type="subtitle">Endereço</ThemedText>
                    <Text style={styles.addressText}>{order.address}</Text>

                    <Pressable style={styles.gpsButton} onPress={openGPS}>
                        <Ionicons name="map" size={20} color="#fff" />
                        <Text style={styles.gpsButtonText}>Abrir no GPS</Text>
                    </Pressable>
                </View>

                {/* Blocked Reason Display */}
                {order.blockReason && (
                    <View style={[styles.card, { borderColor: '#d32f2f', borderWidth: 1 }]}>
                        <ThemedText type="subtitle" style={{ color: '#d32f2f' }}>Motivo do Impedimento</ThemedText>
                        <Text style={styles.infoText}>{order.blockReason}</Text>
                    </View>
                )}

                {/* Execution Details Display */}
                {(order.executionDetails || (order.formData && Object.keys(order.formData).length > 0)) && (
                    <View style={styles.card}>
                        <ThemedText type="title" style={{ marginBottom: 20, fontSize: 20 }}>Resumo da Execução</ThemedText>

                        {/* 1. Checklist / Formulário (Now first) */}
                        {order.formData && Object.keys(order.formData).length > 0 && (
                            <View style={styles.executionSection}>
                                <View style={styles.sectionHeader}>
                                    <Ionicons name="checkbox-outline" size={16} color="#475569" />
                                    <Text style={styles.executionSectionLabel}>Checklist / Formulário</Text>
                                </View>
                                <View style={{ marginTop: 12 }}>
                                    {(() => {
                                        const SYSTEM_KEYS = [
                                            'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
                                            'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
                                            'impediment_reason', 'impediment_photos', 'totalValue', 'price',
                                            'finishedAt', 'completedAt', 'technical_report', 'parts_used',
                                            'technicalReport', 'partsUsed', 'blockReason', 'clientDoc',
                                            'clientName', 'customerName', 'customerAddress', 'tenantId',
                                            'assignedTo', 'formId', 'billingStatus', 'paymentMethod',
                                            'extra_photos', 'photos', 'equipment_ids'
                                        ];
                                        const isSignatureKey = (k: string) =>
                                            k.toLowerCase().includes('assinatura') || k.toLowerCase().includes('signature') ||
                                            k.toLowerCase().includes('cpf') || k.toLowerCase().includes('nascimento');

                                        const formEntries = Object.entries(order.formData).filter(([key, val]) => {
                                            if (SYSTEM_KEYS.includes(key) || isSignatureKey(key)) return false;
                                            if (val === null || val === undefined || val === '') return false;
                                            // Images are now kept here to be rendered inline
                                            return true;
                                        });

                                        const groupedEntries = formEntries.reduce((acc, [key, val]) => {
                                            const match = key.match(/^\[(.*?)\]\s*(?:-|$)/);
                                            const groupName = match ? match[1] : 'Geral';
                                            if (!acc[groupName]) acc[groupName] = [];
                                            acc[groupName].push([key.replace(/^\[.*?\]\s*-\s*/, '').replace(/_/g, ' '), val]);
                                            return acc;
                                        }, {} as Record<string, [string, any][]>);

                                        if (Object.keys(groupedEntries).length === 0) return null;

                                        return Object.entries(groupedEntries).map(([group, items], i) => (
                                            <View key={group} style={{ marginBottom: i < Object.keys(groupedEntries).length - 1 ? 20 : 0 }}>
                                                {group !== 'Geral' && (
                                                    <View style={styles.groupBadge}>
                                                        <Text style={styles.groupBadgeText}>{group}</Text>
                                                    </View>
                                                )}
                                                <View style={styles.checklistItemsContainer}>
                                                    {items.map(([cleanKey, val]) => {
                                                        const isImageUrl = (v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:image'));
                                                        const isImageArray = Array.isArray(val) && val.every(v => isImageUrl(v));
                                                        const isSingleImage = isImageUrl(val);

                                                        return (
                                                            <View key={cleanKey} style={styles.dynamicFieldRow}>
                                                                <Text style={styles.dynamicFieldLabel}>{cleanKey}</Text>
                                                                {isImageArray ? (
                                                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                                                                        {val.map((uri: string, idx: number) => (
                                                                            <Pressable key={idx} onPress={() => openImage(uri)}>
                                                                                <Image source={{ uri }} style={styles.photoThumbnail} />
                                                                            </Pressable>
                                                                        ))}
                                                                    </ScrollView>
                                                                ) : isSingleImage ? (
                                                                    <Pressable onPress={() => openImage(val)} style={{ marginTop: 8 }}>
                                                                        <Image source={{ uri: val }} style={[styles.photoThumbnail, { width: '100%', height: 200 }]} resizeMode="cover" />
                                                                    </Pressable>
                                                                ) : (
                                                                    <Text style={[
                                                                        styles.dynamicFieldValue,
                                                                        (val === 'OK' || val === 'Sim') && { color: '#16a34a' }
                                                                    ]}>
                                                                        {String(val)}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        ));
                                    })()}
                                </View>
                            </View>
                        )}

                        {/* 2. Relatório Técnico */}
                        {(() => {
                            const report = order.executionDetails?.technicalReport || order.formData?.technical_report;
                            if (!report) return null;
                            return (
                                <View style={styles.executionSection}>
                                    <View style={styles.sectionHeader}>
                                        <Ionicons name="document-text-outline" size={16} color="#475569" />
                                        <Text style={styles.executionSectionLabel}>Relatório Técnico</Text>
                                    </View>
                                    <View style={styles.reportContent}>
                                        <Text style={styles.infoText}>{report}</Text>
                                    </View>
                                </View>
                            );
                        })()}

                        {/* 3. Peças Utilizadas */}
                        {(() => {
                            const parts = order.executionDetails?.partsUsed || order.formData?.parts_used;
                            if (!parts) return null;
                            return (
                                <View style={styles.executionSection}>
                                    <View style={styles.sectionHeader}>
                                        <Ionicons name="construct-outline" size={16} color="#475569" />
                                        <Text style={styles.executionSectionLabel}>Peças Utilizadas</Text>
                                    </View>
                                    <View style={styles.reportContent}>
                                        <Text style={styles.infoText}>{parts}</Text>
                                    </View>
                                </View>
                            );
                        })()}

                        {/* 4. Anexos Fotográficos (Extras do Relatório) */}
                        {(() => {
                            const allPhotos: string[] = [];
                            // Filters only extra photos that are not part of the dynamic form/checklist
                            if (order.executionDetails?.photos) allPhotos.push(...order.executionDetails.photos);
                            if (order.formData?.extra_photos) {
                                const extras = Array.isArray(order.formData.extra_photos) ? order.formData.extra_photos : [order.formData.extra_photos];
                                allPhotos.push(...extras);
                            }

                            const uniquePhotos = [...new Set(allPhotos)].filter(p => typeof p === 'string' && p.startsWith('http'));
                            if (uniquePhotos.length === 0) return null;

                            return (
                                <View style={styles.executionSection}>
                                    <View style={styles.sectionHeader}>
                                        <Ionicons name="images-outline" size={16} color="#475569" />
                                        <Text style={styles.executionSectionLabel}>Anexos do Relatório</Text>
                                    </View>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosContainer}>
                                        {uniquePhotos.map((uri, index) => (
                                            <Pressable key={index} onPress={() => openImage(uri)}>
                                                <Image source={{ uri }} style={styles.photoThumbnail} />
                                            </Pressable>
                                        ))}
                                    </ScrollView>
                                </View>
                            );
                        })()}

                        {/* Assinatura */}
                        {(order.executionDetails?.signature || order.formData?.signature) && (
                            <View style={[styles.executionSection, { borderBottomWidth: 0 }]}>
                                <View style={styles.sectionHeader}>
                                    <Ionicons name="pencil-outline" size={16} color="#475569" />
                                    <Text style={styles.executionSectionLabel}>Assinatura do Cliente</Text>
                                </View>
                                <Pressable
                                    onPress={() => openImage(order.executionDetails?.signature || order.formData?.signature)}
                                    style={styles.signatureCanvas}
                                >
                                    <Image
                                        source={{ uri: order.executionDetails?.signature || order.formData?.signature }}
                                        style={styles.signatureImage}
                                        resizeMode="contain"
                                    />
                                </Pressable>
                                {order.formData?.clientName && (
                                    <Text style={styles.clientNameText}>Responsável: {order.formData.clientName}</Text>
                                )}
                            </View>
                        )}
                    </View>
                )}

            </ScrollView>

            {/* Footer Actions - Only show if pending or in_progress */}
            {isEditable && (
                <View style={[styles.footer, order.status === 'completed' && { paddingBottom: 20 }]}>
                    <Pressable style={[styles.actionButton, styles.blockButton]} onPress={handleBlock}>
                        <Ionicons name="hand-left-outline" size={20} color="#e11d48" />
                        <Text style={styles.blockButtonText}>Impedir</Text>
                    </Pressable>

                    <Pressable style={[styles.actionButton, styles.executeButton]} onPress={handleExecute}>
                        <Ionicons name="play-outline" size={20} color="#fff" />
                        <Text style={styles.executeButtonText}>
                            {order.status === 'assigned' ? 'Iniciar OS' :
                                order.status === 'traveling' ? 'Cheguei no Local' : 'Executar'}
                        </Text>
                    </Pressable>
                </View>
            )}

            {/* Block Modal */}
            <Modal
                animationType="slide"
                transparent={true}
                visible={modalVisible}
                onRequestClose={() => setModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>Motivo do Impedimento</Text>

                        <TextInput
                            style={styles.input}
                            placeholder="Digite o motivo..."
                            multiline
                            numberOfLines={4}
                            value={impedimentReason}
                            onChangeText={setImpedimentReason}
                        />

                        <View style={styles.modalButtons}>
                            <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => setModalVisible(false)}>
                                <Text style={styles.cancelButtonText}>Cancelar</Text>
                            </Pressable>
                            <Pressable style={[styles.modalButton, styles.confirmButton]} onPress={confirmBlock}>
                                <Text style={styles.confirmButtonText}>Confirmar</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Image Viewer Modal */}
            <ImageViewerModal
                visible={viewerVisible}
                imageUri={selectedImage}
                onClose={() => setViewerVisible(false)}
            />

        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8fafc', // Sofisticated grayish blue
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f8fafc',
    },
    errorText: {
        fontSize: 16,
        color: '#64748b',
        fontWeight: '500',
    },
    content: {
        padding: 16,
        paddingBottom: 100, // Make room for footer
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 26, // Little larger, bolder
        fontWeight: '900', // Black font weight for big tech look
        color: '#0f172a',
        letterSpacing: -0.5,
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        backgroundColor: '#e6f3ff', // default fallback
    },
    statusText: {
        fontSize: 11,
        fontWeight: '900',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    card: {
        backgroundColor: '#ffffff',
        borderRadius: 16, // Softer radius
        padding: 20,
        marginBottom: 16,
        shadowColor: '#64748b',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 2,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    infoText: {
        fontSize: 16,
        color: '#334155',
        marginTop: 6,
        lineHeight: 24,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        marginTop: 12,
        gap: 12,
    },
    infoTextLabel: {
        fontSize: 13,
        fontWeight: '900',
        color: '#94a3b8',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        width: 80,
    },
    infoTextValue: {
        fontSize: 15,
        color: '#1e293b',
        flex: 1,
        fontWeight: '500',
    },
    addressText: {
        fontSize: 15,
        color: '#334155',
        marginTop: 6,
        marginBottom: 16,
        lineHeight: 22,
    },
    gpsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#f1f5f9', // Light gray blue instead of heavy blue
        paddingVertical: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
        gap: 8,
    },
    gpsButtonText: {
        color: '#3b82f6', // Bright blue text
        fontWeight: '800', // Extra bold
        fontSize: 14,
    },
    photosContainer: {
        flexDirection: 'row',
        marginTop: 12,
    },
    photoThumbnail: {
        width: 100,
        height: 100,
        borderRadius: 12,
        backgroundColor: '#f1f5f9',
        marginRight: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    signatureImage: {
        width: '100%',
        height: 120,
        backgroundColor: '#ffffff',
        marginTop: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#ffffff',
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
        // Increased padding to be safely above system gesture bars and fixed buttons
        paddingBottom: Platform.OS === 'ios' ? 54 : 45,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -12 },
        shadowOpacity: 0.1,
        shadowRadius: 24,
        elevation: 25,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 0.48, // slightly less than half to leave gap
        paddingVertical: 16,
        borderRadius: 14,
        gap: 8,
    },
    blockButton: {
        backgroundColor: '#fff1f2',
        borderWidth: 1,
        borderColor: '#fecdd3',
    },
    blockButtonText: {
        color: '#e11d48',
        fontWeight: '800',
        fontSize: 16,
    },
    executeButton: {
        backgroundColor: '#1e293b', // Deep slate
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 6,
        elevation: 4,
    },
    executeButtonText: {
        color: '#ffffff',
        fontWeight: '800',
        fontSize: 16,
    },
    // Modal Styles
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        width: '100%',
        maxWidth: 400,
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 16,
        color: '#1c2d4f',
        textAlign: 'center',
    },
    input: {
        borderWidth: 1,
        borderColor: '#ccc',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        textAlignVertical: 'top', // Android multiline fix
        minHeight: 100,
        marginBottom: 20,
    },
    modalButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    modalButton: {
        flex: 0.48,
        paddingVertical: 12,
        borderRadius: 8,
        alignItems: 'center',
    },
    cancelButton: {
        backgroundColor: '#f5f5f5',
    },
    cancelButtonText: {
        color: '#666',
        fontWeight: '600',
    },
    confirmButton: {
        backgroundColor: '#d32f2f',
    },
    confirmButtonText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    // New Styles for Dynamic Content
    dynamicFieldRow: {
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    dynamicFieldLabel: {
        fontSize: 12,
        fontWeight: '700',
        color: '#64748b',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 4,
    },
    dynamicFieldValue: {
        fontSize: 15,
        color: '#0f172a',
        fontWeight: '600',
        lineHeight: 20,
    },
    executionSection: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f1f5f9',
    },
    sectionHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 8,
    },
    executionSectionLabel: {
        fontSize: 13,
        fontWeight: '800',
        color: '#475569',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    reportContent: {
        backgroundColor: '#f8fafc',
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#f1f5f9',
    },
    groupBadge: {
        backgroundColor: '#e2e8f0',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        alignSelf: 'flex-start',
        marginBottom: 8,
    },
    groupBadgeText: {
        fontSize: 10,
        fontWeight: '900',
        color: '#475569',
        textTransform: 'uppercase',
    },
    checklistItemsContainer: {
        backgroundColor: '#ffffff',
    },
    signatureCanvas: {
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        marginTop: 8,
        borderWidth: 1,
        borderColor: '#f1f5f9',
        padding: 8,
    },
    clientNameText: {
        fontSize: 13,
        color: '#64748b',
        marginTop: 8,
        textAlign: 'center',
        fontStyle: 'italic',
    },
});

