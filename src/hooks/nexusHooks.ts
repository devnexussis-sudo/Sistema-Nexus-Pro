
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
import { OrderStatus } from '../types';

// ------------------------------------------------------------------
// 📦 ORDERS HOOKS
// ------------------------------------------------------------------

export const useOrders = (enabled = true) => {
    return useQuery('orders', OrderService.getOrders, {
        enabled,
        staleTime: 1000 * 60 * 2 // 2 minutes stale
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
// 👷 TECHNICIANS HOOKS
// ------------------------------------------------------------------

export const useTechnicians = (enabled = true) => {
    return useQuery('technicians', TechnicianService.getAllTechnicians, {
        enabled,
        staleTime: 1000 * 60 * 10 // 10 min
    });
};

// ------------------------------------------------------------------
// 👥 CUSTOMERS HOOKS
// ------------------------------------------------------------------

export const useCustomers = (enabled = true) => {
    return useQuery('customers', CustomerService.getCustomers, {
        enabled,
        staleTime: 1000 * 60 * 10
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
    return useQuery('service_types', FormService.getServiceTypes, {
        enabled,
        staleTime: 1000 * 60 * 60
    });
};

// ------------------------------------------------------------------
// 🔄 INVALIDATION HELPERS
// ------------------------------------------------------------------

export const NexusQueryClient = {
    invalidateOrders: () => queryClient.invalidateQueries('orders'),
    invalidateTechnicians: () => queryClient.invalidateQueries('technicians'),
    invalidateCustomers: () => queryClient.invalidateQueries('customers'),
    invalidateStock: () => queryClient.invalidateQueries('stock'),
    invalidateFinancials: () => queryClient.invalidateQueries('cash_flow'),
    invalidateContracts: () => queryClient.invalidateQueries('contracts'),
    invalidateQuotes: () => queryClient.invalidateQueries('quotes'),
    invalidateEquipments: () => queryClient.invalidateQueries('equipments'),
    invalidateForms: () => queryClient.invalidateQueries('forms'),
    invalidateAll: () => queryClient.clear()
};
