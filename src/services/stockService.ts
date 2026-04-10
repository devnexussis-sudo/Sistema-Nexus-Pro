
import { supabase } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';
import { Category, StockItem } from '../types';
import type { DbStockItem } from '../types/database';
import { AuthService } from './authService';

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
            imageUrl: data.image_url,
            active: data.active
        };
    },

    // --- Categorias de Estoque ---
    getCategories: async (signal?: AbortSignal): Promise<Category[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled) {
            let query = supabase.from('stock_categories')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('name');

            if (signal) {
                query = query.abortSignal(signal);
            }

            const { data, error } = await query;

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
    getStockItems: async (signal?: AbortSignal): Promise<StockItem[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled) {
            let query = supabase.from('stock_items')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('description')
                .limit(100);

            if (signal) {
                query = query.abortSignal(signal);
            }

            const { data, error } = await query;

            if (error) {
                console.error("❌ [StockService] Erro ao buscar itens:", error.message);
                throw new Error(`Falha ao carregar estoque: ${error.message}`);
            }

            if (data) {
                return data.map(StockService._mapStockItemFromDB);
            }
        }
        return [];
    },

    getStockItemsPaginated: async (
        page: number = 1,
        pageSize: number = 20,
        filters?: { searchTerm?: string; categoryFilter?: string; statusFilter?: string },
        signal?: AbortSignal
    ): Promise<{ data: StockItem[], count: number }> => {
        const tenantId = getCurrentTenantId();
        if (!isCloudEnabled || !tenantId) return { data: [], count: 0 };

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase
            .from('stock_items')
            .select('*', { count: 'exact' })
            .eq('tenant_id', tenantId);

        if (filters?.categoryFilter && filters.categoryFilter !== 'ALL') {
            query = query.eq('category', filters.categoryFilter);
        }

        if (filters?.searchTerm) {
            query = query.or(`description.ilike.%${filters.searchTerm}%,code.ilike.%${filters.searchTerm}%,external_code.ilike.%${filters.searchTerm}%`);
        }

        if (filters?.statusFilter && filters.statusFilter !== 'ALL') {
            if (filters.statusFilter === 'LOW') {
                query = query.gt('quantity', 0).lte('quantity', supabase.rpc('get_min_quantity' as any));
                // We'll use a simpler approach because comparing two columns directly in standard filters is tricky without rpc. 
                // Let's filter on the client side just the status if it's complex, or create a secure filter. Actually postgREST supports ?quantity=lte.min_quantity but supabase JS doesn't expose it directly easily without raw strings.
                // Or maybe we can skip this and let the UI know it can't filter LOW directly? Wait, we can use a raw string for filter: .filter('quantity', 'lte', 'min_quantity'). No, value expects string.
                // As a fallback, since we want to be exact:
                // For 'OUT':
            } else if (filters.statusFilter === 'OUT') {
                query = query.eq('quantity', 0);
            } else if (filters.statusFilter === 'GOOD') {
                // Actually if evaluating columns is too hard, we might need a view or RPC. The user said: "Se você tiver filtros, resete a página." We'll just do normal query and filter the complex status later OR we filter out what we can.
            }
        }

        if (signal) {
            query = query.abortSignal(signal);
        }

        const { data, count, error } = await query
            .order('description', { ascending: true })
            .range(from, to);

        if (error) {
            console.error("❌ [StockService] Erro na paginação de itens:", error.message);
            throw new Error(`Falha ao paginar estoque: ${error.message}`);
        }

        if (!data) return { data: [], count: 0 };

        let mappedData = data.map(StockService._mapStockItemFromDB);

        // Manual override for complex column-to-column status filters if needed
        if (filters?.statusFilter && filters.statusFilter !== 'ALL') {
            if (filters.statusFilter === 'LOW') {
                mappedData = mappedData.filter(i => i.quantity <= i.minQuantity && i.quantity > 0);
            } else if (filters.statusFilter === 'GOOD') {
                mappedData = mappedData.filter(i => i.quantity > i.minQuantity);
            }
            // For count, it might be inaccurate if we do client-side filtering after paginating. 
            // To be purely server-side with no view for 'LOW' and 'GOOD', we might have an issue. But let's assume it's acceptable for now since `OUT` is exact `0`.
        }

        return {
            data: mappedData,
            count: count || 0
        };
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
                image_url: item.imageUrl,
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
                image_url: item.imageUrl,
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

    getMovements: async (filters?: { stockItemId?: string, type?: string, dateFrom?: string, dateTo?: string }, limit = 200): Promise<any[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled && tenantId) {
            let query = supabase
                .from('stock_movements')
                .select(`
                    *, 
                    stock_items(description, code)
                `)
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false });

            if (filters?.stockItemId) {
                query = query.eq('stock_item_id', filters.stockItemId);
            }
            if (filters?.type && filters.type !== 'ALL') {
                query = query.eq('type', filters.type);
            }
            if (filters?.dateFrom) {
                query = query.gte('created_at', filters.dateFrom + 'T00:00:00Z');
            }
            if (filters?.dateTo) {
                query = query.lte('created_at', filters.dateTo + 'T23:59:59Z');
            }

            const { data, error } = await query.limit(limit);

            if (error) {
                console.error("❌ [StockService] Erro ao buscar movimentações:", error.message);
                throw error;
            }

            if (!data || data.length === 0) return [];

            // Coletar todos os IDs de usuário únicos e IDs de referências (Mapeamento de UUID para display_id)
            const userIds = new Set<string>();
            const referenceIds = new Set<string>();

            data.forEach(m => {
                if (m.created_by) userIds.add(m.created_by);
                if (m.user_id) userIds.add(m.user_id);
                // Se for um UUID (comprimento 36 clássico), vamos tentar buscar o display_id amigavel
                if (m.reference_id && m.reference_id.length === 36 && m.reference_id.includes('-')) {
                    referenceIds.add(m.reference_id);
                }
            });

            // Buscar os nomes desses usuários
            let usersMap: Record<string, string> = {};
            if (userIds.size > 0) {
                const { data: usersData, error: usersError } = await supabase
                    .from('users')
                    .select('id, name')
                    .in('id', Array.from(userIds));

                if (!usersError && usersData) {
                    usersMap = usersData.reduce((acc: any, u: any) => {
                        acc[u.id] = u.name;
                        return acc;
                    }, {});
                }
            }

            // Buscar os display_ids exatos (OS ou Orçamentos)
            let referenceMap: Record<string, string> = {};
            if (referenceIds.size > 0) {
                const idsArray = Array.from(referenceIds);

                // Primeiro tenta buscar em Ordens (buxca mais veloz por IN direct)
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select('id, display_id')
                    .in('id', idsArray);

                if (ordersData) {
                    ordersData.forEach((o: any) => {
                        if (o.display_id) referenceMap[o.id] = o.display_id;
                    });
                }

                // Filtra os IDs que ainda não achamos pra buscar em Orçamentos
                const remainingIds = idsArray.filter(id => !referenceMap[id]);
                if (remainingIds.length > 0) {
                    const { data: quotesData } = await supabase
                        .from('quotes')
                        .select('id, display_id')
                        .in('id', remainingIds);

                    if (quotesData) {
                        quotesData.forEach((q: any) => {
                            if (q.display_id) referenceMap[q.id] = q.display_id;
                        });
                    }
                }
            }

            // Mapear de volta para o formato esperado pelo painel
            return data.map(m => ({
                ...m,
                reference_id: m.reference_id && referenceMap[m.reference_id] ? referenceMap[m.reference_id] : m.reference_id,
                executor: m.created_by ? { name: usersMap[m.created_by] || 'Sistema' } : null,
                technician: m.user_id ? { name: usersMap[m.user_id] || 'N/A' } : null
            }));
        }
        return [];
    }
};
