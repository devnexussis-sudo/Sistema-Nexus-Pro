
import { supabase, adminSupabase } from '../lib/supabase';
import { CacheManager } from '../lib/cache';
import { SessionStorage, GlobalStorage } from '../lib/sessionStorage';

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

export const ContractService = {

    _mapContractFromDB: (data: any): any => {
        return {
            id: data.id,
            tenantId: data.tenant_id,
            // O id agora é o pmocCode, eliminamos a redundância
            pmocCode: data.id,
            title: data.title,
            description: data.description,
            customerName: data.customer_name || data.customerName,
            customerAddress: data.customer_address || data.customerAddress,
            status: data.status,
            priority: data.priority,
            operationType: data.operation_type || data.operationType,
            scheduledDate: data.scheduled_date || data.scheduledDate,
            periodicity: data.periodicity,
            maintenanceDay: data.maintenance_day || data.maintenanceDay,
            equipmentIds: data.equipment_ids || data.equipmentIds || [],
            logs: data.logs || [],
            alertSettings: data.alert_settings || data.alertSettings,
            // Novos campos comerciais
            contractValue: data.contract_value || data.contractValue || 0,
            includesParts: data.includes_parts || data.includesParts || false,
            visitCount: data.visit_count || data.visitCount || 1,
            contractTerms: data.contract_terms || data.contractTerms || '',
            createdAt: data.created_at || data.createdAt,
            updatedAt: data.updated_at || data.updatedAt
        };
    },

    getContracts: async (): Promise<any[]> => {
        if (isCloudEnabled) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];

            const cacheKey = `contracts_${tenantId}`;
            const cached = CacheManager.get<any[]>(cacheKey);
            if (cached) return cached;

            return CacheManager.deduplicate(cacheKey, async () => {
                const { data, error } = await supabase.from('contracts')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error("Erro ao buscar contratos:", error);
                    return [];
                }
                const mapped = (data || []).map(d => ContractService._mapContractFromDB(d));
                CacheManager.set(cacheKey, mapped, CacheManager.TTL.MEDIUM); // 5 min
                return mapped;
            });
        }
        return [];
    },

    createContract: async (contract: any): Promise<any> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled) {
            const dbPayload = {
                id: contract.pmocCode, // 🔥 Agora usamos apenas o ID
                tenant_id: tid,
                title: contract.title,
                description: contract.description,
                customer_name: contract.customerName,
                customer_address: contract.customerAddress,
                status: contract.status || 'PENDENTE',
                priority: contract.priority || 'MÉDIA',
                operation_type: contract.operationType || 'Manutenção Preventiva',
                scheduled_date: contract.scheduledDate,
                periodicity: contract.periodicity,
                maintenance_day: contract.maintenanceDay,
                equipment_ids: contract.equipmentIds,
                logs: contract.logs,
                alert_settings: contract.alertSettings,
                // Novos campos comerciais
                contract_value: contract.contractValue,
                includes_parts: contract.includesParts,
                visit_count: contract.visitCount,
                contract_terms: contract.contractTerms,
                created_at: new Date().toISOString()
            };

            const { data, error } = await supabase.from('contracts').insert([dbPayload]).select();
            if (error) {
                console.error("❌ Nexus Insert Error:", error.message);
                throw error;
            }

            CacheManager.invalidate(`contracts_${tid}`);
            return ContractService._mapContractFromDB(data?.[0]);
        }
        return contract;
    },

    updateContract: async (contract: any): Promise<any> => {
        if (isCloudEnabled) {
            const dbPayload = {
                title: contract.title,
                description: contract.description,
                status: contract.status,
                priority: contract.priority,
                operation_type: contract.operationType,
                scheduled_date: contract.scheduledDate,
                periodicity: contract.periodicity,
                maintenance_day: contract.maintenanceDay,
                equipment_ids: contract.equipmentIds,
                logs: contract.logs,
                alert_settings: contract.alertSettings,
                // Novos campos comerciais
                contract_value: contract.contractValue,
                includes_parts: contract.includesParts,
                visit_count: contract.visitCount,
                contract_terms: contract.contractTerms,
                updated_at: new Date().toISOString()
            };
            const tid = getCurrentTenantId();
            if (!tid) throw new Error("Tenant não identificado.");

            const { data, error } = await supabase.from('contracts')
                .update(dbPayload)
                .eq('id', contract.id)
                .eq('tenant_id', tid)
                .select();
            if (error) {
                console.error("❌ Nexus Update Error:", error.message);
                throw error;
            }

            CacheManager.invalidate(`contracts_${tid}`);
            return ContractService._mapContractFromDB(data?.[0]);
        }
        return contract;
    },

    deleteContract: async (id: string): Promise<void> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled && tid) {
            const { error } = await supabase.from('contracts')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tid);

            if (error) throw error;
            CacheManager.invalidate(`contracts_${tid}`);
        }
    }
};
