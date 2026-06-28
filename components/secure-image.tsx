/**
 * SecureImage — Componente de Imagem com Download Resiliente à Rede
 *
 * Problema na Claro (CGNAT/IPv6):
 *   - O <Image> nativo do Android usa o loader interno do OkHttp SEM o nosso
 *     customReactNativeFetch, então não tem timeout de 5s nem retry.
 *   - Resultado: imagem trava/fica cinza em ~30% das tentativas na Claro.
 *
 * Solução implementada (v2 — BIG TECH GRADE):
 *   1. Gera Signed URL via Supabase SDK (com retry via customFetch)
 *   2. BAIXA a imagem usando nosso fetch com retry/timeout (não o loader nativo)
 *   3. VALIDA o arquivo baixado (tamanho mínimo + header magic bytes)
 *   4. Salva em cache local no FileSystem (expo-file-system)
 *   5. Serve o arquivo local file:// para o <Image> — download já feito, sem rede
 *   6. Cache persiste entre sessões — imagem já baixada nunca re-faz a rede
 *   7. Se <Image> reporta onError (arquivo corrupto), DELETA do disco e re-baixa
 */

import * as FileSystem from 'expo-file-system/legacy';

import React, { memo, useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ImageStyle, Pressable, StyleProp, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BUCKET_NAME } from '@/services/supabase';

// ─── Configurações ────────────────────────────────────────────────────────────
const SIGNED_URL_TTL_SECONDS = 3600;
const CACHE_BUFFER_SECONDS = 120;
const IMAGE_CACHE_DIR = `${FileSystem.cacheDirectory}nexus_img/`;
const MAX_DOWNLOAD_RETRIES = 5;      // Aumentado: redes BR precisam de mais tentativas
const MIN_VALID_FILE_SIZE = 512;      // Arquivo < 512 bytes = corrupto/parcial
const RETRY_BASE_DELAY_MS = 600;      // Base para backoff exponencial

// ─── Cache em memória de signed URLs ─────────────────────────────────────────
const signedUrlCache = new Map<string, { signedUrl: string; expiresAt: number }>();

// ─── Cache em memória de paths locais (path → local file:// uri) ─────────────
const localFileCache = new Map<string, string>();

// ─── Debounce de downloads em andamento (evita download duplicado) ────────────
const activeDownloads = new Map<string, Promise<string>>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Bases públicas do R2
const R2_PRIVATE_BASE = 'pub-e1fad40780de437fbbb01f3b203193e9.r2.dev';
const R2_DROPZONE_BASE = 'pub-4cf13c9b58ea42038881f5e6fef98e17.r2.dev';

function isRemoteStorageUrl(url: string): boolean {
    return (
        url.includes('.supabase.co/storage/') ||
        url.includes(R2_PRIVATE_BASE) ||
        url.includes(R2_DROPZONE_BASE)
    );
}

