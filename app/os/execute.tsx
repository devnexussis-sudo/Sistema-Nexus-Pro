
import React, { useRef, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, TextInput, Alert, Image, Modal } from 'react-native';
import { useLocalSearchParams, useRouter, Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ThemedView } from '@/components/themed-view';
import { ThemedText } from '@/components/themed-text';
import SignatureScreen from 'react-native-signature-canvas';
import * as ImagePicker from 'expo-image-picker';
import { ImageService } from '@/services/image-service';
import { OrderService } from '@/services/order-service';
import { ImageViewerModal } from '@/components/image-viewer-modal';


export default function ExecuteOSScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();

    // Order & Template State
    const [order, setOrder] = useState<any>(null);
    const [formTemplate, setFormTemplate] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Form State (Dynamic & Legacy)
    const [dynamicData, setDynamicData] = useState<Record<string, any>>({});
    const [signature, setSignature] = useState<string | null>(null); // Centralized signature
    const [clientName, setClientName] = useState(''); // Client Name for validation

    // UI State
    const [isSignatureModalVisible, setSignatureModalVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const signatureRef = useRef<any>(null);

    useFocusEffect(
        React.useCallback(() => {
            let isActive = true;
            setIsLoading(true);

            const loadData = async () => {
                try {
                    const orderData = await OrderService.getOrderById(id as string);
                    console.log(`[ExecuteOS] Loading Order ${id}. formId in DB: ${orderData?.formId}`);

                    if (isActive && orderData) {
                        setOrder(orderData);

                        let template: any = null;

                        // 1. Try by Form ID
                        if (orderData.formId && orderData.formId !== 'f-padrao') {
                            template = await OrderService.getFormTemplate(orderData.formId);
                            console.log(`[ExecuteOS] Template by ID ${orderData.formId}:`, template ? 'FOUND' : 'NOT FOUND');
                        }

                        // 2. Advanced Resolution: Search by Activation Rules (Type + Family)
                        if (!template) {
                            let availableTypeNames = '';
                            try {
                                console.log(`[ExecuteOS] Resolving form via Activation Rules...`);
                                const [rules, serviceTypes, equipment] = await Promise.all([
                                    OrderService.getActivationRules(),
                                    OrderService.getServiceTypes(),
                                    orderData.equipmentSerial ? OrderService.getEquipmentBySerial(orderData.equipmentSerial) : Promise.resolve(null)
                                ]);

                                availableTypeNames = serviceTypes.map(s => s.name).join(', ');

                                // Update Order Data with resolved family for debug/UI
                                if (equipment?.familyName) {
                                    orderData.equipmentFamily = equipment.familyName;
                                    setOrder({ ...orderData }); // trigger re-render
                                }

                                const typeValue = orderData.operationType || orderData.type;
                                console.log(`[ExecuteOS] Order Type Value: "${typeValue}"`);

                                const matchedServiceType = serviceTypes.find(st =>
                                    st.id === typeValue ||
                                    st.name?.trim() === typeValue?.trim() ||
                                    st.name?.toLowerCase().trim() === String(typeValue).toLowerCase().trim() ||
                                    st.name?.toLowerCase().includes(String(typeValue).toLowerCase())
                                );

                                const family = equipment?.familyName || 'Todos';
                                const typeId = matchedServiceType?.id || typeValue; // Use resolved ID or fallback to value if it looks like an ID

                                console.log(`[ExecuteOS] Resolution Context:`);
                                console.log(` - Type Value: ${typeValue}`);
                                console.log(` - Resolved ServiceType: ${matchedServiceType?.name} (ID: ${matchedServiceType?.id})`);
                                console.log(` - Equipment Family: ${family}`);

                                // Rule search: 
                                // 1. Match specific Type ID + Specific Family
                                // 2. Match specific Type ID + "Todos" Family
                                const bestRule = rules.find(r => r.serviceTypeId === typeId && r.equipmentFamily === family)
                                    || rules.find(r => r.serviceTypeId === typeId && (r.equipmentFamily === 'Todos' || !r.equipmentFamily));

                                if (bestRule) {
                                    console.log(`[ExecuteOS] Activation Rule matched! Loading Form: ${bestRule.formId}`);
                                    template = await OrderService.getFormTemplate(bestRule.formId);
                                }
                            } catch (err) {
                                console.warn("[ExecuteOS] Failed to resolve form via rules:", err);
                            }
                        }

                        // 3. Last Resort: Search by Title/Tag (Soft Match)
                        if (!template && orderData.type) {
                            console.log(`[ExecuteOS] Last Resort: Soft search for type ${orderData.type}`);
                            const allTemplates = await OrderService.getFormTemplates();
                            template = allTemplates.find(t =>
                                t.title.toLowerCase().includes(orderData.type!.toLowerCase()) ||
                                (t.serviceTypes && t.serviceTypes.includes(orderData.type!))
                            );
                        }

                        if (isActive && template) {
                            console.log(`[ExecuteOS] ✅ Form Template Applied: ${template.title}`);
                            setFormTemplate(template);

                            // Merge existing form data from OS with template defaults
                            const initialData: any = {};
                            template.fields.forEach((field: any) => {
                                initialData[field.id] = (orderData.formData && orderData.formData[field.id])
                                    ? orderData.formData[field.id]
                                    : '';
                            });
                            setDynamicData(initialData);
                            setDynamicData(initialData);
                        } else {
                            console.log(`[ExecuteOS] ⚠️ No dynamic form found. Using legacy format.`);
                            setDynamicData({
                                ...(orderData.formData || {}),
                                debugTypes: availableTypeNames // Pass debug info to UI
                            });
                        }
                    }
                } catch (error) {
                    console.error("[ExecuteOS] Error loading data:", error);
                } finally {
                    if (isActive) setIsLoading(false);
                }
            };

            loadData();
            return () => { isActive = false; };
        }, [id])
    );


    const handleSignature = (signatureData: string) => {
        setSignature(signatureData);
        setSignatureModalVisible(false);
    };

    const handleSubmit = async () => {
        if (!signature && !formTemplate) {
            // Legacy check
            Alert.alert('Atenção', 'A assinatura é obrigatória.');
            return;
        }

        if (!clientName.trim()) {
            Alert.alert('Atenção', 'O nome do cliente/responsável é obrigatório.');
            return;
        }

        // Validate Dynamic Fields
        if (formTemplate) {
            for (const field of formTemplate.fields) {
                if (field.required && !dynamicData[field.id] && field.type !== 'PHOTO' && field.type !== 'SIGNATURE') {
                    Alert.alert('Campo Obrigatório', `Por favor, preencha o campo "${field.label}".`);
                    return;
                }
            }
        }

        try {
            setIsSubmitting(true);

            // Upload dynamic photos if any
            const updatedDynamicData = { ...dynamicData };
            for (const key in updatedDynamicData) {
                const val = updatedDynamicData[key];
                if (typeof val === 'string' && (val.startsWith('file://') || val.startsWith('content://'))) {
                    // It's a local photo URI
                    const uploadedUrl = await OrderService.uploadFile(val, `orders/${id}/form_photos`);
                    if (uploadedUrl) {
                        updatedDynamicData[key] = uploadedUrl;
                    }
                }
            }

            await OrderService.completeOrder(id as string, {
                technicalReport: dynamicData['technical_report'] || '',
                partsUsed: dynamicData['parts_used'] || '',
                photos: [], // Legacy photos removed
                signature: signature,
                clientName: clientName, // Pass client name
                formData: updatedDynamicData
            });

            Alert.alert('Sucesso', 'OS finalizada com sucesso!', [
                { text: 'OK', onPress: () => router.replace('/(tabs)') }
            ]);
        } catch (error) {
            console.error(error);
            Alert.alert('Erro', 'Falha ao finalizar OS.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleTakeFieldPhoto = async (fieldId: string) => {
        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                const compressedUri = await ImageService.compressImage(result.assets[0].uri);
                setDynamicData(prev => ({ ...prev, [fieldId]: compressedUri }));
            }
        } catch (error) {
            Alert.alert('Erro', 'Não foi possível capturar a foto.');
        }
    };

    const renderDynamicField = (field: any) => {
        switch (field.type) {
            case 'TEXT':
            case 'LONG_TEXT':
                return (
                    <View key={field.id} style={styles.section}>
                        <ThemedText type="subtitle">{field.label}</ThemedText>
                        <TextInput
                            style={[styles.input, field.type === 'LONG_TEXT' && styles.textArea]}
                            placeholder={field.label}
                            multiline={field.type === 'LONG_TEXT'}
                            numberOfLines={field.type === 'LONG_TEXT' ? 4 : 1}
                            value={dynamicData[field.id]}
                            onChangeText={(text) => setDynamicData({ ...dynamicData, [field.id]: text })}
                        />
                    </View>
                );
            case 'SELECT':
                return (
                    <View key={field.id} style={styles.section}>
                        <ThemedText type="subtitle">{field.label}</ThemedText>
                        <View style={styles.pickerContainer}>
                            {(field.options || []).map((opt: string) => (
                                <Pressable
                                    key={opt}
                                    style={[styles.optionBtn, dynamicData[field.id] === opt && styles.optionBtnSelected]}
                                    onPress={() => setDynamicData({ ...dynamicData, [field.id]: opt })}
                                >
                                    <Text style={[styles.optionText, dynamicData[field.id] === opt && styles.optionTextSelected]}>{opt}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                );
            case 'PHOTO':
                return (
                    <View key={field.id} style={styles.section}>
                        <ThemedText type="subtitle">{field.label}</ThemedText>
                        {dynamicData[field.id] ? (
                            <View style={styles.photoFieldContainer}>
                                <Image source={{ uri: dynamicData[field.id] }} style={styles.photoFieldPreview} />
                                <Pressable
                                    onPress={() => setDynamicData(prev => ({ ...prev, [field.id]: undefined }))}
                                    style={styles.removePhotoBtn}
                                >
                                    <Ionicons name="trash" size={16} color="#fff" />
                                    <Text style={styles.removePhotoText}>Remover</Text>
                                </Pressable>
                            </View>
                        ) : (
                            <Pressable style={styles.photoFieldPlaceholder} onPress={() => handleTakeFieldPhoto(field.id)}>
                                <Ionicons name="camera" size={24} color="#666" />
                                <Text style={styles.photoFieldPlaceholderText}>Tirar Foto</Text>
                            </Pressable>
                        )}
                    </View>
                );
            case 'SIGNATURE':
                return (
                    <View key={field.id} style={styles.section}>
                        <ThemedText type="subtitle">{field.label}</ThemedText>
                        <Pressable
                            style={styles.signaturePlaceholderSmall}
                            onPress={() => {
                                setSignatureModalVisible(true);
                            }}
                        >
                            <Ionicons name="pencil" size={24} color="#666" />
                            <Text style={styles.signaturePlaceholderText}>Assinar aqui</Text>
                        </Pressable>
                    </View>
                );
            default:
                return null;
        }
    };

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen options={{ title: `Executando ${order?.displayId || id?.toString().slice(0, 8)}...` }} />

            <ScrollView contentContainerStyle={styles.content}>

                {/* OS INFORMATION HEADER - Premium Look */}
                {order && (
                    <View style={styles.infoCard}>
                        <View style={styles.infoCardHeader}>
                            <Ionicons name="information-circle" size={20} color="#1c2d4f" />
                            <Text style={styles.infoCardTitle}>Detalhes da Solicitação</Text>
                        </View>

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>CLIENTE</Text>
                            <Text style={styles.infoValue}>{order.customer}</Text>
                        </View>

                        {order.address && (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>ENDEREÇO</Text>
                                <Text style={styles.infoValue}>{order.address}</Text>
                            </View>
                        )}

                        <View style={styles.infoDivider} />

                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>TÍTULO DO SERVIÇO</Text>
                            <Text style={styles.infoValueBold}>{order.displayId}: {order.description?.split('\n')[0]}</Text>
                        </View>

                        {order.description && (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>DESCRIÇÃO / PROBLEMA</Text>
                                <Text style={styles.infoValueDesc}>{order.description.includes('\n') ? order.description.split('\n').slice(1).join('\n') : order.description}</Text>
                            </View>
                        )}

                        {order.equipment && (
                            <View style={styles.infoRow}>
                                <Text style={styles.infoLabel}>EQUIPAMENTO</Text>
                                <Text style={styles.infoValue}>{order.equipment} {order.serialNumber ? `(S/N: ${order.serialNumber})` : ''}</Text>
                            </View>
                        )}
                    </View>
                )}

                {/* DYNAMIC FORM RENDERING */}
                {formTemplate ? (
                    formTemplate.fields.map((field: any) => renderDynamicField(field))
                ) : (
                    // NO FORM FOUND STATE
                    <View style={styles.errorContainer}>
                        <Ionicons name="document-text-outline" size={48} color="#94a3b8" />
                        <Text style={styles.errorTitle}>
                            {order?.formId && order?.formId !== 'f-padrao' ? 'Erro ao Carregar Formulário' : 'Nenhum Formulário Vinculado'}
                        </Text>
                        <Text style={styles.errorMessage}>
                            {order?.formId && order?.formId !== 'f-padrao'
                                ? `O formulário vinculado (ID: ${order.formId}) não foi encontrado ou foi excluído.`
                                : 'Não foi encontrado um modelo de checklist para esta combinação de serviço e equipamento.'}
                        </Text>
                        <Text style={styles.errorDetail}>
                            DEBUG INFO:{'\n'}
                            OS ID: {order?.displayId || id}{'\n'}
                            Form ID (DB): {order?.formId || 'null'}{'\n'}
                            Tipo (DB): {order?.operationType || order?.type || 'null'}{'\n'}
                            Família (Calc): {order?.equipmentFamily || 'N/D'}{'\n'}
                            Available Types: {dynamicData?.debugTypes || 'Loading...'}
                        </Text>
                        <Pressable
                            style={styles.retryButton}
                            onPress={() => {
                                setIsLoading(true);
                                setTimeout(() => setIsLoading(false), 1000); // Simple refresh simulation or call loadData if moved out
                            }}
                        >
                            <Text style={styles.retryButtonText}>Tentar Novamente</Text>
                        </Pressable>
                    </View>
                )}

                {/* COMMON SECTIONS (PHOTOS & SIGNATURE) */}
                <View style={styles.section}>
                    <ThemedText type="subtitle">Validação do Cliente</ThemedText>

                    <Text style={[styles.fieldLabel, { marginTop: 12, marginBottom: 4, fontWeight: '600', color: '#666' }]}>Nome do Responsável / Cliente</Text>
                    <TextInput
                        style={styles.input}
                        placeholder="Nome de quem acompanhou o serviço"
                        value={clientName}
                        onChangeText={setClientName}
                    />

                    <Text style={[styles.fieldLabel, { marginTop: 24, marginBottom: 8, fontWeight: '600', color: '#666' }]}>Assinatura Digital</Text>
                    {signature ? (
                        <Pressable onPress={() => setSignature(null)} style={styles.signaturePreviewContainer}>
                            <Image source={{ uri: signature }} style={styles.signaturePreview} resizeMode="contain" />
                            <Text style={styles.clearSignatureText}>Toque para apagar e assinar novamente</Text>
                        </Pressable>
                    ) : (
                        <Pressable style={styles.signaturePlaceholder} onPress={() => setSignatureModalVisible(true)}>
                            <Ionicons name="pencil" size={32} color="#666" />
                            <Text style={styles.signaturePlaceholderText}>Coletar Assinatura do Cliente</Text>
                        </Pressable>
                    )}
                </View>

            </ScrollView>

            <View style={styles.footer}>
                <Pressable style={[styles.submitButton, isSubmitting && { opacity: 0.7 }]} onPress={handleSubmit} disabled={isSubmitting}>
                    <Text style={styles.submitButtonText}>{isSubmitting ? 'Finalizando...' : 'Finalizar OS'}</Text>
                </Pressable>
            </View>

            {/* Modals */}
            <Modal visible={isSignatureModalVisible} animationType="slide" onRequestClose={() => setSignatureModalVisible(false)}>
                <View style={styles.signatureModalContainer}>
                    <SignatureScreen
                        ref={signatureRef}
                        onOK={handleSignature}
                        webStyle={`.m-signature-pad--footer {display: none; margin: 0px;} body,html {width: 100%; height: 100%;}`}
                    />
                    <View style={styles.signatureFooter}>
                        <Pressable onPress={() => setSignatureModalVisible(false)} style={styles.signatureActionBtn}><Text>Cancelar</Text></Pressable>
                        <Pressable onPress={() => signatureRef.current?.readSignature()} style={[styles.signatureActionBtn, styles.confirmBtn]}><Text style={styles.confirmText}>Confirmar</Text></Pressable>
                    </View>
                </View>
            </Modal>

            <ImageViewerModal
                visible={viewerVisible}
                imageUri={selectedImage}
                onClose={() => setViewerVisible(false)}
            />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f7fa' },
    content: { padding: 16, paddingBottom: 100 },
    section: { marginBottom: 24, backgroundColor: '#fff', padding: 16, borderRadius: 12, elevation: 1 },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    input: { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 12, fontSize: 16, backgroundColor: '#fafafa', marginTop: 8 },
    textArea: { minHeight: 120, textAlignVertical: 'top' },
    addButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c2d4f', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 6, gap: 6 },
    addButtonText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    photosContainer: { flexDirection: 'row', marginTop: 8 },
    photoWrapper: { marginRight: 12 },
    photoThumbnail: { width: 100, height: 100, borderRadius: 8, backgroundColor: '#eee' },
    signaturePlaceholder: { height: 150, borderWidth: 2, borderColor: '#e0e0e0', borderStyle: 'dashed', borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa', marginTop: 8, gap: 8 },
    signaturePlaceholderText: { color: '#666', fontSize: 16 },
    signaturePreviewContainer: { alignItems: 'center', marginTop: 8 },
    signaturePreview: { width: '100%', height: 150, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0' },
    clearSignatureText: { color: '#d32f2f', fontWeight: '600', marginTop: 8 },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#fff', padding: 16, borderTopWidth: 1, borderTopColor: '#e0e0e0', paddingBottom: 40 },
    submitButton: { backgroundColor: '#2e7d32', paddingVertical: 16, borderRadius: 8, alignItems: 'center' },
    submitButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
    signatureModalContainer: { flex: 1, backgroundColor: '#fff', paddingTop: 40 },
    signatureFooter: { flexDirection: 'row', padding: 16, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#e0e0e0', paddingBottom: 40 },
    signatureActionBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8, backgroundColor: '#f5f5f5' },
    confirmBtn: { backgroundColor: '#1c2d4f' },
    confirmText: { color: '#fff' },
    pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    optionBtn: { padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0', backgroundColor: '#fafafa' },
    optionBtnSelected: { backgroundColor: '#1c2d4f', borderColor: '#1c2d4f' },
    optionText: { color: '#333' },
    optionTextSelected: { color: '#fff' },
    photoFieldContainer: { marginTop: 12, borderRadius: 8, overflow: 'hidden', position: 'relative' },
    photoFieldPreview: { width: '100%', height: 200, borderRadius: 8, backgroundColor: '#eee' },
    removePhotoBtn: { position: 'absolute', bottom: 12, right: 12, backgroundColor: 'rgba(211, 47, 47, 0.9)', flexDirection: 'row', alignItems: 'center', padding: 8, borderRadius: 6, gap: 6 },
    removePhotoText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
    photoFieldPlaceholder: { height: 120, borderWidth: 2, borderColor: '#e0e0e0', borderStyle: 'dashed', borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa', marginTop: 8, gap: 8 },
    photoFieldPlaceholderText: { color: '#666', fontSize: 14, fontWeight: '600' },
    signaturePlaceholderSmall: { height: 80, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fafafa', marginTop: 8, flexDirection: 'row', gap: 12 },

    // Info Card Styles
    infoCard: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 24, borderLeftWidth: 6, borderLeftColor: '#1c2d4f', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10 },
    infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingBottom: 10 },
    infoCardTitle: { fontSize: 16, fontWeight: '800', color: '#1c2d4f', textTransform: 'uppercase', letterSpacing: 0.5 },
    infoRow: { marginBottom: 12 },
    infoLabel: { fontSize: 10, fontWeight: 'bold', color: '#94a3b8', marginBottom: 2, letterSpacing: 1 },
    infoValue: { fontSize: 14, color: '#475569', fontWeight: '500' },
    infoDivider: { height: 1, backgroundColor: '#f0f0f0', marginVertical: 12 },
    infoValueBold: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
    infoValueDesc: { fontSize: 13, color: '#64748b', lineHeight: 18, fontStyle: 'italic' },
    fieldHint: { fontSize: 12, color: '#94a3b8', marginBottom: 8, lineHeight: 16 },
    standardField: { marginTop: 16, borderTopWidth: 1, borderTopColor: '#f0f0f0', paddingTop: 16 },
    standardLabel: { fontSize: 13, fontWeight: '700', color: '#334155', marginBottom: 10 },
    errorContainer: { padding: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff', borderRadius: 16, marginTop: 20 },
    errorTitle: { fontSize: 18, fontWeight: 'bold', color: '#1e293b', marginTop: 16, marginBottom: 8 },
    errorMessage: { fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 16, lineHeight: 20 },
    errorDetail: { fontSize: 10, color: '#94a3b8', textAlign: 'left', marginBottom: 24, backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, fontFamily: 'monospace', width: '100%' },
    retryButton: { backgroundColor: '#1c2d4f', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
    retryButtonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
