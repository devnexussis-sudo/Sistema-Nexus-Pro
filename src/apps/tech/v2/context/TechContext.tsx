
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, ServiceOrder, AuthState, UserRole, OrderStatus } from '../../../../types';
import { DataService } from '../../../../services/dataService';

interface PaginationState {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
}

interface FilterState {
    status: OrderStatus | 'ALL';
    startDate: string;
    endDate: string;
}

interface TechContextType {
    auth: AuthState;
    orders: ServiceOrder[];
    isSyncing: boolean;
    gpsStatus: 'active' | 'error' | 'inactive';
    pagination: PaginationState;
    filters: FilterState;
    login: (email: string, pass: string) => Promise<void>;
    logout: () => void;
    refreshData: (params?: { page?: number; newFilters?: Partial<FilterState> }) => Promise<void>;
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

    // Estado local de paginação e filtros
    const [pagination, setPagination] = useState<PaginationState>({ page: 1, limit: 10, total: 0, totalPages: 0 });
    const [filters, setFilters] = useState<FilterState>(() => {
        // Default: Dia Atual
        const today = new Date().toISOString().split('T')[0];
        return { status: 'ALL', startDate: today, endDate: today };
    });

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
    const refreshData = useCallback(async (params?: { page?: number; newFilters?: Partial<FilterState> }) => {
        if (!auth.user?.id) return;

        setIsSyncing(true);

        // Calcula novos estados baseados nos params ou usa o atual
        const targetPage = params?.page || (params?.newFilters ? 1 : pagination.page);
        const targetFilters = { ...filters, ...(params?.newFilters || {}) };

        // Se mudou filtros, atualiza estado
        if (params?.newFilters) setFilters(targetFilters);

        try {
            console.log(`[TechContext] Fetching page ${targetPage} with filters:`, targetFilters);

            const { orders: fetchedOrders, total } = await DataService.getOrdersPaginated(
                targetPage,
                10, // Limit fixo 10 por página conforme solicitado
                auth.user.id,
                {
                    status: targetFilters.status === 'ALL' ? undefined : targetFilters.status,
                    startDate: targetFilters.startDate,
                    endDate: targetFilters.endDate
                }
            );

            if (mountedRef.current) {
                // Se for página 1, substitui. Se for > 1, append (opcional, mas aqui vamos substituir pq é paginação clássica ou load more?)
                // O usuário pediu "mudar de página abaixo", então é substituição clássica de lista, não infinite scroll.
                setOrders(fetchedOrders);
                setPagination({
                    page: targetPage,
                    limit: 10,
                    total: total,
                    totalPages: Math.ceil(total / 10)
                });

                // Cache apenas da primeira página/filtro default para offline rápido
                if (targetPage === 1 && !params?.newFilters) {
                    localStorage.setItem('nexus_tech_cache_v2', JSON.stringify(fetchedOrders));
                }
            }
        } catch (e) {
            console.error("[Context-V2] Sync Error:", e);
        } finally {
            if (mountedRef.current) setIsSyncing(false);
        }
    }, [auth.user?.id, filters, pagination.page]);

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
        localStorage.removeItem('nexus_tech_cache_v2');
    }, [stopGPS]);

    const updateOrderStatus = useCallback(async (id: string, status: OrderStatus, notes?: string, formData?: any) => {
        try {
            await DataService.updateOrderStatus(id, status, notes, formData);
            if (mountedRef.current) {
                // Atualização Otimista local
                setOrders(prev => prev.map(o => o.id === id ? { ...o, status, notes, formData: { ...o.formData, ...formData } } : o));
            }
        } catch (e) {
            console.error("[Context-V2] Update Status Error:", e);
            throw e;
        }
    }, []);

    // EFETUAR SYNC AO LOGAR (Apenas Page 1 Default)
    useEffect(() => {
        if (auth.isAuthenticated) {
            startGPS();
            // Carrega cache first
            const cached = localStorage.getItem('nexus_tech_cache_v2');
            if (cached) setOrders(JSON.parse(cached));

            // Then sync fresh
            refreshData({ page: 1 });
        } else {
            stopGPS();
        }
    }, [auth.isAuthenticated, startGPS, stopGPS]); // refreshData removido da dep array para evitar loop, pois refreshData muda com filters

    useEffect(() => {
        mountedRef.current = true;
        return () => { mountedRef.current = false; stopGPS(); };
    }, [stopGPS]);

    return (
        <TechContext.Provider value={{ auth, orders, isSyncing, gpsStatus, pagination, filters, login, logout, refreshData, updateOrderStatus }}>
            {children}
        </TechContext.Provider>
    );
};

export const useTech = () => {
    const context = useContext(TechContext);
    if (!context) throw new Error("useTech deve ser usado dentro de TechProvider");
    return context;
};
