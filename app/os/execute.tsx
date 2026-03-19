import { HeaderRightToggle } from '@/components/header-right-toggle';
import { ImageViewerModal } from '@/components/image-viewer-modal';
import { ThemedText } from '@/components/themed-text';
import { ImageService } from '@/services/image-service';
import { OrderItem, OrderService } from '@/services/order-service';
import { StockService, TechStockItem } from '@/services/stock-service';
import { syncService } from '@/services/sync-service';
import { TenantService } from '@/services/tenant-service';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
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
    const [videoUri, setVideoUri] = useState<string | null>(null);
    const [videoThumbUri, setVideoThumbUri] = useState<string | null>(null);
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);

    const [selectedPart, setSelectedPart] = useState<TechStockItem | null>(null);
    const [signature, setSignature] = useState<string | null>(null);
    const [clientName, setClientName] = useState('');
    const [clientDoc, setClientDoc] = useState(''); // CPF/Document

    const [isSignatureModalVisible, setSignatureModalVisible] = useState(false);
    const [isPartPickerVisible, setIsPartPickerVisible] = useState(false);
    const [isQuantityModalVisible, setQuantityModalVisible] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [qtyToSelect, setQtyToSelect] = useState('1');
    const [showPrice, setShowPrice] = useState(false);

    // Video states
    const [isVideoModalVisible, setVideoModalVisible] = useState(false);
    const [videoProcessingStatus, setVideoProcessingStatus] = useState<string | null>(null); // null=idle, string=msg
    const [videoSizeMB, setVideoSizeMB] = useState<number | null>(null);
    const [myStock, setMyStock] = useState<TechStockItem[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState<string | null>(null);
    const [isPartsVisible, setIsPartsVisible] = useState(false);
    const signatureRef = useRef<any>(null);
    const scrollViewRef = useRef<ScrollView>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(0);
    const [activeEquipmentKey, setActiveEquipmentKey] = useState<string | null>(null);


    const getEquipmentKeys = () => Object.keys(formsConfig);
    const totalEquipmentPages = getEquipmentKeys().length;
    // Pages: 0: Details, 1..N: Equipment Forms, N+1: Conclusion/Video, N+2: Validation
    const totalPages = 1 + totalEquipmentPages + 1 + 1;

    const nextPage = () => {
        if (currentPage < totalPages - 1) {
            setCurrentPage(prev => prev + 1);
            scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        }
    };

    const prevPage = () => {
        if (currentPage > 0) {
            setCurrentPage(prev => prev - 1);
            scrollViewRef.current?.scrollTo({ y: 0, animated: false });
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

                    // Carregar config do tenant (Preços)
                    try {
                        const settings = await TenantService.getSettings();
                        if (isActive) setShowPrice(settings.showStockPrice);
                    } catch (err) {
                        console.error("[ExecuteOS] Error loading settings:", err);
                    }

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
                                if (cache.videoUri) setVideoUri(cache.videoUri);
                                if (cache.videoThumbUri) setVideoThumbUri(cache.videoThumbUri);
                                if (cache.videoSizeMB) setVideoSizeMB(cache.videoSizeMB);
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

                            // Carregar estoque do técnico no modo offline
                            try {
                                const stock = await StockService.getMyStock();
                                if (isActive) setMyStock(stock);
                            } catch (sErr) { }

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
                            if (cache.videoUri) setVideoUri(cache.videoUri);
                            if (cache.videoThumbUri) setVideoThumbUri(cache.videoThumbUri);
                            if (cache.videoSizeMB) setVideoSizeMB(cache.videoSizeMB);
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
                    if (isActive) {
                        setIsLoading(false);
                        // Carregar configurações se não carregadas
                        TenantService.getSettings().then(s => {
                            if (isActive) setShowPrice(s.showStockPrice);
                        }).catch(() => { });
                    }
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
                    videoUri,
                    videoThumbUri,
                    videoSizeMB,
                    timestamp: new Date().getTime()
                };


                await AsyncStorage.setItem(`os_cache_${id}`, JSON.stringify(cacheData));
            } catch (e) {
                console.error("[ExecuteOS] Error saving to cache:", e);
            }
        };

        const timeout = setTimeout(saveToCache, 1000); // Debounce save
        return () => clearTimeout(timeout);
    }, [id, formsConfig, technicalReport, partsUsed, usedItems, extraPhotos, signature, clientName, clientDoc, videoUri, videoThumbUri, videoSizeMB, isLoading, order]);


    const addUsedItem = (stockItem: TechStockItem, quantity: number, equipmentId?: string, equipmentName?: string, equipmentSerial?: string) => {
        const newItem: OrderItem = {
            description: stockItem.item?.description || 'Item sem descrição',
            quantity: quantity,
            unitPrice: stockItem.item?.sellPrice || 0,
            total: (stockItem.item?.sellPrice || 0) * quantity,
            fromStock: true,
            stockItemId: stockItem.stockItemId,
            equipmentId: equipmentId,
            equipmentName: equipmentName,
            equipmentSerial: equipmentSerial
        };
        setUsedItems(prev => [...prev, newItem]);
        setIsPartPickerVisible(false);
    };

    const removeUsedItem = (index: number) => {
        setUsedItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleSignature = async (signatureData: string) => {
        setSignature(signatureData);
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
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

    // ─────────────────────────────────────────────────────────────────────────
    // PIPELINE DE VÍDEO
    // Gravar → Comprimir (react-native-compressor) → Thumbnail → Upload silencioso
    // ─────────────────────────────────────────────────────────────────────────

    const handleTakeVideo = async () => {
        try {
            const result = await ImagePicker.launchCameraAsync({
                mediaTypes: ['videos'],
                videoQuality: 1,      // 720p — qualidade boa
                allowsEditing: false, // sem edição manual
                // sem videoMaxDuration — sem limite de tempo
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
                // Inicia todo o fluxo pesado no backstage sem bloquear a UI!
                startBackstageVideoProcess(result.assets[0].uri);
            }
        } catch {
            Alert.alert('Erro', 'Não foi possível acessar a câmera.');
        }
    };

    /**
     * Motor de Compressão H265 Backstage:
     * - Anexa a miniatura IMEDIATAMENTE (dando a sensação de pronto pro usuário)
     * - Em segundo plano, roda a compressão profunda (H265) e faz o upload
     * - Substitui a opção de play por um loader na miniatura
     */
    const startBackstageVideoProcess = async (rawUri: string) => {
        try {
            const localUri = rawUri.startsWith('/') ? `file://${rawUri}` : rawUri;

            // ─── Ponto A: UI INSTANTÂNEA ──────────────────────────────────────────
            // Seta a URI pra miniatura já ocupar o card, mas travado como "processing"
            setIsUploadingVideo(true);
            setVideoProcessingStatus('Gerando miniatura...');
            setVideoUri(localUri); 
            setVideoThumbUri(null);
            setVideoSizeMB(null);

            // Thumbnail extraído nativamente (leva ms)
            try {
                const { uri: thumb } = await VideoThumbnails.getThumbnailAsync(localUri, { time: 500, quality: 0.7 });
                setVideoThumbUri(thumb);
            } catch (err) {
                console.warn('[Video] Falha na thumbnail:', err);
            }

            // A partir daqui, o card de vídeo já aparece na tela!
            // Começa o processamento pesado:
            setVideoProcessingStatus('Comprimindo (H265) Mágica Backstage...');

            // ─── Ponto B: COMPRESSÃO PROFUNDA H.265 ─────────────────────────────
            // Esta biblioteca no Expo Native foca no H264/H265 por hardware (muito rápido)
            let compressedUri = localUri;
            try {
                const isExpoGo = require('expo-constants').default.appOwnership === 'expo';
                if (!isExpoGo) {
                    const { Video } = require('react-native-compressor');
                    const result = await Video.compress(localUri, {
                        compressionMethod: 'manual',
                        bitrate: 1500000,   // Boa qualidade (1.5Mbps) superando limites pesados
                        maxSize: 720,       
                        minimumFileSizeForCompress: 0,
                    });
                    if (result) compressedUri = result;
                }
            } catch (compErr) {
                console.warn('[Video] Compressor ignorado (Expo Go ou erro):', compErr);
            }

            // Mede a redução conseguida
            const info = await FileSystem.getInfoAsync(compressedUri);
            const sizeMB = ((info as any).size ?? 0) / 1024 / 1024;
            setVideoSizeMB(Math.round(sizeMB * 10) / 10);
            
            // ─── Ponto C: UPLOAD BACKGROUND ─────────────────────────────────────
            setVideoProcessingStatus('Sincronizando com nuvem...');
            const netInfo = await NetInfo.fetch();
            
            if (!netInfo.isConnected || syncService.isOfflineModeEnabled()) {
                // Offline fallback
                const fileName = `offline_video_${id}_${Date.now()}.mp4`;
                const destPath = `${FileSystem.documentDirectory}${fileName}`;
                await FileSystem.copyAsync({ from: compressedUri, to: destPath });
                setVideoUri(destPath);
            } else {
                // Upload normal para o Storage
                const publicUrl = await OrderService.uploadFile(
                    compressedUri,
                    `orders/${id}/videos`,
                    order?.tenantId,
                    'video/mp4'
                );

                if (publicUrl) {
                    setVideoUri(publicUrl); // Troca a URL local pela URL Pública da CDN
                }
            }
        } catch (error) {
            console.error('[Video] Erro backstage fatal:', error);
            Alert.alert('Erro', 'Ocorreu um erro ao otimizar o vídeo.');
        } finally {
            // Libera o Play Button e remove spinners
            setIsUploadingVideo(false);
            setVideoProcessingStatus(null);
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
                if (videoUri && videoUri.startsWith('file://')) localPhotosToSync.push(videoUri);

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
                        videoUrl: videoUri,
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
                    videoUrl: videoUri,
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
                    <View key={field.id} style={styles.dynamicFieldControl}>
                        <Text style={styles.dynamicFieldLabel}>{field.label}</Text>
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
                    <View key={field.id} style={styles.dynamicFieldControl}>
                        <Text style={styles.dynamicFieldLabel}>{field.label}</Text>
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
                    <View key={field.id} style={styles.dynamicFieldControl}>
                        <Text style={styles.dynamicFieldLabel}>{field.label} ({photos.length}/3)</Text>
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
        <KeyboardAvoidingView style={[{ flex: 1 }, styles.container]} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 80}>
            <Stack.Screen options={{ title: `Execução - Página ${currentPage + 1}/${totalPages}`, headerRight: () => <HeaderRightToggle /> }} />

            <ScrollView ref={scrollViewRef} contentContainerStyle={styles.content} scrollEnabled={true}>

                {/* PROGRESS BAR */}
                <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBar, { width: `${((currentPage + 1) / totalPages) * 100}%` }]} />
                </View>

                {/* PAGE 0: OS INFORMATION HEADER */}
                {currentPage === 0 && order && (
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
                        <View style={styles.infoDivider} />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>EQUIPAMENTOS RELACIONADOS</Text>
                            {order.equipments && order.equipments.length > 0 ? (
                                order.equipments.map((eq: any, idx: number) => (
                                    <View key={eq.id || idx} style={{ marginTop: 4 }}>
                                        <Text style={styles.infoValue}>• {eq.equipment_model || eq.equipment_name} (S/N: {eq.equipment_serial || 'N/A'})</Text>
                                    </View>
                                ))
                            ) : (
                                <Text style={styles.infoValue}>• {order.equipment} (S/N: {order.serialNumber || 'N/A'})</Text>
                            )}
                        </View>
                    </View>
                )}

                {/* PAGES 1..N: EQUIPMENT FORMS */}
                {currentPage > 0 && currentPage <= totalEquipmentPages && (() => {
                    const eqKeys = getEquipmentKeys();
                    const eqKey = eqKeys[currentPage - 1];
                    const config = formsConfig[eqKey];
                    if (!config) return null;

                    return (
                        <View key={eqKey} style={styles.equipmentGroup}>
                            <View style={styles.equipmentHeader}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                    <View style={styles.equipmentIconWrapper}>
                                        <Ionicons name="hardware-chip-outline" size={18} color="#1c2d4f" />
                                    </View>
                                    <Text style={styles.equipmentTitle}>
                                        {config.equipamento?.equipment_model || config.equipamento?.equipment_name || 'Equipamento'}
                                        {config.equipamento?.equipment_serial ? ` - S/N: ${config.equipamento.equipment_serial}` : ''}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.equipmentFormsContainer}>
                                {config.template ? (
                                    config.template.fields.map((field: any) => renderDynamicField(eqKey, field, config.data))
                                ) : (
                                    <View style={[styles.dynamicFieldControl, { alignItems: 'center', padding: 24, margin: 12, backgroundColor: '#f8fafc', elevation: 0 }]}>
                                        <Ionicons name="document-text-outline" size={40} color="#cbd5e1" />
                                        <Text style={{ color: '#94a3b8', marginTop: 10, fontWeight: '600' }}>Nenhum formulário dinâmico vinculado.</Text>
                                    </View>
                                )}
                            </View>

                            {/* PART INCLUSION FOR THIS EQUIPMENT */}
                            <Pressable 
                                style={[styles.showPartsButton, { marginHorizontal: 12, marginBottom: 16 }]} 
                                onPress={() => {
                                    setActiveEquipmentKey(eqKey);
                                    setIsPartPickerVisible(true);
                                }}
                            >

                                <Ionicons name="add-circle-outline" size={20} color="#ffffff" />
                                <Text style={styles.showPartsButtonText}>Incluir Peça para este Equipamento</Text>
                            </Pressable>

                            {/* List parts already added to this equipment */}
                            {usedItems.filter(item => item.equipmentId === config.equipamento?.id || (config.equipamento?.id === 'single' && !item.equipmentId)).length > 0 && (
                                <View style={{ paddingHorizontal: 12, marginBottom: 16 }}>
                                    <Text style={[styles.infoLabel, { marginBottom: 8 }]}>PEÇAS VINCULADAS:</Text>
                                    {usedItems
                                        .filter(item => item.equipmentId === config.equipamento?.id || (config.equipamento?.id === 'single' && !item.equipmentId))
                                        .map((item, idx) => (
                                            <View key={idx} style={[styles.usedItemCard, { marginBottom: 6 }]}>
                                                <Text style={[styles.usedItemDescription, { flex: 1 }]}>{item.description} (x{item.quantity})</Text>
                                                <Pressable onPress={() => removeUsedItem(usedItems.indexOf(item))}>
                                                    <Ionicons name="trash-outline" size={18} color="#ef4444" />
                                                </Pressable>
                                            </View>
                                        ))
                                    }
                                </View>
                            )}
                        </View>
                    );
                })()}

                {/* PAGE N+1: CONCLUSÃO GLOBAL / VÍDEO */}
                {currentPage === totalEquipmentPages + 1 && (
                    <View style={[styles.globalConclusionSection, { marginTop: 4, backgroundColor: '#fdfcf0', borderColor: '#eab308' }]}>
                        <View style={[styles.conclusionHeader, { backgroundColor: '#fef9c3' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={[styles.equipmentIconWrapper, { backgroundColor: '#fef3c7' }]}>
                                    <Ionicons name="checkmark-done-circle-outline" size={18} color="#854d0e" />
                                </View>
                                <Text style={[styles.equipmentTitle, { color: '#854d0e' }]}>Conclusão Geral do Atendimento</Text>
                            </View>
                        </View>

                        <View style={[styles.section, { borderTopWidth: 0, marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, backgroundColor: 'transparent', elevation: 0, borderWidth: 0 }]}>
                            <ThemedText type="subtitle" style={{ marginBottom: 8 }}>Relatório Técnico Final</ThemedText>
                            <TextInput
                                style={[styles.input, styles.textArea]}
                                placeholder={"Descreva as ações realizadas no atendimento..."}
                                multiline
                                numberOfLines={4}
                                value={technicalReport}
                                onChangeText={setTechnicalReport}
                            />

                            {/* VÍDEO SECTION ON THIS PAGE */}
                            <View style={[styles.card, { marginTop: 20, elevation: 0, backgroundColor: '#ffffff' }]}>
                                <View style={styles.cardHeader}>
                                    <Ionicons name="videocam" size={16} color="#059669" />
                                    <ThemedText style={styles.cardTitle}>Vídeo Evidência</ThemedText>
                                </View>
                                <View style={styles.cardContent}>
                                    {videoUri ? (
                                        <Pressable
                                            style={styles.videoPreviewCard}
                                            disabled={isUploadingVideo}
                                            onPress={() => {
                                                const playUri = videoUri.startsWith('http')
                                                    ? videoUri : (videoUri.startsWith('/') ? `file://${videoUri}` : videoUri);
                                                Linking.openURL(playUri).catch(() => Alert.alert('Erro', 'Não foi possível reproduzir o vídeo.'));
                                            }}
                                        >
                                            <View style={styles.videoThumbContainer}>
                                                {videoThumbUri ? (
                                                    <Image source={{ uri: videoThumbUri }} style={styles.videoThumbImage} resizeMode="cover" />
                                                ) : (
                                                    <Ionicons name="film-outline" size={40} color="rgba(255,255,255,0.25)" />
                                                )}
                                                {isUploadingVideo ? (
                                                    <View style={styles.videoProcessingOverlay}>
                                                        <ActivityIndicator size="large" color="#10b981" />
                                                        <Text style={styles.videoProcessingOverlayText}>{videoProcessingStatus || 'Processando...'}</Text>
                                                    </View>
                                                ) : (
                                                    <View style={styles.videoPlayOverlay}>
                                                        <Ionicons name="play-circle" size={50} color="#fff" />
                                                    </View>
                                                )}
                                            </View>
                                            <View style={styles.videoMetaBar}>
                                                <Text style={styles.videoMetaText}>Vídeo Anexado {videoSizeMB ? `(${videoSizeMB}MB)` : ''}</Text>
                                                {!isUploadingVideo && (
                                                    <Pressable onPress={() => setVideoUri(null)}>
                                                        <Ionicons name="trash-outline" size={18} color="#ef4444" />
                                                    </Pressable>
                                                )}
                                            </View>
                                        </Pressable>
                                    ) : (
                                        <Pressable style={styles.videoRecordButton} onPress={handleTakeVideo}>
                                            <Ionicons name="videocam" size={24} color="#059669" />
                                            <View style={{ flex: 1, marginLeft: 12 }}>
                                                <Text style={styles.videoRecordTitle}>Gravar Vídeo de Conclusão</Text>
                                                <Text style={styles.videoRecordSubtitle}>Qualidade ótima, tamanho reduzido</Text>
                                            </View>
                                        </Pressable>
                                    )}
                                </View>
                            </View>

                            {/* EXTRA PHOTOS */}
                            <View style={{ marginTop: 20 }}>
                                <ThemedText type="subtitle">Fotos Extras (Opcional)</ThemedText>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 }}>
                                    {extraPhotos.map((photoUri, index) => (
                                        <Pressable key={index} style={{ position: 'relative', width: 80, height: 80, borderRadius: 8, overflow: 'hidden' }}
                                            onPress={() => { setSelectedImage(photoUri); setViewerVisible(true); }}>
                                            <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} />
                                            <Pressable style={{ position: 'absolute', top: 0, right: 0, backgroundColor: 'rgba(255,0,0,0.7)', padding: 2 }}
                                                onPress={() => setExtraPhotos(prev => prev.filter((_, i) => i !== index))}>
                                                <Ionicons name="close" size={14} color="#fff" />
                                            </Pressable>
                                        </Pressable>
                                    ))}
                                    <Pressable style={[styles.photoFieldPlaceholder, { width: 80, height: 80, marginTop: 0 }]}
                                        onPress={handleTakeExtraPhoto} disabled={isUploadingExtra}>
                                        <Ionicons name="camera" size={20} color="#666" />
                                        <Text style={{ fontSize: 10, color: '#666' }}>Anexar</Text>
                                    </Pressable>
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* PAGE N+2: VALIDATION */}
                {currentPage === totalEquipmentPages + 2 && (
                    <View style={styles.section}>
                        <ThemedText type="subtitle">Validação do Cliente</ThemedText>
                        <Text style={[styles.fieldLabel, { marginTop: 12, marginBottom: 4 }]}>Nome do Responsável</Text>
                        <TextInput style={styles.input} placeholder="Quem acompanhou o serviço" value={clientName} onChangeText={setClientName} />

                        <Text style={[styles.fieldLabel, { marginTop: 24, marginBottom: 8 }]}>Assinatura Digital</Text>
                        {signature ? (
                            <Pressable onPress={() => setSignature(null)} style={styles.signaturePreviewContainer}>
                                <Image source={{ uri: signature }} style={styles.signaturePreview} resizeMode="contain" />
                                <Text style={styles.clearSignatureText}>Tocar para refazer</Text>
                            </Pressable>
                        ) : (
                            <Pressable style={styles.signaturePlaceholder} onPress={async () => {
                                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
                                setSignatureModalVisible(true);
                            }}>
                                <Ionicons name="pencil" size={32} color="#666" />
                                <Text style={styles.signaturePlaceholderText}>Coletar Assinatura</Text>
                            </Pressable>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* NEW PAGINATED FOOTER */}
            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 16, 24) }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                    {currentPage > 0 ? (
                        <Pressable style={[styles.paginationButton, styles.backButton]} onPress={prevPage}>
                            <Ionicons name="chevron-back" size={20} color="#475569" />
                            <Text style={styles.backButtonText}>Anterior</Text>
                        </Pressable>
                    ) : (
                        <View style={{ flex: 1 }} />
                    )}

                    {currentPage < totalPages - 1 ? (
                        <Pressable style={[styles.paginationButton, styles.nextButton]} onPress={nextPage}>
                            <Text style={styles.nextButtonText}>Próximo</Text>
                            <Ionicons name="chevron-forward" size={20} color="#fff" />
                        </Pressable>
                    ) : (
                        <Pressable style={[styles.submitButton, { flex: 1 }, isSubmitting && { opacity: 0.7 }]} onPress={handleSubmit} disabled={isSubmitting}>
                            <Text style={styles.submitButtonText}>{isSubmitting ? 'Enviando...' : 'Finalizar OS'}</Text>
                        </Pressable>
                    )}
                </View>
            </View>

            {/* Modals */}
            <Modal visible={isSignatureModalVisible} animationType="slide" onRequestClose={async () => {
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                setSignatureModalVisible(false);
            }}>
                <View style={styles.signatureModalContainer}>
                    <SignatureScreen ref={signatureRef} onOK={handleSignature}
                        webStyle={`.m-signature-pad--footer {display: none; margin: 0px;} body,html {width: 100%; height: 100%;}`}
                    />
                    <View style={[styles.signatureFooter, { paddingBottom: Math.max(insets.bottom + 20, 24) }]}>
                        <Pressable onPress={async () => {
                            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                            setSignatureModalVisible(false);
                        }} style={styles.signatureActionBtn}><Text>Cancelar</Text></Pressable>
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

                        <View style={{ padding: 16, backgroundColor: '#f8fafc', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                            <View style={styles.searchContainer}>
                                <Ionicons name="search" size={18} color="#94a3b8" />
                                <TextInput
                                    style={styles.searchInputStyle}
                                    placeholder="Pesquisar por nome ou código..."
                                    value={searchQuery}
                                    onChangeText={setSearchQuery}
                                />
                                {searchQuery.length > 0 && (
                                    <Pressable onPress={() => setSearchQuery('')}>
                                        <Ionicons name="close-circle" size={18} color="#cbd5e1" />
                                    </Pressable>
                                )}
                            </View>
                        </View>

                        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
                            {(() => {
                                const filtered = myStock.filter(s =>
                                    s.item?.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                                    s.item?.code.toLowerCase().includes(searchQuery.toLowerCase())
                                );

                                if (filtered.length === 0) {
                                    return (
                                        <View style={{ alignItems: 'center', padding: 40 }}>
                                            <Ionicons name="cube-outline" size={48} color="#cbd5e1" />
                                            <Text style={{ color: '#94a3b8', marginTop: 12, textAlign: 'center' }}>
                                                {searchQuery ? 'Nenhhum item corresponde à busca.' : 'Nenhum item disponível no seu estoque.'}
                                            </Text>
                                        </View>
                                    );
                                }

                                return filtered.map((item) => (
                                    <Pressable
                                        key={item.id}
                                        style={styles.stockPickerItem}
                                        onPress={() => {
                                            setSelectedPart(item);
                                            setQtyToSelect('1');
                                            setQuantityModalVisible(true);
                                            setIsPartPickerVisible(false);
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={styles.stockItemName}>{item.item?.description}</Text>
                                            <Text style={styles.stockItemCode}>
                                                {item.item?.code} • Saldo: {item.quantity}
                                                {showPrice ? ` • R$ ${item.item?.sellPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : ''}
                                            </Text>
                                        </View>
                                        <Ionicons name="chevron-forward" size={20} color="#cbd5e1" />
                                    </Pressable>
                                ));
                            })()}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* MODAL: DEFINIR QUANTIDADE */}
            <Modal
                visible={isQuantityModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setQuantityModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.bottomSheet, { paddingBottom: 20 }]}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Definir Quantidade</Text>
                            <Pressable onPress={() => { setQuantityModalVisible(false); setSelectedPart(null); }}>
                                <Ionicons name="close" size={24} color="#666" />
                            </Pressable>
                        </View>
                        <View style={{ padding: 24, alignItems: 'center' }}>
                            <Text style={{ fontSize: 16, color: '#334155', marginBottom: 16, fontWeight: '600' }}>
                                {selectedPart?.item?.description}
                            </Text>

                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 24 }}>
                                <Pressable
                                    onPress={() => setQtyToSelect(prev => Math.max(1, parseInt(prev || '1') - 1).toString())}
                                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Ionicons name="remove" size={24} color="#1e293b" />
                                </Pressable>

                                <TextInput
                                    style={{ fontSize: 32, fontWeight: 'bold', color: '#1e293b', textAlign: 'center', minWidth: 60 }}
                                    keyboardType="numeric"
                                    value={qtyToSelect}
                                    onChangeText={setQtyToSelect}
                                    autoFocus
                                />

                                <Pressable
                                    onPress={() => setQtyToSelect(prev => (parseInt(prev || '1') + 1).toString())}
                                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Ionicons name="add" size={24} color="#1e293b" />
                                </Pressable>
                            </View>

                            <Pressable
                                style={{ backgroundColor: '#0f172a', width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center' }}
                                onPress={() => {
                                    const q = parseInt(qtyToSelect) || 0;

                                    if (q <= 0) {
                                        Alert.alert('Quantidade inválida', 'Informe uma quantidade maior que zero.');
                                        return;
                                    }

                                    if (selectedPart && q > selectedPart.quantity) {
                                        Alert.alert(
                                            'Saldo insuficiente',
                                            `Você possui apenas ${selectedPart.quantity} unidades deste item em estoque.`
                                        );
                                        return;
                                    }

                                    if (activeEquipmentKey) {
                                        const config = formsConfig[activeEquipmentKey];
                                        const eq = config.equipamento;
                                        if (selectedPart) {
                                            addUsedItem(
                                                selectedPart,
                                                q,
                                                eq?.id,
                                                eq?.equipment_model || eq?.equipment_name || order?.equipment,
                                                eq?.equipment_serial || order?.serialNumber
                                            );
                                        }
                                        setQuantityModalVisible(false);
                                        setSelectedPart(null);
                                        setActiveEquipmentKey(null);
                                        return;
                                    }

                                    const equipments = order?.equipments || [];

                                    if (equipments.length > 1) {
                                        setQuantityModalVisible(false);
                                        // selectedPart já está setado, então o próximo modal (equipamento) abrirá
                                    } else {
                                        const eq = equipments[0];
                                        if (selectedPart) {
                                            addUsedItem(
                                                selectedPart,
                                                q,
                                                eq?.id,
                                                eq?.equipment_model || eq?.equipment_name || order?.equipment,
                                                eq?.equipment_serial || order?.serialNumber
                                            );
                                        }
                                        setQuantityModalVisible(false);
                                        setSelectedPart(null);
                                    }
                                }}
                            >
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Confirmar</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL: SELECIONAR EQUIPAMENTO PARA A PEÇA (Caso tenha vários) */}
            <Modal
                visible={!!selectedPart && !isQuantityModalVisible}
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
                                            addUsedItem(
                                                selectedPart,
                                                parseInt(qtyToSelect) || 1,
                                                eq.id,
                                                eq.equipment_model || eq.equipment_name,
                                                eq.equipment_serial
                                            );
                                            setSelectedPart(null);
                                        }
                                    }}
                                >
                                    <Ionicons name="hardware-chip-outline" size={20} color="#1c2d4f" />
                                    <Text style={styles.eqSelectorText}>
                                        {eq.equipment_model || eq.equipment_name || `Equipamento ${idx + 1}`}
                                        {eq.equipment_serial ? ` (S/N: ${eq.equipment_serial})` : ''}
                                    </Text>
                                </Pressable>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f1f5f9' },
    content: { padding: 14, paddingBottom: 100 },
    section: { marginBottom: 14, backgroundColor: '#ffffff', padding: 16, borderRadius: 14, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: '#e2e8f0' },
    dynamicFieldControl: { marginBottom: 12, backgroundColor: '#ffffff', padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#64748b', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 3, elevation: 1 },
    dynamicFieldLabel: { fontSize: 13, fontWeight: '700', color: '#1e293b', marginBottom: 2 },
    input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#f8fafc', marginTop: 6, color: '#1e293b' },
    textArea: { minHeight: 90, textAlignVertical: 'top' },
    pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
    optionBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
    optionBtnSelected: { backgroundColor: '#0f172a', borderColor: '#0f172a' },
    optionText: { color: '#475569', fontWeight: '600', fontSize: 13 },
    optionTextSelected: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
    photoFieldPlaceholder: { height: 90, borderWidth: 1.5, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', marginTop: 8, gap: 6 },
    fieldLabel: { fontSize: 11, color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    signaturePlaceholder: { height: 110, borderWidth: 1.5, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', marginTop: 8, gap: 8 },
    signaturePlaceholderText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
    signaturePreviewContainer: { alignItems: 'center', marginTop: 10 },
    signaturePreview: { width: '100%', height: 110, backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    clearSignatureText: { color: '#e11d48', fontWeight: '700', marginTop: 8, fontSize: 12 },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', padding: 14, borderTopWidth: 1, borderTopColor: '#f1f5f9', shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 12 },
    submitButton: { backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 12, alignItems: 'center', shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 },
    submitButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
    signatureModalContainer: { flex: 1, backgroundColor: '#ffffff', paddingTop: 40 },
    signatureFooter: { flexDirection: 'row', padding: 16, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    signatureActionBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, backgroundColor: '#f1f5f9' },
    confirmBtn: { backgroundColor: '#0f172a' },
    confirmText: { color: '#ffffff', fontWeight: 'bold' },
    infoCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: 18, borderLeftWidth: 4, borderLeftColor: '#0f172a', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
    infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 10 },
    infoCardTitle: { fontSize: 14, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.5 },
    infoRow: { marginBottom: 8 },
    infoLabel: { fontSize: 10, fontWeight: '900', color: '#94a3b8', marginBottom: 2, letterSpacing: 0.5 },
    infoValue: { fontSize: 13, color: '#334155', fontWeight: '500' },
    infoDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 },
    infoValueBold: { fontSize: 14, fontWeight: '800', color: '#0f172a' },
    equipmentGroup: { marginBottom: 18, borderRadius: 14, backgroundColor: '#ffffff', shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
    equipmentHeader: { backgroundColor: '#1e293b', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    equipmentIconWrapper: { backgroundColor: '#ffffff', padding: 4, borderRadius: 6 },
    equipmentTitle: { color: '#ffffff', fontWeight: '700', fontSize: 14, flex: 1, letterSpacing: -0.2 },
    equipmentFormsContainer: { padding: 12, backgroundColor: '#f8fafc' },
    showPartsButton: { marginBottom: 18, backgroundColor: '#1e293b', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#334155', borderStyle: 'dashed', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
    showPartsButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
    globalConclusionSection: { marginBottom: 18, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff' },
    conclusionHeader: { backgroundColor: '#e2e8f0', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
    voiceButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, gap: 4, borderWidth: 1, borderColor: '#e2e8f0' },
    voiceButtonActive: { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
    voiceButtonDisabled: { opacity: 0.7, backgroundColor: '#f8fafc' },
    voiceButtonText: { fontSize: 11, fontWeight: '700', color: '#1c2d4f' },
    addPartButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
    addPartButtonText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
    usedItemsList: { marginTop: 6, gap: 10 },
    usedItemCard: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    usedItemDescription: { fontSize: 13, fontWeight: '700', color: '#1e293b' },
    itemEquipmentBadge: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', alignSelf: 'flex-start', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 4, gap: 4 },
    itemEquipmentText: { fontSize: 10, fontWeight: '600', color: '#64748b' },
    usedItemDetails: { fontSize: 11, color: '#64748b', marginTop: 4 },
    removePartButton: { padding: 6 },
    emptyItemsBox: { padding: 16, backgroundColor: '#f8fafc', borderRadius: 10, borderStyle: 'dashed', borderWidth: 1, borderColor: '#cbd5e1', alignItems: 'center' },
    emptyItemsText: { color: '#94a3b8', fontSize: 12 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    bottomSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '80%', paddingBottom: 30 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#1c2d4f' },
    stockPickerItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    stockItemName: { fontSize: 14, fontWeight: '600', color: '#1e293b', marginBottom: 2 },
    stockItemCode: { fontSize: 12, color: '#64748b' },
    eqSelectorItem: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#f8fafc', borderRadius: 10, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    eqSelectorText: { fontSize: 14, fontWeight: '600', color: '#1e293b' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 10, height: 40, borderWidth: 1, borderColor: '#e2e8f0' },
    searchInputStyle: { flex: 1, marginLeft: 8, fontSize: 13, color: '#333' },
    videoModalContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    videoModalCloseButton: { position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 10 },
    fullscreenVideo: { width: '100%', height: '80%' },
    card: { marginBottom: 14, backgroundColor: '#ffffff', borderRadius: 14, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
    cardHeader: { backgroundColor: '#f8fafc', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    headerIconBox: { padding: 6, borderRadius: 8 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
    cardContent: { padding: 16 },
    // ── Video Card Styles ──────────────────────────────────────────────────────
    videoProcessingBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 28, backgroundColor: '#f0fdf4', borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0' },
    videoProcessingText: { fontSize: 13, fontWeight: '600', color: '#059669' },
    videoPreviewCard: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#1e293b' },
    videoThumbContainer: { height: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', position: 'relative' },
    videoThumbImage: { width: '100%', height: '100%', position: 'absolute' },
    videoPlayOverlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
    videoProcessingOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.85)', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
    videoProcessingOverlayText: { color: '#10b981', fontSize: 13, fontWeight: '700', marginTop: 12 },
    videoPlayButtonLarge: { backgroundColor: 'rgba(5,150,105,0.9)', width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 8 },
    videoMetaBar: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f0fdf4' },
    videoMetaText: { fontSize: 13, fontWeight: '600', color: '#059669' },
    videoMetaAction: { fontSize: 12, color: '#059669', fontWeight: '600' },
    videoRecordButton: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 14, backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1.5, borderColor: '#d1d5db', borderStyle: 'dashed' },
    videoRecordIconCircle: { backgroundColor: '#059669', width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', shadowColor: '#059669', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 },
    videoRecordTitle: { fontSize: 15, fontWeight: '700', color: '#1e293b' },
    videoRecordSubtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
    // ── Pagination Styles ──────────────────────────────────────────────────────
    progressBarContainer: { height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, marginBottom: 16, overflow: 'hidden' },
    progressBar: { height: '100%', backgroundColor: '#0f172a' },
    paginationButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 20, borderRadius: 12, flex: 1, justifyContent: 'center', gap: 8 },
    backButton: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
    backButtonText: { color: '#475569', fontWeight: 'bold', fontSize: 14 },
    nextButton: { backgroundColor: '#0f172a' },
    nextButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },

});

