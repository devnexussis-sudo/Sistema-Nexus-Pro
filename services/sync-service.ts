import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { resilientUpload } from './upload-resilient';

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
        resilientUpload.setForcedOfflineMode(this.offlineModeEnabled);
        this.startListening();

        if (!this.offlineModeEnabled) {
            resilientUpload.resumeAll().catch(() => {});
            this.triggerSync(false).catch(() => {});
        }
    }

    async toggleOfflineMode(enabled: boolean) {
        this.offlineModeEnabled = enabled;
        resilientUpload.setForcedOfflineMode(enabled);
        await AsyncStorage.setItem(APP_OFFLINE_MODE_KEY, enabled ? 'true' : 'false');
        this.startListening();

        if (!enabled) {
            // Modo Online ativado: disparar imediatamente a fila de uploads R2 e tarefas pendentes
            resilientUpload.resumeAll().catch(() => {});
            this.triggerSync(true).catch(() => {});
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
        // Liberar motor de upload resiliente para R2 antes de sincronizar as OSs
        resilientUpload.setForcedOfflineMode(false);
        await resilientUpload.resumeAll();
        await resilientUpload.waitForActiveUploads(15000);

        const queue = await this.getQueue();
        const pendingTasks = queue.filter(t => t.status === 'pending' || t.status === 'error');

        if (pendingTasks.length === 0) {
            return { success: 0, failed: 0, total: 0 };
        }

        this.isSyncing = true;
        this.notifySyncingSubscribers(true);

        let success = 0;
        let failed = 0;

        try {
            const stats = resilientUpload.getStats();
            if (stats.pending > 0 || stats.uploading > 0) {
                await resilientUpload.waitForActiveUploads(4000);
            }

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
        } finally {
            this.isSyncing = false;
            this.notifySyncingSubscribers(false);
        }

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

        console.log('[Sync] Tarefa adicionada à fila offline.');
        if (!this.offlineModeEnabled) {
            // Se está no modo Online mas caiu na fila por oscilação momentânea da internet, tenta sincronizar assim que possível
            this.triggerSync(false).catch(() => {});
        }
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
        // Se estiver em Modo Offline manual e não foi forçado, aguarda ativar Modo Online
        if (!force && this.offlineModeEnabled) return;

        const state = await NetInfo.fetch();
        if (!state.isConnected || state.isInternetReachable === false) return;

        // Garantir que uploads de mídia pendentes no ResilientUploadService subam
        resilientUpload.resumeAll().catch(() => {});

        const queue = await this.getQueue();
        const pendingTasks = queue.filter(t => t.status === 'pending' || t.status === 'error');

        if (pendingTasks.length === 0) return;

        this.isSyncing = true;
        this.notifySyncingSubscribers(true);
        console.log(`[Sync] Iniciando sincronização de ${pendingTasks.length} itens...`);

        try {
            const stats = resilientUpload.getStats();
            if (stats.pending > 0 || stats.uploading > 0) {
                await resilientUpload.waitForActiveUploads(4000);
            }

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
        } finally {
            this.isSyncing = false;
            this.notifySyncingSubscribers(false);
            console.log('[Sync] Sincronização concluída.');
        }
    }

    private async syncCompleteOS(task: SyncTask) {
        const { orderId, payload } = task;
        const { OrderService } = require('./order-service');

        const tenantId = payload.tenantId;

        // Tentar obter o displayId (código legível da OS) direto do payload ou cache local sem requisição de rede
        let targetFolderId = payload.displayId || orderId;
        if (targetFolderId === orderId) {
            try {
                const cached = await this.getOrderDetail(orderId);
                if (cached?.displayId) targetFolderId = cached.displayId;
            } catch (_) { }
        }

        const isLocalPath = (str: any): boolean => {
            if (typeof str !== 'string') return false;
            const s = str.trim();
            if (!s || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return false;
            return Boolean(
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

        // 1. Processar fotos extras em paralelo — substituir file:// ou rotas locais por URLs remotas
        let processedExtraPhotos: string[] = [];
        if (payload.extraPhotos && Array.isArray(payload.extraPhotos)) {
            const results = await Promise.all(
                payload.extraPhotos.map(async (uri: string) => {
                    if (isLocalPath(uri)) {
                        const existingUrl = resilientUpload.getCompletedUrl(uri);
                        if (existingUrl) return existingUrl;
                        try {
                            const url = await OrderService.uploadFile(uri, `orders/${targetFolderId}/extra_photos`, tenantId);
                            return url || null;
                        } catch (e) {
                            console.error('[Sync] Falha foto extra:', e);
                            return null;
                        }
                    }
                    return uri;
                })
            );
            processedExtraPhotos = results.filter((u): u is string => !!u);
        }

        // 2. UPLOAD DE MÍDIAS DENTRO DOS FORMULÁRIOS DINÂMICOS (em paralelo)
        const finalFormData: Record<string, any> = payload.formData || {};
        await Promise.all(
            Object.keys(finalFormData).map(async (key) => {
                const value = finalFormData[key];
                if (Array.isArray(value)) {
                    const uploadedUrls = await Promise.all(
                        value.map(async (item: any) => {
                            if (isLocalPath(item)) {
                                const existingUrl = resilientUpload.getCompletedUrl(item);
                                if (existingUrl) return existingUrl;
                                try {
                                    const isVideo = item.toLowerCase().endsWith('.mov') || item.toLowerCase().endsWith('.mp4');
                                    const url = await OrderService.uploadFile(item, `orders/${targetFolderId}/${isVideo ? 'videos' : 'form_photos'}`, tenantId, isVideo ? 'video/mp4' : undefined);
                                    return url || item;
                                } catch (e) {
                                    console.error('[Sync] Falha foto/vídeo form:', e);
                                    return item;
                                }
                            }
                            return item;
                        })
                    );
                    finalFormData[key] = uploadedUrls;
                } else if (typeof value === 'string') {
                    const urls = value.split(',').map(u => u.trim()).filter(Boolean);
                    const hasLocalFiles = urls.some(u => isLocalPath(u));
                    if (hasLocalFiles) {
                        const uploadedUrls = await Promise.all(
                            urls.map(async (item) => {
                                if (isLocalPath(item)) {
                                    const existingUrl = resilientUpload.getCompletedUrl(item);
                                    if (existingUrl) return existingUrl;
                                    try {
                                        const isVideo = item.toLowerCase().endsWith('.mov') || item.toLowerCase().endsWith('.mp4');
                                        const url = await OrderService.uploadFile(item, `orders/${targetFolderId}/${isVideo ? 'videos' : 'form_photos'}`, tenantId, isVideo ? 'video/mp4' : undefined);
                                        return url || item;
                                    } catch (e) {
                                        console.error('[Sync] Falha foto/vídeo form:', e);
                                        return item;
                                    }
                                }
                                return item;
                            })
                        );
                        finalFormData[key] = uploadedUrls.join(',');
                    }
                }
            })
        );

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

        // 4. Processar videoUrls locais em paralelo (suporta múltiplos separados por vírgula)
        let processedVideoUrl = payload.videoUrl || null;
        if (processedVideoUrl && typeof processedVideoUrl === 'string') {
            const urls = processedVideoUrl.split(',').map(u => u.trim()).filter(Boolean);
            const uploadedUrls = await Promise.all(
                urls.map(async (vUri) => {
                    if (vUri.startsWith('file://') || (FileSystem.documentDirectory && vUri.startsWith(FileSystem.documentDirectory))) {
                        const existingUrl = resilientUpload.getCompletedUrl(vUri);
                        if (existingUrl) return existingUrl;
                        try {
                            const url = await OrderService.uploadFile(vUri, `orders/${targetFolderId}/videos`, tenantId, 'video/mp4');
                            return url || vUri;
                        } catch (e) {
                            console.error('[Sync] Falha upload de vídeo:', e);
                            return vUri;
                        }
                    }
                    return vUri;
                })
            );
            processedVideoUrl = uploadedUrls.length > 0 ? uploadedUrls.join(',') : null;
        }

        await OrderService.completeOrder(orderId, {
            technicalReport: payload.technical_report || '',
            partsUsed: payload.parts_used || '',
            photos: processedExtraPhotos,
            signature: processedSignature,
            videoUrl: processedVideoUrl,
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

        let targetFolderId = payload.displayId || orderId;
        if (targetFolderId === orderId) {
            try {
                const cached = await this.getOrderDetail(orderId);
                if (cached?.displayId) targetFolderId = cached.displayId;
            } catch (_) { }
        }

        let processedBlockPhotos: string[] = [];
        if (payload.blockPhotoUrls && Array.isArray(payload.blockPhotoUrls)) {
            const results = await Promise.all(
                payload.blockPhotoUrls.map(async (uri: string) => {
                    if (typeof uri === 'string' && (uri.startsWith('file://') || (FileSystem.documentDirectory && uri.startsWith(FileSystem.documentDirectory)))) {
                        const existingUrl = resilientUpload.getCompletedUrl(uri);
                        if (existingUrl) return existingUrl;
                        try {
                            const url = await OrderService.uploadFile(uri, `orders/${targetFolderId}/block_photos`, tenantId);
                            return url || null;
                        } catch (e) {
                            console.error('[Sync] Falha foto block:', e);
                            return null;
                        }
                    }
                    return uri;
                })
            );
            processedBlockPhotos = results.filter((u): u is string => !!u);
        }

        let processedVideoUrl = payload.videoUrl || null;
        if (processedVideoUrl && typeof processedVideoUrl === 'string') {
            const urls = processedVideoUrl.split(',').map(u => u.trim()).filter(Boolean);
            const results = await Promise.all(
                urls.map(async (vUri) => {
                    if (vUri.startsWith('file://') || vUri.startsWith('/var/') || vUri.startsWith('/private/') || (FileSystem.documentDirectory && vUri.startsWith(FileSystem.documentDirectory))) {
                        const existingUrl = resilientUpload.getCompletedUrl(vUri);
                        if (existingUrl) return existingUrl;
                        try {
                            const url = await OrderService.uploadFile(vUri, `orders/${targetFolderId}/videos`, tenantId, 'video/mp4');
                            return url || null;
                        } catch (e) {
                            console.warn(`[Sync] ⚠️ Falha no upload de vídeo, será tratado pelo LAST-GATE: ${vUri.substring(0, 50)}`);
                            return null;
                        }
                    }
                    return vUri;
                })
            );
            const uploadedUrls = results.filter((u): u is string => !!u);
            processedVideoUrl = uploadedUrls.length > 0 ? uploadedUrls.join(',') : null;
        }

        const finalFormData = payload.additionalData?.formData || {};
        if (processedVideoUrl) {
            finalFormData.video_url = processedVideoUrl;
        }

        // 3.5 UPLOAD DE MÍDIAS DENTRO DOS FORMULÁRIOS DINÂMICOS em paralelo
        await Promise.all(
            Object.keys(finalFormData).map(async (key) => {
                const value = finalFormData[key];
                if (Array.isArray(value)) {
                    const results = await Promise.all(
                        value.map(async (item: any) => {
                            if (typeof item === 'string' && (item.startsWith('file://') || item.startsWith('/var/') || item.startsWith('/private/') || (FileSystem.documentDirectory && item.startsWith(FileSystem.documentDirectory)))) {
                                try {
                                    const isVideo = item.toLowerCase().endsWith('.mov') || item.toLowerCase().endsWith('.mp4');
                                    const url = await OrderService.uploadFile(item, `orders/${targetFolderId}/${isVideo ? 'videos' : 'form_photos'}`, tenantId, isVideo ? 'video/mp4' : undefined);
                                    return url || null;
                                } catch (e) {
                                    console.error('[Sync] Falha foto/vídeo form impedido:', e);
                                    return null;
                                }
                            }
                            return item;
                        })
                    );
                    finalFormData[key] = results.filter(Boolean);
                } else if (typeof value === 'string') {
                    const urls = value.split(',').map(u => u.trim()).filter(Boolean);
                    const hasLocalFiles = urls.some(u => u.startsWith('file://') || (FileSystem.documentDirectory && u.startsWith(FileSystem.documentDirectory)));
                    if (hasLocalFiles) {
                        const results = await Promise.all(
                            urls.map(async (item) => {
                                if (item.startsWith('file://') || item.startsWith('/var/') || item.startsWith('/private/') || (FileSystem.documentDirectory && item.startsWith(FileSystem.documentDirectory))) {
                                    try {
                                        const isVideo = item.toLowerCase().endsWith('.mov') || item.toLowerCase().endsWith('.mp4');
                                        const url = await OrderService.uploadFile(item, `orders/${targetFolderId}/${isVideo ? 'videos' : 'form_photos'}`, tenantId, isVideo ? 'video/mp4' : undefined);
                                        return url || null;
                                    } catch (e) {
                                        console.error('[Sync] Falha foto/vídeo form impedido:', e);
                                        return null;
                                    }
                                }
                                return item;
                            })
                        );
                        finalFormData[key] = results.filter(Boolean).join(',');
                    }
                }
            })
        );

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
                const online = !!state.isConnected && state.isInternetReachable !== false;
                if (online) {
                    if (this.offlineModeEnabled) {
                        console.log('[Sync] Conexão detectada, mas sync aguardando mudança manual para modo online.');
                    } else {
                        // Modo Online ativo + Internet OK: sobe todos os anexos e tarefas pendentes imediatamente!
                        resilientUpload.resumeAll().catch(() => {});
                        this.triggerSync(false).catch(() => {});
                    }
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
    /**
     * Pré-carrega de forma completa e segura toda a base para o modo offline:
     * - Templates de formulários (com forceRefresh)
     * - Regras de ativação (com forceRefresh)
     * - Tipos de serviços (com forceRefresh)
     * - Configurações do tenant
     * - Estoque do técnico
     * - TODAS as OSs ativas/abertas atribuídas ao técnico + detalhes + equipamentos
     * - Valida a integridade dos dados no disco antes de retornar
     */
    async prefetchAllForOffline(onProgress?: (current: number, total: number, stepLabel?: string) => void): Promise<{ count: number; templatesCount: number }> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id;
            if (!userId) throw new Error('Usuário não autenticado');

            if (onProgress) onProgress(0, 5, 'Baixando formulários e modelos...');

            const { OrderService, DISK_CACHE_FORM_TEMPLATES } = require('./order-service');
            const { StockService } = require('./stock-service');
            const { TenantService } = require('./tenant-service');

            // 1. Pré-carregar Formulários, Regras de Ativação, Tipos de Serviço, Configurações do Tenant e Estoque
            // Forçando busca na rede (forceRefresh=true) para garantir dados frescos no disco
            const [templates, rules, serviceTypes] = await Promise.all([
                OrderService.getFormTemplates(true).catch((e: any) => {
                    console.warn('[Sync] Falha ao baixar templates:', e);
                    return [];
                }),
                OrderService.getActivationRules(true).catch((e: any) => {
                    console.warn('[Sync] Falha ao baixar regras:', e);
                    return [];
                }),
                OrderService.getServiceTypes(true).catch((e: any) => {
                    console.warn('[Sync] Falha ao baixar tipos de serviço:', e);
                    return [];
                }),
                TenantService.getSettings(true).catch((e: any) => {
                    console.warn('[Sync] Falha ao baixar settings:', e);
                    return null;
                }),
                StockService.getMyStock(true).catch((e: any) => {
                    console.warn('[Sync] Falha ao baixar estoque:', e);
                    return [];
                })
            ]);

            console.log(`[Sync] Base offline baixada: ${templates?.length || 0} templates, ${rules?.length || 0} regras, ${serviceTypes?.length || 0} serviceTypes.`);

            if (onProgress) onProgress(1, 5, 'Buscando Ordens de Serviço atribuídas...');

            // 2. Buscar TODAS as OSs abertas/ativas atribuídas ao técnico (não apenas do dia de hoje)
            const { data: activeOrdersRaw, error: ordersError } = await supabase
                .from('orders')
                .select('*, customers(*)')
                .eq('assigned_to', userId)
                .not('status', 'in', '("CONCLUÍDO","CANCELADO")')
                .order('created_at', { ascending: false })
                .limit(50);

            if (ordersError) {
                console.error('[Sync] Erro ao buscar ordens ativas:', ordersError);
            }

            // Também buscar as agendadas para hoje (caso tenham status diferente)
            const today = new Date();
            const y = today.getFullYear();
            const m = String(today.getMonth() + 1).padStart(2, '0');
            const d = String(today.getDate()).padStart(2, '0');
            const todayStr = `${y}-${m}-${d}`;

            const { data: todayOrdersRaw } = await supabase
                .from('orders')
                .select('*, customers(*)')
                .eq('assigned_to', userId)
                .gte('scheduled_date', todayStr)
                .lte('scheduled_date', todayStr)
                .limit(30);

            // Merge e deduplicar
            const allOrdersMap = new Map<string, any>();
            [...(activeOrdersRaw || []), ...(todayOrdersRaw || [])].forEach(o => {
                if (o && o.id) allOrdersMap.set(o.id, o);
            });
            const allOrders = Array.from(allOrdersMap.values());

            console.log(`[Sync] Encontradas ${allOrders.length} OSs para cache offline.`);

            // 3. Buscar equipamentos e detalhes para cada OS encontrada
            const totalOrders = allOrders.length;
            for (let i = 0; i < totalOrders; i++) {
                const order = allOrders[i];
                if (onProgress) onProgress(i + 1, totalOrders, `Baixando OS ${i + 1}/${totalOrders} (${order.displayId || 'S/N'})...`);
                try {
                    const { data: equipmentsData } = await supabase.rpc('nexus_get_order_equipments', { p_order_id: order.id });
                    const equipmentsList = Array.isArray(equipmentsData) ? equipmentsData : (equipmentsData ? [equipmentsData] : []);
                    await this.saveOrderDetail(order.id, { ...order, equipments: equipmentsList });

                    // Se a OS ou algum equipamento apontar para um formId específico, assegurar que ele está em cache
                    if (order.formId && order.formId !== 'f-padrao') {
                        OrderService.getFormTemplate(order.formId).catch(() => {});
                    }
                    if (equipmentsList.length > 0) {
                        for (const eq of equipmentsList) {
                            if (eq.form_id && eq.form_id !== 'f-padrao') {
                                OrderService.getFormTemplate(eq.form_id).catch(() => {});
                            }
                        }
                    }
                } catch (e) {
                    await this.saveOrderDetail(order.id, { ...order, equipments: [] });
                }
            }

            // Salva a lista consolidada de OSs para a tela inicial
            await this.saveTodayOrders(allOrders);

            // 4. Verificação de Integridade (Garantia Big Tech: certificar que não está zerado)
            let verifiedTemplates = templates;
            if (!verifiedTemplates || verifiedTemplates.length === 0) {
                const diskTemplatesRaw = await AsyncStorage.getItem(DISK_CACHE_FORM_TEMPLATES);
                if (diskTemplatesRaw) {
                    try {
                        verifiedTemplates = JSON.parse(diskTemplatesRaw);
                    } catch (_) {}
                }
            }

            console.log(`[Sync] ✅ Pré-cache offline concluído com sucesso. OSs: ${allOrders.length}, Templates: ${verifiedTemplates?.length || 0}`);

            return {
                count: allOrders.length,
                templatesCount: verifiedTemplates?.length || 0
            };
        } catch (e: any) {
            console.error('[Sync] ❌ Falha crítica no prefetch de dados offline:', e);
            throw new Error(`Falha ao preparar modo offline: ${e?.message || 'Erro de conexão'}`);
        }
    }

    /** Retrocompatibilidade */
    async prefetchTodayOrders(onProgress?: (current: number, total: number) => void): Promise<number> {
        const result = await this.prefetchAllForOffline((cur, tot) => onProgress?.(cur, tot));
        return result.count;
    }
}

export const syncService = new SyncService();
