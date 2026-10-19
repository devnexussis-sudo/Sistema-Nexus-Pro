/**
 * 📤 Resilient Upload Service v2 — Background Queue + Offline-First
 *
 * ┌────────────────────────────────────────────────────────────────────┐
 * │ 6.1 Retry exponencial max 60s com jitter.                         │
 * │ 6.2 Persiste fila em disco. Retoma se app morrer.                 │
 * │ 6.3 Nunca pede pra escolher foto de novo (copia pra documentDir). │
 * │ 6.4 NOVO: Listener de rede permanente — retoma ao reconectar.     │
 * │ 6.5 NOVO: onQueueDrained — notifica quando tudo foi enviado.      │
 * │ 6.6 NOVO: Modo offline — enqueue salva local, sobe ao reconectar. │
 * └────────────────────────────────────────────────────────────────────┘
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { isRetryableError } from './connection-diagnostics';

// ─── Configuration ────────────────────────────────────────────────────────────
const UPLOAD_QUEUE_KEY       = '@nexus:upload_queue_v2';
const APP_OFFLINE_MODE_KEY   = '@nexus_offline_mode_enabled';
const MAX_RETRY_DELAY_MS     = 60_000;
const MAX_RETRIES            = 5;
const MAX_CONCURRENT_UPLOADS = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadTask {
    id:             string;
    localUri:       string;    // Safe copy in documentDirectory
    compressedUri?: string;    // Compressed URI before safe copy
    originalUri?:   string;    // Original source URI (camera/gallery) before compression
    remotePath:     string;    // Target path in R2 storage
    contentType:    string;
    totalBytes:     number;
    uploadedBytes:  number;
    status: 'queued' | 'uploading' | 'completed' | 'failed' | 'retrying' | 'offline_pending';
    retryCount:     number;
    lastError?:     string;
    createdAt:      number;
    completedAt?:   number;
    resultUrl?:     string;    // Public URL after successful upload
}

export interface EnqueueOptions {
    originalUri?: string;
    tenantId?:    string;
    onComplete?:  (resultUrl: string, task: UploadTask) => void;
}

export interface UploadStats {
    pending:   number; // queued + retrying + offline_pending
    uploading: number;
    completed: number;
    failed:    number;
    total:     number;
}

type UploadProgressCallback = (task: UploadTask) => void;
type QueueDrainedCallback   = (completedCount: number) => void;

// ─── Service ──────────────────────────────────────────────────────────────────

class ResilientUploadService {
    private queue:                UploadTask[]                   = [];
    private activeWorkers         = 0;
    private isOffline             = false;  // Tracks real connectivity (from NetInfo)
    private isOfflineModeForced   = false;  // Tracks manual offline mode (from syncService toggle)
    private progressListeners:    Set<UploadProgressCallback>   = new Set();
    private drainedListeners:     Set<QueueDrainedCallback>     = new Set();
    private unsubscribeNetInfo:   (() => void) | null           = null;
    private sessionCompletedCount = 0;      // Counts uploads completed since last drain

    constructor() {
        this.init();
    }

    private async init(): Promise<void> {
        try {
            const [offlineVal, netState] = await Promise.all([
                AsyncStorage.getItem(APP_OFFLINE_MODE_KEY).catch(() => null),
                NetInfo.fetch().catch(() => null),
            ]);
            this.isOfflineModeForced = offlineVal === 'true';
            if (netState) {
                this.isOffline = !netState.isConnected || netState.isInternetReachable === false;
            }
        } catch { /* ignore */ }

        await this.loadQueue();
        this.startNetworkListener();

        if (!this.isCurrentlyOffline()) {
            this.resumeAll().catch(() => {});
        }
    }

    public isCurrentlyOffline(): boolean {
        return this.isOffline || this.isOfflineModeForced;
    }

    // ─── Public API ───────────────────────────────────────────────────────────

    /** Subscribe to individual task progress changes */
    onProgress(callback: UploadProgressCallback): () => void {
        this.progressListeners.add(callback);
        return () => this.progressListeners.delete(callback);
    }

    /**
     * Subscribe to queue drain events.
     * Fires when all pending uploads finish (both online flush and offline→online sync).
     * Returns unsubscribe function.
     */
    onQueueDrained(callback: QueueDrainedCallback): () => void {
        this.drainedListeners.add(callback);
        return () => this.drainedListeners.delete(callback);
    }

    /**
     * Find a task in the queue matching any known URI alias (original, compressed, safe local, or remote).
     */
    findMatchingTask(uri: string): UploadTask | undefined {
        if (!uri) return undefined;
        const norm = uri.toLowerCase();
        const rawFilename = norm.split('/').pop() || '';
        // Normalizar removendo prefixos gerados internamente por caches offline e cópias seguras
        const cleanFilename = rawFilename
            .replace(/^offline_/, '')
            .replace(/^nexus_upload_\d+_/, '')
            .replace(/^safe_/, '');

        // Prefer completed or active tasks first
        const sorted = [...this.queue].sort((a, b) => {
            if (a.status === 'completed' && b.status !== 'completed') return -1;
            if (b.status === 'completed' && a.status !== 'completed') return 1;
            return b.createdAt - a.createdAt;
        });

        return sorted.find(t => {
            if (t.originalUri && t.originalUri === uri) return true;
            if (t.compressedUri && t.compressedUri === uri) return true;
            if (t.localUri === uri) return true;
            if (t.resultUrl && t.resultUrl === uri) return true;
            if (norm.includes(t.remotePath.toLowerCase())) return true;

            const tOriginal = (t.originalUri || '').toLowerCase();
            const tCompressed = (t.compressedUri || '').toLowerCase();
            const tLocal = (t.localUri || '').toLowerCase();
            const tRemote = (t.remotePath || '').toLowerCase();

            // Match full URI containing the clean file name
            if (rawFilename && rawFilename.length > 5) {
                if (tOriginal.endsWith(rawFilename) || tCompressed.endsWith(rawFilename) || tLocal.endsWith(rawFilename) || tRemote.endsWith(rawFilename)) return true;
            }

            if (cleanFilename && cleanFilename.length > 5) {
                if (tOriginal.includes(cleanFilename) || tCompressed.includes(cleanFilename) || tLocal.includes(cleanFilename) || tRemote.includes(cleanFilename)) return true;
            }

            return false;
        });
    }

    /**
     * Enqueue a file for immediate background upload (when Online) or safe disk queue (when Offline).
     *
     * ▸ Online  → copies to safe location + starts parallel upload immediately to R2.
     * ▸ Offline → copies to safe location + marks as `offline_pending`,
     *             will auto-upload when network returns and Online Mode is active.
     *
     * Returns the task ID.
     */
    async enqueue(
        localUri:    string,
        remotePath:  string,
        contentType: string = 'image/webp',
        options?:    EnqueueOptions
    ): Promise<string> {
        // 0. Check if already in queue to avoid duplicate work
        const existing = this.findMatchingTask(options?.originalUri || localUri) || this.findMatchingTask(localUri);
        if (existing && (existing.status === 'completed' || existing.status === 'uploading' || existing.status === 'queued')) {
            if (options?.originalUri && !existing.originalUri) existing.originalUri = options.originalUri;
            if (existing.status === 'completed' && existing.resultUrl) {
                options?.onComplete?.(existing.resultUrl, existing);
                return existing.id;
            }
            if (options?.onComplete) {
                const unsub = this.onProgress(t => {
                    if (t.id === existing.id && t.status === 'completed' && t.resultUrl) {
                        options.onComplete!(t.resultUrl, t);
                        unsub();
                    }
                });
            }
            if (!this.isCurrentlyOffline()) {
                this.processQueue();
            }
            return existing.id;
        }

        // 1. Persist file to documentDirectory (survive cache wipes)
        const safeUri = await this.copyToSafeLocation(localUri);

        // 2. Get file size
        const fileInfo   = await FileSystem.getInfoAsync(safeUri);
        const totalBytes = fileInfo.exists ? (fileInfo as any).size || 0 : 0;

        // 3. Refresh connectivity state if currently marked offline (avoid stale NetInfo state)
        if (this.isOffline && !this.isOfflineModeForced) {
            try {
                const net = await NetInfo.fetch();
                this.isOffline = !net.isConnected || net.isInternetReachable === false;
            } catch { /* ignore */ }
        }

        // 4. Normalize remotePath with tenantId prefix if provided
        const cleanRemote = remotePath.replace(/^\/+/, '');
        const finalRemotePath = (options?.tenantId && !cleanRemote.startsWith(`${options.tenantId}/`))
            ? `${options.tenantId}/${cleanRemote}`
            : cleanRemote;

        const isCurrentlyOffline = this.isCurrentlyOffline();
        const initialStatus: UploadTask['status'] = isCurrentlyOffline ? 'offline_pending' : 'queued';

        // 5. Create task
        const task: UploadTask = {
            id:            `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            localUri:      safeUri,
            compressedUri: localUri,
            originalUri:   options?.originalUri || localUri,
            remotePath:    finalRemotePath,
            contentType,
            totalBytes,
            uploadedBytes: 0,
            status:        initialStatus,
            retryCount:    0,
            createdAt:     Date.now(),
        };

        // 6. Register onComplete listener BEFORE pushing/processing so there is ZERO race condition
        if (options?.onComplete) {
            const unsub = this.onProgress(t => {
                if (t.id === task.id) {
                    if (t.status === 'completed' && t.resultUrl) {
                        options.onComplete!(t.resultUrl, t);
                        unsub();
                    } else if (t.status === 'failed' && t.retryCount >= MAX_RETRIES) {
                        unsub();
                    }
                }
            });
        }

        this.queue.push(task);
        await this.saveQueue();
        this.notifyProgress(task);

        console.log(
            `[Upload] 📤 Enqueued [${initialStatus}]: ` +
            `${task.id} (${(totalBytes / 1024).toFixed(1)}KB → ${finalRemotePath})`
        );

        // 7. Start processing immediately if online
        if (!isCurrentlyOffline) {
            this.processQueue();
        }

        return task.id;
    }

    /**
     * Get the safe local URI in documentDirectory for a given original or compressed URI.
     */
    getSafeLocalUri(uri: string): string | null {
        const task = this.findMatchingTask(uri);
        return task?.localUri || null;
    }

    /**
     * Upload and wait for completion (blocking helper).
     * Returns public URL or null on failure.
     */
    async uploadAndWait(
        localUri:    string,
        remotePath:  string,
        contentType: string = 'image/webp'
    ): Promise<string | null> {
        const taskId = await this.enqueue(localUri, remotePath, contentType);
        return this.waitForTaskById(taskId, 60_000);
    }

    private waitForTaskById(taskId: string, timeoutMs: number = 30_000): Promise<string | null> {
        const existing = this.queue.find(t => t.id === taskId);
        if (existing?.status === 'completed' && existing.resultUrl) {
            return Promise.resolve(existing.resultUrl);
        }

        return new Promise<string | null>((resolve) => {
            const start = Date.now();
            const check = setInterval(() => {
                const task = this.queue.find(t => t.id === taskId);
                if (!task) {
                    clearInterval(check);
                    resolve(null);
                    return;
                }
                if (task.status === 'completed' && task.resultUrl) {
                    clearInterval(check);
                    resolve(task.resultUrl);
                    return;
                }
                if (task.status === 'failed' && task.retryCount >= MAX_RETRIES) {
                    clearInterval(check);
                    resolve(null);
                    return;
                }
                if (Date.now() - start >= timeoutMs) {
                    clearInterval(check);
                    resolve(null);
                }
            }, 150);
        });
    }

    /**
     * Resolve an already-completed upload OR wait for an in-flight/queued upload matching `uri`.
     * Prevents duplicate uploads when the technician clicks Concluir/Impedir while a background upload is finishing.
     */
    async resolveOrWaitForUpload(uri: string, timeoutMs: number = 8_000): Promise<string | null> {
        if (!uri) return null;
        if (uri.startsWith('http://') || uri.startsWith('https://')) return uri;

        const task = this.findMatchingTask(uri);
        if (!task) return null;

        if (task.status === 'completed' && task.resultUrl) {
            return task.resultUrl;
        }

        if (this.isCurrentlyOffline()) {
            return null;
        }

        // If task was offline_pending or failed earlier, promote to queued and kick workers
        if (task.status === 'offline_pending' || task.status === 'failed') {
            task.status = 'queued';
            task.retryCount = 0;
            this.processQueue();
        } else if (task.status === 'queued' || task.status === 'retrying') {
            this.processQueue();
        }

        return this.waitForTaskById(task.id, timeoutMs);
    }

    /**
     * Cancel/remove a pending task if the technician deletes the attachment from the UI.
     */
    async cancelOrDelete(uri: string): Promise<void> {
        if (!uri) return;
        const task = this.findMatchingTask(uri);
        if (task && task.status !== 'completed') {
            this.queue = this.queue.filter(t => t.id !== task.id);
            await this.saveQueue();
        }
    }

    /**
     * Resume all interrupted/offline-pending uploads.
     * Called on app start, foreground return, network reconnect, and online mode activation.
     */
    async resumeAll(): Promise<void> {
        await this.loadQueue();

        if (!this.isOfflineModeForced) {
            try {
                const net = await NetInfo.fetch();
                this.isOffline = !net.isConnected || net.isInternetReachable === false;
            } catch { /* ignore */ }
        }

        if (this.isCurrentlyOffline()) {
            console.log('[Upload] ⏸ resumeAll skipped — still offline');
            return;
        }

        const pending = this.queue.filter(t =>
            (t.status as string) === 'pending' ||
            t.status === 'queued'              ||
            t.status === 'retrying'            ||
            t.status === 'offline_pending'     ||
            t.status === 'failed'
        );

        if (pending.length > 0) {
            console.log(`[Upload] 🔄 Resuming ${pending.length} uploads (online active)`);
            pending.forEach(t => {
                if (t.status === 'offline_pending' || t.status === 'failed' || (t.status as string) === 'pending') {
                    t.status = 'queued';
                    t.retryCount = 0;
                }
            });
            await this.saveQueue();
            this.processQueue();
        }
    }

    /** Get current upload statistics for UI display */
    getStats(): UploadStats {
        const pending   = this.queue.filter(t => ['queued','retrying','offline_pending'].includes(t.status)).length;
        const uploading = this.queue.filter(t => t.status === 'uploading').length;
        const completed = this.queue.filter(t => t.status === 'completed').length;
        const failed    = this.queue.filter(t => t.status === 'failed').length;
        return { pending, uploading, completed, failed, total: this.queue.length };
    }

    /** Get all non-completed upload tasks */
    getPendingTasks(): UploadTask[] {
        return this.queue.filter(t => t.status !== 'completed');
    }

    /** Check if a localUri or filename has a completed remote URL */
    getCompletedUrl(localUri: string): string | null {
        if (!localUri) return null;
        if (localUri.startsWith('http://') || localUri.startsWith('https://')) return localUri;
        const task = this.findMatchingTask(localUri);
        if (task && task.status === 'completed' && task.resultUrl) {
            return task.resultUrl;
        }
        return null;
    }

    /**
     * Aguarda uploads ativos/em fila terminarem antes de submeter o formulário ou impedir OS.
     * Retorna true quando todos terminaram, ou false em caso de timeout.
     */
    async waitForActiveUploads(timeoutMs: number = 5000): Promise<boolean> {
        if (this.isCurrentlyOffline()) return true;

        // Kick queue in case any items are sitting in 'queued' or 'offline_pending'
        const waiting = this.queue.filter(t => t.status === 'offline_pending' || t.status === 'queued' || t.status === 'retrying');
        if (waiting.length > 0) {
            waiting.forEach(t => {
                if (t.status === 'offline_pending') t.status = 'queued';
            });
            this.processQueue();
        }

        const start = Date.now();
        while (Date.now() - start < timeoutMs) {
            const active = this.queue.filter(t =>
                t.status === 'uploading' || t.status === 'queued' || t.status === 'retrying'
            );
            if (active.length === 0) return true;
            await new Promise(r => setTimeout(r, 150));
        }
        return false;
    }

    /**
     * Notify the service that the user toggled manual offline mode.
     * When false (going online), promotes offline_pending → queued and starts uploading immediately.
     */
    setForcedOfflineMode(forced: boolean): void {
        this.isOfflineModeForced = forced;
        if (forced) {
            this.queue.forEach(t => {
                if (t.status === 'queued' || t.status === 'retrying') {
                    t.status = 'offline_pending';
                }
            });
            this.saveQueue().catch(() => {});
        } else if (!this.isOffline) {
            console.log('[Upload] 🟢 Forced offline lifted — resuming queue immediately');
            this.resumeAll().catch(() => {});
        }
    }

    /** Clear completed/old tasks */
    async cleanup(): Promise<void> {
        this.queue = this.queue.filter(t => t.status !== 'completed');
        await this.saveQueue();
    }

    // ─── Network Listener ─────────────────────────────────────────────────────

    private startNetworkListener(): void {
        if (this.unsubscribeNetInfo) return; // Already listening

        this.unsubscribeNetInfo = NetInfo.addEventListener(state => {
            const wasOffline = this.isOffline;
            this.isOffline   = !state.isConnected || state.isInternetReachable === false;

            if (wasOffline && !this.isOffline && !this.isOfflineModeForced) {
                // Transition: offline → online
                console.log('[Upload] 🌐 Network restored — flushing offline queue...');
                this.resumeAll().catch(() => {});
            }
        });

        console.log('[Upload] 👂 Network listener registered');
    }

    // ─── Internal Parallel Worker Pool ────────────────────────────────────────

    private pickNextTask(): UploadTask | undefined {
        const candidates = this.queue.filter(t => t.status === 'queued' || t.status === 'retrying');
        if (candidates.length === 0) return undefined;

        // Prioritize images/signatures (small files < 300KB) ahead of videos so photos complete in < 1s
        candidates.sort((a, b) => {
            const aIsVideo = a.contentType.includes('video') ? 1 : 0;
            const bIsVideo = b.contentType.includes('video') ? 1 : 0;
            if (aIsVideo !== bIsVideo) return aIsVideo - bIsVideo;
            return a.createdAt - b.createdAt;
        });

        return candidates[0];
    }

    private processQueue(): void {
        if (this.isCurrentlyOffline()) return;

        while (this.activeWorkers < MAX_CONCURRENT_UPLOADS) {
            const nextTask = this.pickNextTask();
            if (!nextTask) break;

            // Mark as 'uploading' synchronously before spawning worker so next iteration picks a different task
            nextTask.status = 'uploading';
            this.activeWorkers++;

            this.runWorker(nextTask).finally(() => {
                this.activeWorkers--;
                if (!this.isCurrentlyOffline() && this.pickNextTask()) {
                    this.processQueue();
                } else if (this.activeWorkers === 0) {
                    const hasPending = this.queue.some(t =>
                        ['queued','retrying','uploading','offline_pending'].includes(t.status)
                    );
                    if (!hasPending && this.sessionCompletedCount > 0) {
                        console.log(`[Upload] ✨ Queue drained — ${this.sessionCompletedCount} file(s) uploaded`);
                        const count = this.sessionCompletedCount;
                        this.sessionCompletedCount = 0;
                        this.drainedListeners.forEach(cb => {
                            try { cb(count); } catch { /* silent */ }
                        });
                    }
                }
            });
        }
    }

    private async runWorker(task: UploadTask): Promise<void> {
        this.notifyProgress(task);
        await this.saveQueue();

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                // Abort if we went offline while waiting for retry
                if (this.isCurrentlyOffline()) {
                    task.status = 'offline_pending';
                    this.notifyProgress(task);
                    await this.saveQueue();
                    return;
                }

                // Verify file still exists (fallback to compressedUri or originalUri if needed)
                let sourceUri = task.localUri;
                let fileInfo = await FileSystem.getInfoAsync(sourceUri);
                if (!fileInfo.exists && task.compressedUri) {
                    fileInfo = await FileSystem.getInfoAsync(task.compressedUri);
                    if (fileInfo.exists) sourceUri = task.compressedUri;
                }
                if (!fileInfo.exists && task.originalUri) {
                    fileInfo = await FileSystem.getInfoAsync(task.originalUri);
                    if (fileInfo.exists) sourceUri = task.originalUri;
                }

                if (!fileInfo.exists) {
                    console.error(`[Upload] ❌ File missing: ${task.localUri}`);
                    task.status    = 'failed';
                    task.lastError = 'File no longer exists';
                    this.notifyProgress(task);
                    await this.saveQueue();
                    return;
                }

                // Get signed URL from R2 Edge Function (com retry para concorrência e resiliência)
                let signData: any = null;
                let signError: any = null;
                for (let signAttempt = 0; signAttempt < 2; signAttempt++) {
                    const res = await supabase.functions.invoke('r2-operations', {
                        body: { action: 'upload', path: task.remotePath, bucketType: 'private', contentType: task.contentType }
                    });
                    signData = res.data;
                    signError = res.error;
                    if (!signError && signData?.signedUrl) break;
                    if (signAttempt === 0) {
                        console.warn(`[Upload] ⚠️ Falha ao obter Signed URL para ${task.id} (tentativa 1/2): ${signError?.message}. Retentando...`);
                        await new Promise(r => setTimeout(r, 1200));
                    }
                }
                if (signError || !signData?.signedUrl) {
                    throw new Error(signError?.message || 'Failed to get signed URL');
                }

                // 🚀 Native binary streaming upload from disk to R2 (zero Base64 OOM, max throughput)
                const fileUri = (sourceUri.startsWith('/') && !sourceUri.startsWith('file://'))
                    ? `file://${sourceUri}`
                    : sourceUri;

                const uploadResult = await FileSystem.uploadAsync(signData.signedUrl, fileUri, {
                    httpMethod: 'PUT',
                    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
                    headers: {
                        'Content-Type': task.contentType,
                    },
                });

                if (uploadResult.status < 200 || uploadResult.status >= 300) {
                    throw new Error(`R2 Upload Failed: status ${uploadResult.status}`);
                }

                // ✅ Success
                task.status        = 'completed';
                task.resultUrl     = signData.publicUrl;
                task.completedAt   = Date.now();
                task.uploadedBytes = task.totalBytes;
                this.sessionCompletedCount++;

                console.log(`[Upload] ✅ ${task.id} → ${signData.publicUrl}`);
                await this.saveQueue();
                this.notifyProgress(task);

                return; // Exit retry loop

            } catch (error: any) {
                task.retryCount = attempt + 1;
                task.lastError  = error?.message || 'Unknown error';

                if (this.isCurrentlyOffline()) {
                    task.status = 'offline_pending';
                    this.notifyProgress(task);
                    await this.saveQueue();
                    return;
                }

                if (attempt < MAX_RETRIES && isRetryableError(error)) {
                    const delay = Math.min(
                        800 * Math.pow(2, attempt) + Math.random() * 500,
                        MAX_RETRY_DELAY_MS
                    );
                    console.warn(
                        `[Upload] ⚡ ${task.id} attempt ${attempt + 1}/${MAX_RETRIES}: ` +
                        `${error.message} — retry in ${Math.round(delay / 1000)}s`
                    );
                    task.status = 'retrying';
                    this.notifyProgress(task);
                    await this.saveQueue();
                    await new Promise(r => setTimeout(r, delay));
                    task.status = 'uploading';
                } else {
                    console.error(`[Upload] ❌ ${task.id} failed: ${error.message}`);
                    task.status = 'failed';
                    this.notifyProgress(task);
                    await this.saveQueue();
                    return;
                }
            }
        }
    }

    private notifyProgress(task: UploadTask): void {
        this.progressListeners.forEach(cb => {
            try { cb(task); } catch { /* silent */ }
        });
    }

    // ─── Persistence ──────────────────────────────────────────────────────────

    private async saveQueue(): Promise<void> {
        try {
            const cutoff = Date.now() - 24 * 60 * 60 * 1000; // 24h retention
            const fileCleanupCutoff = Date.now() - 2 * 60 * 60 * 1000; // 2h local file retention after completion

            // Cleanup old completed safe-copy files on disk (> 2h old)
            for (const t of this.queue) {
                if (t.status === 'completed' && t.completedAt && t.completedAt < fileCleanupCutoff && t.localUri.includes('nexus_upload_')) {
                    FileSystem.deleteAsync(t.localUri, { idempotent: true }).catch(() => {});
                }
            }

            this.queue = this.queue.filter(t =>
                t.createdAt > cutoff || t.status !== 'completed'
            );
            const docDir = FileSystem.documentDirectory || '';
            const safeString = JSON.stringify(this.queue).split(docDir).join('<DOC_DIR>');
            await AsyncStorage.setItem(UPLOAD_QUEUE_KEY, safeString);
        } catch (e) {
            console.warn('[Upload] ⚠️ Failed to persist queue:', e);
        }
    }

    private async loadQueue(): Promise<void> {
        try {
            const raw = await AsyncStorage.getItem(UPLOAD_QUEUE_KEY);
            if (raw) {
                const docDir = FileSystem.documentDirectory || '';
                const restored = raw.split('<DOC_DIR>').join(docDir);
                const parsed: UploadTask[] = JSON.parse(restored);
                // Merge with any in-memory tasks added before loadQueue resolved
                const existingIds = new Set(this.queue.map(t => t.id));
                for (const item of parsed) {
                    if (!existingIds.has(item.id)) {
                        if (item.status === 'uploading') item.status = 'retrying';
                        this.queue.push(item);
                    }
                }
                console.log(`[Upload] 📦 Loaded ${this.queue.length} tasks from disk`);
            }
        } catch (e) {
            console.warn('[Upload] ⚠️ Failed to load queue:', e);
        }
    }

    // ─── File Safety ──────────────────────────────────────────────────────────

    private async copyToSafeLocation(uri: string): Promise<string> {
        try {
            if (uri.startsWith(FileSystem.documentDirectory || '')) return uri;

            if (uri.startsWith('data:')) {
                const ext      = uri.includes('png') ? 'png' : 'webp';
                const safePath = `${FileSystem.documentDirectory}nexus_upload_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.${ext}`;
                const base64   = uri.split(',')[1];
                await FileSystem.writeAsStringAsync(safePath, base64, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                return safePath;
            }

            const filename = uri.split('/').pop() || `file_${Date.now()}`;
            const safePath = `${FileSystem.documentDirectory}nexus_upload_${Date.now()}_${filename}`;
            await FileSystem.copyAsync({ from: uri, to: safePath });
            return safePath;

        } catch (e) {
            console.warn('[Upload] ⚠️ Could not copy to safe location:', e);
            return uri;
        }
    }
}

export const resilientUpload = new ResilientUploadService();

