
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
    const fetchInProgressRef = useRef(false);
    const mountedRef = useRef(false);

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

    // 🚀 Motor de dados centralizado
    const fetchTechData = useCallback(async (page: number = 1, silent: boolean = false) => {
        if (!auth.user || fetchInProgressRef.current) return;

        try {
            fetchInProgressRef.current = true;
            if (!silent && orders.length === 0) setIsFetchingData(true);

            // console.log(`[TechApp] 📡 Buscando dados (página ${page})...`);
            const { orders: fetchedOrders, total } = await DataService.getOrdersPaginated(
                page,
                ITEMS_PER_PAGE,
                auth.user.id
            );

            if (!mountedRef.current) return;

            setOrders(fetchedOrders);
            setTotalOrders(total);
            setCurrentPage(page);

            localStorage.setItem('cached_orders', JSON.stringify(fetchedOrders));
            localStorage.setItem('cached_orders_meta', JSON.stringify({ page, total }));

        } catch (e: any) {
            console.error('[TechApp] Fetch Error:', e);
        } finally {
            if (mountedRef.current) setIsFetchingData(false);
            fetchInProgressRef.current = false;
        }
    }, [auth.user, orders.length]);

    // 1. Efeito de Inicialização (Montagem)
    useEffect(() => {
        mountedRef.current = true;
        fetchTechData(1);
        return () => { mountedRef.current = false; };
    }, []); // Só roda no mount real

    // 2. Efeito de Realtime (Reativo)
    useEffect(() => {
        if (!auth.isAuthenticated || !auth.user?.id) return;

        let channel: any = null;

        const setupRealtime = async () => {
            try {
                const { supabase } = await import('../../lib/supabase');
                channel = supabase
                    .channel(`tech-ord-${auth.user?.id}`)
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                        // Faz um refresh silencioso mantendo a página atual
                        fetchTechData(currentPage, true);
                    })
                    .subscribe();
            } catch (e) {
                console.error('[TechApp] Realtime Setup Error:', e);
            }
        };

        setupRealtime();

        return () => {
            if (channel) {
                import('../../lib/supabase').then(({ supabase }) => {
                    supabase.removeChannel(channel);
                });
            }
        };
    }, [auth.isAuthenticated, auth.user?.id, currentPage, fetchTechData]);

    // Callback para mudança de página
    const handlePageChange = useCallback(async (newPage: number) => {
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
    }, [auth.user, currentPage]);

    const handleRefresh = useCallback(async () => {
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
    }, [auth.user, currentPage]);

    const handleUpdateStatus = useCallback(async (id: string, s: OrderStatus, n?: string, d?: any) => {
        await DataService.updateOrderStatus(id, s, n, d);
        await handleRefresh();
    }, [handleRefresh]);

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
            onUpdateStatus={handleUpdateStatus}
            onRefresh={handleRefresh}
            onLogout={onLogout}
            isFetching={isFetchingData}
        />
    );
};
