import { HeaderRightToggle } from '@/components/header-right-toggle';
import { ImageViewerModal } from '@/components/image-viewer-modal';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ImageService } from '@/services/image-service';
import { OrderItem, OrderService } from '@/services/order-service';
import { StockService, TechStockItem } from '@/services/stock-service';
import { syncService } from '@/services/sync-service';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import Voice, { SpeechErrorEvent, SpeechResultsEvent } from '@react-native-voice/voice';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureScreen from 'react-native-signature-canvas';

export default function ExecuteOSScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const insets = useSafeAreaInsets();

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
    const [partsUsed, setPartsUsed] = useState(''); // Text notes
    const [usedItems, setUsedItems] = useState<OrderItem[]>([]); // Structured parts
    const [extraPhotos, setExtraPhotos] = useState<string[]>([]);
    const [isUploadingExtra, setIsUploadingExtra] = useState(false);

    const [selectedPart, setSelectedPart] = useState<TechStockItem | null>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [clientName, setClientName] = useState('');
    const [clientDoc, setClientDoc] = useState(''); // CPF/Document

    const [isSignatureModalVisible, setSignatureModalVisible] = useState(false);
    const [isPartPickerVisible, setIsPartPickerVisible] = useState(false);
    const [myStock, setMyStock] = useState<TechStockItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState<string | null>(null);
    const [isRecording, setIsRecording] = useState(false);
    const signatureRef = useRef<any>(null);

    // 🎤 Configuração do Reconhecimento de Voz Gratuito (Nativo) - Refatorado para SDK 55
    useEffect(() => {
        const onSpeechStart = () => setIsRecording(true);
        const onSpeechEnd = () => setIsRecording(false);
        const onSpeechError = (e: SpeechErrorEvent) => {
            console.error('[Voice] Erro:', e);
            setIsRecording(false);
            if (e.error?.message?.includes('auth') || e.error?.message?.includes('perm')) {
                Alert.alert('Permissão', 'Acesso ao microfone negado ou não autorizado.');
            }
        };
        const onSpeechResults = (e: SpeechResultsEvent) => {
            if (e.value && e.value.length > 0) {
                const transcribed = e.value[0];
                const corrected = autoCorrectText(transcribed);
                setTechnicalReport(prev => {
                    const separator = prev ? '\n' : '';
                    return `${prev}${separator}${corrected}`;
                });
            }
        };

        Voice.onSpeechStart = onSpeechStart;
        Voice.onSpeechEnd = onSpeechEnd;
        Voice.onSpeechError = onSpeechError;
        Voice.onSpeechResults = onSpeechResults;

        return () => {
            Voice.destroy().then(Voice.removeAllListeners);
        };
    }, []);

    const autoCorrectText = (text: string) => {
        if (!text) return '';
        let cleaned = text.trim();
        cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
        if (!cleaned.endsWith('.') && !cleaned.endsWith('!') && !cleaned.endsWith('?')) {
            cleaned += '.';
        }
        return cleaned;
    };

    const handleVoiceStart = async () => {
        try {
            // 🎙️ No Android, pedimos permissão usando o PermissionsAndroid nativo do RN
            if (Platform.OS === 'android') {
                const { PermissionsAndroid } = require('react-native');
                const granted = await PermissionsAndroid.request(
                    PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
                    {
                        title: 'Permissão de Microfone',
                        message: 'Precisamos do microfone para transcrever seu relatório.',
                        buttonPositive: 'OK',
                    }
                );
                if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                    Alert.alert('Permissão Negada', 'Habilite o microfone nas configurações do seu Android para usar esta função.');
                    return;
                }
            }

            // No iOS, o Voice.start() dispara o pedido nativo.
            setIsRecording(true);

            if (!Voice || typeof Voice.start !== 'function') {
                throw new Error('voice_module_not_found');
            }

            await Voice.start('pt-BR');
        } catch (e: any) {
            setIsRecording(false);

            // Prevents Red Screen (Console Error) for known missing native module errors in Expo Go
            if (e.message?.includes('startSpeech') || e.message === 'voice_module_not_found') {
                console.log('[Voice] Módulo nativo ausente (normal no Expo Go). Erro original retirado para evitar tela vermelha.');
                Alert.alert(
                    'Função Limitada',
                    'O Reconhecimento de Voz nativo não está disponível. Isso ocorre ao usar o Expo Go porque exige bibliotecas nativas profundas. Para testar o microfone, instale a versão APK.'
                );
                return;
            }

            console.error('[Voice] Erro ao iniciar:', e);

            if (e.code === 'not_available') {
                Alert.alert('Recurso Indisponível', 'O serviço de voz do sistema não respondeu. Verifique se o Google (Android) ou Siri (iOS) estão ativos.');
            } else {
                Alert.alert(
                    'Permissão Necessária',
                    'O microfone está bloqueado. Por favor, verifique as permissões do aplicativo nas configurações do seu celular.',
                    [{ text: 'OK' }]
                );
            }
        }
    };

    const handleVoiceStop = async () => {
        try {
            await Voice.stop();
            setIsRecording(false);
        } catch (e) {
            console.error('[Voice] Erro ao parar:', e);
            setIsRecording(false);
        }
    };

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

        const family = eq?.equipment_family || eq?.equipmentFamily || 'Todos';
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

            const loadData = async (isBackground = false) => {
                try {
                    if (!isBackground) setIsLoading(true);

                    // MODO OFFLINE: tentar cache local primeiro
                    if (syncService.isOfflineModeEnabled()) {
                        const raw = await syncService.getOrderDetail(id as string);
                        if (isActive && raw) {
                            const mapped = OrderService.mapDbOrderToApp(raw);
                            mapped.equipments = raw.equipments || [];
                            setOrder(mapped);

                            // Carregar cache de preenchimento do usuário
                            const cacheKey = `os_cache_${id}`;
                            const cachedStr = await AsyncStorage.getItem(cacheKey);
                            const cache = cachedStr ? JSON.parse(cachedStr) : null;
                            if (cache) {
                                if (cache.technicalReport) setTechnicalReport(cache.technicalReport);
                                if (cache.partsUsed) setPartsUsed(cache.partsUsed);
                                if (cache.usedItems) setUsedItems(cache.usedItems);
                                if (cache.extraPhotos) setExtraPhotos(cache.extraPhotos);
                                if (cache.signature) setSignature(cache.signature);
                                if (cache.clientName) setClientName(cache.clientName);
                                if (cache.clientDoc) setClientDoc(cache.clientDoc);
                            } else {
                                if (mapped.items) setUsedItems(mapped.items);
                            }

                            // Carregar formulários offline
                            const equipmentsList = (mapped.equipments && mapped.equipments.length > 0)
                                ? mapped.equipments
                                : [{ id: 'single', equipment_model: mapped.equipment, equipment_serial: mapped.serialNumber, form_id: mapped.formId }];

                            const [rules, serviceTypes, allTemplates] = await Promise.all([
                                OrderService.getActivationRules(),
                                OrderService.getServiceTypes(),
                                OrderService.getFormTemplates(),
                            ]);

                            const newFormsConfig: Record<string, any> = {};
                            for (let i = 0; i < equipmentsList.length; i++) {
                                const eq = equipmentsList[i];
                                const eqKey = eq.id || `eq_${i}`;
                                const eqName = eq.equipment_model || eq.equipment_name || 'Equipamento';
                                const template = await fetchTemplateForEquipment(mapped, eq, rules, serviceTypes, allTemplates);
                                const initialData: any = {};
                                if (template) {
                                    template.fields.forEach((field: any) => {
                                        const prefix = `[${eqName}${eq.equipment_serial ? ` S/N: ${eq.equipment_serial}` : ''}] - `;
                                        if (cache?.formsData?.[eqKey]?.[field.id] !== undefined) initialData[field.id] = cache.formsData[eqKey][field.id];
                                        else if (mapped.formData?.[`${prefix}${field.label}`] !== undefined) initialData[field.id] = mapped.formData[`${prefix}${field.label}`];
                                        else initialData[field.id] = '';
                                    });
                                }
                                newFormsConfig[eqKey] = { equipamento: eq, template, data: initialData };
                            }
                            if (isActive) setFormsConfig(newFormsConfig);
                            if (isActive) setIsLoading(false);
                            return; // Dado encontrado — não vai para rede
                        }
                        // Sem cache local: cai no fluxo de rede abaixo
                    }

                    // 1. Fetch from Cache (Fast Load)

                    const orderData = await OrderService.getOrderById(id as string, false);
                    if (isActive && orderData) {
                        setOrder(orderData);
                        if (!isBackground) setIsLoading(false); // Remove loading spinner ASAP

                        const equipmentsList = (orderData.equipments && orderData.equipments.length > 0)
                            ? orderData.equipments
                            : [{ id: 'single', equipment_model: orderData.equipment, equipment_serial: orderData.serialNumber, form_id: orderData.formId }];

                        // Load offline user-input cache
                        const cacheKey = `os_cache_${id}`;
                        const cachedStr = await AsyncStorage.getItem(cacheKey);
                        const cache = cachedStr ? JSON.parse(cachedStr) : null;

                        if (cache) {
                            if (cache.technicalReport) setTechnicalReport(cache.technicalReport);
                            if (cache.partsUsed) setPartsUsed(cache.partsUsed);
                            if (cache.usedItems) setUsedItems(cache.usedItems);
                            if (cache.extraPhotos) setExtraPhotos(cache.extraPhotos);
                            if (cache.signature) setSignature(cache.signature);
                            if (cache.clientName) setClientName(cache.clientName);
                            if (cache.clientDoc) setClientDoc(cache.clientDoc);
                        } else {
                            if (orderData.items) setUsedItems(orderData.items);
                            setTechnicalReport(orderData.formData?.technical_report || orderData.executionDetails?.technicalReport || '');
                            setPartsUsed(orderData.formData?.parts_used || orderData.executionDetails?.partsUsed || '');
                        }

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

                        const newFormsConfig: Record<string, any> = {};

                        for (let i = 0; i < equipmentsList.length; i++) {
                            const eq = equipmentsList[i];
                            const eqKey = eq.id || `eq_${i}`;
                            const eqName = eq.equipment_model || eq.equipment_name || 'Equipamento';

                            let template = await fetchTemplateForEquipment(orderData, eq, rules, serviceTypes, allTemplates);

                            let initialData: any = {};
                            if (template) {
                                template.fields.forEach((field: any) => {
                                    const prefix = `[${eqName}${eq.equipment_serial ? ` S/N: ${eq.equipment_serial}` : ''}] - `;

                                    // 1. Check local cache first
                                    if (cache?.formsData?.[eqKey]?.[field.id] !== undefined) {
                                        initialData[field.id] = cache.formsData[eqKey][field.id];
                                    }
                                    // 2. Fallback to existing form data in DB
                                    else if (orderData.formData && orderData.formData[`${prefix}${field.label}`] !== undefined) {
                                        initialData[field.id] = orderData.formData[`${prefix}${field.label}`];
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

                        // Carregar estoque do técnico
                        try {
                            const stock = await StockService.getMyStock();
                            if (isActive) setMyStock(stock);
                        } catch (sErr) {
                            console.error("[ExecuteOS] Error loading tech stock:", sErr);
                        }
                    }
                } catch (error) {
                    console.error("[ExecuteOS] Error loading data:", error);
                } finally {
                    if (isActive) setIsLoading(false);
                }
            };

            loadData().then(() => {
                if (isActive) {
                    // 2. Fetch from Network implicitly (SWR Background Update)
                    // We only update Order data, NOT form data to prevent overwriting user input!
                    OrderService.getOrderById(id as string, true).then(freshData => {
                        if (isActive && freshData) {
                            setOrder(freshData);
                        }
                    });
                }
            });

            return () => { isActive = false; };
        }, [id])
    );

    // Auto-save to cache effect
    React.useEffect(() => {
        const saveToCache = async () => {
            // Avoid saving during initial load to not overwrite cache with empty state
            if (!id || isLoading || !order) return;

            try {
                const cacheData = {
                    formsData: Object.keys(formsConfig).reduce((acc, key) => {
                        acc[key] = formsConfig[key].data;
                        return acc;
                    }, {} as any),
                    technicalReport,
                    partsUsed,
                    usedItems,
                    extraPhotos,
                    signature,
                    clientName,
                    clientDoc,
                    timestamp: new Date().getTime()
                };

                await AsyncStorage.setItem(`os_cache_${id}`, JSON.stringify(cacheData));
            } catch (e) {
                console.error("[ExecuteOS] Error saving to cache:", e);
            }
        };

        const timeout = setTimeout(saveToCache, 1000); // Debounce save
        return () => clearTimeout(timeout);
    }, [id, formsConfig, technicalReport, partsUsed, usedItems, extraPhotos, signature, clientName, clientDoc, isLoading, order]);

    const addUsedItem = (stockItem: TechStockItem, equipmentId?: string, equipmentName?: string) => {
        const newItem: OrderItem = {
            description: stockItem.item?.description || 'Item sem descrição',
            quantity: 1,
            unitPrice: stockItem.item?.sellPrice || 0,
            total: stockItem.item?.sellPrice || 0,
            fromStock: true,
            stockItemId: stockItem.stockItemId,
            equipmentId: equipmentId,
            equipmentName: equipmentName
        };
        setUsedItems(prev => [...prev, newItem]);
        setIsPartPickerVisible(false);
    };

    const removeUsedItem = (index: number) => {
        setUsedItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSignature = (signatureData: string) => {
        setSignature(signatureData);
        setSignatureModalVisible(false);
    };

    const processPhotoChoice = async (source: 'camera' | 'library', callback: (uri: string) => void) => {
        try {
            const options: ImagePicker.ImagePickerOptions = {
                mediaTypes: ['images'],
                quality: 0.8,
            };

            const result = source === 'camera'
                ? await ImagePicker.launchCameraAsync(options)
                : await ImagePicker.launchImageLibraryAsync({ ...options, selectionLimit: 1 });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                callback(result.assets[0].uri);
            }
        } catch (e) {
            Alert.alert('Erro', 'Não foi possível acessar a mídia.');
        }
    };

    const handleTakeExtraPhoto = async () => {
        Alert.alert(
            'Adicionar Anexo',
            'Escolha a origem da imagem:',
            [
                { text: 'Câmera', onPress: () => processPhotoChoice('camera', uploadExtraPhoto) },
                { text: 'Galeria', onPress: () => processPhotoChoice('library', uploadExtraPhoto) },
                { text: 'Cancelar', style: 'cancel' }
            ]
        );
    };

    const uploadExtraPhoto = async (uri: string) => {
        setIsUploadingExtra(true);
        try {
            const compressedUri = await ImageService.compressImage(uri);
            const netInfo = await NetInfo.fetch();
            let finalUri = compressedUri;

            if (netInfo.isConnected && !syncService.isOfflineModeEnabled()) {
                const publicUrl = await OrderService.uploadFile(compressedUri, `orders/${id}/extra_photos`, order?.tenantId);
                if (publicUrl) {
                    finalUri = publicUrl;
                } else {
                    Alert.alert('Erro', 'Não foi possível fazer o upload da foto extra.');
                    return;
                }
            } else {
                // OFFLINE: copiar para documentDirectory (armazenamento permanente)
                const fileName = `offline_extra_${id}_${Date.now()}.jpg`;
                const destPath = `${FileSystem.documentDirectory}${fileName}`;
                await FileSystem.copyAsync({ from: compressedUri, to: destPath });
                finalUri = destPath;
            }

            setExtraPhotos(prev => [...prev, finalUri]);
        } finally {
            setIsUploadingExtra(false);
        }
    };

    const handleTakeFieldPhoto = (eqKey: string, fieldId: string) => {
        Alert.alert(
            'Adicionar Foto',
            'Escolha a origem da imagem:',
            [
                { text: 'Câmera', onPress: () => processPhotoChoice('camera', (uri) => uploadFieldPhoto(uri, eqKey, fieldId)) },
                { text: 'Galeria', onPress: () => processPhotoChoice('library', (uri) => uploadFieldPhoto(uri, eqKey, fieldId)) },
                { text: 'Cancelar', style: 'cancel' }
            ]
        );
    };

    const uploadFieldPhoto = async (uri: string, eqKey: string, fieldId: string) => {
        setIsUploadingPhoto(`${eqKey}_${fieldId}`);
        try {
            const compressedUri = await ImageService.compressImage(uri);
            const netInfo = await NetInfo.fetch();
            let finalUri = compressedUri;

            if (netInfo.isConnected && !syncService.isOfflineModeEnabled()) {
                const publicUrl = await OrderService.uploadFile(compressedUri, `orders/${id}/form_photos`, order?.tenantId);
                if (publicUrl) {
                    finalUri = publicUrl;
                } else {
                    Alert.alert('Erro', 'Erro ao enviar imagem.');
                    return;
                }
            } else {
                // OFFLINE: copiar para documentDirectory (armazenamento permanente)
                const fileName = `offline_form_${id}_${eqKey}_${fieldId}_${Date.now()}.jpg`;
                const destPath = `${FileSystem.documentDirectory}${fileName}`;
                await FileSystem.copyAsync({ from: compressedUri, to: destPath });
                finalUri = destPath;
            }

            setFormsConfig(prev => {
                const newConfig = { ...prev };
                const currentPhotos = Array.isArray(newConfig[eqKey].data[fieldId]) ? newConfig[eqKey].data[fieldId] : [];
                if (currentPhotos.length >= 3) {
                    Alert.alert('Limite', 'Máximo 3 fotos.');
                    return prev;
                }
                newConfig[eqKey].data = { ...newConfig[eqKey].data, [fieldId]: [...currentPhotos, finalUri] };
                return newConfig;
            });
        } finally {
            setIsUploadingPhoto(null);
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
            const netInfo = await NetInfo.fetch();
            const isOffline = !netInfo.isConnected || syncService.isOfflineModeEnabled();

            const finalFormData: Record<string, any> = {};
            let localPhotosToSync: string[] = [];

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
                                    if (isOffline) {
                                        localPhotosToSync.push(item);
                                        uploadedUrls.push(item);
                                    } else {
                                        const url = await OrderService.uploadFile(item, `orders/${id}/form_photos`, order?.tenantId);
                                        if (url) uploadedUrls.push(url);
                                    }
                                } else {
                                    uploadedUrls.push(item);
                                }
                            }
                            value = uploadedUrls;
                        } else if (typeof value === 'string' && (value.startsWith('file://') || value.startsWith('content://') || value.startsWith('/'))) {
                            if (isOffline) {
                                localPhotosToSync.push(value);
                            } else {
                                const url = await OrderService.uploadFile(value, `orders/${id}/form_photos`, order?.tenantId);
                                if (url) value = url;
                            }
                        }

                        if (value !== undefined && value !== '') {
                            finalFormData[`${prefix}${field.label}`] = value;
                        }
                    }
                }
            }

            if (isOffline) {
                for (const photo of extraPhotos) {
                    if (photo.startsWith('file://')) localPhotosToSync.push(photo);
                }
                if (signature) localPhotosToSync.push(signature);

                await syncService.addToQueue({
                    type: 'complete_os',
                    orderId: id as string,
                    payload: {
                        technical_report: technicalReport,
                        parts_used: partsUsed,
                        extraPhotos,
                        signature,
                        execution_forms: formsConfig,
                        usedItems,
                        clientName,
                        clientDoc,
                        tenantId: order?.tenantId,
                    },
                    localPhotos: localPhotosToSync
                });

                await AsyncStorage.removeItem(`os_cache_${id}`);
                Alert.alert('Salvo Offline', 'A OS foi salva e será sincronizada assim que a conexão retornar.', [
                    { text: 'OK', onPress: () => router.replace('/') }
                ]);
            } else {
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
                    tenantId: order?.tenantId,
                    items: usedItems
                });

                // Clear cache on success
                await AsyncStorage.removeItem(`os_cache_${id}`);

                Alert.alert(
                    'Sucesso', 'OS finalizada com sucesso!', [
                    { text: 'OK', onPress: () => router.replace('/') }
                ]);
            }
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
            <Stack.Screen options={{ title: `Executando OS`, headerRight: () => <HeaderRightToggle /> }} />

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
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                            <ThemedText type="subtitle">Relatório Técnico</ThemedText>

                            <Pressable
                                style={[
                                    styles.voiceButton,
                                    isRecording && styles.voiceButtonActive
                                ]}
                                onPress={isRecording ? handleVoiceStop : handleVoiceStart}
                            >
                                <Ionicons
                                    name={isRecording ? "stop-circle" : "mic"}
                                    size={20}
                                    color={isRecording ? "#ef4444" : "#1c2d4f"}
                                />
                                <Text style={[styles.voiceButtonText, isRecording && { color: '#ef4444' }]}>
                                    {isRecording ? 'Ouvindo... (Parar)' : 'Falar Relatório'}
                                </Text>
                            </Pressable>
                        </View>

                        <TextInput
                            style={[styles.input, styles.textArea, isRecording && { opacity: 0.6 }]}
                            placeholder={isRecording ? "Dite seu relatório agora..." : "Descreva o serviço realizado, diagnósticos e considerações finais..."}
                            multiline
                            numberOfLines={4}
                            value={technicalReport}
                            onChangeText={setTechnicalReport}
                        />

                        <View style={{ marginTop: 24 }}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                                <ThemedText type="subtitle">Peças e Materiais (Estoque)</ThemedText>
                                <Pressable
                                    style={styles.addPartButton}
                                    onPress={() => setIsPartPickerVisible(true)}
                                >
                                    <Ionicons name="add-circle-outline" size={18} color="#fff" />
                                    <Text style={styles.addPartButtonText}>Incluir Item</Text>
                                </Pressable>
                            </View>

                            {usedItems.length > 0 ? (
                                <View style={styles.usedItemsList}>
                                    {usedItems.map((item, index) => (
                                        <View key={index} style={styles.usedItemCard}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.usedItemDescription}>{item.description}</Text>
                                                {item.equipmentName && (
                                                    <View style={styles.itemEquipmentBadge}>
                                                        <Ionicons name="hardware-chip-outline" size={10} color="#64748b" />
                                                        <Text style={styles.itemEquipmentText}>{item.equipmentName}</Text>
                                                    </View>
                                                )}
                                                <Text style={styles.usedItemDetails}>
                                                    Qtd: {item.quantity} • Unit: R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                                </Text>
                                            </View>
                                            <Pressable onPress={() => removeUsedItem(index)} style={styles.removePartButton}>
                                                <Ionicons name="trash-outline" size={20} color="#ef4444" />
                                            </Pressable>
                                        </View>
                                    ))}
                                </View>
                            ) : (
                                <View style={styles.emptyItemsBox}>
                                    <Text style={styles.emptyItemsText}>Nenhuma peça de estoque adicionada.</Text>
                                </View>
                            )}

                            <View style={{ marginTop: 16 }}>
                                <ThemedText type="subtitle">Observações de Materiais</ThemedText>
                                <TextInput
                                    style={[styles.input]}
                                    placeholder="Dutos, conectores, parafusos ou anotações extras..."
                                    value={partsUsed}
                                    onChangeText={setPartsUsed}
                                />
                            </View>
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

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
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

            {/* MODAL: SELEÇÃO DE PEÇAS DO ESTOQUE */}
            <Modal
                visible={isPartPickerVisible}
                animationType="slide"
                transparent={true}
                onRequestClose={() => setIsPartPickerVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.bottomSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Meu Estoque</Text>
                            <Pressable onPress={() => setIsPartPickerVisible(false)}>
                                <Ionicons name="close" size={24} color="#666" />
                            </Pressable>
                        </View>

                        <FlatList
                            data={myStock}
                            keyExtractor={(item) => item.id}
                            contentContainerStyle={{ padding: 20 }}
                            ListEmptyComponent={
                                <View style={{ alignItems: 'center', padding: 40 }}>
                                    <Ionicons name="cube-outline" size={48} color="#cbd5e1" />
                                    <Text style={{ color: '#94a3b8', marginTop: 12, textAlign: 'center' }}>
                                        Nenhum item disponível no seu estoque.
                                    </Text>
                                </View>
                            }
                            renderItem={({ item }) => (
                                <Pressable
                                    style={styles.stockPickerItem}
                                    onPress={() => {
                                        const equipments = order?.equipments || [];
                                        if (equipments.length > 1) {
                                            setSelectedPart(item);
                                        } else {
                                            const eq = equipments[0];
                                            addUsedItem(item, eq?.id, eq?.equipment_model || eq?.equipment_name || order?.equipment);
                                        }
                                    }}
                                >
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.stockItemName}>{item.item?.description}</Text>
                                        <Text style={styles.stockItemCode}>{item.item?.code} • Saldo: {item.quantity}</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                                </Pressable>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            {/* MODAL: SELECIONAR EQUIPAMENTO PARA A PEÇA (Caso tenha vários) */}
            <Modal
                visible={!!selectedPart}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setSelectedPart(null)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.bottomSheet, { maxHeight: '60%' }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Vincular a qual equipamento?</Text>
                            <Pressable onPress={() => setSelectedPart(null)}>
                                <Ionicons name="close" size={24} color="#666" />
                            </Pressable>
                        </View>

                        <ScrollView style={{ padding: 20 }}>
                            {order?.equipments?.map((eq: any, idx: number) => (
                                <Pressable
                                    key={eq.id || idx}
                                    style={styles.eqSelectorItem}
                                    onPress={() => {
                                        if (selectedPart) {
                                            addUsedItem(selectedPart, eq.id, eq.equipment_model || eq.equipment_name);
                                            setSelectedPart(null);
                                        }
                                    }}
                                >
                                    <Ionicons name="hardware-chip-outline" size={20} color="#1c2d4f" />
                                    <Text style={styles.eqSelectorText}>
                                        {eq.equipment_model || eq.equipment_name || `Equipamento ${idx + 1}`}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>
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
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9', shadowColor: '#000', shadowOffset: { width: 0, height: -10 }, shadowOpacity: 0.03, shadowRadius: 15, elevation: 10 },
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
    conclusionHeader: { backgroundColor: '#f1f5f9', padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    voiceButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 20,
        gap: 6,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    voiceButtonActive: {
        backgroundColor: '#fee2e2',
        borderColor: '#fecaca',
    },
    voiceButtonDisabled: {
        opacity: 0.7,
        backgroundColor: '#f8fafc',
    },
    voiceButtonText: {
        fontSize: 12,
        fontWeight: '700',
        color: '#1c2d4f',
    },
    addPartButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#0f172a',
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 8,
        gap: 6,
    },
    addPartButtonText: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: 'bold',
    },
    usedItemsList: {
        marginTop: 8,
        gap: 12,
    },
    usedItemCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    usedItemDescription: {
        fontSize: 14,
        fontWeight: '700',
        color: '#1e293b',
    },
    itemEquipmentBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#f1f5f9',
        alignSelf: 'flex-start',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 4,
        marginTop: 4,
        gap: 4,
    },
    itemEquipmentText: {
        fontSize: 10,
        fontWeight: '600',
        color: '#64748b',
    },
    usedItemDetails: {
        fontSize: 12,
        color: '#64748b',
        marginTop: 4,
    },
    removePartButton: {
        padding: 8,
    },
    emptyItemsBox: {
        padding: 20,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: '#cbd5e1',
        alignItems: 'center',
    },
    emptyItemsText: {
        color: '#94a3b8',
        fontSize: 13,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.5)',
        justifyContent: 'flex-end',
    },
    bottomSheet: {
        backgroundColor: '#fff',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '80%',
        paddingBottom: 40,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    modalTitle: {
        fontSize: 18,
        fontWeight: 'bold',
        color: '#1c2d4f',
    },
    stockPickerItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
    },
    stockItemName: {
        fontSize: 16,
        fontWeight: '600',
        color: '#1e293b',
        marginBottom: 4,
    },
    stockItemCode: {
        fontSize: 13,
        color: '#64748b',
    },
    eqSelectorItem: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#f8fafc',
        borderRadius: 12,
        marginBottom: 10,
        gap: 12,
        borderWidth: 1,
        borderColor: '#e2e8f0',
    },
    eqSelectorText: {
        fontSize: 15,
        fontWeight: '600',
        color: '#1e293b',
    },
});
