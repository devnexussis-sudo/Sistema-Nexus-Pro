
import { authService } from './auth-service';
import { logger } from './logger';
import { supabase } from './supabase';

export interface TenantSettings {
    showStockPrice: boolean;
}

export class TenantService {
    private static settingsCache: Record<string, TenantSettings> = {};

    /**
     * Busca as configurações globais do tenant do usuário logado
     * @param forceRefresh Se true, ignora o cache e busca direto do banco
     */
    static async getSettings(forceRefresh = false): Promise<TenantSettings> {
        try {
            const userId = authService.getCurrentUserId();
            if (!userId) {
                console.log('[TenantService] No userId found, returning default settings');
                return { showStockPrice: false };
            }

            if (!forceRefresh && this.settingsCache[userId]) {
                return this.settingsCache[userId];
            }

            console.log(`[TenantService] 🔄 Buscando configurações para o usuário: ${userId} (force: ${forceRefresh})`);

            // 1. Get tenant_id from user
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', userId)
                .single();

            if (userError || !userData?.tenant_id) {
                console.warn('[TenantService] Error or no tenant_id for user:', userError?.message);
                return { showStockPrice: false };
            }

            const tenantId = userData.tenant_id;
            console.log(`[TenantService] 🏢 Tenant ID: ${tenantId}`);

            // 2. Get settings from tenants table
            const { data: tenantData, error: tenantError } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', tenantId)
                .single();

            if (tenantError) {
                console.error(`[TenantService] ❌ Erro ao buscar tenant: ${tenantError.message}`);
                logger.log(`Tenant settings fetch error: ${tenantError.message}`, 'warn');
                return { showStockPrice: false };
            }

            console.log('[TenantService] 📦 Dados do tenant recebidos:', JSON.stringify(tenantData));

            // Mapeamento flexível de colunas - Priorizando o que o painel salva (metadata.showItemPricesInApp)
            const settings = {
                showStockPrice: tenantData?.metadata?.showItemPricesInApp ??
                    tenantData?.show_stock_price ??
                    tenantData?.settings?.show_stock_price ??
                    false
            };

            console.log(`[TenantService] ✅ Configuração final -> showStockPrice: ${settings.showStockPrice}`);

            this.settingsCache[userId] = settings;
            return settings;
        } catch (error) {
            console.error('[TenantService] 💥 Exceção:', error);
            logger.log(`TenantService exception: ${error}`, 'error');
            return { showStockPrice: false };
        }
    }

    /**
     * Limpa o cache para forçar recarregamento (ex: após login)
     */
    static clearCache() {
        this.settingsCache = {};
    }
}
