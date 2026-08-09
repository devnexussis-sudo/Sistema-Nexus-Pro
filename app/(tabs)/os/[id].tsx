
import { HeaderRightToggle } from '@/components/header-right-toggle';
import { ImageViewerModal } from '@/components/image-viewer-modal';
import { SecureImage, warmSignedUrlCacheBulk } from '@/components/secure-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { NexusAlert } from '@/components/nexus-alert';
import { getStatusConfig } from '@/constants/mock-data';
import { useI18n } from '@/services/i18n';
import { OrderService } from '@/services/order-service';
import { supabase } from '@/services/supabase';
import { syncService } from '@/services/sync-service';
import { TenantService } from '@/services/tenant-service';
import { ImageService } from '@/services/image-service';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Tabs, useFocusEffect, useLocalSearchParams, useRouter, useNavigation } from 'expo-router';
import { useGlobalLoading } from '@/contexts/GlobalLoadingContext';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371e3; // Radius of the earth in m
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

class SafeRenderErrorBoundary extends React.Component<{children: any}, {hasError: boolean, error: any}> {
    constructor(props: any) {
        super(props);
        this.state = { hasError: false, error: null };
    }
    static getDerivedStateFromError(error: any) {
        return { hasError: true, error };
    }
    componentDidCatch(error: any, errorInfo: any) {
        console.error("SAFE RENDER ERROR:", error, errorInfo);
    }
    render() {
        if (this.state.hasError) {
            return (
                <View style={{ flex: 1, padding: 24, backgroundColor: '#fef2f2', justifyContent: 'center' }}>
                    <Ionicons name="warning" size={48} color="#dc2626" style={{ marginBottom: 16 }} />
                    <Text style={{ color: '#b91c1c', fontWeight: 'bold', fontSize: 18 }}>Erro Oculto Capturado!</Text>
                    <Text style={{ color: '#7f1d1d', marginTop: 12, fontWeight: '500' }}>O app tentou crashar, mas o ErrorBoundary segurou.</Text>
                    <Text style={{ color: '#991b1b', marginTop: 12, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                        {this.state.error?.toString()}
                    </Text>
                </View>
            );
        }
        return this.props.children;
    }
}

export default function OrderDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const navigation = useNavigation();
    const { showLoading, hideLoading } = useGlobalLoading();
    const insets = useSafeAreaInsets();
    const { t, lang } = useI18n();
    const statusConfig = getStatusConfig(t);
    // Initialize order state, will be updated via useFocusEffect
    const [order, setOrder] = useState<any | null>(null);
    // Block modal state & Action modal state
    const [modalVisible, setModalVisible] = useState(false);
    const [isActionModalVisible, setIsActionModalVisible] = useState(false);
    const [actionLocation, setActionLocation] = useState<{lat?: number, lon?: number}>({});
    const [impedimentReason, setImpedimentReason] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [alertConfig, setAlertConfig] = useState<{ visible: boolean; title: string; message: string; buttons?: any[] }>({ visible: false, title: '', message: '' });

    const customAlert = (title: string, message: string, buttons?: any[]) => {
        setAlertConfig({ visible: true, title, message, buttons: buttons || [{ text: 'OK' }] });
    };
    const [isStatusModalVisible, setIsStatusModalVisible] = useState(false);

    // Image viewer state
    const [viewerVisible, setViewerVisible] = useState(false);
    const [viewerUris, setViewerUris] = useState<string[]>([]);
    const [viewerIndex, setViewerIndex] = useState(0);

    const openImage = (uri: string, groupUris?: string[]) => {
        const uris = groupUris && groupUris.length > 0 ? groupUris : [uri];
        const index = uris.indexOf(uri);
        setViewerUris(uris);
        setViewerIndex(index >= 0 ? index : 0);
        setViewerVisible(true);
    };
    // Block photo state
    const [impedimentPhotoUris, setImpedimentPhotoUris] = useState<string[]>([]);
    const [isUploadingBlock, setIsUploadingBlock] = useState(false);
    const [isPhotoSourceModalVisible, setIsPhotoSourceModalVisible] = useState(false);
    // Concurrent OS control
    const [allowMultipleInProgress, setAllowMultipleInProgress] = useState(false);
    const [showPrices, setShowPrices] = useState(false);
    // Tenant feature toggles
    const [showClientContact, setShowClientContact] = useState(true);
    const [showStockHistory, setShowStockHistory] = useState(true);
    const [allowImpediment, setAllowImpediment] = useState(true);
    const [showVisitHistory, setShowVisitHistory] = useState(true);
    const [requireLocationForExecution, setRequireLocationForExecution] = useState(false);
    // Form templates for sorting and display
    const [formTemplates, setFormTemplates] = useState<Record<string, string[]>>({});
    const [templateTitles, setTemplateTitles] = useState<Record<string, string>>({});
    const [activationRules, setActivationRules] = useState<any[]>([]);
    const [serviceTypes, setServiceTypes] = useState<any[]>([]);
    // Expanded form groups state
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [dynamicPhone, setDynamicPhone] = useState<string | null>(null);
    // Visit history state
    const [orderVisits, setOrderVisits] = useState<any[]>([]);
    const [expandedVisits, setExpandedVisits] = useState<Record<string, boolean>>({});

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
    };

    useFocusEffect(
        useCallback(() => {
            let isActive = true;
            setLoading(true);
            setOrder(null);
            showLoading('Carregando OS...');

            const startTime = Date.now();
            const fetchOrder = async () => {
                try {
                    // Load tenant settings for concurrent OS control (force refresh on screen load)
                    TenantService.getSettings(true).then(settings => {
                        if (isActive) {
                            setAllowMultipleInProgress(settings.allowMultipleInProgress);
                            setShowPrices(settings.showStockPrice);
                            setShowClientContact(settings.showClientContact);
                            setShowStockHistory(settings.showStockHistory);
                            setAllowImpediment(settings.allowImpediment);
                            setShowVisitHistory(settings.showVisitHistory);
                            setRequireLocationForExecution(settings.requireLocationForExecution);
                        }
                    }).catch(() => {});

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

                    // 1. Fetch from Cache (Fast Load - No longer sets loading to false immediately to prevent staggered UI)
                    let currentOrder = await OrderService.getOrderById(id as string, false);
                    if (isActive && currentOrder) {
                        setOrder(currentOrder);
                    }

                    // 2. Background network refresh
                    const freshOrder = await OrderService.getOrderById(id as string, true);
                    if (isActive && freshOrder) {
                        setOrder(freshOrder);
                        currentOrder = freshOrder;
                    }

                    if (!currentOrder) return;

                    // 3. Fetch aggregate dependent data concurrently
                    const [visitsResult] = await Promise.all([
                        // 3.1 Visit history
                        OrderService.getOrderVisits(id as string).then(visits => {
                            if (isActive) {
                                setOrderVisits(visits);
                                // Sempre inicia recolhido — usuário deve clicar para expandir.
                                setExpandedVisits({});
                            }
                            return visits;
                        }),
                        
                        // 3.2 Form Templates for mapping (técnicos + financeiros)
                        (async () => {
                            try {
                                // Passo 1: Buscar TODOS os templates de uma vez
                                const templates = await OrderService.getFormTemplates();
                                const sTypes = await OrderService.getServiceTypes();
                                if (isActive) setServiceTypes(sTypes);

                                // Passo 2: Montar titlesMap e fieldsMap com TODOS os templates
                                // (sem filtrar por ID, porque precisamos também dos financeiros)
                                const map: Record<string, string[]> = {};
                                const titlesMap: Record<string, string> = {};
                                templates.forEach((t: any) => {
                                    map[t.id] = (t.fields || t.schema?.fields || []).map((f: any) => f.label || f.title || '');
                                    titlesMap[t.id] = t.title || t.name || '';
                                });

                                // Passo 3: Buscar activation_rules para descobrir financial_form_id por equipamento
                                // Isso é necessário porque OS antigas não salvavam o nome do formulário financeiro
                                try {
                                    const rules = await OrderService.getActivationRules();
                                    if (isActive) setActivationRules(rules);
                                    // Mapear todos os financial_form_id no titlesMap
                                    rules.forEach((rule: any) => {
                                        const finId = rule.financialFormId;
                                        if (finId && templates) {
                                            const ft = templates.find((t: any) => t.id === finId);
                                            if (ft) titlesMap[finId] = ft.title || ft.name || '';
                                        }
                                        // Também garantir que o técnico está mapeado
                                        const techId = rule.formId;
                                        if (techId && templates) {
                                            const tt = templates.find((t: any) => t.id === techId);
                                            if (tt) titlesMap[techId] = tt.title || tt.name || '';
                                        }
                                    });
                                } catch (ruleErr) {
                                    console.warn('[OS Detail] Não foi possível carregar activation_rules:', ruleErr);
                                }

                                if (isActive) {
                                    setFormTemplates(map);
                                    setTemplateTitles(titlesMap);
                                }
                            } catch (e) {
                                console.error('[OS Detail] Error fetching templates:', e);
                            }
                        })(),

                        // 3.3 Dynamic phone if missing
                        (async () => {
                            const existingPhone = currentOrder.customerPhone || currentOrder.contact_phone || currentOrder.contactPhone || currentOrder.customer_phone || currentOrder.phone || currentOrder.whatsapp || (currentOrder.formData && currentOrder.formData.clientPhone) || (currentOrder.customerData && currentOrder.customerData.whatsapp);
                            if (!existingPhone && currentOrder.customer) {
                                try {
                                    const {data} = await supabase.from('customers').select('whatsapp, phone').eq('name', currentOrder.customer).single();
                                    if (data?.whatsapp || data?.phone) {
                                        if (isActive) setDynamicPhone(data.whatsapp || data.phone);
                                    }
                                } catch (e) {}
                            }
                        })()
                    ]);

                    // 4. PREFETCH IMAGES
                    // Aguardar pré-carregamento de imagens para exibir de forma instantânea
                    if (isActive) {
                        const imagesToPreload = new Set<string>();

                        const addUrl = (url?: string) => {
                            if (typeof url === 'string' && url.startsWith('http')) imagesToPreload.add(url);
                        };
                        const addUrls = (val: any) => {
                            if (Array.isArray(val)) val.forEach(addUrl);
                            else if (typeof val === 'string') {
                                if (val.startsWith('[')) {
                                    try { JSON.parse(val).forEach(addUrl); } catch {}
                                } else {
                                    addUrl(val);
                                }
                            }
                        };

                        // OS Global Photos
                        addUrl(currentOrder.blockPhotoUrl);
                        addUrls(currentOrder.blockPhotoUrls);
                        
                        // OS Form Data Photos
                        if (currentOrder.formData) {
                            addUrl(currentOrder.formData.signature);
                            addUrl(currentOrder.formData.impediment_signature);
                            addUrls(currentOrder.formData.extra_photos);
                            addUrls(currentOrder.formData.photos);
                            
                            Object.values(currentOrder.formData).forEach(val => {
                                if (typeof val === 'string' && val.startsWith('http')) addUrl(val);
                                if (Array.isArray(val)) val.forEach(addUrl);
                            });
                        }

                        // Visit History Photos — reuse already-fetched visits from above (no duplicate network call)
                        const loadedVisits = visitsResult || [];
                        loadedVisits.forEach(v => {
                            const fd = v.form_data || {};
                            addUrls(fd.blockPhotoUrls);
                            addUrls(fd.extra_photos || fd.photos);
                            addUrl(fd.signature);
                            addUrl(fd.impediment_signature);
                            Object.values(fd).forEach(val => {
                                if (typeof val === 'string' && val.startsWith('http')) addUrl(val);
                                if (Array.isArray(val)) val.forEach(addUrl);
                            });
                        });

                        if (imagesToPreload.size > 0) {
                            // Evitar o 'await' para que o pré-carregamento aconteça fantasma em background
                            // Isso garante que o spinner desapareça rapidamente
                            warmSignedUrlCacheBulk(Array.from(imagesToPreload)).catch(err => {
                                console.warn('[OS Detail] Background image prefetch error:', err);
                            });
                        }
                    }

                } catch (e: any) {
                    console.error(e);
                    if (isActive) {
                        setError(e.message || t('alertError'));
                        setOrder(null);
                    }
                } finally {
                    const elapsed = Date.now() - startTime;
                    const remaining = Math.max(0, 1000 - elapsed);
                    
                    if (remaining > 0) {
                        await new Promise(resolve => setTimeout(resolve, remaining));
                    }
                    
                    if (isActive) setLoading(false);
                    hideLoading();
                }
            };

            if (loading) setLoading(true); // Ensure primary loader shows if no cache
            fetchOrder();
            return () => { isActive = false; };
        }, [id])
    );

