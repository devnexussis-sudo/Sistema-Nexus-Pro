
import { supabase } from '../lib/supabase';
import { Equipment } from '../types';
import type { DbEquipment } from '../types/database';
import { CacheManager } from '../lib/cache';
import { getCurrentTenantId } from '../lib/tenantContext';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────────────────────
// 🔑 Nexus Asset Code Engine — Código Visual Único (6 dígitos numéricos)
// Formato: 6 dígitos (ex: "483921")
// ─────────────────────────────────────────────────────────────

function _generateRawCode(): string {
    // Gera número aleatório entre 100000 e 999999 (sempre 6 dígitos)
    return String(Math.floor(100000 + Math.random() * 900000));
}

/** Gera um código de 6 dígitos garantidamente único dentro do tenant */
async function _generateUniqueAssetCode(tenantId: string): Promise<string> {
    const MAX_ATTEMPTS = 20;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const code = _generateRawCode();
        const { count } = await supabase
            .from('equipments')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('asset_code', code);

        if (count === 0) return code; // Único — pode usar
    }
    // Fallback extremamente improvável: usa timestamp para garantir unicidade
    return Date.now().toString(36).toUpperCase().slice(-6);
}

/** Formata o código para exibição: sem alterações (somente números) */
export function formatAssetCode(code: string | undefined): string {
    if (!code) return '---';
    return code;
}

export const EquipmentService = {

    _mapEquipmentFromDB: (data: DbEquipment): Equipment => {
        return {
            id: data.id,
            tenantId: data.tenant_id,
            assetCode: data.asset_code,
            name: (data as any).name,
            serialNumber: data.serial_number,
            model: data.model,
            familyId: data.family_id,
            familyName: data.family_name,
            description: data.description,
            customerId: data.customer_id,
            customerName: data.customer_name,
            active: data.active,
            createdAt: data.created_at
        };
    },

    getEquipments: async (signal?: AbortSignal): Promise<Equipment[]> => {
        if (isCloudEnabled) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];

            const cacheKey = `equipments_${tenantId}`;
            const cached = CacheManager.get<Equipment[]>(cacheKey);
            if (cached) return cached;

            return CacheManager.deduplicate(cacheKey, async (currentSignal) => {
                let query = supabase.from('equipments')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('model')
                    .limit(500);

                if (currentSignal || signal) {
                    query = query.abortSignal((currentSignal || signal) as AbortSignal);
                }

                const { data, error } = await query;
                if (error) throw error;

                const mapped = (data || []).map(d => EquipmentService._mapEquipmentFromDB(d));
                CacheManager.set(cacheKey, mapped, CacheManager.TTL.MEDIUM);
                return mapped;
            }, signal);
        }
        return [];
    },

    createEquipment: async (equipment: Equipment): Promise<Equipment> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled && tid) {
            const newId = `eq-${Date.now().toString(36)}`;

            // 🔑 Gera código único automaticamente
            const assetCode = await _generateUniqueAssetCode(tid);

            const dbPayload = {
                id: newId,
                asset_code: assetCode,
                name: equipment.name,
                serial_number: equipment.serialNumber,
                model: equipment.model,
                family_id: equipment.familyId,
                family_name: equipment.familyName,
                description: equipment.description,
                customer_id: equipment.customerId,
                customer_name: equipment.customerName,
                active: equipment.active,
                tenant_id: tid,
                updated_at: new Date().toISOString()
            };

            const { data: res, error } = await supabase.from('equipments').insert([dbPayload]).select().single();
            if (error) throw error;
            CacheManager.invalidate(`equipments_${tid}`);

            return EquipmentService._mapEquipmentFromDB(res);
        }
        return equipment;
    },

    updateEquipment: async (equipment: Equipment): Promise<Equipment> => {
        if (isCloudEnabled) {
            const tid = getCurrentTenantId();
            if (!tid) throw new Error("Tenant não identificado.");

            const dbPayload: Record<string, any> = {
                name: equipment.name,
                serial_number: equipment.serialNumber,
                model: equipment.model,
                family_id: equipment.familyId,
                family_name: equipment.familyName,
                description: equipment.description,
                customer_id: equipment.customerId,
                customer_name: equipment.customerName,
                active: equipment.active,
                updated_at: new Date().toISOString()
            };

            // Se o ativo não tem código ainda, gera agora (backfill on-demand)
            if (!equipment.assetCode) {
                dbPayload.asset_code = await _generateUniqueAssetCode(tid);
            }

            const { data, error } = await supabase.from('equipments')
                .update(dbPayload)
                .eq('id', equipment.id)
                .eq('tenant_id', tid)
                .select()
                .single();

            if (error) throw error;
            CacheManager.invalidate(`equipments_${tid}`);

            return EquipmentService._mapEquipmentFromDB(data);
        }
        return equipment;
    },

    deleteEquipment: async (id: string): Promise<void> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled && tid) {
            const { error } = await supabase.from('equipments')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tid);

            if (error) throw error;
            CacheManager.invalidate(`equipments_${tid}`);
        }
    },

    /**
     * 🔄 Backfill Engine — Atribui códigos a todos os ativos que ainda não possuem.
     * Chame manualmente uma vez ou ao montar o componente de ativos.
     */
    backfillMissingCodes: async (): Promise<number> => {
        const tid = getCurrentTenantId();
        if (!isCloudEnabled || !tid) return 0;

        const { data, error } = await supabase
            .from('equipments')
            .select('id')
            .eq('tenant_id', tid)
            .is('asset_code', null);

        if (error || !data || data.length === 0) return 0;

        let updated = 0;
        for (const eq of data) {
            try {
                const code = await _generateUniqueAssetCode(tid);
                await supabase.from('equipments')
                    .update({ asset_code: code })
                    .eq('id', eq.id)
                    .eq('tenant_id', tid);
                updated++;
            } catch (e) {
                console.warn(`[EquipmentService] Backfill falhou para eq ${eq.id}`, e);
            }
        }

        if (updated > 0) {
            CacheManager.invalidate(`equipments_${tid}`);
            console.log(`[EquipmentService] ✅ Backfill: ${updated} ativos receberam código único.`);
        }

        return updated;
    }
};
