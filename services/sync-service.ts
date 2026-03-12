import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const OFFLINE_ORDERS_KEY = '@nexus_offline_today_orders';
const OFFLINE_ORDER_DETAIL_PREFIX = '@nexus_offline_order_';

export interface SyncTask {
    id: string;
    type: 'complete_os';
    orderId: string;
    payload: any;
    status: 'pending' | 'syncing' | 'error';
    createdAt: number;
    errorReason?: string;
    localPhotos?: string[]; // Array of local URIs
}

const SYNC_QUEUE_KEY = '@nexus_sync_queue';
const OFFLINE_CACHE_KEY = '@nexus_offline_orders';
const APP_OFFLINE_MODE_KEY = '@nexus_offline_mode_enabled';

class SyncService {
    private isSyncing = false;
    private subscribers: ((queue: SyncTask[]) => void)[] = [];
    private unsubscribeNetInfo: (() => void) | null = null;
    private offlineModeEnabled = false;

    constructor() {
        this.loadSettings();
    }

    async loadSettings() {
        const val = await AsyncStorage.getItem(APP_OFFLINE_MODE_KEY);
        this.offlineModeEnabled = val === 'true';

        if (this.offlineModeEnabled) {
            this.startListening();
        }
    }

    async toggleOfflineMode(enabled: boolean) {
        this.offlineModeEnabled = enabled;
        await AsyncStorage.setItem(APP_OFFLINE_MODE_KEY, enabled ? 'true' : 'false');
        if (enabled) {
            this.startListening();
        } else {
            this.stopListening();
            // Ao voltar online, dispara sync imediatamente e aguarda
            await this.triggerSync(true);
        }
    }

    isOfflineModeEnabled() {
        return this.offlineModeEnabled;
    }

    // ========== Queue Management ========== //

    async getQueue(): Promise<SyncTask[]> {
        try {
            const data = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            console.error('[Sync] Erro ao ler fila:', e);
            return [];
        }
    }

    private async saveQueue(queue: SyncTask[]) {
        try {
            await AsyncStorage.setItem(SYNC_QUEUE_KEY, JSON.stringify(queue));
            this.notifySubscribers(queue);
        } catch (e) {
            console.error('[Sync] Erro ao salvar fila:', e);
        }
    }

    async addToQueue(task: Omit<SyncTask, 'id' | 'status' | 'createdAt'>) {
        const queue = await this.getQueue();
        const newTask: SyncTask = {
            ...task,
            id: Date.now().toString() + Math.random().toString(36).substring(7),
            status: 'pending',
            createdAt: Date.now(),
        };

        // Cache local photos into document directory to ensure they aren't deleted by temp cache clearer
        if (newTask.localPhotos && newTask.localPhotos.length > 0) {
            const safePhotos = [];
            for (const uri of newTask.localPhotos) {
                if (uri.startsWith('file://')) {
                    const filename = uri.split('/').pop();
                    const newPath = FileSystem.documentDirectory + 'offline_' + filename;
                    await FileSystem.copyAsync({ from: uri, to: newPath });
                    safePhotos.push(newPath);
                } else if (uri.startsWith('data:image')) {
                    // Signature base64, keep it as is
                    safePhotos.push(uri);
                }
            }
            newTask.localPhotos = safePhotos;
        }

        queue.push(newTask);
        await this.saveQueue(queue);

        // Notify user implicitly through badge update

        // Attempt immediate sync if online
        this.triggerSync();
    }

    async removeFromQueue(taskId: string) {
        const queue = await this.getQueue();
        const newQueue = queue.filter(t => t.id !== taskId);
        await this.saveQueue(newQueue);
    }

    async updateTaskStatus(taskId: string, status: SyncTask['status'], errorReason?: string) {
        const queue = await this.getQueue();
        const task = queue.find(t => t.id === taskId);
        if (task) {
            task.status = status;
            if (errorReason) task.errorReason = errorReason;
            await this.saveQueue(queue);
        }
    }

    // ========== Process Queue ========== //

    async triggerSync(force = false) {
        if (this.isSyncing) return;
        if (!force && !this.offlineModeEnabled) return;

        const state = await NetInfo.fetch();
        if (!state.isConnected) return;

        const queue = await this.getQueue();
        const pendingTasks = queue.filter(t => t.status === 'pending' || t.status === 'error');

        if (pendingTasks.length === 0) return;

        this.isSyncing = true;
        console.log(`[Sync] Iniciando sincronização de ${pendingTasks.length} itens...`);

        for (const task of pendingTasks) {
            await this.updateTaskStatus(task.id, 'syncing');
            try {
                if (task.type === 'complete_os') {
                    await this.syncCompleteOS(task);
                }
                await this.removeFromQueue(task.id);
                console.log(`[Sync] Tarefa ${task.id} sincronizada com sucesso.`);
            } catch (error: any) {
                console.error(`[Sync] Falha na tarefa ${task.id}:`, error);
                await this.updateTaskStatus(task.id, 'error', error.message);
            }
        }

        this.isSyncing = false;
        console.log('[Sync] Sincronização concluída.');
    }

