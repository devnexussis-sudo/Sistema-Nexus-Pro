
import { useQuery, queryClient } from './useQuery';
import { OrderService } from '../services/orderService';
import { TechnicianService } from '../services/technicianService';
import { CustomerService } from '../services/customerService';
import { StockService } from '../services/stockService';
import { FinancialService } from '../services/financialService';
import { ContractService } from '../services/contractService';
import { QuoteService } from '../services/quoteService';
import { EquipmentService } from '../services/equipmentService';
import { FormService } from '../services/formService';
import { TenantService } from '../services/tenantService';
import { DataService } from '../services/dataService';
import { CacheManager } from '../lib/cache';
import { OrderStatus } from '../types';
import {
    getOrdersPage, getQuotesPage, getContractsPage,
    type OrderFilters, type QuoteFilters, type ContractFilters
} from '../services/paginationService';

// ------------------------------------------------------------------
// 📦 ORDERS HOOKS
// ------------------------------------------------------------------

export const useOrders = (enabled = true) => {
    return useQuery('orders', (signal) => OrderService.getOrders(undefined, signal), {
        enabled,
        staleTime: 1000 * 30, // 30 seconds
        keepPreviousData: true
    });
};

export const useOrdersStats = (enabled = true, startDate?: string, endDate?: string) => {
    // Cache key includes dates to ensure freshness when range changes
    const key = ['orders_stats', startDate || 'all', endDate || 'all'];
    return useQuery(key, (signal) => OrderService.getOrdersForStats(startDate, endDate, signal), {
        enabled,
        staleTime: 1000 * 60 * 5, // 5 minutes
        keepPreviousData: true
    });
};

