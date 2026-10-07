
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
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['orders', tid], (signal) => OrderService.getOrders(undefined, signal), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 3, // 3 min (Realtime atualiza in-place)
        keepPreviousData: true
    });
};

export const useOrdersStats = (enabled = true, startDate?: string, endDate?: string) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    const key = ['orders_stats', tid, startDate || 'all', endDate || 'all'];
    return useQuery(key, (signal) => OrderService.getOrdersForStats(startDate, endDate, signal), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 5, // 5 min
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
    const tid = DataService.getCurrentTenantId() || 'default';
    const filtersKey = JSON.stringify(filters);
    const key = ['orders_paged', tid, page.toString(), filtersKey];
    return useQuery(
        key,
        (signal) => getOrdersPage(page, filters, signal),
        { enabled: enabled && !!DataService.getCurrentTenantId(), staleTime: 1000 * 60 * 2, keepPreviousData: true }
    );
};

/**
 * Hook de Orçamentos paginados — busca 20 itens por página direto do Supabase.
 */
export const usePagedQuotes = (page: number, filters: QuoteFilters = {}, enabled = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    const filtersKey = JSON.stringify(filters);
    const key = ['quotes_paged', tid, page.toString(), filtersKey];
    return useQuery(
        key,
        (signal) => getQuotesPage(page, filters, signal),
        { enabled: enabled && !!DataService.getCurrentTenantId(), staleTime: 1000 * 60 * 2, keepPreviousData: true }
    );
};

/**
 * Hook de Contratos paginados — busca 20 itens por página direto do Supabase.
 */
export const usePagedContracts = (page: number, filters: ContractFilters = {}, enabled = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    const filtersKey = JSON.stringify(filters);
    const key = ['contracts_paged', tid, page.toString(), filtersKey];
    return useQuery(
        key,
        (signal) => getContractsPage(page, filters, signal),
        { enabled: enabled && !!DataService.getCurrentTenantId(), staleTime: 1000 * 60 * 2, keepPreviousData: true }
    );
};

export const usePaginatedOrders = (page: number, limit: number, filters?: any) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    const key = ['orders', tid, 'page', page.toString(), JSON.stringify(filters)];
    return useQuery(key, (signal) => OrderService.getOrdersPaginated(page, limit, undefined, filters, signal), {
        staleTime: 1000 * 60 * 2,
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 👥 USERS & GROUPS HOOKS
// ------------------------------------------------------------------

export const useUsers = (enabled = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['users', tid], async (signal) => {
        const tenantId = DataService.getCurrentTenantId();
        if (!tenantId) {
            console.warn('[useUsers] No tenant ID found');
            return [];
        }
        return TenantService.getTenantUsers(tenantId, signal);
    }, {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 15, // 15 min
        keepPreviousData: true
    });
};

import { getCurrentTenantId } from '../lib/tenantContext';

export const useUserGroups = (enabled = true) => {
    const tid = DataService.getCurrentTenantId() || getCurrentTenantId() || 'default';
    return useQuery(['user_groups', tid], async (signal) => {
        const tenantId = DataService.getCurrentTenantId() || getCurrentTenantId();
        if (!tenantId) {
            console.warn('[useUserGroups] No tenant ID found');
            return [];
        }
        return TenantService.getUserGroups(tenantId, signal);
    }, {
        enabled: enabled && !!(DataService.getCurrentTenantId() || getCurrentTenantId()),
        staleTime: 1000 * 60 * 15, // 15 min
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 👷 TECHNICIANS HOOKS
// ------------------------------------------------------------------

export const useTechnicians = (enabled = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['technicians', tid], (signal) => TechnicianService.getAllTechnicians(undefined, signal), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 5, // 5 min cache (Realtime atualiza in-place)
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 👥 CUSTOMERS HOOKS
// ------------------------------------------------------------------

export const useCustomers = (enabled = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['customers', tid], (signal) => CustomerService.getCustomers(signal), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 5, // 5 min cache
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 📦 STOCK HOOKS
// ------------------------------------------------------------------

export const useStock = (enabled = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['stock', tid], (signal) => StockService.getStockItems(signal), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 5,
        keepPreviousData: true
    });
};

export const useStockCategories = (enabled = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['stock_categories', tid], (signal) => StockService.getCategories(signal), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 15, // 15 min
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// 💰 FINANCIAL HOOKS
// ------------------------------------------------------------------

export const useCashFlow = (enabled: boolean = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['cash_flow', tid], (signal) => FinancialService.getCashFlow(signal as any), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 2
    });
};

export const useAccountsPayable = (enabled: boolean = true, filters?: { start?: string, end?: string, status?: string }) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['accounts_payable', tid, filters], () => FinancialService.getAccountsPayable(filters), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 2
    });
};