    private async syncCompleteOS(task: SyncTask) {
        const { orderId, payload } = task;
        const { OrderService } = await import('./order-service');

        const tenantId = payload.tenantId;

        // 1. Processar fotos extras — substituir file:// por URLs remotas
        const processedExtraPhotos: string[] = [];
        if (payload.extraPhotos && Array.isArray(payload.extraPhotos)) {
            for (const uri of payload.extraPhotos) {
                if (typeof uri === 'string' && (uri.startsWith('file://') || (FileSystem.documentDirectory && uri.startsWith(FileSystem.documentDirectory)))) {
                    try {
                        const url = await OrderService.uploadFile(uri, `orders/${orderId}/extra_photos`, tenantId);
                        if (url) processedExtraPhotos.push(url);
                    } catch (e) { console.error('[Sync] Falha foto extra:', e); }
                } else {
                    processedExtraPhotos.push(uri);
                }
            }
        }

        // 2. Processar fotos de formulário nas execution_forms
        const executionForms = payload.execution_forms;
        const finalFormData: Record<string, any> = {};

        if (executionForms) {
            for (const eqKey of Object.keys(executionForms)) {
                const config = executionForms[eqKey];
                const eqName = config?.equipamento?.equipment_model || config?.equipamento?.equipment_name || 'Equipamento';
                const prefix = `[${eqName}${config?.equipamento?.equipment_serial ? ` S/N: ${config.equipamento.equipment_serial}` : ''}] - `;

                if (config?.template?.fields) {
                    for (const field of config.template.fields) {
                        let value = config.data?.[field.id];

                        // Upload de fotos locais dentro do formulário
                        if (Array.isArray(value)) {
                            const uploadedUrls: string[] = [];
                            for (const item of value) {
                                if (typeof item === 'string' && (item.startsWith('file://') || (FileSystem.documentDirectory && item.startsWith(FileSystem.documentDirectory)))) {
                                    try {
                                        const url = await OrderService.uploadFile(item, `orders/${orderId}/form_photos`, tenantId);
                                        if (url) uploadedUrls.push(url);
                                    } catch (e) { console.error('[Sync] Falha foto form:', e); }
                                } else {
                                    uploadedUrls.push(item);
                                }
                            }
                            value = uploadedUrls;
                        } else if (typeof value === 'string' && (value.startsWith('file://') || (FileSystem.documentDirectory && value.startsWith(FileSystem.documentDirectory)))) {
                            try {
                                const url = await OrderService.uploadFile(value, `orders/${orderId}/form_photos`, tenantId);
                                if (url) value = url;
                            } catch (e) { console.error('[Sync] Falha foto form:', e); }
                        }

                        if (value !== undefined && value !== '') {
                            finalFormData[`${prefix}${field.label}`] = value;
                        }
                    }
                }
            }
        }

        // 3. Processar assinatura
        let processedSignature = payload.signature || null;
        if (processedSignature && processedSignature.startsWith('data:image')) {
            try {
                const sigPath = `${FileSystem.documentDirectory}sig_${orderId}_${Date.now()}.png`;
                const base64Data = processedSignature.split(',')[1];
                await FileSystem.writeAsStringAsync(sigPath, base64Data, { encoding: FileSystem.EncodingType.Base64 });
                processedSignature = sigPath; // uploadFile no completeOrder vai lidar com isso
            } catch (e) {
                console.error('[Sync] Falha ao converter assinatura:', e);
            }
        }

        // 4. Chamar completeOrder — exatamente como o modo online
        await OrderService.completeOrder(orderId, {
            technicalReport: payload.technical_report || '',
            partsUsed: payload.parts_used || '',
            photos: processedExtraPhotos,
            signature: processedSignature,
            formData: finalFormData,
            clientName: payload.clientName,
            clientDoc: payload.clientDoc,
            tenantId: tenantId,
        });

        console.log(`[Sync] OS ${orderId} sincronizada com sucesso via completeOrder.`);
    }

    // ========== Listeners ========== //

