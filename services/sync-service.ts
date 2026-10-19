import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from './supabase';
import { resilientUpload } from './upload-resilient';
import { assetCacheService } from './asset-cache-service';

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

export interface SyncItemProgress {
    orderId: string;
    displayId: string;
    type: 'complete_os' | 'block_os';
    status: 'pending' | 'syncing' | 'completed' | 'error';
    currentStep?: string;
    errorReason?: string;
}

export interface DetailedSyncProgress {
    isSyncing: boolean;
    total: number;
    completed: number;
    failed: number;
    currentIndex: number;
    currentOrderId?: string;
    currentDisplayId?: string;
    currentStep?: string;
    percent: number; // 0 to 100
    isStalled: boolean;
    stalledReason?: string;
    status: 'idle' | 'syncing' | 'stalled' | 'error' | 'success';
    items: SyncItemProgress[];
    errorMessage?: string;
    lastCompletedAt?: number;
}

const SYNC_QUEUE_KEY = '@nexus_sync_queue';
const OFFLINE_CACHE_KEY = '@nexus_offline_orders';
const APP_OFFLINE_MODE_KEY = '@nexus_offline_mode_enabled';

class SyncService {
    private isSyncing = false;
    private subscribers: ((queue: SyncTask[]) => void)[] = [];
    private syncingSubscribers: ((syncing: boolean) => void)[] = [];
    private progressSubscribers: ((progress: DetailedSyncProgress) => void)[] = [];
    private unsubscribeNetInfo: (() => void) | null = null;
    private offlineModeEnabled = false;

    private progressState: DetailedSyncProgress = {
        isSyncing: false,
        total: 0,
        completed: 0,
        failed: 0,
        currentIndex: 0,
        percent: 0,
        isStalled: false,
        status: 'idle',
        items: [],
    };

    private watchdogTimer: ReturnType<typeof setInterval> | null = null;
    private watchdogLastActivity = Date.now();
    private autoClearTimer: ReturnType<typeof setTimeout> | null = null;

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

    // ========== Progress & Watchdog Methods ========== //

    subscribeProgress(callback: (progress: DetailedSyncProgress) => void) {
        this.progressSubscribers.push(callback);
        callback({ ...this.progressState });
        return () => {
            this.progressSubscribers = this.progressSubscribers.filter(cb => cb !== callback);
        };
    }

    getProgress(): DetailedSyncProgress {
        return { ...this.progressState };
    }

    resetProgress(): void {
        if (this.autoClearTimer) {
            clearTimeout(this.autoClearTimer);
            this.autoClearTimer = null;
        }
        this.progressState = {
            isSyncing: false,
            total: 0,
            completed: 0,
            failed: 0,
            currentIndex: 0,
            percent: 0,
            isStalled: false,
            status: 'idle',
            items: [],
            lastCompletedAt: undefined,
            currentStep: undefined,
            errorMessage: undefined,
            stalledReason: undefined,
        };
        this.notifyProgress();
    }

    private notifyProgress() {
        const stateCopy = { ...this.progressState, items: [...this.progressState.items] };
        this.progressSubscribers.forEach(cb => {
            try { cb(stateCopy); } catch (e) { console.error('[Sync] Erro no progress subscriber:', e); }
        });
    }

    private startWatchdog(stepDescription: string) {
        this.stopWatchdog();
        this.watchdogLastActivity = Date.now();
        this.watchdogTimer = setInterval(() => {
            const idleMs = Date.now() - this.watchdogLastActivity;
            if (idleMs > 25000 && this.isSyncing) {
                console.warn(`[SyncWatchdog] ⚠️ Conexão ociosa ou oscilando em: "${stepDescription}" (${Math.round(idleMs / 1000)}s sem resposta)`);
                this.progressState.isStalled = true;
                this.progressState.status = 'stalled';
                this.progressState.stalledReason = 'Conexão ociosa na operadora. Restabelecendo...';
                this.notifyProgress();
            }
        }, 5000);
    }