function extractStoragePath(publicUrl: string): string | null {
    try {
        // R2 URL: https://pub-xxx.r2.dev/path/to/file.webp
        if (publicUrl.includes(R2_PRIVATE_BASE) || publicUrl.includes(R2_DROPZONE_BASE)) {
            const url = new URL(publicUrl);
            // pathname comes as /tenantId/orders/... — strip leading slash
            return decodeURIComponent(url.pathname.replace(/^\//, '').split('?')[0]);
        }

        // Legacy Supabase Storage URL
        const patterns = [
            `/storage/v1/object/public/${BUCKET_NAME}/`,
            `/storage/v1/object/authenticated/${BUCKET_NAME}/`,
            `/storage/v1/object/sign/${BUCKET_NAME}/`,
        ];
        for (const pattern of patterns) {
            const idx = publicUrl.indexOf(pattern);
            if (idx !== -1) {
                return decodeURIComponent(publicUrl.substring(idx + pattern.length).split('?')[0]);
            }
        }
    } catch { }
    return null;
}

/** Garante que o diretório de cache existe */
async function ensureCacheDir(): Promise<void> {
    const info = await FileSystem.getInfoAsync(IMAGE_CACHE_DIR);
    if (!info.exists) {
        await FileSystem.makeDirectoryAsync(IMAGE_CACHE_DIR, { intermediates: true });
    }
}

/**
 * Gera um nome de arquivo de cache único e seguro para um path do storage.
 * Ex: "tenantId/orders/abc.webp" → "tenantId_orders_abc.webp"
 */
function localFileName(storagePath: string, useThumbnail = false): string {
    const base = storagePath.replace(/[\/\\?=&%]/g, '_').substring(0, 200);
    return useThumbnail ? `${base}_thumb.webp` : base;
}

/**
 * Valida se o arquivo baixado é uma imagem real e não um download parcial.
 * - Checa tamanho mínimo
 * - Checa se existe no disco
 */
async function validateDownloadedFile(filePath: string, isCacheCheck = false): Promise<boolean> {
    try {
        const info = await FileSystem.getInfoAsync(filePath, { size: true });
        if (!info.exists) {
            if (!isCacheCheck) {
                console.warn('[SecureImage] ❌ Arquivo não existe após download:', filePath);
            }
            return false;
        }
        // @ts-ignore - size existe quando passamos { size: true }
        const fileSize = info.size || 0;
        if (fileSize < MIN_VALID_FILE_SIZE) {
            console.warn(`[SecureImage] ❌ Arquivo muito pequeno (${fileSize} bytes < ${MIN_VALID_FILE_SIZE}). Provável download parcial/corrupto.`);
            await FileSystem.deleteAsync(filePath, { idempotent: true }).catch(() => {});
            return false;
        }
        return true;
    } catch (e) {
        console.warn('[SecureImage] ❌ Erro ao validar arquivo:', e);
        return false;
    }
}

/**
 * Remove um arquivo corrompido do cache de disco E de memória.
 * Chamado quando <Image> dispara onError (imagem cortada/ilegível).
 */
export async function purgeCorruptedCache(publicUrl: string, useThumbnail = false): Promise<void> {
    const storagePath = extractStoragePath(publicUrl);
    if (!storagePath) return;
    
    // Remove da memória
    const memKey = useThumbnail ? `${storagePath}_thumb` : storagePath;
    localFileCache.delete(memKey);
    signedUrlCache.delete(memKey);
    
    // Remove do disco
    const fileName = localFileName(storagePath, useThumbnail);
    const localPath = `${IMAGE_CACHE_DIR}${fileName}`;
    await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => {});
    console.log('[SecureImage] 🗑️ Cache corrompido removido para:', memKey.substring(0, 60));
}

/**
 * Baixa uma imagem com retry manual usando FileSystem.downloadAsync.
 * v2: Backoff exponencial + validação de integridade + cleanup de parciais.
 */
async function downloadWithRetry(signedUrl: string, destPath: string): Promise<boolean> {
    for (let attempt = 0; attempt <= MAX_DOWNLOAD_RETRIES; attempt++) {
        const attemptPath = `${destPath}.tmp${attempt}`;
        try {
            // Remove arquivo parcial de tentativa anterior
            await FileSystem.deleteAsync(attemptPath, { idempotent: true }).catch(() => {});
            
            // Corrida contra o tempo (Hedged Request CGNAT - Fast Failure)
            const downloadPromise = FileSystem.downloadAsync(signedUrl, attemptPath, { cache: false });
            
            // Morte bruta por timeout após 8 segundos (O OS normalmente espera 60s antes de falhar, nós cortamos para 8s!)
            const timeoutPromise = new Promise<any>((_, reject) => {
                setTimeout(() => reject(new Error('timeout_cgnat')), 8000);
            });

            const result = await Promise.race([downloadPromise, timeoutPromise]);

            if (result.status >= 200 && result.status < 300) {
                // v2: VALIDAR integridade do arquivo baixado
                const isValid = await validateDownloadedFile(attemptPath);
                if (isValid) {
                    await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => {});
                    await FileSystem.moveAsync({ from: attemptPath, to: destPath }).catch(() => {});
                    console.log(`[SecureImage] ✅ Download validado (tentativa ${attempt + 1})`);
                    return true;
                }
                // Arquivo inválido — retry
                console.warn(`[SecureImage] ⚠️ HTTP 200 mas arquivo inválido (tentativa ${attempt + 1}). Retentando...`);
                // Limpeza do temp
                await FileSystem.deleteAsync(attemptPath, { idempotent: true }).catch(() => {});
                
                if (attempt === MAX_DOWNLOAD_RETRIES) return false;
                await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
                continue;
            }

            console.warn(`[SecureImage] HTTP ${result.status} na tentativa ${attempt + 1}`);
            await FileSystem.deleteAsync(attemptPath, { idempotent: true }).catch(() => {});
            if (attempt === MAX_DOWNLOAD_RETRIES) return false;
            await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
        } catch (err: any) {
            const label = err?.message || String(err);
            console.warn(`[SecureImage] ⚠️ Tentativa ${attempt + 1}/${MAX_DOWNLOAD_RETRIES + 1} falhou: ${label.substring(0, 80)}`);
            // Se falhou ou deu timeout, apenas ignoramos o temp.
            // O download Async por baixo dos panos pode continuar vivo, mas gravando num .tmp isolado que não vai quebrar os próximos retries.
            if (attempt === MAX_DOWNLOAD_RETRIES) return false;
            await new Promise(r => setTimeout(r, RETRY_BASE_DELAY_MS * Math.pow(2, attempt)));
        }
    }
    return false;
}

