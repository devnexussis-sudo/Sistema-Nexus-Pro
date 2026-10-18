import { supabase } from '../lib/supabase';
import { CacheManager } from '../lib/cache';
import { getCurrentTenantId } from '../lib/tenantContext';
import { StockService } from './stockService';
import { SalesOrder } from '../types';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

export const SalesOrderService = {

    _mapFromDB: (data: any): SalesOrder => {
        if (!data) return null as any;

        const rawStatus = String(data.status || 'PENDENTE').trim().toUpperCase();

        return {
            id: data.id,
            displayId: data.display_id || null,
            publicToken: data.public_token,
            tenantId: data.tenant_id,
            customerId: data.customer_id,
            createdBy: data.created_by,
            createdByName: data.created_by_name,
            customerName: data.customer_name,
            customerAddress: data.customer_address,
            customerDocument: data.customer_document,
            title: data.title,
            description: data.description,
            items: typeof data.items === 'string' ? JSON.parse(data.items) : (data.items || []),
            subtotal: Number(data.subtotal) || Number(data.total_value) || 0,
            shipping: Number(data.shipping) || 0,
            discount: Number(data.discount) || 0,
            discountType: data.discount_type || 'fixed',
            totalValue: Number(data.total_value) || 0,
            status: rawStatus as any,
            notes: data.notes,
            customerPhone: data.customer_phone || null,
            customerEmail: data.customer_email || null,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            completedAt: data.completed_at || ((rawStatus === 'CONCLUIDO' || rawStatus === 'FATURADO') ? (data.updated_at || data.paid_at) : null),
            billingStatus: data.billing_status || 'PENDING',
            paymentMethod: data.payment_method,
            installments: data.installments || 1,
            paymentNotes: data.payment_notes,
            paidAt: data.paid_at,
            billingNotes: data.billing_notes,
            gatewayStatus: data.gateway_status,
            gatewayProvider: data.gateway_provider,
            gatewayPaymentId: data.gateway_payment_id,
            gatewayPixCode: data.gateway_pix_code,
            gatewayTicketUrl: data.gateway_ticket_url,
        };
    },

    getSalesOrders: async (signal?: AbortSignal): Promise<SalesOrder[]> => {
        if (!isCloudEnabled) return [];

        const tenantId = getCurrentTenantId();
        if (!tenantId) return [];

        const cacheKey = `sales_orders_${tenantId}`;
        const cached = CacheManager.get<SalesOrder[]>(cacheKey);
        if (cached && Array.isArray(cached)) return cached;

        return CacheManager.deduplicate(cacheKey, async (currentSignal) => {
            let query = supabase
                .from('sales_orders')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(100);

            if (currentSignal || signal) {
                query = query.abortSignal((currentSignal || signal) as AbortSignal);
            }

            const { data, error } = await query;
            if (error) throw error;

            const mapped = (data || []).map(d => SalesOrderService._mapFromDB(d));
            if (mapped && mapped.length > 0) {
                CacheManager.set(cacheKey, mapped, CacheManager.TTL.MEDIUM);
            }
            return mapped;
        }, signal);
    },

    /**
     * 🏗️ Criação de Pedido de Venda com Identificador Sequencial Soberano (PVD-001000) e Baixa de Estoque
     */
    createSalesOrder: async (order: Partial<SalesOrder>): Promise<SalesOrder> => {
        const tid = getCurrentTenantId();
        if (!isCloudEnabled || !tid) throw new Error("Tenant não identificado.");

        // Gerador de Identificador Sequencial Soberano: PVD-001000 em diante
        let sovereignId = 'PVD-001000';
        try {
            const { data: latestOrder } = await supabase
                .from('sales_orders')
                .select('display_id')
                .eq('tenant_id', tid)
                .like('display_id', 'PVD-%')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (latestOrder?.display_id) {
                const numMatch = latestOrder.display_id.match(/\d+/);
                if (numMatch) {
                    const currentNum = parseInt(numMatch[0], 10);
                    if (!isNaN(currentNum) && currentNum >= 1000) {
                        sovereignId = `PVD-${String(currentNum + 1).padStart(6, '0')}`;
                    }
                }
            } else {
                const { count } = await supabase
                    .from('sales_orders')
                    .select('*', { count: 'exact', head: true })
                    .eq('tenant_id', tid);
                const nextSeq = 1000 + (count || 0);
                sovereignId = `PVD-${String(nextSeq).padStart(6, '0')}`;
            }
        } catch (e) {
            console.warn('[SalesOrderService] Fallback ao gerar PVD sequencial:', e);
        }

        // 🟡 Todo Pedido de Venda inicia obrigatoriamente como PENDENTE (não vai ao financeiro nem baixa estoque ainda)
        const status = 'PENDENTE';
        const now = new Date();

        const dbPayload: any = {
            display_id: order.displayId || sovereignId,
            public_token: crypto.randomUUID(),
            tenant_id: tid,
            customer_id: order.customerId || null,
            created_by: order.createdBy || null,
            created_by_name: order.createdByName || null,
            customer_name: order.customerName,
            customer_address: order.customerAddress || null,
            customer_document: order.customerDocument || null,
            customer_phone: order.customerPhone || null,
            customer_email: order.customerEmail || null,
            title: order.title || 'Venda de Balcão / Pedido de Peças',
            description: order.description || null,
            items: order.items || [],
            subtotal: order.subtotal || order.totalValue || 0,
            shipping: Number(order.shipping) || 0,
            discount: order.discount || 0,
            discount_type: order.discountType || 'fixed',
            total_value: order.totalValue || 0,
            status,
            notes: order.notes || null,
            payment_method: order.paymentMethod || null,
            installments: order.installments || 1,
            payment_notes: order.paymentNotes || null,
            billing_status: order.billingStatus || 'PENDING',
            paid_at: order.paidAt || null,
            billing_notes: order.billingNotes || null,
            created_at: now.toISOString(),
            updated_at: now.toISOString()
        };

        const { data, error } = await supabase
            .from('sales_orders')
            .insert([dbPayload])
            .select()
            .single();

        if (error) throw error;

        CacheManager.invalidate(`sales_orders_${tid}`);
        CacheManager.invalidate(`sales_orders_paged_${tid}`);
        return SalesOrderService._mapFromDB(data);
    },

    /**
     * 🚀 Finalização do Pedido de Venda:
     * Transiciona o status para 'CONCLUIDO', dá baixa no estoque para itens vinculados
     * e habilita o pedido imediatamente para o Faturamento / Financeiro (Contas a Receber).
     */
    finalizeSalesOrder: async (order: SalesOrder): Promise<SalesOrder> => {
        const tid = getCurrentTenantId();
        if (!isCloudEnabled || !tid) throw new Error("Tenant não identificado.");

        // Verifica status atual no banco
        const { data: currentOrder, error: checkErr } = await supabase
            .from('sales_orders')
            .select('status, display_id')
            .eq('id', order.id)
            .eq('tenant_id', tid)
            .single();

        if (checkErr) throw checkErr;
        if (currentOrder?.status === 'CONCLUIDO' || currentOrder?.status === 'FATURADO') {
            throw new Error("Este pedido já foi finalizado anteriormente.");
        }

        const now = new Date().toISOString();
        const { data, error } = await supabase
            .from('sales_orders')
            .update({
                status: 'CONCLUIDO',
                updated_at: now
            })
            .eq('id', order.id)
            .eq('tenant_id', tid)
            .select()
            .single();

        if (error) throw error;

        // 📦 Baixa de Estoque Imediata para todas as peças vinculadas
        if (order.items && order.items.length > 0) {
            await StockService.deductStockForItems(order.items, order.id, order.displayId || currentOrder?.display_id, 'SALE');
        }

        CacheManager.invalidate(`sales_orders_${tid}`);
        CacheManager.invalidate(`sales_orders_paged_${tid}`);
        return SalesOrderService._mapFromDB(data);
    },

    updateSalesOrder: async (order: SalesOrder): Promise<SalesOrder> => {
        const tid = getCurrentTenantId();
        if (!isCloudEnabled || !tid) throw new Error("Tenant não identificado.");

        // Bloqueio de alteração estrutural de itens caso o pedido já esteja CONCLUIDO ou FATURADO
        const { data: prevOrder } = await supabase
            .from('sales_orders')
            .select('status, items, total_value')
            .eq('id', order.id)
            .eq('tenant_id', tid)
            .maybeSingle();

        if (prevOrder && (prevOrder.status === 'CONCLUIDO' || prevOrder.status === 'FATURADO')) {
            const prevTotal = Number(prevOrder.total_value) || 0;
            const newTotal = Number(order.totalValue) || 0;
            const itemsChanged = JSON.stringify(prevOrder.items || []) !== JSON.stringify(order.items || []);
            const totalChanged = Math.abs(prevTotal - newTotal) > 0.01;
            if (itemsChanged || totalChanged) {
                throw new Error("Este pedido já foi finalizado e concluído. Não é permitido alterar itens ou valores de pedidos concluídos.");
            }
        }

        const dbPayload: any = {
            customer_name: order.customerName,
            customer_document: order.customerDocument || null,
            customer_phone: order.customerPhone || null,
            customer_email: order.customerEmail || null,
            customer_address: order.customerAddress || null,
            title: order.title,
            description: order.description,
            items: order.items,
            subtotal: order.subtotal,
            shipping: Number(order.shipping) || 0,
            discount: order.discount,
            discount_type: order.discountType,
            total_value: order.totalValue,
            status: order.status || 'PENDENTE',
            notes: order.notes,
            payment_method: order.paymentMethod,
            installments: order.installments,
            payment_notes: order.paymentNotes,
            billing_status: order.billingStatus,
            paid_at: order.paidAt,
            billing_notes: order.billingNotes,
            updated_at: new Date().toISOString()
        };

        const { data, error } = await supabase
            .from('sales_orders')
            .update(dbPayload)
            .eq('id', order.id)
            .eq('tenant_id', tid)
            .select()
            .maybeSingle();

        if (error) throw error;

        // Se transitou de PENDENTE para CONCLUIDO via update, dá baixa no estoque
        if (prevOrder?.status !== 'CONCLUIDO' && order.status === 'CONCLUIDO' && order.items && order.items.length > 0) {
            await StockService.deductStockForItems(order.items, order.id, order.displayId, 'SALE');
        }

        CacheManager.invalidate(`sales_orders_${tid}`);
        CacheManager.invalidate(`sales_orders_paged_${tid}`);
        return data ? SalesOrderService._mapFromDB(data) : order;
    },

    /**
     * 💳 Atualização Financeira / Faturamento do Pedido de Venda
     */
    updateSalesOrderBilling: async (orderId: string, billingData: {
        status?: string;
        billingStatus?: string;
        paymentMethod?: string;
        billingNotes?: string;
        paidAt?: string | null;
        receiptUrl?: string;
        discount?: number;
        discountType?: string;
    }): Promise<SalesOrder> => {
        const tid = getCurrentTenantId();
        if (!isCloudEnabled || !tid) throw new Error("Tenant não identificado.");

        const updatePayload: any = {
            updated_at: new Date().toISOString()
        };
        if (billingData.status !== undefined) updatePayload.status = billingData.status;
        if (billingData.billingStatus !== undefined) updatePayload.billing_status = billingData.billingStatus;
        if (billingData.paymentMethod !== undefined) updatePayload.payment_method = billingData.paymentMethod;
        if (billingData.billingNotes !== undefined) updatePayload.billing_notes = billingData.billingNotes;
        if (billingData.paidAt !== undefined) updatePayload.paid_at = billingData.paidAt;
        if (billingData.receiptUrl !== undefined) updatePayload.receipt_url = billingData.receiptUrl;
        if (billingData.discount !== undefined) updatePayload.discount = billingData.discount;
        if (billingData.discountType !== undefined) updatePayload.discount_type = billingData.discountType;

        const { data, error } = await supabase
            .from('sales_orders')
            .update(updatePayload)
            .eq('id', orderId)
            .eq('tenant_id', tid)
            .select()
            .maybeSingle();

        if (error) throw error;
        CacheManager.invalidate(`sales_orders_${tid}`);
        CacheManager.invalidate(`sales_orders_paged_${tid}`);
        return data ? SalesOrderService._mapFromDB(data) : (null as any);
    },

    deleteSalesOrder: async (id: string): Promise<boolean> => {
        const tid = getCurrentTenantId();
        if (!isCloudEnabled || !tid) return false;

        const { error } = await supabase
            .from('sales_orders')
            .delete()
            .eq('id', id)
            .eq('tenant_id', tid);

        if (error) throw error;

        CacheManager.invalidate(`sales_orders_${tid}`);
        CacheManager.invalidate(`sales_orders_paged_${tid}`);
        return true;
    }
};