    private touchWatchdog() {
        this.watchdogLastActivity = Date.now();
        if (this.progressState.isStalled) {
            this.progressState.isStalled = false;
            if (this.progressState.status === 'stalled') {
                this.progressState.status = 'syncing';
                this.progressState.stalledReason = undefined;
            }
            this.notifyProgress();
        }
    }

    private stopWatchdog() {
        if (this.watchdogTimer) {
            clearInterval(this.watchdogTimer);
            this.watchdogTimer = null;
        }
    }

    // ========== Queue Execution With Rich Progress ========== //

    /**
     * Executa a fila de sincronização com acompanhamento detalhado e atômico.
     * Retorna { success, failed, total }.
     */
    async processSyncQueueWithProgress(force = false): Promise<{ success: number; failed: number; total: number }> {
        if (this.isSyncing) {
            return {
                success: this.progressState.completed,
                failed: this.progressState.failed,
                total: this.progressState.total,
            };
        }

        if (!force && this.offlineModeEnabled) {
            return { success: 0, failed: 0, total: 0 };
        }

        const netState = await NetInfo.fetch();
        if (!netState.isConnected || netState.isInternetReachable === false) {
            this.progressState.status = 'error';
            this.progressState.errorMessage = 'Sem conexão com a internet. Os dados permanecem seguros no aparelho.';
            this.notifyProgress();
            return { success: 0, failed: 0, total: 0 };
        }

        // Cancelar timer de limpeza anterior
        if (this.autoClearTimer) {
            clearTimeout(this.autoClearTimer);
            this.autoClearTimer = null;
        }

        resilientUpload.setForcedOfflineMode(false);
        await resilientUpload.resumeAll().catch(() => {});

        const queue = await this.getQueue();
        const pendingTasks = queue.filter(t => t.status === 'pending' || t.status === 'error');

        if (pendingTasks.length === 0) {
            this.resetProgress();
            return { success: 0, failed: 0, total: 0 };
        }

        this.isSyncing = true;
        this.notifySyncingSubscribers(true);

        const total = pendingTasks.length;
        let success = 0;
        let failed = 0;

        // Montar lista inicial de itens
        const itemsList: SyncItemProgress[] = pendingTasks.map(t => ({
            orderId: t.orderId,
            displayId: t.payload?.displayId || t.orderId,
            type: t.type,
            status: 'pending',
            currentStep: 'Aguardando envio',
        }));

        this.progressState = {
            isSyncing: true,
            total,
            completed: 0,
            failed: 0,
            currentIndex: 0,
            currentOrderId: pendingTasks[0].orderId,
            currentDisplayId: pendingTasks[0].payload?.displayId || pendingTasks[0].orderId,
            currentStep: 'Iniciando sincronização inteligente...',
            percent: 5,
            isStalled: false,
            status: 'syncing',
            items: itemsList,
        };
        this.notifyProgress();

        try {
            // Aguarda uploads paralelos em andamento no motor de resiliência por até 3s
            const stats = resilientUpload.getStats();
            if (stats.pending > 0 || stats.uploading > 0) {
                await resilientUpload.waitForActiveUploads(3000);
            }

            for (let i = 0; i < pendingTasks.length; i++) {
                const task = pendingTasks[i];
                const displayId = task.payload?.displayId || task.orderId;

                // Checa conectividade antes de cada OS
                const currentNet = await NetInfo.fetch();
                if (!currentNet.isConnected || currentNet.isInternetReachable === false) {
                    console.warn('[Sync] ⚠️ Internet caiu no meio do processo.');
                    failed += (pendingTasks.length - i);
                    this.progressState.isStalled = false;
                    this.progressState.status = 'error';
                    this.progressState.errorMessage = `Conexão interrompida. ${success} OS enviada(s) com sucesso. ${pendingTasks.length - i} OS salvas no celular.`;
                    this.notifyProgress();
                    break;
                }

                this.progressState.currentIndex = i + 1;
                this.progressState.currentOrderId = task.orderId;
                this.progressState.currentDisplayId = displayId;
                this.progressState.percent = Math.max(5, Math.round(((i) / total) * 100));

                if (this.progressState.items[i]) {
                    this.progressState.items[i].status = 'syncing';
                }

                await this.updateTaskStatus(task.id, 'syncing');

                try {
                    const stepUpdater = (step: string) => {
                        this.touchWatchdog();
                        this.progressState.currentStep = `${displayId}: ${step}`;
                        if (this.progressState.items[i]) {
                            this.progressState.items[i].currentStep = step;
                        }
                        this.notifyProgress();
                    };

                    this.startWatchdog(`Sincronizando OS ${displayId}`);

                    if (task.type === 'complete_os') {
                        await this.syncCompleteOS(task, stepUpdater);
                    } else if (task.type === 'block_os') {
                        await this.syncBlockOS(task, stepUpdater);
                    }

                    this.stopWatchdog();

                    // Confirmar sucesso e remover da fila
                    await this.removeFromQueue(task.id);
                    success++;

                    if (this.progressState.items[i]) {
                        this.progressState.items[i].status = 'completed';
                        this.progressState.items[i].currentStep = 'Concluída com sucesso';
                    }
                    this.progressState.completed = success;
                    this.progressState.percent = Math.round(((i + 1) / total) * 100);
                    this.notifyProgress();

                } catch (taskError: any) {
                    this.stopWatchdog();
                    failed++;
                    console.error(`[Sync] Falha na OS ${displayId}:`, taskError);

                    if (this.progressState.items[i]) {
                        this.progressState.items[i].status = 'error';
                        this.progressState.items[i].errorReason = taskError?.message || 'Falha de envio';
                    }
                    this.progressState.failed = failed;
                    await this.updateTaskStatus(task.id, 'error', taskError?.message);
                    this.notifyProgress();
                }
            }
        } finally {
            this.stopWatchdog();
            this.isSyncing = false;
            this.notifySyncingSubscribers(false);

            if (failed === 0 && success > 0) {
                this.progressState.status = 'success';
                this.progressState.percent = 100;
                this.progressState.currentStep = `Todas as ${success} OSs sincronizadas com sucesso!`;
                this.progressState.lastCompletedAt = Date.now();
                this.notifyProgress();

                // Auto-clear após 3.5 segundos para garantir que o estado seja limpo completamente
                if (this.autoClearTimer) clearTimeout(this.autoClearTimer);
                this.autoClearTimer = setTimeout(() => {
                    this.resetProgress();
                }, 3500);
            } else if (failed > 0) {
                this.progressState.status = 'error';
                this.progressState.errorMessage = `${failed} OS aguardando envio seguro. ${success} sincronizada(s) com sucesso.`;
                this.notifyProgress();
            } else {
                this.resetProgress();
            }
        }

        return { success, failed, total };
    }

