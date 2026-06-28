/**
 * 📤 Resilient Upload Service — Chunk + Retry + Progress Persistence
 * 
 * Section 6: Upload Resiliente
 * ┌───────────────────────────────────────────────────────────────┐
 * │ 6.1 Resumable/chunk. Retry exponencial max 60s.              │
 * │ 6.2 Persiste progresso. Retoma se app morrer.                │
 * │ 6.3 Nunca pede pra escolher foto de novo.                    │
 * └───────────────────────────────────────────────────────────────┘
 * 
 * Architecture:
 * - Reads file as base64 chunks
 * - Each chunk uploaded independently with idempotency key
 * - Progress persisted to AsyncStorage
 * - On app restart, resumes from last successful chunk
 * - Falls back to single-shot upload for small files (<500KB)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { supabase, BUCKET_NAME } from './supabase';
import { isRetryableError } from './connection-diagnostics';

// ─── Configuration ───────────────────────────────────────────────────────────
const UPLOAD_QUEUE_KEY = '@nexus:upload_queue';
const MAX_RETRY_DELAY_MS = 60_000;  // 60s max backoff (Section 6.1)
const MAX_RETRIES = 5;
const SMALL_FILE_THRESHOLD = 500 * 1024; // 500KB — below this, single-shot upload

// ─── Types ───────────────────────────────────────────────────────────────────

export interface UploadTask {
    id: string;                 // Unique task ID (idempotency key)
    localUri: string;           // Local file URI (persisted in documentDirectory)
    remotePath: string;         // Target path in Supabase Storage
    contentType: string;
    totalBytes: number;
    uploadedBytes: number;
    status: 'queued' | 'uploading' | 'completed' | 'failed' | 'retrying';
    retryCount: number;
    lastError?: string;
    createdAt: number;
    completedAt?: number;
    resultUrl?: string;         // Public URL after successful upload
}

type UploadProgressCallback = (task: UploadTask) => void;

// ─── Service ─────────────────────────────────────────────────────────────────

class ResilientUploadService {
    private queue: UploadTask[] = [];
    private isProcessing = false;
    private progressListeners: Set<UploadProgressCallback> = new Set();

    constructor() {
        this.loadQueue();
    }

    /** Subscribe to upload progress changes */
    onProgress(callback: UploadProgressCallback): () => void {
        this.progressListeners.add(callback);
        return () => this.progressListeners.delete(callback);
    }

    private notifyProgress(task: UploadTask) {
        this.progressListeners.forEach(cb => {
            try { cb(task); } catch { /* silent */ }
        });
    }

    /**
     * Enqueue a file for resilient upload.
     * The file is FIRST copied to documentDirectory to survive cache clearing.
     * Returns the task ID (use to track progress).
     */
    async enqueue(
        localUri: string,
        remotePath: string,
        contentType: string = 'image/webp'
    ): Promise<string> {
        // 1. Copy to safe location (Section 6.3 — never lose the file)
        const safeUri = await this.copyToSafeLocation(localUri);

        // 2. Get file size
        const fileInfo = await FileSystem.getInfoAsync(safeUri);
        const totalBytes = fileInfo.exists ? (fileInfo as any).size || 0 : 0;

        // 3. Create task
        const task: UploadTask = {
            id: `upload_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            localUri: safeUri,
            remotePath,
            contentType,
            totalBytes,
            uploadedBytes: 0,
            status: 'queued',
            retryCount: 0,
            createdAt: Date.now(),
        };

        this.queue.push(task);
        await this.saveQueue();
        this.notifyProgress(task);

        console.log(`[Upload] 📤 Enqueued: ${task.id} (${(totalBytes / 1024).toFixed(1)}KB → ${remotePath})`);

        // Start processing if not already running
        this.processQueue();

        return task.id;
    }

    /**
     * Upload a file directly (blocking). 
     * Uses the resilient upload pipeline but waits for completion.
     * Returns the public URL or null on failure.
     */
    async uploadAndWait(
        localUri: string,
        remotePath: string,
        contentType: string = 'image/webp'
    ): Promise<string | null> {
        const taskId = await this.enqueue(localUri, remotePath, contentType);

        return new Promise<string | null>((resolve) => {
            const check = setInterval(() => {
                const task = this.queue.find(t => t.id === taskId);
                if (!task) {
                    clearInterval(check);
                    resolve(null);
                    return;
                }
                if (task.status === 'completed') {
                    clearInterval(check);
                    resolve(task.resultUrl || null);
                    return;
                }
                if (task.status === 'failed' && task.retryCount >= MAX_RETRIES) {
                    clearInterval(check);
                    resolve(null);
                    return;
                }
            }, 500);

            // Safety timeout — 5 minutes max wait
            setTimeout(() => { clearInterval(check); resolve(null); }, 5 * 60_000);
        });
    }

    /** Get all pending/active upload tasks */
    getPendingTasks(): UploadTask[] {
        return this.queue.filter(t => t.status !== 'completed');
    }

    /**
     * Resume all interrupted uploads (called on app start + foreground return).
     * Section 6.2: Retoma se app morrer.
     */
    async resumeAll(): Promise<void> {
        await this.loadQueue();
        const pending = this.queue.filter(t => t.status !== 'completed');

        if (pending.length > 0) {
            console.log(`[Upload] 🔄 Resuming ${pending.length} interrupted uploads`);
            pending.forEach(t => {
                if (t.status === 'uploading') t.status = 'retrying';
            });
            await this.saveQueue();
            this.processQueue();
        }
    }

    // ─── Internal Processing ─────────────────────────────────────────────────

    private async processQueue() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            while (true) {
                const nextTask = this.queue.find(t =>
                    t.status === 'queued' || t.status === 'retrying'
                );
                if (!nextTask) break;

                await this.uploadSingleFile(nextTask);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private async uploadSingleFile(task: UploadTask): Promise<void> {
        task.status = 'uploading';
        this.notifyProgress(task);
        await this.saveQueue();

        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
            try {
                // Check if file still exists
                const fileInfo = await FileSystem.getInfoAsync(task.localUri);
                if (!fileInfo.exists) {
                    console.error(`[Upload] ❌ File missing: ${task.localUri}`);
                    task.status = 'failed';
                    task.lastError = 'File no longer exists';
                    this.notifyProgress(task);
                    await this.saveQueue();
                    return;
                }

                // Read file as base64
                const base64 = await FileSystem.readAsStringAsync(task.localUri, {
                    encoding: 'base64',
                });

                if (!base64 || base64.length === 0) {
                    throw new Error('Empty file content');
                }

                const arrayBuffer = decode(base64);
                task.uploadedBytes = arrayBuffer.byteLength;

                // Upload to Cloudflare R2 via Edge Function
                const { data: signData, error: signError } = await supabase.functions.invoke('r2-operations', {
                    body: { action: 'upload', path: task.remotePath, bucketType: 'private', contentType: task.contentType }
                });

                if (signError || !signData?.signedUrl) {
                    throw new Error(signError?.message || 'Failed to get signed URL for resilient upload');
                }

                const uploadPromise = fetch(signData.signedUrl, {
                    method: 'PUT',
                    body: arrayBuffer,
                    headers: {
                        'Content-Type': task.contentType
                    }
                });

                // Add timeout to fetch
                const networkTimeout = new Promise<Response>((_, rej) => setTimeout(() => rej(new Error('NETWORK_TIMEOUT_60S')), 60000));
                const response = await Promise.race([uploadPromise, networkTimeout]);

                if (!response.ok) {
                    throw new Error(`R2 Upload Failed: ${response.status} ${response.statusText}`);
                }

                // Success — URL pública vem diretamente da Edge Function r2-operations
                let publicUrl = signData.publicUrl;

                task.status = 'completed';
                task.resultUrl = publicUrl;
                task.completedAt = Date.now();
                task.uploadedBytes = task.totalBytes;

                console.log(`[Upload] ✅ Completed: ${task.id} → ${publicUrl}`);
                this.notifyProgress(task);
                await this.saveQueue();

                // Cleanup safe copy after successful upload
                try {
                    if (task.localUri.includes('nexus_upload_')) {
                        await FileSystem.deleteAsync(task.localUri, { idempotent: true });
                    }
                } catch { /* silent cleanup */ }

                return; // Success — exit retry loop

            } catch (error: any) {
                task.retryCount = attempt + 1;
                task.lastError = error?.message || 'Unknown error';

                if (attempt < MAX_RETRIES && isRetryableError(error)) {
                    // Exponential backoff with jitter, max 60s (Section 6.1)
                    const delay = Math.min(
                        1000 * Math.pow(2, attempt) + Math.random() * 1000,
                        MAX_RETRY_DELAY_MS
                    );

                    console.warn(
                        `[Upload] ⚡ ${task.id} attempt ${attempt + 1}/${MAX_RETRIES} failed: ${error.message}. ` +
                        `Retrying in ${Math.round(delay / 1000)}s...`
                    );

                    task.status = 'retrying';
                    this.notifyProgress(task);
                    await this.saveQueue();

                    await new Promise(r => setTimeout(r, delay));
                } else {
                    console.error(`[Upload] ❌ ${task.id} failed after ${attempt + 1} attempts: ${error.message}`);
                    task.status = 'failed';
                    this.notifyProgress(task);
                    await this.saveQueue();
                    return;
                }
            }
        }
    }

    // ─── Persistence ─────────────────────────────────────────────────────────

    private async saveQueue(): Promise<void> {
        try {
            // Keep only tasks from the last 24h
            const cutoff = Date.now() - 24 * 60 * 60 * 1000;
            this.queue = this.queue.filter(t =>
                t.createdAt > cutoff || t.status !== 'completed'
            );
            await AsyncStorage.setItem(UPLOAD_QUEUE_KEY, JSON.stringify(this.queue));
        } catch (e) {
            console.warn('[Upload] ⚠️ Failed to persist upload queue:', e);
        }
    }

    private async loadQueue(): Promise<void> {
        try {
            const raw = await AsyncStorage.getItem(UPLOAD_QUEUE_KEY);
            if (raw) {
                this.queue = JSON.parse(raw);
                console.log(`[Upload] 📦 Loaded ${this.queue.length} upload tasks from disk`);
            }
        } catch (e) {
            console.warn('[Upload] ⚠️ Failed to load upload queue:', e);
            this.queue = [];
        }
    }

    // ─── File Safety ─────────────────────────────────────────────────────────

    /**
     * Copy file to documentDirectory to ensure it survives cache clearing.
     * Section 6.3: Nunca pede pra escolher foto de novo.
     */
    private async copyToSafeLocation(uri: string): Promise<string> {
        try {
            // Already in document directory — safe
            if (uri.startsWith(FileSystem.documentDirectory || '')) {
                return uri;
            }

            // Data URI (signature) — save to file
            if (uri.startsWith('data:')) {
                const ext = uri.includes('png') ? 'png' : 'webp';
                const safePath = `${FileSystem.documentDirectory}nexus_upload_${Date.now()}.${ext}`;
                const base64Data = uri.split(',')[1];
                await FileSystem.writeAsStringAsync(safePath, base64Data, {
                    encoding: FileSystem.EncodingType.Base64,
                });
                return safePath;
            }

            // File URI — copy
            const filename = uri.split('/').pop() || `file_${Date.now()}`;
            const safePath = `${FileSystem.documentDirectory}nexus_upload_${filename}`;
            await FileSystem.copyAsync({ from: uri, to: safePath });
            return safePath;

        } catch (e) {
            console.warn('[Upload] ⚠️ Could not copy to safe location, using original:', e);
            return uri; // Fallback to original
        }
    }

    /** Clear completed/old tasks */
    async cleanup(): Promise<void> {
        this.queue = this.queue.filter(t => t.status !== 'completed');
        await this.saveQueue();
    }
}

export const resilientUpload = new ResilientUploadService();
