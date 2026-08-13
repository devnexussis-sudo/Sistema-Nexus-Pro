
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { User, ServiceOrder, AuthState, UserRole, OrderStatus } from '../../../../types';
import { DataService } from '../../../../services/dataService';
import SessionStorage, { GlobalStorage } from '../../../../lib/sessionStorage';

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

interface ConnectivityState {
    isOnline: boolean;
    isSessionValid: boolean;
    lastSync: string | null;
}

interface TechContextType {
    auth: AuthState;
    orders: ServiceOrder[];
    isSyncing: boolean;
    gpsStatus: 'active' | 'error' | 'inactive';
    pagination: PaginationState;
    filters: FilterState;
    connectivity: ConnectivityState;
    login: (email: string, pass: string) => Promise<void>;
    logout: () => void;
    refreshData: (params?: { page?: number; newFilters?: Partial<FilterState>; silent?: boolean }) => Promise<void>;
    updateOrderStatus: (id: string, status: OrderStatus, notes?: string, formData?: any, items?: any[]) => Promise<void>;
    toast: { message: string; type: 'success' | 'error' | 'info' } | null;
    clearToast: () => void;
}

const TechContext = createContext<TechContextType | undefined>(undefined);

// 🛡️ CACHE KEYS CONSTANTS
const STORAGE_KEYS = {
    SESSION: 'nexus_tech_session_v2',
    CACHE: 'nexus_tech_cache_v2',
    CACHE_META: 'nexus_tech_cache_meta_v2',
    TENANT: 'current_tenant',
    LAST_SYNC: 'nexus_tech_last_sync'
} as const;

