
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TechLogin } from '../../tech-pwa/TechLogin';
import { TechDashboard } from '../../tech-pwa/TechDashboard';
import { DataService } from '../../services/dataService';
import { AuthState, User, UserRole, ServiceOrder, OrderStatus } from '../../types';

const ITEMS_PER_PAGE = 5;

interface TechAppProps {
    auth: AuthState;
    onLogin: (user: User, rememberMe?: boolean) => void;
    onLogout: () => void;
}

export const TechApp: React.FC<TechAppProps> = ({ auth, onLogin, onLogout }) => {
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [totalOrders, setTotalOrders] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [isFetchingData, setIsFetchingData] = useState(false);
    const channelRef = useRef<any>(null);

    // 🚀 Fetch paginado - carrega apenas N ordens por vez
    const fetchTechData = useCallback(async (page: number = 1) => {
        if (!auth.user) return;

        try {
            setIsFetchingData(true);
            const { orders: fetchedOrders, total } = await DataService.getOrdersPaginated(
                page,
                ITEMS_PER_PAGE,
                auth.user.id // Filtra apenas ordens do técnico logado
            );

            setOrders(fetchedOrders);
            setTotalOrders(total);
            setCurrentPage(page);

            // Cache apenas da página atual
            localStorage.setItem('cached_orders', JSON.stringify(fetchedOrders));
            localStorage.setItem('cached_orders_meta', JSON.stringify({ page, total }));

        } catch (e: any) {
            console.error('[TechApp] Error fetching orders:', e);
            // Fallback: carregar do cache
            if (orders.length === 0) {
                const cached = localStorage.getItem('cached_orders');
                const meta = localStorage.getItem('cached_orders_meta');
                if (cached) {
                    setOrders(JSON.parse(cached));
                    if (meta) {
                        const { total } = JSON.parse(meta);
                        setTotalOrders(total);
                    }
                    console.log('[TechApp] Loaded from cache after error');
                }
            }
        } finally {
            setIsFetchingData(false);
        }
    }, [auth.user?.id]);

    // Callback para mudança de página (vindo do Dashboard)
    const handlePageChange = useCallback((newPage: number) => {
        fetchTechData(newPage);
    }, [fetchTechData]);

    // Load cache imediato ao montar (UI instantânea)
    useEffect(() => {
        const cached = localStorage.getItem('cached_orders');
        const meta = localStorage.getItem('cached_orders_meta');
        if (cached) {
            setOrders(JSON.parse(cached));
            if (meta) {
                const { page, total } = JSON.parse(meta);
                setCurrentPage(page || 1);
                setTotalOrders(total || 0);
            }
        }
    }, []);

    useEffect(() => {
        if (!auth.isAuthenticated || !auth.user) return;

        // Fetch inicial (página 1)
        fetchTechData(1);

        // Configura realtime listener
        let mounted = true;

        const setupRealtime = async () => {
            try {
                const { supabase } = await import('../../lib/supabase');

                if (channelRef.current) {
                    supabase.removeChannel(channelRef.current);
                }

                channelRef.current = supabase
                    .channel(`tech-orders-${auth.user?.id}`)
                    .on('postgres_changes', {
                        event: '*',
                        schema: 'public',
                        table: 'orders'
                    }, () => {
                        // Quando houver mudança, recarrega a página atual
                        if (mounted) fetchTechData(currentPage);
                    })
                    .subscribe();
            } catch (e) {
                console.error('[TechApp] Error setting up realtime:', e);
            }
        };

        setupRealtime();

        return () => {
            mounted = false;
            (async () => {
                const { supabase } = await import('../../lib/supabase');
                if (channelRef.current) {
                    supabase.removeChannel(channelRef.current);
                }
            })();
        };
    }, [auth.isAuthenticated, auth.user?.id, fetchTechData]);

    if (!auth.isAuthenticated) {
        return <TechLogin onLogin={(user) => onLogin(user, true)} />;
    }

    return (
        <TechDashboard
            user={auth.user!}
            orders={orders}
            totalOrders={totalOrders}
            currentPage={currentPage}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={handlePageChange}
            onUpdateStatus={async (id, s, n, d) => {
                await DataService.updateOrderStatus(id, s, n, d);
                await fetchTechData(currentPage);
            }}
            onRefresh={() => fetchTechData(currentPage)}
            onLogout={onLogout}
            isFetching={isFetchingData}
        />
    );
};
