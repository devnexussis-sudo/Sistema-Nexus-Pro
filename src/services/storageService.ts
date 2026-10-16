import { publicSupabase, safeKey, supabase } from '../lib/supabase';

import { getCurrentTenantId } from '../lib/tenantContext';

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

                        const ctx = canvas.getContext('2d', { alpha: true });
                        if (!ctx) {
                            console.warn('Canvas context failed, returning original');
                            resolve(base64);
                            return;
                        }

                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.clearRect(0, 0, width, height);
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
     * 🧠 Resolve os paths técnicos para o novo padrão amigável da empresa
     */
    _resolveHumanPath: async (originalPath: string, providedTenantId?: string): Promise<{ finalPath: string, resolvedTenantId: string }> => {
        let cleanPath = originalPath.toString().replace(/^\/+/, '').replace(/\/+$/, '');
        let finalHumanPath = cleanPath;
        let tenantIdToUse = providedTenantId;

        try {
            if (cleanPath.startsWith('orders/')) {
                const parts = cleanPath.split('/');
                const orderId = parts[1];
                const subfolder = parts[2];

                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
                const orderQuery = supabase.from('orders').select('display_id, tenant_id');
                const { data } = isUuid
                    ? await orderQuery.eq('id', orderId).maybeSingle()
                    : await orderQuery.eq('display_id', orderId).maybeSingle();

                if (data) {
                    if (!tenantIdToUse) tenantIdToUse = data.tenant_id;
                    const code = data.display_id || orderId.substring(0, 8);

                    let subHuman = 'Arquivos';
                    if (subfolder === 'evidence') subHuman = 'Evidencias';
                    else if (subfolder === 'internal_notes') subHuman = 'Observacoes';
                    else if (subfolder === 'signatures') subHuman = 'Assinaturas';
                    else if (subfolder) subHuman = subfolder;

                    finalHumanPath = `Ordem de Servico/${code}/${subHuman}`;
                } else {
                    // Fallback for public dropzone
                    const { data: pData } = await publicSupabase.rpc('get_public_document', { doc_token: orderId, doc_type: 'order' });
                    if (pData) {
                        if (!tenantIdToUse) tenantIdToUse = pData.tenant_id;
                        const code = pData.display_id || pData.id?.substring(0, 8) || orderId.substring(0, 8);
                        let subHuman = 'Arquivos';
                        if (subfolder === 'signatures') subHuman = 'Assinaturas';
                        else if (subfolder) subHuman = subfolder;
                        finalHumanPath = `Ordem de Servico/${code}/${subHuman}`;
                    }
                }
            }
            else if (cleanPath.startsWith('quotes/')) {
                const parts = cleanPath.split('/');
                const quoteId = parts[1];
                const subfolder = parts[2];

                const { data } = await supabase.from('quotes').select('display_id, tenant_id').eq('id', quoteId).maybeSingle();
                if (data) {
                    if (!tenantIdToUse) tenantIdToUse = data.tenant_id;
                    const code = data.display_id || quoteId.substring(0, 8);

                    let subHuman = 'Arquivos';
                    if (subfolder === 'signatures') subHuman = 'Assinaturas';
                    else if (subfolder === 'rejections') subHuman = 'Rejeicoes';
                    else if (subfolder) subHuman = subfolder;

                    finalHumanPath = `Orcamentos/${code}/${subHuman}`;
                } else {
                    // Fallback for public dropzone
                    const { data: pData } = await publicSupabase.rpc('get_public_document', { doc_token: quoteId, doc_type: 'quote' });
                    if (pData) {
                        if (!tenantIdToUse) tenantIdToUse = pData.tenant_id;
                        const code = pData.display_id || pData.id?.substring(0, 8) || quoteId.substring(0, 8);
                        let subHuman = 'Arquivos';
                        if (subfolder === 'signatures') subHuman = 'Assinaturas';
                        else if (subfolder === 'rejections') subHuman = 'Rejeicoes';
                        else if (subfolder) subHuman = subfolder;
                        finalHumanPath = `Orcamentos/${code}/${subHuman}`;
                    }
                }
            }
            else if (cleanPath.startsWith('avatars/users/')) {
                const parts = cleanPath.split('/');
                const userId = parts[2];
                if (userId) {
                    const { data } = await supabase.from('users').select('name').eq('id', userId).maybeSingle();
                    const userName = data?.name ? data.name.trim().replace(/[^a-zA-Z0-9]/g, '_') : userId;
                    finalHumanPath = `Avatares/Usuarios/${userName}`;
                }
            }
            else if (cleanPath.startsWith('tenants/')) {
                const parts = cleanPath.split('/');
                if (parts[1] && parts[1] !== 'new' && parts[1] !== 'new_tenant' && parts[1] !== 'company') {
                    if (!tenantIdToUse || tenantIdToUse === 'anon' || tenantIdToUse === 'global') tenantIdToUse = parts[1];
                }
                finalHumanPath = `Configuracoes_Empresa/Logos`;
            }

            if (!tenantIdToUse) tenantIdToUse = 'global';

            // Buscar o nome fantasia do tenant caso seja um UUID válido
            let tenantNameStr = 'Empresa';
            const isTenantUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdToUse);
            if (isTenantUuid) {
                try {
                    // Try auth first
                    const { data: tData } = await supabase.from('tenants').select('trade_name, name, company_name').eq('id', tenantIdToUse).maybeSingle();
                    if (tData) {
                        const tName = tData.trade_name || tData.name || tData.company_name;
                        if (tName) tenantNameStr = tName.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
                    } else {
                        // Fallback via RPC public
                        const { data: pData } = await publicSupabase.rpc('get_public_tenant_info', { p_tenant_id: tenantIdToUse });
                        if (pData) {
                            const tName = pData.trade_name || pData.name || pData.company_name;
                            if (tName) tenantNameStr = tName.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
                        }
                    }
                } catch (tErr) {
                    console.warn('[Storage] Não foi possível obter nome do tenant:', tErr);
                }
            }

            const rootFolder = `${tenantNameStr}_${tenantIdToUse}`;

            return {
                finalPath: `${rootFolder}/${finalHumanPath}`.replace(/\/+/g, '/'),
                resolvedTenantId: tenantIdToUse
            };

        } catch (e) {
            console.error('[StorageService] ⚠️ Falha ao resolver HumanPath:', e);
            const fallbackRoot = tenantIdToUse ? `Empresa_${tenantIdToUse}` : 'Empresa';
            return {
                finalPath: `${fallbackRoot}/${cleanPath}`.replace(/\/+/g, '/'),
                resolvedTenantId: tenantIdToUse || 'global'
            };
        }
    },

    /**
     * 🛡️ NASA-Grade Storage Engine (Internal Version 5 - RESILIENT)
     */
    _uploadCore: async (
        blobOrFile: Blob | File,
        path: string,
        retryCount = 2,
        signal?: AbortSignal,
        options?: { contentType?: string; extension?: string; tenantId?: string }
    ): Promise<string> => {
        const pathTenant = path.startsWith('tenants/') ? path.split('/')[1] : undefined;
        const validPathTenant = (pathTenant && pathTenant !== 'company' && pathTenant !== 'new' && pathTenant !== 'new_tenant') ? pathTenant : undefined;
        const authTenantId = options?.tenantId || validPathTenant || getCurrentTenantId() || 'global';

        const resolved = await StorageService._resolveHumanPath(path, authTenantId);

        const ext = options?.extension || 'webp';
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
        const fullPath = `${resolved.finalPath}/${fileName}`.replace(/\/+/g, '/');
        const contentType = options?.contentType || 'image/webp';

        console.log(`[Storage/R2] 📤 Uploading ${fullPath} (${(blobOrFile.size / 1024).toFixed(0)}KB)...`);

        const session = (await supabase.auth.getSession())?.data?.session;
        const token = session?.access_token || safeKey;
        const authHeaders = {
            Authorization: `Bearer ${token}`,
            apikey: safeKey
        };

        for (let i = 0; i <= retryCount; i++) {
            if (signal?.aborted) throw new Error('AbortError');

            try {
                // 1. Pede a URL assinada para a Edge Function
                let signData: any = null;
                let signError: any = null;

                try {
                    const res = await supabase.functions.invoke('r2-operations', {
                        body: { action: 'upload', path: fullPath, bucketType: 'private', contentType },
                        headers: authHeaders
                    });
                    signData = res.data;
                    signError = res.error;
                } catch (invokeErr: any) {
                    signError = invokeErr;
                }

                // Fallback resiliente via publicSupabase com anon key se o cliente principal falhar
                if (signError || !signData?.signedUrl) {
                    console.warn(`[Storage/R2] ⚠️ Tentativa ${i + 1} com cliente principal falhou (${signError?.message || 'sem URL'}). Tentando via publicSupabase...`);
                    try {
                        const pubRes = await publicSupabase.functions.invoke('r2-operations', {
                            body: { action: 'upload', path: fullPath, bucketType: 'private', contentType },
                            headers: {
                                Authorization: `Bearer ${safeKey}`,
                                apikey: safeKey
                            }
                        });
                        if (pubRes.data?.signedUrl) {
                            signData = pubRes.data;
                            signError = null;
                        } else if (pubRes.error) {
                            signError = pubRes.error;
                        }
                    } catch (pubErr: any) {
                        signError = pubErr;
                    }
                }

                // 2. Faz o upload direto via PUT HTTP pro Cloudflare R2
                if (!signError && signData?.signedUrl) {
                    try {
                        const uploadPromise = fetch(signData.signedUrl, {
                            method: 'PUT',
                            body: blobOrFile,
                            headers: {
                                'Content-Type': contentType
                            },
                            signal
                        });

                        const networkTimeout = new Promise<Response>((_, rej) => setTimeout(() => rej(new Error('NETWORK_TIMEOUT_45S')), 45000));
                        const response = await Promise.race([uploadPromise, networkTimeout]);

                        if (response.ok) {
                            const envUrl = import.meta.env.VITE_R2_PUBLIC_URL;
                            if (envUrl) {
                                return envUrl.endsWith('/') ? `${envUrl}${fullPath}` : `${envUrl}/${fullPath}`;
                            }
                            return signData.publicUrl;
                        }

                        console.warn(`[Storage/R2] ⚠️ Direct PUT retornou status ${response.status}. Tentando direct-upload via Edge Function...`);
                    } catch (putErr: any) {
                        if (putErr.name === 'AbortError' || signal?.aborted) throw putErr;
                        console.warn(`[Storage/R2] ⚠️ Direct PUT falhou (${putErr.message}). Acionando fallback direct-upload via Edge Function...`);
                    }
                }

                // 3. Fallback Resiliente: Upload direto via Edge Function (evita bloqueios de CSP/Adblockers no cliente)
                console.log(`[Storage/R2] 🔄 Executando fallback direct-upload no servidor...`);
                const base64Data = await new Promise<string>((res, rej) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result as string);
                    reader.onerror = rej;
                    reader.readAsDataURL(blobOrFile);
                });

                let directRes = await supabase.functions.invoke('r2-operations', {
                    body: { action: 'direct-upload', path: fullPath, bucketType: 'private', contentType, base64: base64Data },
                    headers: authHeaders
                });

                if (directRes.error || !directRes.data?.publicUrl) {
                    directRes = await publicSupabase.functions.invoke('r2-operations', {
                        body: { action: 'direct-upload', path: fullPath, bucketType: 'private', contentType, base64: base64Data },
                        headers: {
                            Authorization: `Bearer ${safeKey}`,
                            apikey: safeKey
                        }
                    });
                }

                if (directRes.data?.publicUrl) {
                    console.log(`[Storage/R2] ✅ Fallback direct-upload concluído:`, directRes.data.publicUrl);
                    const envUrl = import.meta.env.VITE_R2_PUBLIC_URL;
                    if (envUrl) {
                        return envUrl.endsWith('/') ? `${envUrl}${fullPath}` : `${envUrl}/${fullPath}`;
                    }
                    return directRes.data.publicUrl;
                }

                throw new Error(directRes.error?.message || signError?.message || 'Falha ao enviar arquivo para o Cloudflare R2');

            } catch (err: any) {
                if (err.name === 'AbortError' || signal?.aborted) throw err;
                console.warn(`[Storage/R2] ⚠️ Tentativa ${i + 1} falhou:`, err.message);

                if (i === retryCount) throw err;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error("STORAGE_R2_UNREACHABLE");
    },

    /**
     * 🛡️ Cloudflare R2 Public Dropzone Engine (Upload direto e exclusivo para R2)
     */
    _uploadDropzoneCore: async (blobOrFile: Blob | File, path: string, retryCount = 2, signal?: AbortSignal): Promise<string> => {
        const resolved = await StorageService._resolveHumanPath(path);

        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.webp`;
        const fullPath = `${resolved.finalPath}/${fileName}`.replace(/\/+/g, '/');
        const contentType = 'image/webp';

        console.log(`[Storage/Dropzone-R2] 📤 Uploading strictly to Cloudflare R2: ${fullPath} (${(blobOrFile.size / 1024).toFixed(0)}KB)...`);

        const authHeaders = {
            Authorization: `Bearer ${safeKey}`,
            apikey: safeKey
        };

        for (let i = 0; i <= retryCount; i++) {
            if (signal?.aborted) throw new Error('AbortError');

            try {
                // 1. Pede a URL assinada publicSupabase com credenciais explícitas de anon
                let signData: any = null;
                let signError: any = null;

                try {
                    const res = await publicSupabase.functions.invoke('r2-operations', {
                        body: { action: 'upload', path: fullPath, bucketType: 'dropzone', contentType },
                        headers: authHeaders
                    });
                    signData = res.data;
                    signError = res.error;
                } catch (invokeErr: any) {
                    signError = invokeErr;
                }

                // 2. Faz o upload direto via PUT HTTP pro Cloudflare R2
                if (!signError && signData?.signedUrl) {
                    try {
                        const uploadPromise = fetch(signData.signedUrl, {
                            method: 'PUT',
                            body: blobOrFile,
                            headers: {
                                'Content-Type': contentType
                            },
                            signal
                        });

                        const networkTimeout = new Promise<Response>((_, rej) => setTimeout(() => rej(new Error('NETWORK_TIMEOUT_45S')), 45000));
                        const response = await Promise.race([uploadPromise, networkTimeout]);

                        if (response.ok) {
                            console.log(`[Storage/Dropzone-R2] ✅ Upload concluído com sucesso no Cloudflare R2:`, signData.publicUrl);
                            return signData.publicUrl;
                        }
                        console.warn(`[Storage/Dropzone-R2] ⚠️ Direct PUT retornou status ${response.status}. Tentando direct-upload...`);
                    } catch (putErr: any) {
                        if (putErr.name === 'AbortError' || signal?.aborted) throw putErr;
                        console.warn(`[Storage/Dropzone-R2] ⚠️ Direct PUT falhou (${putErr.message}). Tentando direct-upload...`);
                    }
                }

                // 3. Fallback direct-upload via Edge Function
                const base64Data = await new Promise<string>((res, rej) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result as string);
                    reader.onerror = rej;
                    reader.readAsDataURL(blobOrFile);
                });

                const directRes = await publicSupabase.functions.invoke('r2-operations', {
                    body: { action: 'direct-upload', path: fullPath, bucketType: 'dropzone', contentType, base64: base64Data },
                    headers: authHeaders
                });

                if (directRes.data?.publicUrl) {
                    console.log(`[Storage/Dropzone-R2] ✅ Fallback direct-upload concluído:`, directRes.data.publicUrl);
                    return directRes.data.publicUrl;
                }

                throw new Error(directRes.error?.message || signError?.message || 'Falha no upload para o Cloudflare R2');

            } catch (err: any) {
                if (err.name === 'AbortError' || signal?.aborted) throw err;
                console.warn(`[Storage/Dropzone-R2] ⚠️ Tentativa ${i + 1} falhou:`, err.message);

                if (i === retryCount) throw err;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error("STORAGE_DROPZONE_R2_UNREACHABLE");
    },

    /**
     * 🎯 AGGRESSIVE INTELLIGENT COMPRESSOR (V5 - MEMORY SAFE)
     */
    processAndCompress: async (file: File, signal?: AbortSignal): Promise<Blob> => {
        const TARGET_SIZE = 200 * 1024; // Limit strictly set to 200 KB
        const fileName = (file.name || '').toLowerCase();
        const fileType = (file.type || '').toLowerCase();

        let workingFile: Blob | File = file;

        const isHeic = fileType.includes('heic') || fileType.includes('heif') ||
            fileName.endsWith('.heic') || fileName.endsWith('.heif') || fileName.endsWith('.hif');

        if (isHeic) {
            try {
                let heic2any = (window as any).heic2any;
                if (!heic2any) {
                    console.warn("heic2any library not found for HEIC conversion");
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

            const strategies = [
                { w: 1200, q: 0.75 },
                { w: 1024, q: 0.65 },
                { w: 800, q: 0.55 },
                { w: 640, q: 0.45 },
                { w: 500, q: 0.35 }
            ];

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
     * 🏷️ Otimizador Especial de Logo (WebP com preservação total de canal Alpha / Transparência)
     */
    compressLogo: async (fileOrBlob: File | Blob, signal?: AbortSignal): Promise<Blob> => {
        const fileName = (fileOrBlob instanceof File ? fileOrBlob.name : '').toLowerCase();
        const fileType = (fileOrBlob.type || '').toLowerCase();

        let workingFile: Blob | File = fileOrBlob;

        const isHeic = fileType.includes('heic') || fileType.includes('heif') ||
            fileName.endsWith('.heic') || fileName.endsWith('.heif') || fileName.endsWith('.hif');

        if (isHeic) {
            try {
                let heic2any = (window as any).heic2any;
                if (heic2any) {
                    const converted = await heic2any({
                        blob: fileOrBlob,
                        toType: 'image/png',
                        quality: 0.95
                    });
                    workingFile = Array.isArray(converted) ? converted[0] : converted;
                }
            } catch (e) {
                console.warn("[CompressLogo] ⚠️ HEIC Decode Failed:", e);
            }
        }

        const url = URL.createObjectURL(workingFile);
        try {
            const img = new Image();
            const loadPromise = new Promise((res, rej) => {
                img.onload = () => res(true);
                img.onerror = () => rej(new Error(`Falha ao carregar imagem da logo: ${fileName || 'arquivo'}`));
                img.src = url;
            });
            const loadTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo limite excedido ao processar logo')), 15000));
            await Promise.race([loadPromise, loadTimeout]);

            if (signal?.aborted) throw new Error('AbortError');

            const MAX_DIM = 800; // Logos para web, documentos e relatórios
            let width = img.width;
            let height = img.height;

            if (width > MAX_DIM || height > MAX_DIM) {
                const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            // PRESERVA O CANAL ALPHA (transparência de logos PNG/WebP)
            const ctx = canvas.getContext('2d', { alpha: true });
            if (!ctx) throw new Error('Falha ao inicializar renderizador de imagem');

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            // Garante transparência total
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const blob = await new Promise<Blob>((res, rej) => {
                // Converte para image/webp com alta fidelidade preservando transparência
                canvas.toBlob((b) => b ? res(b) : rej(new Error('Falha ao gerar WebP')), 'image/webp', 0.90);
            });

            canvas.width = 0;
            canvas.height = 0;
            return blob;
        } finally {
            URL.revokeObjectURL(url);
        }
    },

    /**
     * 🛡️ Optimized Blob Upload
     */
    uploadBlob: async (blob: Blob, path: string, signal?: AbortSignal, options?: { contentType?: string, extension?: string, tenantId?: string }): Promise<string> => {
        if (!isCloudEnabled) return URL.createObjectURL(blob);
        return StorageService._uploadCore(blob, path, 2, signal, options);
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
     * 🛡️ Cloudflare R2 Public Dropzone Interface (Upload estrito no R2)
     */
    uploadDropzoneFile: async (base64: string, path: string): Promise<string> => {
        if (!isCloudEnabled) return base64;
        if (!base64.startsWith('data:image')) {
            // Já é uma URL (ex: do R2)
            return base64;
        }

        const compressedBase64 = await StorageService.compressImage(base64);
        const base64Data = compressedBase64.split(',')[1];
        const binaryData = atob(base64Data);
        const uint8Array = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
            uint8Array[i] = binaryData.charCodeAt(i);
        }
        const blob = new Blob([uint8Array], { type: 'image/webp' });

        // Envio estrito e exclusivo para o Cloudflare R2
        return await StorageService._uploadDropzoneCore(blob, path);
    },

    /**
     * 👤 Upload Oficial de Avatares de Usuários e Técnicos
     * Salva estritamente em: ${tenantId}/avatars/users/${userId}/avatar_${timestamp}.webp
     */
    uploadUserAvatar: async (fileOrBase64: File | Blob | string, userId: string, signal?: AbortSignal): Promise<string> => {
        const cleanUserId = userId || 'user';
        const folderPath = `avatars/users/${cleanUserId}`;

        if (typeof fileOrBase64 === 'string') {
            return await StorageService.uploadFile(fileOrBase64, folderPath);
        }

        if (!isCloudEnabled) return URL.createObjectURL(fileOrBase64);

        if (fileOrBase64 instanceof File) {
            const isImage = fileOrBase64.type.startsWith('image/');
            if (isImage) {
                const compressedBlob = await StorageService.processAndCompress(fileOrBase64, signal);
                const webpFile = new File([compressedBlob], `avatar_${Date.now()}.webp`, { type: 'image/webp' });
                return await StorageService._uploadCore(webpFile, folderPath, 2, signal, { contentType: 'image/webp', extension: 'webp' });
            }
            return await StorageService._uploadCore(fileOrBase64, folderPath, 2, signal);
        }

        return await StorageService.uploadBlob(fileOrBase64, folderPath, signal);
    },

    /**
     * 🏢 Upload Oficial de Logo da Empresa
     * Converte estritamente para WebP preservando transparência e envia para o Cloudflare R2
     * Salva em: ${tenantId}/Configuracoes_Empresa/Logos/logo_${timestamp}.webp
     */
    uploadTenantLogo: async (file: File | Blob, tenantId: string, signal?: AbortSignal): Promise<string> => {
        const cleanTenantId = tenantId && tenantId !== 'undefined' && tenantId !== 'null' ? tenantId : 'global';
        const folderPath = `tenants/${cleanTenantId}/logo`;
        if (!isCloudEnabled) return URL.createObjectURL(file);
        try {
            const compressedBlob = await StorageService.compressLogo(file, signal);
            const webpFile = new File([compressedBlob], `logo_${Date.now()}.webp`, { type: 'image/webp' });
            return await StorageService._uploadCore(webpFile, folderPath, 2, signal, {
                contentType: 'image/webp',
                extension: 'webp',
                tenantId: cleanTenantId
            });
        } catch (err: any) {
            console.error(`[LogoUpload] ❌ Falha:`, err.message);
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
     * Upload de Comprovante Financeiro (Imagens viram WebP, Docs são mantidos)
     */
    uploadFinancialReceipt: async (file: File, pathFolder: string, signal?: AbortSignal): Promise<string> => {
        if (!isCloudEnabled) return URL.createObjectURL(file);

        try {
            const isImage = file.type.startsWith('image/');
            if (isImage) {
                const compressedBlob = await StorageService.processAndCompress(file, signal);
                const webpFile = new File([compressedBlob], `receipt_${Date.now()}.webp`, { type: 'image/webp' });
                return await StorageService._uploadCore(webpFile, pathFolder, 2, signal, { contentType: 'image/webp', extension: 'webp' });
            } else {
                if (file.size > 15 * 1024 * 1024) throw new Error("O arquivo excede o limite de 15MB");
                const extMatch = file.name.match(/\.([^.]+)$/);
                const ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';
                return await StorageService._uploadCore(file, pathFolder, 2, signal, { contentType: file.type, extension: ext });
            }
        } catch (err: any) {
            console.error(`[ReceiptUpload] ❌ Falha:`, err.message);
            throw err;
        }
    },

    /**
     * Upload de anexo de Observação Interna (Imagens viram WebP, Docs são mantidos)
     */
    uploadInternalNoteAttachment: async (file: File, orderId: string, signal?: AbortSignal): Promise<{ url: string, name: string, type: string, size: number }> => {
        if (!isCloudEnabled) {
            return { url: URL.createObjectURL(file), name: file.name, type: file.type.includes('image') ? 'image' : 'document', size: file.size };
        }

        try {
            const isImage = file.type.startsWith('image/');
            if (isImage) {
                const compressedBlob = await StorageService.processAndCompress(file, signal);
                const webpFile = new File([compressedBlob], `photo_${Date.now()}.webp`, { type: 'image/webp' });
                const url = await StorageService._uploadCore(webpFile, `orders/${orderId}/internal_notes`, 2, signal, { contentType: 'image/webp', extension: 'webp' });
                return { url, name: file.name, type: 'image', size: webpFile.size };
            } else {
                if (file.size > 15 * 1024 * 1024) throw new Error("O arquivo excede o limite de 15MB");
                const extMatch = file.name.match(/\.([^.]+)$/);
                const ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';
                const url = await StorageService._uploadCore(file, `orders/${orderId}/internal_notes`, 2, signal, { contentType: file.type, extension: ext });
                return { url, name: file.name, type: 'document', size: file.size };
            }
        } catch (err: any) {
            console.error(`[AttachmentUpload] ❌ Falha:`, err.message);
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
     * Deleta um arquivo do Storage baseado na sua URL pública
     */
    deleteFile: async (url: string): Promise<void> => {
        if (!url || !isCloudEnabled) return;
        try {
            let path = url;
            let bucketType = 'private';

            // Tratamento retrocompatível (caso aponte pro Supabase antigo)
            if (url.includes('/nexus-files/')) {
                path = url.split('/nexus-files/')[1].split('?')[0];
                bucketType = 'private';
            } else if (url.includes('/nexus-public-dropzone/')) {
                path = url.split('/nexus-public-dropzone/')[1].split('?')[0];
                bucketType = 'dropzone';
            }
            // Novo formato R2
            else if (url.includes('.r2.dev/')) {
                path = url.split('.r2.dev/')[1].split('?')[0];
                // Como não temos distinção clara na URL, assumimos dropzone/public dependendo do path
                // (Para R2, vamos delegar pra Edge Function tentar deletar baseado na chave)
                bucketType = url.includes('dropzone') ? 'dropzone' : 'private'; // simplificação
            }

            // Exclui via Edge Function no R2
            const session = (await supabase.auth.getSession())?.data?.session;
            const token = session?.access_token || safeKey;
            const { error } = await supabase.functions.invoke('r2-operations', {
                body: { action: 'delete', path: decodeURIComponent(path), bucketType },
                headers: {
                    Authorization: `Bearer ${token}`,
                    apikey: safeKey
                }
            });

            if (error) {
                console.error(`[Storage/R2] ⚠️ Falha na Edge Function R2 (fallback pro antigo):`, error);
                // Fallback para o storage antigo do Supabase apenas como precaução na transição
                if (bucketType === 'dropzone') {
                    await publicSupabase.storage.from('nexus-public-dropzone').remove([decodeURIComponent(path)]);
                } else {
                    await supabase.storage.from('nexus-files').remove([decodeURIComponent(path)]);
                }
            } else {
                console.log(`[Storage/R2] 🗑️ Arquivo deletado: ${path}`);
            }

        } catch (err) {
            console.error('[StorageService] ❌ Falha ao deletar arquivo:', err);
        }
    }
};
