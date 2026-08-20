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
import { decode } from 'base64-arraybuffer';
import NetInfo from '@react-native-community/netinfo';
import { supabase } from './supabase';
import { isRetryableError } from './connection-diagnostics';

// ─── Configuration ────────────────────────────────────────────────────────────
const UPLOAD_QUEUE_KEY   = '@nexus:upload_queue_v2';
const MAX_RETRY_DELAY_MS = 60_000;
const MAX_RETRIES        = 5;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UploadTask {
    id:            string;
    localUri:      string;    // Safe copy in documentDirectory
    remotePath:    string;    // Target path in R2 storage
    contentType:   string;
    totalBytes:    number;
    uploadedBytes: number;
    status: 'queued' | 'uploading' | 'completed' | 'failed' | 'retrying' | 'offline_pending';
    retryCount:    number;
    lastError?:    string;
    createdAt:     number;
    completedAt?:  number;
    resultUrl?:    string;    // Public URL after successful upload
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
    private isProcessing          = false;
    private isOffline             = false;  // Tracks real connectivity (from NetInfo)
    private isOfflineModeForced   = false;  // Tracks manual offline mode (from syncService toggle)
    private progressListeners:    Set<UploadProgressCallback>   = new Set();
    private drainedListeners:     Set<QueueDrainedCallback>     = new Set();
    private unsubscribeNetInfo:   (() => void) | null           = null;
    private sessionCompletedCount = 0;      // Counts uploads completed since last drain

    constructor() {
        this.loadQueue().then(() => {
            this.startNetworkListener();
        });
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
     * Enqueue a file for background upload.
     *
     * ▸ Online  → copies to safe location + starts upload immediately.
     * ▸ Offline → copies to safe location + marks as `offline_pending`,
     *             will auto-upload when network returns.
     *
     * Returns the task ID.
     */
    async enqueue(
        localUri:    string,
        remotePath:  string,
        contentType: string = 'image/webp'
    ): Promise<string> {
        // 1. Persist file to documentDirectory (survive cache wipes)
        const safeUri = await this.copyToSafeLocation(localUri);

        // 2. Get file size
        const fileInfo  = await FileSystem.getInfoAsync(safeUri);
        const totalBytes = fileInfo.exists ? (fileInfo as any).size || 0 : 0;

        // 3. Determine initial status
        const isCurrentlyOffline = this.isOffline || this.isOfflineModeForced;
        const initialStatus: UploadTask['status'] = isCurrentlyOffline ? 'offline_pending' : 'queued';

        // 4. Create task
        const task: UploadTask = {
            id:           `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            localUri:     safeUri,
            remotePath,
            contentType,
            totalBytes,
            uploadedBytes: 0,
            status:       initialStatus,
            retryCount:   0,
            createdAt:    Date.now(),
        };

        this.queue.push(task);
        await this.saveQueue();
        this.notifyProgress(task);

        console.log(
            `[Upload] 📤 Enqueued [${initialStatus}]: ` +
            `${task.id} (${(totalBytes / 1024).toFixed(1)}KB → ${remotePath})`
        );

        // Start processing immediately if online
        if (!isCurrentlyOffline) {
            this.processQueue();
        }

        return task.id;
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

        return new Promise<string | null>((resolve) => {
            const check = setInterval(() => {
                const task = this.queue.find(t => t.id === taskId);
                if (!task)                                          { clearInterval(check); resolve(null);               return; }
                if (task.status === 'completed')                    { clearInterval(check); resolve(task.resultUrl || null); return; }
                if (task.status === 'failed' && task.retryCount >= MAX_RETRIES) { clearInterval(check); resolve(null); return; }
            }, 500);

            // 5-minute hard timeout
            setTimeout(() => { clearInterval(check); resolve(null); }, 5 * 60_000);
        });
    }

    /**
     * Resume all interrupted/offline-pending uploads.
     * Called on app start, foreground return, and network reconnect.
     */
    async resumeAll(): Promise<void> {
        await this.loadQueue();

        const isCurrentlyOffline = this.isOffline || this.isOfflineModeForced;
        if (isCurrentlyOffline) {
            console.log('[Upload] ⏸ resumeAll skipped — still offline');
            return;
        }

        const pending = this.queue.filter(t =>
            t.status === 'pending'       ||
            t.status === 'queued'        ||
            t.status === 'retrying'      ||
            t.status === 'offline_pending'
        );

        if (pending.length > 0) {
            console.log(`[Upload] 🔄 Resuming ${pending.length} uploads (online restored)`);
            pending.forEach(t => {
                // Promote offline_pending → queued so processQueue picks them up
                if (t.status === 'offline_pending') t.status = 'queued';
                if (t.status === 'uploading')       t.status = 'retrying';
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

    /**
     * Notify the service that the user toggled manual offline mode.
     * When false (going online), promotes offline_pending → queued.
     */
    setForcedOfflineMode(forced: boolean): void {
        this.isOfflineModeForced = forced;
        if (!forced && !this.isOffline) {
            console.log('[Upload] 🟢 Forced offline lifted — resuming queue');
            this.resumeAll();
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
            const wasOffline    = this.isOffline;
            this.isOffline      = !state.isConnected;

            if (wasOffline && !this.isOffline && !this.isOfflineModeForced) {
                // Transition: offline → online
                console.log('[Upload] 🌐 Network restored — flushing offline queue...');
                this.resumeAll();
            }
        });

        console.log('[Upload] 👂 Network listener registered');
    }

    // ─── Internal Processing ──────────────────────────────────────────────────

    private async processQueue(): Promise<void> {
        if (this.isProcessing) return;
        this.isProcessing = true;
        this.sessionCompletedCount = 0;

        try {
            while (true) {
                const nextTask = this.queue.find(t =>
                    t.status === 'queued' || t.status === 'retrying'
                );
                if (!nextTask) break;

                // Stop processing if we went offline mid-queue
                if (this.isOffline || this.isOfflineModeForced) {
                    console.log('[Upload] ⏸ Gone offline — pausing queue');
                    nextTask.status = 'offline_pending';
                    await this.saveQueue();
                    break;
                }

                await this.uploadSingleFile(nextTask);
            }
        } finally {
            this.isProcessing = false;

            // Check if all uploads are now done — fire drain callbacks
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
    }

    private async uploadSingleFile(task: UploadTask): Promise<void> {
        task.status = 'uploading';
        this.notifyProgress(task);
        await this.saveQueue();

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                // Abort if we went offline while waiting for retry
                if (this.isOffline || this.isOfflineModeForced) {
                    task.status = 'offline_pending';
                    this.notifyProgress(task);
                    await this.saveQueue();
                    return;
                }

                // Verify file still exists (Section 6.3)
                const fileInfo = await FileSystem.getInfoAsync(task.localUri);
                if (!fileInfo.exists) {
                    console.error(`[Upload] ❌ File missing: ${task.localUri}`);
                    task.status    = 'failed';
                    task.lastError = 'File no longer exists';
                    this.notifyProgress(task);
                    await this.saveQueue();
                    return;
                }

                // Read as base64 and decode to ArrayBuffer
                const base64 = await FileSystem.readAsStringAsync(task.localUri, {
                    encoding: 'base64',
                });
                if (!base64 || base64.length === 0) throw new Error('Empty file content');

                const arrayBuffer   = decode(base64);
                task.uploadedBytes  = arrayBuffer.byteLength;

                // Get signed URL from R2 Edge Function
                const { data: signData, error: signError } = await supabase.functions.invoke('r2-operations', {
                    body: { action: 'upload', path: task.remotePath, bucketType: 'private', contentType: task.contentType }
                });
                if (signError || !signData?.signedUrl) {
                    throw new Error(signError?.message || 'Failed to get signed URL');
                }

                // Upload with 60s network timeout
                const networkTimeout = new Promise<Response>((_, rej) =>
                    setTimeout(() => rej(new Error('NETWORK_TIMEOUT_60S')), 60_000)
                );
                const response = await Promise.race([
                    fetch(signData.signedUrl, {
                        method:  'PUT',
                        body:    arrayBuffer,
                        headers: { 'Content-Type': task.contentType },
                    }),
                    networkTimeout,
                ]);

                if (!response.ok) {
                    throw new Error(`R2 Upload Failed: ${response.status} ${response.statusText}`);
                }

                // ✅ Success
                task.status       = 'completed';
                task.resultUrl    = signData.publicUrl;
                task.completedAt  = Date.now();
                task.uploadedBytes = task.totalBytes;
                this.sessionCompletedCount++;

                console.log(`[Upload] ✅ ${task.id} → ${signData.publicUrl}`);
                this.notifyProgress(task);
                await this.saveQueue();

                // Delete the safe-copy after successful upload
                try {
                    if (task.localUri.includes('nexus_upload_')) {
                        await FileSystem.deleteAsync(task.localUri, { idempotent: true });
                    }
                } catch { /* silent cleanup */ }

                return; // Exit retry loop

            } catch (error: any) {
                task.retryCount = attempt + 1;
                task.lastError  = error?.message || 'Unknown error';

                if (attempt < MAX_RETRIES && isRetryableError(error)) {
                    const delay = Math.min(
                        1000 * Math.pow(2, attempt) + Math.random() * 1000,
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
            this.queue = this.queue.filter(t =>
                t.createdAt > cutoff || t.status !== 'completed'
            );
            await AsyncStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.warn('[Upload] ⚠️ Failed to persist queue:', e);
        }
    }

    private async loadQueue(): Promise<void> {
        try {
            const raw = await AsyncStorage.getItem(UPLOAD_QUEUE_KEY);
            if (raw) {
                this.queue = JSON.parse(raw);
                console.log(`[Upload] 📦 Loaded ${this.queue.length} tasks from disk`);
            }
        } catch (e) {
            console.warn('[Upload] ⚠️ Failed to load queue:', e);
            this.queue = [];
        }
    }

    // ─── File Safety ──────────────────────────────────────────────────────────

    private async copyToSafeLocation(uri: string): Promise<string> {
        try {
            if (uri.startsWith(FileSystem.documentDirectory || '')) return uri;

            if (uri.startsWith('data:')) {
                const ext      = uri.includes('png') ? 'png' : 'webp';
                const safePath = `${FileSystem.documentDirectory}nexus_upload_${Date.now()}.${ext}`;
                const base64   = uri.split(',')[1];
                await FileSystem.writeAsStringAsync(safePath, base64, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                return safePath;
            }

            const filename = uri.split('/').pop() || `file_${Date.now()}`;
            const safePath = `${FileSystem.documentDirectory}nexus_upload_${filename}`;
            await FileSystem.copyAsync({ from: uri, to: safePath });
            return safePath;

        } catch (e) {
            console.warn('[Upload] ⚠️ Could not copy to safe location:', e);
            return uri;
        }
    }
}

export const resilientUpload = new ResilientUploadService();
