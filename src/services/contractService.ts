
import { supabase } from '../lib/supabase';
import { CacheManager } from '../lib/cache';
import { Contract } from '../types';
import type { DbContract } from '../types/database';
import { getCurrentTenantId } from '../lib/tenantContext';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

/** Campos adicionais de contrato comercial (não estão no types/index.ts) */
interface ContractExtended extends Contract {
    contractValue?: number;
    includesParts?: boolean;
    visitCount?: number;
    contractTerms?: string;
}

export const ContractService = {

    _mapContractFromDB: (data: DbContract & Record<string, unknown>): ContractExtended => {
        return {
            id: data.id,
            tenantId: data.tenant_id,
            pmocCode: (data.display_id as string) || (data.id as string),
            title: data.title,
            description: data.description,
            customerName: data.customer_name,
            customerAddress: data.customer_address,
            status: data.status as Contract['status'],
            priority: data.priority as Contract['priority'],
            operationType: data.operation_type ?? '',
            scheduledDate: data.scheduled_date,
            periodicity: data.periodicity,
            maintenanceDay: data.maintenance_day,
            equipmentIds: data.equipment_ids ?? [],
            logs: data.logs ?? [],
            alertSettings: {
                enabled: data.alert_settings?.enabled ?? false,
                daysBefore: data.alert_settings?.days_before ?? 5,
                frequency: data.alert_settings?.frequency ?? 1
            },
            contractValue: (data.contract_value as number) ?? 0,
            includesParts: (data.includes_parts as boolean) ?? false,
            visitCount: (data.visit_count as number) ?? 1,
            contractTerms: (data.contract_terms as string) ?? '',
            createdAt: data.created_at,
            updatedAt: data.updated_at
        };
    },

    getContracts: async (signal?: AbortSignal): Promise<ContractExtended[]> => {
        if (isCloudEnabled) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];

            const cacheKey = `contracts_${tenantId}`;
            const cached = CacheManager.get<ContractExtended[]>(cacheKey);
            if (cached) return cached;

            return CacheManager.deduplicate(cacheKey, async (currentSignal) => {
                let query = supabase.from('contracts')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (currentSignal || signal) {
                    query = query.abortSignal((currentSignal || signal) as AbortSignal);
                }

                const { data, error } = await query;

                if (error) {
                    throw error;
                }
                const mapped = (data || []).map(d => ContractService._mapContractFromDB(d));
                CacheManager.set(cacheKey, mapped, CacheManager.TTL.MEDIUM); // 5 min
                return mapped;
            }, signal);
        }
        return [];
    },

    createContract: async (contract: Omit<ContractExtended, 'id' | 'createdAt' | 'updatedAt'>): Promise<ContractExtended> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled) {
            const dbPayload = {
                display_id: contract.pmocCode, // 🔥 Agora o código PMOC vai para display_id
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
        return contract as ContractExtended;
    },

    updateContract: async (contract: ContractExtended): Promise<ContractExtended> => {
        if (isCloudEnabled) {
            const dbPayload = {
                display_id: contract.pmocCode,
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
