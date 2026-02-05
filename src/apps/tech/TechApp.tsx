
import React, { useState, useEffect, useRef } from 'react';
import { TechLogin } from '../../tech-pwa/TechLogin';
import { TechDashboard } from '../../tech-pwa/TechDashboard';
import { DataService } from '../../services/dataService';
import { AuthState, User, UserRole, ServiceOrder, OrderStatus } from '../../types';

interface TechAppProps {
    auth: AuthState;
    onLogin: (user: User, rememberMe?: boolean) => void;
    onLogout: () => void;
}

export const TechApp: React.FC<TechAppProps> = ({ auth, onLogin, onLogout }) => {
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [isFetchingData, setIsFetchingData] = useState(false);
    const channelRef = useRef<any>(null);

    const fetchTechData = async () => {
        if (!auth.user) return;
        try {
            setIsFetchingData(true);
            const o = await DataService.getOrders();
            setOrders(o);
            // Salva cache local para offline
            localStorage.setItem('cached_orders', JSON.stringify(o));
        } catch (e: any) {
            console.error('[TechApp] Error fetching orders:', e);
            // Fallback: se falhar, tenta carregar do cache se estiver vazio
            if (orders.length === 0) {
                const cached = localStorage.getItem('cached_orders');
                if (cached) {
                    setOrders(JSON.parse(cached));
                    console.log('[TechApp] Loaded from cache after error');
                }
            }
        } finally {
            setIsFetchingData(false);
        }
    };

    // Load cache imediato ao montar
    useEffect(() => {
        const cached = localStorage.getItem('cached_orders');
        if (cached) {
            setOrders(JSON.parse(cached));
        }
    }, []);

    useEffect(() => {
        if (!auth.isAuthenticated || !auth.user) return;

        // Fetch inicial
        fetchTechData();

        // Configura realtime listener
        let mounted = true;

        const setupRealtime = async () => {
            try {
                const { supabase } = await import('../../lib/supabase');

                // Remove canal anterior se existir
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
                        if (mounted) fetchTechData();
                    })
                    .subscribe();
            } catch (e) {
                console.error('[TechApp] Error setting up realtime:', e);
            }
        };

        setupRealtime();

        return () => {
            mounted = false;
            // Cleanup do canal
            (async () => {
                const { supabase } = await import('../../lib/supabase');
                if (channelRef.current) {
                    supabase.removeChannel(channelRef.current);
                }
            })();
        };
    }, [auth.isAuthenticated, auth.user?.id]);

    if (!auth.isAuthenticated) {
        return <TechLogin onLogin={(user) => onLogin(user, true)} />;
    }

    const userOrders = orders.filter(o => o.assignedTo === auth.user?.id);

    return (
        <TechDashboard
            user={auth.user!}
            orders={userOrders}
            onUpdateStatus={async (id, s, n, d) => {
                await DataService.updateOrderStatus(id, s, n, d);
                await fetchTechData();
            }}
            onRefresh={fetchTechData}
            onLogout={onLogout}
            isFetching={isFetchingData}
        />
    );
};