    subscribe(callback: (queue: SyncTask[]) => void) {
        this.subscribers.push(callback);
        this.getQueue().then(callback); // initial state
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    private notifySubscribers(queue: SyncTask[]) {
        this.subscribers.forEach(cb => cb(queue));
    }

    private startListening() {
        if (!this.unsubscribeNetInfo) {
            this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
                if (state.isConnected && this.offlineModeEnabled) {
                    this.triggerSync();
                }
            });
        }
    }

    private stopListening() {
        if (this.unsubscribeNetInfo) {
            this.unsubscribeNetInfo();
            this.unsubscribeNetInfo = null;
        }
    }

    // ========== Security ========== //
    async clearAllData() {
        await AsyncStorage.removeItem(SYNC_QUEUE_KEY);
        await AsyncStorage.removeItem(OFFLINE_CACHE_KEY);
        this.notifySubscribers([]);
    }

    // ========== Global Cache Methods ========== //
    async saveOfflineCache(key: string, data: any) {
        if (!this.offlineModeEnabled) return;
        try {
            const existingRaw = await AsyncStorage.getItem(OFFLINE_CACHE_KEY) || '{}';
            const existing = JSON.parse(existingRaw);
            existing[key] = { data, timestamp: Date.now() };
            await AsyncStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(existing));
        } catch (e) { }
    }

    async getOfflineCache(key: string) {
        try {
            const raw = await AsyncStorage.getItem(OFFLINE_CACHE_KEY);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed[key]?.data || null;
        } catch (e) {
            return null;
        }
    }

    // ========== Offline Today Orders Cache ========== //

    /** Salva lista de OS do dia no AsyncStorage para uso offline */
    async saveTodayOrders(orders: any[]) {
        try {
            await AsyncStorage.setItem(OFFLINE_ORDERS_KEY, JSON.stringify({ orders, timestamp: Date.now() }));
        } catch (e) { console.error('[Sync] Erro ao salvar OS do dia:', e); }
    }

    async getTodayOrders(): Promise<any[]> {
        try {
            const raw = await AsyncStorage.getItem(OFFLINE_ORDERS_KEY);
            if (!raw) return [];
            return JSON.parse(raw).orders || [];
        } catch (e) { return []; }
    }

    /** Salva detalhes completos de uma OS (incluindo equipamentos e formulários) */
    async saveOrderDetail(orderId: string, data: any) {
        try {
            await AsyncStorage.setItem(OFFLINE_ORDER_DETAIL_PREFIX + orderId, JSON.stringify(data));
        } catch (e) { console.error('[Sync] Erro ao salvar detalhe da OS:', e); }
    }

    async getOrderDetail(orderId: string): Promise<any | null> {
        try {
            const raw = await AsyncStorage.getItem(OFFLINE_ORDER_DETAIL_PREFIX + orderId);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    /**
     * Pré-carrega todas as OS do dia atual + detalhes de cada uma.
     * Chamado ao ativar o modo offline.
     */
    async prefetchTodayOrders(onProgress?: (current: number, total: number) => void): Promise<number> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id;
            if (!userId) return 0;

            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            const todayStr = `${y}-${m}-${d}`;

            // Buscar OS do dia (status abertos + em andamento)
            const { data: ordersRaw, error } = await supabase
                .from('orders')
                .select('*')
                .eq('assigned_to', userId)
                .gte('scheduled_date', todayStr)
                .lte('scheduled_date', todayStr)
                .not('status', 'in', '("CONCLUÍDO","CANCELADO")')
                .limit(100);

            // Também buscar OS em andamento (qualquer data)
            const { data: inProgressRaw } = await supabase
                .from('orders')
                .select('*')
                .eq('assigned_to', userId)
                .in('status', ['EM ANDAMENTO', 'EM DESLOCAMENTO', 'ATRIBUÍDO'])
                .limit(50);

            if (error) throw error;

            // Merge e deduplicar
            const allOrdersMap = new Map<string, any>();
            [...(ordersRaw || []), ...(inProgressRaw || [])].forEach(o => allOrdersMap.set(o.id, o));
            const allOrders = Array.from(allOrdersMap.values());

            await this.saveTodayOrders(allOrders);

            // Buscar detalhes + equipamentos de cada OS
            const total = allOrders.length;
            for (let i = 0; i < allOrders.length; i++) {
                const order = allOrders[i];
                try {
                    const { data: equipmentsData } = await supabase.rpc('nexus_get_order_equipments', { p_order_id: order.id });
                    const equipmentsList = Array.isArray(equipmentsData) ? equipmentsData : (equipmentsData ? [equipmentsData] : []);
                    await this.saveOrderDetail(order.id, { ...order, equipments: equipmentsList });
                } catch (e) {
                    await this.saveOrderDetail(order.id, { ...order, equipments: [] });
                }
                if (onProgress) onProgress(i + 1, total);
            }

            console.log(`[Sync] Pré-cache offline: ${allOrders.length} OS salvas.`);

            // Pré-aquecer configurações usadas na tela de execução
            // Usar OrderService para popular o AsyncStorage com as chaves corretas
            try {
                const { OrderService } = await import('./order-service');
                await Promise.all([
                    OrderService.getFormTemplates(),
                    OrderService.getActivationRules(),
                    OrderService.getServiceTypes(),
                ]);
            } catch (_) { /* silencioso */ }

            return allOrders.length;

        } catch (e) {
            console.error('[Sync] Erro no prefetch de OS:', e);
            return 0;
        }
    }
}

export const syncService = new SyncService();
