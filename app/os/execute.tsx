import React, { useRef, useState } from 'react';
import { StyleSheet, View, Text, ScrollView, Pressable, TextInput, Alert, Image, Modal, Platform } from 'react-native';
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

    const [order, setOrder] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);

    // Multi-equipment forms state
    // { equipmentIndex_or_id: { equipamento: any, template: any, data: any } }
    const [formsConfig, setFormsConfig] = useState<Record<string, { equipamento: any, template: any, data: any }>>({});

    // Collapsible State (true means collapsed)
    const [collapsedForms, setCollapsedForms] = useState<Record<string, boolean>>({});

    const toggleFormCollapse = (eqKey: string) => {
        setCollapsedForms(prev => ({ ...prev, [eqKey]: !prev[eqKey] }));
    };

    // Global fields
    const [technicalReport, setTechnicalReport] = useState('');
    const [partsUsed, setPartsUsed] = useState('');
    const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
    const [isUploadingExtra, setIsUploadingExtra] = useState(false);

    const [signature, setSignature] = useState<string | null>(null);
    const [clientName, setClientName] = useState('');
    const [clientDoc, setClientDoc] = useState(''); // CPF/Document

    const [isSignatureModalVisible, setSignatureModalVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState<string | null>(null);
    const signatureRef = useRef<any>(null);

    const fetchTemplateForEquipment = async (orderData: any, eq: any, rules: any[], serviceTypes: any[], allTemplates: any[]) => {
        let template: any = null;
        if (eq?.form_id && eq.form_id !== 'f-padrao') {
            template = await OrderService.getFormTemplate(eq.form_id);
            if (template) return template;
        }
        if (orderData.formId && orderData.formId !== 'f-padrao') {
            template = await OrderService.getFormTemplate(orderData.formId);
            if (template) return template;
        }

        const typeValue = orderData.operationType || orderData.type;
        const matchedServiceType = serviceTypes.find(st =>
            st.id === typeValue ||
            st.name?.trim() === typeValue?.trim() ||
            st.name?.toLowerCase().trim() === String(typeValue).toLowerCase().trim() ||
            st.name?.toLowerCase().includes(String(typeValue).toLowerCase())
        );

        const family = eq?.family_name || eq?.equipmentFamily || 'Todos';
        const typeId = matchedServiceType?.id || typeValue;

        const bestRule = rules.find(r => r.serviceTypeId === typeId && r.equipmentFamily === family)
            || rules.find(r => r.serviceTypeId === typeId && (r.equipmentFamily === 'Todos' || !r.equipmentFamily));

        if (bestRule) {
            template = await OrderService.getFormTemplate(bestRule.formId);
            if (template) return template;
        }

        if (orderData.type) {
            template = allTemplates.find(t =>
                t.title.toLowerCase().includes(orderData.type!.toLowerCase()) ||
                (t.serviceTypes && t.serviceTypes.includes(orderData.type!))
            );
        }
        return template;
    };

    useFocusEffect(
        React.useCallback(() => {
            let isActive = true;
            setIsLoading(true);

            const loadData = async () => {
                try {
                    const orderData = await OrderService.getOrderById(id as string);
                    if (isActive && orderData) {
                        setOrder(orderData);

                        setTechnicalReport(orderData.formData?.technical_report || orderData.executionDetails?.technicalReport || '');
                        setPartsUsed(orderData.formData?.parts_used || orderData.executionDetails?.partsUsed || '');

                        let loadedExtraPhotos = orderData.formData?.extra_photos || orderData.executionDetails?.photos || [];
                        if (!Array.isArray(loadedExtraPhotos)) {
                            loadedExtraPhotos = [loadedExtraPhotos];
                        }
                        setExtraPhotos(loadedExtraPhotos.filter((p: any) => typeof p === 'string'));

                        const [rules, serviceTypes, allTemplates] = await Promise.all([
                            OrderService.getActivationRules(),
                            OrderService.getServiceTypes(),
                            OrderService.getFormTemplates()
                        ]);

                        const equipmentsList = (orderData.equipments && orderData.equipments.length > 0)
                            ? orderData.equipments
                            : [{ id: 'single', equipment_model: orderData.equipment, equipment_serial: orderData.serialNumber, form_id: orderData.formId }];

                        const newFormsConfig: Record<string, any> = {};

                        for (let i = 0; i < equipmentsList.length; i++) {
                            const eq = equipmentsList[i];
                            const eqKey = eq.id || `eq_${i}`;
                            const eqName = eq.equipment_model || eq.equipment_name || 'Equipamento';

                            let template = await fetchTemplateForEquipment(orderData, eq, rules, serviceTypes, allTemplates);

                            let initialData: any = {};
                            if (template) {
                                template.fields.forEach((field: any) => {
                                    const eqPrefix = `[${eqName}] - `;
                                    if (orderData.formData && orderData.formData[`${eqPrefix}${field.label}`] !== undefined) {
                                        initialData[field.id] = orderData.formData[`${eqPrefix}${field.label}`];
                                    } else if (orderData.formData && orderData.formData[field.id] !== undefined) {
                                        initialData[field.id] = orderData.formData[field.id];
                                    } else {
                                        initialData[field.id] = '';
                                    }
                                });
                            }

                            newFormsConfig[eqKey] = {
                                equipamento: eq,
                                template: template,
                                data: initialData
                            };
                        }

                        if (isActive) {
                            setFormsConfig(newFormsConfig);
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

    const handleTakeExtraPhoto = async () => {
        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.8,
            });

            if (!result.canceled && result.assets.length > 0) {
                setIsUploadingExtra(true);
                try {
                    const compressedUri = await ImageService.compressImage(result.assets[0].uri);
                    const publicUrl = await OrderService.uploadFile(compressedUri, `orders/${id}/extra_photos`, order?.tenantId);

                    if (publicUrl) {
                        setExtraPhotos(prev => [...prev, publicUrl]);
                    } else {
                        Alert.alert('Erro', 'Não foi possível fazer o upload da foto extra.');
                    }
                } finally {
                    setIsUploadingExtra(false);
                }
            }
        } catch (e) {
            Alert.alert('Erro', 'Não foi possível tirar a foto.');
        }
    };

    const handleTakeFieldPhoto = async (eqKey: string, fieldId: string) => {
        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['images'],
                quality: 0.8,
            });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setIsUploadingPhoto(`${eqKey}_${fieldId}`);
                try {
                    const compressedUri = await ImageService.compressImage(result.assets[0].uri);
                    const publicUrl = await OrderService.uploadFile(compressedUri, `orders/${id}/form_photos`, order?.tenantId);

                    if (publicUrl) {
                        setFormsConfig(prev => {
                            const newConfig = { ...prev };
                            const currentPhotos = Array.isArray(newConfig[eqKey].data[fieldId]) ? newConfig[eqKey].data[fieldId] : [];
                            if (currentPhotos.length >= 3) {
                                Alert.alert('Limite', 'Máximo 3 fotos.');
                                return prev;
                            }
                            newConfig[eqKey].data = { ...newConfig[eqKey].data, [fieldId]: [...currentPhotos, publicUrl] };
                            return newConfig;
                        });
                    } else {
                        Alert.alert('Erro', 'Erro ao enviar imagem.');
                    }
                } finally {
                    setIsUploadingPhoto(null);
                }
            }
        } catch (error) {
            Alert.alert('Erro', 'Erro ao abrir câmera.');
        }
    };

    const updateFieldData = (eqKey: string, fieldId: string, value: any) => {
        setFormsConfig(prev => {
            const newConfig = { ...prev };
            newConfig[eqKey].data = { ...newConfig[eqKey].data, [fieldId]: value };
            return newConfig;
        });
    };

    const handleSubmit = async () => {
        if (!signature) {
            Alert.alert('Atenção', 'A assinatura do cliente é obrigatória.');
            return;
        }
        if (!clientName.trim()) {
            Alert.alert('Atenção', 'O nome do cliente/responsável é obrigatório.');
            return;
        }
        if (!technicalReport.trim()) {
            Alert.alert('Atenção', 'O relatório técnico de conclusão é obrigatório.');
            return;
        }

        // Validate all forms
        for (const key in formsConfig) {
            const config = formsConfig[key];
            if (config.template) {
                for (const field of config.template.fields) {
                    if (field.required && !config.data[field.id] && field.type !== 'PHOTO' && field.type !== 'SIGNATURE') {
                        const eqDesc = config.equipamento?.equipment_model || config.equipamento?.equipment_name || 'selecionado';
                        Alert.alert('Campo Obrigatório', `Por favor, preencha o campo "${field.label}" no equipamento ${eqDesc}.`);
                        return;
                    }
                }
            }
        }

        try {
            setIsSubmitting(true);

            const finalFormData: Record<string, any> = {};

            for (const key in formsConfig) {
                const config = formsConfig[key];
                const eqName = config.equipamento?.equipment_model || config.equipamento?.equipment_name || 'Equipamento';
                const prefix = `[${eqName}${config.equipamento?.equipment_serial ? ` S/N: ${config.equipamento.equipment_serial}` : ''}] - `;

                if (config.template) {
                    for (const field of config.template.fields) {
                        let value = config.data[field.id];

                        // Safety measure for un-uploaded local URIs
                        if (Array.isArray(value)) {
                            const uploadedUrls = [];
                            for (const item of value) {
                                if (typeof item === 'string' && (item.startsWith('file://') || item.startsWith('content://') || item.startsWith('/'))) {
                                    const url = await OrderService.uploadFile(item, `orders/${id}/form_photos`, order?.tenantId);
                                    if (url) uploadedUrls.push(url);
                                } else {
                                    uploadedUrls.push(item);
                                }
                            }
                            value = uploadedUrls;
                        } else if (typeof value === 'string' && (value.startsWith('file://') || value.startsWith('content://') || value.startsWith('/'))) {
                            const url = await OrderService.uploadFile(value, `orders/${id}/form_photos`, order?.tenantId);
                            if (url) value = url;
                        }

                        if (value !== undefined && value !== '') {
                            finalFormData[`${prefix}${field.label}`] = value;
                        }
                    }
                }
            }

            finalFormData['technical_report'] = technicalReport;
            finalFormData['parts_used'] = partsUsed;
            finalFormData['extra_photos'] = extraPhotos;

            await OrderService.completeOrder(id as string, {
                technicalReport,
                partsUsed,
                photos: extraPhotos,
                signature,
                formData: finalFormData,
                clientName,
                clientDoc,
                tenantId: order?.tenantId
            });

            Alert.alert(
                'Sucesso', 'OS finalizada com sucesso!', [
                { text: 'OK', onPress: () => router.replace('/(tabs)') }
            ]);
        } catch (error) {
            console.error(error);
            Alert.alert('Erro', 'Falha ao finalizar OS.');
        } finally {
            setIsSubmitting(false);
        }
    };


    const renderDynamicField = (eqKey: string, field: any, data: any) => {
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
                            value={data[field.id]}
                            onChangeText={(text) => updateFieldData(eqKey, field.id, text)}
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
                                    style={[styles.optionBtn, data[field.id] === opt && styles.optionBtnSelected]}
                                    onPress={() => updateFieldData(eqKey, field.id, opt)}
                                >
                                    <Text style={[styles.optionText, data[field.id] === opt && styles.optionTextSelected]}>{opt}</Text>
                                </Pressable>
                            ))}
                        </View>
                    </View>
                );
            case 'PHOTO':
                const photos = Array.isArray(data[field.id]) ? data[field.id] : (data[field.id] ? [data[field.id]] : []);
                return (
                    <View key={field.id} style={styles.section}>
                        <ThemedText type="subtitle">{field.label} ({photos.length}/3)</ThemedText>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                            {photos.map((photoUri: string, index: number) => (
                                <Pressable key={index} style={{ position: 'relative', width: 100, height: 100, borderRadius: 8, overflow: 'hidden' }}
                                    onPress={() => { setSelectedImage(photoUri); setViewerVisible(true); }}>
                                    <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} />
                                    <Pressable style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(255,0,0,0.7)', alignItems: 'center', padding: 4 }}
                                        onPress={() => {
                                            const newPhotos = [...photos]; newPhotos.splice(index, 1);
                                            updateFieldData(eqKey, field.id, newPhotos);
                                        }}>
                                        <Ionicons name="trash" size={16} color="#fff" />
                                    </Pressable>
                                </Pressable>
                            ))}
                            {photos.length < 3 && (
                                <Pressable style={[styles.photoFieldPlaceholder, { width: 100, height: 100, margin: 0 }]}
                                    onPress={() => handleTakeFieldPhoto(eqKey, field.id)} disabled={isUploadingPhoto === `${eqKey}_${field.id}`}>
                                    {isUploadingPhoto === `${eqKey}_${field.id}` ? <Text style={{ fontSize: 10, color: '#666' }}>Enviando...</Text> : <><Ionicons name="camera" size={24} color="#666" /><Text style={{ fontSize: 10, color: '#666', fontWeight: 'bold' }}>Adicionar</Text></>}
                                </Pressable>
                            )}
                        </View>
                    </View>
                );
            default:
                return null;
        }
    };

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen options={{ title: `Executando OS` }} />

            <ScrollView contentContainerStyle={styles.content}>

                {/* OS INFORMATION HEADER */}
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
                        <View style={styles.infoDivider} />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>TÍTULO DO SERVIÇO</Text>
                            <Text style={styles.infoValueBold}>{order.displayId}: {order.description?.split('\n')[0]}</Text>
                        </View>
                    </View>
                )}

                {/* EQUIPMENT FORMS */}
                {Object.entries(formsConfig).map(([eqKey, config]) => {
                    const isCollapsed = !!collapsedForms[eqKey];
                    return (
                        <View key={eqKey} style={styles.equipmentGroup}>
                            <Pressable
                                style={styles.equipmentHeader}
                                onPress={() => toggleFormCollapse(eqKey)}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                    <View style={styles.equipmentIconWrapper}>
                                        <Ionicons name="hardware-chip-outline" size={18} color="#1c2d4f" />
                                    </View>
                                    <Text style={styles.equipmentTitle}>
                                        {config.equipamento?.equipment_model || config.equipamento?.equipment_name || 'Equipamento'}
                                        {config.equipamento?.equipment_serial ? ` - S/N: ${config.equipamento.equipment_serial}` : ''}
                                    </Text>
                                </View>
                                <Ionicons name={isCollapsed ? "chevron-down" : "chevron-up"} size={22} color="#fff" />
                            </Pressable>

                            {!isCollapsed && (
                                <>
                                    {config.template ? (
                                        <View style={styles.equipmentFormsContainer}>
                                            {config.template.fields.map((field: any) => renderDynamicField(eqKey, field, config.data))}
                                        </View>
                                    ) : (
                                        <View style={[styles.section, { alignItems: 'center', padding: 24, margin: 16, backgroundColor: '#f8fafc', elevation: 0 }]}>
                                            <Ionicons name="document-text-outline" size={40} color="#cbd5e1" />
                                            <Text style={{ color: '#94a3b8', marginTop: 10, fontWeight: '600' }}>Nenhum formulário dinâmico vinculado.</Text>
                                        </View>
                                    )}
                                </>
                            )}
                        </View>
                    );
                })}

                {/* CONCLUSÃO GLOBAL */}
                <View style={styles.globalConclusionSection}>
                    <View style={styles.conclusionHeader}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <View style={[styles.equipmentIconWrapper, { backgroundColor: '#e2e8f0' }]}>
                                <Ionicons name="checkmark-done-circle-outline" size={18} color="#0f172a" />
                            </View>
                            <Text style={[styles.equipmentTitle, { color: '#0f172a' }]}>Conclusão Geral da OS</Text>
                        </View>
                    </View>

                    <View style={[styles.section, { borderTopWidth: 0, marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}>
                        <ThemedText type="subtitle">Relatório Técnico</ThemedText>
                        <TextInput
                            style={[styles.input, styles.textArea]}
                            placeholder="Descreva o serviço realizado, diagnósticos e considerações finais..."
                            multiline
                            numberOfLines={4}
                            value={technicalReport}
                            onChangeText={setTechnicalReport}
                        />

                        <View style={{ marginTop: 24 }}>
                            <ThemedText type="subtitle">Peças e Materiais Utilizados</ThemedText>
                            <TextInput
                                style={[styles.input]}
                                placeholder="Anotações sobre materiais (opcional)"
                                value={partsUsed}
                                onChangeText={setPartsUsed}
                            />
                        </View>

                        <View style={{ marginTop: 24 }}>
                            <ThemedText type="subtitle">Anexos Extras ({extraPhotos.length})</ThemedText>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                                {extraPhotos.map((photoUri, index) => (
                                    <Pressable key={index} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden' }}
                                        onPress={() => { setSelectedImage(photoUri); setViewerVisible(true); }}>
                                        <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} />
                                        <Pressable style={{ position: 'absolute', bottom: 0, width: '100%', backgroundColor: 'rgba(255,0,0,0.7)', alignItems: 'center', padding: 2 }}
                                            onPress={() => setExtraPhotos(prev => prev.filter((_, i) => i !== index))}>
                                            <Ionicons name="trash" size={14} color="#fff" />
                                        </Pressable>
                                    </Pressable>
                                ))}
                                <Pressable style={[styles.photoFieldPlaceholder, { width: 80, height: 80, margin: 0, minHeight: 80 }]}
                                    onPress={handleTakeExtraPhoto} disabled={isUploadingExtra}>
                                    {isUploadingExtra ? <Text style={{ fontSize: 10, color: '#666' }}>Enviando...</Text> : <><Ionicons name="camera" size={20} color="#666" /><Text style={{ fontSize: 10, color: '#666', fontWeight: 'bold' }}>Anexar</Text></>}
                                </Pressable>
                            </View>
                        </View>
                    </View>
                </View>

                {/* SIGNATURE SECTION */}
                <View style={styles.section}>
                    <ThemedText type="subtitle">Validação do Cliente</ThemedText>
                    <Text style={[styles.fieldLabel, { marginTop: 12, marginBottom: 4, fontWeight: '600', color: '#666' }]}>Nome do Responsável / Cliente</Text>
                    <TextInput style={styles.input} placeholder="Nome de quem acompanhou o serviço" value={clientName} onChangeText={setClientName} />

                    <Text style={[styles.fieldLabel, { marginTop: 16, marginBottom: 4, fontWeight: '600', color: '#666' }]}>CPF / Documento (Opcional)</Text>
                    <TextInput style={styles.input} placeholder="Ex: 000.000.000-00" value={clientDoc} onChangeText={setClientDoc} keyboardType="numeric" />

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
                    <SignatureScreen ref={signatureRef} onOK={handleSignature}
                        webStyle={`.m-signature-pad--footer {display: none; margin: 0px;} body,html {width: 100%; height: 100%;}`}
                    />
                    <View style={styles.signatureFooter}>
                        <Pressable onPress={() => setSignatureModalVisible(false)} style={styles.signatureActionBtn}><Text>Cancelar</Text></Pressable>
                        <Pressable onPress={() => signatureRef.current?.readSignature()} style={[styles.signatureActionBtn, styles.confirmBtn]}><Text style={styles.confirmText}>Confirmar</Text></Pressable>
                    </View>
                </View>
            </Modal>

            <ImageViewerModal visible={viewerVisible} imageUri={selectedImage} onClose={() => setViewerVisible(false)} />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f8fafc' }, // Modern bluish gray
    content: { padding: 16, paddingBottom: 100 },
    section: { marginBottom: 16, backgroundColor: '#ffffff', padding: 20, borderRadius: 16, shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: '#f1f5f9' },
    input: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 12, padding: 14, fontSize: 16, backgroundColor: '#f8fafc', marginTop: 10, color: '#1e293b' },
    textArea: { minHeight: 120, textAlignVertical: 'top' },
    pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
    optionBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc' },
    optionBtnSelected: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
    optionText: { color: '#475569', fontWeight: '600' },
    optionTextSelected: { color: '#ffffff', fontWeight: 'bold' },
    photoFieldPlaceholder: { height: 120, borderWidth: 2, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', marginTop: 10, gap: 8 },
    fieldLabel: { fontSize: 13, color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    signaturePlaceholder: { height: 140, borderWidth: 2, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', marginTop: 8, gap: 8 },
    signaturePlaceholderText: { color: '#64748b', fontSize: 15, fontWeight: '600' },
    signaturePreviewContainer: { alignItems: 'center', marginTop: 12 },
    signaturePreview: { width: '100%', height: 150, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
    clearSignatureText: { color: '#e11d48', fontWeight: '700', marginTop: 10 },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingBottom: Platform.OS === 'ios' ? 40 : 20, shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.03, shadowRadius: 15, elevation: 10 },
    submitButton: { backgroundColor: '#10b981', paddingVertical: 18, borderRadius: 14, alignItems: 'center', shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
    submitButtonText: { color: '#ffffff', fontSize: 18, fontWeight: '900', letterSpacing: 0.5 },
    signatureModalContainer: { flex: 1, backgroundColor: '#ffffff', paddingTop: 40 },
    signatureFooter: { flexDirection: 'row', padding: 20, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingBottom: Platform.OS === 'ios' ? 40 : 20 },
    signatureActionBtn: { paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, backgroundColor: '#f1f5f9' },
    confirmBtn: { backgroundColor: '#0f172a' },
    confirmText: { color: '#ffffff', fontWeight: 'bold' },
    infoCard: { backgroundColor: '#ffffff', borderRadius: 16, padding: 20, marginBottom: 24, borderLeftWidth: 6, borderLeftColor: '#0f172a', shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
    infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 12 },
    infoCardTitle: { fontSize: 16, fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 },
    infoRow: { marginBottom: 14 },
    infoLabel: { fontSize: 11, fontWeight: '900', color: '#94a3b8', marginBottom: 4, letterSpacing: 0.5 },
    infoValue: { fontSize: 15, color: '#334155', fontWeight: '500' },
    infoDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 14 },
    infoValueBold: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
    equipmentGroup: { marginBottom: 24, borderRadius: 16, backgroundColor: '#ffffff', shadowColor: '#64748b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 2, borderWidth: 1, borderColor: '#f1f5f9', overflow: 'hidden' },
    equipmentHeader: { backgroundColor: '#1e293b', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    equipmentIconWrapper: { backgroundColor: '#ffffff', padding: 6, borderRadius: 8 },
    equipmentTitle: { color: '#ffffff', fontWeight: '800', fontSize: 15, flex: 1, letterSpacing: -0.2 },
    equipmentFormsContainer: { padding: 8, backgroundColor: '#f8fafc' },
    globalConclusionSection: { marginBottom: 24, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
    conclusionHeader: { backgroundColor: '#f1f5f9', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' }
});
