
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
        sellPrice: number;
        unit: string;
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
    }
};
