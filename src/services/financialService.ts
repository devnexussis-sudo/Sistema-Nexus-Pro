
import { supabase, adminSupabase } from '../lib/supabase';
import { CashFlowEntry } from '../types';
import { AuthService } from './authService';
import { SessionStorage, GlobalStorage } from '../lib/sessionStorage';
import { logger } from '../lib/logger';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// Helper para obter tenant ID (DRY)
const getCurrentTenantId = (): string | undefined => {
    try {
        const techSession = localStorage.getItem('nexus_tech_session_v2') || localStorage.getItem('nexus_tech_session');
        if (techSession) {
            const user = JSON.parse(techSession);
            const tid = user.tenantId || user.tenant_id;
            if (tid) return tid;
        }

        const userStr = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
        if (userStr) {
            const user = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
            const tid = user.tenantId || user.tenant_id;
            if (tid) return tid;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const urlTid = urlParams.get('tid') || SessionStorage.get('current_tenant');
        if (urlTid) return urlTid;

        return undefined;
    } catch (e) {
        return undefined;
    }
};

export const FinancialService = {

    // --- Fluxo de Caixa ---

    registerCashFlow: async (entry: Partial<CashFlowEntry>): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            // Buscar user ID de forma resiliente
            let createdById: string | undefined;
            try {
                const currentUser = await AuthService.getCurrentUser();
                createdById = currentUser?.id;
            } catch (err) {
                console.warn("⚠️ Não foi possível obter getCurrentUser, tentando session fallback:", err);
                // Fallback: pegar do SessionStorage
                try {
                    const sessionUser = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
                    if (sessionUser) {
                        createdById = typeof sessionUser === 'string' ? JSON.parse(sessionUser).id : sessionUser.id;
                    }
                } catch (e) {
                    console.warn("⚠️ Fallback de usuário também falhou, usando 'sistema'");
                }
            }

            const dbEntry = {
                tenant_id: tenantId,
                type: entry.type,
                category: entry.category,
                amount: entry.amount,
                description: entry.description,
                reference_id: entry.referenceId,
                reference_type: entry.referenceType,
                payment_method: entry.paymentMethod,
                entry_date: entry.entryDate || new Date().toISOString(),
                created_by: createdById || 'sistema' // Fallback para 'sistema' se não conseguir obter user
            };

            const { error } = await supabase.from('cash_flow').insert([dbEntry]);
            if (error) {
                console.error("❌ Erro ao registrar no fluxo de caixa:", error);
                throw error;
            }
            console.log("✅ Entrada registrada no fluxo de caixa");
        }
    },

    getCashFlow: async (filters?: { start?: string, end?: string }): Promise<CashFlowEntry[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            let query = supabase.from('cash_flow').select('*').eq('tenant_id', tenantId);
            if (filters?.start) query = query.gte('entry_date', filters.start);
            if (filters?.end) query = query.lte('entry_date', filters.end);

            const { data, error } = await query.order('entry_date', { ascending: false });
            if (error) throw error;
            return data.map(d => ({
                id: d.id,
                tenantId: d.tenant_id,
                type: d.type,
                category: d.category,
                amount: Number(d.amount),
                description: d.description,
                referenceId: d.reference_id,
                referenceType: d.reference_type,
                paymentMethod: d.payment_method,
                entryDate: d.entry_date,
                createdAt: d.created_at,
                createdBy: d.created_by
            })) as CashFlowEntry[];
        }
        return [];
    }
};