    // Ouvinte em tempo real para alterações de configurações feitas pelo admin no painel
    React.useEffect(() => {
        const unsub = TenantService.onSettingsChange(settings => {
            console.log('[OS Detail] ⚡ Atualizando configurações da tela em tempo real!');
            setAllowMultipleInProgress(settings.allowMultipleInProgress);
            setShowPrices(settings.showStockPrice);
            setShowClientContact(settings.showClientContact);
            setShowStockHistory(settings.showStockHistory);
            setAllowImpediment(settings.allowImpediment);
            setShowVisitHistory(settings.showVisitHistory);
            setRequireLocationForExecution(settings.requireLocationForExecution);
        });
        return () => unsub();
    }, []);

    // Update navigation options safely outside of render to prevent Expo Router bugs
    React.useEffect(() => {
        if (order) {
            navigation.setOptions({
                title: t('osDetails'),
                headerLeft: () => (
                    <Pressable
                        style={{ marginLeft: 8, padding: 8, flexDirection: 'row', alignItems: 'center' }}
                        onPress={() => {
                            if (router.canGoBack()) {
                                router.back();
                            } else {
                                router.replace('/(tabs)');
                            }
                        }}
                    >
                        <Ionicons name="chevron-back" size={28} color="#fff" />
                    </Pressable>
                )
            });
        }
    }, [order, navigation, router, t]);

    // Removed inline Tabs.Screen to fix crash, using layout options instead
    if (loading) {
        return (
            <View style={{ flex: 1, backgroundColor: '#f8fafc' }}>
            </View>
        );
    }

    if (error || !order) {
        return (
            <ThemedView style={[styles.container, { justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#f8fafc' }]}>
                <Ionicons name="cloud-offline-outline" size={64} color="#94a3b8" style={{ marginBottom: 16 }} />
                <ThemedText style={{ fontSize: 18, fontWeight: 'bold', textAlign: 'center', color: '#1e293b', marginBottom: 8 }}>
                    {error ? t('osFetchError') || 'Falha na Conexão' : t('osNotFound')}
                </ThemedText>
                <ThemedText style={{ fontSize: 14, textAlign: 'center', color: '#64748b', marginBottom: 24, lineHeight: 20 }}>
                    {error 
                        ? 'Ocorreu um erro ao baixar as informações detalhadas desta OS. Verifique sua conexão com a internet e tente novamente.'
                        : 'A ordem de serviço solicitada não foi encontrada ou foi removida do sistema.'}
                </ThemedText>
                {error && (
                    <Pressable 
                        onPress={() => {
                            setLoading(true);
                            setError(null);
                            // Set artificial delay, trigger focus effect again or just replace route
                            router.replace({ pathname: '/os/[id]', params: { id: id as string } });
                        }}
                        style={{ backgroundColor: '#1c2d4f', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#1c2d4f', shadowOffset: {width: 0, height: 4}, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}
                    >
                        <Ionicons name="refresh" size={20} color="#fff" style={{ marginRight: 8 }} />
                        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Tentar Novamente</Text>
                    </Pressable>
                )}
            </ThemedView>
        );
    }

    const isEditable = ['pending', 'assigned', 'traveling', 'in_progress'].includes(order.status);

    const openGPS = () => {
        const query = encodeURIComponent(order.address);
        const iosUrl = `http://maps.apple.com/?daddr=${query}`;
        const androidUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
        const url = Platform.select({ ios: iosUrl, android: androidUrl });

        if (url) {
            Linking.openURL(url).catch(() => {
                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
            });
        }
    };

    // Check if technician has another OS in progress
    const checkConcurrentOS = async (): Promise<boolean> => {
        if (allowMultipleInProgress) return true; // Setting allows it
        // If this OS is already in_progress, allow continuing it
        if (order.status === 'in_progress' || order.status === 'EM ANDAMENTO') return true;
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id;
            if (!userId) return true;
            const { data: inProgressOrders } = await supabase
                .from('orders')
                .select('id, display_id')
                .eq('assigned_to', userId)
                .in('status', ['EM ANDAMENTO'])
                .neq('id', id as string)
                .limit(1);
            if (inProgressOrders && inProgressOrders.length > 0) {
                const osId = inProgressOrders[0].display_id || inProgressOrders[0].id.substring(0, 8);
                Alert.alert(
                    t('osOsInProgress'),
                    t('osFinishFirst').replace('%s', osId),
                    [{ text: t('osUnderstood') }]
                );
                return false;
            }
        } catch (e) {
            console.error('[OS Detail] Error checking concurrent OS:', e);
        }
        return true;
    };

    const handleExecute = async () => {
        // MODO OFFLINE: ir direto para execução
        if (syncService.isOfflineModeEnabled()) {
            router.push({ pathname: '/os/execute', params: { id: id as string } });
            return;
        }
        // Check concurrent OS restriction
        const canProceed = await checkConcurrentOS();
        if (!canProceed) return;

        // Ao clicar, aciona o respectivo fluxo de forma contextual mostrando o spinner (loading)
        setLoading(true);
        showLoading('Iniciando...');
        try {
            // Capture location if possible
            let lat: number | undefined;
            let lon: number | undefined;
            const needsLocation = requireLocationForExecution && !syncService.isOfflineModeEnabled();
            
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status !== 'granted') {
                    if (needsLocation) {
                        setAlertConfig({
                            visible: true,
                            title: 'Permissão de GPS Necessária',
                            message: 'Você precisa autorizar o uso do GPS (Localização) para iniciar a OS. Verifique as configurações do seu celular.',
                            buttons: [{ text: 'Entendi', style: 'default' }]
                        });
                        setLoading(false);
                        hideLoading();
                        return;
                    }
                } else {
                    const gpsEnabled = await Location.hasServicesEnabledAsync();
                    if (!gpsEnabled) {
                        if (needsLocation) {
                            setAlertConfig({
                                visible: true,
                                title: 'GPS Desativado',
                                message: 'Seu GPS está desligado. Por favor, ative a localização do aparelho para podermos validar sua distância até o cliente.',
                                buttons: [{ text: 'Entendi', style: 'default' }]
                            });
                            setLoading(false);
                            hideLoading();
                            return;
                        }
                    } else {
                        // Force high accuracy to get a real reading now
                        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Highest });
                        lat = loc.coords.latitude;
                        lon = loc.coords.longitude;
                    }
                }
            } catch (err) {
                console.log('[OSDetail] Location fetch error:', err);
            }

            if (order.status === 'assigned') {
                setLoading(false);
                hideLoading();
                setActionLocation({ lat, lon });
                setIsActionModalVisible(true);
                return; // Early return
            }

            // Check location restriction if enabled and online
            if (needsLocation) {
                if (lat === undefined || lon === undefined) {
                    setAlertConfig({
                        visible: true,
                        title: 'Localização Indisponível',
                        message: 'Não foi possível ler sua localização. Verifique se o GPS está ativado e tente novamente.',
                        buttons: [{ text: 'OK', style: 'default' }]
                    });
                    setLoading(false);
                    hideLoading();
                    return;
                }

                // Resolve client coordinates — from order data or geocode by address
                let clientLat: number | null = order.customerLat ?? null;
                let clientLng: number | null = order.customerLng ?? null;

                if (!clientLat || !clientLng) {
                    // Try to geocode the address
                    const address = order.address;
                    if (address && address !== 'Endereço não informado') {
                        try {
                            const geocoded = await Location.geocodeAsync(address);
                            if (geocoded && geocoded.length > 0) {
                                clientLat = geocoded[0].latitude;
                                clientLng = geocoded[0].longitude;
                                console.log(`[OSDetail] 📍 Geocoding OK: ${address} → ${clientLat}, ${clientLng}`);
                            }
                        } catch (geoErr) {
                            console.warn('[OSDetail] Geocoding failed:', geoErr);
                        }
                    }
                }

                if (!clientLat || !clientLng) {
                    // Sem coordenadas nem geocoding: bloqueia por segurança
                    setAlertConfig({
                        visible: true,
                        title: 'Localização do Cliente Indisponível',
                        message: 'Não foi possível obter as coordenadas do cliente para verificar sua proximidade. Verifique se o endereço da OS está correto ou contate o administrador.',
                        buttons: [{ text: 'Entendi', style: 'default' }]
                    });
                    setLoading(false);
                    hideLoading();
                    return;
                }

                const distance = getDistanceFromLatLonInMeters(lat, lon, clientLat, clientLng);
                const distanceStr = distance > 1000 
                    ? `${(distance / 1000).toFixed(1)} km` 
                    : `${distance.toFixed(0)} metros`;
                    
                console.log(`[OSDetail] 📏 Distância ao cliente: ${distanceStr} (limite: 300m)`);
                if (distance > 300) {
                    setAlertConfig({
                        visible: true,
                        title: 'Fora do Raio Permitido',
                        message: `Você está a ${distanceStr} do endereço do cliente. O administrador exige que você esteja num raio máximo de 300 metros para iniciar esta OS.`,
                        buttons: [{ text: 'Entendi', style: 'default' }]
                    });
                    setLoading(false);
                    hideLoading();
                    return;
                }
            }

            // Normal flow for already traveling or in_progress
            if (order.status !== 'in_progress' && order.status !== 'EM ANDAMENTO') {
                await AsyncStorage.removeItem(`os_cache_${id}`);
                await OrderService.startExecution(id as string, lat, lon);
            }
            router.push({ pathname: '/os/execute', params: { id: id as string } });
        } catch (e: any) {
            setAlertConfig({
                visible: true,
                title: t('alertError'),
                message: e.message,
                buttons: [{ text: 'OK', style: 'default' }]
            });
        } finally {
            if (order.status !== 'assigned') {
                setLoading(false);
            }
            hideLoading();
        }
    };

