
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import React, { useState, useCallback } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, Linking, Platform, Alert, TextInput, Modal, Image, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import { STATUS_CONFIG } from '@/constants/mock-data';
import { OrderService } from '@/services/order-service';
import { ImageViewerModal } from '@/components/image-viewer-modal';

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
                setLoading(true);
                try {
                    const updatedOrder = await OrderService.getOrderById(id as string);
                    if (isActive) setOrder(updatedOrder || null);
                } catch (e) {
                    console.error(e);
                } finally {
                    if (isActive) setLoading(false);
                }
            };
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

    const isEditable = order.status === 'pending' || order.status === 'in_progress';

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
        Alert.alert(
            'Iniciar Execução',
            'Tem certeza que deseja iniciar a execução desta OS?',
            [
                { text: 'Não', style: 'cancel' },
                {
                    text: 'Sim',
                    onPress: async () => {
                        if (order.status !== 'in_progress' && order.status !== 'EM ANDAMENTO') {
                            await OrderService.startExecution(id as string);
                        }
                        router.push({
                            pathname: '/os/execute',
                            params: { id: id as string }
                        });
                    }
                }
            ]
        );
    };

    const handleBlock = () => {
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
                    <View>
                        <ThemedText type="title" style={{ marginBottom: 12, marginTop: 8 }}>Resumo da Execução</ThemedText>

                        {/* Relatório Técnico (se existir) */}
                        {(order.executionDetails?.technicalReport || order.formData?.technical_report) && (
                            <View style={styles.card}>
                                <ThemedText type="subtitle">Relatório Técnico</ThemedText>
                                <Text style={styles.infoText}>
                                    {order.executionDetails?.technicalReport || order.formData?.technical_report}
                                </Text>
                            </View>
                        )}

                        {/* Peças Utilizadas (se existir) */}
                        {(order.executionDetails?.partsUsed || order.formData?.parts_used) && (
                            <View style={styles.card}>
                                <ThemedText type="subtitle">Peças Utilizadas</ThemedText>
                                <Text style={styles.infoText}>
                                    {order.executionDetails?.partsUsed || order.formData?.parts_used}
                                </Text>
                            </View>
                        )}

                        {/* Checklist Completo e Dados do Formulário */}
                        {order.formData && Object.keys(order.formData).length > 0 && (
                            <View style={styles.card}>
                                <ThemedText type="subtitle">Checklist / Formulário</ThemedText>
                                <View style={{ marginTop: 10 }}>
                                    {Object.entries(order.formData).map(([key, val]) => {
                                        // Pular campos de sistema ou mídia
                                        const SYSTEM_KEYS = [
                                            'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
                                            'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
                                            'impediment_reason', 'impediment_photos', 'totalValue', 'price',
                                            'finishedAt', 'completedAt', 'technical_report', 'parts_used',
                                            'clientName', 'customerName', 'customerAddress', 'tenantId',
                                            'assignedTo', 'formId', 'billingStatus', 'paymentMethod',
                                            'extra_photos', 'photos', 'equipment_ids'
                                        ];
                                        const isSignatureKey = (k: string) =>
                                            k.toLowerCase().includes('assinatura') || k.toLowerCase().includes('signature') ||
                                            k.toLowerCase().includes('cpf') || k.toLowerCase().includes('nascimento');

                                        if (SYSTEM_KEYS.includes(key) || isSignatureKey(key)) return null;
                                        if (Array.isArray(val)) return null;
                                        if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:'))) return null;

                                        return (
                                            <View key={key} style={styles.dynamicFieldRow}>
                                                <Text style={styles.dynamicFieldLabel}>{key.replace(/^\[.*?\]\s*-\s*/, '').replace(/_/g, ' ')}</Text>
                                                <Text style={[
                                                    styles.dynamicFieldValue,
                                                    (val === 'OK' || val === 'Sim') && { color: '#2e7d32', fontWeight: 'bold' }
                                                ]}>
                                                    {String(val)}
                                                </Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            </View>
                        )}

                        {/* Galeria de Fotos Dinâmica (Formulário + Gerais) */}
                        {(() => {
                            const allPhotos: string[] = [];
                            if (order.executionDetails?.photos) allPhotos.push(...order.executionDetails.photos);

                            // Buscar fotos dentro de arrays ou campos simples no formData
                            if (order.formData) {
                                Object.values(order.formData).forEach(val => {
                                    if (Array.isArray(val)) {
                                        val.forEach(item => {
                                            if (typeof item === 'string' && (item.startsWith('http') || item.startsWith('data:'))) {
                                                allPhotos.push(item);
                                            }
                                        });
                                    } else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:'))) {
                                        // Evitar assinatura aqui
                                        if (!val.includes('signature')) allPhotos.push(val);
                                    }
                                });
                            }

                            const uniquePhotos = [...new Set(allPhotos)];

                            if (uniquePhotos.length > 0) {
                                return (
                                    <View style={styles.card}>
                                        <ThemedText type="subtitle">Anexos Fotográficos</ThemedText>
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosContainer}>
                                            {uniquePhotos.map((uri, index) => (
                                                <Pressable key={index} onPress={() => openImage(uri)}>
                                                    <Image source={{ uri }} style={styles.photoThumbnail} />
                                                </Pressable>
                                            ))}
                                        </ScrollView>
                                    </View>
                                );
                            }
                            return null;
                        })()}

                        {/* Assinatura */}
                        {(order.executionDetails?.signature || order.formData?.signature) && (
                            <View style={styles.card}>
                                <ThemedText type="subtitle">Assinatura do Cliente</ThemedText>
                                <Pressable onPress={() => openImage(order.executionDetails?.signature || order.formData?.signature)}>
                                    <Image
                                        source={{ uri: order.executionDetails?.signature || order.formData?.signature }}
                                        style={styles.signatureImage}
                                        resizeMode="contain"
                                    />
                                </Pressable>
                            </View>
                        )}
                    </View>
                )}

            </ScrollView>

            {/* Footer Actions - Only show if pending or in_progress */}
            {isEditable && (
                <View style={styles.footer}>
                    <Pressable style={[styles.actionButton, styles.blockButton]} onPress={handleBlock}>
                        <Ionicons name="hand-left-outline" size={20} color="#d32f2f" />
                        <Text style={styles.blockButtonText}>Impedir</Text>
                    </Pressable>

                    <Pressable style={[styles.actionButton, styles.executeButton]} onPress={handleExecute}>
                        <Ionicons name="play-outline" size={20} color="#fff" />
                        <Text style={styles.executeButtonText}>Executar</Text>
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
        backgroundColor: '#f5f7fa',
    },
    content: {
        padding: 16,
        paddingBottom: 100, // Space for footer
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#1c2d4f',
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 16,
    },
    statusText: {
        fontWeight: 'bold',
        textTransform: 'uppercase',
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 1,
    },
    infoText: {
        fontSize: 16,
        color: '#333',
        marginTop: 4,
    },
    detailRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 8,
    },
    infoTextLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#666',
        width: 70,
    },
    infoTextValue: {
        fontSize: 14,
        color: '#333',
        flex: 1,
    },
    addressText: {
        fontSize: 16,
        color: '#333',
        marginTop: 4,
        marginBottom: 12,
    },
    gpsButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#3b82f6', // GPS Blue
        paddingVertical: 10,
        borderRadius: 8,
        gap: 8,
    },
    gpsButtonText: {
        color: '#fff',
        fontWeight: '600',
        fontSize: 14,
    },
    photosContainer: {
        flexDirection: 'row',
        marginTop: 8,
    },
    photoThumbnail: {
        width: 100,
        height: 100,
        borderRadius: 8,
        backgroundColor: '#eee',
        marginRight: 12,
    },
    signatureImage: {
        width: '100%',
        height: 100,
        backgroundColor: '#fff',
        marginTop: 8,
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#fff',
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'space-between',
        borderTopWidth: 1,
        borderTopColor: '#e0e0e0',
        paddingBottom: Platform.OS === 'ios' ? 40 : 50, // Increased to avoid system UI overlap
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        flex: 0.48, // slightly less than half to leave gap
        paddingVertical: 14,
        borderRadius: 8,
        gap: 8,
    },
    blockButton: {
        backgroundColor: '#ffebee',
        borderWidth: 1,
        borderColor: '#d32f2f',
    },
    blockButtonText: {
        color: '#d32f2f',
        fontWeight: 'bold',
        fontSize: 16,
    },
    executeButton: {
        backgroundColor: '#1c2d4f',
    },
    executeButtonText: {
        color: '#fff',
        fontWeight: 'bold',
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: '#f0f0f0',
    },
    dynamicFieldLabel: {
        fontSize: 13,
        color: '#666',
        flex: 0.6,
        textTransform: 'capitalize',
    },
    dynamicFieldValue: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        flex: 0.4,
        textAlign: 'right',
    },
});

