
import { supabase } from '../lib/supabase';
import { Equipment } from '../types';
import type { DbEquipment } from '../types/database';
import { CacheManager } from '../lib/cache';
import { getCurrentTenantId } from '../lib/tenantContext';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);



export const EquipmentService = {

    _mapEquipmentFromDB: (data: DbEquipment): Equipment => {
        return {
            id: data.id,
            tenantId: data.tenant_id,
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

    getEquipments: async (): Promise<Equipment[]> => {
        if (isCloudEnabled) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];

            const cacheKey = `equipments_${tenantId}`;
            const cached = CacheManager.get<Equipment[]>(cacheKey);
            if (cached) return cached;

            return CacheManager.deduplicate(cacheKey, async () => {
                const { data, error } = await supabase.from('equipments')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('model')
                    .limit(100);

                if (error) {
                    console.error("Erro ao buscar equipamentos:", error);
                    return [];
                }
                const mapped = (data || []).map(d => EquipmentService._mapEquipmentFromDB(d));
                CacheManager.set(cacheKey, mapped, CacheManager.TTL.MEDIUM); // 5 min
                return mapped;
            });
        }
        return [];
    },

    createEquipment: async (equipment: Equipment): Promise<Equipment> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled) {
            const { id: _id, tenantId: _tid, ...rest } = equipment;

            // 🛡️ Nexus ID Gen: Gera ID se o banco não for auto-increment
            const newId = `eq-${Date.now().toString(36)}`;

            const dbPayload = {
                id: newId,
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

            const dbPayload = {
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

            const { data, error } = await supabase.from('equipments')
                .update(dbPayload)
                .eq('id', equipment.id)
                .eq('tenant_id', tid) // 🛡️ Nexus Security: Garante que só altera o próprio tenant
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
    }
};
