import { HeaderRightToggle } from '@/components/header-right-toggle';
import { ImageViewerModal } from '@/components/image-viewer-modal';
import { ThemedText } from '@/components/themed-text';
import { NexusAlert } from '@/components/nexus-alert';
import { ImageService } from '@/services/image-service';
import { OrderItem, OrderService } from '@/services/order-service';
import { StockService, TechStockItem } from '@/services/stock-service';
import { syncService } from '@/services/sync-service';
import { TenantService } from '@/services/tenant-service';
import { appLifecycle } from '@/services/app-lifecycle';
import { Ionicons } from '@expo/vector-icons';
import { useI18n } from '@/services/i18n';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import NexusCamera from '@/components/nexus-camera';
import * as VideoThumbnails from 'expo-video-thumbnails';
import * as ScreenOrientation from 'expo-screen-orientation';
import React, { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, KeyboardAvoidingView, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, SafeAreaView, DeviceEventEmitter } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { FFmpegKit, ReturnCode } from 'ffmpeg-kit-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import SignatureScreen from 'react-native-signature-canvas';

export default function ExecuteOSScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { showLoading, hideLoading } = useGlobalLoading();
    const insets = useSafeAreaInsets();
    const { t } = useI18n();

    const [order, setOrder] = useState<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isCustomCameraActive, setIsCustomCameraActive] = useState(false);

    // Multi-equipment forms state
    // { equipmentIndex_or_id: { equipamento: any, template: any, data: any } }
    const [formsConfig, setFormsConfig] = useState<Record<string, { equipamento: any, template: any, data: any }>>({});

    // Collapsible State (true means collapsed)
    const [collapsedForms, setCollapsedForms] = useState<Record<string, boolean>>({});

    const toggleFormCollapse = (eqKey: string) => {
        setCollapsedForms(prev => ({ ...prev, [eqKey]: !prev[eqKey] }));
    };

    // Global fields
    // technicalReport is now stored per-equipment inside formsConfig._report
    // We also keep one global for the general service summary
    const [technicalReport, setTechnicalReport] = useState('');
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
    const [alertConfig, setAlertConfig] = useState({ visible: false, title: '', message: '', buttons: [] as any[] });
    const [showPrice, setShowPrice] = useState(false);
    const [allowImpediment, setAllowImpediment] = useState(true);

    const [isScannerVisible, setIsScannerVisible] = useState(false);
    const [scanned, setScanned] = useState(false);
    const [cameraPermission, requestCameraPermission] = useCameraPermissions();

    const handleAddPartClick = (eqKey: string) => {
        setActiveEquipmentKey(eqKey);
        setIsPartSourceModalVisible(true);
    };

    const handleBarCodeScanned = ({ type, data }: { type: string, data: string }) => {
        if (scanned) return;
        setScanned(true);
        setIsScannerVisible(false);

        if (!myStock || myStock.length === 0) {
            Alert.alert('Aviso', 'Você não tem peças no estoque.');
            return;
        }

        const itemInStock = myStock.find(s => 
            s.item?.code === data || 
            s.stockItemId === data || 
            s.item?.manufacturerCode === data
        );

        if (itemInStock) {
            if (itemInStock.quantity <= 0) {
                Alert.alert('Aviso', `A peça ${itemInStock.item?.description} está com estoque zerado.`);
                return;
            }
            setSelectedPart(itemInStock);
            setQtyToSelect('1');
            setQuantityModalVisible(true);
        } else {
            Alert.alert('Não encontrada', `A peça (Código: ${data}) não está no seu estoque.`);
        }
    };

    // Video states
    const [isVideoModalVisible, setVideoModalVisible] = useState(false);
    const [videoProcessingStatus, setVideoProcessingStatus] = useState<string | null>(null); // null=idle, string=msg
    const [videoSizeMB, setVideoSizeMB] = useState<number | null>(null);
    const [myStock, setMyStock] = useState<TechStockItem[]>([]);
    const [isVideoSourceModalVisible, setIsVideoSourceModalVisible] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [submitProgress, setSubmitProgress] = useState({ current: 0, total: 0, label: '' });
    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
    const [isUploadingPhoto, setIsUploadingPhoto] = useState<string | null>(null);
    const [isPartsVisible, setIsPartsVisible] = useState(false);
    const [isPhotoSourceModalVisible, setIsPhotoSourceModalVisible] = useState(false);
    const [isPartSourceModalVisible, setIsPartSourceModalVisible] = useState(false);
    const [photoSourceTarget, setPhotoSourceTarget] = useState<{ type: 'extra' | 'field', eqKey?: string, fieldId?: string } | null>(null);
    const signatureRef = useRef<any>(null);
    const scrollViewRef = useRef<ScrollView>(null);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(0);
    const [activeEquipmentKey, setActiveEquipmentKey] = useState<string | null>(null);

    // Impediment-from-form state
    const [showImpedimentForm, setShowImpedimentForm] = useState(false);
    const [impedimentReason, setImpedimentReason] = useState('');
    const [impedimentPhotos, setImpedimentPhotos] = useState<string[]>([]);
    const [isUploadingImpedimentPhoto, setIsUploadingImpedimentPhoto] = useState(false);
    const [isBlockingFromForm, setIsBlockingFromForm] = useState(false);
    const [isImpedimentPhotoSourceVisible, setIsImpedimentPhotoSourceVisible] = useState(false);
    const [impedimentResponsibleName, setImpedimentResponsibleName] = useState('');
    const [impedimentSignature, setImpedimentSignature] = useState<string | null>(null);
    const [isImpedimentSignatureVisible, setIsImpedimentSignatureVisible] = useState(false);
    const [isProcessingMedia, setIsProcessingMedia] = useState(false);
    const [mediaProcessingLabel, setMediaProcessingLabel] = useState('');
    
    // v3: Track ALL background uploads to block finalize/impediment until complete
    const [pendingUploadCount, setPendingUploadCount] = useState(0);
    const [uploadingUris, setUploadingUris] = useState<Set<string>>(new Set());
    const [validationAlert, setValidationAlert] = useState<{ visible: boolean; title: string; message: string }>({ visible: false, title: '', message: '' });

    const showValidation = (title: string, message: string) => {
        setValidationAlert({ visible: true, title, message });
    };
    // v5: Map local URI → remote URL (mantém miniatura local, resolve na hora de salvar)
    const uploadedUrlMapRef = useRef<Map<string, string>>(new Map());
    const hasPendingUploads = pendingUploadCount > 0 || isUploadingExtra || isUploadingVideo || isUploadingPhoto !== null || isProcessingMedia;

    /** Resolve URI: se tem URL remota no mapa, usa ela; senão mantém a local */
    const resolvePhotoUri = useCallback((uri: string) => {
        return uploadedUrlMapRef.current.get(uri) || uri;
    }, []);



    const getEquipmentKeys = () => Object.keys(formsConfig);
    const totalEquipmentPages = getEquipmentKeys().length;
    const eqKeysForFinancial = getEquipmentKeys();
    const financialEqKey = eqKeysForFinancial.find(key => !!formsConfig[key]?.financialTemplate);
    const hasFinancialPage = !!financialEqKey;
    const totalPages = 1 + (hasFinancialPage ? 1 : 0) + totalEquipmentPages + 2; // +2: 1 for Finalization (Report/Media) and 1 for Validation (Signature/Client)


    const nextPage = () => {
        if (currentPage >= totalPages - 1) return;

        const validateFields = (fields: any[], configData: any, eqDesc: string) => {
            for (const field of fields) {
                let isVisible = true;
                if (field.condition?.fieldId) {
                    const dep = (configData[field.condition.fieldId] ?? '').toString().trim().toLowerCase();
                    const exp = (field.condition.value ?? '').toString().trim().toLowerCase();
                    const op = (field.condition.operator || 'equals') as string;
                    if ((op === 'equals' || op === 'equal') && dep !== exp) isVisible = false;
                    if (op === 'not_equals' && dep === exp) isVisible = false;
                }

                if (!isVisible || !field.required) continue;

                const value = configData[field.id];

                if (field.type === 'PHOTO') {
                    if (!Array.isArray(value) || value.length === 0) {
                        showValidation(
                            t('execRequiredField') || 'Campo obrigatório',
                            `Adicione pelo menos 1 foto em "${field.label}" (${eqDesc}).`
                        );
                        return false;
                    }
                    continue;
                }

                if (field.type === 'SIGNATURE') {
                    if (!value) {
                        showValidation(
                            t('execRequiredField') || 'Campo obrigatório',
                            `Preencha "${field.label}" (${eqDesc}).`
                        );
                        return false;
                    }
                    continue;
                }

                if (!value || (typeof value === 'string' && !value.trim())) {
                    showValidation(
                        t('execRequiredField') || 'Campo obrigatório',
                        t('execFillField')
                            ? t('execFillField').replace('%s', field.label).replace('%s', eqDesc)
                            : `Preencha "${field.label}" (${eqDesc}).`
                    );
                    return false;
                }
            }
            return true;
        };

        // Validar formulário financeiro (se existir e estivermos na página 1)
        if (hasFinancialPage && currentPage === 1) {
            const eqKey = financialEqKey as string;
            const config = formsConfig[eqKey];
            if (config && config.financialTemplate) {
                if (!validateFields(config.financialTemplate.fields, config.data, 'Financeiro')) return;
            }
        }

        // Validar formulários técnicos
        const eqStartIndex = hasFinancialPage ? 2 : 1;
        if (currentPage >= eqStartIndex && currentPage < eqStartIndex + totalEquipmentPages) {
            const eqIndex = currentPage - eqStartIndex;
            const eqKeys = getEquipmentKeys();
            const eqKey = eqKeys[eqIndex];
            const config = formsConfig[eqKey];
            if (config && config.template) {
                const eqDesc = config.equipamento?.equipment_model || config.equipamento?.equipment_name || 'equipamento';
                if (!validateFields(config.template.fields, config.data, eqDesc)) return;
            }
        }
        // Validar resumo do atendimento antes de ir para a última página (Validação)
        if (currentPage === totalPages - 2) {
            if (!technicalReport || !technicalReport.trim()) {
                showValidation(
                    t('execRequiredField') || 'Campo obrigatório',
                    'Preencha o Resumo do Atendimento antes de prosseguir.'
                );
                return;
            }
        }


        setCurrentPage(prev => prev + 1);
        scrollViewRef.current?.scrollTo({ y: 0, animated: false });
    };

    const prevPage = () => {
        if (currentPage > 0) {
            setCurrentPage(prev => prev - 1);
            scrollViewRef.current?.scrollTo({ y: 0, animated: false });
        }
    };



    const fetchTemplatesForEquipment = async (orderData: any, eq: any, rules: any[], serviceTypes: any[], allTemplates: any[]) => {
        let technicalTemplate: any = null;
        let financialTemplate: any = null;

        if (eq?.form_id && eq.form_id !== 'f-padrao') {
            technicalTemplate = await OrderService.getFormTemplate(eq.form_id);
        }
        if (orderData.formId && orderData.formId !== 'f-padrao' && !technicalTemplate) {
            technicalTemplate = await OrderService.getFormTemplate(orderData.formId);
        }

        const typeValue = orderData.operationType || orderData.type;
        const matchedServiceType = serviceTypes.find(st =>
            st.id === typeValue ||
            st.name?.trim() === typeValue?.trim() ||
            st.name?.toLowerCase().trim() === String(typeValue).toLowerCase().trim() ||
            st.name?.toLowerCase().includes(String(typeValue).toLowerCase())
        );

        const family = eq?.equipment_family || eq?.equipmentFamily || t('execAll');
        const typeId = matchedServiceType?.id || typeValue;

        const normalizedFamily = String(family).toLowerCase().trim();
        const normalizedTypeId = String(typeId).toLowerCase().trim();

        console.log(`[ExecuteOS] Buscando regras para: typeId=${typeId} (nome=${typeValue}), family=${family}`);

        const bestRule = rules.find(r => 
            String(r.serviceTypeId || r.service_type_id).toLowerCase().trim() === normalizedTypeId && 
            String(r.equipmentFamily || '').toLowerCase().trim() === normalizedFamily
        ) || rules.find(r => 
            String(r.serviceTypeId || r.service_type_id).toLowerCase().trim() === normalizedTypeId && 
            (String(r.equipmentFamily || '').toLowerCase().trim() === 'todos' || !r.equipmentFamily)
        );

        console.log(`[ExecuteOS] Regra encontrada:`, bestRule ? { id: bestRule.id, financialFormId: bestRule.financialFormId, formId: bestRule.formId } : 'Nenhuma');

        if (bestRule) {
            if (!technicalTemplate) {
                technicalTemplate = await OrderService.getFormTemplate(bestRule.formId);
            }
            if (bestRule.financialFormId) {
                financialTemplate = await OrderService.getFormTemplate(bestRule.financialFormId);
            }
        }

        if (!technicalTemplate && orderData.type) {
            technicalTemplate = allTemplates.find(t =>
                t.title.toLowerCase().includes(orderData.type!.toLowerCase()) ||
                (t.serviceTypes && t.serviceTypes.includes(orderData.type!))
            );
        }
        return { technicalTemplate, financialTemplate };
    };

    useFocusEffect(
        React.useCallback(() => {
            let isActive = true;
            setOrder(null);
            setFormsConfig({});
            setIsLoading(true);
            showLoading('Carregando execução...');

            const loadData = async (isBackground = false) => {
                try {
                    if (!isBackground) setIsLoading(true);

                    // Carregar config do tenant (Preços)
                    try {
                        const settings = await TenantService.getSettings();
                        if (isActive) {
                            setShowPrice(settings.showStockPrice);
                            setAllowImpediment(settings.allowImpediment);
                        }
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
                                if (cache.usedItems) setUsedItems(cache.usedItems);
                                if (cache.extraPhotos) setExtraPhotos(cache.extraPhotos);
                                if (cache.signature) setSignature(cache.signature);
                                if (cache.clientName) setClientName(cache.clientName);
                                if (cache.clientDoc) setClientDoc(cache.clientDoc);
                                if (cache.videoUri) setVideoUri(cache.videoUri);
                                if (cache.videoThumbUri) setVideoThumbUri(cache.videoThumbUri);
                                if (cache.videoSizeMB) setVideoSizeMB(cache.videoSizeMB);
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
                                const eqName = eq.equipment_model || eq.equipment_name || t('execEquipment');
                                const { technicalTemplate, financialTemplate } = await fetchTemplatesForEquipment(mapped, eq, rules, serviceTypes, allTemplates);
                                const initialData: any = {};
                                if (technicalTemplate) {
                                    technicalTemplate.fields.forEach((field: any) => {
                                        if (cache?.formsData?.[eqKey]?.[field.id] !== undefined) {
                                            initialData[field.id] = cache.formsData[eqKey][field.id];
                                        } else {
                                            initialData[field.id] = '';
                                        }
                                    });
                                }
                                if (financialTemplate) {
                                    financialTemplate.fields.forEach((field: any) => {
                                        if (cache?.formsData?.[eqKey]?.[field.id] !== undefined) {
                                            initialData[field.id] = cache.formsData[eqKey][field.id];
                                        } else {
                                            initialData[field.id] = '';
                                        }
                                    });
                                }
                                // Restore per-equipment technical report from cache
                                const cachedReport = cache?.formsData?.[eqKey]?._report || '';
                                newFormsConfig[eqKey] = { equipamento: eq, template: technicalTemplate, financialTemplate, data: { ...initialData, _report: cachedReport } };
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

                        // GARANTIA: Se entrou na tela de execução mas o status ainda não é EM ANDAMENTO, forçar
                        if (orderData.status !== 'in_progress' && orderData.status !== 'completed' && orderData.status !== 'blocked') {
                            console.log(`[ExecuteOS] ⚠️ Status é "${orderData.status}", forçando para EM ANDAMENTO...`);
                            OrderService.startExecution(id as string).catch(e => 
                                console.warn('[ExecuteOS] Falha ao forçar EM ANDAMENTO:', e)
                            );
                        }

                        const equipmentsList = (orderData.equipments && orderData.equipments.length > 0)
                            ? orderData.equipments
                            : [{ id: 'single', equipment_model: orderData.equipment, equipment_serial: orderData.serialNumber, form_id: orderData.formId }];

                        // Load offline user-input cache
                        const cacheKey = `os_cache_${id}`;
                        const cachedStr = await AsyncStorage.getItem(cacheKey);
                        const cache = cachedStr ? JSON.parse(cachedStr) : null;

                        if (cache) {
                            if (cache.usedItems) setUsedItems(cache.usedItems);
                            if (cache.extraPhotos) setExtraPhotos(cache.extraPhotos);
                            if (cache.signature) setSignature(cache.signature);
                            if (cache.clientName) setClientName(cache.clientName);
                            if (cache.clientDoc) setClientDoc(cache.clientDoc);
                            if (cache.videoUri) setVideoUri(cache.videoUri);
                            if (cache.videoThumbUri) setVideoThumbUri(cache.videoThumbUri);
                            if (cache.videoSizeMB) setVideoSizeMB(cache.videoSizeMB);
                        } 

                        setExtraPhotos([]);

                        // Limpar cache de regras para garantir dados frescos do servidor
                        await AsyncStorage.removeItem('@nexus_activation_rules').catch(() => {});
                        await AsyncStorage.removeItem('@nexus_service_types').catch(() => {});

                        const [rules, serviceTypes, allTemplates] = await Promise.all([
                            OrderService.getActivationRules(),
                            OrderService.getServiceTypes(),
                            OrderService.getFormTemplates()
                        ]);


                        console.log(`[ExecuteOS] Regras carregadas: ${rules.length}. ServiceTypes: ${serviceTypes.length}. Templates: ${allTemplates.length}`);

                        const newFormsConfig: Record<string, any> = {};

                        for (let i = 0; i < equipmentsList.length; i++) {
                            const eq = equipmentsList[i];
                            const eqKey = eq.id || `eq_${i}`;
                            const eqName = eq.equipment_model || eq.equipment_name || t('execEquipment');

                            let { technicalTemplate, financialTemplate } = await fetchTemplatesForEquipment(orderData, eq, rules, serviceTypes, allTemplates);

                            let initialData: any = {};
                            if (technicalTemplate) {
                                technicalTemplate.fields.forEach((field: any) => {
                                    if (cache?.formsData?.[eqKey]?.[field.id] !== undefined) {
                                        initialData[field.id] = cache.formsData[eqKey][field.id];
                                    } else {
                                        initialData[field.id] = '';
                                    }
                                });
                            }
                            if (financialTemplate) {
                                financialTemplate.fields.forEach((field: any) => {
                                    if (cache?.formsData?.[eqKey]?.[field.id] !== undefined) {
                                        initialData[field.id] = cache.formsData[eqKey][field.id];
                                    } else {
                                        initialData[field.id] = '';
                                    }
                                });
                            }

                            // Per-equipment technical report
                            const cachedReport = cache?.formsData?.[eqKey]?._report || '';

                            newFormsConfig[eqKey] = {
                                equipamento: eq,
                                template: technicalTemplate,
                                financialTemplate: financialTemplate,
                                data: { ...initialData, _report: cachedReport },
                            };
                        }

                        if (isActive) {
                            setFormsConfig(newFormsConfig);
                        }

                        // Limpar badge de notificação para esta OS
                        try {
                            const { data: { session } } = await supabase.auth.getSession();
                            if (session?.user && id) {
                                const { data: notifs } = await supabase
                                    .from('notifications')
                                    .select('id')
                                    .eq('is_read', false)
                                    .eq('data->>orderId', id as string);
                                    
                                if (notifs && notifs.length > 0) {
                                    await supabase
                                        .from('notifications')
                                        .update({ is_read: true })
                                        .in('id', notifs.map(n => n.id));
                                    DeviceEventEmitter.emit('refreshNotifications');
                                }
                            }
                        } catch (err) {
                            console.warn('[ExecuteOS] Erro ao limpar notificacao', err);
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
                            if (isActive) {
                                setShowPrice(s.showStockPrice);
                                setAllowImpediment(s.allowImpediment);
                            }
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
                hideLoading();
            });

            return () => { isActive = false; hideLoading(); };
        }, [id])
    );

    // Auto-save to cache effect
    React.useEffect(() => {
        const saveToCache = async () => {
            if (!id || isLoading || !order) return;
            try {
                const cacheData = {
                    formsData: Object.keys(formsConfig).reduce((acc, key) => {
                        acc[key] = formsConfig[key].data; // includes _report
                        return acc;
                    }, {} as any),
                    usedItems,
                    extraPhotos,
                    signature,
                    clientName,
                    clientDoc,
                    videoUri,
                    videoThumbUri,
                    videoSizeMB,
                    timestamp: Date.now(),
                };
                await AsyncStorage.setItem(`os_cache_${id}`, JSON.stringify(cacheData));
            } catch (e) {
                console.error('[ExecuteOS] Cache save error:', e);
            }
        };
        const t = setTimeout(saveToCache, 1000);
        return () => clearTimeout(t);
    }, [id, formsConfig, usedItems, extraPhotos, signature, clientName, clientDoc, videoUri, videoThumbUri, videoSizeMB, isLoading, order]);


    const addUsedItem = (stockItem: TechStockItem, quantity: number, equipmentId?: string, equipmentName?: string, equipmentSerial?: string) => {
        const newItem: OrderItem = {
            description: stockItem.item?.description || t('stockItemNoDesc'),
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

    const processPhotoChoice = async (source: 'camera' | 'library', callback: (uris: string[]) => void, limit = 1) => {
        try {
            const result = source === 'camera'
                ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'] })
                : await ImagePicker.launchImageLibraryAsync({ 
                    mediaTypes: ['images'], 
                    allowsMultipleSelection: true,
                    selectionLimit: limit
                });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                // v5: INSTANT — Envia URIs originais direto para o callback.
                // O callback (uploadExtraPhoto / uploadFieldPhoto) adiciona as URIs
                // ao estado IMEDIATAMENTE (cards aparecem na hora), e depois roda
                // compressão + upload em background sem travar a UI.
                // NÃO usamos await — fire-and-forget para não bloquear.
                const rawUris = result.assets.map(asset => asset.uri);
                callback(rawUris);
            }
        } catch (e) {
            Alert.alert(t('alertError'), t('osCouldNotMedia'));
        }
    };

    const handleTakeExtraPhoto = () => {
        setPhotoSourceTarget({ type: 'extra' });
        setIsPhotoSourceModalVisible(true);
    };

    const handleTakeFieldPhoto = (eqKey: string, fieldId: string) => {
        setPhotoSourceTarget({ type: 'field', eqKey, fieldId });
        setIsPhotoSourceModalVisible(true);
    };

    const handleImpedimentSignature = async (signatureData: string) => {
        setImpedimentSignature(signatureData);
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
        setIsImpedimentSignatureVisible(false);
    };


    const uploadExtraPhoto = async (uris: string[]) => {
        setIsUploadingExtra(true);
        setPendingUploadCount(prev => prev + uris.length);
        try {
            // INSTANT PREVIEW: Mostrar imagem local imediatamente
            const localUris = [...uris];
            setUploadingUris(prev => {
                const next = new Set(prev);
                localUris.forEach(u => next.add(u));
                return next;
            });
            setExtraPhotos(prev => [...prev, ...localUris]);

            // BACKGROUND: Comprimir e subir TODAS em paralelo (rápido)
            const netInfo = await NetInfo.fetch();
            const isOnline = netInfo.isConnected && !syncService.isOfflineModeEnabled();

            await Promise.allSettled(localUris.map(async (uri) => {
                try {
                    const compressedUri = await ImageService.compressImage(uri);
                    let finalUri = compressedUri;

                    if (isOnline) {
                        const publicUrl = await OrderService.uploadFile(compressedUri, `orders/${order?.displayId || id}/extra_photos`, order?.tenantId);
                        if (publicUrl) finalUri = publicUrl;
                    } else {
                        const fileName = `offline_extra_${id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.webp`;
                        const destPath = `${FileSystem.documentDirectory}${fileName}`;
                        await FileSystem.copyAsync({ from: compressedUri, to: destPath });
                        finalUri = destPath;
                    }

                    // v5: NÃO troca a URI no estado visual — miniatura fica com arquivo local (nunca cinza)
                    // Guarda no Map para resolver na hora de salvar a OS
                    if (finalUri !== uri) {
                        uploadedUrlMapRef.current.set(uri, finalUri);
                    }
                } catch (e) {
                    console.warn('[ExtraPhoto] Upload failed, keeping local:', (e as Error).message);
                } finally {
                    setUploadingUris(prev => { const n = new Set(prev); n.delete(uri); return n; });
                    setPendingUploadCount(prev => Math.max(0, prev - 1));
                }
            }));
        } finally {
            setIsUploadingExtra(false);
        }
    };

    // ─────────────────────────────────────────────────────────────────────────
    // PIPELINE DE VÍDEO
    // Gravar → Comprimir (react-native-compressor) → Thumbnail → Upload silencioso
    // ─────────────────────────────────────────────────────────────────────────

    const handleTakeVideo = async () => {
        setIsVideoSourceModalVisible(false);
        setIsCustomCameraActive(true);
    };

    const handlePickVideoFromGallery = async () => {
        try {
            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['videos'],
                allowsEditing: false,
            });
            if (!result.canceled && result.assets?.[0]?.uri) {
                setIsVideoSourceModalVisible(false);
                startBackstageVideoProcess(result.assets[0].uri);
            }
        } catch {
            Alert.alert(t('alertError'), t('execCouldNotGallery'));
        } finally {
            setIsVideoSourceModalVisible(false);
        }
    };

    /**
     * Motor de Compressão H265 Backstage:
     * - Anexa a miniatura IMEDIATAMENTE (dando a sensação de pronto pro usuário)
     * - Em segundo plano, roda a compressão profunda (H265) e faz o upload
     * - Substitui a opção de play por um loader na miniatura
     */
    const startBackstageVideoProcess = async (rawUri: string, isNativeRecording: boolean = false) => {
        try {
            const localUri = rawUri.startsWith('/') ? `file://${rawUri}` : rawUri;

            // ─── Ponto A: UI INSTANTÂNEA ──────────────────────────────────────────
            setIsUploadingVideo(true);
            setVideoProcessingStatus(t('execThumbnail'));
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
            let finalUriToUpload = localUri;
            setVideoProcessingStatus('Comprimindo vídeo...');

            // ─── Ponto B: Compressão Absoluta (FFmpeg) ────
            try {
                const outPath = `${FileSystem.cacheDirectory}compressed_${Date.now()}.mp4`;
                
                // Padrão NASA: 480p, 450kbps, H264 ultrafast, Mono, 44100Hz, 32k áudio
                // Usando mpeg4 como codec de vídeo para máxima compatibilidade
                const ffmpegCommand = `-i "${localUri}" -vf "scale=-2:480" -c:v mpeg4 -b:v 450k -c:a aac -b:a 32k -ac 1 -ar 44100 "${outPath}"`;
                
                const session = await FFmpegKit.execute(ffmpegCommand);
                const returnCode = await session.getReturnCode();
                if (!ReturnCode.isSuccess(returnCode)) {
                    throw new Error(`FFmpeg failed with return code ${returnCode}`);
                }
                finalUriToUpload = outPath;
            } catch (err) {
                console.warn('[Video] Erro na execução FFmpeg:', err);
            }

            // Mede a redução conseguida
            const info = await FileSystem.getInfoAsync(finalUriToUpload);
            const sizeMB = ((info as any).size ?? 0) / 1024 / 1024;
            setVideoSizeMB(Math.round(sizeMB * 10) / 10);
            
            // ─── Ponto C: UPLOAD BACKGROUND ─────────────────────────────────────
            setVideoProcessingStatus(t('execFinalizing'));
            const netInfo = await NetInfo.fetch();
            
            if (!netInfo.isConnected || syncService.isOfflineModeEnabled()) {
                // Offline fallback
                const fileName = `offline_video_${id}_${Date.now()}.mp4`;
                const destPath = `${FileSystem.documentDirectory}${fileName}`;
                await FileSystem.copyAsync({ from: finalUriToUpload, to: destPath });
                setVideoUri(destPath);
            } else {
                // Upload normal para o Storage
                const publicUrl = await OrderService.uploadFile(
                    finalUriToUpload,
                    `orders/${order?.displayId || id}/videos`,
                    order?.tenantId,
                    'video/mp4'
                );

                if (publicUrl) {
                    setVideoUri(publicUrl); // Troca a URL local pela URL Pública da CDN
                }
            }
        } catch (error) {
            console.error('[Video] Erro backstage fatal:', error);
            Alert.alert(t('alertError'), t('execVideoError'));
        } finally {
            // Libera o Play Button e remove spinners
            setIsUploadingVideo(false);
            setVideoProcessingStatus(null);
        }
    };


    const uploadFieldPhoto = async (uris: string[], eqKey: string, fieldId: string) => {
        setIsUploadingPhoto(`${eqKey}_${fieldId}`);
        setPendingUploadCount(prev => prev + uris.length);
        try {
            // INSTANT PREVIEW: Mostrar imagem local imediatamente
            const localUris = [...uris];
            setUploadingUris(prev => {
                const next = new Set(prev);
                localUris.forEach(u => next.add(u));
                return next;
            });
            setFormsConfig(prev => {
                const newConfig = { ...prev };
                const currentPhotos = Array.isArray(newConfig[eqKey].data[fieldId]) ? newConfig[eqKey].data[fieldId] : [];
                const remaining = 7 - currentPhotos.length;
                const toAdd = localUris.slice(0, remaining);
                newConfig[eqKey].data = { ...newConfig[eqKey].data, [fieldId]: [...currentPhotos, ...toAdd] };
                return newConfig;
            });

            // BACKGROUND: Comprimir e subir TODAS em paralelo (rápido)
            const netInfo = await NetInfo.fetch();
            const isOnline = netInfo.isConnected && !syncService.isOfflineModeEnabled();

            await Promise.allSettled(localUris.map(async (uri) => {
                try {
                    const compressedUri = await ImageService.compressImage(uri);
                    let finalUri = compressedUri;

                    if (isOnline) {
                        const publicUrl = await OrderService.uploadFile(compressedUri, `orders/${order?.displayId || id}/form_photos`, order?.tenantId);
                        if (publicUrl) finalUri = publicUrl;
                    } else {
                        const fileName = `offline_form_${id}_${eqKey}_${fieldId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.webp`;
                        const destPath = `${FileSystem.documentDirectory}${fileName}`;
                        await FileSystem.copyAsync({ from: compressedUri, to: destPath });
                        finalUri = destPath;
                    }

                    // v5: NÃO troca a URI no estado visual — miniatura fica com arquivo local
                    if (finalUri !== uri) {
                        uploadedUrlMapRef.current.set(uri, finalUri);
                    }
                } catch (e) {
                    console.warn('[FieldPhoto] Upload failed, keeping local:', (e as Error).message);
                } finally {
                    setUploadingUris(prev => { const n = new Set(prev); n.delete(uri); return n; });
                    setPendingUploadCount(prev => Math.max(0, prev - 1));
                }
            }));
            
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
            showValidation(t('alertAttention'), t('execSignatureRequired'));
            return;
        }
        if (!clientName.trim()) {
            showValidation(t('alertAttention'), t('execNameRequired'));
            return;
        }
        // Validate that the general technical report is filled
        if (!technicalReport.trim()) {
            showValidation(t('alertAttention'), t('execReportRequired'));
            return;
        }

        // Validate all forms
        for (const key in formsConfig) {
            const config = formsConfig[key];
            if (config.template) {
                for (const field of config.template.fields) {
                    // 1. Verifica visibilidade (usando a mesma lógica de renderização para consistência)
                    let isVisible = true;
                    if (field.condition && field.condition.fieldId) {
                        const dependentValue = config.data[field.condition.fieldId];
                        const operator = (field.condition.operator || 'equals') as string;
                        const normalizedDependent = (dependentValue ?? '').toString().trim().toLowerCase();
                        const normalizedExpected = (field.condition.value ?? '').toString().trim().toLowerCase();

                        if (operator === 'equals' || operator === 'equal') {
                            if (normalizedDependent !== normalizedExpected) isVisible = false;
                        } else if (operator === 'not_equals') {
                            if (normalizedDependent === normalizedExpected) isVisible = false;
                        }
                    }

                    // 2. Se visível e obrigatório, valida resposta
                    if (isVisible && field.required && !config.data[field.id] && field.type !== 'PHOTO' && field.type !== 'SIGNATURE') {
                        const eqDesc = config.equipamento?.equipment_model || config.equipamento?.equipment_name || 'selecionado';
                        showValidation(t('execRequiredField'), t('execFillField').replace('%s', field.label).replace('%s', eqDesc));
                        return;
                    }
                }
            }
        }

        try {
            setIsSubmitting(true);
            setSubmitProgress({ current: 0, total: 0, label: 'Verificando conexão...' });

            const netInfo = await NetInfo.fetch();
            // Fallback imediato: Se o NetInfo estiver fora OU se o nosso Watchdog interno (appLifecycle)
            // identificar que estamos numa zona zumbi, bloqueia a tentativa online instantaneamente e força sincronismo off.
            const isOffline = !netInfo.isConnected || syncService.isOfflineModeEnabled() || 
                (appLifecycle.globalNetworkState !== 'CONNECTED' && appLifecycle.globalNetworkState !== 'CONNECTED_IDLE');

            const finalFormData: Record<string, any> = {};
            let localPhotosToSync: string[] = [];
            // Aggregate per-equipment technical reports
            const allReports: string[] = [];

            // ─── FASE 1: Coletar todos os arquivos locais que precisam de upload ───
            // Em vez de uploadar um por um (sequencial), coletamos TUDO e enviamos em paralelo.
            type PendingUpload = { uri: string; resolvedUrl?: string };
            const pendingUploads: PendingUpload[] = [];

            // Mapeamento: para cada campo do formulário, guarda os índices dos uploads pendentes
            type FieldRef = { configKey: string; fieldLabel: string; index?: number; type: 'array' | 'single' };
            const uploadFieldRefs: Map<number, FieldRef> = new Map();

            for (const key in formsConfig) {
                const config = formsConfig[key];
                const eqName = [config.equipamento?.equipment_name, config.equipamento?.equipment_model].filter(Boolean).join(' ') || t('execEquipment');
                const eqSerial = config.equipamento?.equipment_serial;
                const basePrefix = `[${eqName}${eqSerial ? ` S/N: ${eqSerial}` : ''} - `;

                let visibleCount = 1;
                const processTemplateFields = (templateObj: any, suffix: string) => {
                    if (!templateObj || !templateObj.fields) return;
                    const fullPrefix = `${basePrefix}${suffix}] - `;
                    templateObj.fields.forEach((field: any) => {
                        if (field.condition?.fieldId) {
                            const dep = (config.data[field.condition.fieldId] ?? '').toString().trim().toLowerCase();
                            const exp = (field.condition.value ?? '').toString().trim().toLowerCase();
                            const op  = (field.condition.operator || 'equals') as string;
                            if ((op === 'equals' || op === 'equal') && dep !== exp) return;
                            if (op === 'not_equals' && dep === exp) return;
                        }

                        const value = config.data[field.id];
                        const indexStr = String(visibleCount++).padStart(3, '0');
                        const fieldLabel = `${fullPrefix}${indexStr}#${field.label}`;

                        if (Array.isArray(value)) {
                            const resolvedArray: string[] = [];
                            for (let i = 0; i < value.length; i++) {
                                const item = value[i];
                                if (typeof item === 'string' && (item.startsWith('file://') || item.startsWith('content://') || item.startsWith('/'))) {
                                    const alreadyUploaded = uploadedUrlMapRef.current.get(item);
                                    if (alreadyUploaded && alreadyUploaded.startsWith('http')) {
                                        resolvedArray.push(alreadyUploaded);
                                    } else if (isOffline) {
                                        localPhotosToSync.push(item);
                                        resolvedArray.push(item);
                                    } else {
                                        const idx = pendingUploads.length;
                                        pendingUploads.push({ uri: item });
                                        uploadFieldRefs.set(idx, { configKey: key, fieldLabel, index: i, type: 'array' });
                                        resolvedArray.push('__PENDING__'); // placeholder
                                    }
                                } else {
                                    resolvedArray.push(item);
                                }
                            }
                            finalFormData[fieldLabel] = resolvedArray;
                        } else if (typeof value === 'string' && (value.startsWith('file://') || value.startsWith('content://') || value.startsWith('/'))) {
                            if (isOffline) {
                                localPhotosToSync.push(value);
                                finalFormData[fieldLabel] = value;
                            } else {
                                const idx = pendingUploads.length;
                                pendingUploads.push({ uri: value });
                                uploadFieldRefs.set(idx, { configKey: key, fieldLabel, type: 'single' });
                                finalFormData[fieldLabel] = '__PENDING__';
                            }
                        } else if (value !== undefined && value !== '') {
                            finalFormData[fieldLabel] = value;
                        }
                    });
                };

                processTemplateFields(config.financialTemplate, config.financialTemplate?.title || 'Financeiro');
                processTemplateFields(config.template, config.template?.title || 'Técnico');
            }

            // Consolidated report = all per-equipment reports joined
            let combinedReport = allReports.join('\n\n');
            if (technicalReport.trim()) {
                combinedReport = combinedReport ? `${combinedReport}\n\n[Resumo Geral]\n${technicalReport.trim()}` : technicalReport.trim();
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
                        technical_report: combinedReport,
                        parts_used: '',
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

                // Atualizar cache local para a OS aparecer como concluída na aba de Concluídas
                try {
                    const todayOrders = await syncService.getTodayOrders();
                    const updatedOrders = todayOrders.map(o => {
                        if (o.id === id) {
                            return { 
                                ...o, 
                                status: 'CONCLUÍDO', 
                                end_date: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            };
                        }
                        return o;
                    });
                    await syncService.saveTodayOrders(updatedOrders);
                    // Notify UI to refresh offline list
                    appLifecycle.notifyOrderChange({ orderId: id, eventType: 'UPDATE' });
                } catch (e) {
                    console.log('[ExecuteOS] Erro ao atualizar status offline da OS:', e);
                }

                router.replace({ pathname: '/', params: { filter: 'completed' } });
            } else {
                // ─── FASE 2: Upload PARALELO de todos os arquivos locais ───────────
                const totalUploads = pendingUploads.length;
                let completedUploads = 0;

                if (totalUploads > 0) {
                    setSubmitProgress({ current: 0, total: totalUploads, label: `Enviando 0/${totalUploads} fotos...` });

                    // Upload em lotes paralelos de 3 para não sobrecarregar a rede
                    const BATCH_SIZE = 3;
                    for (let batch = 0; batch < totalUploads; batch += BATCH_SIZE) {
                        const batchItems = pendingUploads.slice(batch, batch + BATCH_SIZE);
                        const batchIndices = batchItems.map((_, j) => batch + j);

                        const results = await Promise.allSettled(
                            batchItems.map(item =>
                                OrderService.uploadFile(item.uri, `orders/${order?.displayId || id}/form_photos`, order?.tenantId)
                            )
                        );

                        results.forEach((result, j) => {
                            const globalIdx = batchIndices[j];
                            const url = result.status === 'fulfilled' ? result.value : null;
                            pendingUploads[globalIdx].resolvedUrl = url || pendingUploads[globalIdx].uri;
                            completedUploads++;
                        });

                        setSubmitProgress({
                            current: completedUploads,
                            total: totalUploads,
                            label: `Enviando ${completedUploads}/${totalUploads} fotos...`
                        });
                    }
                }

                // ─── FASE 3: Substituir placeholders pelos URLs reais ──────────────
                setSubmitProgress({ current: completedUploads, total: totalUploads, label: 'Salvando ordem...' });

                for (const [idx, ref] of uploadFieldRefs.entries()) {
                    const resolvedUrl = pendingUploads[idx].resolvedUrl || pendingUploads[idx].uri;
                    if (ref.type === 'array' && ref.index !== undefined) {
                        const arr = finalFormData[ref.fieldLabel];
                        if (Array.isArray(arr)) {
                            arr[ref.index] = resolvedUrl;
                        }
                    } else {
                        finalFormData[ref.fieldLabel] = resolvedUrl;
                    }
                }

                // Limpar quaisquer placeholders remanescentes
                for (const key of Object.keys(finalFormData)) {
                    const val = finalFormData[key];
                    if (Array.isArray(val)) {
                        finalFormData[key] = val.filter(v => v !== '__PENDING__');
                    } else if (val === '__PENDING__') {
                        delete finalFormData[key];
                    }
                }

                finalFormData['technical_report'] = combinedReport;
                // v5: Resolver URIs locais → URLs remotas via o mapa de uploads
                const resolvedExtraPhotos = extraPhotos.map(p => resolvePhotoUri(p));
                finalFormData['extra_photos'] = resolvedExtraPhotos;
                // Salvar metadados dos formulários (nomes reais dos templates) para retroatividade
                finalFormData['execution_forms'] = formsConfig;

                // Passa tudo já com URLs HTTP para completeOrder — evita re-upload
                await OrderService.completeOrder(id as string, {
                    technicalReport: combinedReport,
                    partsUsed: '',
                    photos: resolvedExtraPhotos,
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

                // Navigate directly to completed tab
                router.replace({ pathname: '/', params: { filter: 'completed' } });
            }
        } catch (error) {
            console.error(error);
            setAlertConfig({
                visible: true,
                title: t('alertError'),
                message: t('execFailFinish'),
                buttons: [{ text: 'OK', style: 'default' }]
            });
        } finally {
            setIsSubmitting(false);
            setSubmitProgress({ current: 0, total: 0, label: '' });
        }
    };


    // ─── IMPEDIMENTO A PARTIR DO FORMULÁRIO ─────────────────────────────────────
    // Coleta motivo (obrigatório) + fotos (opcional), salva TODOS os dados do
    // formulário já preenchidos e bloqueia a OS. Nada se perde.
    const handleBlockFromForm = async () => {
        if (!impedimentReason.trim()) {
            showValidation(t('alertAttention'), t('execImpedimentRequired'));
            return;
        }

        if (!clientName.trim()) {
            showValidation(t('alertAttention'), t('execNameValidationRequired'));
            return;
        }

        if (!signature) {
            showValidation(t('alertAttention'), t('execSignatureValidationRequired'));
            return;
        }


        try {
            setIsBlockingFromForm(true);

            // 1. Montar formData acumulado (tudo que foi preenchido nos formulários)
            const finalFormData: Record<string, any> = {};
            const allReports: string[] = [];

            for (const key in formsConfig) {
                const config = formsConfig[key];
                const eqName = [config.equipamento?.equipment_name, config.equipamento?.equipment_model].filter(Boolean).join(' ') || t('execEquipment');
                const eqSerial = config.equipamento?.equipment_serial;
                const prefix = `[${eqName}${eqSerial ? ` S/N: ${eqSerial}` : ''}] - `;

                const eqReport = (config.data._report || '').trim();
                if (eqReport) {
                    finalFormData[`${prefix}technical_report`] = eqReport;
                    allReports.push(`${eqName}: ${eqReport}`);
                }

                if (config.template) {
                    let visibleCount = 1;
                    config.template.fields.forEach((field: any) => {
                        if (field.condition?.fieldId) {
                            const dep = (config.data[field.condition.fieldId] ?? '').toString().trim().toLowerCase();
                            const exp = (field.condition.value ?? '').toString().trim().toLowerCase();
                            const op  = (field.condition.operator || 'equals') as string;
                            if ((op === 'equals' || op === 'equal') && dep !== exp) return;
                            if (op === 'not_equals' && dep === exp) return;
                        }

                        let value = config.data[field.id];
                        if (value !== undefined && value !== '') {
                            if (field.type === 'PHOTO' && Array.isArray(value)) {
                                value = value.map((p: string) => resolvePhotoUri(p)).filter((p: string) => p !== '__PENDING__');
                            }
                            const indexStr = String(visibleCount).padStart(3, '0');
                            finalFormData[`${prefix}${indexStr}#${field.label}`] = value;
                        }
                        visibleCount++;
                    });
                }
            }

            if (allReports.length > 0) {
                finalFormData['technical_report'] = allReports.join('\n\n');
            }
            if (extraPhotos.length > 0) {
                finalFormData['extra_photos'] = extraPhotos;
            }

            // 1.5 Sync the extra signature/name to finalized data structure
            // Use specific impediment fields first, fall back to main client fields
            finalFormData['impediment_responsible'] = impedimentResponsibleName || clientName || '';
            finalFormData['impediment_reason'] = impedimentReason.trim();

            // Upload the impediment signature if present, otherwise use main client signature
            if (impedimentSignature) {
                try {
                    const sigUrl = await OrderService.uploadFile(impedimentSignature, `orders/${order?.displayId || id}/signatures`, order?.tenantId);
                    if (sigUrl) finalFormData['impediment_signature'] = sigUrl;
                } catch (e) {
                    console.warn('Falha no upload da assinatura de impedimento', e);
                }
            } else if (signature) {
                // Use main client signature as fallback for the impediment auth
                try {
                    const sigUrl = await OrderService.uploadFile(signature, `orders/${order?.displayId || id}/signatures`, order?.tenantId);
                    if (sigUrl) finalFormData['impediment_signature'] = sigUrl;
                } catch (e) {
                    console.warn('Falha no upload da assinatura principal para impedimento', e);
                }
            }

            // Also persist clientName/signature for backward compat display in [id].tsx
            if (clientName) finalFormData['clientName'] = clientName;
            if (signature) {
                try {
                    if (finalFormData['impediment_signature']?.startsWith('http')) {
                        finalFormData['signature'] = finalFormData['impediment_signature'];
                    } else {
                        const sigUrl = await OrderService.uploadFile(signature, `orders/${order?.displayId || id}/signatures`, order?.tenantId);
                        if (sigUrl) finalFormData['signature'] = sigUrl;
                    }
                } catch (e) {
                    console.warn('Falha no upload da assinatura do cliente', e);
                }
            }

            // 2. Upload das fotos do impedimento
            let blockPhotoUrls: string[] = [];
            for (const uri of impedimentPhotos) {
                const url = await OrderService.uploadFile(uri, `orders/${order?.displayId || id}/block_photos`, order?.tenantId);
                if (url) blockPhotoUrls.push(url);
            }

            // 2.5 Persistir vídeo no form_data do impedimento
            if (videoUri) {
                try {
                    let finalVideoUrl = videoUri;
                    // Se ainda for um arquivo local, fazer upload agora
                    if (!videoUri.startsWith('http')) {
                        const uploaded = await OrderService.uploadFile(videoUri, `orders/${order?.displayId || id}/videos`, order?.tenantId);
                        if (uploaded) finalVideoUrl = uploaded;
                    }
                    finalFormData['video_url'] = finalVideoUrl;
                } catch (e) {
                    console.warn('[ExecuteOS] Falha ao persistir vídeo no impedimento:', e);
                    // Ainda salva o URI local como fallback para não perder referência
                    finalFormData['video_url'] = videoUri;
                }
            }


            // 3. Bloquear a OS passando todos os dados preenchidos como additionalData
            await OrderService.blockOrder(
                id as string,
                impedimentReason.trim(),
                blockPhotoUrls.length > 0 ? blockPhotoUrls : null,
                { formData: finalFormData, items: usedItems }
            );

            // 4. Limpar cache local desta OS
            await AsyncStorage.removeItem(`os_cache_${id}`);

            // Navigate directly to blocked tab
            router.replace({ pathname: '/', params: { filter: 'blocked' } });
        } catch (error) {
            console.error('[ExecuteOS] Error blocking from form:', error);
            setAlertConfig({
                visible: true,
                title: t('alertError'),
                message: t('execCouldNotRegister'),
                buttons: [{ text: 'OK', style: 'default' }]
            });
        } finally {
            setIsBlockingFromForm(false);
        }
    };

    const handleAddImpedimentPhoto = async (source: 'camera' | 'library') => {
        if (impedimentPhotos.length >= 10) {
            Alert.alert(t('alertLimit'), t('execMaxPhotosImpediment'));
            return;
        }
        
        try {
            if (source === 'library') {
                setMediaProcessingLabel(t('execOpeningGallery') || 'Abrindo galeria...');
                setIsProcessingMedia(true);
            }
            
            const options: ImagePicker.ImagePickerOptions = {
                mediaTypes: ['images'],
                quality: 0.8,
            };
            const result = source === 'camera'
                ? await ImagePicker.launchCameraAsync(options)
                : await ImagePicker.launchImageLibraryAsync({ 
                    ...options, 
                    allowsMultipleSelection: true,
                    selectionLimit: 10 - impedimentPhotos.length 
                });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                setMediaProcessingLabel(t('execProcessingImages') || 'Processando imagens...');
                setIsProcessingMedia(true);
                
                // Pequeno delay para garantir UI
                setTimeout(async () => {
                    const newUris: string[] = [];
                    for (const asset of result.assets) {
                        try {
                            const { ImageService } = require('@/services/image-service');
                            const compressed = await ImageService.compressImage(asset.uri);
                            newUris.push(compressed);
                        } catch {
                            newUris.push(asset.uri);
                        }
                    }
                    setImpedimentPhotos(prev => [...prev, ...newUris].slice(0, 10));
                    setIsProcessingMedia(false);
                }, 100);
            } else {
                setIsProcessingMedia(false);
            }
        } catch {
            setIsProcessingMedia(false);
            Alert.alert(t('alertError'), t('osCouldNotMedia'));
        }
    };

    const uploadImpedimentPhoto = async (uris: string[]) => {
        setIsUploadingImpedimentPhoto(true);
        try {
            for (const uri of uris) {
                if (impedimentPhotos.length >= 10) break;
                const compressedUri = await ImageService.compressImage(uri);
                const publicUrl = await OrderService.uploadFile(compressedUri, `orders/${order?.displayId || id}/impediment_photos`, order?.tenantId);
                const finalUri = publicUrl || compressedUri;
                setImpedimentPhotos(prev => [...prev, finalUri]);
            }
        } catch (error) {
            console.error('[ImpedimentPhoto] Upload error:', error);
        } finally {
            setIsUploadingImpedimentPhoto(false);
        }
    };

    // ──────────────────────────────────────────────────────────────────────────────

    const renderDynamicField = (eqKey: string, field: any, data: any, fieldIndex: number) => {
        const displayIndex = String(fieldIndex + 1).padStart(3, '0');
        const displayLabel = `#${displayIndex} - ${field.label}`;

        switch (field.type) {
            case 'TEXT':
            case 'LONG_TEXT':
                return (
                    <View key={field.id} style={styles.dynamicFieldControl}>
                        <Text style={styles.dynamicFieldLabel}>
                            {displayLabel}{field.required ? <Text style={{color: '#ef4444'}}> *</Text> : ''}
                        </Text>
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
            case 'CHECKLIST':
            case 'MULTI_SELECT':
                const selectedOptions = Array.isArray(data[field.id]) ? data[field.id] : [];
                return (
                    <View key={field.id} style={styles.dynamicFieldControl}>
                        <Text style={styles.dynamicFieldLabel}>
                            {displayLabel}{field.required ? <Text style={{color: '#ef4444'}}> *</Text> : ''}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 12 }}>Selecione as opções abaixo</Text>
                        <View style={{ gap: 8 }}>
                            {(field.options || []).map((opt: string) => {
                                const isSelected = selectedOptions.includes(opt);
                                return (
                                    <Pressable
                                        key={opt}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            paddingVertical: 14,
                                            paddingHorizontal: 16,
                                            backgroundColor: isSelected ? '#f8fafc' : '#ffffff',
                                            borderWidth: 1,
                                            borderColor: isSelected ? '#1c2d4f' : '#e2e8f0',
                                            borderRadius: 8,
                                            gap: 12
                                        }}
                                        onPress={() => {
                                            const current = [...selectedOptions];
                                            if (isSelected) {
                                                const idx = current.indexOf(opt);
                                                if (idx > -1) current.splice(idx, 1);
                                            } else {
                                                current.push(opt);
                                            }
                                            updateFieldData(eqKey, field.id, current);
                                        }}
                                    >
                                        <View style={{
                                            width: 22,
                                            height: 22,
                                            borderRadius: 4,
                                            borderWidth: 2,
                                            borderColor: isSelected ? '#1c2d4f' : '#cbd5e1',
                                            backgroundColor: isSelected ? '#1c2d4f' : 'transparent',
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}>
                                            {isSelected && <Ionicons name="checkmark" size={16} color="#ffffff" />}
                                        </View>
                                        <Text style={{
                                            flex: 1,
                                            fontSize: 14,
                                            fontWeight: isSelected ? '700' : '500',
                                            color: isSelected ? '#1c2d4f' : '#334155'
                                        }}>
                                            {opt}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                );
            case 'SELECT':
                return (
                    <View key={field.id} style={styles.dynamicFieldControl}>
                        <Text style={styles.dynamicFieldLabel}>
                            {displayLabel}{field.required ? <Text style={{color: '#ef4444'}}> *</Text> : ''}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Selecione a opção abaixo</Text>
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
                        <Text style={styles.dynamicFieldLabel}>
                            {displayLabel}{field.required ? <Text style={{color: '#ef4444'}}> *</Text> : ''} ({photos.length}/7)
                        </Text>
                        <Text style={{ fontSize: 11, color: '#94a3b8', marginBottom: 10 }}>Anexe evidências fotográficas para comprovação</Text>
                            <Pressable 
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: '#f8fafc',
                                    borderWidth: 2,
                                    borderColor: '#cbd5e1',
                                    borderStyle: 'dashed',
                                    borderRadius: 10,
                                    padding: 16,
                                    marginBottom: 8
                                }}
                                onPress={() => handleTakeFieldPhoto(eqKey, field.id)} 
                                disabled={isUploadingPhoto === `${eqKey}_${field.id}`}
                            >
                                {isUploadingPhoto === `${eqKey}_${field.id}` ? (
                                    <ActivityIndicator size="small" color="#1c2d4f" style={{ marginRight: 14 }} />
                                ) : (
                                    <View style={{ backgroundColor: '#e2e8f0', padding: 10, borderRadius: 50, marginRight: 14 }}>
                                        <Ionicons name="camera" size={22} color="#1c2d4f" />
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#1c2d4f' }}>
                                        Tocar para Fotografar
                                    </Text>
                                    <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                        Câmera ou Galeria (Máx: 7 fotos)
                                    </Text>
                                </View>
                            </Pressable>

                            {photos.length > 0 && (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                                    {photos.map((photoUri: string, index: number) => {
                                        const isProcessing = uploadingUris.has(photoUri);
                                        return (
                                        <Pressable key={index} style={{ position: 'relative', width: 100, height: 100, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#e2e8f0' }}
                                            onPress={() => { setSelectedImage(photoUri); setViewerVisible(true); }}>
                                            <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                            {isProcessing && (
                                                <View style={{ position: 'absolute', bottom: 2, left: 2, backgroundColor: 'rgba(28,45,79,0.7)', borderRadius: 8, padding: 3 }}>
                                                    <ActivityIndicator size="small" color="#fff" />
                                                </View>
                                            )}
                                            <Pressable style={{ position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(239,68,68,0.9)', padding: 6, borderRadius: 14 }}
                                                onPress={() => {
                                                    const remoteUri = resolvePhotoUri(photoUri);
                                                    if (typeof remoteUri === 'string' && remoteUri.startsWith('http')) {
                                                        console.log(`[execute.tsx] 🗑️ Excluindo arquivo do Supabase: ${remoteUri}`);
                                                        OrderService.deleteFile(remoteUri).catch((e) => console.warn(`Erro ao excluir:`, e));
                                                    }
                                                    const newPhotos = photos.filter((p: string) => p !== photoUri);
                                                    updateFieldData(eqKey, field.id, newPhotos);
                                                }}>
                                                <Ionicons name="close" size={16} color="#fff" />
                                            </Pressable>
                                        </Pressable>
                                    )})}
                            </View>
                        )}
                    </View>
                );
            default:
                return null;
        }
    };

    if (isLoading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
                <Stack.Screen options={{ title: 'Carregando Execução' }} />
            </View>
        );
    }

    if (isCustomCameraActive) {
        return (
            <NexusCamera 
                onClose={() => setIsCustomCameraActive(false)} 
                onVideoRecorded={(uri) => {
                    setIsCustomCameraActive(false);
                    startBackstageVideoProcess(uri, true);
                }} 
            />
        );
    }

    return (
        <KeyboardAvoidingView style={[{ flex: 1 }, styles.container]} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
            <Stack.Screen options={{ title: `Execução - Página ${currentPage + 1}/${totalPages}` }} />

            <ScrollView ref={scrollViewRef} style={{ flex: 1 }} contentContainerStyle={styles.content} scrollEnabled={true}>

                {/* PROGRESS BAR */}
                <View style={styles.progressBarContainer}>
                    <View style={[styles.progressBar, { width: `${((currentPage + 1) / totalPages) * 100}%` }]} />
                </View>

                {/* PAGE 0: OS INFORMATION HEADER */}
                {currentPage === 0 && order && (
                    <View style={styles.infoCard}>
                        <View style={styles.infoCardHeader}>
                            <Ionicons name="information-circle" size={20} color="#1c2d4f" />
                            <Text style={styles.infoCardTitle}>{t('execRequestDetails')}</Text>
                        </View>
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>CLIENTE</Text>
                            <Text style={styles.infoValue}>{order.customer}</Text>
                        </View>
                        <View style={styles.infoDivider} />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>{t('execServiceTitle')}</Text>
                            <Text style={styles.infoValueBold}>{order.displayId}: {order.description?.split('\n')[0]}</Text>
                        </View>
                        <View style={styles.infoDivider} />
                        <View style={styles.infoRow}>
                            <Text style={styles.infoLabel}>MODALIDADE DO ATENDIMENTO</Text>
                            <Text style={[styles.infoValueBold, { color: '#1c2d4f', fontSize: 16 }]}>
                                {order.operationType || order.type || t('execNotInformed')}
                            </Text>
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

                {/* PAGE 1: OS FINANCIAL FORM (IF EXISTS) */}
                {hasFinancialPage && currentPage === 1 && (() => {
                    const eqKey = financialEqKey as string;
                    const config = formsConfig[eqKey];
                    if (!config || !config.financialTemplate) return null;

                    let globalVisibleCount = 1;
                    const renderFields = (templateObj: any, title: string, titleColor: string) => {
                        if (!templateObj || !templateObj.fields || templateObj.fields.length === 0) return null;
                        return (
                            <View style={{ marginBottom: 16 }}>
                                <Text style={{ fontSize: 13, fontWeight: '800', color: titleColor, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: 12 }}>
                                    {title}
                                </Text>
                                {templateObj.fields.map((field: any) => {
                                    if (field.condition?.fieldId) {
                                        const dep = (config.data[field.condition.fieldId] ?? '').toString().trim().toLowerCase();
                                        const exp = (field.condition.value ?? '').toString().trim().toLowerCase();
                                        const op  = (field.condition.operator || 'equals') as string;
                                        if ((op === 'equals' || op === 'equal') && dep !== exp) return null;
                                        if (op === 'not_equals' && dep === exp) return null;
                                    }
                                    const currentIndex = globalVisibleCount - 1;
                                    globalVisibleCount++;
                                    return renderDynamicField(eqKey, field, config.data, currentIndex);
                                })}
                            </View>
                        );
                    };

                    return (
                        <View key={`fin_${eqKey}`} style={styles.equipmentGroup}>
                            <View style={[styles.equipmentHeader, { backgroundColor: '#059669' }]}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                    <View style={styles.equipmentIconWrapper}>
                                        <Ionicons name="cash-outline" size={18} color="#059669" />
                                    </View>
                                    <Text style={styles.equipmentTitle}>
                                        {config.equipamento?.equipment_model || config.equipamento?.equipment_name || t('execEquipment')}
                                        {config.equipamento?.equipment_serial ? ` - S/N: ${config.equipamento.equipment_serial}` : ''}
                                        {config.financialTemplate?.title ? ` - ${config.financialTemplate.title}` : ' - Formulário Financeiro'}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.equipmentFormsContainer}>
                                {renderFields(config.financialTemplate, config.financialTemplate?.title || 'Formulário Financeiro', '#059669')}
                            </View>
                        </View>
                    );
                })()}

                {/* PAGES 2..N: EQUIPMENT FORMS (TECHNICAL) */}
                {(() => {
                    const eqStartIndex = hasFinancialPage ? 2 : 1;
                    if (currentPage >= eqStartIndex && currentPage < eqStartIndex + totalEquipmentPages) {
                        const eqIndex = currentPage - eqStartIndex;
                        const eqKeys = getEquipmentKeys();
                        const eqKey = eqKeys[eqIndex];
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
                                        {config.equipamento?.equipment_model || config.equipamento?.equipment_name || t('execEquipment')}
                                        {config.equipamento?.equipment_serial ? ` - S/N: ${config.equipamento.equipment_serial}` : ''}
                                        {config.template?.title ? ` - ${config.template.title}` : ''}
                                    </Text>
                                </View>
                            </View>

                            <View style={styles.equipmentFormsContainer}>
                                {(() => {
                                    let globalVisibleCount = 1;
                                    let hasAnyForm = false;

                                    const renderFields = (templateObj: any, title: string, titleColor: string, isFinancial: boolean) => {
                                        if (!templateObj || !templateObj.fields || templateObj.fields.length === 0) return null;
                                        hasAnyForm = true;
                                        return (
                                            <View style={{ marginBottom: 16 }}>
                                                <Text style={{ fontSize: 13, fontWeight: '800', color: titleColor, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8, paddingHorizontal: 12 }}>
                                                    {title}
                                                </Text>
                                                {templateObj.fields.map((field: any) => {
                                                    if (field.condition?.fieldId) {
                                                        const dep = (config.data[field.condition.fieldId] ?? '').toString().trim().toLowerCase();
                                                        const exp = (field.condition.value ?? '').toString().trim().toLowerCase();
                                                        const op  = (field.condition.operator || 'equals') as string;
                                                        if ((op === 'equals' || op === 'equal') && dep !== exp) return null;
                                                        if (op === 'not_equals' && dep === exp) return null;
                                                    }
                                                    const currentIndex = globalVisibleCount - 1;
                                                    globalVisibleCount++;
                                                    // Wrap renderDynamicField in a view if financial to maybe add some style?
                                                    // For now just pass it directly.
                                                    return renderDynamicField(eqKey, field, config.data, currentIndex);
                                                })}
                                            </View>
                                        );
                                    };

                                    const technicalView = renderFields(config.template, config.template?.title || 'Formulário Técnico', '#1c2d4f', false);

                                    if (!hasAnyForm) {
                                        return (
                                            <View style={[styles.dynamicFieldControl, { alignItems: 'center', padding: 24, margin: 12, backgroundColor: '#f8fafc', elevation: 0 }]}>
                                                <Ionicons name="document-text-outline" size={40} color="#cbd5e1" />
                                                <Text style={{ color: '#94a3b8', marginTop: 10, fontWeight: '600' }}>{t('execNoForm')}</Text>
                                            </View>
                                        );
                                    }

                                    return (
                                        <>
                                            {technicalView}
                                        </>
                                    );
                                })()}
                            </View>

                            {/* ── Per-equipment Technical Report was removed per user request ────── */}
                            {/* PART INCLUSION FOR THIS EQUIPMENT */}
                            <View style={{ marginHorizontal: 12, marginBottom: 16, backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', padding: 16 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#1c2d4f', textTransform: 'uppercase', letterSpacing: 0.5 }}>Peças Vinculadas</Text>
                                    <Pressable 
                                        style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c2d4f', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, gap: 6 }} 
                                        onPress={() => handleAddPartClick(eqKey)}
                                    >
                                        <Ionicons name="add" size={16} color="#ffffff" />
                                        <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 13 }}>Adicionar</Text>
                                    </Pressable>
                                </View>

                                {(() => {
                                    const eqParts = usedItems.filter(item => item.equipmentId === config.equipamento?.id || (config.equipamento?.id === 'single' && !item.equipmentId));
                                    
                                    if (eqParts.length === 0) {
                                        return (
                                            <View style={{ backgroundColor: '#f8fafc', borderRadius: 8, padding: 20, alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' }}>
                                                <Ionicons name="cube-outline" size={28} color="#94a3b8" />
                                                <Text style={{ color: '#94a3b8', fontSize: 13, marginTop: 8, fontWeight: '600' }}>Nenhuma peça adicionada</Text>
                                            </View>
                                        );
                                    }

                                    return (
                                        <View style={{ gap: 8 }}>
                                            {eqParts.map((item, idx) => (
                                                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0' }}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ fontSize: 14, fontWeight: '700', color: '#334155' }}>{item.description}</Text>
                                                        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Qtd: <Text style={{ fontWeight: '800', color: '#1c2d4f' }}>{item.quantity}</Text></Text>
                                                    </View>
                                                    <Pressable onPress={() => removeUsedItem(usedItems.indexOf(item))} style={{ padding: 8, backgroundColor: '#fee2e2', borderRadius: 8 }}>
                                                        <Ionicons name="trash" size={18} color="#dc2626" />
                                                    </Pressable>
                                                </View>
                                            ))}
                                        </View>
                                    );
                                })()}
                            </View>
                        </View>
                    );
                    }
                    return null;
                })()}

                {/* PAGE N+1: CONCLUSÃO — RESUMO + VÍDEO + FOTOS EXTRAS */}
                {currentPage === totalPages - 2 && (
                    <View style={[styles.globalConclusionSection, { marginTop: 4, backgroundColor: '#fdfcf0', borderColor: '#eab308' }]}>
                        <View style={[styles.conclusionHeader, { backgroundColor: '#fef9c3' }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                <View style={[styles.equipmentIconWrapper, { backgroundColor: '#fef3c7' }]}>
                                    <Ionicons name="checkmark-done-circle-outline" size={18} color="#854d0e" />
                                </View>
                                <Text style={{ fontSize: 14, fontWeight: '900', color: '#854d0e', flex: 1 }}>RESUMO DO ATENDIMENTO</Text>
                            </View>
                        </View>

                        <View style={[styles.section, { borderTopWidth: 0, marginTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0, backgroundColor: 'transparent', elevation: 0, borderWidth: 0 }]}>

                            {/* Summary of per-equipment reports */}
                            {Object.values(formsConfig).map((config, idx) => {
                                const eqName = [config.equipamento?.equipment_name, config.equipamento?.equipment_model].filter(Boolean).join(' ') || `Equipamento ${idx + 1}`;
                                const eqSerial = config.equipamento?.equipment_serial ? ` (S/N: ${config.equipamento.equipment_serial})` : '';
                                const formName = config.template?.title ? ` - ${config.template.title}` : '';
                                const fullTitle = `${eqName}${eqSerial}${formName}`.toUpperCase();
                                const report = (config.data._report || '').trim();
                                const eqParts = usedItems.filter(i => i.equipmentId === config.equipamento?.id || (config.equipamento?.id === 'single' && !i.equipmentId));
                                
                                return (
                                    <View key={idx} style={{ marginBottom: 12, backgroundColor: '#f0f9ff', borderRadius: 10, padding: 12, borderLeftWidth: 3, borderLeftColor: '#0ea5e9' }}>
                                        <Text style={{ fontWeight: '800', fontSize: 12, color: '#1c2d4f', marginBottom: 4 }}>{fullTitle}</Text>
                                        {!!report && <Text style={{ fontSize: 13, color: '#334155', marginBottom: 4 }}>{report}</Text>}
                                        {!report && eqParts.length === 0 && <Text style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', marginBottom: 4 }}>Checklist preenchido e finalizado.</Text>}
                                        {eqParts.length > 0 && (
                                            <Text style={{ fontSize: 11, color: '#64748b' }}>{t('execParts')} {eqParts.map(p => `${p.description} (x${p.quantity})`).join(', ')}</Text>
                                        )}
                                    </View>
                                );
                            })}

                            <View style={{ marginTop: 8, marginBottom: 12 }}>
                                {/* Label removed for redundancy under the main section title */}
                                <TextInput
                                    style={[styles.input, styles.textArea, { backgroundColor: '#fff' }]}
                                    placeholder="Descreva o resumo geral das ações realizadas nesta OS..."
                                    multiline
                                    numberOfLines={4}
                                    value={technicalReport}
                                    onChangeText={setTechnicalReport}
                                />
                            </View>

                            {/* EXTRA PHOTOS */}
                            <View style={[styles.card, { marginTop: 8, elevation: 0, backgroundColor: '#f8fafc', borderColor: '#e2e8f0', borderWidth: 1 }]}>
                                <View style={styles.cardHeader}>
                                    <Ionicons name="images" size={16} color="#1c2d4f" />
                                    <Text style={styles.cardTitle}>{t('execExtraPhotos')}</Text>
                                </View>
                                <View style={styles.cardContent}>
                                    <Pressable 
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            backgroundColor: '#f8fafc',
                                            borderWidth: 2,
                                            borderColor: '#cbd5e1',
                                            borderStyle: 'dashed',
                                            borderRadius: 10,
                                            padding: 16,
                                            marginBottom: 8
                                        }}
                                        onPress={handleTakeExtraPhoto} 
                                        disabled={isUploadingExtra}
                                    >
                                        {isUploadingExtra ? (
                                            <ActivityIndicator size="small" color="#1c2d4f" style={{ marginRight: 14 }} />
                                        ) : (
                                            <View style={{ backgroundColor: '#e2e8f0', padding: 10, borderRadius: 50, marginRight: 14 }}>
                                                <Ionicons name="images" size={22} color="#1c2d4f" />
                                            </View>
                                        )}
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ fontSize: 14, fontWeight: '700', color: '#1c2d4f' }}>
                                                Tocar para Anexar
                                            </Text>
                                            <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                                {t('execPhotoFromCameraOrGallery')}
                                            </Text>
                                        </View>
                                    </Pressable>

                                    {extraPhotos.length > 0 && (
                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 }}>
                                            {extraPhotos.map((photoUri, index) => {
                                                const isProcessing = uploadingUris.has(photoUri);
                                                return (
                                                <Pressable key={index} style={{ position: 'relative', width: 100, height: 100, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#e2e8f0' }}
                                                    onPress={() => { setSelectedImage(photoUri); setViewerVisible(true); }}>
                                                    <Image source={{ uri: photoUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                    {isProcessing && (
                                                        <View style={{ position: 'absolute', bottom: 2, left: 2, backgroundColor: 'rgba(28,45,79,0.7)', borderRadius: 8, padding: 3 }}>
                                                            <ActivityIndicator size="small" color="#fff" />
                                                        </View>
                                                    )}
                                                    <Pressable style={{ position: 'absolute', top: 2, right: 2, backgroundColor: 'rgba(239,68,68,0.9)', padding: 6, borderRadius: 14 }}
                                                        onPress={() => {
                                                            const remoteUri = resolvePhotoUri(photoUri);
                                                            if (typeof remoteUri === 'string' && remoteUri.startsWith('http')) {
                                                                console.log(`[execute.tsx] 🗑️ Excluindo arquivo do Supabase: ${remoteUri}`);
                                                                OrderService.deleteFile(remoteUri).catch((e) => console.warn(`Erro ao excluir:`, e));
                                                            }
                                                            setExtraPhotos(prev => prev.filter(p => p !== photoUri));
                                                        }}>
                                                        <Ionicons name="close" size={16} color="#fff" />
                                                    </Pressable>
                                                </Pressable>
                                            )})}
                                        </View>
                                    )}
                                </View>
                            </View>

                            {/* VIDEO */}
                            <View style={[styles.card, { marginTop: 16, elevation: 0, backgroundColor: '#ffffff' }]}>
                                <View style={styles.cardHeader}>
                                    <Ionicons name="videocam" size={16} color="#059669" />
                                    <Text style={styles.cardTitle}>{t('execVideoEvidence')}</Text>
                                </View>
                                <View style={styles.cardContent}>
                                    {videoUri ? (
                                        <Pressable
                                            style={styles.attachedVideoCard}
                                            onPress={() => {
                                                const playUri = videoUri.startsWith('http')
                                                    ? videoUri : (videoUri.startsWith('/') ? `file://${videoUri}` : videoUri);
                                                Linking.openURL(playUri).catch(() => Alert.alert(t('alertError'), t('execCouldNotPlayVideo')));
                                            }}
                                        >
                                            <View style={styles.videoThumbContainer}>
                                                {videoThumbUri
                                                    ? <Image source={{ uri: videoThumbUri }} style={styles.videoThumbImage} resizeMode="cover" />
                                                    : <Ionicons name="film-outline" size={40} color="rgba(255,255,255,0.25)" />}
                                                {isUploadingVideo ? (
                                                    <View style={styles.videoProcessingOverlay}>
                                                        <ActivityIndicator size="large" color="#10b981" />
                                                        <Text style={styles.videoProcessingOverlayText}>{videoProcessingStatus || t('execProcessing')}</Text>
                                                    </View>
                                                ) : (
                                                    <View style={styles.videoPlayOverlay}>
                                                        <Ionicons name="play-circle" size={50} color="#fff" />
                                                    </View>
                                                )}
                                            </View>
                                            <View style={styles.videoMetaBar}>
                                                <Text style={styles.videoMetaText}>{t('execVideoAttached')} {videoSizeMB ? `(${videoSizeMB}MB)` : ''}</Text>
                                                {!isUploadingVideo && (
                                                    <Pressable style={{ padding: 8 }} onPress={() => {
                                                        if (typeof videoUri === 'string' && videoUri.startsWith('http')) {
                                                            console.log(`[execute.tsx] 🗑️ Excluindo arquivo do Supabase: ${videoUri}`);
                                                            OrderService.deleteFile(videoUri).catch((e) => console.warn(`Erro ao excluir:`, e));
                                                        }
                                                        setVideoUri(null);
                                                    }}>
                                                        <Ionicons name="trash-outline" size={22} color="#ef4444" />
                                                    </Pressable>
                                                )}
                                            </View>
                                        </Pressable>
                                    ) : (
                                        <Pressable 
                                            style={{
                                                flexDirection: 'row',
                                                alignItems: 'center',
                                                backgroundColor: '#f8fafc',
                                                borderWidth: 2,
                                                borderColor: '#cbd5e1',
                                                borderStyle: 'dashed',
                                                borderRadius: 10,
                                                padding: 16,
                                                marginBottom: 8
                                            }}
                                            onPress={() => setIsVideoSourceModalVisible(true)}
                                        >
                                            <View style={{ backgroundColor: '#e2e8f0', padding: 10, borderRadius: 50, marginRight: 14 }}>
                                                <Ionicons name="videocam" size={22} color="#1c2d4f" />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#1c2d4f' }}>
                                                    {t('execAttachVideo')}
                                                </Text>
                                                <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                                                    {t('execRecordOrGallery')}
                                                </Text>
                                            </View>
                                        </Pressable>
                                    )}
                                </View>
                            </View>
                        </View>
                    </View>
                )}

                {/* PAGE FINAL: Validação do Cliente (Assinatura, Nome) */}
                {currentPage === totalPages - 1 && (
                    <View style={styles.section}>
                        <Text style={{ fontSize: 14, fontWeight: '900', color: '#1c2d4f', marginBottom: 4 }}>VALIDAÇÃO DO CLIENTE</Text>
                        <Text style={[styles.fieldLabel, { marginTop: 12, marginBottom: 4 }]}>{t('execResponsibleName')}</Text>
                        <TextInput style={styles.input} placeholder="Quem acompanhou o serviço" value={clientName} onChangeText={setClientName} />

                        <Text style={[styles.fieldLabel, { marginTop: 24, marginBottom: 8 }]}>{t('execDigitalSignature')}</Text>
                        {signature ? (
                            <Pressable onPress={() => setSignature(null)} style={styles.signaturePreviewContainer}>
                                <Image source={{ uri: signature }} style={styles.signaturePreview} resizeMode="contain" />
                                <Text style={styles.clearSignatureText}>{t('execTapToRedo')}</Text>
                            </Pressable>
                        ) : (
                            <Pressable style={styles.signaturePlaceholder} onPress={async () => {
                                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
                                setSignatureModalVisible(true);
                            }}>
                                <Ionicons name="pencil" size={32} color="#666" />
                                <Text style={styles.signaturePlaceholderText}>{t('execCollectSignature')}</Text>
                            </Pressable>
                        )}
                    </View>
                )}
            </ScrollView>

            {/* Modal QR Code Scanner */}
            <Modal visible={isScannerVisible} animationType="slide" onRequestClose={() => setIsScannerVisible(false)}>
                <View style={{ flex: 1, backgroundColor: '#000' }}>
                    <View style={{ position: 'absolute', top: 50, right: 20, zIndex: 10 }}>
                        <Pressable onPress={() => setIsScannerVisible(false)} style={{ padding: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 }}>
                            <Ionicons name="close" size={30} color="#fff" />
                        </Pressable>
                    </View>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        <CameraView
                            style={{ width: '100%', height: '100%' }}
                            facing="back"
                            barcodeScannerSettings={{
                                barcodeTypes: ["qr", "ean13", "ean8", "code128", "code39", "upc_a", "upc_e", "pdf417"],
                            }}
                            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
                        />
                        <View style={{ position: 'absolute', width: 250, height: 250, borderWidth: 2, borderColor: '#fff', borderRadius: 10, backgroundColor: 'transparent' }} />
                        <Text style={{ position: 'absolute', bottom: 50, color: '#fff', fontSize: 16, fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 8, overflow: 'hidden' }}>
                            Aponte para o QR Code da peça
                        </Text>
                    </View>
                </View>
            </Modal>

            {/* IMPEDIMENT FORM OVERLAY — shown when technician opts to block after filling forms */}
            {showImpedimentForm && (
                <View style={styles.impedimentOverlay}>
                    <View style={styles.impedimentHeader}>
                        <Ionicons name="hand-left" size={22} color="#dc2626" />
                        <Text style={styles.impedimentHeaderTitle}>{t('execImpedimentOS')}</Text>
                        <Pressable onPress={() => setShowImpedimentForm(false)} style={styles.impedimentCloseBtn}>
                            <Ionicons name="close" size={22} color="#64748b" />
                        </Pressable>
                    </View>

                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
                        <View style={styles.impedimentInfoBox}>
                            <Ionicons name="information-circle-outline" size={16} color="#1d4ed8" />
                            <Text style={styles.impedimentInfoText}>
                                Todos os dados do formulário já preenchidos serão salvos.
                                Informe o motivo do impedimento para prosseguir.
                            </Text>
                        </View>

                        <Text style={styles.impedimentLabel}>MOTIVO DO IMPEDIMENTO *</Text>
                        <TextInput
                            style={[styles.input, styles.textArea, { marginTop: 8, backgroundColor: '#fff' }]}
                            placeholder="Descreva o motivo que impossibilitou a conclusão do serviço..."
                            multiline
                            numberOfLines={5}
                            value={impedimentReason}
                            onChangeText={setImpedimentReason}
                        />

                        <Text style={[styles.impedimentLabel, { marginTop: 20 }]}>FOTOS DO IMPEDIMENTO (Opcional — Até 10)</Text>

                        {impedimentPhotos.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginBottom: 4 }}>
                                {impedimentPhotos.map((uri, index) => (
                                    <Pressable
                                        key={index}
                                        onPress={() => {
                                            if (typeof uri === 'string' && uri.startsWith('http')) {
                                                console.log(`[execute.tsx] 🗑️ Excluindo arquivo do Supabase: ${uri}`);
                                                OrderService.deleteFile(uri).catch((e) => console.warn(`Erro ao excluir:`, e));
                                            }
                                            setImpedimentPhotos(prev => prev.filter((_, i) => i !== index));
                                        }}
                                        style={{ marginRight: 10, position: 'relative', width: 110, height: 110, borderRadius: 10, overflow: 'hidden', backgroundColor: '#e2e8f0' }}
                                    >
                                        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                        <View style={{ position: 'absolute', top: -3, right: -3, backgroundColor: '#fff', borderRadius: 14, padding: 1 }}>
                                            <Ionicons name="close-circle" size={26} color="#dc2626" />
                                        </View>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        )}

                        {impedimentPhotos.length < 10 && (
                            <Pressable 
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    backgroundColor: '#fff5f5',
                                    borderWidth: 2,
                                    borderColor: '#fca5a5',
                                    borderStyle: 'dashed',
                                    borderRadius: 10,
                                    padding: 16,
                                    marginBottom: 8
                                }}
                                onPress={() => setIsImpedimentPhotoSourceVisible(true)}
                                disabled={isUploadingImpedimentPhoto}
                            >
                                {isUploadingImpedimentPhoto ? (
                                    <ActivityIndicator size="small" color="#e11d48" style={{ marginRight: 14 }} />
                                ) : (
                                    <View style={{ backgroundColor: '#fee2e2', padding: 10, borderRadius: 50, marginRight: 14 }}>
                                        <Ionicons name="camera" size={22} color="#e11d48" />
                                    </View>
                                )}
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#be123c' }}>
                                        Tocar para Fotografar
                                    </Text>
                                    <Text style={{ fontSize: 12, color: '#9f1239', marginTop: 2 }}>
                                        {impedimentPhotos.length > 0 
                                            ? `Adicionar mais (${impedimentPhotos.length}/10)` 
                                            : t('execPhotoImpedimentOptional')}
                                    </Text>
                                </View>
                            </Pressable>
                        )}

                        <View style={styles.impedimentInfoBox}>
                            <Ionicons name="alert-circle-outline" size={16} color="#991b1b" />
                            <Text style={[styles.impedimentInfoText, { color: '#991b1b' }]}>
                                O Nome e a Assinatura do Cliente (presentes na página de Validação do formulário) são obrigatórios para confirmar este impedimento.
                            </Text>
                        </View>
                    </ScrollView>

                    <View style={[styles.impedimentFooter, { paddingBottom: 16 }]}>
                        <Pressable
                            style={styles.impedimentCancelBtn}
                            onPress={() => setShowImpedimentForm(false)}
                        >
                            <Text style={styles.impedimentCancelText}>{t('execBackToForm')}</Text>
                        </Pressable>
                        <Pressable
                            style={[styles.impedimentConfirmBtn, (isBlockingFromForm || hasPendingUploads) && { opacity: 0.7 }]}
                            onPress={handleBlockFromForm}
                            disabled={isBlockingFromForm || hasPendingUploads}
                        >
                            {isBlockingFromForm
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Ionicons name="hand-left" size={18} color="#fff" />}
                            <Text style={styles.impedimentConfirmText}>
                                {isBlockingFromForm ? t('execRegistering') : t('execConfirmImpediment')}
                            </Text>
                        </Pressable>
                    </View>
                </View>
            )}

            {/* PAGINATED FOOTER */}
            <View style={[styles.footer, { paddingBottom: 4 }]}>
                {/* On the last page: show Impedir + Finalizar */}
                {currentPage === totalPages - 1 ? (
                    <View style={{ gap: 10 }}>
                        {/* v3: Banner de uploads pendentes — bloqueia finalização */}
                        {hasPendingUploads && !isSubmitting && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fef3c7', padding: 10, borderRadius: 10, gap: 8, borderWidth: 1, borderColor: '#fde68a' }}>
                                <ActivityIndicator size="small" color="#d97706" />
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#92400e', flex: 1 }}>
                                    {pendingUploadCount > 0 
                                        ? `Enviando ${pendingUploadCount} ${pendingUploadCount === 1 ? 'arquivo' : 'arquivos'}... Aguarde para finalizar.`
                                        : 'Processando mídia... Aguarde para finalizar.'}
                                </Text>
                            </View>
                        )}
                        <View style={{ flexDirection: 'row', gap: 12 }}>
                            <Pressable
                                style={[styles.paginationButton, styles.backButton]}
                                onPress={prevPage}
                            >
                                <Ionicons name="chevron-back" size={20} color="#475569" />
                                <Text style={styles.backButtonText}>{t('execBack')}</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.submitButton, { flex: 2 }, (isSubmitting || hasPendingUploads) && { opacity: 0.7 }]}
                                onPress={handleSubmit}
                                disabled={isSubmitting || hasPendingUploads}
                            >
                                {isSubmitting ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : hasPendingUploads ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <Ionicons name="checkmark-circle" size={20} color="#fff" />
                                )}
                                <Text style={styles.submitButtonText}>{isSubmitting ? t('execSending') : hasPendingUploads ? t('execProcessing') || 'Enviando...' : t('execFinishOS')}</Text>
                            </Pressable>
                        </View>

                        {/* Overlay de progresso durante envio */}
                        {isSubmitting && (
                            <Modal transparent animationType="fade" visible={isSubmitting}>
                                <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.85)', justifyContent: 'center', alignItems: 'center', padding: 32 }}>
                                    <View style={{ backgroundColor: '#ffffff', borderRadius: 20, padding: 32, width: '85%', alignItems: 'center', elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12 }}>
                                        <ActivityIndicator size="large" color="#1c2d4f" style={{ marginBottom: 20 }} />
                                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#0f172a', marginBottom: 8, textAlign: 'center' }}>
                                            Finalizando OS
                                        </Text>
                                        <Text style={{ fontSize: 14, color: '#475569', textAlign: 'center', marginBottom: 16 }}>
                                            {submitProgress.label || 'Preparando...'}
                                        </Text>
                                        {submitProgress.total > 0 && (
                                            <View style={{ width: '100%', height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
                                                <View style={{ width: `${Math.round((submitProgress.current / submitProgress.total) * 100)}%`, height: '100%', backgroundColor: '#16a34a', borderRadius: 3 }} />
                                            </View>
                                        )}
                                        {submitProgress.total > 0 && (
                                            <Text style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
                                                {submitProgress.current}/{submitProgress.total} arquivos enviados
                                            </Text>
                                        )}
                                    </View>
                                </View>
                            </Modal>
                        )}
                        
                        {/* Overlay de processamento de mídia (Galeria/Fotos) */}
                        {isProcessingMedia && (
                            <Modal transparent animationType="fade" visible={isProcessingMedia}>
                                <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.7)', justifyContent: 'center', alignItems: 'center' }}>
                                    <View style={{ backgroundColor: '#ffffff', borderRadius: 16, padding: 24, alignItems: 'center', width: '70%' }}>
                                        <ActivityIndicator size="large" color="#1c2d4f" />
                                        <Text style={{ marginTop: 16, fontSize: 14, fontWeight: '700', color: '#1c2d4f', textAlign: 'center' }}>
                                            {mediaProcessingLabel}
                                        </Text>
                                    </View>
                                </View>
                            </Modal>
                        )}

                        {allowImpediment && (
                        <Pressable
                            style={styles.impedimentTriggerBtn}
                            onPress={() => {
                                setShowImpedimentForm(true);
                                scrollViewRef.current?.scrollTo({ y: 0, animated: false });
                            }}
                        >
                            <Ionicons name="hand-left-outline" size={18} color="#dc2626" />
                            <Text style={styles.impedimentTriggerText}>{t('execImpedInstead')}</Text>
                        </Pressable>
                        )}
                    </View>
                ) : (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                        {currentPage > 0 ? (
                            <Pressable style={[styles.paginationButton, styles.backButton]} onPress={prevPage}>
                                <Ionicons name="chevron-back" size={20} color="#475569" />
                                <Text style={styles.backButtonText}>{t('execBack')}</Text>
                            </Pressable>
                        ) : (
                            <Pressable style={[styles.paginationButton, styles.backButton]} onPress={() => router.back()}>
                                <Ionicons name="close" size={20} color="#475569" />
                                <Text style={styles.backButtonText}>{t('execExit')}</Text>
                            </Pressable>
                        )}
                        <Pressable style={[styles.paginationButton, styles.nextButton]} onPress={nextPage}>
                            <Text style={styles.nextButtonText}>{t('execNext')}</Text>
                            <Ionicons name="chevron-forward" size={20} color="#fff" />
                        </Pressable>
                    </View>
                )}
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
                    <View style={[styles.signatureFooter, { paddingBottom: 16 }]}>
                        <Pressable onPress={async () => {
                            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                            setSignatureModalVisible(false);
                        }} style={styles.signatureActionBtn}><Text>{t('execSignatureCancel')}</Text></Pressable>
                        <Pressable onPress={() => signatureRef.current?.readSignature()} style={[styles.signatureActionBtn, styles.confirmBtn]}><Text style={styles.confirmText}>{t('execSignatureConfirm')}</Text></Pressable>
                    </View>
                </View>
            </Modal>

            {/* MODAL: ASSINATURA IMPEDIMENTO */}
            <Modal visible={isImpedimentSignatureVisible} animationType="slide" onRequestClose={async () => {
                await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                setIsImpedimentSignatureVisible(false);
            }}>
                <View style={styles.signatureModalContainer}>
                    <SignatureScreen
                        ref={signatureRef}
                        onOK={handleImpedimentSignature}
                        webStyle={`.m-signature-pad--footer {display: none; margin: 0px;} body,html {width: 100%; height: 100%;}`}
                    />
                    <View style={[styles.signatureFooter, { paddingBottom: 16 }]}>
                        <Pressable onPress={async () => {
                            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
                            setIsImpedimentSignatureVisible(false);
                        }} style={styles.signatureActionBtn}><Text>{t('execSignatureBack')}</Text></Pressable>
                        <Pressable onPress={() => signatureRef.current?.clearSignature()} style={styles.signatureActionBtn}><Text>{t('execSignatureClear')}</Text></Pressable>
                        <Pressable onPress={() => signatureRef.current?.readSignature()} style={[styles.signatureActionBtn, styles.confirmBtn]}><Text style={styles.confirmText}>{t('execSignatureConfirm')}</Text></Pressable>
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
                            <Text style={styles.modalTitle}>{t('execMyStock')}</Text>
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
                                const filtered = myStock.filter(s => {
                                    const q = searchQuery.toLowerCase();
                                    const descMatch = s.item?.description?.toLowerCase().includes(q) ?? false;
                                    const codeMatch = s.item?.code?.toLowerCase().includes(q) ?? false;
                                    const fabMatch = s.item?.manufacturerCode?.toLowerCase().includes(q) ?? false;
                                    return descMatch || codeMatch || fabMatch;
                                });

                                if (filtered.length === 0) {
                                    return (
                                        <View style={{ alignItems: 'center', padding: 40 }}>
                                            <Ionicons name="cube-outline" size={48} color="#cbd5e1" />
                                            <Text style={{ color: '#94a3b8', marginTop: 12, textAlign: 'center' }}>
                                                {searchQuery ? t('execNoSearchResults') : t('execNoStockItems')}
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
                            <Text style={styles.modalTitle}>{t('execSetQuantity')}</Text>
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
                                    <Ionicons name="remove" size={24} color="#334155" />
                                </Pressable>

                                <TextInput
                                    style={{ fontSize: 32, fontWeight: 'bold', color: '#334155', textAlign: 'center', minWidth: 60 }}
                                    keyboardType="numeric"
                                    value={qtyToSelect}
                                    onChangeText={setQtyToSelect}
                                    autoFocus
                                />

                                <Pressable
                                    onPress={() => setQtyToSelect(prev => (parseInt(prev || '1') + 1).toString())}
                                    style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }}
                                >
                                    <Ionicons name="add" size={24} color="#334155" />
                                </Pressable>
                            </View>

                            <Pressable
                                style={{ backgroundColor: '#1c2d4f', width: '100%', paddingVertical: 16, borderRadius: 12, alignItems: 'center' }}
                                onPress={() => {
                                    const q = parseInt(qtyToSelect) || 0;

                                    if (q <= 0) {
                                        Alert.alert(t('execInvalidQty'), t('execQtyGreaterZero'));
                                        return;
                                    }

                                    if (selectedPart && q > selectedPart.quantity) {
                                        Alert.alert(
                                            t('execInsufficientBalance'),
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
                                <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{t('execSignatureConfirm')}</Text>
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
                            <Text style={styles.modalTitle}>{t('execLinkEquipment')}</Text>
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
            
            {/* MODAL: SELEÇÃO DE ORIGEM DO VÍDEO (THEMED) */}
            <Modal
                visible={isVideoSourceModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsVideoSourceModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.bottomSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('execAttachVideo')}</Text>
                            <Pressable onPress={() => setIsVideoSourceModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#666" />
                            </Pressable>
                        </View>
                        
                        <View style={{ padding: 20, gap: 12 }}>
                            <Pressable 
                                style={[styles.themedChoiceBtn, { backgroundColor: '#1c2d4f' }]} 
                                onPress={() => {
                                    setIsVideoSourceModalVisible(false);
                                    handleTakeVideo();
                                }}
                            >
                                <Ionicons name="camera" size={20} color="#fff" />
                                <Text style={styles.themedChoiceText}>{t('execRecordVideoNow')}</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={[styles.themedChoiceBtn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1' }]} 
                                onPress={handlePickVideoFromGallery}
                            >
                                <Ionicons name="images" size={20} color="#1c2d4f" />
                                <Text style={[styles.themedChoiceText, { color: '#1c2d4f' }]}>{t('osChooseGallery')}</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={{ marginTop: 8, padding: 12, alignItems: 'center' }} 
                                onPress={() => setIsVideoSourceModalVisible(false)}
                            >
                                <Text style={{ color: '#64748b', fontWeight: '600' }}>{t('execSignatureCancel')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL: SELEÇÃO DE ORIGEM DA FOTO (THEMED) */}
            <Modal
                visible={isPhotoSourceModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsPhotoSourceModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.bottomSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('execAttachImage')}</Text>
                            <Pressable onPress={() => setIsPhotoSourceModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#666" />
                            </Pressable>
                        </View>
                        
                        <View style={{ padding: 20, gap: 12 }}>
                            <Pressable 
                                style={[styles.themedChoiceBtn, { backgroundColor: '#1c2d4f' }]} 
                                onPress={() => {
                                    setIsPhotoSourceModalVisible(false);
                                    if (!photoSourceTarget) return;
                                    const callback = photoSourceTarget.type === 'extra' 
                                        ? uploadExtraPhoto 
                                        : (uris: string[]) => uploadFieldPhoto(uris, photoSourceTarget.eqKey!, photoSourceTarget.fieldId!);
                                    
                                    processPhotoChoice('camera', callback);
                                }}
                            >
                                <Ionicons name="camera" size={20} color="#fff" />
                                <Text style={styles.themedChoiceText}>{t('osTakePhotoNow')}</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={[styles.themedChoiceBtn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1' }]} 
                                onPress={() => {
                                    setIsPhotoSourceModalVisible(false);
                                    if (!photoSourceTarget) return;
                                    const limit = photoSourceTarget.type === 'extra' ? 10 : 7;
                                    const callback = photoSourceTarget.type === 'extra' 
                                        ? uploadExtraPhoto 
                                        : (uris: string[]) => uploadFieldPhoto(uris, photoSourceTarget.eqKey!, photoSourceTarget.fieldId!);
                                    
                                    processPhotoChoice('library', callback, limit);
                                }}
                            >
                                <Ionicons name="images" size={20} color="#1c2d4f" />
                                <Text style={[styles.themedChoiceText, { color: '#1c2d4f' }]}>{t('osChooseGallery')}</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={{ marginTop: 8, padding: 12, alignItems: 'center' }} 
                                onPress={() => setIsPhotoSourceModalVisible(false)}
                            >
                                <Text style={{ color: '#64748b', fontWeight: '600' }}>{t('execSignatureCancel')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL: SELEÇÃO DE ORIGEM DA PEÇA (THEMED) */}
            <Modal
                visible={isPartSourceModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsPartSourceModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.bottomSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('execAddPart') || 'Adicionar Peça'}</Text>
                            <Pressable onPress={() => setIsPartSourceModalVisible(false)}>
                                <Ionicons name="close" size={24} color="#666" />
                            </Pressable>
                        </View>
                        
                        <View style={{ padding: 20, gap: 12 }}>
                            <Pressable 
                                style={[styles.themedChoiceBtn, { backgroundColor: '#1c2d4f' }]} 
                                onPress={async () => {
                                    setIsPartSourceModalVisible(false);
                                    if (!cameraPermission?.granted) {
                                        const { granted } = await requestCameraPermission();
                                        if (!granted) {
                                            Alert.alert('Aviso', 'Permissão da câmera é necessária.');
                                            return;
                                        }
                                    }
                                    setScanned(false);
                                    setIsScannerVisible(true);
                                }}
                            >
                                <Ionicons name="qr-code" size={20} color="#fff" />
                                <Text style={styles.themedChoiceText}>Escanear QR Code</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={[styles.themedChoiceBtn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1' }]} 
                                onPress={() => {
                                    setIsPartSourceModalVisible(false);
                                    setIsPartPickerVisible(true);
                                }}
                            >
                                <Ionicons name="search" size={20} color="#1c2d4f" />
                                <Text style={[styles.themedChoiceText, { color: '#1c2d4f' }]}>Buscar no Estoque</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={{ marginTop: 8, padding: 12, alignItems: 'center' }} 
                                onPress={() => setIsPartSourceModalVisible(false)}
                            >
                                <Text style={{ color: '#64748b', fontWeight: '600' }}>{t('execSignatureCancel')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL: CUSTOM VALIDATION ALERT */}
            <Modal visible={validationAlert.visible} transparent animationType="fade" onRequestClose={() => setValidationAlert({ visible: false, title: '', message: '' })}>
                <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                    <View style={{ backgroundColor: '#fff', width: '100%', borderRadius: 16, padding: 24, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.1, shadowRadius: 15, elevation: 10 }}>
                        <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#fee2e2', justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
                            <Ionicons name="warning" size={32} color="#ef4444" />
                        </View>
                        <Text style={{ fontSize: 20, fontWeight: '800', color: '#1e293b', marginBottom: 8, textAlign: 'center' }}>
                            {validationAlert.title}
                        </Text>
                        <Text style={{ fontSize: 15, color: '#64748b', textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
                            {validationAlert.message}
                        </Text>
                        <Pressable 
                            style={{ backgroundColor: '#ef4444', paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, width: '100%', alignItems: 'center' }}
                            onPress={() => setValidationAlert({ visible: false, title: '', message: '' })}
                        >
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Entendi</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>

            {/* MODAL: FOTO DO IMPEDIMENTO (câmera ou galeria) */}
            <Modal
                visible={isImpedimentPhotoSourceVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsImpedimentPhotoSourceVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.bottomSheet}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>{t('execImpedimentPhoto')}</Text>
                            <Pressable onPress={() => setIsImpedimentPhotoSourceVisible(false)}>
                                <Ionicons name="close" size={24} color="#666" />
                            </Pressable>
                        </View>
                        <View style={{ padding: 20, gap: 12 }}>
                            <Pressable
                                style={[styles.themedChoiceBtn, { backgroundColor: '#dc2626' }]}
                                onPress={() => {
                                    setIsImpedimentPhotoSourceVisible(false);
                                    handleAddImpedimentPhoto('camera');
                                }}
                            >
                                <Ionicons name="camera" size={20} color="#fff" />
                                <Text style={styles.themedChoiceText}>{t('osTakePhotoNow')}</Text>
                            </Pressable>
                            <Pressable
                                style={[styles.themedChoiceBtn, { backgroundColor: '#fff', borderWidth: 1, borderColor: '#fecaca' }]}
                                onPress={() => {
                                    setIsImpedimentPhotoSourceVisible(false);
                                    handleAddImpedimentPhoto('library');
                                }}
                            >
                                <Ionicons name="images" size={20} color="#dc2626" />
                                <Text style={[styles.themedChoiceText, { color: '#dc2626' }]}>{t('osChooseGallery')}</Text>
                            </Pressable>
                            <Pressable
                                style={{ marginTop: 8, padding: 12, alignItems: 'center' }}
                                onPress={() => setIsImpedimentPhotoSourceVisible(false)}
                            >
                                <Text style={{ color: '#64748b', fontWeight: '600' }}>{t('execSignatureCancel')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f1f5f9' },
    content: { padding: 8, paddingBottom: 100 },
    section: { marginBottom: 14, backgroundColor: '#ffffff', padding: 12, borderRadius: 14, shadowColor: '#1c2d4f', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: '#e2e8f0' },
    dynamicFieldControl: { marginBottom: 16, backgroundColor: '#ffffff', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', shadowColor: 'transparent', elevation: 0 },
    dynamicFieldLabel: { fontSize: 12, fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 },
    input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, fontSize: 14, backgroundColor: '#f8fafc', marginTop: 8, color: '#1e293b' },
    textArea: { minHeight: 90, textAlignVertical: 'top' },
    pickerContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 10 },
    optionBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 8, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc' },
    themedChoiceBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 16, borderRadius: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    themedChoiceText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    optionBtnSelected: { backgroundColor: '#1c2d4f', borderColor: '#1c2d4f' },
    optionText: { color: '#475569', fontWeight: '600', fontSize: 13 },
    optionTextSelected: { color: '#ffffff', fontWeight: 'bold', fontSize: 13 },
    photoFieldPlaceholder: { height: 90, borderWidth: 1.5, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', marginTop: 8, gap: 6 },
    fieldLabel: { fontSize: 11, color: '#64748b', fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    signaturePlaceholder: { height: 110, borderWidth: 1.5, borderColor: '#cbd5e1', borderStyle: 'dashed', borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', marginTop: 8, gap: 8 },
    signaturePlaceholderText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
    signaturePreviewContainer: { alignItems: 'center', marginTop: 10 },
    signaturePreview: { width: '100%', height: 110, backgroundColor: '#ffffff', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    clearSignatureText: { color: '#e11d48', fontWeight: '700', marginTop: 8, fontSize: 12 },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', padding: 6, borderTopWidth: 1, borderTopColor: '#f1f5f9', shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.04, shadowRadius: 10, elevation: 12 },
    submitButton: { backgroundColor: '#10b981', paddingVertical: 14, borderRadius: 12, alignItems: 'center', shadowColor: '#10b981', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 6, elevation: 3 },
    submitButtonText: { color: '#ffffff', fontSize: 16, fontWeight: '800', letterSpacing: 0.5 },
    signatureModalContainer: { flex: 1, backgroundColor: '#ffffff', paddingTop: 40 },
    signatureFooter: { flexDirection: 'row', padding: 16, justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9' },
    signatureActionBtn: { paddingVertical: 12, paddingHorizontal: 24, borderRadius: 10, backgroundColor: '#f1f5f9' },
    confirmBtn: { backgroundColor: '#1c2d4f' },
    confirmText: { color: '#ffffff', fontWeight: 'bold' },
    infoCard: { backgroundColor: '#ffffff', borderRadius: 14, padding: 16, marginBottom: 18, borderLeftWidth: 4, borderLeftColor: '#1c2d4f', shadowColor: '#1c2d4f', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2 },
    infoCardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', paddingBottom: 10 },
    infoCardTitle: { fontSize: 14, fontWeight: '800', color: '#1c2d4f', textTransform: 'uppercase', letterSpacing: 0.5 },
    infoRow: { marginBottom: 8 },
    infoLabel: { fontSize: 10, fontWeight: '900', color: '#94a3b8', marginBottom: 2, letterSpacing: 0.5 },
    infoValue: { fontSize: 13, color: '#334155', fontWeight: '500' },
    infoDivider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 10 },
    infoValueBold: { fontSize: 14, fontWeight: '800', color: '#1c2d4f' },
    equipmentGroup: { marginBottom: 18, borderRadius: 14, backgroundColor: '#ffffff', shadowColor: '#1c2d4f', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
    equipmentHeader: { backgroundColor: '#1c2d4f', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    equipmentIconWrapper: { backgroundColor: '#ffffff', padding: 4, borderRadius: 6 },
    equipmentTitle: { color: '#ffffff', fontWeight: '700', fontSize: 14, flex: 1, letterSpacing: -0.2 },
    equipmentFormsContainer: { padding: 6, backgroundColor: '#f8fafc' },
    showPartsButton: { marginBottom: 18, backgroundColor: '#059669', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#059669', borderStyle: 'solid', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, shadowColor: '#1c2d4f', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
    showPartsButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },
    globalConclusionSection: { marginBottom: 18, borderRadius: 14, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#ffffff', shadowColor: '#1c2d4f', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
    conclusionHeader: { backgroundColor: '#e2e8f0', padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#cbd5e1' },
    voiceButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, gap: 4, borderWidth: 1, borderColor: '#e2e8f0' },
    voiceButtonActive: { backgroundColor: '#fee2e2', borderColor: '#fecaca' },
    voiceButtonDisabled: { opacity: 0.7, backgroundColor: '#f8fafc' },
    voiceButtonText: { fontSize: 11, fontWeight: '700', color: '#1c2d4f' },
    addPartButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1c2d4f', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
    addPartButtonText: { color: '#ffffff', fontSize: 12, fontWeight: 'bold' },
    usedItemsList: { marginTop: 6, gap: 10 },
    usedItemCard: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    usedItemDescription: { fontSize: 13, fontWeight: '700', color: '#334155' },
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
    stockItemName: { fontSize: 14, fontWeight: '600', color: '#334155', marginBottom: 2 },
    stockItemCode: { fontSize: 12, color: '#64748b' },
    eqSelectorItem: { flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: '#f8fafc', borderRadius: 10, marginBottom: 8, gap: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    eqSelectorText: { fontSize: 14, fontWeight: '600', color: '#334155' },
    searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, paddingHorizontal: 10, height: 40, borderWidth: 1, borderColor: '#e2e8f0' },
    searchInputStyle: { flex: 1, marginLeft: 8, fontSize: 13, color: '#333' },
    videoModalContainer: { flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    videoModalCloseButton: { position: 'absolute', top: 40, right: 20, zIndex: 10, padding: 10 },
    fullscreenVideo: { width: '100%', height: '80%' },
    card: { marginBottom: 14, backgroundColor: '#ffffff', borderRadius: 14, shadowColor: '#1c2d4f', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 2, borderWidth: 1, borderColor: '#e2e8f0', overflow: 'hidden' },
    cardHeader: { backgroundColor: '#f8fafc', padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
    headerIconBox: { padding: 6, borderRadius: 8 },
    cardTitle: { fontSize: 14, fontWeight: '700', color: '#334155' },
    cardContent: { padding: 16 },
    // ── Video Card Styles ──────────────────────────────────────────────────────
    videoProcessingBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 28, backgroundColor: '#f0fdf4', borderRadius: 12, borderWidth: 1, borderColor: '#bbf7d0' },
    videoProcessingText: { fontSize: 13, fontWeight: '600', color: '#059669' },
    videoPreviewCard: { borderRadius: 12, overflow: 'hidden', backgroundColor: '#1c2d4f', borderWidth: 1, borderColor: '#334155' },
    videoThumbContainer: { height: 180, alignItems: 'center', justifyContent: 'center', backgroundColor: '#1c2d4f', position: 'relative' },
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
    videoRecordTitle: { fontSize: 15, fontWeight: '700', color: '#334155' },
    videoRecordSubtitle: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
    // ── Pagination / Progress Styles ───────────────────────────────────────────
    progressBarContainer: { height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, marginBottom: 16, overflow: 'hidden' },
    progressBar: { height: '100%', backgroundColor: '#1c2d4f' },
    paginationButton: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, flex: 1, justifyContent: 'center', gap: 8 },
    backButton: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
    backButtonText: { color: '#475569', fontWeight: 'bold', fontSize: 14 },
    nextButton: { backgroundColor: '#1c2d4f' },
    nextButtonText: { color: '#ffffff', fontWeight: 'bold', fontSize: 14 },

    // ── Impediment Trigger (on last page footer) ────────────────────────────────
    impedimentTriggerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' },
    impedimentTriggerText: { color: '#dc2626', fontWeight: '700', fontSize: 14 },

    // ── Impediment Overlay (full-screen panel shown over the form) ──────────────
    impedimentOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#ffffff', zIndex: 100, flex: 1 },
    impedimentHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, borderBottomWidth: 1, borderBottomColor: '#fee2e2', backgroundColor: '#fff1f2', paddingTop: 60 },
    impedimentHeaderTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#991b1b' },
    impedimentCloseBtn: { padding: 6 },
    impedimentInfoBox: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#eff6ff', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe', marginBottom: 20 },
    impedimentInfoText: { flex: 1, fontSize: 12, color: '#1e40af', fontWeight: '600', lineHeight: 18 },
    impedimentLabel: { fontSize: 10, fontWeight: '900', color: '#991b1b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 },
    impedimentPhotoBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: '#059669', borderStyle: 'solid', borderRadius: 10, padding: 14, marginTop: 10, backgroundColor: '#059669' },
    impedimentPhotoBtnText: { fontSize: 13, color: '#ffffff', fontWeight: '700' },
    impedimentFooter: { padding: 14, borderTopWidth: 1, borderTopColor: '#fee2e2', backgroundColor: '#ffffff', gap: 10 },
    impedimentCancelBtn: { paddingVertical: 13, borderRadius: 12, alignItems: 'center', backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0' },
    impedimentCancelText: { color: '#475569', fontWeight: '700', fontSize: 14 },
    impedimentConfirmBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 12, backgroundColor: '#dc2626' },
    impedimentConfirmText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },

    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
});