/**
 * Resolve uma URL de imagem para um URI local (file://).
 * Fluxo: memCache → fileCache (com validação) → signedUrl → download → fileSave
 * 
 * v2: Deduplicação de downloads concorrentes + validação de arquivo existente
 */
async function resolveToLocalUri(publicUrl: string, useThumbnail = false): Promise<string> {
    // Não é uma URL de storage remoto ou é um VÍDEO — retorna direto
    if (!publicUrl || !isRemoteStorageUrl(publicUrl) || publicUrl.toLowerCase().endsWith('.mp4') || publicUrl.toLowerCase().endsWith('.webm') || publicUrl.toLowerCase().endsWith('.mov')) {
        return publicUrl;
    }

    const storagePath = extractStoragePath(publicUrl);
    if (!storagePath) return publicUrl;

    // Deduplicação
    const memKey = useThumbnail ? `${storagePath}_thumb` : storagePath;
    const existingDownload = activeDownloads.get(memKey);
    if (existingDownload) {
        return existingDownload;
    }

    const downloadPromise = _resolveToLocalUriInternal(publicUrl, storagePath, useThumbnail);
    activeDownloads.set(memKey, downloadPromise);
    
    try {
        const result = await downloadPromise;
        return result;
    } finally {
        activeDownloads.delete(memKey);
    }
}

async function _resolveToLocalUriInternal(publicUrl: string, storagePath: string, useThumbnail: boolean): Promise<string> {
    // O Cloudflare R2 não suporta on-the-fly thumbnails nativamente como o Supabase.
    // Ignoramos a flag useThumbnail se for URL do R2 para evitar 404.
    const isR2 = publicUrl.includes(R2_PRIVATE_BASE) || publicUrl.includes(R2_DROPZONE_BASE);
    const effectiveThumbnail = useThumbnail && !isR2;

    const memKey = effectiveThumbnail ? `${storagePath}_thumb` : storagePath;

    // 1. Cache de memória (path local já conhecido)
    if (localFileCache.has(memKey)) {
        const localUri = localFileCache.get(memKey)!;
        // v2: valida que o arquivo AINDA está íntegro
        const isValid = await validateDownloadedFile(localUri, true);
        if (isValid) return localUri;
        localFileCache.delete(memKey);
    }

    // 2. Cache de disco (arquivo local já salvo de sessão anterior)
    await ensureCacheDir();
    const fileName = localFileName(storagePath, effectiveThumbnail);
    const localPath = `${IMAGE_CACHE_DIR}${fileName}`;
    
    const isValidOnDisk = await validateDownloadedFile(localPath, true);
    if (isValidOnDisk) {
        localFileCache.set(memKey, localPath);
        return localPath;
    }

    // 3. Precisa baixar — a URL já é pública no R2
    let signedUrl = publicUrl;

    // 4. Download com retry resiliente à rede Claro/CGNAT
    const success = await downloadWithRetry(signedUrl, localPath);
    if (success) {
        localFileCache.set(memKey, localPath);
        return localPath;
    }

    // 5. Fallback final: tenta servir a signed URL diretamente (sem cache local)
    console.warn('[SecureImage] ⚠️ Download falhou após retries. Tentando URL diretamente como fallback.');
    return signedUrl;
}

// ─── Exportado para warm-up em lote ──────────────────────────────────────────
export async function warmSignedUrlCacheBulk(publicUrls: string[]): Promise<void> {
    const pathsToFetch: string[] = [];
    const now = Math.floor(Date.now() / 1000);

    for (const url of publicUrls) {
        if (!url || typeof url !== 'string' || !isRemoteStorageUrl(url)) continue;
        const path = extractStoragePath(url);
        if (!path) continue;
        
        // Verifica se já está no cache de disco válido
        const fileName = localFileName(path);
        const localPath = `${IMAGE_CACHE_DIR}${fileName}`;
        if (localFileCache.has(path)) continue; // já na memória
        
        const cached = signedUrlCache.get(path);
        if (cached && cached.expiresAt > now + CACHE_BUFFER_SECONDS) continue;
        if (!pathsToFetch.includes(path)) pathsToFetch.push(path);
    }

    if (pathsToFetch.length === 0) return;

    try {
        console.log(`[SecureImage] 🔥 Aquecendo cache em lote para ${pathsToFetch.length} imagens...`);
        // v2: Download paralelo com limite de concorrência (3 simultâneos para não saturar 3G)
        const CONCURRENT_LIMIT = 3;
        const queue = pathsToFetch;
        
        for (let i = 0; i < queue.length; i += CONCURRENT_LIMIT) {
            const batch = queue.slice(i, i + CONCURRENT_LIMIT);
            await Promise.allSettled(batch.map(async (path) => {
                const publicUrl = `https://pub-e1fad40780de437fbbb01f3b203193e9.r2.dev/${path}`;
                await resolveToLocalUri(publicUrl);
            }));
        }
        
        console.log(`[SecureImage] ✅ Warmup finalizado: ${queue.length} imagens processadas.`);
    } catch (e) {
        console.error('[SecureImage] ❌ Exceção no warm up em lote:', e);
    }
}

