
import { supabase } from '../lib/supabase';
import { CacheManager } from '../lib/cache';
import { StockItem, Category, TechStockItem } from '../types';
import type { DbStockItem } from '../types/database';
import { AuthService } from './authService';
import { getCurrentTenantId } from '../lib/tenantContext';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const STORAGE_KEYS = { STOCK: 'nexus_stock_v2', CATEGORIES: 'nexus_categories_v2' };



export const StockService = {

    _mapStockItemFromDB: (data: DbStockItem): StockItem => {
        return {
            id: data.id,
            tenantId: data.tenant_id,
            code: data.code,
            externalCode: data.external_code ?? '',
            description: data.description,
            category: data.category,
            location: data.location,
            quantity: data.quantity ?? 0,
            minQuantity: data.min_quantity ?? 0,
            costPrice: data.cost_price ?? 0,
            sellPrice: data.sell_price ?? 0,
            freightCost: data.freight_cost ?? 0,
            taxCost: data.tax_cost ?? 0,
            unit: (data.unit as StockItem['unit']) ?? 'UN',
            lastRestockDate: data.last_restock_date,
            active: data.active
        };
    },

    // --- Categorias de Estoque ---
    getCategories: async (): Promise<Category[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled) {
            const { data, error } = await supabase.from('stock_categories')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('name');

            if (error) {
                console.error("❌ [StockService] Erro ao buscar categorias:", error.message);
                throw new Error(`Falha ao carregar categorias: ${error.message}`);
            }
            return data || [];
        }
        return [];
    },

    createCategory: async (category: Omit<Category, 'id'>): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const id = typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : `cat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

            const payload = {
                id,
                name: category.name,
                type: category.type || 'stock',
                active: category.active !== false,
                tenant_id: tenantId
            };

            const { error } = await supabase.from('stock_categories').insert([payload]);

            if (error) {
                console.error("❌ Erro Supabase (StockCategory):", error.message, error.details, error.hint);
                throw error;
            }
        }
    },

    updateCategory: async (category: Category): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const { error } = await supabase.from('stock_categories')
                .update({
                    name: category.name,
                    active: category.active,
                    updated_at: new Date().toISOString()
                })
                .eq('id', category.id)
                .eq('tenant_id', tenantId);
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
                .order('description')
                .limit(100);

            if (error) {
                console.error("❌ [StockService] Erro ao buscar itens:", error.message);
                throw new Error(`Falha ao carregar estoque: ${error.message}`);
            }

            if (data) {
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
            // Polyfill para garantir UUIDv4 (Evita erro 400 de tipagem quando testado fora de https / localhost)
            const generateUUID = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
                const r = Math.random() * 16 | 0;
                return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
            });
            const id = typeof crypto !== 'undefined' && crypto.randomUUID
                ? crypto.randomUUID()
                : generateUUID();

            const dbItem = {
                id,
                tenant_id: tenantId,
                code: item.code,
                external_code: item.externalCode,
                name: item.description, // Fallback para compatibilidade estrutural com tabela antiga
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
            if (error) {
                console.error("❌ Erro ao criar item de estoque:", error);
                // Extrai o máximo de detalhes possível para ajudar no diagnóstico visual
                throw new Error(`Falha no banco (código: ${error.code || 'N/A'}): ${error.message || 'Erro desconhecido'}\nDetalhes: ${error.details || ''}`);
            }
        }
    },

    updateStockItem: async (item: StockItem): Promise<void> => {
        if (isCloudEnabled) {
            const dbItem = {
                code: item.code,
                external_code: item.externalCode,
                name: item.description, // Fallback p/ tabela antiga
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
            const user = await AuthService.getCurrentUser();
            if (!user) throw new Error('Usuário não autenticado');

            // Padrão Big Tech: Uso de RPC para operação atômica (Transaction)
            const { error } = await supabase.rpc('transfer_stock_to_tech', {
                p_tech_id: techId,
                p_item_id: itemId,
                p_quantity: quantity,
                p_created_by: user.id
            });

            if (error) {
                console.error("❌ Erro na transferência (RPC):", error.message);
                throw new Error(error.message);
            }
        }
    },

    returnFromTech: async (techId: string, itemId: string, quantity: number): Promise<void> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const user = await AuthService.getCurrentUser();
            if (!user) throw new Error('Usuário não autenticado');

            // Devolução atômica (Técnico p/ Geral) via RPC
            const { error } = await supabase.rpc('return_stock_from_tech', {
                p_tech_id: techId,
                p_item_id: itemId,
                p_quantity: quantity,
                p_created_by: user.id
            });

            if (error) {
                console.error("❌ Erro na devolução (RPC):", error.message);
                throw new Error(error.message);
            }
        }
    },

    getTechStock: async (techId: string): Promise<{ id: string; stockItemId: string; quantity: number; item: { description: string; code: string; sellPrice: number } | null }[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const { data, error } = await supabase
                .from('tech_stock')
                .select('*, stock_items(*)')
                .eq('user_id', techId)
                .eq('tenant_id', tenantId);

            if (error) throw error;

            return (data || []).map((ts: any) => ({
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
            const user = await AuthService.getCurrentUser();
            if (!user) throw new Error('Usuário não autenticado');

            // Padrão Big Tech: Uso de RPC para garantir que o saldo do técnico
            // seja reduzido e a movimentação registrada em uma única transação.
            const { error } = await supabase.rpc('consume_tech_stock', {
                p_tech_id: techId,
                p_item_id: stockItemId,
                p_quantity: quantity,
                p_order_id: orderId,
                p_created_by: user.id
            });

            if (error) {
                console.error("❌ Erro no consumo (RPC):", error.message);
                throw new Error(error.message || 'Erro ao consumir estoque do técnico');
            }
        }
    },

    getMovements: async (limit = 50): Promise<any[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            const { data, error } = await supabase
                .from('stock_movements')
                .select('*, stock_items(description, code)')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data || [];
        }
        return [];
    }
};