    const handleBlock = () => {
        if (syncService.isOfflineModeEnabled()) {
            Alert.alert(t('osOfflineMode'), t('osBlockOfflineMsg'));
            return;
        }
        setModalVisible(true);
    };

    const handlePickBlockPhoto = () => {
        if (impedimentPhotoUris.length >= 10) {
            Alert.alert(t('homeWarning'), t('osMaxPhotos'));
            return;
        }
        setIsPhotoSourceModalVisible(true);
    };

    const processPhotoChoice = async (source: 'camera' | 'library') => {
        try {
            const options: ImagePicker.ImagePickerOptions = {
                mediaTypes: ['images'],
                quality: 0.8,
                allowsEditing: false,
                allowsMultipleSelection: true,
                selectionLimit: 10 - impedimentPhotoUris.length
            };

            const result = source === 'camera'
                ? await ImagePicker.launchCameraAsync(options)
                : await ImagePicker.launchImageLibraryAsync({ ...options });

            if (!result.canceled && result.assets && result.assets.length > 0) {
                // Compress each image before adding
                const newUris: string[] = [];
                for (const asset of result.assets) {
                    try {
                        const compressedUri = await ImageService.compressImage(asset.uri);
                        newUris.push(compressedUri);
                    } catch (e) {
                        newUris.push(asset.uri); // Fallback se a compressão falhar
                    }
                }
                setImpedimentPhotoUris(prev => [...prev, ...newUris].slice(0, 10));
            }
        } catch {
            Alert.alert(t('alertError'), t('osCouldNotMedia'));
        }
    };

    const confirmBlock = async () => {
        if (!impedimentReason.trim()) {
            Alert.alert(t('alertAttention'), t('execImpedimentRequired'));
            return;
        }

        try {
            setIsUploadingBlock(true);

            // Upload das fotos antes de bloquear
            let blockPhotoUrls: string[] = [];
            if (impedimentPhotoUris.length > 0) {
                for (let i = 0; i < impedimentPhotoUris.length; i++) {
                    const url = await OrderService.uploadFile(
                        impedimentPhotoUris[i],
                        `orders/${order.displayId || order.id}/block_photos`,
                        order.tenantId
                    );
                    if (url) blockPhotoUrls.push(url);
                }
            }

            await OrderService.blockOrder(order.id, impedimentReason.trim(), blockPhotoUrls);
            customAlert(t('osBlockRegistered'), `Motivo: ${impedimentReason}`);
            setModalVisible(false);
            setImpedimentReason('');
            setImpedimentPhotoUris([]);

            // re-fetch
            const u = await OrderService.getOrderById(id as string, true);
            setOrder(u);
        } catch (e) {
            Alert.alert(t('alertError'), t('osCouldNotBlock'));
        } finally {
            setIsUploadingBlock(false);
        }
    };