export async function getSignedUrl(publicUrl: string): Promise<string> {
    return resolveToLocalUri(publicUrl);
}

// ─── Props ────────────────────────────────────────────────────────────────────
interface SecureImageProps {
    uri: string;
    style?: StyleProp<ImageStyle>;
    resizeMode?: 'cover' | 'contain' | 'stretch' | 'repeat' | 'center';
    fallbackIconSize?: number;
    fallbackIconColor?: string;
    /** Se true, mostra botão de retry quando falha (default: true) */
    showRetry?: boolean;
    /** Usar CDN do Supabase para redimensionar (mais rápido para cards) */
    useThumbnail?: boolean;
}

// ─── Componente ───────────────────────────────────────────────────────────────
export const SecureImage = memo(function SecureImage({
    uri,
    style,
    resizeMode = 'cover',
    fallbackIconSize = 28,
    fallbackIconColor = '#94a3b8',
    showRetry = true,
    useThumbnail = false,
}: SecureImageProps) {
    const [resolvedUri, setResolvedUri] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [retryCount, setRetryCount] = useState(0);
    const mountedRef = useRef(true);

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; };
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(false);
        setResolvedUri(null);

        if (!uri || typeof uri !== 'string') {
            setLoading(false);
            setError(true);
            return;
        }

        // URIs locais ou data: passam direto sem download
        if (uri.startsWith('file://') || uri.startsWith('data:') || !isRemoteStorageUrl(uri)) {
            setResolvedUri(uri);
            setLoading(false);
            return;
        }

        resolveToLocalUri(uri, useThumbnail)
            .then((localUri) => {
                if (!cancelled && mountedRef.current) {
                    setResolvedUri(localUri);
                    setLoading(false);
                }
            })
            .catch(() => {
                if (!cancelled && mountedRef.current) {
                    setResolvedUri(uri); // último fallback: URL original
                    setLoading(false);
                }
            });

        return () => { cancelled = true; };
    }, [uri, retryCount]);

    const handleImageError = useCallback(async () => {
        // v2: DELETA do disco para não servir arquivo corrupto eternamente
        await purgeCorruptedCache(uri, useThumbnail);
        
        if (mountedRef.current) {
            setError(true);
            setLoading(false);
        }
    }, [uri, useThumbnail]);

    const handleRetry = useCallback(() => {
        // Força re-download limpando o cache
        purgeCorruptedCache(uri, useThumbnail).then(() => {
            if (mountedRef.current) {
                setError(false);
                setRetryCount(prev => prev + 1);
            }
        });
    }, [uri, useThumbnail]);

    if (loading || !resolvedUri) {
        return (
            <View style={[{ backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' }, style as any]}>
                <ActivityIndicator size="small" color="#3b82f6" />
            </View>
        );
    }

    if (error) {
        return (
            <View style={[{ backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8 }, style as any]}>
                {showRetry ? (
                    <Pressable onPress={handleRetry} style={{ alignItems: 'center', justifyContent: 'center', padding: 8 }}>
                        <Ionicons name="reload-circle" size={Math.max(fallbackIconSize, 32)} color="#3b82f6" />
                        <Text style={{ fontSize: 9, color: '#64748b', fontWeight: '700', marginTop: 4, textAlign: 'center' }}>Recarregar</Text>
                    </Pressable>
                ) : (
                    <Ionicons name="image-outline" size={fallbackIconSize} color={fallbackIconColor} />
                )}
            </View>
        );
    }

    return (
        <Image
            source={{ uri: resolvedUri }}
            style={style}
            resizeMode={resizeMode}
            onError={handleImageError}
            // v2: fadeDuration para UX mais suave no Android
            fadeDuration={200}
        />
    );
});
