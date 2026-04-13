
import { HeaderRightToggle } from '@/components/header-right-toggle';
import { ImageViewerModal } from '@/components/image-viewer-modal';
import { SecureImage, warmSignedUrlCacheBulk } from '@/components/secure-image';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { getStatusConfig } from '@/constants/mock-data';
import { useI18n } from '@/services/i18n';
import { OrderService } from '@/services/order-service';
import { supabase } from '@/services/supabase';
import { syncService } from '@/services/sync-service';
import { TenantService } from '@/services/tenant-service';
import { ImageService } from '@/services/image-service';
import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, KeyboardAvoidingView } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function OrderDetailsScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
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
    const [isStatusModalVisible, setIsStatusModalVisible] = useState(false);

    // Image viewer state
    const [viewerVisible, setViewerVisible] = useState(false);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);
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
    // Form templates for sorting and display
    const [formTemplates, setFormTemplates] = useState<Record<string, string[]>>({});
    // Expanded form groups state
    const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
    const [dynamicPhone, setDynamicPhone] = useState<string | null>(null);
    // Visit history state
    const [orderVisits, setOrderVisits] = useState<any[]>([]);
    const [expandedVisits, setExpandedVisits] = useState<Record<string, boolean>>({});

    const toggleGroup = (group: string) => {
        setExpandedGroups(prev => ({ ...prev, [group]: prev[group] !== undefined ? !prev[group] : false }));
    };

    useFocusEffect(
        useCallback(() => {
            let isActive = true;

            const fetchOrder = async () => {
                try {
                    // Load tenant settings for concurrent OS control
                    TenantService.getSettings().then(settings => {
                        if (isActive) {
                            setAllowMultipleInProgress(settings.allowMultipleInProgress);
                            setShowPrices(settings.showStockPrice);
                            setShowClientContact(settings.showClientContact);
                            setShowStockHistory(settings.showStockHistory);
                            setAllowImpediment(settings.allowImpediment);
                            setShowVisitHistory(settings.showVisitHistory);
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
                    await Promise.all([
                        // 3.1 Visit history
                        OrderService.getOrderVisits(id as string).then(visits => {
                            if (isActive) {
                                setOrderVisits(visits);
                                if (visits.length > 0) {
                                    // Se a OS já está finalizada, mantém todos recolhidos (conforme solicitado).
                                    // Caso contrário, auto-expande a mais recente.
                                    const finalizedStatuses = ['completed', 'COMPLETED', 'blocked', 'BLOCKED', 'canceled', 'CANCELED'];
                                    if (!finalizedStatuses.includes(currentOrder.status)) {
                                        const firstKey = visits[0].id || 'visit_0';
                                        setExpandedVisits({ [firstKey]: true });
                                    }
                                }
                            }
                        }),
                        
                        // 3.2 Form Templates for mapping
                        (async () => {
                            const ids = new Set<string>();
                            if (currentOrder.formId) ids.add(currentOrder.formId);
                            if (currentOrder.equipments) {
                                currentOrder.equipments.forEach((eq: any) => {
                                    if (eq.form_id) ids.add(eq.form_id);
                                });
                            }
                            if (ids.size > 0) {
                                try {
                                    const templates = await OrderService.getFormTemplates();
                                    const map: Record<string, string[]> = {};
                                    templates.forEach((t: any) => {
                                        if (ids.has(t.id)) {
                                            map[t.id] = (t.fields || t.schema?.fields || []).map((f: any) => f.label || f.title || '');
                                        }
                                    });
                                    if (isActive) setFormTemplates(map);
                                } catch (e) {
                                    console.error('[OS Detail] Error fetching templates:', e);
                                }
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

                        // Visit History Photos
                        const visits = await OrderService.getOrderVisits(id as string);
                        visits.forEach(v => {
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
                            // Envia TODAS as URLs coletadas para o método de aquecimento em lote.
                            // Isso fará exatamente UMA requisição (createSignedUrls) para o Supabase,
                            // evitando rate-limiting, erros de timeout e travamento do React Native.
                            // Também faz o prefetch seguro dos bytes.
                            await warmSignedUrlCacheBulk(Array.from(imagesToPreload));
                        }
                    }

                } catch (e: any) {
                    console.error(e);
                    if (isActive) {
                        setError(e.message || t('alertError'));
                        setOrder(null);
                    }
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
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc', padding: 24 }}>
                <ActivityIndicator size="large" color="#1c2d4f" />
                <Text style={{ marginTop: 16, color: '#334155', fontSize: 16, fontWeight: '700', textAlign: 'center' }}>
                    Carregando OS...
                </Text>
                <Text style={{ marginTop: 8, color: '#64748b', fontSize: 14, textAlign: 'center', maxWidth: '80%' }}>
                    Preparando fotos e histórico da ordem de serviço.
                </Text>
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
                            router.replace(`/os/${id}`);
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
        try {
            // Capture location if possible
            let lat: number | undefined;
            let lon: number | undefined;
            try {
                const { status } = await Location.requestForegroundPermissionsAsync();
                if (status === 'granted') {
                    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
                    lat = loc.coords.latitude;
                    lon = loc.coords.longitude;
                }
            } catch (err) {
                console.log('[OSDetail] Location fetch error:', err);
            }

            if (order.status === 'assigned') {
                setLoading(false);
                setActionLocation({ lat, lon });
                setIsActionModalVisible(true);
                return; // Early return
            }

            // Normal flow for already traveling or in_progress
            if (order.status !== 'in_progress' && order.status !== 'EM ANDAMENTO') {
                await OrderService.startExecution(id as string, lat, lon);
            }
            router.push({ pathname: '/os/execute', params: { id: id as string } });
        } catch (e: any) {
            Alert.alert(t('alertError'), e.message);
        } finally {
            if (order.status !== 'assigned') {
                setLoading(false);
            }
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
            Alert.alert(t('osBlockRegistered'), `Motivo: ${impedimentReason}`);
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

    const openImage = (uri: string) => {
        setSelectedImage(uri);
        setViewerVisible(true);
    };

    return (
        <ThemedView style={styles.container}>
            <Stack.Screen options={{ title: t('osDetails') }} />
            <ScrollView contentContainerStyle={[styles.content, !isEditable && { paddingBottom: 20 }]}>

                {/* Header Status */}
                <View style={styles.header}>
                    <ThemedText style={styles.title}>{order.displayId || order.id}</ThemedText>
                    <View style={[styles.statusBadge, { backgroundColor: statusConfig[order.status]?.color + '20' || '#ccc' }]}>
                        <Text style={[styles.statusText, { color: statusConfig[order.status]?.color || '#666' }]}>
                            {statusConfig[order.status]?.label || order.status}
                        </Text>
                    </View>
                </View>

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
                                const ignoredFdKeys = new Set(['blockReason', 'blockPhotoUrls', 'blockedAt', 'completedAt', 'signature', 'clientName', 'clientDoc', 'extra_photos', 'technical_report', 'parts_used', 'impediment_signature', 'impediment_responsible', 'impediment_reason', 'blockPhotoUrl', 'video_url', 'impediment_history']);
                                
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


                                                {/* Checklist */}
                                                {formEntries.length > 0 && (
                                                    <View style={{ marginBottom: 16 }}>
                                                        <Text style={{ fontSize: 11, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: 10 }}>{t('osChecklist')}</Text>
                                                        {(() => {
                                                            const equipments = order.equipments || [];
                                                            const usedItemsVisit = typeof fd.items === 'object' ? fd.items : (isLegacy && isLast ? (order.items || []) : []);
                                                            
                                                            // 1. Mapeia grupos do checklist
                                                            const groupedChecklist = formEntries.reduce((acc, entry) => {
                                                                const match = entry[0].match(/^\[(.*?)\]\s*(?:-|$)/);
                                                                const groupName = match ? match[1] : t('osConclusion');
                                                                
                                                                if (groupName === t('osConclusion')) {
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
                                                                
                                                                if (!groupName && item.equipment_id && equipments.length > 0) {
                                                                    const eq = equipments.find((e: any) => e.id === item.equipment_id);
                                                                    if (eq) groupName = eq.equipment_model || eq.equipment_name;
                                                                }
                                                                groupName = groupName || t('osConclusion');
                                                                
                                                                const formGroups = Object.keys(groupedChecklist);
                                                                const matchedFormGroup = formGroups.find(g => 
                                                                    g.toLowerCase().includes(groupName.toLowerCase()) || 
                                                                    groupName.toLowerCase().includes(g.toLowerCase())
                                                                );
                                                                
                                                                if (matchedFormGroup) groupName = matchedFormGroup;
                                                                else if (groupName === t('osConclusion')) {
                                                                    const realGroups = formGroups.filter(g => g !== t('osConclusion'));
                                                                    if (realGroups.length === 1) groupName = realGroups[0];
                                                                }

                                                                if (!acc[groupName]) acc[groupName] = [];
                                                                acc[groupName].push(item);
                                                                return acc;
                                                            }, {} as Record<string, any[]>);

                                                            const allGroupNames = Array.from(new Set([...Object.keys(groupedChecklist), ...Object.keys(groupedParts)])).filter(g => g !== t('osConclusion'));
                                                            if (groupedChecklist[t('osConclusion')] || groupedParts[t('osConclusion')]) allGroupNames.push(t('osConclusion'));

                                                            return allGroupNames.map((group, gIdx) => {
                                                                const items = groupedChecklist[group] || [];
                                                                const parts = groupedParts[group] || [];
                                                                const isEquipment = group !== t('osConclusion');
                                                                
                                                                const eqData = equipments.find((e: any) => {
                                                                    const eN = (e.equipment_model || e.equipment_name || '').toLowerCase();
                                                                    return group.toLowerCase().includes(eN) || eN.includes(group.toLowerCase());
                                                                });

                                                                if (items.length === 0 && parts.length === 0) return null;

                                                                return (
                                                                    <View key={group} style={{ backgroundColor: '#ffffff', borderRadius: 12, marginBottom: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', elevation: 1, shadowColor: '#000', shadowOffset: {width:0, height:1}, shadowOpacity: 0.05, shadowRadius: 3 }}>
                                                                        <Pressable 
                                                                            onPress={() => toggleGroup(group)}
                                                                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 12, backgroundColor: expandedGroups[group] ? '#f8fafc' : '#ffffff' }}
                                                                        >
                                                                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                                                                                <Ionicons name={isEquipment ? "cube-outline" : "checkmark-done"} size={16} color={isEquipment ? "#3b82f6" : "#10b981"} style={{ marginRight: 6 }} />
                                                                                <Text style={{ fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase' }} numberOfLines={2}>
                                                                                    {isEquipment && eqData ? `${eqData.equipment_model || eqData.equipment_name || group}${eqData.equipment_serial ? ` (S/N: ${eqData.equipment_serial})` : ''}` : group}
                                                                                </Text>
                                                                            </View>
                                                                            <Ionicons name={expandedGroups[group] ? "chevron-up" : "chevron-down"} size={18} color="#94a3b8" />
                                                                        </Pressable>

                                                                        {expandedGroups[group] && (
                                                                            <View style={{ padding: 12, paddingTop: 4, backgroundColor: '#ffffff' }}>
                                                                                {items.length > 0 && (
                                                                                    <View style={{ marginBottom: 8 }}>
                                                                                        {items.map(([fullKey, val]) => {
                                                                                            let cleanKey = fullKey.replace(/^\[.*?\]\s*-\s*/, '').replace(/_/g, ' ');
                                                                                            if (cleanKey.toLowerCase() === 'photos' || cleanKey.toLowerCase() === 'fotos') cleanKey = t('osAttachments');
                                                                                            
                                                                                            const isImageUrl = (v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:image'));
                                                                                            const isImageArray = Array.isArray(val) && val.every(v => isImageUrl(v));
                                                                                            const isSingleImage = isImageUrl(val);

                                                                                            return (
                                                                                                <View key={fullKey} style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }}>
                                                                                                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 4 }}>{cleanKey}</Text>
                                                                                                    {isImageArray ? (
                                                                                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 4 }}>
                                                                                                            {val.map((uri: string, idx: number) => (
                                                                                                                <Pressable key={idx} onPress={() => openImage(uri)}>
                                                                                                                    <SecureImage uri={uri} style={{ width: 80, height: 80, borderRadius: 8, marginRight: 8 }} resizeMode="cover" />
                                                                                                                </Pressable>
                                                                                                            ))}
                                                                                                        </ScrollView>
                                                                                                    ) : isSingleImage ? (
                                                                                                        <Pressable onPress={() => openImage(val)} style={{ marginTop: 4 }}>
                                                                                                            <SecureImage uri={val} style={{ width: '100%', height: 160, borderRadius: 8 }} resizeMode="cover" />
                                                                                                        </Pressable>
                                                                                                    ) : (
                                                                                                        <Text style={{ fontSize: 14, color: (val === 'OK' || val === 'Sim') ? '#16a34a' : '#0f172a', fontWeight: '700' }}>{String(val)}</Text>
                                                                                                    )}
                                                                                                </View>
                                                                                            );
                                                                                        })}
                                                                                    </View>
                                                                                )}

                                                                                {parts.length > 0 && showStockHistory && (
                                                                                    <View style={{ marginTop: items.length > 0 ? 8 : 0 }}>
                                                                                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#64748b', textTransform: 'uppercase', marginBottom: 8 }}>{t('osPartsUsed')}</Text>
                                                                                        {parts.map((p: any, pIdx: number) => (
                                                                                            <View key={`part-${pIdx}`} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 8, padding: 10, marginBottom: 6, borderWidth: 1, borderColor: '#e2e8f0' }}>
                                                                                                <Ionicons name="cube-outline" size={16} color="#64748b" style={{ marginRight: 8 }} />
                                                                                                <View style={{ flex: 1 }}>
                                                                                                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0f172a' }}>{p.description || p.item_name}</Text>
                                                                                                </View>
                                                                                                <View style={{ backgroundColor: '#dbeafe', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}>
                                                                                                    <Text style={{ fontSize: 12, color: '#1e40af', fontWeight: '800' }}>{p.quantity} un</Text>
                                                                                                </View>
                                                                                            </View>
                                                                                        ))}
                                                                                    </View>
                                                                                )}
                                                                            </View>
                                                                        )}
                                                                    </View>
                                                                );
                                                            });
                                                        })()}
                                                    </View>
                                                )}

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
                                                                <Pressable key={pi} onPress={() => openImage(uri)} style={{ marginRight: 8, borderRadius: 8, overflow: 'hidden' }}>
                                                                    <SecureImage uri={uri} style={{ width: 220, height: 150 }} resizeMode="cover" />
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
                                                                <Pressable key={pi} onPress={() => openImage(uri)} style={{ marginRight: 8, borderRadius: 8, overflow: 'hidden' }}>
                                                                    <SecureImage uri={uri} style={{ width: 220, height: 150 }} resizeMode="cover" />
                                                                </Pressable>
                                                            ))}
                                                        </ScrollView>
                                                    </View>
                                                )}

                                                {/* Vídeo */}
                                                {Boolean(videoUrl) && (
                                                    <View style={{ marginBottom: 10 }}>
                                                        <Text style={{ fontSize: 10, fontWeight: '800', color: '#475569', textTransform: 'uppercase', marginBottom: 6 }}>{t('osRecording')}</Text>
                                                        <Pressable
                                                            onPress={() => Linking.openURL(videoUrl!)}
                                                            style={{ height: 120, borderRadius: 12, backgroundColor: '#1e293b', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
                                                        >
                                                            <View style={{ width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center', paddingLeft: 5 }}>
                                                                <Ionicons name="play" size={28} color="#ffffff" />
                                                            </View>
                                                            <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 8 }}>{t('osTapToOpen')}</Text>
                                                        </Pressable>
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
                                                                    <SecureImage uri={signatureUri!} style={{ width: '100%', height: 100 }} resizeMode="contain" />
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
                                                    <Pressable key={index} onPress={() => openImage(uri)}>
                                                        <SecureImage uri={uri} style={styles.photoThumbnail} resizeMode="cover" />
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
                                            <Pressable
                                                style={{ width: '100%', height: 140, borderRadius: 12, overflow: 'hidden', position: 'relative', backgroundColor: '#1e293b', marginTop: 8 }}
                                                onPress={() => Linking.openURL(order.videoUrl!)}
                                            >
                                                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
                                                    <View style={{ width: 60, height: 60, backgroundColor: 'rgba(255,255,255,0.1)', paddingLeft: 6, borderRadius: 30, alignItems: 'center', justifyContent: 'center' }}>
                                                        <Ionicons name="play" size={32} color="#ffffff" />
                                                    </View>
                                                </View>
                                            </Pressable>
                                        </View>
                                    )}
                                </View>
                            );
                        })()}
                    </View>
                )}

            </ScrollView>

            {/* Footer Actions - Only show if pending or in_progress */}
            {isEditable && (
                <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom + 10, 20) }]}>
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
                                onPress={handlePickBlockPhoto}
                                style={{ borderWidth: 1, borderColor: '#fca5a5', borderStyle: 'dashed', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 12, backgroundColor: '#fff5f5', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
                            >
                                <Ionicons name="camera-outline" size={18} color="#e11d48" />
                                <Text style={{ fontSize: 12, color: '#e11d48', fontWeight: '700' }}>
                                    {impedimentPhotoUris.length > 0 ? `${t('osAddMore')} (${impedimentPhotoUris.length}/10)` : t('osPhotoImpediment')}
                                </Text>
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
                imageUri={selectedImage}
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
                                    setLoading(true);
                                    try {
                                        await OrderService.startDisplacement(id as string, actionLocation.lat, actionLocation.lon);
                                        const updated = await OrderService.getOrderById(id as string, true);
                                        setOrder(updated);
                                    } catch (e: any) {
                                        Alert.alert(t('alertError'), e.message);
                                    } finally {
                                        setLoading(false);
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
                                    setLoading(true);
                                    try {
                                        await OrderService.startExecution(id as string, actionLocation.lat, actionLocation.lon);
                                        router.push({ pathname: '/os/execute', params: { id: id as string } });
                                    } catch (e: any) {
                                        Alert.alert(t('alertError'), e.message);
                                    } finally {
                                        setLoading(false);
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