    /**
     * Retrocompatibilidade para toggle e chamadores existentes
     */
    async safeSyncBeforeOnline(): Promise<{ success: number; failed: number; total: number }> {
        return this.processSyncQueueWithProgress(true);
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

    async updateTaskPayload(taskId: string, payload: any) {
        try {
            const queue = await this.getQueue();
            const task = queue.find(t => t.id === taskId);
            if (task) {
                task.payload = payload;
                await this.saveQueue(queue);
            }
        } catch (e) {
            console.error('[Sync] Erro ao atualizar payload da tarefa:', e);
        }
    }

    // ========== Process Queue ========== //

    async triggerSync(force = false) {
        if (this.isSyncing) return;
        // Se estiver em Modo Offline manual e não foi forçado, aguarda ativar Modo Online
        if (!force && this.offlineModeEnabled) return;

        const state = await NetInfo.fetch();
        if (!state.isConnected || state.isInternetReachable === false) return;

        await this.processSyncQueueWithProgress(force);
    }

    private async syncCompleteOS(task: SyncTask, onStep?: (step: string) => void) {
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

        // Helper para upload de mídia atômico:
        // Se já foi enviado (em tentativa anterior antes de queda de rede), reusa a URL em 0ms!
        // Quando sobe com sucesso, grava imediatamente no cache persistente e atualiza o payload.
        let payloadChanged = false;

        const uploadSingleAsset = async (uri: string, folder: string, isVideo = false): Promise<string> => {
            if (!isLocalPath(uri)) return uri;

            // 1. Checar se já foi subido anteriormente
            const cachedRemote = assetCacheService.getRemoteUrl(uri) || resilientUpload.getCompletedUrl(uri);
            if (cachedRemote) {
                console.log(`[Sync] ⚡ Mídia reaproveitada (já enviada): ${cachedRemote}`);
                return cachedRemote;
            }

            // 2. Upload com streaming direto
            this.touchWatchdog();
            const url = await OrderService.uploadFile(
                uri,
                `orders/${targetFolderId}/${folder}`,
                tenantId,
                isVideo ? 'video/mp4' : undefined
            );

            if (!url) {
                throw new Error(`Falha no upload de mídia (${isVideo ? 'vídeo' : 'foto'})`);
            }

            // 3. Salvar no cache atômico de mídias imediatamente
            await assetCacheService.setRemoteUrl(uri, url);
            this.touchWatchdog();
            return url;
        };

        // 1. Processar fotos extras
        if (payload.extraPhotos && Array.isArray(payload.extraPhotos)) {
            const totalPhotos = payload.extraPhotos.length;
            const processedList: string[] = [];

            for (let i = 0; i < totalPhotos; i++) {
                const uri = payload.extraPhotos[i];
                if (isLocalPath(uri)) {
                    onStep?.(`Subindo foto extra ${i + 1}/${totalPhotos}...`);
                    const uploadedUrl = await uploadSingleAsset(uri, 'extra_photos', false);
                    processedList.push(uploadedUrl);
                    if (uploadedUrl !== uri) {
                        payload.extraPhotos[i] = uploadedUrl;
                        payloadChanged = true;
                    }
                } else {
                    processedList.push(uri);
                }
            }

            if (payloadChanged) {
                await this.updateTaskPayload(task.id, payload);
            }
        }

        // 2. Processar mídias nos formulários dinâmicos
        const finalFormData: Record<string, any> = payload.formData || {};
        const formKeys = Object.keys(finalFormData);

        for (const key of formKeys) {
            const value = finalFormData[key];
            if (Array.isArray(value)) {
                const newArray: any[] = [];
                for (let i = 0; i < value.length; i++) {
                    const item = value[i];
                    if (isLocalPath(item)) {
                        const isVideo = item.toLowerCase().endsWith('.mov') || item.toLowerCase().endsWith('.mp4');
                        onStep?.(`Subindo ${isVideo ? 'vídeo' : 'foto'} do formulário...`);
                        const uploaded = await uploadSingleAsset(item, isVideo ? 'videos' : 'form_photos', isVideo);
                        newArray.push(uploaded);
                        if (uploaded !== item) payloadChanged = true;
                    } else {
                        newArray.push(item);
                    }
                }
                finalFormData[key] = newArray;
            } else if (typeof value === 'string') {
                const urls = value.split(',').map(u => u.trim()).filter(Boolean);
                if (urls.some(u => isLocalPath(u))) {
                    const newArray: string[] = [];
                    for (const item of urls) {
                        if (isLocalPath(item)) {
                            const isVideo = item.toLowerCase().endsWith('.mov') || item.toLowerCase().endsWith('.mp4');
                            onStep?.(`Subindo ${isVideo ? 'vídeo' : 'foto'} do formulário...`);
                            const uploaded = await uploadSingleAsset(item, isVideo ? 'videos' : 'form_photos', isVideo);
                            newArray.push(uploaded);
                            if (uploaded !== item) payloadChanged = true;
                        } else {
                            newArray.push(item);
                        }
                    }
                    finalFormData[key] = newArray.join(',');
                }
            }
        }

        if (payloadChanged) {
            payload.formData = finalFormData;
            await this.updateTaskPayload(task.id, payload);
        }

        // 3. Processar assinatura
        let processedSignature = payload.signature || null;
        if (processedSignature && processedSignature.startsWith('data:image')) {
            try {
                const sigPath = `${FileSystem.documentDirectory}sig_${orderId}_${Date.now()}.png`;
                const base64Data = processedSignature.split(',')[1];
                await FileSystem.writeAsStringAsync(sigPath, base64Data, { encoding: FileSystem.EncodingType.Base64 });
                processedSignature = sigPath;
            } catch (e) {
                console.error('[Sync] Falha ao converter assinatura:', e);
            }
        }

        // 4. Processar vídeos da OS
        let processedVideoUrl = payload.videoUrl || null;
        if (processedVideoUrl && typeof processedVideoUrl === 'string') {
            const urls = processedVideoUrl.split(',').map(u => u.trim()).filter(Boolean);
            const uploadedUrls: string[] = [];

            for (let i = 0; i < urls.length; i++) {
                const vUri = urls[i];
                if (isLocalPath(vUri)) {
                    onStep?.(`Subindo vídeo ${i + 1}/${urls.length}...`);
                    const uploaded = await uploadSingleAsset(vUri, 'videos', true);
                    uploadedUrls.push(uploaded);
                    if (uploaded !== vUri) payloadChanged = true;
                } else {
                    uploadedUrls.push(vUri);
                }
            }

            processedVideoUrl = uploadedUrls.join(',');
            if (payloadChanged) {
                payload.videoUrl = processedVideoUrl;
                await this.updateTaskPayload(task.id, payload);
            }
        }

        // 5. Finalizar OS no Supabase
        onStep?.('Gravando finalização da OS no sistema...');
        this.touchWatchdog();

        await OrderService.completeOrder(orderId, {
            technicalReport: payload.technical_report || '',
            partsUsed: payload.parts_used || '',
            photos: payload.extraPhotos || [],
            signature: processedSignature,
            videoUrl: processedVideoUrl,
            formData: finalFormData,
            clientName: payload.clientName,
            clientDoc: payload.clientDoc,
            tenantId: tenantId,
            items: payload.usedItems
        });

        console.log(`[Sync] ✅ OS ${orderId} finalizada e confirmada no servidor.`);
    }

    private async syncBlockOS(task: SyncTask, onStep?: (step: string) => void) {
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

        const isLocalPath = (str: any): boolean => {
            if (typeof str !== 'string') return false;
            const s = str.trim();
            if (!s || s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:')) return false;
            return Boolean(
                s.startsWith('file://') ||
                s.startsWith('/var/') ||
                s.startsWith('/private/') ||
                (FileSystem.documentDirectory && s.startsWith(FileSystem.documentDirectory))
            );
        };

        let payloadChanged = false;

        const uploadSingleAsset = async (uri: string, folder: string, isVideo = false): Promise<string> => {
            if (!isLocalPath(uri)) return uri;

            const cachedRemote = assetCacheService.getRemoteUrl(uri) || resilientUpload.getCompletedUrl(uri);
            if (cachedRemote) {
                return cachedRemote;
            }

            this.touchWatchdog();
            const url = await OrderService.uploadFile(
                uri,
                `orders/${targetFolderId}/${folder}`,
                tenantId,
                isVideo ? 'video/mp4' : undefined
            );

            if (!url) throw new Error('Falha no upload da foto de impedimento');

            await assetCacheService.setRemoteUrl(uri, url);
            this.touchWatchdog();
            return url;
        };

        let processedBlockPhotos: string[] = [];
        if (payload.blockPhotoUrls && Array.isArray(payload.blockPhotoUrls)) {
            for (let i = 0; i < payload.blockPhotoUrls.length; i++) {
                const uri = payload.blockPhotoUrls[i];
                if (isLocalPath(uri)) {
                    onStep?.(`Subindo foto de impedimento ${i + 1}/${payload.blockPhotoUrls.length}...`);
                    const uploaded = await uploadSingleAsset(uri, 'block_photos', false);
                    processedBlockPhotos.push(uploaded);
                    if (uploaded !== uri) {
                        payload.blockPhotoUrls[i] = uploaded;
                        payloadChanged = true;
                    }
                } else {
                    processedBlockPhotos.push(uri);
                }
            }
        }

        let processedVideoUrl = payload.videoUrl || null;
        if (processedVideoUrl && typeof processedVideoUrl === 'string') {
            const urls = processedVideoUrl.split(',').map(u => u.trim()).filter(Boolean);
            const uploadedUrls: string[] = [];
            for (let i = 0; i < urls.length; i++) {
                const vUri = urls[i];
                if (isLocalPath(vUri)) {
                    onStep?.(`Subindo vídeo de impedimento ${i + 1}/${urls.length}...`);
                    const uploaded = await uploadSingleAsset(vUri, 'videos', true);
                    uploadedUrls.push(uploaded);
                    if (uploaded !== vUri) payloadChanged = true;
                } else {
                    uploadedUrls.push(vUri);
                }
            }
            processedVideoUrl = uploadedUrls.join(',');
            if (payloadChanged) {
                payload.videoUrl = processedVideoUrl;
            }
        }

        const finalFormData = payload.additionalData?.formData || {};
        if (processedVideoUrl) {
            finalFormData.video_url = processedVideoUrl;
        }

        if (payloadChanged) {
            await this.updateTaskPayload(task.id, payload);
        }

        onStep?.('Gravando impedimento da OS no sistema...');
        this.touchWatchdog();

        await OrderService.blockOrder(orderId, payload.reason, processedBlockPhotos.length > 0 ? processedBlockPhotos : null, { formData: finalFormData, items: payload.additionalData?.items });
        console.log(`[Sync] ✅ OS ${orderId} bloqueada e confirmada no servidor.`);
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
            let userId = session?.user?.id;
            if (!userId) {
                try {
                    const { authService } = require('./auth-service');
                    userId = authService.getCurrentUserId();
                } catch (_) {}
            }
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

            if (onProgress) onProgress(1, 5, 'Buscando Ordens de Serviço abertas (<30 dias)...');

            // 2. Data limite: menos de 30 dias a partir de hoje
            const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000);
            const thirtyDaysAgoIso = new Date(thirtyDaysAgoMs).toISOString();
            const thirtyDaysAgoDateOnly = thirtyDaysAgoIso.split('T')[0];

            // Buscar OSs atribuídas ESPECIFICAMENTE ao técnico autenticado.
            let activeOrdersRaw: any[] = [];

            // Tentativa 1: query rica com joins
            try {
                const { data: directOrders, error: ordersError } = await supabase
                    .from('orders')
                    .select('*, customers(*), service_visits(count)')
                    .eq('assigned_to', userId)
                    .order('created_at', { ascending: false })
                    .limit(200);

                if (!ordersError && directOrders && directOrders.length > 0) {
                    activeOrdersRaw = directOrders;
                } else if (ordersError) {
                    console.warn('[Sync] Erro na query direta de ordens:', ordersError);
                }
            } catch (queryErr) {
                console.error('[Sync] Exceção na query direta de ordens:', queryErr);
            }

            // Tentativa 2: query direta sem joins (caso haja restrição de chave estrangeira)
            if (activeOrdersRaw.length === 0) {
                try {
                    const { data: simpleOrders, error: simpleError } = await supabase
                        .from('orders')
                        .select('*')
                        .eq('assigned_to', userId)
                        .order('created_at', { ascending: false })
                        .limit(200);

                    if (!simpleError && simpleOrders && simpleOrders.length > 0) {
                        activeOrdersRaw = simpleOrders;
                    }
                } catch (simpleErr) {
                    console.warn('[Sync] Tentativa 2 direta sem joins falhou:', simpleErr);
                }
            }

            // Tentativa 3: buscar por scheduled_date recente
            if (activeOrdersRaw.length === 0) {
                try {
                    const { data: schedOrders } = await supabase
                        .from('orders')
                        .select('*, customers(*)')
                        .eq('assigned_to', userId)
                        .gte('scheduled_date', thirtyDaysAgoDateOnly)
                        .order('scheduled_date', { ascending: false })
                        .limit(200);

                    if (schedOrders && schedOrders.length > 0) {
                        activeOrdersRaw = schedOrders;
                    }
                } catch (_) {}
            }

            // Fallback de alta confiabilidade: se a query direta não trouxe registros, busca via OrderService
            if (activeOrdersRaw.length === 0) {
                try {
                    const fallbackRes = await OrderService.getAllOrders({ pageSize: 100, forceRefresh: true });
                    if (fallbackRes?.orders && fallbackRes.orders.length > 0) {
                        console.log(`[Sync] Fallback OrderService encontrou ${fallbackRes.orders.length} ordens.`);
                        activeOrdersRaw = fallbackRes.orders;
                    }
                } catch (fallbackErr) {
                    console.warn('[Sync] Fallback OrderService não obteve ordens:', fallbackErr);
                }
            }

            // Deduplicação e validação estrita em memória:
            // Apenas status: abertas (pending), atribuídas (assigned), ou em andamento (in_progress/traveling)
            // OSs concluídas e impedidas NUNCA são baixadas
            const validStatusKeys = new Set(['pending', 'assigned', 'in_progress', 'traveling']);

            const allOrdersMap = new Map<string, any>();
            (activeOrdersRaw || []).forEach(o => {
                if (!o || !o.id) return;

                // 1. Garantir que é especificamente para aquele técnico (quando houver assigned_to)
                if (o.assigned_to && o.assigned_to !== userId) return;

                // 2. Mapeamento de status no padrão do sistema
                const mapped = OrderService.mapDbOrderToApp(o);
                const status = mapped.status;
                const rawStatus = String(o.status || o.rawStatus || '').toUpperCase();

                // 3. REGRA CRÍTICA: Concluídas, Impedidas e Canceladas NUNCA devem ser baixadas
                if (
                    status === 'completed' || status === 'blocked' || status === 'canceled' ||
                    rawStatus.includes('CONCLU') || rawStatus.includes('IMPED') ||
                    rawStatus.includes('BLOQ') || rawStatus.includes('CANCEL')
                ) {
                    return;
                }

                // 4. REGRA: Apenas abertas, atribuídas ou em andamento
                if (!validStatusKeys.has(status)) {
                    return;
                }

                // 5. REGRA: Menos de 30 dias
                const orderDateVal = o.scheduled_date || o.scheduledDate || o.created_at || o.createdAt;
                if (orderDateVal) {
                    const orderTime = new Date(orderDateVal).getTime();
                    if (!isNaN(orderTime) && orderTime < thirtyDaysAgoMs) {
                        return; // OS mais antiga que 30 dias descartada
                    }
                }

                // Salvar objeto híbrido com dados do DB e campos mapeados do App
                allOrdersMap.set(o.id, {
                    ...o,
                    ...mapped,
                    id: o.id,
                    status: status,
                    rawStatus: o.status || status,
                });
            });

            const allOrders = Array.from(allOrdersMap.values());
            console.log(`[Sync] Base offline: ${allOrders.length} OSs válidas (<30d, abertas/atribuídas/em andamento) para o técnico ${userId}.`);

            // 3. Buscar equipamentos e detalhes para cada OS encontrada
            const totalOrders = allOrders.length;
            for (let i = 0; i < totalOrders; i++) {
                const order = allOrders[i];
                if (onProgress) onProgress(i + 1, Math.max(totalOrders, 1), `Baixando OS ${i + 1}/${totalOrders} (${order.displayId || 'S/N'})...`);
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