    return (
        <ThemedView style={styles.container}>
            <SafeRenderErrorBoundary>
            <ScrollView contentContainerStyle={styles.content}>

                {/* Header Status */}
                <View style={styles.header}>
                    <ThemedText style={styles.title}>{order.displayId || order.id}</ThemedText>
                    {(() => {
                        const normalizedStatus = order.status ? order.status.toLowerCase() : 'pending';
                        const statusColor = statusConfig[normalizedStatus]?.color || '#64748b';
                        const statusBg = statusConfig[normalizedStatus]?.color ? statusConfig[normalizedStatus].color + '20' : '#e2e8f0';
                        const statusLabel = statusConfig[normalizedStatus]?.label || order.status;
                        return (
                            <View style={[styles.statusBadge, { backgroundColor: statusBg }]}>
                                <Text style={[styles.statusText, { color: statusColor }]}>
                                    {statusLabel}
                                </Text>
                            </View>
                        );
                    })()}
                </View>

                {/* Modality Info */}
                <View style={{ backgroundColor: '#f8fafc', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ backgroundColor: '#e2e8f0', padding: 8, borderRadius: 8, marginRight: 12 }}>
                        <Ionicons name="pricetag" size={18} color="#1c2d4f" />
                    </View>
                    <View>
                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Modalidade do Atendimento</Text>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#1c2d4f' }}>{order.operationType || order.type || 'Não informada'}</Text>
                    </View>
                </View>

                {/* Root Block Info (if blocked) */}
                {order.status === 'BLOCKED' && (order.formData?.blockReason || (order.formData?.blockPhotoUrls && order.formData.blockPhotoUrls.length > 0)) && (
                    <View style={{ backgroundColor: '#fef2f2', borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#fecaca' }}>
                        {order.formData?.blockReason ? (
                            <>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#b91c1c', textTransform: 'uppercase', marginBottom: 4 }}>{t('osBlockReason')}</Text>
                                <Text style={{ fontSize: 13, color: '#7f1d1d', fontWeight: '500', lineHeight: 20, marginBottom: order.formData?.blockPhotoUrls?.length ? 12 : 0 }}>
                                    {order.formData.blockReason}
                                </Text>
                            </>
                        ) : null}

                        {order.formData?.blockPhotoUrls && order.formData.blockPhotoUrls.length > 0 && (
                            <View>
                                <Text style={{ fontSize: 10, fontWeight: '800', color: '#b91c1c', textTransform: 'uppercase', marginBottom: 6 }}>{t('osBlockPhotos')}</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                    {order.formData.blockPhotoUrls.map((uri: string, pi: number) => (
                                        <Pressable key={pi} onPress={() => openImage(uri, order.formData.blockPhotoUrls)} style={{ marginRight: 8, borderRadius: 8, overflow: 'hidden' }}>
                                            <SecureImage uri={uri} style={{ width: 220, height: 150 }} resizeMode="cover" useThumbnail />
                                        </Pressable>
                                    ))}
                                </ScrollView>
                            </View>
                        )}
                    </View>
                )}

                {/* Customer & Address Info */}
                <View style={styles.card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                            <Ionicons name="person-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
                            <ThemedText type="subtitle" style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.5 }}>{t('osClient')}</ThemedText>
                        </View>
                    </View>
                    <Text style={[styles.infoText, { fontWeight: '700', fontSize: 16, color: '#0f172a', marginBottom: 12, marginTop: 2 }]}>{order.customer}</Text>

                    {(() => {
                        if (!showClientContact) return null;
                        const phone = order.customerPhone || order.contact_phone || order.contactPhone || order.customer_phone || order.phone || order.whatsapp || (order.formData && order.formData.clientPhone) || (order.customerData && order.customerData.whatsapp) || dynamicPhone;
                        if (!phone) return null;
                        
                        const numbersOnly = phone.replace(/\D/g, '');
                        const hasWhatsApp = numbersOnly.length >= 8;

                        return (
                            <>
                                <View style={styles.divider} />
                                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                                    <Ionicons name="call-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
                                    <ThemedText type="subtitle" style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.5 }}>{t('osContact')}</ThemedText>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 2, marginBottom: 12 }}>
                                    <Text style={[styles.addressText, { flex: 1, marginTop: 0, marginBottom: 0, fontWeight: '500', color: '#0f172a', fontSize: 15 }]}>{phone}</Text>
                                    
                                    {hasWhatsApp && (
                                        <Pressable 
                                            onPress={() => Linking.openURL(`https://wa.me/55${numbersOnly.startsWith('55') ? numbersOnly.substring(2) : numbersOnly}`)}
                                            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#e2faea', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#bbf7d0' }}
                                        >
                                            <Ionicons name="logo-whatsapp" size={14} color="#16a34a" style={{ marginRight: 4 }} />
                                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#15803d' }}>WhatsApp</Text>
                                        </Pressable>
                                    )}
                                </View>
                            </>
                        );
                    })()}

                    <View style={styles.divider} />
                    
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Ionicons name="location-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
                        <ThemedText type="subtitle" style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.5 }}>{t('osAddress')}</ThemedText>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginTop: 2, marginBottom: 12 }}>
                        <Text style={[styles.addressText, { flex: 1, marginTop: 0, marginBottom: 0 }]}>{order.address}</Text>
                        <Pressable 
                            style={[styles.gpsButton, { paddingVertical: 8, paddingHorizontal: 12, marginBottom: 0 }]} 
                            onPress={() => {
                                const query = encodeURIComponent(order.address);
                                const iosUrl = `http://maps.apple.com/?daddr=${query}`;
                                const androidUrl = `https://www.google.com/maps/dir/?api=1&destination=${query}`;
                                const url = Platform.select({ ios: iosUrl, android: androidUrl });
                                
                                if (Linking && url) {
                                    Linking.openURL(url).catch(() => {
                                        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${query}`);
                                    });
                                }
                            }}
                        >
                            <Ionicons name="navigate" size={16} color="#2563eb" />
                            <Text style={[styles.gpsButtonText, { color: '#2563eb', fontSize: 12, fontWeight: 'bold' }]}>GPS</Text>
                        </Pressable>
                    </View>
                </View>

                {/* Problem Description */}
                <View style={styles.card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                        <Ionicons name="alert-circle-outline" size={16} color="#64748b" style={{ marginRight: 6 }} />
                        <ThemedText type="subtitle" style={{ fontSize: 13, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.5, fontWeight: '800' }}>{t('osProblemReported')}</ThemedText>
                    </View>
                    
                    {order.title && (
                        <View style={{ marginBottom: 12 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('osTitleSummary')}</Text>
                            <Text style={[styles.infoText, { marginTop: 0, fontWeight: '700', color: '#0f172a' }]}>{order.title}</Text>
                        </View>
                    )}

                    {(order.rawDescription || (!order.title && order.description)) && (
                        <View style={{ marginBottom: order.problemReason ? 12 : 0 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>{t('osDetailedDescription')}</Text>
                            <Text style={[styles.infoText, { marginTop: 0, color: '#334155' }]}>{order.rawDescription || order.description}</Text>
                        </View>
                    )}

                    {order.problemReason && (
                        <View style={{ marginTop: 4, backgroundColor: '#fff7ed', padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#ffedd5', borderLeftWidth: 4, borderLeftColor: '#f97316' }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#ea580c', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{t('osExtraObservation')}</Text>
                            <Text style={[styles.infoText, { marginTop: 0, fontStyle: 'italic', color: '#9a3412', fontSize: 13 }]}>
                                "{order.problemReason}"
                            </Text>
                        </View>
                    )}
                </View>

                {/* Equipment Info */}
                <View style={styles.card}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <Ionicons name="hardware-chip-outline" size={14} color="#64748b" style={{ marginRight: 6 }} />
                        <ThemedText type="subtitle" style={{ fontSize: 12, textTransform: 'uppercase', color: '#64748b', letterSpacing: 0.5 }}>{t('osEquipments')}</ThemedText>
                    </View>
                    {order.equipments && order.equipments.length > 0 ? (
                        order.equipments.map((eq: any, index: number) => (
                            <View key={eq.id || index} style={{ marginTop: index > 0 ? 12 : 6, paddingTop: index > 0 ? 12 : 0, borderTopWidth: index > 0 ? 1 : 0, borderTopColor: '#f1f5f9' }}>
                                <View style={styles.detailRow}>
                                    <Text style={styles.infoTextLabel}>{t('osModel')}</Text>
                                    <Text style={styles.infoTextValue}>{eq.equipment_model || eq.equipment_name || 'N/A'}</Text>
                                </View>
                                <View style={styles.detailRow}>
                                    <Text style={styles.infoTextLabel}>{t('osSerial')}</Text>
                                    <Text style={styles.infoTextValue}>{eq.equipment_serial || 'N/A'}</Text>
                                </View>
                            </View>
                        ))
                    ) : (
                        <View style={{ marginTop: 6 }}>
                            <View style={styles.detailRow}>
                                <Text style={styles.infoTextLabel}>{t('osModel')}</Text>
                                <Text style={styles.infoTextValue}>{order.equipment || 'N/A'}</Text>
                            </View>
                            <View style={styles.detailRow}>
                                <Text style={styles.infoTextLabel}>{t('osSerial')}</Text>
                                <Text style={styles.infoTextValue}>{order.serialNumber || 'N/A'}</Text>
                            </View>
                        </View>
                    )}
                </View>




                {/* ====================== HISTÓRICO DE VISITAS (MOVIMENTADO PARA CIMA) ====================== */}
                {orderVisits.filter(v => ['completed', 'blocked'].includes(v.status)).length > 0 && (
                    <View style={{ marginBottom: 16, marginTop: 12 }}>
                        <Text style={{ fontSize: 18, fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: -0.5, marginBottom: 16, marginLeft: 4 }}>
                            {t('osVisitHistory')}
                        </Text>
                        {orderVisits
                            .filter(v => ['completed', 'blocked'].includes(v.status))
                            .filter((_, idx, arr) => showVisitHistory || idx === arr.length - 1)
                            .map((visit, idx, filteredArr) => {
                                const isLast = idx === filteredArr.length - 1;
                                const rawFd = visit.form_data || {};
                                const ignoredFdKeys = new Set(['blockReason', 'blockPhotoUrls', 'blockedAt', 'completedAt', 'signature', 'clientName', 'clientDoc', 'extra_photos', 'technical_report', 'parts_used', 'impediment_signature', 'impediment_responsible', 'impediment_reason', 'blockPhotoUrl', 'video_url', 'impediment_history', 'items', 'videoUrl', 'execution_forms', 'signatureName']);
                                
                                // Determina se é legacy baseado em ter keys válidas de formulário salvo
                                const hasFormKeys = Object.keys(rawFd).some(k => !ignoredFdKeys.has(k) && !k.startsWith('_'));
                                const isLegacy = Object.keys(rawFd).length === 0 || !hasFormKeys;
                                const fd: any = isLegacy && isLast ? (order.formData || {}) : rawFd;
                                
                                // Signatures and Responsible info should be specific to the visit's form data.
                                // The fallback to order.formData should only happen for the 'Legacy' last visit (handled by 'fd' initialization).
                                const signatureUri = fd.impediment_signature || fd.impedimentSignature || fd.signature;
                                const responsibleName = fd.impediment_responsible || fd.impedimentResponsible || fd.clientName || fd.client_name;

                                const visitKey = visit.id || `visit_${idx}`;
                                const isExpanded = expandedVisits[visitKey] === true;
                                const isBlocked = visit.status === 'blocked';

                                const deptTime = visit.departure_time
                                    || (isLegacy && isLast && !isBlocked ? order.completedDate : null)
                                    || (isLegacy && isLast && isBlocked ? order.startedDate : null);
                                const visitDate = deptTime
                                    ? new Date(deptTime).toLocaleDateString('pt-BR') + ' às ' + new Date(deptTime).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
                                    : visit.arrival_time
                                    ? new Date(visit.arrival_time).toLocaleDateString('pt-BR')
                                    : `${t('homeVisit')} ${idx + 1}`;

                                const formEntries = Object.entries(fd).filter(([k, v]) =>
                                    !ignoredFdKeys.has(k) && v !== null && v !== '' && !k.startsWith('_')
                                );

                                const blockPhotos: string[] = (() => {
                                    const src = fd.blockPhotoUrls;
                                    if (Array.isArray(src)) return src.filter(Boolean);
                                    if (typeof src === 'string') { try { return JSON.parse(src); } catch { return [src]; } }
                                    return [];
                                })();
                                const extraPhotos: string[] = (() => {
                                    let src = fd.extra_photos || fd.photos;
                                    
                                    // Fallback agressivo: se for a última visita e não achou fotos localmente, busca nas fotos globais da OS
                                    if (!src && isLast) {
                                        src = order.formData?.extra_photos || order.formData?.photos || order.executionDetails?.photos;
                                    }
                                    
                                    let arr: string[] = [];
                                    if (Array.isArray(src)) {
                                        arr = src;
                                    } else if (typeof src === 'string') {
                                        if (src.startsWith('[')) {
                                            try { arr = JSON.parse(src); } catch { arr = [src]; }
                                        } else {
                                            arr = [src];
                                        }
                                    }
                                    return arr.filter((p: any) => typeof p === 'string' && p.startsWith('http'));
                                })();
                                const videoUrl: string | null =
                                    fd.video_url ||           // Current: saved in visit form_data
                                    visit.video_url ||        // Possible: top-level column on visit row
                                    (isLast ? (order.formData?.video_url || order.videoUrl || null) : null); // Legacy/fallback
                                const technicalReport: string = fd.technical_report || (isLegacy && isLast ? (order.executionDetails?.technicalReport || '') : '');

                                return (
                                    <View key={visitKey} style={[styles.card, {
                                        marginBottom: 12,
                                        borderLeftWidth: 4,
                                        borderLeftColor: isBlocked ? '#ef4444' : '#22c55e',
                                        borderColor: isBlocked ? '#fecaca' : '#bbf7d0',
                                        backgroundColor: isBlocked ? '#fff5f5' : '#f0fdf4',
                                    }]}>
                                        {/* Header colapsável */}
                                        <Pressable
                                            onPress={() => setExpandedVisits(prev => ({ ...prev, [visitKey]: !isExpanded }))}
                                            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
                                        >
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                                <Ionicons name={isBlocked ? 'ban-outline' : 'checkmark-circle-outline'} size={20} color={isBlocked ? '#ef4444' : '#22c55e'} />
                                                <View style={{ flex: 1 }}>
                                                    <Text style={{ fontSize: 13, fontWeight: '900', color: isBlocked ? '#991b1b' : '#14532d', textTransform: 'uppercase' }}>
                                                        {isBlocked ? t('osVisitBlocked') : t('osVisitCompleted')}
                                                    </Text>
                                                    <Text style={{ fontSize: 11, color: isBlocked ? '#b91c1c' : '#15803d', fontWeight: '600', marginTop: 2 }}>
                                                        {visitDate}
                                                    </Text>
                                                </View>
                                            </View>
                                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
                                        </Pressable>

                                        {isExpanded && (
                                            <View style={{ marginTop: 12, borderTopWidth: 1, borderTopColor: isBlocked ? '#fecaca' : '#bbf7d0', paddingTop: 12 }}>


                                                {/* Checklist e Peças */}
                                                {(() => {
                                                    const equipments = order.equipments || [];
                                                    let usedItemsVisit = [];
                                                    if (Array.isArray(fd.items) && fd.items.length > 0) usedItemsVisit = fd.items;
                                                    else if (Array.isArray(order.items) && order.items.length > 0) usedItemsVisit = order.items;
                                                    
                                                    const executionForms = fd.execution_forms || {};
                                                    // Mapa separado por tipo: chave = "equipName::tech" ou "equipName::fin"
                                                    const eqTemplateTitles: Record<string, string> = {};
                                                    
                                                    const setTitleKeys = (eqName: string, eqModel: string, title: string, suffix: string) => {
                                                        const fullN = [eqName, eqModel].filter(Boolean).join(' ');
                                                        if (fullN) eqTemplateTitles[`${fullN.toLowerCase()}::${suffix}`] = title;
                                                        if (eqName) eqTemplateTitles[`${eqName.toLowerCase()}::${suffix}`] = title;
                                                        if (eqModel) eqTemplateTitles[`${eqModel.toLowerCase()}::${suffix}`] = title;
                                                    };
                                                    
                                                    // 1. From execution_forms (offline legacy & new)
                                                    Object.values(executionForms).forEach((config: any) => {
                                                        const en = config.equipamento?.equipment_name || '';
                                                        const em = config.equipamento?.equipment_model || '';
                                                        if (config.template?.title) {
                                                            setTitleKeys(en, em, config.template.title, 'tech');
                                                        }
                                                        if (config.financialTemplate?.title) {
                                                            setTitleKeys(en, em, config.financialTemplate.title, 'fin');
                                                        }
                                                    });

                                                    // 2. From equipments array + fetched templates + activation_rules (online legacy)
                                                    const orderTypeStr = (order.operationType || order.type || '').toLowerCase().trim();
                                                    const matchedType = serviceTypes.find(st =>
                                                        st.id?.toLowerCase().trim() === orderTypeStr ||
                                                        st.name?.toLowerCase().trim() === orderTypeStr
                                                    );
                                                    const orderTypeId = matchedType ? matchedType.id.toLowerCase().trim() : orderTypeStr;
                                                    equipments.forEach((eq: any) => {
                                                        const techTitle = templateTitles[eq.form_id || eq.formId] || templateTitles[order.formId || order.form_id];
                                                        if (techTitle) {
                                                            setTitleKeys(eq.equipment_name || '', eq.equipment_model || '', techTitle, 'tech');
                                                        }
                                                        // Financeiro: buscar via financial_form_id do equipamento
                                                        let finId = eq.financial_form_id || eq.financialFormId;
                                                        // Se não tem finId direto, buscar via activation_rules
                                                        if (!finId && activationRules.length > 0) {
                                                            const eqFamily = (eq.equipment_family || eq.equipmentFamily || '').toLowerCase().trim();
                                                            const bestRule = activationRules.find((r: any) =>
                                                                String(r.serviceTypeId || '').toLowerCase().trim() === orderTypeId &&
                                                                String(r.equipmentFamily || '').toLowerCase().trim() === eqFamily
                                                            ) || activationRules.find((r: any) =>
                                                                String(r.serviceTypeId || '').toLowerCase().trim() === orderTypeId &&
                                                                (String(r.equipmentFamily || '').toLowerCase().trim() === 'todos' || !r.equipmentFamily)
                                                            );
                                                            if (bestRule?.financialFormId) finId = bestRule.financialFormId;
                                                            // Também garantir o técnico via regra se não tinha
                                                            if (!techTitle && bestRule?.formId && templateTitles[bestRule.formId]) {
                                                                setTitleKeys(eq.equipment_name || '', eq.equipment_model || '', templateTitles[bestRule.formId], 'tech');
                                                            }
                                                        }
                                                        if (finId && templateTitles[finId]) {
                                                            setTitleKeys(eq.equipment_name || '', eq.equipment_model || '', templateTitles[finId], 'fin');
                                                        }
                                                    });
                                                    
                                                    if (formEntries.length === 0 && usedItemsVisit.length === 0) return null;

                                                    return (
                                                        <View style={{ marginBottom: 16 }}>
                                                            {formEntries.length > 0 ? (
                                                                <Text style={{ fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>{t('osChecklist')} e Peças</Text>
                                                            ) : (
                                                                <Text style={{ fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>Peças Utilizadas</Text>
                                                            )}
                                                            {(() => {
                                                                // 1. Mapeia grupos do checklist
                                                            const fallbackGroupName = 'Geral / Outros';
                                                            const groupedChecklist = formEntries.reduce((acc, entry) => {
                                                                const match = entry[0].match(/^\[(.*?)\]\s*(?:-|$)/);
                                                                const groupName = match ? match[1] : fallbackGroupName;
                                                                
                                                                if (groupName === fallbackGroupName) {
                                                                    const cleanLabel = entry[0].toLowerCase();
                                                                    if (cleanLabel.includes('technical') || cleanLabel.includes('foto') || cleanLabel.includes('photo') || cleanLabel.includes('anexo')) {
                                                                        return acc;
                                                                    }
                                                                }
                                                                
                                                                if (!acc[groupName]) acc[groupName] = [];
                                                                acc[groupName].push(entry);
                                                                return acc;
                                                            }, {} as Record<string, [string, any][]>);

                                                            // 2. Mapeia peças por equipamento
                                                            const groupedParts = usedItemsVisit.reduce((acc: any, item: any) => {
                                                                let groupName = item.equipment_name || item.equipmentName;
                                                                
                                                                const eqId = item.equipment_id || item.equipmentId;
                                                                if (!groupName && eqId && equipments.length > 0) {
                                                                    const eq = equipments.find((e: any) => e.id === eqId);
                                                                    if (eq) groupName = eq.equipment_model || eq.equipment_name;
                                                                }
                                                                groupName = groupName || fallbackGroupName;
                                                                
                                                                const formGroups = Object.keys(groupedChecklist);
                                                                const matchedFormGroup = formGroups.find(g => 
                                                                    g.toLowerCase().includes(groupName.toLowerCase()) || 
                                                                    groupName.toLowerCase().includes(g.toLowerCase())
                                                                );
                                                                
                                                                if (matchedFormGroup) groupName = matchedFormGroup;
                                                                else if (groupName === fallbackGroupName) {
                                                                    const realGroups = formGroups.filter(g => g !== fallbackGroupName);
                                                                    if (realGroups.length === 1) groupName = realGroups[0];
                                                                }

                                                                if (!acc[groupName]) acc[groupName] = [];
                                                                acc[groupName].push(item);
                                                                return acc;
                                                            }, {} as Record<string, any[]>);

                                                            const allGroupNames = Array.from(new Set([...Object.keys(groupedChecklist), ...Object.keys(groupedParts)])).filter(g => g !== fallbackGroupName);
                                                            if (groupedChecklist[fallbackGroupName] || groupedParts[fallbackGroupName]) allGroupNames.push(fallbackGroupName);

                                                            // ── Set of all known financial titles
                                                            const finTitles = new Set(
                                                                Object.keys(eqTemplateTitles)
                                                                    .filter(k => k.endsWith('::fin'))
                                                                    .map(k => eqTemplateTitles[k].toLowerCase())
                                                            );

                                                            // Ordenar para Financeiro sempre primeiro
                                                            allGroupNames.sort((a, b) => {
                                                                const aFin = a.toLowerCase().includes('financeiro');
                                                                const bFin = b.toLowerCase().includes('financeiro');
                                                                if (aFin && !bFin) return -1;
                                                                if (!aFin && bFin) return 1;
                                                                return a.localeCompare(b);
                                                            });

                                                            return allGroupNames.map((group, gIdx) => {
                                                                const items = groupedChecklist[group] || [];
                                                                const parts = groupedParts[group] || [];
                                                                const isEquipment = group !== fallbackGroupName;
                                                                
                                                                if (items.length === 0 && parts.length === 0) return null;

                                                                const eqData = equipments.find((e: any) => {
                                                                    const eN = (e.equipment_model || e.equipment_name || '').toLowerCase();
                                                                    return group.toLowerCase().includes(eN) || eN.includes(group.toLowerCase());
                                                                });

                                                                let displayTitle = group;
                                                                
                                                                const groupSuffixMatch = group.match(/\s*-\s*([^-]+)$/);
                                                                const suffixText = groupSuffixMatch ? groupSuffixMatch[1].trim() : null;
                                                                
                                                                const isFinanceiroType = group.toLowerCase().includes('financeiro') || 
                                                                    (suffixText && finTitles.has(suffixText.toLowerCase()));
                                                                
                                                                if (isFinanceiroType) {
                                                                    const titleBase = suffixText && suffixText.toLowerCase() !== 'financeiro' ? suffixText : 'Formulário Financeiro';
                                                                    displayTitle = titleBase !== 'Formulário Financeiro' ? `${titleBase} - Financeiro` : 'Formulário Financeiro';
                                                                } else if (isEquipment && eqData) {
                                                                    const eqNamePart = eqData.equipment_name || '';
                                                                    const eqModelPart = eqData.equipment_model || '';
                                                                    const fullEqName = [eqNamePart, eqModelPart].filter(Boolean).join(' ');
                                                                    
                                                                    let matchedFormName: string | undefined =
                                                                        eqTemplateTitles[`${fullEqName.toLowerCase()}::tech`] ||
                                                                        eqTemplateTitles[`${eqNamePart.toLowerCase()}::tech`] ||
                                                                        eqTemplateTitles[`${eqModelPart.toLowerCase()}::tech`];

                                                                    if (!matchedFormName) {
                                                                        if (suffixText && suffixText !== 'Técnico' && suffixText !== 'Financeiro' && !finTitles.has(suffixText.toLowerCase())) {
                                                                            matchedFormName = suffixText;
                                                                        }
                                                                    }
                                                                    
                                                                    const formNameStr = matchedFormName ? `${matchedFormName} - ` : '';
                                                                    const serialStr = eqData.equipment_serial ? ` (S/N: ${eqData.equipment_serial})` : '';
                                                                    
                                                                    displayTitle = `${formNameStr}${fullEqName}${serialStr}`;
                                                                }

                                                                const isGroupExpanded = expandedGroups[group] === true;

                                                                return (
                                                                    <View key={group} style={{ backgroundColor: '#ffffff', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', elevation: 1, shadowColor: '#000', shadowOffset: {width:0, height:1}, shadowOpacity: 0.05, shadowRadius: 3 }}>
                                                                        <Pressable 
                                                                            onPress={() => toggleGroup(group)}
                                                                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: isGroupExpanded ? '#f8fafc' : '#ffffff' }}
                                                                        >
                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                                                                                <Ionicons name={isEquipment ? "cube-outline" : "checkmark-done"} size={16} color={isEquipment ? "#3b82f6" : "#10b981"} style={{ marginRight: 6 }} />
                                                                                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }} numberOfLines={2}>
                                                                                    {displayTitle}
                                                                                </Text>
                                                                            </View>
                                                                            <Ionicons name={isGroupExpanded ? "chevron-up" : "chevron-down"} size={18} color="#94a3b8" />
                                                                        </Pressable>

                                                                        {isGroupExpanded && (
                                                                            <View style={{ padding: 12, paddingTop: 4, backgroundColor: '#ffffff' }}>
                                                                                {items.length > 0 && (
                                                                                    <View style={{ marginBottom: 8 }}>
                                                                                {items.sort((a, b) => a[0].localeCompare(b[0])).map(([fullKey, val], fieldIdx) => {
                                                                                            let cleanKey = fullKey.replace(/^\[.*?\]\s*-\s*/, '').replace(/^\d{3}#/, '').replace(/_/g, ' ');
                                                                                            if (cleanKey.toLowerCase() === 'photos' || cleanKey.toLowerCase() === 'fotos') cleanKey = t('osAttachments');

                                                                                            const explicitMatch = fullKey.match(/(?:-\s*|^)(\d{3})#/);
                                                                                            const displayIndex = explicitMatch ? explicitMatch[1] : String(fieldIdx + 1).padStart(3, '0');
                                                                                            const displayLabel = `#${displayIndex} — ${cleanKey}`;

                                                                                            const isMediaVideo = (v: any) => {
                                                                                                if (typeof v !== 'string') return false;
                                                                                                const lower = v.toLowerCase();
                                                                                                const videoExts = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.webm', '.mkv', '.3gp'];
                                                                                                return videoExts.some(ext => lower.includes(ext)) || lower.startsWith('data:video/') || lower.includes('/form_videos/') || lower.includes('/videos/');
                                                                                            };
                                                                                            const isImageUrl = (v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:image') || v.startsWith('file:') || v.startsWith('content:')) && !isMediaVideo(v);
                                                                                            const isSingleVideo = !Array.isArray(val) && isMediaVideo(val);
                                                                                            const isVideoArray = Array.isArray(val) && val.length > 0 && val.every((v: any) => isMediaVideo(v));
                                                                                            const isImageArray = Array.isArray(val) && val.length > 0 && val.every((v: any) => isImageUrl(v));
                                                                                            const isMultiSelect = Array.isArray(val) && !isImageArray && !isVideoArray;
                                                                                            const isSingleImage = !Array.isArray(val) && isImageUrl(val);

                                                                                            const isPositive = val === 'OK' || val === 'Sim' || val === 'Conforme' || val === 'Aprovado';
                                                                                            const isNegative = val === 'Não' || val === 'Reprovado' || val === 'Não Conforme';

                                                                                            return (
                                                                                                <View key={fullKey} style={{
                                                                                                    marginBottom: 12,
                                                                                                    backgroundColor: '#ffffff',
                                                                                                    padding: 14,
                                                                                                    borderRadius: 12,
                                                                                                    borderWidth: 1,
                                                                                                    borderColor: '#cbd5e1',
                                                                                                }}>
                                                                                                    {/* Label numbered */}
                                                                                                    <Text style={{ fontSize: 11, fontWeight: '800', color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 }}>
                                                                                                        {displayLabel}
                                                                                                    </Text>

                                                                                                    {/* VALUE RENDERERS */}
                                                                                                    {isSingleVideo || isVideoArray ? (
                                                                                                        <View style={{ gap: 8 }}>
                                                                                                            {(Array.isArray(val) ? val : [val]).map((vUri: string, vIdx: number) => (
                                                                                                                <Pressable
                                                                                                                    key={vIdx}
                                                                                                                    style={{
                                                                                                                        backgroundColor: '#0f172a',
                                                                                                                        borderRadius: 12,
                                                                                                                        padding: 14,
                                                                                                                        flexDirection: 'row',
                                                                                                                        alignItems: 'center',
                                                                                                                        justifyContent: 'space-between',
                                                                                                                        borderWidth: 1,
                                                                                                                        borderColor: '#1e293b',
                                                                                                                        shadowColor: '#000',
                                                                                                                        shadowOffset: { width: 0, height: 1 },
                                                                                                                        shadowOpacity: 0.1,
                                                                                                                        shadowRadius: 2,
                                                                                                                        elevation: 2
                                                                                                                    }}
                                                                                                                    onPress={() => {
                                                                                                                        const playUri = vUri.startsWith('http') ? vUri : (vUri.startsWith('/') ? `file://${vUri}` : vUri);
                                                                                                                        Linking.openURL(playUri).catch(() => Alert.alert(t('alertError'), t('execCouldNotPlayVideo')));
                                                                                                                    }}
                                                                                                                >
                                                                                                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                                                                                                                        <View style={{ backgroundColor: 'rgba(16,185,129,0.2)', padding: 10, borderRadius: 50 }}>
                                                                                                                            <Ionicons name="play-circle" size={26} color="#10b981" />
                                                                                                                        </View>
                                                                                                                        <View style={{ flex: 1 }}>
                                                                                                                            <Text style={{ color: '#ffffff', fontSize: 14, fontWeight: '700' }}>Vídeo Gravado</Text>
                                                                                                                            <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>Tocar para reproduzir no player do celular</Text>
                                                                                                                        </View>
                                                                                                                    </View>
                                                                                                                    <Ionicons name="open-outline" size={20} color="#94a3b8" />
                                                                                                                </Pressable>
                                                                                                            ))}
                                                                                                        </View>
                                                                                                    ) : isImageArray ? (
                                                                                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                                                                            {(val as string[]).map((uri: string, idx: number) => (
                                                                                                                <Pressable key={idx} onPress={() => openImage(uri, val as string[])}
                                                                                                                    style={{ width: 90, height: 90, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f1f5f9' }}>
                                                                                                                    <SecureImage uri={uri} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                                                                                </Pressable>
                                                                                                            ))}
                                                                                                        </View>
                                                                                                    ) : isSingleImage ? (
                                                                                                        <Pressable onPress={() => openImage(val as string)}
                                                                                                            style={{ borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0' }}>
                                                                                                            <SecureImage uri={val as string} style={{ width: '100%', height: 180 }} resizeMode="cover" />
                                                                                                        </Pressable>
                                                                                                    ) : isMultiSelect ? (
                                                                                                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                                                                            {(val as string[]).map((opt: string, oi: number) => (
                                                                                                                <View key={oi} style={{
                                                                                                                    flexDirection: 'row', alignItems: 'center', gap: 6,
                                                                                                                    paddingVertical: 8, paddingHorizontal: 12,
                                                                                                                    backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 8
                                                                                                                }}>
                                                                                                                    <Ionicons name="checkmark" size={14} color="#16a34a" />
                                                                                                                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803d' }}>{opt}</Text>
                                                                                                                </View>
                                                                                                            ))}
                                                                                                        </View>
                                                                                                    ) : (
                                                                                                        <View style={{
                                                                                                            backgroundColor: isPositive ? '#f0fdf4' : isNegative ? '#fef2f2' : '#f8fafc',
                                                                                                            borderRadius: 8, padding: 12,
                                                                                                            borderWidth: 1,
                                                                                                            borderColor: isPositive ? '#86efac' : isNegative ? '#fca5a5' : '#e2e8f0'
                                                                                                        }}>
                                                                                                            <Text style={{
                                                                                                                fontSize: 14,
                                                                                                                fontWeight: '700',
                                                                                                                color: isPositive ? '#15803d' : isNegative ? '#b91c1c' : '#0f172a',
                                                                                                                lineHeight: 20
                                                                                                            }}>{String(val)}</Text>
                                                                                                        </View>
                                                                                                    )}
                                                                                                </View>
                                                                                            );
                                                                                        })}
                                                                                    </View>
                                                                                )}

                                                                                {parts.length > 0 && (
                                                                                    <View style={{ marginTop: items.length > 0 ? 8 : 0 }}>
                                                                                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>{t('osPartsUsed')}</Text>
                                                                                        {parts.map((p: any, pIdx: number) => {
                                                                                            let eqNameDisp = p.equipmentName || p.equipment_name || p.equipment_model;
                                                                                            const eqSerial = p.equipmentSerial || p.equipment_serial;
                                                                                            if (eqNameDisp && eqSerial) {
                                                                                                eqNameDisp = `${eqNameDisp} (S/N: ${eqSerial})`;
                                                                                            }
                                                                                            return (
                                                                                            <View key={`part-${pIdx}`} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#e2e8f0' }}>
                                                                                                <Ionicons name="cube-outline" size={16} color="#64748b" style={{ marginRight: 8 }} />
                                                                                                <View style={{ flex: 1 }}>
                                                                                                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>{p.description || p.item_name}</Text>
                                                                                                    {eqNameDisp && (
                                                                                                        <Text style={{ fontSize: 10, color: '#64748b', marginTop: 2, fontWeight: '600' }}>Equip: {eqNameDisp}</Text>
                                                                                                    )}
                                                                                                </View>
                                                                                                <View style={{ backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                                                                                    <Text style={{ fontSize: 12, color: '#1e40af', fontWeight: '800' }}>{p.quantity} un</Text>
                                                                                                </View>
                                                                                            </View>
                                                                                        )})}
                                                                                    </View>
                                                                                )}
                                                                            </View>
                                                                        )}
                                                                    </View>
                                                                );
                                                            });
                                                            })()}
                                                        </View>
                                                    );
                                                })()}

                                                {/* Motivo do impedimento (Reposicionado) */}
                                                {isBlocked && (fd.blockReason || visit.impediment_reason || fd.impediment_reason) && (
                                                    <View style={{ backgroundColor: '#fef2f2', borderRadius: 8, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: '#fecaca' }}>
                                                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#b91c1c', textTransform: 'uppercase', marginBottom: 4 }}>{t('osBlockReason')}</Text>
                                                        <Text style={{ fontSize: 13, color: '#7f1d1d', fontWeight: '500', lineHeight: 20 }}>
                                                            {fd.blockReason || visit.impediment_reason || fd.impediment_reason}
                                                        </Text>
                                                    </View>
                                                )}

                                                {/* Fotos impedimento */}
                                                {blockPhotos.length > 0 && (
                                                    <View style={{ marginBottom: 10 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#b91c1c', textTransform: 'uppercase', marginBottom: 6 }}>{t('osBlockPhotos')}</Text>
                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                            {blockPhotos.map((uri, pi) => (
                                                                <Pressable key={pi} onPress={() => openImage(uri, blockPhotos)} style={{ marginRight: 8, borderRadius: 8, overflow: 'hidden' }}>
                                                                    <SecureImage uri={uri} style={{ width: 220, height: 150 }} resizeMode="cover" useThumbnail />
                                                                </Pressable>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                )}

                                                {/* Fotos adicionais */}
                                                {extraPhotos.length > 0 && (
                                                    <View style={{ marginBottom: 10 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>{t('osExtraPhotos')}</Text>
                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                                            {extraPhotos.map((uri, pi) => (
                                                                <Pressable key={pi} onPress={() => openImage(uri, extraPhotos)} style={{ marginRight: 8, borderRadius: 8, overflow: 'hidden' }}>
                                                                    <SecureImage uri={uri} style={{ width: 220, height: 150 }} resizeMode="cover" useThumbnail />
                                                                </Pressable>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                )}

                                                {/* Vídeo */}
                                                {Boolean(videoUrl) && (
                                                    <View style={{ marginBottom: 10 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>{t('osRecording')}</Text>
                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 10 }}>
                                                            {(typeof videoUrl === 'string' ? videoUrl.split(',') : []).map(u => u.trim()).filter(Boolean).map((vUrl, vIdx) => (
                                                                <Pressable
                                                                    key={vIdx}
                                                                    onPress={() => Linking.openURL(vUrl)}
                                                                    style={{ width: 140, height: 100, borderRadius: 12, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 12, borderWidth: 1, borderColor: '#334155' }}
                                                                >
                                                                    <Ionicons name="film-outline" size={48} color="#1e293b" style={{ position: 'absolute' }} />
                                                                    <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(220,38,38,0.9)', alignItems: 'center', justifyContent: 'center', paddingLeft: 4, zIndex: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 }}>
                                                                        <Ionicons name="play" size={24} color="#ffffff" />
                                                                    </View>
                                                                    <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', paddingVertical: 6, zIndex: 2 }}>
                                                                        <Text style={{ color: '#ffffff', fontSize: 11, textAlign: 'center', fontWeight: 'bold' }}>Vídeo {vIdx + 1}</Text>
                                                                    </View>
                                                                </Pressable>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                )}

                                                {/* Relatório técnico (Movimentado para baixo) */}
                                                {Boolean(technicalReport) && (
                                                    <View style={{ backgroundColor: '#eef2ff', borderRadius: 8, padding: 14, marginBottom: 16, borderWidth: 1, borderColor: '#c7d2fe' }}>
                                                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#4338ca', textTransform: 'uppercase', marginBottom: 6 }}>{t('osTechnicalReport')}</Text>
                                                        <Text style={{ fontSize: 14, color: '#1e293b', fontWeight: '600', lineHeight: 22 }}>{technicalReport}</Text>
                                                    </View>
                                                )}

                                                {/* Assinatura */}
                                                {(Boolean(signatureUri) || Boolean(responsibleName)) && (
                                                    <View style={{ marginBottom: 6 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>
                                                            {isBlocked ? t('osSignatureAuth') : t('osSignatureClient')}
                                                        </Text>
                                                        {Boolean(signatureUri) && (
                                                            <View style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', padding: 4 }}>
                                                                <Pressable onPress={() => openImage(signatureUri!)}>
                                                                    <SecureImage uri={signatureUri!} style={{ width: '100%', height: 100 }} resizeMode="contain" useThumbnail />
                                                                    <Text style={{ fontSize: 9, color: '#94a3b8', textAlign: 'center', paddingBottom: 4 }}>{t('osTapToEnlarge')}</Text>
                                                                </Pressable>
                                                            </View>
                                                        )}
                                                        {Boolean(responsibleName) && (
                                                            <Text style={{ fontSize: 12, color: '#374151', fontWeight: '700', marginTop: Boolean(signatureUri) ? 6 : 0 }}>
                                                                {t('osResponsible')} {responsibleName}
                                                            </Text>
                                                        )}
                                                    </View>
                                                )}

                                                {/* Rodapé com data */}
                                                <View style={{ marginTop: 10, padding: 8, backgroundColor: isBlocked ? '#fef2f2' : '#f0fdf4', borderRadius: 8, borderStyle: 'dashed', borderWidth: 1, borderColor: isBlocked ? '#fca5a5' : '#86efac' }}>
                                                    <Text style={{ fontSize: 10, color: isBlocked ? '#b91c1c' : '#15803d', fontWeight: 'bold', textAlign: 'center', textTransform: 'uppercase' }}>
                                                        {isBlocked ? t('osBlockedAt') : t('osCompletedAt')} {visitDate}
                                                    </Text>
                                                </View>
                                            </View>
                                        )}
                                    </View>
                                );
                            })
                        }
                    </View>
                )}

                {/* Execution Details Display — ONLY shown when there are NO visit records at all (legacy fallback) */}
                {orderVisits.filter(v => ['completed', 'blocked'].includes(v.status)).length === 0 && (
                    <View style={{ marginBottom: 16, marginTop: 16 }}>
                        {(() => {
                            const report = order.executionDetails?.technicalReport || order.formData?.technical_report;
                            if (!report) return null;
                            return (
                                <View style={[styles.card, { borderColor: '#c7d2fe', backgroundColor: '#eef2ff', marginBottom: 16 }]}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                                        <Ionicons name="document-text" size={20} color="#4338ca" />
                                        <Text style={{ fontSize: 14, fontWeight: '900', color: '#312e81', textTransform: 'uppercase', letterSpacing: 0.8 }}>{t('osTechnicalReport')}</Text>
                                    </View>
                                    <View style={{ backgroundColor: '#ffffff', padding: 16, borderRadius: 10, borderWidth: 1, borderColor: '#e0e7ff' }}>
                                        <Text style={{ fontSize: 14, color: '#1e293b', fontWeight: '600', lineHeight: 22 }}>{report}</Text>
                                    </View>
                                </View>
                            );
                        })()}

                        {(() => {
                            const allPhotos: string[] = [];
                            if (order.executionDetails?.photos) allPhotos.push(...order.executionDetails.photos);
                            if (order.formData?.extra_photos) {
                                const extras = Array.isArray(order.formData.extra_photos) ? order.formData.extra_photos : [order.formData.extra_photos];
                                allPhotos.push(...extras);
                            }
                            const uniquePhotos = [...new Set(allPhotos)].filter(p => typeof p === 'string' && p.startsWith('http'));

                            if (uniquePhotos.length === 0 && !order.videoUrl) return null;

                            return (
                                <View style={[styles.card, { marginBottom: 16 }]}>
                                    {uniquePhotos.length > 0 && (
                                        <View style={{ marginBottom: order.videoUrl ? 20 : 0 }}>
                                            <View style={styles.sectionHeader}>
                                                <Ionicons name="images" size={18} color="#0f172a" />
                                                <Text style={styles.executionSectionLabel}>{t('osExtraPhotos')}</Text>
                                            </View>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photosContainer}>
                                                {uniquePhotos.map((uri, index) => (
                                                    <Pressable key={index} onPress={() => openImage(uri, uniquePhotos)}>
                                                        <SecureImage uri={uri} style={styles.photoThumbnail} resizeMode="cover" useThumbnail />
                                                    </Pressable>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    )}

                                    {order.videoUrl && (
                                        <View>
                                            <View style={styles.sectionHeader}>
                                                <Ionicons name="videocam" size={18} color="#0f172a" />
                                                <Text style={styles.executionSectionLabel}>{t('osRecording')}</Text>
                                            </View>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 10, marginTop: 8 }}>
                                                {(typeof order.videoUrl === 'string' ? order.videoUrl.split(',') : []).map(u => u.trim()).filter(Boolean).map((vUrl, vIdx) => (
                                                    <Pressable
                                                        key={vIdx}
                                                        onPress={() => Linking.openURL(vUrl)}
                                                        style={{ width: 140, height: 100, borderRadius: 12, backgroundColor: '#0f172a', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', marginRight: 12, borderWidth: 1, borderColor: '#334155' }}
                                                    >
                                                        <Ionicons name="film-outline" size={48} color="#1e293b" style={{ position: 'absolute' }} />
                                                        <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(220,38,38,0.9)', alignItems: 'center', justifyContent: 'center', paddingLeft: 4, zIndex: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 4 }}>
                                                            <Ionicons name="play" size={24} color="#ffffff" />
                                                        </View>
                                                        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', paddingVertical: 6, zIndex: 2 }}>
                                                            <Text style={{ color: '#ffffff', fontSize: 11, textAlign: 'center', fontWeight: 'bold' }}>Vídeo {vIdx + 1}</Text>
                                                        </View>
                                                    </Pressable>
                                                ))}
                                            </ScrollView>
                                        </View>
                                    )}
                                </View>
                            );
                        })()}
                    </View>
                )}

            </ScrollView>
            </SafeRenderErrorBoundary>

            {/* Footer Actions - Only show if pending or in_progress */}
            {isEditable && (
                <View style={[styles.footer, { paddingBottom: 8, paddingTop: 8, paddingHorizontal: 12 }]}>
                    {allowImpediment && (
                    <Pressable style={[styles.actionButton, styles.blockButton]} onPress={handleBlock}>
                        <Ionicons name="hand-left-outline" size={20} color="#e11d48" />
                        <Text style={styles.blockButtonText}>{t('osBlock')}</Text>
                    </Pressable>
                    )}

                    <Pressable style={[styles.actionButton, styles.executeButton]} onPress={handleExecute}>
                        <Ionicons name="play-outline" size={20} color="#fff" />
                        <Text style={styles.executeButtonText}>
                            {order.status === 'assigned' ? t('osStartOS') :
                                order.status === 'traveling' ? t('osArrived') : t('osExecute')}
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
                <KeyboardAvoidingView style={styles.modalOverlay} behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}>
                    <View style={styles.modalContent}>
                        <Text style={styles.modalTitle}>{t('osBlockModalTitle')}</Text>

                        <TextInput
                            style={styles.input}
                            placeholder={t('osBlockPlaceholder')}
                            multiline
                            numberOfLines={4}
                            value={impedimentReason}
                            onChangeText={setImpedimentReason}
                        />

                        {/* Fotos do impedimento */}
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>{t('osBlockPhotosLabel')}</Text>
                        
                        {impedimentPhotoUris.length > 0 && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                                {impedimentPhotoUris.map((uri, index) => (
                                    <Pressable key={index} onPress={() => setImpedimentPhotoUris(prev => prev.filter((_, i) => i !== index))} style={{ marginRight: 10, position: 'relative' }}>
                                        <Image source={{ uri }} style={{ width: 100, height: 100, borderRadius: 10, backgroundColor: '#f8d7da' }} resizeMode="cover" />
                                        <View style={{ position: 'absolute', top: -5, right: -5, backgroundColor: '#fff', borderRadius: 12 }}>
                                            <Ionicons name="close-circle" size={24} color="#e11d48" />
                                        </View>
                                    </Pressable>
                                ))}
                            </ScrollView>
                        )}
                        
                        {impedimentPhotoUris.length < 10 && (
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
                                    marginBottom: 12
                                }}
                                onPress={handlePickBlockPhoto}
                            >
                                <View style={{ backgroundColor: '#fee2e2', padding: 10, borderRadius: 50, marginRight: 14 }}>
                                    <Ionicons name="camera" size={22} color="#e11d48" />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#be123c' }}>
                                        Tocar para Fotografar
                                    </Text>
                                    <Text style={{ fontSize: 12, color: '#9f1239', marginTop: 2 }}>
                                        {impedimentPhotoUris.length > 0 
                                            ? `${t('osAddMore')} (${impedimentPhotoUris.length}/10)` 
                                            : t('osPhotoImpediment')}
                                    </Text>
                                </View>
                            </Pressable>
                        )}

                        <View style={styles.modalButtons}>
                            <Pressable style={[styles.modalButton, styles.cancelButton]} onPress={() => { setModalVisible(false); setImpedimentPhotoUris([]); }}>
                                <Text style={styles.cancelButtonText}>{t('menuCancel')}</Text>
                            </Pressable>
                            <Pressable style={[styles.modalButton, styles.confirmButton]} onPress={confirmBlock} disabled={isUploadingBlock}>
                                {isUploadingBlock
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Text style={styles.confirmButtonText}>{t('alertConfirm')}</Text>
                                }
                            </Pressable>
                        </View>
                    </View>
                </KeyboardAvoidingView>
            </Modal>

            {/* Image Viewer Modal */}
            <ImageViewerModal
                visible={viewerVisible}
                imageUris={viewerUris}
                initialIndex={viewerIndex}
                onClose={() => setViewerVisible(false)}
            />

            {/* MODAL INICIAR OS AÇÕES */}
            <Modal
                visible={isActionModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsActionModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { padding: 0, overflow: 'hidden' }]}>
                        <View style={{ backgroundColor: '#1e293b', padding: 20, alignItems: 'center' }}>
                            <Ionicons name="car-outline" size={32} color="#fff" />
                            <Text style={[styles.modalTitle, { color: '#fff', marginBottom: 0, marginTop: 10 }]}>{t('osActionTitle')}</Text>
                        </View>
                        
                        <View style={{ padding: 20, gap: 12 }}>
                            <Text style={{ textAlign: 'center', color: '#64748b', marginBottom: 8 }}>{t('osStartDisplacementMsg')}</Text>
                            
                            <Pressable 
                                style={[styles.modalButton, { flex: 0, backgroundColor: '#3b82f6', paddingVertical: 16, width: '100%' }]} 
                                onPress={async () => {
                                    setIsActionModalVisible(false);
                                    showLoading(t('osStartActionDisplacement') + '...');
                                    const startTime = Date.now();
                                    try {
                                        await AsyncStorage.removeItem(`os_cache_${id}`);
                                        await OrderService.startDisplacement(id as string, actionLocation.lat, actionLocation.lon);
                                        const updated = await OrderService.getOrderById(id as string, true);
                                        setOrder(updated);
                                    } catch (e: any) {
                                        Alert.alert(t('alertError'), e.message);
                                    } finally {
                                        const elapsed = Date.now() - startTime;
                                        const remaining = Math.max(0, 1000 - elapsed);
                                        if (remaining > 0) {
                                            await new Promise(resolve => setTimeout(resolve, remaining));
                                        }
                                        hideLoading();
                                    }
                                }}
                            >
                                <Ionicons name="navigate-outline" size={20} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={[styles.confirmButtonText, { fontSize: 14 }]}>{t('osStartActionDisplacement')}</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={[styles.modalButton, { flex: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 16, width: '100%' }]} 
                                onPress={async () => {
                                    setIsActionModalVisible(false);
                                    showLoading(t('osStartActionAlreadyAtClient') + '...');
                                    const startTime = Date.now();
                                    try {
                                        await AsyncStorage.removeItem(`os_cache_${id}`);
                                        await OrderService.startExecution(id as string, actionLocation.lat, actionLocation.lon);
                                        router.push({ pathname: '/os/execute', params: { id: id as string } });
                                    } catch (e: any) {
                                        Alert.alert(t('alertError'), e.message);
                                    } finally {
                                        const elapsed = Date.now() - startTime;
                                        const remaining = Math.max(0, 1000 - elapsed);
                                        if (remaining > 0) {
                                            await new Promise(resolve => setTimeout(resolve, remaining));
                                        }
                                        hideLoading();
                                    }
                                }}
                            >
                                <Ionicons name="location-outline" size={20} color="#1e293b" style={{ marginRight: 8 }} />
                                <Text style={[styles.confirmButtonText, { fontSize: 14, color: '#1e293b' }]}>{t('osStartActionAlreadyAtClient')}</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={[styles.modalButton, { flex: 0, backgroundColor: 'transparent', paddingVertical: 12, width: '100%' }]} 
                                onPress={() => setIsActionModalVisible(false)}
                            >
                                <Text style={[styles.cancelButtonText, { fontSize: 14, fontWeight: 'bold' }]}>{t('menuCancel')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* MODAL FONTE DE FOTO */}
            <Modal
                visible={isPhotoSourceModalVisible}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setIsPhotoSourceModalVisible(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={[styles.modalContent, { padding: 0, overflow: 'hidden' }]}>
                        <View style={{ backgroundColor: '#1e293b', padding: 20, alignItems: 'center' }}>
                            <Ionicons name="camera-outline" size={32} color="#fff" />
                            <Text style={[styles.modalTitle, { color: '#fff', marginBottom: 0, marginTop: 10 }]}>{t('osPhotoSourceTitle')}</Text>
                        </View>
                        
                        <View style={{ padding: 20, gap: 12 }}>
                            <Pressable 
                                style={[styles.modalButton, { flex: 0, backgroundColor: '#3b82f6', paddingVertical: 16, width: '100%' }]} 
                                onPress={() => {
                                    setIsPhotoSourceModalVisible(false);
                                    processPhotoChoice('camera');
                                }}
                            >
                                <Ionicons name="camera" size={20} color="#fff" style={{ marginRight: 8 }} />
                                <Text style={[styles.confirmButtonText, { fontSize: 14 }]}>{t('osTakePhotoNow')}</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={[styles.modalButton, { flex: 0, backgroundColor: '#fff', borderWidth: 1, borderColor: '#cbd5e1', paddingVertical: 16, width: '100%' }]} 
                                onPress={() => {
                                    setIsPhotoSourceModalVisible(false);
                                    processPhotoChoice('library');
                                }}
                            >
                                <Ionicons name="images" size={20} color="#1e293b" style={{ marginRight: 8 }} />
                                <Text style={[styles.confirmButtonText, { fontSize: 14, color: '#1e293b' }]}>{t('osChooseGallery')}</Text>
                            </Pressable>
                            
                            <Pressable 
                                style={[styles.modalButton, { flex: 0, backgroundColor: 'transparent', paddingVertical: 12, width: '100%' }]} 
                                onPress={() => setIsPhotoSourceModalVisible(false)}
                            >
                                <Text style={[styles.cancelButtonText, { fontSize: 14, fontWeight: 'bold' }]}>{t('menuCancel')}</Text>
                            </Pressable>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Global Screen Alert */}
            <NexusAlert 
                visible={alertConfig.visible} 
                title={alertConfig.title} 
                message={alertConfig.message} 
                buttons={alertConfig.buttons} 
                onDismiss={() => setAlertConfig(prev => ({...prev, visible: false}))} 
            />
        </ThemedView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f1f5f9' },
    loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f1f5f9' },
    errorText: { fontSize: 16, color: '#64748b', fontWeight: '500' },
    content: { padding: 14, paddingBottom: 100 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
    title: { fontSize: 22, fontWeight: '900', color: '#0f172a', letterSpacing: -0.5 },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 16, backgroundColor: '#e6f3ff' },
    statusText: { fontSize: 10, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.5 },
    card: { backgroundColor: '#ffffff', borderRadius: 16, padding: 14, marginBottom: 12, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 8, elevation: 2, borderWidth: 1, borderColor: '#e2e8f0' },
    divider: { height: 1, backgroundColor: '#f1f5f9', marginVertical: 12 },
    infoText: { fontSize: 13, color: '#334155', marginTop: 6, lineHeight: 20 },
    detailRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 8, gap: 10 },
    infoTextLabel: { fontSize: 11, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5, width: 60 },
    infoTextValue: { fontSize: 13, color: '#1e293b', flex: 1, fontWeight: '600' },
    addressText: { fontSize: 13, color: '#334155', marginTop: 6, marginBottom: 12, lineHeight: 18 },
    gpsButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#eff6ff', paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: '#bfdbfe', gap: 6 },
    gpsButtonText: { color: '#2563eb', fontWeight: '800', fontSize: 13 },
    photosContainer: { flexDirection: 'row', marginTop: 10 },
    photoThumbnail: { width: 80, height: 80, borderRadius: 10, backgroundColor: '#f1f5f9', marginRight: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    signatureImage: { width: '100%', height: 100, backgroundColor: '#ffffff', marginTop: 10, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0' },
    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff', padding: 14, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#f1f5f9', paddingBottom: Platform.OS === 'ios' ? 44 : 35, shadowColor: '#000', shadowOffset: { width: 0, height: -8 }, shadowOpacity: 0.05, shadowRadius: 16, elevation: 15 },
    actionButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flex: 0.48, paddingVertical: 14, borderRadius: 12, gap: 8 },
    blockButton: { backgroundColor: '#fff1f2', borderWidth: 1, borderColor: '#fecdd3' },
    blockButtonText: { color: '#e11d48', fontWeight: '800', fontSize: 15 },
    executeButton: { backgroundColor: '#1e293b', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
    executeButtonText: { color: '#ffffff', fontWeight: '800', fontSize: 15 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
    modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 20, width: '100%', maxWidth: 400 },
    modalTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 14, color: '#1c2d4f', textAlign: 'center' },
    input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 12, fontSize: 14, textAlignVertical: 'top', minHeight: 90, marginBottom: 16 },
    modalButtons: { flexDirection: 'row', justifyContent: 'space-between' },
    modalButton: { flex: 0.48, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
    cancelButton: { backgroundColor: '#f1f5f9' },
    cancelButtonText: { color: '#64748b', fontWeight: '600' },
    confirmButton: { backgroundColor: '#d32f2f' },
    confirmButtonText: { color: '#fff', fontWeight: 'bold' },
    dynamicFieldRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
    dynamicFieldLabel: { fontSize: 11, fontWeight: '900', color: '#1e293b', textTransform: 'uppercase', letterSpacing: 1.2, marginBottom: 8 },
    dynamicFieldValueContainer: { backgroundColor: '#f8fafc', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#f1f5f9' },
    dynamicFieldValue: { fontSize: 15, color: '#0f172a', fontWeight: '700', lineHeight: 22 },
    executionSection: { marginTop: 20, paddingTop: 20, borderTopWidth: 2, borderTopColor: '#f1f5f9' },
    sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
    executionSectionLabel: { fontSize: 13, fontWeight: '900', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.8 },
    reportContent: { backgroundColor: '#fdfdfd', padding: 16, borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.03, shadowRadius: 2, elevation: 1 },
    groupHeader: { backgroundColor: '#1e293b', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, alignSelf: 'flex-start', marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 6, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 2 },
    groupHeaderText: { fontSize: 11, fontWeight: '900', color: '#ffffff', textTransform: 'uppercase', letterSpacing: 0.8 },
    checklistItemsContainer: { backgroundColor: '#ffffff', paddingHorizontal: 2 },
    signatureCanvas: { backgroundColor: '#f8fafc', borderRadius: 10, marginTop: 6, borderWidth: 1, borderColor: '#f1f5f9', padding: 6 },
    clientNameText: { fontSize: 12, color: '#64748b', marginTop: 6, textAlign: 'center', fontStyle: 'italic' },
    videoPlayerButton: { backgroundColor: '#1e293b', borderRadius: 12, overflow: 'hidden', marginTop: 4, alignItems: 'center', justifyContent: 'center', paddingVertical: 20 },
    videoIconContainer: { marginBottom: 8 },
    videoPlayerText: { color: '#fff', fontWeight: '700', fontSize: 15 },
    videoPlayerSubText: { color: '#94a3b8', fontSize: 11, marginTop: 4 },
});

