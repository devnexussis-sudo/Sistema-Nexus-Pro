
import { supabase, adminSupabase } from '../lib/supabase';
import { Customer } from '../types';
import { CacheManager } from '../lib/cache';
import { SessionStorage, GlobalStorage } from '../lib/sessionStorage';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const STORAGE_KEYS = { CUSTOMERS: 'nexus_customers_v2' };

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

export const CustomerService = {

    _mapCustomerFromDB: (data: any): Customer => {
        return {
            ...data,
            tenantId: data.tenant_id,
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

    getCustomers: async (): Promise<Customer[]> => {
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

            return CacheManager.deduplicate(cacheKey, async () => {
                const { data, error } = await supabase.from('customers')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('name');

                if (error) {
                    console.error("Erro ao buscar clientes:", error);
                    return [];
                }

                const mapped = (data || []).map(d => CustomerService._mapCustomerFromDB(d));
                CacheManager.set(cacheKey, mapped, CacheManager.TTL.MEDIUM);
                return mapped;
            });
        }
        return [];
    },

    createCustomer: async (customer: Customer): Promise<Customer> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled) {
            if (!tid) throw new Error("Tenant ID não encontrado.");

            const { id, tenantId, ...rest } = customer as any;

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
            const { id, tenantId, created_at, ...rest } = customer as any;
            const dbPayload = {
                ...rest
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
