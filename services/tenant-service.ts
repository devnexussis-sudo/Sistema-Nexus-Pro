
import { authService } from './auth-service';
import { logger } from './logger';
import { supabase } from './supabase';

export interface TenantSettings {
    showStockPrice: boolean;
    allowMultipleInProgress: boolean;
    showClientContact: boolean;
    showStockHistory: boolean;
    allowImpediment: boolean;
    showVisitHistory: boolean;
    requireLocationForExecution: boolean;
    allowOsSharing: boolean;
}

const DEFAULT_SETTINGS: TenantSettings = {
    showStockPrice: false,
    allowMultipleInProgress: false,
    showClientContact: true,
    showStockHistory: true,
    allowImpediment: true,
    showVisitHistory: true,
    requireLocationForExecution: false,
    allowOsSharing: true,
};

export class TenantService {
    private static settingsCache: Record<string, TenantSettings> = {};
    private static activeListeners: Set<(settings: TenantSettings) => void> = new Set();
    private static realtimeChannel: any = null;
    private static currentTenantId: string | null = null;

    /**
     * Inscreve um ouvinte para receber atualizações de configurações em tempo real
     */
    static onSettingsChange(listener: (settings: TenantSettings) => void) {
        this.activeListeners.add(listener);
        return () => {
            this.activeListeners.delete(listener);
        };
    }

    /**
     * Inicia a escuta em tempo real da tabela 'tenants' via Supabase Realtime WebSocket
     */
    static startRealtimeListener(tenantId: string) {
        if (!tenantId || this.currentTenantId === tenantId) return;
        
        if (this.realtimeChannel) {
            try {
                supabase.removeChannel(this.realtimeChannel);
            } catch (e) {}
        }

        this.currentTenantId = tenantId;
        console.log(`[TenantService] ⚡ Iniciando Supabase Realtime para o tenant: ${tenantId}`);

        this.realtimeChannel = supabase
            .channel(`tenant_settings_${tenantId}_${Date.now()}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'tenants',
                },
                async (payload: any) => {
                    const updatedId = payload.new?.id || payload.old?.id;
                    if (updatedId && tenantId && updatedId !== tenantId) return;

                    console.log('[TenantService] 🔔 Alteração de configurações da empresa detectada em tempo real!', payload);
                    this.clearCache();
                    const newSettings = await this.getSettings(true);
                    this.activeListeners.forEach((listener) => {
                        try {
                            listener(newSettings);
                        } catch (err) {
                            console.error('[TenantService] Erro ao notificar listener:', err);
                        }
                    });
                }
            )
            .subscribe((status) => {
                console.log(`[TenantService] 📡 Status da conexão Realtime: ${status}`);
            });
    }

    /**
     * Busca as configurações globais do tenant do usuário logado
     * @param forceRefresh Se true, ignora o cache e busca direto do banco
     */
    static async getSettings(forceRefresh = false): Promise<TenantSettings> {
        try {
            let userId = authService.getCurrentUserId();
            if (!userId) {
                const { data: sessionData } = await supabase.auth.getSession();
                userId = sessionData?.session?.user?.id || null;
            }

            if (!userId) {
                console.log('[TenantService] No userId found in authService nor session, returning default settings');
                return { ...DEFAULT_SETTINGS };
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
                return { ...DEFAULT_SETTINGS };
            }

            const tenantId = userData.tenant_id;
            console.log(`[TenantService] 🏢 Tenant ID: ${tenantId}`);

            // Garante que o ouvinte em tempo real esteja ativo para este tenant
            this.startRealtimeListener(tenantId);

            // 2. Get settings from tenants table
            const { data: tenantData, error: tenantError } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', tenantId)
                .single();

            if (tenantError) {
                console.error(`[TenantService] ❌ Erro ao buscar tenant: ${tenantError.message}`);
                logger.log(`Tenant settings fetch error: ${tenantError.message}`, 'warn');
                return { ...DEFAULT_SETTINGS };
            }

            console.log('[TenantService] 📦 Dados do tenant recebidos:', JSON.stringify(tenantData));

            // Tratamento robusto de metadata (string JSON vs Object)
            let meta: Record<string, any> = {};
            if (typeof tenantData?.metadata === 'string') {
                try {
                    meta = JSON.parse(tenantData.metadata);
                } catch (e) {
                    console.warn('[TenantService] Falha ao parsear metadata JSON string:', e);
                    meta = {};
                }
            } else if (tenantData?.metadata && typeof tenantData.metadata === 'object') {
                meta = tenantData.metadata;
            }

            console.log('[TenantService] 🛠️ Metadata parseado:', JSON.stringify(meta));

            // Mapeamento flexível de colunas - Priorizando o que o painel salva (metadata.showItemPricesInApp)
            const settings: TenantSettings = {
                showStockPrice: meta?.showItemPricesInApp ??
                    tenantData?.show_stock_price ??
                    tenantData?.settings?.show_stock_price ??
                    false,
                allowMultipleInProgress: meta?.allowMultipleInProgress ?? false,
                showClientContact: meta?.showClientContact ?? true,
                showStockHistory: meta?.showStockHistory ?? true,
                allowImpediment: meta?.allowImpediment ?? true,
                showVisitHistory: meta?.showVisitHistory ?? true,
                requireLocationForExecution: meta?.requireLocationForExecution ?? false,
                allowOsSharing: meta?.allowOsSharing ?? true,
            };

            console.log(`[TenantService] ✅ Configuração final -> showStockPrice: ${settings.showStockPrice}, showClientContact: ${settings.showClientContact}, showStockHistory: ${settings.showStockHistory}, allowImpediment: ${settings.allowImpediment}, showVisitHistory: ${settings.showVisitHistory}, allowOsSharing: ${settings.allowOsSharing}`);

            this.settingsCache[userId] = settings;
            return settings;
        } catch (error) {
            console.error('[TenantService] 💥 Exceção:', error);
            logger.log(`TenantService exception: ${error}`, 'error');
            return { ...DEFAULT_SETTINGS };
        }
    }

    /**
     * Limpa o cache para forçar recarregamento (ex: após login)
     */
    static clearCache() {
        this.settingsCache = {};
    }
}
