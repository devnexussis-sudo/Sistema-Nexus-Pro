
import { supabase } from '../lib/supabase';
import { DataService } from './dataService'; // Temporarily needed for tenant ID access helper if not moved yet, but ideally we move logic here.
import { getCurrentTenantId } from '../lib/tenantContext';
import { logger } from '../lib/logger';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);



export interface UploadedFile {
    id: string;
    url: string;
    fieldId?: string;
    uploadedAt: string;
    uploadedBy?: string;
    signerName?: string;
}

export const StorageService = {
    /**
     * 🎛️ Nexus Image Compression Engine (WebP Optimized)
     * Reduz o peso da imagem drasticamente usando o padrão WebP.
     */
    compressImage: async (base64: string, maxWidth = 1200, quality = 0.82): Promise<string> => {
        return new Promise((resolve) => {
            try {
                const img = new Image();
                img.src = base64;
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;

                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }

                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext('2d');
                        if (!ctx) {
                            console.warn('Canvas context failed, returning original');
                            resolve(base64);
                            return;
                        }

                        ctx.fillStyle = "#FFFFFF";
                        ctx.fillRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);

                        const compressedBase64 = canvas.toDataURL('image/webp', quality);
                        resolve(compressedBase64);
                    } catch (innerErr) {
                        console.error('Error during canvas processing:', innerErr);
                        resolve(base64);
                    }
                };
                img.onerror = () => {
                    console.warn('Image load failed, returning original');
                    resolve(base64);
                };
            } catch (err) {
                console.error('Critical compression error:', err);
                resolve(base64);
            }
        });
    },

    /**
     * 🛡️ NASA-Grade Storage Engine (Internal Version 5 - RESILIENT)
     */
    _uploadCore: async (blobOrFile: Blob | File, path: string, retryCount = 2, signal?: AbortSignal): Promise<string> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) {
            console.error("[Storage] ❌ ERRO: TenantID não encontrado. Abortando upload.");
            throw new Error("AUTH_TENANT_MISSING");
        }

        const cleanPath = path.toString().replace(/^\/+/, '').replace(/\/+$/, '');
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.webp`;
        const fullPath = `${tenantId}/${cleanPath}/${fileName}`.replace(/\/+/g, '/');

        console.log(`[Storage] 📤 Uploading ${fullPath} (${(blobOrFile.size / 1024).toFixed(0)}KB)...`);

        for (let i = 0; i <= retryCount; i++) {
            if (signal?.aborted) throw new Error('AbortError');

            try {
                const uploadPromise = supabase.storage
                    .from('nexus-files')
                    .upload(fullPath, blobOrFile, {
                        contentType: 'image/webp',
                        upsert: true,
                        cacheControl: '3600'
                    });

                const networkTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('NETWORK_TIMEOUT_45S')), 45000));
                const { data, error } = await Promise.race([uploadPromise, networkTimeout]) as any;

                if (error) throw error;
                if (!data) throw new Error("EMPTY_STORAGE_RESPONSE");

                const { data: urlData } = supabase.storage
                    .from('nexus-files')
                    .getPublicUrl(fullPath);

                return urlData.publicUrl;
            } catch (err: any) {
                if (err.name === 'AbortError' || signal?.aborted) throw err;
                console.warn(`[Storage] ⚠️ Tentativa ${i + 1} falhou:`, err.message);

                if (i === retryCount) throw err;
                await new Promise(resolve => setTimeout(resolve, 1500));
            }
        }

        throw new Error("STORAGE_UNREACHABLE");
    },

    /**
     * 🎯 AGGRESSIVE INTELLIGENT COMPRESSOR (V5 - MEMORY SAFE)
     */
    processAndCompress: async (file: File, signal?: AbortSignal): Promise<Blob> => {
        const TARGET_SIZE = 240 * 1024;
        const fileName = (file.name || '').toLowerCase();
        const fileType = (file.type || '').toLowerCase();

        let workingFile: Blob | File = file;

        const isHeic = fileType.includes('heic') || fileType.includes('heif') ||
            fileName.endsWith('.heic') || fileName.endsWith('.heif') || fileName.endsWith('.hif');

        if (isHeic) {
            try {
                let heic2any = (window as any).heic2any;
                if (!heic2any) {
                    // Dynamic injection fallback logic would go here if needed again
                    // For now assuming heic2any is loaded or we fail gracefully
                    console.warn("heic2any library not found for HEIC conversion");
                    // return file; // Fallback
                }

                if (heic2any) {
                    const converted = await heic2any({
                        blob: file,
                        toType: 'image/jpeg',
                        quality: 0.6
                    });
                    workingFile = Array.isArray(converted) ? converted[0] : converted;
                }
            } catch (e) {
                console.warn("[Compress] ⚠️ HEIC Decode Failed:", e);
                throw new Error('HEIC_DECODE_ERROR');
            }
        }

        const url = URL.createObjectURL(workingFile);
        try {
            const img = new Image();
            const loadPromise = new Promise((res, rej) => {
                img.onload = () => res(true);
                img.onerror = () => rej(new Error(`IMG_LOAD_FAIL: ${file.name}`));
                img.src = url;
            });
            const loadTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('IMG_LOAD_TIMEOUT')), 15000));
            await Promise.race([loadPromise, loadTimeout]);

            const strategies = [{ w: 1024, q: 0.7 }, { w: 800, q: 0.6 }, { w: 640, q: 0.5 }];

            for (const s of strategies) {
                if (signal?.aborted) throw new Error('AbortError');

                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > s.w || height > s.w) {
                    const ratio = Math.min(s.w / width, s.w / height);
                    width = Math.round(width * ratio);
                    height = Math.round(height * ratio);
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d', { alpha: false });
                if (!ctx) throw new Error('CANVAS_FAIL');

                ctx.imageSmoothingEnabled = true;
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                const blob = await new Promise<Blob>((res, rej) => {
                    canvas.toBlob((b) => b ? res(b) : rej(new Error('BLOB_NULL')), 'image/webp', s.q);
                });

                canvas.width = 0; canvas.height = 0;

                if (blob.size <= TARGET_SIZE) return blob;
                if (s === strategies[strategies.length - 1]) return blob;
            }

            throw new Error('COMPRESSION_FAILED');
        } finally {
            URL.revokeObjectURL(url);
        }
    },

    /**
     * 🛡️ Optimized Blob Upload
     */
    uploadBlob: async (blob: Blob, path: string, signal?: AbortSignal): Promise<string> => {
        if (!isCloudEnabled) return URL.createObjectURL(blob);
        return StorageService._uploadCore(blob, path, 2, signal);
    },

    /**
     * 🛡️ Nexus Storage Interface (Base64 wrapper)
     */
    uploadFile: async (base64: string, path: string): Promise<string> => {
        if (!isCloudEnabled || !base64.startsWith('data:image')) return base64;
        try {
            const compressedBase64 = await StorageService.compressImage(base64);
            const base64Data = compressedBase64.split(',')[1];
            const binaryData = atob(base64Data);
            const uint8Array = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
                uint8Array[i] = binaryData.charCodeAt(i);
            }
            const blob = new Blob([uint8Array], { type: 'image/webp' });
            return StorageService._uploadCore(blob, path);
        } catch (err) {
            console.error("UploadFile Error:", err);
            throw err;
        }
    },

    /**
     * Upload de evidência de OS (Alias para compatibilidade)
     */
    uploadServiceOrderEvidence: async (file: File, orderId: string, signal?: AbortSignal): Promise<string> => {
        if (!isCloudEnabled) return URL.createObjectURL(file);
        try {
            const compressedBlob = await StorageService.processAndCompress(file, signal);
            const webpFile = new File([compressedBlob], `photo_${Date.now()}.webp`, { type: 'image/webp' });
            return await StorageService.uploadBlob(webpFile, `orders/${orderId}/evidence`, signal);
        } catch (err: any) {
            console.error(`[PhotoUpload] ❌ Falha:`, err.message);
            throw err;
        }
    },

    /**
     * Upload de foto genérica (Compatibilidade com antigo StorageService)
     */
    uploadPhoto: async (orderId: string, fieldId: string, file: File, uploadedBy?: string): Promise<UploadedFile> => {
        const url = await StorageService.uploadServiceOrderEvidence(file, orderId);
        return {
            id: `photo-${Date.now()}`,
            url,
            fieldId,
            uploadedAt: new Date().toISOString(),
            uploadedBy
        };
    },

    /**
     * Upload de assinatura (Compatibilidade)
     */
    uploadSignature: async (orderId: string, fieldId: string, signatureData: string | Blob, signerName?: string): Promise<UploadedFile> => {
        let url: string;
        if (typeof signatureData === 'string') {
            url = await StorageService.uploadFile(signatureData, `orders/${orderId}/signatures`);
        } else {
            url = await StorageService.uploadBlob(signatureData, `orders/${orderId}/signatures`);
        }

        return {
            id: `signature-${Date.now()}`,
            url,
            fieldId,
            uploadedAt: new Date().toISOString(),
            signerName
        };
    },

    /**
     * Deleta um arquivo
     */
    deleteFile: async (url: string): Promise<void> => {
        // Extrai o path relativo da URL se necessário, ou aceita path direto
        // Implementação básica
        if (!url) return;
        // TODO: Implementar delete real parseando a URL
    }
};
