
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

// ------------------------------------------------------------------
// 📦 ORDERS HOOKS
// ------------------------------------------------------------------

export const useOrders = (enabled = true) => {
    return useQuery('orders', OrderService.getOrders, {
        enabled,
        staleTime: 1000 * 30 // 30 seconds
    });
};

export const useOrdersStats = (enabled = true, startDate?: string, endDate?: string) => {
    // Cache key includes dates to ensure freshness when range changes
    const key = ['orders_stats', startDate || 'all', endDate || 'all'];
    return useQuery(key, () => OrderService.getOrdersForStats(startDate, endDate), {
        enabled,
        staleTime: 1000 * 60 * 5 // 5 minutes
    });
};

export const useOrder = (id: string, enabled = true) => {
    return useQuery(['order', id], () => OrderService.getPublicOrderById(id), {
        enabled: enabled && !!id,
        staleTime: 1000 * 60 * 5
    });
};

export const usePaginatedOrders = (page: number, limit: number, filters?: any) => {
    const key = ['orders', 'page', page.toString(), JSON.stringify(filters)];
    return useQuery(key, () => OrderService.getOrdersPaginated(page, limit, undefined, filters), {
        staleTime: 1000 * 60 * 5,
        // keepPreviousData: true // TODO: Implement in useQuery
    });
};

// ------------------------------------------------------------------
// 👥 USERS & GROUPS HOOKS
// ------------------------------------------------------------------

export const useUsers = (enabled = true) => {
    return useQuery('users', async () => {
        const tid = DataService.getCurrentTenantId();
        if (!tid) {
            console.warn('[useUsers] No tenant ID found');
            return [];
        }
        return TenantService.getTenantUsers(tid);
    }, {
        enabled,
        staleTime: 1000 * 60 * 5
    });
};

export const useUserGroups = (enabled = true) => {
    return useQuery('user_groups', async () => {
        const tid = DataService.getCurrentTenantId();
        if (!tid) {
            console.warn('[useUserGroups] No tenant ID found');
            return [];
        }
        return TenantService.getUserGroups(tid);
    }, {
        enabled,
        staleTime: 1000 * 60 * 30
    });
};

// ------------------------------------------------------------------
// 👷 TECHNICIANS HOOKS
// ------------------------------------------------------------------

export const useTechnicians = (enabled = true) => {
    return useQuery('technicians', TechnicianService.getAllTechnicians, {
        enabled,
        staleTime: 1000 * 30 // 30 seconds
    });
};

// ------------------------------------------------------------------
// 👥 CUSTOMERS HOOKS
// ------------------------------------------------------------------

export const useCustomers = (enabled = true) => {
    return useQuery('customers', CustomerService.getCustomers, {
        enabled,
        staleTime: 1000 * 30 // 30 seconds
    });
};

// ------------------------------------------------------------------
// 📦 STOCK HOOKS
// ------------------------------------------------------------------

export const useStock = (enabled = true) => {
    return useQuery('stock', StockService.getStockItems, {
        enabled,
        staleTime: 1000 * 60 * 5
    });
};

export const useStockCategories = (enabled = true) => {
    return useQuery('stock_categories', StockService.getCategories, {
        enabled,
        staleTime: 1000 * 60 * 60 // 1 hour
    });
};

// ------------------------------------------------------------------
// 💰 FINANCIAL HOOKS
// ------------------------------------------------------------------

export const useCombinedFinancials = (enabled = true) => {
    // This is a complex hook that might aggregate data. 
    // For now, let's just fetch cash flow.
    return useQuery('cash_flow', () => FinancialService.getCashFlow(), {
        enabled,
        staleTime: 1000 * 60 * 5
    });
};

// ------------------------------------------------------------------
// 📝 CONTRACTS & QUOTES HOOKS
// ------------------------------------------------------------------

export const useContracts = (enabled = true) => {
    return useQuery('contracts', ContractService.getContracts, {
        enabled,
        staleTime: 1000 * 60 * 5
    });
};

export const useQuotes = (enabled = true) => {
    return useQuery('quotes', QuoteService.getQuotes, {
        enabled,
        staleTime: 1000 * 60 * 5
    });
};

// ------------------------------------------------------------------
// ⚙️ EQUIPMENTS HOOKS
// ------------------------------------------------------------------

export const useEquipments = (enabled = true) => {
    return useQuery('equipments', EquipmentService.getEquipments, {
        enabled,
        staleTime: 1000 * 60 * 10
    });
};

// ------------------------------------------------------------------
// 📊 FORMS & TEMPLATES HOOKS
// ------------------------------------------------------------------

export const useForms = (enabled = true) => {
    return useQuery('forms', FormService.getFormTemplates, {
        enabled,
        staleTime: 1000 * 60 * 30 // 30 min (rarely changes)
    });
};

export const useServiceTypes = (enabled = true) => {
    return useQuery('service_types', DataService.getServiceTypes, {
        enabled,
        staleTime: 1000 * 60 * 30
    });
};

export const useActivationRules = (enabled = true) => {
    return useQuery('activation_rules', DataService.getActivationRules, {
        enabled,
        staleTime: 1000 * 60 * 30
    });
};

// ------------------------------------------------------------------
// 🔄 INVALIDATION HELPERS
// ------------------------------------------------------------------

export const NexusQueryClient = {
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
    invalidateAll: () => {
        queryClient.clear();
        CacheManager.clear();
        localStorage.removeItem('nexus_orders_v2'); // Specific for OrderService silent cache
    }
};
