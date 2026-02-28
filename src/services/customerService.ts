
import { supabase } from '../lib/supabase';
import { Customer } from '../types';
import type { DbCustomer } from '../types/database';
import { CacheManager } from '../lib/cache';
import { getCurrentTenantId } from '../lib/tenantContext';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const STORAGE_KEYS = { CUSTOMERS: 'nexus_customers_v2' };



export const CustomerService = {

    _mapCustomerFromDB: (data: DbCustomer): Customer => {
        return {
            id: data.id,
            tenantId: data.tenant_id,
            type: data.type,
            name: data.name,
            document: data.document,
            email: data.email,
            phone: data.phone,
            whatsapp: data.whatsapp,
            zip: data.zip,
            state: data.state,
            city: data.city,
            address: data.address,
            number: data.number,
            complement: data.complement,
            active: data.active
        };
    },

    getCustomers: async (signal?: AbortSignal): Promise<Customer[]> => {
        if (isCloudEnabled) {
            let tenantId = getCurrentTenantId();

            if (!tenantId) {
                // If needed, try to recover from session or wait
                // For now, return empty if no tenant
                return [];
            }

            const cacheKey = `customers_${tenantId}`;
            const cached = CacheManager.get<Customer[]>(cacheKey);
            if (cached) return cached;

            return CacheManager.deduplicate(cacheKey, async (currentSignal) => {
                let query = supabase.from('customers')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('name')
                    .limit(100);

                if (currentSignal || signal) {
                    query = query.abortSignal((currentSignal || signal) as AbortSignal);
                }

                const { data, error } = await query;

                if (error) {
                    throw error;
                }

                const mapped = (data || []).map(d => CustomerService._mapCustomerFromDB(d));
                CacheManager.set(cacheKey, mapped, CacheManager.TTL.MEDIUM);
                return mapped;
            }, signal);
        }
        return [];
    },

    createCustomer: async (customer: Customer): Promise<Customer> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled) {
            if (!tid) throw new Error("Tenant ID não encontrado.");

            const { id, tenantId, ...rest } = customer;

            // 🛡️ Nexus ID Gen: Garantia de ID único para o Clientes
            const newId = crypto.randomUUID();

            const dbPayload = {
                ...rest,
                id: newId,
                tenant_id: tid
            };

            const { data, error } = await supabase.from('customers').insert([dbPayload]).select().single();
            if (error) throw error;

            // Invalidate cache
            CacheManager.invalidate(`customers_${tid}`);

            return CustomerService._mapCustomerFromDB(data);
        }
        return customer;
    },

    updateCustomer: async (customer: Customer): Promise<Customer> => {
        if (isCloudEnabled) {
            const { id, tenantId, ...rest } = customer;
            // Remove created_at if present in rest (runtime safety)
            const { created_at: _ca, ...dbFields } = rest as Customer & { created_at?: string };
            const dbPayload = {
                ...dbFields
            };
            const tid = getCurrentTenantId();
            if (!tid) throw new Error("Tenant não identificado.");

            const { data, error } = await supabase.from('customers')
                .update(dbPayload)
                .eq('id', customer.id)
                .eq('tenant_id', tid)
                .select()
                .single();

            if (error) throw error;

            // Invalidate cache
            CacheManager.invalidate(`customers_${tid}`);

            return CustomerService._mapCustomerFromDB(data);
        }
        return customer;
    },

    deleteCustomer: async (id: string): Promise<void> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled && tid) {
            const { error } = await supabase.from('customers')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tid);

            if (error) throw error;
            CacheManager.invalidate(`customers_${tid}`);
        }
    }
};
