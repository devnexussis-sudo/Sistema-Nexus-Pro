
import React, { useState, useEffect, useRef } from 'react';
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
    const fetchInProgressRef = useRef(false);

    // Load cache imediato ao montar (UI instantânea)
    useEffect(() => {
        const cached = localStorage.getItem('cached_orders');
        const meta = localStorage.getItem('cached_orders_meta');
        if (cached) {
            try {
                setOrders(JSON.parse(cached));
                if (meta) {
                    const { page, total } = JSON.parse(meta);
                    setCurrentPage(page || 1);
                    setTotalOrders(total || 0);
                }
            } catch (e) {
                console.error('[TechApp] Error loading cache:', e);
            }
        }
    }, []);

    useEffect(() => {
        if (!auth.isAuthenticated || !auth.user) return;

        let mounted = true;

        // 🚀 Fetch paginado - carrega apenas N ordens por vez
        const fetchTechData = async (page: number = 1) => {
            if (!auth.user || fetchInProgressRef.current) return;

            // Timeout de segurança para não travar a UI (8 segundos)
            const timeoutId = setTimeout(() => {
                if (mounted) {
                    setIsFetchingData(false);
                    console.warn('[TechApp] Fetch timeout hit - releasing UI');
                }
                fetchInProgressRef.current = false;
            }, 8000);

            try {
                fetchInProgressRef.current = true;

                // Só liga o spinner se NÃO tiver dados visíveis (cache vazio)
                // Isso evita tela branca se já tiver cache populado
                if (orders.length === 0) setIsFetchingData(true);

                const { orders: fetchedOrders, total } = await DataService.getOrdersPaginated(
                    page,
                    ITEMS_PER_PAGE,
                    auth.user.id
                );

                if (!mounted) return;

                setOrders(fetchedOrders);
                setTotalOrders(total);
                setCurrentPage(page);

                // Cache apenas da página atual
                localStorage.setItem('cached_orders', JSON.stringify(fetchedOrders));
                localStorage.setItem('cached_orders_meta', JSON.stringify({ page, total }));

            } catch (e: any) {
                console.error('[TechApp] Error fetching orders:', e);
                // Fallback silencioso se já tiver dados
                if (mounted && orders.length === 0) {
                    const cached = localStorage.getItem('cached_orders');
                    const meta = localStorage.getItem('cached_orders_meta');
                    if (cached) {
                        try {
                            setOrders(JSON.parse(cached));
                            if (meta) {
                                const { total } = JSON.parse(meta);
                                setTotalOrders(total);
                            }
                        } catch (err) {
                            console.error('[TechApp] Cache parse error:', err);
                        }
                    }
                }
            } finally {
                clearTimeout(timeoutId);
                if (mounted) {
                    setIsFetchingData(false); // Garante liberação do spinner
                }
                fetchInProgressRef.current = false;
            }
        };

        // Fetch inicial
        fetchTechData(1);

        // Configura realtime listener
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
                        if (mounted && !fetchInProgressRef.current) {
                            fetchTechData(currentPage);
                        }
                    })
                    .subscribe();
            } catch (e) {
                console.error('[TechApp] Error setting up realtime:', e);
            }
        };

        setupRealtime();

        return () => {
            mounted = false;
            fetchInProgressRef.current = false;
            (async () => {
                try {
                    const { supabase } = await import('../../lib/supabase');
                    if (channelRef.current) {
                        supabase.removeChannel(channelRef.current);
                    }
                } catch (e) {
                    console.error('[TechApp] Cleanup error:', e);
                }
            })();
        };
    }, [auth.isAuthenticated, auth.user?.id]);

    // Callback para mudança de página
    const handlePageChange = async (newPage: number) => {
        if (!auth.user || fetchInProgressRef.current) return;

        try {
            fetchInProgressRef.current = true;
            setIsFetchingData(true);

            const { orders: fetchedOrders, total } = await DataService.getOrdersPaginated(
                newPage,
                ITEMS_PER_PAGE,
                auth.user.id
            );

            setOrders(fetchedOrders);
            setTotalOrders(total);
            setCurrentPage(newPage);

            localStorage.setItem('cached_orders', JSON.stringify(fetchedOrders));
            localStorage.setItem('cached_orders_meta', JSON.stringify({ page: newPage, total }));

        } catch (e: any) {
            console.error('[TechApp] Error changing page:', e);
        } finally {
            setIsFetchingData(false);
            fetchInProgressRef.current = false;
        }
    };

    const handleRefresh = async () => {
        if (!auth.user || fetchInProgressRef.current) return;

        try {
            fetchInProgressRef.current = true;
            setIsFetchingData(true);

            const { orders: fetchedOrders, total } = await DataService.getOrdersPaginated(
                currentPage,
                ITEMS_PER_PAGE,
                auth.user.id
            );

            setOrders(fetchedOrders);
            setTotalOrders(total);

            localStorage.setItem('cached_orders', JSON.stringify(fetchedOrders));
            localStorage.setItem('cached_orders_meta', JSON.stringify({ page: currentPage, total }));

        } catch (e: any) {
            console.error('[TechApp] Error refreshing:', e);
        } finally {
            setIsFetchingData(false);
            fetchInProgressRef.current = false;
        }
    };

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
                await handleRefresh();
            }}
            onRefresh={handleRefresh}
            onLogout={onLogout}
            isFetching={isFetchingData}
        />
    );
};
