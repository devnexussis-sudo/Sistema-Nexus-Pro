
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, ServiceOrder, AuthState, UserRole, OrderStatus } from '../../../../types';
import { DataService } from '../../../../services/dataService';

interface TechContextType {
    auth: AuthState;
    orders: ServiceOrder[];
    isSyncing: boolean;
    gpsStatus: 'active' | 'error' | 'inactive';
    login: (email: string, pass: string) => Promise<void>;
    logout: () => void;
    refreshData: () => Promise<void>;
    updateOrderStatus: (id: string, status: OrderStatus, notes?: string, formData?: any) => Promise<void>;
}

const TechContext = createContext<TechContextType | undefined>(undefined);

export const TechProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [auth, setAuth] = useState<AuthState>(() => {
        const stored = localStorage.getItem('nexus_tech_session_v2');
        if (stored) {
            try {
                const user = JSON.parse(stored);
                return { user, isAuthenticated: true };
            } catch { return { user: null, isAuthenticated: false }; }
        }
        return { user: null, isAuthenticated: false };
    });

    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [isSyncing, setIsSyncing] = useState(false);
    const [gpsStatus, setGpsStatus] = useState<'active' | 'error' | 'inactive'>('inactive');

    const watchIdRef = useRef<number | null>(null);
    const mountedRef = useRef(true);

    // 📍 MOTOR GPS 2.0 (Resiliente)
    const startGPS = useCallback(() => {
        if (!navigator.geolocation || !auth.user?.id) return;

        console.log("[GPS-V2] 📡 Iniciando rastreamento...");
        setGpsStatus('active');

        watchIdRef.current = navigator.geolocation.watchPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                try {
                    // Update silencioso
                    await DataService.updateTechnicianLocation(auth.user!.id, latitude, longitude);
                } catch (e) { }
            },
            (err) => {
                // Filtra erros comuns de ambiente de desenvolvimento/perda de sinal momentânea
                if (err.message.includes('Timeout') || err.message.includes('unavailable') || err.message.includes('kCLErrorLocationUnknown')) {
                    console.debug("[GPS-V2] ℹ️ Sinal instável ou indisponível (Tentando novamente...):", err.message);
                } else {
                    console.warn("[GPS-V2] ⚠️ Erro de sinal:", err.message);
                }
                // Não desativa, apenas loga. Em túneis o sinal volta sozinho.
            },
            { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 }
        );
    }, [auth.user?.id]);

    const stopGPS = useCallback(() => {
        if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
        }
        setGpsStatus('inactive');
    }, []);

    // 🔄 MOTOR DE SINCRONIZAÇÃO (Inteligente)
    const refreshData = useCallback(async () => {
        if (!auth.user?.id) return;
        setIsSyncing(true);
        try {
            // Buscamos as ordens sem paginação agressiva para o modo offline simplificado
            const { orders: fetched } = await DataService.getOrdersPaginated(1, 50, auth.user.id);
            if (mountedRef.current) setOrders(fetched);
            localStorage.setItem('nexus_tech_cache_v2', JSON.stringify(fetched));
        } catch (e) {
            console.error("[Context-V2] Sync Error:", e);
        } finally {
            if (mountedRef.current) setIsSyncing(false);
        }
    }, [auth.user?.id]);

    // 🚪 AUTH ACTIONS
    const login = async (email: string, pass: string) => {
        const user = await DataService.login(email, pass);
        if (user && user.role === UserRole.TECHNICIAN) {
            localStorage.setItem('nexus_tech_session_v2', JSON.stringify(user));
            setAuth({ user, isAuthenticated: true });
        } else {
            throw new Error("Acesso negado. Apenas técnicos podem usar este App.");
        }
    };

    const logout = useCallback(async () => {
        await DataService.logout();
        setAuth({ user: null, isAuthenticated: false });
        setOrders([]);
        stopGPS();
    }, [stopGPS]);

    const updateOrderStatus = useCallback(async (id: string, status: OrderStatus, notes?: string, formData?: any) => {
        try {
            await DataService.updateOrderStatus(id, status, notes, formData);
            if (mountedRef.current) {
                setOrders(prev => prev.map(o => o.id === id ? { ...o, status, notes, formData: { ...o.formData, ...formData } } : o));
            }
        } catch (e) {
            console.error("[Context-V2] Update Status Error:", e);
            throw e;
        }
    }, []);

    // EFETUAR SYNC AO LOGAR
    useEffect(() => {
        if (auth.isAuthenticated) {
            refreshData();
            startGPS();
        } else {
            stopGPS();
        }
    }, [auth.isAuthenticated, refreshData, startGPS, stopGPS]);

    useEffect(() => {
        mountedRef.current = true;
        // Carrega cache offline imediato
        const cached = localStorage.getItem('nexus_tech_cache_v2');
        if (cached) setOrders(JSON.parse(cached));

        return () => { mountedRef.current = false; stopGPS(); };
    }, [stopGPS]);

    return (
        <TechContext.Provider value={{ auth, orders, isSyncing, gpsStatus, login, logout, refreshData, updateOrderStatus }}>
            {children}
        </TechContext.Provider>
    );
};

export const useTech = () => {
    const context = useContext(TechContext);
    if (!context) throw new Error("useTech deve ser usado dentro de TechProvider");
    return context;
};
