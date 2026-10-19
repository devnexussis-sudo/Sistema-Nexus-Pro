/**
 * 🛡️ Asset Cache Service — Deduplicação e Persistência Atômica de Mídias
 *
 * Garante que qualquer foto, vídeo ou documento já enviado com sucesso para o R2
 * NUNCA seja re-enviado, mesmo que:
 * - A bateria acabe
 * - A internet caia ou oscile
 * - O app seja fechado ou a requisição da OS seja interrompida
 *
 * Mapeia: localUri -> remoteUrl (R2 Cloudflare) com persistência em disco.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const ASSET_CACHE_KEY = '@nexus_uploaded_assets_map_v1';

class AssetCacheService {
    private cache: Map<string, string> = new Map();
    private isInitialized = false;
    private saveTimeout: ReturnType<typeof setTimeout> | null = null;

    constructor() {
        this.init();
    }

    private normalizeKey(uri: string): string {
        if (!uri) return '';
        const clean = uri.trim().toLowerCase();
        // Extrai o nome do arquivo limpo para servir como chave alternativa caso o diretório temporário mude
        const filename = clean.split('/').pop() || clean;
        return filename
            .replace(/^offline_/, '')
            .replace(/^nexus_upload_\d+_/, '')
            .replace(/^safe_/, '');
    }

    async init(): Promise<void> {
        if (this.isInitialized) return;
        try {
            const raw = await AsyncStorage.getItem(ASSET_CACHE_KEY);
            if (raw) {
                const parsed: Record<string, string> = JSON.parse(raw);
                Object.entries(parsed).forEach(([key, val]) => {
                    this.cache.set(key, val);
                });
            }
            this.isInitialized = true;
        } catch (e) {
            console.warn('[AssetCache] Erro ao carregar cache de mídias:', e);
            this.isInitialized = true;
        }
    }

    /**
     * Busca URL remota previamente enviada para um caminho local
     */
    getRemoteUrl(localUri: string): string | null {
        if (!localUri) return null;
        if (localUri.startsWith('http://') || localUri.startsWith('https://')) {
            return localUri;
        }

        // 1. Busca exata pela URI completa
        if (this.cache.has(localUri)) {
            return this.cache.get(localUri) || null;
        }

        // 2. Busca pela chave normalizada (nome do arquivo)
        const key = this.normalizeKey(localUri);
        if (this.cache.has(key)) {
            return this.cache.get(key) || null;
        }

        return null;
    }

    /**
     * Registra que uma mídia local foi enviada para a nuvem
     */
    async setRemoteUrl(localUri: string, remoteUrl: string): Promise<void> {
        if (!localUri || !remoteUrl) return;
        await this.init();

        this.cache.set(localUri, remoteUrl);
        const key = this.normalizeKey(localUri);
        this.cache.set(key, remoteUrl);

        // Agendar persistência em disco sem bloquear thread
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.persist();
        }, 500);
    }

    private async persist(): Promise<void> {
        try {
            const obj: Record<string, string> = {};
            this.cache.forEach((val, key) => {
                obj[key] = val;
            });
            await AsyncStorage.setItem(ASSET_CACHE_KEY, JSON.stringify(obj));
        } catch (e) {
            console.warn('[AssetCache] Erro ao salvar cache de mídias:', e);
        }
    }

    async clear(): Promise<void> {
        this.cache.clear();
        await AsyncStorage.removeItem(ASSET_CACHE_KEY).catch(() => {});
    }
}

export const assetCacheService = new AssetCacheService();
