/**
 * 🧹 CacheCleanupService — BigTech-grade cache management
 * 
 * Runs on app cold start and periodically:
 * 1. Deletes compressed video temp files (compress_src_*, .tmp*)
 * 2. Prunes old image cache files (>7 days)
 * 3. Prunes old Camera recordings from cache
 * 4. Caps total cache to MAX_CACHE_MB
 * 5. Logs cache size before/after for diagnostics
 */

import * as FileSystem from 'expo-file-system/legacy';

const CACHE_DIR = FileSystem.cacheDirectory || '';
const IMAGE_CACHE_DIR = `${CACHE_DIR}nexus_img/`;
const CAMERA_CACHE_DIR = `${CACHE_DIR}Camera/`;

// Config
const MAX_CACHE_MB = 200;          // Hard cap: 200 MB total cache
const IMAGE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;  // 7 dias
const VIDEO_TEMP_MAX_AGE_MS = 1 * 60 * 60 * 1000;   // 1 hora (vídeos temp são descartáveis)

interface FileEntry {
    uri: string;
    size: number;
    modTime: number;
}

export const CacheCleanupService = {

    /**
     * Executa limpeza completa do cache. Seguro para chamar a qualquer momento.
     * Retorna o tamanho liberado em MB.
     */
    async runCleanup(): Promise<number> {
        const startTime = Date.now();
        let totalFreedBytes = 0;

        try {
            const beforeMB = await this.getCacheSizeMB();
            console.log(`[CacheCleanup] 🧹 Iniciando limpeza. Cache atual: ${beforeMB.toFixed(1)} MB`);

            // 1. Deletar arquivos temporários de compressão de vídeo
            totalFreedBytes += await this._cleanTempVideoFiles();

            // 2. Limpar cache de imagens antigas (>7 dias)
            totalFreedBytes += await this._pruneOldFiles(IMAGE_CACHE_DIR, IMAGE_MAX_AGE_MS);

            // 3. Limpar gravações de câmera antigas no cache
            totalFreedBytes += await this._pruneOldFiles(CAMERA_CACHE_DIR, VIDEO_TEMP_MAX_AGE_MS);

            // 4. Se ainda acima do cap, deletar os mais antigos
            const currentMB = await this.getCacheSizeMB();
            if (currentMB > MAX_CACHE_MB) {
                totalFreedBytes += await this._enforceCapLRU();
            }

            const afterMB = await this.getCacheSizeMB();
            const freedMB = totalFreedBytes / (1024 * 1024);
            const elapsed = Date.now() - startTime;

            console.log(`[CacheCleanup] ✅ Limpeza concluída em ${elapsed}ms. ${beforeMB.toFixed(1)} MB → ${afterMB.toFixed(1)} MB (liberado: ${freedMB.toFixed(1)} MB)`);
            return freedMB;
        } catch (err) {
            console.warn('[CacheCleanup] ⚠️ Erro na limpeza de cache:', err);
            return 0;
        }
    },

    /**
     * Retorna o tamanho total do cache em MB.
     */
    async getCacheSizeMB(): Promise<number> {
        try {
            if (!CACHE_DIR) return 0;
            const items = await FileSystem.readDirectoryAsync(CACHE_DIR).catch(() => []);
            let totalBytes = 0;

            for (const item of items) {
                try {
                    const info = await FileSystem.getInfoAsync(`${CACHE_DIR}${item}`, { size: true });
                    if (info.exists) {
                        totalBytes += (info as any).size || 0;
                    }
                } catch { /* skip */ }
            }

            // Also count subdirectories (nexus_img, Camera)
            for (const subDir of [IMAGE_CACHE_DIR, CAMERA_CACHE_DIR]) {
                try {
                    const subItems = await FileSystem.readDirectoryAsync(subDir).catch(() => []);
                    for (const item of subItems) {
                        try {
                            const info = await FileSystem.getInfoAsync(`${subDir}${item}`, { size: true });
                            if (info.exists) {
                                totalBytes += (info as any).size || 0;
                            }
                        } catch { /* skip */ }
                    }
                } catch { /* skip */ }
            }

            return totalBytes / (1024 * 1024);
        } catch {
            return 0;
        }
    },

    /**
     * Deleta arquivos temporários de compressão de vídeo no cache root.
     * Padrões: compress_src_*, *.tmp*, ImageManipulator/*
     */
    async _cleanTempVideoFiles(): Promise<number> {
        let freedBytes = 0;
        try {
            if (!CACHE_DIR) return 0;
            const items = await FileSystem.readDirectoryAsync(CACHE_DIR).catch(() => []);

            for (const item of items) {
                const isTemp = 
                    item.startsWith('compress_src_') ||
                    item.includes('.tmp') ||
                    item.startsWith('ImageManipulator') ||
                    (item.endsWith('.mp4') && !item.includes('Camera'));

                if (isTemp) {
                    try {
                        const fullPath = `${CACHE_DIR}${item}`;
                        const info = await FileSystem.getInfoAsync(fullPath, { size: true });
                        if (info.exists) {
                            const size = (info as any).size || 0;
                            await FileSystem.deleteAsync(fullPath, { idempotent: true });
                            freedBytes += size;
                        }
                    } catch { /* skip */ }
                }
            }

            if (freedBytes > 0) {
                console.log(`[CacheCleanup] 🗑️ Temp video files: ${(freedBytes / 1024 / 1024).toFixed(1)} MB removidos`);
            }
        } catch { /* quiet */ }
        return freedBytes;
    },

    /**
     * Remove arquivos mais antigos que maxAgeMs de um diretório.
     */
    async _pruneOldFiles(dirPath: string, maxAgeMs: number): Promise<number> {
        let freedBytes = 0;
        try {
            const items = await FileSystem.readDirectoryAsync(dirPath).catch(() => []);
            const now = Date.now();

            for (const item of items) {
                try {
                    const fullPath = `${dirPath}${item}`;
                    const info = await FileSystem.getInfoAsync(fullPath, { size: true });
                    if (!info.exists) continue;

                    const modTime = (info as any).modificationTime ? (info as any).modificationTime * 1000 : 0;
                    const age = modTime > 0 ? now - modTime : Infinity;

                    if (age > maxAgeMs) {
                        const size = (info as any).size || 0;
                        await FileSystem.deleteAsync(fullPath, { idempotent: true });
                        freedBytes += size;
                    }
                } catch { /* skip individual file */ }
            }

            if (freedBytes > 0) {
                console.log(`[CacheCleanup] 🗑️ Old files in ${dirPath.split('/').slice(-2).join('/')}: ${(freedBytes / 1024 / 1024).toFixed(1)} MB removidos`);
            }
        } catch { /* quiet */ }
        return freedBytes;
    },

    /**
     * LRU eviction: se o cache excede MAX_CACHE_MB, deleta os mais antigos até ficar abaixo.
     */
    async _enforceCapLRU(): Promise<number> {
        let freedBytes = 0;
        try {
            // Collect all files with metadata
            const allFiles: FileEntry[] = [];

            for (const dir of [CACHE_DIR, IMAGE_CACHE_DIR, CAMERA_CACHE_DIR]) {
                try {
                    const items = await FileSystem.readDirectoryAsync(dir).catch(() => []);
                    for (const item of items) {
                        const fullPath = `${dir}${item}`;
                        try {
                            const info = await FileSystem.getInfoAsync(fullPath, { size: true });
                            if (info.exists && !(info as any).isDirectory) {
                                allFiles.push({
                                    uri: fullPath,
                                    size: (info as any).size || 0,
                                    modTime: (info as any).modificationTime || 0,
                                });
                            }
                        } catch { /* skip */ }
                    }
                } catch { /* skip */ }
            }

            // Sort by modification time (oldest first)
            allFiles.sort((a, b) => a.modTime - b.modTime);

            let currentTotalBytes = allFiles.reduce((sum, f) => sum + f.size, 0);
            const targetBytes = MAX_CACHE_MB * 1024 * 1024;

            for (const file of allFiles) {
                if (currentTotalBytes <= targetBytes) break;
                try {
                    await FileSystem.deleteAsync(file.uri, { idempotent: true });
                    currentTotalBytes -= file.size;
                    freedBytes += file.size;
                } catch { /* skip */ }
            }

            if (freedBytes > 0) {
                console.log(`[CacheCleanup] 🗑️ LRU eviction: ${(freedBytes / 1024 / 1024).toFixed(1)} MB removidos para ficar abaixo de ${MAX_CACHE_MB} MB`);
            }
        } catch { /* quiet */ }
        return freedBytes;
    },
};
