// ============================================================
// src/services/paginationService.ts
// 🗄️ NEXUS LINE — Server-Side Pagination Helpers
//
// Padrão: todas as listas de volume (OS, Orçamentos, Contratos) 
// usam .range() no Supabase para buscar apenas N itens por vez.
// Clientes, Equipamentos e Técnicos são dados de referência —
// carregados uma vez com limite conservador e cache longo.
// ============================================================

import { supabase } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';
import { OrderService } from './orderService';
import { QuoteService } from './quoteService';
import { ContractService } from './contractService';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const PAGE_SIZE = 20;

export interface PageResult<T> {
    data: T[];
    total: number;    // total de registros no banco (para calcular lastPage)
    page: number;
    pageSize: number;
    lastPage: number;
}

// ─────────────────────────────────────────────
// ORDERS — paginação server-side real
// ─────────────────────────────────────────────
export interface OrderFilters {
    status?: string;
    technicianId?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
}

export const getOrdersPage = async (
    page: number = 1,
    filters: OrderFilters = {},
    signal?: AbortSignal
): Promise<PageResult<any>> => {
    if (!isCloudEnabled) return { data: [], total: 0, page, pageSize: PAGE_SIZE, lastPage: 1 };

    const tenantId = getCurrentTenantId();
    if (!tenantId) return { data: [], total: 0, page, pageSize: PAGE_SIZE, lastPage: 1 };

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
        .from('orders')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
    }
    if (filters.technicianId) {
        query = query.eq('assigned_to', filters.technicianId);
    }
    if (filters.startDate) {
        query = query.gte('scheduled_date', filters.startDate);
    }
    if (filters.endDate) {
        query = query.lte('scheduled_date', filters.endDate);
    }
    if (filters.search) {
        // ilike em display_id ou customer_name
        query = query.or(`display_id.ilike.%${filters.search}%,customer_name.ilike.%${filters.search}%,description.ilike.%${filters.search}%`);
    }

    if (signal) query = query.abortSignal(signal);

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    const mapped = (data || []).map(d => OrderService._mapOrderFromDB(d));
    const total = count || 0;
    return { data: mapped, total, page, pageSize: PAGE_SIZE, lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
};

// ─────────────────────────────────────────────
// QUOTES — paginação server-side real
// ─────────────────────────────────────────────
export interface QuoteFilters {
    status?: string;
    search?: string;
}

export const getQuotesPage = async (
    page: number = 1,
    filters: QuoteFilters = {},
    signal?: AbortSignal
): Promise<PageResult<any>> => {
    if (!isCloudEnabled) return { data: [], total: 0, page, pageSize: PAGE_SIZE, lastPage: 1 };

    const tenantId = getCurrentTenantId();
    if (!tenantId) return { data: [], total: 0, page, pageSize: PAGE_SIZE, lastPage: 1 };

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
        .from('quotes')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
    }
    if (filters.search) {
        query = query.or(`customer_name.ilike.%${filters.search}%,display_id.ilike.%${filters.search}%,title.ilike.%${filters.search}%`);
    }

    if (signal) query = query.abortSignal(signal);

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    const mapped = (data || []).map(d => QuoteService._mapQuoteFromDB(d));
    const total = count || 0;
    return { data: mapped, total, page, pageSize: PAGE_SIZE, lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
};

// ─────────────────────────────────────────────
// CONTRACTS — paginação server-side real
// ─────────────────────────────────────────────
export interface ContractFilters {
    status?: string;
    search?: string;
}

export const getContractsPage = async (
    page: number = 1,
    filters: ContractFilters = {},
    signal?: AbortSignal
): Promise<PageResult<any>> => {
    if (!isCloudEnabled) return { data: [], total: 0, page, pageSize: PAGE_SIZE, lastPage: 1 };

    const tenantId = getCurrentTenantId();
    if (!tenantId) return { data: [], total: 0, page, pageSize: PAGE_SIZE, lastPage: 1 };

    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    let query = supabase
        .from('contracts')
        .select('*', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

    if (filters.status && filters.status !== 'ALL') {
        query = query.eq('status', filters.status);
    }
    if (filters.search) {
        query = query.or(`customer_name.ilike.%${filters.search}%,title.ilike.%${filters.search}%`);
    }

    if (signal) query = query.abortSignal(signal);

    const { data, error, count } = await query.range(from, to);

    if (error) throw error;

    const mapped = (data || []).map(d => ContractService._mapContractFromDB(d));
    const total = count || 0;
    return { data: mapped, total, page, pageSize: PAGE_SIZE, lastPage: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
};

export { PAGE_SIZE };
