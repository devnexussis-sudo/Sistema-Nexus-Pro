
import { authService } from './auth-service';
import { CacheService } from './cache-service';
import { logger } from './logger';
import { supabase } from './supabase';

export interface TechStockItem {
    id: string;
    stockItemId: string;
    quantity: number;
    updatedAt: string;
    item: {
        description: string;
        code: string;
        manufacturerCode?: string;
        sellPrice: number;
        unit: string;
    } | null;
}

export interface TechStockMovement {
    id: string;
    type: string;
    quantity: number;
    source: string;
    destination: string;
    createdAt: string;
    order?: {
        id: string;
        displayId?: string;
        title: string;
    } | null;
}

export const StockService = {
    /**
     * Busca o estoque do técnico logado
     */
    async getMyStock(forceRefresh = false): Promise<TechStockItem[]> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id || authService.getCurrentUserId();

            if (!userId) {
                logger.log('Cannot fetch tech stock: No user logged in', 'warn');
                return [];
            }

            // Precisamos do tenant_id para garantir isolamento via query se o RLS for estrito
            // Mas o RLS já deve cuidar disso se configurado com auth.uid()
            const cacheKey = `stock_tech_${userId}`;
            const cached = await CacheService.get<TechStockItem[]>(cacheKey);
            if (cached && !forceRefresh) return cached;

            return await CacheService.fetcher(cacheKey, async () => {
                const { data, error } = await supabase
                    .from('tech_stock')
                    .select('*, stock_items(*)')
                    .eq('user_id', userId);

                if (error) {
                    logger.log(`Error fetching tech stock: ${error.message}`, 'error');
                    throw error;
                }

                const mapped = (data || []).map((ts: any) => ({
                    id: ts.id,
                    stockItemId: ts.stock_item_id,
                    quantity: Number(ts.quantity),
                    updatedAt: ts.updated_at,
                    item: ts.stock_items ? {
                        description: ts.stock_items.description,
                        code: ts.stock_items.code,
                        manufacturerCode: ts.stock_items.external_code,
                        sellPrice: Number(ts.stock_items.sell_price),
                        unit: ts.stock_items.unit || 'UN'
                    } : null
                }));

                await CacheService.set(cacheKey, mapped, CacheService.TTL.APP);
                return mapped;
            });
        } catch (error) {
            logger.log(`StockService exception: ${error}`, 'error');
            return [];
        }
    },

    /**
     * Busca o histórico de movimentações (consumos) do técnico para uma peça
     */
    async getItemMovements(stockItemId: string, page: number = 1, limit: number = 10): Promise<TechStockMovement[]> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id || authService.getCurrentUserId();

            if (!userId) return [];

            const from = (page - 1) * limit;
            const to = from + limit - 1;

            const { data, error } = await supabase
                .from('stock_movements')
                .select('id, type, quantity, source, destination, created_at, reference_id')
                .eq('stock_item_id', stockItemId)
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) {
                logger.log(`Error fetching movements: ${error.message}`, 'error');
                return [];
            }

            // Filter technically valid ones by this user (if RLS doesn't fully handle the complex logic, we do it defensively)
            const myMovements = (data || []).filter((m: any) => 
                // Either explicitely user requested, or source/dest matches tech format, or simply return what RLS gives us
                m.destination === `TECH_${userId}` || 
                m.source === `TECH_${userId}` || 
                m.type === 'CONSUMPTION'
            );

            // Fetch related orders manually to avoid PostgREST foreign key missing error
            const orderIds = [...new Set(myMovements.map(m => m.reference_id).filter(id => id && id.length > 20))];
            let ordersMap: Record<string, any> = {};

            if (orderIds.length > 0) {
                const { data: ordersData } = await supabase
                    .from('orders')
                    .select('id, display_id, title')
                    .in('id', orderIds);
                    
                if (ordersData) {
                    ordersData.forEach(o => {
                        ordersMap[o.id] = { id: o.id, displayId: o.display_id, title: o.title };
                    });
                }
            }

            return myMovements.map((m: any) => ({
                id: m.id,
                type: m.type,
                quantity: Number(m.quantity),
                source: m.source,
                destination: m.destination,
                createdAt: m.created_at,
                order: (m.reference_id && m.type === 'CONSUMPTION' && ordersMap[m.reference_id]) ? ordersMap[m.reference_id] : null
            }));
        } catch (error) {
            logger.log(`Movements exception: ${error}`, 'error');
            return [];
        }
    }
};