export const TechProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // 🔐 AUTH STATE com recuperação multi-camada
    const [auth, setAuth] = useState<AuthState>(() => {
        try {
            // Priority 1: localStorage (PWA Persistence)
            const stored = localStorage.getItem(STORAGE_KEYS.SESSION);
            const storedTenant = localStorage.getItem(STORAGE_KEYS.TENANT);

            if (stored) {
                const user = JSON.parse(stored);

                // Redundant restoration of Tenant ID to SessionStorage (used by DataService)
                const tenantToUse = user.tenantId || storedTenant;
                if (tenantToUse) {
                    SessionStorage.set(STORAGE_KEYS.TENANT, tenantToUse);
                    if (!storedTenant) localStorage.setItem(STORAGE_KEYS.TENANT, tenantToUse);
                }

                return { user, isAuthenticated: true };
            }

            // Priority 2: SessionStorage fallback
            const sessionUser = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
            if (sessionUser) {
                const user = typeof sessionUser === 'string' ? JSON.parse(sessionUser) : sessionUser;
                if (user.role === UserRole.TECHNICIAN) {
                    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
                    if (user.tenantId) localStorage.setItem(STORAGE_KEYS.TENANT, user.tenantId);
                    return { user, isAuthenticated: true };
                }
            }
        } catch (e) {
            console.error('[TechContext] Erro ao recuperar sessão:', e);
        }
        return { user: null, isAuthenticated: false };
    });

    const [orders, setOrders] = useState<ServiceOrder[]>(() => {
        // 📦 OFFLINE-FIRST: Carrega cache imediatamente
        try {
            const cached = localStorage.getItem(STORAGE_KEYS.CACHE);
            if (cached) {
                const parsed = JSON.parse(cached);
                if (Array.isArray(parsed)) {
                    console.log('[TechContext] ⚡ Cache validado e carregado');
                    return parsed;
                }
            }
        } catch (e) {
            console.error('[TechContext] Erro ao carregar cache:', e);
            localStorage.removeItem(STORAGE_KEYS.CACHE);
        }
        return [];
    });

    const [isSyncing, setIsSyncing] = useState(false);
    const [gpsStatus, setGpsStatus] = useState<'active' | 'error' | 'inactive'>('inactive');
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const [connectivity, setConnectivity] = useState<ConnectivityState>({
        isOnline: navigator.onLine,
        isSessionValid: true,
        lastSync: localStorage.getItem(STORAGE_KEYS.LAST_SYNC)
    });

    // 🔒 Track if connection was actually lost (to avoid fake "restored" messages)
    const wasOfflineRef = useRef(false);

    // Estado local de paginação e filtros
    const [pagination, setPagination] = useState<PaginationState>(() => {
        try {
            const meta = localStorage.getItem(STORAGE_KEYS.CACHE_META);
            if (meta) {
                return JSON.parse(meta);
            }
        } catch (e) { }
        return { page: 1, limit: 10, total: 0, totalPages: 0 };
    });

    const [filters, setFilters] = useState<FilterState>(() => {
        // Default: Dia Atual
        const today = new Date().toISOString().split('T')[0];
        return { status: 'ALL', startDate: today, endDate: today };
    });

    const watchIdRef = useRef<number | null>(null);
    const mountedRef = useRef(true);
    const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const logoutRef = useRef<(() => Promise<void>) | null>(null);

    // 📍 MOTOR GPS 2.0 (Resiliente)
    const startGPS = useCallback(() => {
        if (!navigator.geolocation || !auth.user?.id) return;

        console.log("[GPS-V2] 📡 Iniciando rastreamento...");
        setGpsStatus('active');

        watchIdRef.current = navigator.geolocation.watchPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                try {
                    await DataService.updateTechnicianLocation(auth.user!.id, latitude, longitude);
                } catch (e) { }
            },
            (err) => {
                if (err.message.includes('Timeout') || err.message.includes('unavailable') || err.message.includes('kCLErrorLocationUnknown')) {
                    console.debug("[GPS-V2] ℹ️ Sinal instável (tentando novamente):", err.message);
                } else {
                    console.warn("[GPS-V2] ⚠️ Erro de sinal:", err.message);
                }
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
    const refreshData = useCallback(async (params?: { page?: number; newFilters?: Partial<FilterState>; silent?: boolean }) => {
        if (!auth.user?.id) {
            console.warn('[TechContext] ⚠️ refreshData chamado sem user autenticado');
            return;
        }

        if (!params?.silent) setIsSyncing(true);

        const targetPage = params?.page || (params?.newFilters ? 1 : pagination.page);
        const targetFilters = { ...filters, ...(params?.newFilters || {}) };

        if (params?.newFilters) setFilters(targetFilters);

        try {
            console.log(`[TechContext] 📡 Sincronizando página ${targetPage}...`);

            // 🛡️ CRITICAL: Last-mile verification for Tenant ID
            // Garante que o ID do cliente esteja na memória antes do request
            if (auth.user?.tenantId && !SessionStorage.get(STORAGE_KEYS.TENANT)) {
                console.warn('[TechContext] ⚠️ [RefreshData] Tenant ID restaurado.');
                SessionStorage.set(STORAGE_KEYS.TENANT, auth.user.tenantId);
            }

            const { orders: fetchedOrders, total } = await DataService.getOrdersPaginated(
                targetPage,
                10,
                auth.user.id,
                {
                    status: targetFilters.status === 'ALL' ? undefined : targetFilters.status,
                    startDate: targetFilters.startDate,
                    endDate: targetFilters.endDate
                }
            );

            if (mountedRef.current) {
                setOrders(fetchedOrders);
                const newPagination = {
                    page: targetPage,
                    limit: 10,
                    total: total,
                    totalPages: Math.ceil(total / 10)
                };
                setPagination(newPagination);

                // Cache sempre (offline-first)
                localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify(fetchedOrders));
                localStorage.setItem(STORAGE_KEYS.CACHE_META, JSON.stringify(newPagination));

                const now = new Date().toISOString();
                localStorage.setItem(STORAGE_KEYS.LAST_SYNC, now);
                setConnectivity(prev => ({ ...prev, lastSync: now, isSessionValid: true }));

                console.log(`✅ Sincronizado: ${fetchedOrders.length} OSs`);
            }
        } catch (e: any) {
            console.error("❌ [TechContext] Erro de sincronização:", e);

            // 🛡️ Auto-Recovery por tipo de erro
            if (e?.message?.includes('JWT') || e?.code === 'PGRST301' || e?.status === 401 || e?.status === 403) {
                console.warn("🔐 Sessão expirada detectada. Forçando logout...");
                setConnectivity(prev => ({ ...prev, isSessionValid: false }));
                logoutRef.current?.();
            } else if (!navigator.onLine) {
                console.warn("📡 Sem conexão. Usando dados em cache.");
                setConnectivity(prev => ({ ...prev, isOnline: false }));
            }
        } finally {
            if (mountedRef.current) setIsSyncing(false);
        }
    }, [auth.user?.id, filters, pagination.page]);

    // 🚀 SESSION REVALIDATION (Big Tech Pattern)
    const revalidateSession = useCallback(async (silent = true) => {
        if (!auth.user?.id) return;

        console.log('[TechContext] 🔄 Revalidando sessão (Resume/Focus)...');

        // 🛡️ CRITICAL: Restore Tenant ID if lost from memory
        if (auth.user?.tenantId) {
            const currentTenant = SessionStorage.get(STORAGE_KEYS.TENANT);
            if (!currentTenant) {
                console.warn('[TechContext] ⚠️ [Revalidate] Tenant ID restaurado do cache persistente.');
                SessionStorage.set(STORAGE_KEYS.TENANT, auth.user.tenantId);
            }
        }

        try {
            // Check connection first
            if (!navigator.onLine) return;

            const { supabase } = await import('../../../../lib/supabase');

            // 🚀 EXPLICT HEARTBEAT: Tenta atualizar a sessão se estiver instável
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error || !session) {
                // Se não há sessão, o SDK já tentou renovar via autoRefreshToken e falhou.
                // ⚠️ NÃO chamar refreshSession() aqui — causa race condition e invalida o token.
                // Fazemos logout silencioso: o usuário precisará logar novamente.
                const localUser = localStorage.getItem(STORAGE_KEYS.SESSION);
                if (!localUser && !error) return; // Modo offline sem sessão — normal

                console.log('[TechContext] 💤 Sessão expirada ou ausente. Limpando ambiente.');
                logoutRef.current?.();
                return;
            }

            // Sessão válida (ou recuperada) - refresh dados
            console.log('[TechContext] ✅ Sessão OK, sincronizando...');
            await refreshData({ silent: true });

            // ✅ Only show "restored" message if we were actually offline
            if (!silent && wasOfflineRef.current) {
                setToast({ message: 'Conexão restaurada', type: 'success' });
                setTimeout(() => setToast(null), 3000);
                wasOfflineRef.current = false; // Reset flag
            }

        } catch (e) {
            console.error('[TechContext] ❌ Erro ao revalidar sessão:', e);
        }
    }, [auth.user?.id, auth.user?.tenantId, refreshData]);

    // 🔥 LIFECYCLE MANAGEMENT (visibilitychange + Focus)
    useEffect(() => {
        const handleResume = () => {
            if (document.visibilityState === 'visible' && auth.isAuthenticated) {
                console.log('[TechContext] 👁️ App Visible/Focused - Triggering Hydration');

                // 🌀 Invalida cache local no retorno
                DataService.forceGlobalRefresh();

                // 🛡️ CRITICAL: Last-mile verification for Tenant ID before any sync
                if (auth.user?.tenantId) {
                    const currentTenant = SessionStorage.get(STORAGE_KEYS.TENANT);
                    if (!currentTenant) {
                        SessionStorage.set(STORAGE_KEYS.TENANT, auth.user.tenantId);
                    }
                }

                revalidateSession(false);
            }
        };

        const handleOnline = () => {
            console.log('[TechContext] 📡 Conexão restaurada');
            setConnectivity(prev => ({ ...prev, isOnline: true }));

            // Only trigger revalidation if we were actually offline
            if (wasOfflineRef.current && auth.isAuthenticated) {
                revalidateSession(false); // Show toast because wasOfflineRef is true
            }
        };

        const handleOffline = () => {
            console.log('[TechContext] 📡 Sem conexão (modo offline)');
            setConnectivity(prev => ({ ...prev, isOnline: false }));
            wasOfflineRef.current = true; // Mark that we went offline
        };

        // Listeners múltiplos para garantir captura (iOS/Android behaviors)
        document.addEventListener('visibilitychange', handleResume);
        window.addEventListener('focus', handleResume);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Timer de segurança: Revalida a cada 5 min se estiver focado
        const intervalId = setInterval(() => {
            if (document.visibilityState === 'visible' && auth.isAuthenticated && navigator.onLine) {
                console.log('[TechContext] ⏰ Interval sync...');
                revalidateSession();
            }
        }, 5 * 60 * 1000);

        return () => {
            document.removeEventListener('visibilitychange', handleResume);
            window.removeEventListener('focus', handleResume);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(intervalId);
        };
    }, [auth.isAuthenticated, auth.user?.tenantId, revalidateSession]);



    // 🚪 AUTH ACTIONS
    const login = async (email: string, pass: string) => {
        const user = await DataService.login(email, pass);
        if (user && user.role === UserRole.TECHNICIAN) {
            localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
            if (user.tenantId) {
                localStorage.setItem(STORAGE_KEYS.TENANT, user.tenantId);
                SessionStorage.set(STORAGE_KEYS.TENANT, user.tenantId);
            }
            setAuth({ user, isAuthenticated: true });
            setConnectivity(prev => ({ ...prev, isSessionValid: true }));
        } else {
            throw new Error("Acesso negado. Apenas técnicos podem usar este App.");
        }
    };

    const logout = useCallback(async () => {
        // Store in ref for use in other callbacks without circular dependency
        try {
            await DataService.logout();
        } catch (e) {
            console.error('[TechContext] Erro ao fazer logout:', e);
        }

        setAuth({ user: null, isAuthenticated: false });
        setOrders([]);
        stopGPS();

        // Limpa todos os dados armazenados
        localStorage.removeItem(STORAGE_KEYS.SESSION);
        localStorage.removeItem(STORAGE_KEYS.CACHE);
        localStorage.removeItem(STORAGE_KEYS.CACHE_META);
        localStorage.removeItem(STORAGE_KEYS.LAST_SYNC);
        localStorage.removeItem(STORAGE_KEYS.TENANT);
        SessionStorage.remove(STORAGE_KEYS.TENANT);

        setConnectivity({ isOnline: navigator.onLine, isSessionValid: false, lastSync: null });
    }, [stopGPS]);

    // Update ref whenever logout changes
    useEffect(() => {
        logoutRef.current = logout;
    }, [logout]);

    // 🔐 SUPABASE AUTH SYNC (onAuthStateChange)
    useEffect(() => {
        let authListener: any = null;
        let isCancelled = false;

        const initAuth = async () => {
            const { supabase } = await import('../../../../lib/supabase');
            if (isCancelled) return;

            // Listen for auth changes (Recovery, Sign In, Sign Out)
            const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
                if (isCancelled) return;
                console.log(`[TechContext] 🔑 Auth Event: ${event}`);

                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                    if (session?.user && !auth.isAuthenticated) {
                        try {
                            const freshUser = await DataService.refreshUser();
                            if (freshUser && mountedRef.current) {
                                localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(freshUser));
                                if (freshUser.tenantId) {
                                    localStorage.setItem(STORAGE_KEYS.TENANT, freshUser.tenantId);
                                    SessionStorage.set(STORAGE_KEYS.TENANT, freshUser.tenantId);
                                }
                                setAuth({ user: freshUser, isAuthenticated: true });
                            }
                        } catch (e) {
                            console.error('[TechContext] Auth Sync Error:', e);
                        }
                    }
                } else if (event === 'SIGNED_OUT') {
                    if (auth.isAuthenticated) logout();
                }
            });

            authListener = data.subscription;
            // Handle edge case where it was cancelled while setting up
            if (isCancelled && authListener) {
                authListener.unsubscribe();
            }
        };

        if (mountedRef.current) initAuth();

        return () => {
            isCancelled = true;
            if (authListener) authListener.unsubscribe();
        };
    }, [auth.isAuthenticated, logout]);

    const updateOrderStatus = useCallback(async (id: string, status: OrderStatus, notes?: string, formData?: any, items?: any[]) => {
        try {
            await DataService.updateOrderStatus(id, status, notes, formData, items);
            if (mountedRef.current) {
                // Atualização Otimista local
                setOrders(prev => prev.map(o => o.id === id ? { ...o, status, notes, formData: { ...o.formData, ...formData }, items: items || o.items } : o));

                // Atualiza cache
                const updated = orders.map(o => o.id === id ? { ...o, status, notes, formData: { ...o.formData, ...formData }, items: items || o.items } : o);
                localStorage.setItem(STORAGE_KEYS.CACHE, JSON.stringify(updated));
            }
        } catch (e) {
            console.error("[Context-V2] Update Status Error:", e);
            throw e;
        }
    }, [orders]);

    // INICIALIZAÇÃO AO LOGAR
    useEffect(() => {
        if (auth.isAuthenticated && auth.user) {
            console.log('[TechContext] 🚀 Iniciando sistema...');
            startGPS();
            refreshData({ page: 1 });
        } else {
            stopGPS();
        }
    }, [auth.isAuthenticated]);

    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            stopGPS();
            if (syncTimeoutRef.current) {
                clearTimeout(syncTimeoutRef.current);
            }
        };
    }, [stopGPS]);

    return (
        <TechContext.Provider value={{
            auth,
            orders,
            isSyncing,
            gpsStatus,
            pagination,
            filters,
            connectivity,
            login,
            logout,
            refreshData,
            updateOrderStatus,
            toast,
            clearToast: () => setToast(null)
        }}>
            {children}
        </TechContext.Provider>
    );
};

export const useTech = () => {
    const context = useContext(TechContext);
    if (!context) throw new Error("useTech deve ser usado dentro de TechProvider");
    return context;
};
