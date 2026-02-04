
import React, { useState, useEffect } from 'react';
import { TechLogin } from '../../tech-pwa/TechLogin';
import { TechDashboard } from '../../tech-pwa/TechDashboard';
import { DataService } from '../../services/dataService';
import SessionStorage, { GlobalStorage } from '../../lib/sessionStorage';
import { AuthState, User, UserRole, ServiceOrder, OrderStatus } from '../../types';

interface TechAppProps {
    auth: AuthState;
    onLogin: (user: User) => void;
    onLogout: () => void;
}

export const TechApp: React.FC<TechAppProps> = ({ auth, onLogin, onLogout }) => {
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [isFetchingData, setIsFetchingData] = useState(false);

    const fetchTechData = async () => {
        if (!auth.user) return;
        try {
            setIsFetchingData(true);
            // O técnico só precisa das suas próprias ordens
            const o = await DataService.getOrders();
            setOrders(o);
        } catch (e) {
            console.error(e);
        } finally {
            setIsFetchingData(false);
        }
    };

    useEffect(() => {
        if (auth.isAuthenticated) {
            fetchTechData();

            // Realtime listener
            (async () => {
                const { supabase } = await import('../../lib/supabase');
                const channel = supabase.channel('tech-orders')
                    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
                        fetchTechData();
                    })
                    .subscribe();
                return () => supabase.removeChannel(channel);
            })();
        }
    }, [auth.isAuthenticated]);

    if (!auth.isAuthenticated) {
        return <TechLogin onLogin={onLogin} />;
    }

    return (
        <TechDashboard
            user={auth.user!}
            orders={orders.filter(o => o.assignedTo === auth.user?.id)}
            onUpdateStatus={async (id, s, n, d, items) => {
                await DataService.updateOrderStatus(id, s, n, d, items);
                await fetchTechData();
            }}
            onRefresh={fetchTechData}
            onLogout={onLogout}
            isFetching={isFetchingData}
        />
    );
};
