import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';

const OFFLINE_ORDERS_KEY = '@nexus_offline_today_orders';
const OFFLINE_ORDER_DETAIL_PREFIX = '@nexus_offline_order_';

export interface SyncTask {
    id: string;
    type: 'complete_os' | 'block_os';
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
    private syncingSubscribers: ((syncing: boolean) => void)[] = [];
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
            // Garantir que a UI atualize mesmo se a fila já estava vazia
            this.notifySyncingSubscribers(false);
            const queue = await this.getQueue();
            this.notifySubscribers(queue);
        }
    }

    /**
     * Tests if the internet connection is stable enough to upload data.
     * Does a real round-trip to Supabase (lightweight heartbeat query).
     * Returns true if connection is good, false otherwise.
     */
    async testConnectionQuality(): Promise<boolean> {
        try {
            const netState = await NetInfo.fetch();
            if (!netState.isConnected) return false;

            // Real round-trip test: a lightweight query to Supabase
            const start = Date.now();
            const { error } = await supabase.from('tenants').select('id', { count: 'exact', head: true }).limit(1);
            const elapsed = Date.now() - start;

            if (error) {
                console.log('[Sync] Connection test failed (query error):', error.message);
                return false;
            }

            // If the round-trip took more than 10 seconds, consider connection unstable
            if (elapsed > 10000) {
                console.log(`[Sync] Connection test: too slow (${elapsed}ms)`);
                return false;
            }

            console.log(`[Sync] Connection test passed (${elapsed}ms)`);
            return true;
        } catch (e) {
            console.error('[Sync] Connection test exception:', e);
            return false;
        }
    }

    /**
     * Attempts to sync all pending tasks. Returns { success, failed, total }.
     * On failure, tasks remain in the queue (cache preserved).
     */
    async safeSyncBeforeOnline(): Promise<{ success: number; failed: number; total: number }> {
        const queue = await this.getQueue();
        const pendingTasks = queue.filter(t => t.status === 'pending' || t.status === 'error');

        if (pendingTasks.length === 0) {
            return { success: 0, failed: 0, total: 0 };
        }

        this.isSyncing = true;
        this.notifySyncingSubscribers(true);

        let success = 0;
        let failed = 0;

        for (const task of pendingTasks) {
            await this.updateTaskStatus(task.id, 'syncing');
            try {
                if (task.type === 'complete_os') {
                    await this.syncCompleteOS(task);
                } else if (task.type === 'block_os') {
                    await this.syncBlockOS(task);
                }
                // Only remove from queue after confirmed success
                await this.removeFromQueue(task.id);
                success++;
                console.log(`[Sync] Task ${task.id} synced successfully.`);
            } catch (error: any) {
                failed++;
                console.error(`[Sync] Task ${task.id} failed:`, error);
                // Keep in queue with error status - cache preserved
                await this.updateTaskStatus(task.id, 'error', error.message);
            }
        }

        this.isSyncing = false;
        this.notifySyncingSubscribers(false);

        return { success, failed, total: pendingTasks.length };
    }

    isOfflineModeEnabled() {
        return this.offlineModeEnabled;
    }

    // ========== Queue Management ========== //

    async getQueue(): Promise<SyncTask[]> {
        try {
            const data = await AsyncStorage.getItem(SYNC_QUEUE_KEY);
            if (!data) return [];
            const docDir = FileSystem.documentDirectory || '';
            const restored = data.split('<DOC_DIR>').join(docDir);
            return JSON.parse(restored);
        } catch (e) {
            console.error('[Sync] Erro ao ler fila:', e);
            return [];
        }
    }

    private async saveQueue(queue: SyncTask[]) {
        try {
            const docDir = FileSystem.documentDirectory || '';
            const safeQueueString = JSON.stringify(queue).split(docDir).join('<DOC_DIR>');
            await AsyncStorage.setItem(SYNC_QUEUE_KEY, safeQueueString);
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
        let updatedPayloadString = JSON.stringify(newTask.payload);
        if (newTask.localPhotos && newTask.localPhotos.length > 0) {
            const safePhotos = [];
            for (const uri of newTask.localPhotos) {
                if (uri.startsWith('file://')) {
                    const filename = uri.split('/').pop();
                    const newPath = FileSystem.documentDirectory + 'offline_' + filename;
                    await FileSystem.copyAsync({ from: uri, to: newPath }).catch(() => {});
                    safePhotos.push(newPath);
                    // Update all references in the payload to point to the safe copy
                    updatedPayloadString = updatedPayloadString.split(uri).join(newPath);
                } else if (uri.startsWith('data:image')) {
                    // Signature base64, keep it as is
                    safePhotos.push(uri);
                }
            }
            newTask.localPhotos = safePhotos;
            newTask.payload = JSON.parse(updatedPayloadString);
        }

        queue.push(newTask);
        await this.saveQueue(queue);

        // Notify user implicitly through badge update
        // NOTE: Sync will only happen when user toggles back to online mode
        console.log('[Sync] Tarefa adicionada à fila offline. Será sincronizada ao voltar para modo online.');
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
        this.notifySyncingSubscribers(true);
        console.log(`[Sync] Iniciando sincronização de ${pendingTasks.length} itens...`);

        for (const task of pendingTasks) {
            await this.updateTaskStatus(task.id, 'syncing');
            try {
                if (task.type === 'complete_os') {
                    await this.syncCompleteOS(task);
                } else if (task.type === 'block_os') {
                    await this.syncBlockOS(task);
                }
                await this.removeFromQueue(task.id);
                console.log(`[Sync] Tarefa ${task.id} sincronizada com sucesso.`);
            } catch (error: any) {
                console.error(`[Sync] Falha na tarefa ${task.id}:`, error);
                await this.updateTaskStatus(task.id, 'error', error.message);
            }
        }

        this.isSyncing = false;
        this.notifySyncingSubscribers(false);
        console.log('[Sync] Sincronização concluída.');
    }

    private async syncCompleteOS(task: SyncTask) {
        const { orderId, payload } = task;
        const { OrderService } = require('./order-service');

        const tenantId = payload.tenantId;

        // Tentar obter o displayId (código legível da OS) para salvar os arquivos com a nomenclatura nova
        let targetFolderId = orderId;
        try {
            const dbOrder = await OrderService.getOrderById(orderId);
            if (dbOrder?.displayId) targetFolderId = dbOrder.displayId;
        } catch (e) {
            console.warn('[Sync] Could not fetch DB order for displayId, defaulting to orderId');
        }

        const isLocalPath = (str: any): boolean => {
            if (typeof str !== 'string') return false;
            const s = str.trim();
            if (!s || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return false;
            return (
                s.startsWith('file://') ||
                s.startsWith('/var/') ||
                s.startsWith('/private/') ||
                s.includes('/Containers/') ||
                s.includes('/Library/') ||
                s.includes('/Caches/') ||
                s.includes('/Camera/') ||
                (FileSystem.documentDirectory && s.startsWith(FileSystem.documentDirectory))
            );
        };

        // 1. Processar fotos extras — substituir file:// ou rotas locais por URLs remotas
        const processedExtraPhotos: string[] = [];
        if (payload.extraPhotos && Array.isArray(payload.extraPhotos)) {
            for (const uri of payload.extraPhotos) {
                if (isLocalPath(uri)) {
                    try {
                        const url = await OrderService.uploadFile(uri, `orders/${targetFolderId}/extra_photos`, tenantId);
                        if (url) processedExtraPhotos.push(url);
                    } catch (e) { console.error('[Sync] Falha foto extra:', e); }
                } else {
                    processedExtraPhotos.push(uri);
                }
            }
        }

        // 2. UPLOAD DE MÍDIAS DENTRO DOS FORMULÁRIOS DINÂMICOS
        const finalFormData: Record<string, any> = payload.formData || {};
        for (const key of Object.keys(finalFormData)) {
            let value = finalFormData[key];
            if (Array.isArray(value)) {
                const uploadedUrls: string[] = [];
                for (const item of value) {
                    if (isLocalPath(item)) {
                        try {
                            const isVideo = item.toLowerCase().endsWith('.mov') || item.toLowerCase().endsWith('.mp4');
                            const url = await OrderService.uploadFile(item, `orders/${targetFolderId}/${isVideo ? 'videos' : 'form_photos'}`, tenantId, isVideo ? 'video/mp4' : undefined);
                            if (url) uploadedUrls.push(url);
                            else uploadedUrls.push(item);
                        } catch (e) {
                            console.error('[Sync] Falha foto/vídeo form:', e);
                            uploadedUrls.push(item);
                        }
                    } else {
                        uploadedUrls.push(item);
                    }
                }
                finalFormData[key] = uploadedUrls;
            } else if (typeof value === 'string') {
                const urls = value.split(',').map(u => u.trim()).filter(Boolean);
                const hasLocalFiles = urls.some(u => isLocalPath(u));
                
                if (hasLocalFiles) {
                    const uploadedUrls: string[] = [];
                    for (const item of urls) {
                        if (isLocalPath(item)) {
                            try {
                                const isVideo = item.toLowerCase().endsWith('.mov') || item.toLowerCase().endsWith('.mp4');
                                const url = await OrderService.uploadFile(item, `orders/${targetFolderId}/${isVideo ? 'videos' : 'form_photos'}`, tenantId, isVideo ? 'video/mp4' : undefined);
                                if (url) uploadedUrls.push(url);
                                else uploadedUrls.push(item);
                            } catch (e) {
                                console.error('[Sync] Falha foto/vídeo form:', e);
                                uploadedUrls.push(item);
                            }
                        } else {
                            uploadedUrls.push(item);
                        }
                    }
                    finalFormData[key] = uploadedUrls.join(',');
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

        // 4. Processar videoUrls locais, se houver (agora suporta múltiplos separados por vírgula)
        let processedVideoUrl = payload.videoUrl || null;
        if (processedVideoUrl && typeof processedVideoUrl === 'string') {
            const urls = processedVideoUrl.split(',').map(u => u.trim()).filter(Boolean);
            const uploadedUrls: string[] = [];
            for (const vUri of urls) {
                if (vUri.startsWith('file://') || (FileSystem.documentDirectory && vUri.startsWith(FileSystem.documentDirectory))) {
                    try {
                        const url = await OrderService.uploadFile(vUri, `orders/${targetFolderId}/videos`, tenantId, 'video/mp4');
                        if (url) uploadedUrls.push(url);
                        else uploadedUrls.push(vUri);
                    } catch (e) {
                        console.error('[Sync] Falha upload de vídeo:', e);
                        uploadedUrls.push(vUri);
                    }
                } else {
                    uploadedUrls.push(vUri);
                }
            }
            processedVideoUrl = uploadedUrls.length > 0 ? uploadedUrls.join(',') : null;
        }

        await OrderService.completeOrder(orderId, {
            technicalReport: payload.technical_report || '',
            partsUsed: payload.parts_used || '',
            photos: processedExtraPhotos,
            signature: processedSignature,
            videoUrl: processedVideoUrl, // <-- Added here
            formData: finalFormData,
            clientName: payload.clientName,
            clientDoc: payload.clientDoc,
            tenantId: tenantId,
            items: payload.usedItems
        });

        console.log(`[Sync] OS ${orderId} sincronizada com sucesso via completeOrder.`);
    }

    private async syncBlockOS(task: SyncTask) {
        const { orderId, payload } = task;
        const { OrderService } = require('./order-service');
        const tenantId = payload.tenantId;

        let targetFolderId = orderId;
        try {
            const dbOrder = await OrderService.getOrderById(orderId);
            if (dbOrder?.displayId) targetFolderId = dbOrder.displayId;
        } catch (e) {
            console.warn('[Sync] Could not fetch DB order for displayId, defaulting to orderId');
        }

        const processedBlockPhotos: string[] = [];
        if (payload.blockPhotoUrls && Array.isArray(payload.blockPhotoUrls)) {
            for (const uri of payload.blockPhotoUrls) {
                if (typeof uri === 'string' && (uri.startsWith('file://') || (FileSystem.documentDirectory && uri.startsWith(FileSystem.documentDirectory)))) {
                    try {
                        const url = await OrderService.uploadFile(uri, `orders/${targetFolderId}/block_photos`, tenantId);
                        if (url) processedBlockPhotos.push(url);
                    } catch (e) { console.error('[Sync] Falha foto block:', e); }
                } else {
                    processedBlockPhotos.push(uri);
                }
            }
        }

        let processedVideoUrl = payload.videoUrl || null;
        if (processedVideoUrl && typeof processedVideoUrl === 'string') {
            const urls = processedVideoUrl.split(',').map(u => u.trim()).filter(Boolean);
            const uploadedUrls: string[] = [];
            for (const vUri of urls) {
                if (vUri.startsWith('file://') || vUri.startsWith('/var/') || vUri.startsWith('/private/') || (FileSystem.documentDirectory && vUri.startsWith(FileSystem.documentDirectory))) {
                    try {
                        const url = await OrderService.uploadFile(vUri, `orders/${targetFolderId}/videos`, tenantId, 'video/mp4');
                        if (url) uploadedUrls.push(url);
                        // NÃO adiciona URI local como fallback — LAST-GATE no OrderService tratará
                        else console.warn(`[Sync] ⚠️ Upload de vídeo retornou null, será tratado pelo LAST-GATE: ${vUri.substring(0, 50)}`);
                    } catch (e) {
                        console.warn(`[Sync] ⚠️ Falha no upload de vídeo, será tratado pelo LAST-GATE: ${vUri.substring(0, 50)}`);
                        // NÃO adiciona URI local como fallback
                    }
                } else {
                    uploadedUrls.push(vUri);
                }
            }
            processedVideoUrl = uploadedUrls.length > 0 ? uploadedUrls.join(',') : null;
        }

        const finalFormData = payload.additionalData?.formData || {};
        if (processedVideoUrl) {
            finalFormData.video_url = processedVideoUrl;
        }

        // 3.5 UPLOAD DE MÍDIAS DENTRO DOS FORMULÁRIOS DINÂMICOS (Fotos/Vídeos nos templates de impedimento)
        for (const key of Object.keys(finalFormData)) {
            let value = finalFormData[key];
            if (Array.isArray(value)) {
                const uploadedUrls: string[] = [];
                for (const item of value) {
                    if (typeof item === 'string' && (item.startsWith('file://') || item.startsWith('/var/') || item.startsWith('/private/') || (FileSystem.documentDirectory && item.startsWith(FileSystem.documentDirectory)))) {
                        try {
                            const isVideo = item.toLowerCase().endsWith('.mov') || item.toLowerCase().endsWith('.mp4');
                            const url = await OrderService.uploadFile(item, `orders/${targetFolderId}/${isVideo ? 'videos' : 'form_photos'}`, tenantId, isVideo ? 'video/mp4' : undefined);
                            if (url) uploadedUrls.push(url);
                            // NÃO adiciona URI local como fallback
                            else console.warn('[Sync] ⚠️ Upload de mídia do form retornou null, será tratado pelo LAST-GATE');
                        } catch (e) {
                            console.error('[Sync] Falha foto/vídeo form impedido:', e);
                            // NÃO adiciona URI local como fallback
                        }
                    } else {
                        uploadedUrls.push(item);
                    }
                }
                finalFormData[key] = uploadedUrls;
            } else if (typeof value === 'string') {
                const urls = value.split(',').map(u => u.trim()).filter(Boolean);
                const hasLocalFiles = urls.some(u => u.startsWith('file://') || (FileSystem.documentDirectory && u.startsWith(FileSystem.documentDirectory)));
                
                if (hasLocalFiles) {
                    const uploadedUrls: string[] = [];
                    for (const item of urls) {
                        if (item.startsWith('file://') || item.startsWith('/var/') || item.startsWith('/private/') || (FileSystem.documentDirectory && item.startsWith(FileSystem.documentDirectory))) {
                            try {
                                const isVideo = item.toLowerCase().endsWith('.mov') || item.toLowerCase().endsWith('.mp4');
                                const url = await OrderService.uploadFile(item, `orders/${targetFolderId}/${isVideo ? 'videos' : 'form_photos'}`, tenantId, isVideo ? 'video/mp4' : undefined);
                                if (url) uploadedUrls.push(url);
                                // NÃO adiciona URI local como fallback
                                else console.warn('[Sync] ⚠️ Upload de mídia string-split retornou null, será tratado pelo LAST-GATE');
                            } catch (e) {
                                console.error('[Sync] Falha foto/vídeo form impedido:', e);
                                // NÃO adiciona URI local como fallback
                            }
                        } else {
                            uploadedUrls.push(item);
                        }
                    }
                    finalFormData[key] = uploadedUrls.join(',');
                }
            }
        }

        await OrderService.blockOrder(orderId, payload.reason, processedBlockPhotos.length > 0 ? processedBlockPhotos : null, { formData: finalFormData, items: payload.additionalData?.items });
        console.log(`[Sync] OS ${orderId} bloqueada com sucesso via blockOrder.`);
    }

    // ========== Listeners ========== //

    subscribe(callback: (queue: SyncTask[]) => void) {
        this.subscribers.push(callback);
        this.getQueue().then(callback); // initial state
        return () => {
            this.subscribers = this.subscribers.filter(cb => cb !== callback);
        };
    }

    /** Escuta mudanças no estado de sincronização (isSyncing true/false) */
    subscribeSyncing(callback: (syncing: boolean) => void) {
        this.syncingSubscribers.push(callback);
        return () => {
            this.syncingSubscribers = this.syncingSubscribers.filter(cb => cb !== callback);
        };
    }

    getSyncingState() { return this.isSyncing; }

    private notifySubscribers(queue: SyncTask[]) {
        this.subscribers.forEach(cb => cb(queue));
    }

    private notifySyncingSubscribers(syncing: boolean) {
        this.syncingSubscribers.forEach(cb => cb(syncing));
    }

    private startListening() {
        if (!this.unsubscribeNetInfo) {
            this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
                // Only monitor connection state - do NOT auto-sync
                // Sync will only happen when user explicitly toggles offline mode off
                if (state.isConnected && this.offlineModeEnabled) {
                    console.log('[Sync] Conexão detectada, mas sync aguardando mudança manual para modo online.');
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
                .select('*, customers(*)')
                .eq('assigned_to', userId)
                .gte('scheduled_date', todayStr)
                .lte('scheduled_date', todayStr)
                .not('status', 'in', '("CONCLUÍDO","CANCELADO","IMPEDIDO")')
                .order('scheduled_date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(20);

            // Também buscar OS em andamento (qualquer data)
            const { data: inProgressRaw } = await supabase
                .from('orders')
                .select('*, customers(*)')
                .eq('assigned_to', userId)
                .in('status', ['EM ANDAMENTO', 'EM DESLOCAMENTO', 'ATRIBUÍDO'])
                .order('scheduled_date', { ascending: false })
                .order('created_at', { ascending: false })
                .limit(20);

            if (error) throw error;

            // Merge e deduplicar, limitando a 20 no total para não travar o app
            const allOrdersMap = new Map<string, any>();
            [...(inProgressRaw || []), ...(ordersRaw || [])].forEach(o => allOrdersMap.set(o.id, o));
            const allOrders = Array.from(allOrdersMap.values()).slice(0, 20);

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
                const { OrderService } = require('./order-service');
                const { StockService } = require('./stock-service');
                await Promise.all([
                    OrderService.getFormTemplates(),
                    OrderService.getActivationRules(),
                    OrderService.getServiceTypes(),
                    StockService.getMyStock(true), // Pre-cache user stock for offline mode
                ]);
            } catch (e) { console.error('[Sync] Falha ao pré-aquecer cache:', e); }

            return allOrders.length;

        } catch (e) {
            console.error('[Sync] Erro no prefetch de OS:', e);
            return 0;
        }
    }
}

export const syncService = new SyncService();
