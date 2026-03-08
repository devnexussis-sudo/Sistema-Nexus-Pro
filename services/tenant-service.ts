
import { supabase } from './supabase';
import { authService } from './auth-service';
import { logger } from './logger';

export interface TenantSettings {
    showStockPrice: boolean;
}

export class TenantService {
    private static settingsCache: Record<string, TenantSettings> = {};

    /**
     * Busca as configurações globais do tenant do usuário logado
     */
    static async getSettings(): Promise<TenantSettings> {
        try {
            const userId = authService.getCurrentUserId();
            if (!userId) return { showStockPrice: true };

            if (this.settingsCache[userId]) {
                return this.settingsCache[userId];
            }

            // 1. Get tenant_id from user
            const { data: userData, error: userError } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', userId)
                .single();

            if (userError || !userData?.tenant_id) {
                return { showStockPrice: true };
            }

            const tenantId = userData.tenant_id;

            // 2. Get settings from tenants table
            // Based on common "Nexus" admin panel structure, we assume show_stock_price
            const { data: tenantData, error: tenantError } = await supabase
                .from('tenants')
                .select('show_stock_price')
                .eq('id', tenantId)
                .single();

            if (tenantError) {
                // If column doesn't exist, we'll try a different approach or default to true
                logger.log(`Tenant settings fetch error: ${tenantError.message}`, 'warn');
                return { showStockPrice: true };
            }

            const settings = {
                showStockPrice: tenantData?.show_stock_price ?? true
            };

            this.settingsCache[userId] = settings;
            return settings;
        } catch (error) {
            logger.log(`TenantService exception: ${error}`, 'error');
            return { showStockPrice: true };
        }
    }

    /**
     * Limpa o cache para forçar recarregamento (ex: após login)
     */
    static clearCache() {
        this.settingsCache = {};
    }
}