export const usePayableCategories = (enabled: boolean = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['payable_categories', tid], () => FinancialService.getPayableCategories(), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 15
    });
};

// ------------------------------------------------------------------
// 📝 CONTRACTS & QUOTES HOOKS
// ------------------------------------------------------------------

export const useContracts = (enabled = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['contracts', tid], (signal) => ContractService.getContracts(signal), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
        staleTime: 1000 * 60 * 5,
        keepPreviousData: true
    });
};

export const useQuotes = (enabled = true) => {
    return useQuery('quotes', (signal) => QuoteService.getQuotes(signal), {
        enabled,
        staleTime: 1000 * 60 * 5, // 5 minutos
        keepPreviousData: true
    });
};

// ------------------------------------------------------------------
// ⚙️ EQUIPMENTS HOOKS
// ------------------------------------------------------------------

export const useEquipments = (enabled = true) => {
    const tid = DataService.getCurrentTenantId() || 'default';
    return useQuery(['equipments', tid], (signal) => EquipmentService.getEquipments(signal), {
        enabled: enabled && !!DataService.getCurrentTenantId(),
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
        staleTime: 1000 * 60 * 15, // 15 min
        retry: 2,
        refetchOnWindowFocus: false
    });
};

export const useServiceTypes = (enabled = true) => {
    const tid = DataService.getCurrentTenantId();
    return useQuery(['service_types', tid || 'default'], (signal) => DataService.getServiceTypes(signal), {
        enabled: enabled && !!tid,
        staleTime: 1000 * 60 * 15, // 15 min
        retry: 2,
        refetchOnWindowFocus: false
    });
};

