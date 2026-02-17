
import { supabase, adminSupabase } from '../lib/supabase';
import { CacheManager } from '../lib/cache';
import { StockItem } from '../types';
import { AuthService } from './authService';
import { SessionStorage, GlobalStorage } from '../lib/sessionStorage';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const STORAGE_KEYS = { STOCK: 'nexus_stock_v2', CATEGORIES: 'nexus_categories_v2' };

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

export const StockService = {

    _mapStockItemFromDB: (data: any): StockItem => {
        return {
            id: data.id,
            tenantId: data.tenant_id,
            code: data.code,
            externalCode: data.external_code || data.externalCode || '',
            description: data.description,
            category: data.category,
            location: data.location,
            quantity: data.quantity || 0,
            minQuantity: data.min_quantity || data.minQuantity || 0,
            costPrice: data.cost_price || data.costPrice || 0,
            sellPrice: data.sell_price || data.sellPrice || 0,
            freightCost: data.freight_cost || data.freightCost || 0,
            taxCost: data.tax_cost || data.taxCost || 0,
            unit: data.unit_measure || data.unit || 'UN',
            lastRestockDate: data.last_restock_date || data.lastRestockDate,
            active: data.active
        };
    },

    // --- Categorias de Estoque ---
    getCategories: async (): Promise<any[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled) {
            const { data, error } = await supabase.from('stock_categories')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('name');

            if (error) {
                console.warn("Supabase categories error:", error.message);
                return [];
            } else {
                return data || [];
            }
        }
        return [];
    },

    createCategory: async (category: any): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const { error } = await supabase.from('stock_categories').insert([{
                name: category.name,
                type: category.type || 'stock',
                active: category.active !== false,
                tenant_id: tenantId
            }]);
            if (error) throw error;
        }
    },

    deleteCategory: async (id: string): Promise<void> => {
        if (isCloudEnabled) {
            const tid = getCurrentTenantId();
            const { error } = await supabase.from('stock_categories')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tid);
            if (error) throw error;
        }
    },

    // --- Estoque (items) ---
    getStockItems: async (): Promise<StockItem[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled) {
            const { data, error } = await supabase.from('stock_items')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('description');

            if (!error && data) {
                return data.map(item => ({
                    id: item.id,
                    tenantId: item.tenant_id,
                    code: item.code,
                    externalCode: item.external_code,
                    description: item.description,
                    category: item.category,
                    location: item.location,
                    quantity: Number(item.quantity),
                    minQuantity: Number(item.min_quantity),
                    costPrice: Number(item.cost_price),
                    sellPrice: Number(item.sell_price),
                    freightCost: Number(item.freight_cost),
                    taxCost: Number(item.tax_cost),
                    unit: item.unit,
                    lastRestockDate: item.last_restock_date,
                    active: item.active
                })) as StockItem[];
            }
        }
        return [];
    },

    createStockItem: async (item: StockItem): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const dbItem = {
                tenant_id: tenantId,
                code: item.code,
                external_code: item.externalCode,
                description: item.description,
                category: item.category,
                location: item.location,
                quantity: item.quantity,
                min_quantity: item.minQuantity,
                cost_price: item.costPrice,
                sell_price: item.sellPrice,
                freight_cost: item.freightCost,
                tax_cost: item.taxCost,
                unit: item.unit,
                active: item.active
            };
            const { error } = await supabase.from('stock_items').insert([dbItem]);
            if (error) throw error;
        }
    },

    updateStockItem: async (item: StockItem): Promise<void> => {
        if (isCloudEnabled) {
            const dbItem = {
                code: item.code,
                external_code: item.externalCode,
                description: item.description,
                category: item.category,
                location: item.location,
                quantity: item.quantity,
                min_quantity: item.minQuantity,
                cost_price: item.costPrice,
                sell_price: item.sellPrice,
                freight_cost: item.freightCost,
                tax_cost: item.taxCost,
                unit: item.unit,
                active: item.active,
                updated_at: new Date().toISOString()
            };

            const tid = getCurrentTenantId();
            const { error } = await supabase.from('stock_items')
                .update(dbItem)
                .eq('id', item.id)
                .eq('tenant_id', tid);

            if (error) throw error;
        }
    },

    deleteStockItem: async (id: string): Promise<void> => {
        if (isCloudEnabled) {
            const tid = getCurrentTenantId();
            const { error } = await supabase.from('stock_items')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tid);
            if (error) throw error;
        }
    },

    // --- Estoque Técnico e Movimentações ---

    transferToTech: async (techId: string, itemId: string, quantity: number): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const client = adminSupabase;

            // 1. Reduz estoque geral
            const { data: item } = await client.from('stock_items').select('quantity').eq('id', itemId).single();
            if (!item || item.quantity < quantity) throw new Error('Saldo insuficiente no estoque geral');

            await client.from('stock_items').update({ quantity: item.quantity - quantity }).eq('id', itemId);

            // 2. Aumenta estoque do técnico (upsert)
            const { data: currentTechStock } = await client.from('tech_stock')
                .select('quantity')
                .eq('user_id', techId)
                .eq('stock_item_id', itemId)
                .maybeSingle();

            if (currentTechStock) {
                await client.from('tech_stock')
                    .update({ quantity: currentTechStock.quantity + quantity, updated_at: new Date().toISOString() })
                    .eq('user_id', techId)
                    .eq('stock_item_id', itemId);
            } else {
                await client.from('tech_stock').insert([{
                    tenant_id: tenantId,
                    user_id: techId,
                    stock_item_id: itemId,
                    quantity: quantity
                }]);
            }

            // 3. Registra movimentação (Audit)
            await client.from('stock_movements').insert([{
                tenant_id: tenantId,
                item_id: itemId,
                user_id: techId,
                type: 'TRANSFER',
                quantity: quantity,
                source: 'GENERAL',
                destination: 'TECH',
                created_by: (await AuthService.getCurrentUser())?.id
            }]);
        }
    },

    getTechStock: async (techId: string): Promise<any[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const { data, error } = await adminSupabase
                .from('tech_stock')
                .select('*, stock_items(*)')
                .eq('user_id', techId)
                .eq('tenant_id', tenantId);

            if (error) throw error;

            return data.map((ts: any) => ({
                id: ts.id,
                stockItemId: ts.stock_item_id,
                quantity: Number(ts.quantity),
                item: ts.stock_items ? {
                    description: ts.stock_items.description,
                    code: ts.stock_items.code,
                    sellPrice: Number(ts.stock_items.sell_price)
                } : null
            }));
        }
        return [];
    },

    consumeTechStock: async (techId: string, stockItemId: string, quantity: number, orderId: string): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            // 1. Verificar se o técnico tem o item e em quantidade suficiente
            const { data: techItems, error: fetchError } = await adminSupabase
                .from('tech_stock')
                .select('*')
                .eq('user_id', techId)
                .eq('stock_item_id', stockItemId)
                .eq('tenant_id', tenantId);

            if (fetchError) throw fetchError;
            if (!techItems || techItems.length === 0 || Number(techItems[0].quantity) < quantity) {
                throw new Error(`Estoque insuficiente com o técnico para o item selecionado.`);
            }

            const currentTechQty = Number(techItems[0].quantity);

            // 2. Deduzir do estoque do técnico
            const { error: updateError } = await adminSupabase
                .from('tech_stock')
                .update({
                    quantity: currentTechQty - quantity,
                    updated_at: new Date().toISOString()
                })
                .eq('id', techItems[0].id);

            if (updateError) throw updateError;

            // 3. Registrar a movimentação consumida
            const { error: moveError } = await adminSupabase
                .from('stock_movements')
                .insert([{
                    tenant_id: tenantId,
                    stock_item_id: stockItemId,
                    user_id: techId,
                    type: 'CONSUMPTION',
                    quantity: quantity,
                    source: 'Técnico (' + techId.slice(0, 5) + ')',
                    destination: 'O.S. #' + orderId.slice(0, 8),
                    reference_id: orderId,
                    created_at: new Date().toISOString()
                }]);

            if (moveError) throw moveError;
        }
    }
};