export const useOrder = (id: string, enabled = true) => {
    return useQuery(['order', id], (signal) => OrderService.getPublicOrderById(id, signal), {
        enabled: enabled && !!id,
        staleTime: 1000 * 60 * 5,
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 📦 SERVER-SIDE PAGINATED HOOKS — Big Tech Standard
// busca do Supabase apenas os N itens da página atual via .range()
// ------------------------------------------------------------------

/**
 * Hook de OS paginadas — busca 20 itens por página direto do Supabase.
 * Muda de página = novo fetch. Filtros no servidor.
 */
export const usePagedOrders = (page: number, filters: OrderFilters = {}, enabled = true) => {
    const filtersKey = JSON.stringify(filters);
    const key = ['orders_paged', page.toString(), filtersKey];
    return useQuery(
        key,
        (signal) => getOrdersPage(page, filters, signal),
        { enabled, staleTime: 1000 * 30, keepPreviousData: true }
    );
};

/**
 * Hook de Orçamentos paginados — busca 20 itens por página direto do Supabase.
 */
export const usePagedQuotes = (page: number, filters: QuoteFilters = {}, enabled = true) => {
    const filtersKey = JSON.stringify(filters);
    const key = ['quotes_paged', page.toString(), filtersKey];
    return useQuery(
        key,
        (signal) => getQuotesPage(page, filters, signal),
        { enabled, staleTime: 1000 * 30, keepPreviousData: true }
    );
};

/**
 * Hook de Contratos paginados — busca 20 itens por página direto do Supabase.
 */
export const usePagedContracts = (page: number, filters: ContractFilters = {}, enabled = true) => {
    const filtersKey = JSON.stringify(filters);
    const key = ['contracts_paged', page.toString(), filtersKey];
    return useQuery(
        key,
        (signal) => getContractsPage(page, filters, signal),
        { enabled, staleTime: 1000 * 30, keepPreviousData: true }
    );
};

export const usePaginatedOrders = (page: number, limit: number, filters?: any) => {
    const key = ['orders', 'page', page.toString(), JSON.stringify(filters)];
    return useQuery(key, (signal) => OrderService.getOrdersPaginated(page, limit, undefined, filters, signal), {
        staleTime: 1000 * 60 * 5,
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 👥 USERS & GROUPS HOOKS
// ------------------------------------------------------------------

export const useUsers = (enabled = true) => {
    return useQuery('users', async (signal) => {
        const tid = DataService.getCurrentTenantId();
        if (!tid) {
            console.warn('[useUsers] No tenant ID found');
            return [];
        }
        return TenantService.getTenantUsers(tid, signal);
    }, {
        enabled,
        staleTime: 1000 * 60 * 5,
        keepPreviousData: true
    });
};

export const useUserGroups = (enabled = true) => {
    return useQuery('user_groups', async (signal) => {
        const tid = DataService.getCurrentTenantId();
        if (!tid) {
            console.warn('[useUserGroups] No tenant ID found');
            return [];
        }
        return TenantService.getUserGroups(tid, signal);
    }, {
        enabled,
        staleTime: 1000 * 60 * 30,
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 👷 TECHNICIANS HOOKS
// ------------------------------------------------------------------

export const useTechnicians = (enabled = true) => {
    return useQuery('technicians', (signal) => TechnicianService.getAllTechnicians(undefined, signal), {
        enabled,
        staleTime: 1000 * 30, // 30 seconds
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 👥 CUSTOMERS HOOKS
// ------------------------------------------------------------------

export const useCustomers = (enabled = true) => {
    return useQuery('customers', (signal) => CustomerService.getCustomers(signal), {
        enabled,
        staleTime: 1000 * 30, // 30 seconds
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 📦 STOCK HOOKS
// ------------------------------------------------------------------

export const useStock = (enabled = true) => {
    return useQuery('stock', (signal) => StockService.getStockItems(signal), {
        enabled,
        staleTime: 1000 * 60 * 5,
        keepPreviousData: true
    });
};

export const useStockCategories = (enabled = true) => {
    return useQuery('stock_categories', (signal) => StockService.getCategories(signal), {
        enabled,
        staleTime: 1000 * 60 * 60, // 1 hour
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 💰 FINANCIAL HOOKS
// ------------------------------------------------------------------

export const useCashFlow = (enabled: boolean = true) => {
    return useQuery('cash_flow', (signal) => FinancialService.getCashFlow(signal as any), {
        enabled,
        staleTime: 60 * 1000
    });
};

export const useAccountsPayable = (enabled: boolean = true, filters?: { start?: string, end?: string, status?: string }) => {
    return useQuery(['accounts_payable', filters], () => FinancialService.getAccountsPayable(filters), {
        enabled,
        staleTime: 60 * 1000
    });
};

export const usePayableCategories = (enabled: boolean = true) => {
    return useQuery('payable_categories', () => FinancialService.getPayableCategories(), {
        enabled,
        staleTime: 60 * 60 * 1000 // 1 hora
    });
};

// ------------------------------------------------------------------
// 📝 CONTRACTS & QUOTES HOOKS
// ------------------------------------------------------------------

export const useContracts = (enabled = true) => {
    return useQuery('contracts', (signal) => ContractService.getContracts(signal), {
        enabled,
        staleTime: 1000 * 60 * 5,
        keepPreviousData: true
    });
};

export const useQuotes = (enabled = true) => {
    return useQuery('quotes', (signal) => QuoteService.getQuotes(signal), {
        enabled,
        staleTime: 1000 * 30, // 30 segundos
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// ⚙️ EQUIPMENTS HOOKS
// ------------------------------------------------------------------

export const useEquipments = (enabled = true) => {
    return useQuery('equipments', (signal) => EquipmentService.getEquipments(signal), {
        enabled,
        staleTime: 1000 * 60 * 10,
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 📊 FORMS & TEMPLATES HOOKS
// ------------------------------------------------------------------

export const useForms = (enabled = true) => {
    const tid = DataService.getCurrentTenantId();
    return useQuery(['forms', tid || 'default'], (signal) => FormService.getFormTemplates(signal), {
        enabled: enabled && !!tid,
        staleTime: 1000 * 60 * 15
    });
};

export const useServiceTypes = (enabled = true) => {
    const tid = DataService.getCurrentTenantId();
    return useQuery(['service_types', tid || 'default'], (signal) => DataService.getServiceTypes(signal), {
        enabled: enabled && !!tid,
        staleTime: 1000 * 60 * 15
    });
};

export const useActivationRules = (enabled = true) => {
    const tid = DataService.getCurrentTenantId();
    return useQuery(['activation_rules', tid || 'default'], (signal) => DataService.getActivationRules(signal), {
        enabled: enabled && !!tid,
        staleTime: 1000 * 60 * 15
    });
};

export const useTenant = (enabled = true) => {
    const tid = DataService.getCurrentTenantId();
    // Se tid for nulo/indefinido, o useQuery usará "default" na chave e chamará o service.
    // O TenantService.getTenantById(null) já tem lógica para buscar o primeiro disponível como fallback.
    return useQuery(['current_tenant', tid || 'default'], (signal) => {
        return TenantService.getTenantById(tid, signal);
    }, {
        enabled,
        staleTime: 1000 * 60 * 60 // 1 hour (rarely changes)
    });
};

// ------------------------------------------------------------------
// 🔄 INVALIDATION HELPERS
// ------------------------------------------------------------------

export const NexusQueryClient = {
    invalidateCurrentTenant: () => {
        queryClient.invalidateQueries('current_tenant');
    },
    invalidateOrders: () => {
        queryClient.invalidateQueries('orders');
        CacheManager.invalidate('orders');
    },
    invalidateTechnicians: () => {
        queryClient.invalidateQueries('technicians');
        CacheManager.invalidate('technicians');
    },
    invalidateCustomers: () => {
        queryClient.invalidateQueries('customers');
        CacheManager.invalidate('customers');
    },
    invalidateStock: () => {
        queryClient.invalidateQueries('stock');
        CacheManager.invalidate('stock');
    },
    invalidateCategories: () => {
        queryClient.invalidateQueries('stock_categories');
        CacheManager.invalidate('stock_categories');
    },
    invalidateFinancials: () => {
        queryClient.invalidateQueries('cash_flow');
        CacheManager.invalidate('cash_flow');
        queryClient.invalidateQueries('accounts_payable');
        CacheManager.invalidate('accounts_payable');
    },
    invalidateContracts: () => {
        queryClient.invalidateQueries('contracts');
        CacheManager.invalidate('contracts');
    },
    invalidateQuotes: () => {
        queryClient.invalidateQueries('quotes');
        CacheManager.invalidate('quotes');
    },
    invalidateEquipments: () => {
        queryClient.invalidateQueries('equipments');
        CacheManager.invalidate('equipments');
    },
    invalidateForms: () => {
        queryClient.invalidateQueries('forms');
        CacheManager.invalidate('forms');
    },
    invalidateTenant: () => {
        queryClient.invalidateQueries('current_tenant');
    },
    invalidateAll: () => {
        queryClient.clear();
        CacheManager.clear();
        localStorage.removeItem('nexus_orders_v2'); // Specific for OrderService silent cache
    }
};