export const useActivationRules = (enabled = true) => {
    const tid = DataService.getCurrentTenantId();
    return useQuery(['activation_rules', tid || 'default'], (signal) => DataService.getActivationRules(signal), {
        enabled: enabled && !!tid,
        staleTime: 1000 * 60 * 15, // 15 min
        retry: 2,
        refetchOnWindowFocus: false
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
    updateOrderInPlace: (payload: any) => {
        const updater = (o: any) => {
            if (o.id !== payload.id) return o;
            
            let newStatus = payload.status ?? o.status;
            if (newStatus === 'COMPLETED') newStatus = 'CONCLUÍDO';
            if (newStatus === 'BLOCKED') newStatus = 'IMPEDIDO';

            return {
                ...o,
                status: newStatus,
                billingStatus: payload.billing_status ?? o.billingStatus,
                updatedAt: payload.updated_at ?? o.updatedAt,
                createdAt: payload.created_at ?? o.createdAt,
                scheduledDate: payload.scheduled_date ?? o.scheduledDate,
                scheduledTime: payload.scheduled_time ?? o.scheduledTime,
                startDate: payload.start_date ?? o.startDate,
                endDate: payload.end_date ?? o.endDate,
                priority: payload.priority ?? o.priority,
                operationType: payload.operation_type ?? o.operationType,
                assignedTo: payload.assigned_to ?? o.assignedTo,
                checkinLocation: payload.checkin_location ?? o.checkinLocation,
                checkoutLocation: payload.checkout_location ?? o.checkoutLocation,
                pauseReason: payload.pause_reason ?? o.pauseReason,
                timeline: payload.timeline ?? o.timeline,
                formData: payload.form_data ?? o.formData,
                signature: payload.signature_url || payload.client_signature_url || o.signature,
                signatureName: payload.client_signature_name ?? o.signatureName
            };
        };

        queryClient.updateQueriesData('orders_paged', (oldData: any) => {
            if (!oldData || !oldData.data || !Array.isArray(oldData.data)) return oldData;
            return { ...oldData, data: oldData.data.map(updater) };
        });

        queryClient.updateQueriesData('orders', (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.map(updater);
        });
    },
    updateTechnicianInPlace: (payload: any) => {
        if (!payload || !payload.id) return;
        queryClient.updateQueriesData('technicians', (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.map((t: any) => {
                if (t.id !== payload.id) return t;
                return {
                    ...t,
                    last_latitude: payload.last_latitude ?? t.last_latitude,
                    last_longitude: payload.last_longitude ?? t.last_longitude,
                    last_seen: payload.last_seen ?? t.last_seen,
                    battery_level: payload.battery_level ?? t.battery_level,
                    device_model: payload.device_model ?? t.device_model,
                    motion_state: payload.motion_state ?? t.motion_state,
                };
            });
        });
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
    updateQuoteInPlace: (payload: any) => {
        if (!payload || !payload.id) return;
        const updater = (q: any) => {
            if (q.id !== payload.id) return q;

            let rejectionReason = payload.rejection_reason || q.rejectionReason;
            if (!rejectionReason && payload.approval_metadata?.rejection_reason) {
                rejectionReason = payload.approval_metadata.rejection_reason;
            }

            return {
                ...q,
                displayId: payload.display_id ?? q.displayId,
                status: payload.status ?? q.status,
                billingStatus: payload.billing_status ?? q.billingStatus,
                customerName: payload.customer_name ?? q.customerName,
                customerAddress: payload.customer_address ?? q.customerAddress,
                customerDocument: payload.customer_document ?? q.customerDocument,
                title: payload.title ?? q.title,
                description: payload.description ?? q.description,
                items: typeof payload.items === 'string' ? JSON.parse(payload.items) : (payload.items ?? q.items),
                totalValue: payload.total_value ?? payload.total_amount ?? q.totalValue,
                notes: payload.notes ?? q.notes,
                rejectionReason,
                validUntil: payload.valid_until ?? q.validUntil,
                linkedOrderId: payload.linked_order_id ?? q.linkedOrderId,
                updatedAt: payload.updated_at ?? q.updatedAt,
                createdAt: payload.created_at ?? q.createdAt,
                publicToken: payload.public_token ?? q.publicToken,
                approvedByName: payload.approved_by_name ?? q.approvedByName,
                approvalDocument: payload.approval_document ?? q.approvalDocument,
                approvalSignature: payload.approval_signature ?? q.approvalSignature,
                approvedAt: payload.approved_at ?? q.approvedAt,
                paymentMethod: payload.payment_method ?? q.paymentMethod,
                installments: payload.installments ?? q.installments,
                paymentNotes: payload.payment_notes ?? q.paymentNotes,
                paidAt: payload.paid_at ?? q.paidAt,
                discount: payload.discount !== undefined ? Number(payload.discount) : q.discount,
                discountType: payload.discount_type ?? q.discountType,
                gatewayProvider: payload.gateway_provider ?? q.gatewayProvider,
                gatewayPaymentId: payload.gateway_payment_id ?? q.gatewayPaymentId,
                gatewayPixCode: payload.gateway_pix_code ?? q.gatewayPixCode,
                gatewayQrCodeUrl: payload.gateway_qr_code_url ?? q.gatewayQrCodeUrl,
                gatewayTicketUrl: payload.gateway_ticket_url ?? q.gatewayTicketUrl,
                gatewayStatus: payload.gateway_status ?? q.gatewayStatus,
            };
        };

        queryClient.updateQueriesData('quotes_paged', (oldData: any) => {
            if (!oldData || !oldData.data || !Array.isArray(oldData.data)) return oldData;
            return { ...oldData, data: oldData.data.map(updater) };
        });

        queryClient.updateQueriesData('quotes', (oldData: any) => {
            if (!oldData || !Array.isArray(oldData)) return oldData;
            return oldData.map(updater);
        });
    },
    invalidateQuotes: () => {
        queryClient.invalidateQueries('quotes');
        queryClient.invalidateQueries('quotes_paged');
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
