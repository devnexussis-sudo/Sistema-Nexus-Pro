import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AuthState, User } from '../types';
import { DataService } from '../services/dataService';
import SessionStorage, { GlobalStorage } from '../lib/sessionStorage';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

interface AuthContextType {
    auth: AuthState;
    setAuth: React.Dispatch<React.SetStateAction<AuthState>>;
    isInitializing: boolean;
    login: (user: User) => void;
    logout: () => void;
    refreshUser: () => Promise<User | undefined>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [auth, setAuth] = useState<AuthState>(() => {
        const stored = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
        return stored ? { user: stored, isAuthenticated: true } : { user: null, isAuthenticated: false };
    });

    const [isInitializing, setIsInitializing] = useState(true);
    const authSubscriptionRef = useRef<any>(null);
    const wasOfflineRef = useRef(false);
    const lastActivityRef = useRef(Date.now());
    const isMountedRef = useRef(true);

    // 🔒 Guard: evita validações simultâneas (FATAL-R1 fix)
    const isValidatingRef = useRef(false);
    // 🔒 Guard: debounce para handleFocus (FATAL-R2 fix)
    const focusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /**
     * validateAndRestoreSession
     *
     * ⚠️ REGRA CRÍTICA: NÃO chama supabase.auth.refreshSession() manualmente.
     * O SDK já tem autoRefreshToken: true — refresh manual causa race condition
     * que invalida o refresh token e gera o erro "Invalid Refresh Token".
     *
     * Apenas verifica se a sessão existe via getSession() (leitura do cache local,
     * sem chamada de rede). Se não existir, limpa o estado.
     */
    const validateAndRestoreSession = useCallback(async (silent = true) => {
        // 🛡️ Mutex: evita execuções simultâneas
        if (isValidatingRef.current) {
            logger.info('[AuthProvider] Validação já em andamento, ignorando chamada duplicada.');
            return;
        }
        isValidatingRef.current = true;

        try {
            // getSession() lê do cache local — sem chamada de rede, sem race condition.
            // O autoRefreshToken do SDK cuida da renovação quando necessário.
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error || !session) {
                const localUser = SessionStorage.get('user') || GlobalStorage.get('persistent_user');

                // Se não há sessão mas há usuário local, pode ser modo offline/impersonation
                if (!localUser) {
                    if (isMountedRef.current) setAuth({ user: null, isAuthenticated: false });
                }
                // Se há erro real (não apenas ausência de sessão), limpa tudo
                if (error) {
                    console.warn('[AuthProvider] 🗝️ Erro de sessão. Realizando limpeza de segurança.', error.message);
                    if (isMountedRef.current) {
                        setAuth({ user: null, isAuthenticated: false });
                        SessionStorage.clear();
                    }
                }
                return;
            }

            // ✅ Sessão válida — atualiza dados do usuário
            // Não verificamos expires_at nem chamamos refreshSession() manualmente.
            // O SDK emitirá TOKEN_REFRESHED via onAuthStateChange quando renovar.
            const refreshedUser = await DataService.refreshUser().catch(() => null);
            if (refreshedUser && isMountedRef.current) {
                setAuth({ user: refreshedUser, isAuthenticated: true });
                if (!silent && wasOfflineRef.current) {
                    wasOfflineRef.current = false;
                    logger.info('Session restored after offline period');
                }
            }
        } catch (err: any) {
            // Erros de Lock são normais em tabs concorrentes — retry com backoff
            if (err?.name === 'AbortError' || err?.message?.includes('Lock')) {
                setTimeout(() => validateAndRestoreSession(true), 5000);
            } else {
                console.error('[AuthProvider] ❌ Erro inesperado na validação de sessão:', err);
            }
        } finally {
            isValidatingRef.current = false;
        }
    }, []);

    // 2. Setup Listeners
    useEffect(() => {
        isMountedRef.current = true;

        // Safety timeout: se init demorar mais de 3s, libera a UI
        const timeoutId = setTimeout(() => {
            setIsInitializing(prev => {
                if (prev) {
                    console.warn('[AuthProvider] ⚠️ Init Timeout - liberando interface.');
                    return false;
                }
                return prev;
            });
        }, 3000);

        const initAuth = async () => {
            // Rotas públicas não precisam de sessão
            const isPublic = window.location.hash.startsWith('#/view/') || window.location.hash.startsWith('#/view-quote/');
            if (isPublic) {
                logger.info('Rota Pública detectada. Ignorando Heartbeat de sessão.');
                setIsInitializing(false);
                return;
            }

            await validateAndRestoreSession(true);
            if (isMountedRef.current) setIsInitializing(false);

            // 🔔 Supabase Auth State Listener
            // Este é o canal OFICIAL para reagir a mudanças de sessão.
            // TOKEN_REFRESHED é emitido automaticamente pelo SDK — não precisamos forçar.
            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                if (!isMountedRef.current) return;
                console.log(`[AuthProvider] Auth Event: ${event}`);

                if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
                    // TOKEN_REFRESHED: SDK renovou o token automaticamente — apenas atualiza o estado
                    const refreshedUser = await DataService.refreshUser().catch(() => null);
                    if (refreshedUser && isMountedRef.current) {
                        setAuth({ user: refreshedUser, isAuthenticated: true });
                    }
                } else if (event === 'SIGNED_OUT') {
                    if (isMountedRef.current) setAuth({ user: null, isAuthenticated: false });
                    SessionStorage.clear();
                }
                if (isMountedRef.current) setIsInitializing(false);
            });

            authSubscriptionRef.current = subscription;
        };

        /**
         * handleFocus — FATAL-R2 fix
         *
         * Problemas anteriores:
         * 1. Chamava validateAndRestoreSession() DUAS vezes (uma condicional + uma incondicional)
         * 2. Sem debounce: alt+tab rápido disparava múltiplas validações simultâneas
         *
         * Solução:
         * - Uma única chamada, com debounce de 500ms
         * - O mutex isValidatingRef garante que chamadas simultâneas são ignoradas
         */
        const handleFocus = () => {
            if (!auth.isAuthenticated) return;

            // Debounce: cancela chamada anterior se o foco mudou muito rápido
            if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);

            focusDebounceRef.current = setTimeout(async () => {
                await validateAndRestoreSession(true);
                DataService.forceGlobalRefresh();
                window.dispatchEvent(new CustomEvent('NEXUS_QUERY_INVALIDATE', { detail: { key: '*' } }));
            }, 500);
        };

        const handleOnline = () => {
            if (auth.isAuthenticated) validateAndRestoreSession(false);
        };
        const handleOffline = () => { wasOfflineRef.current = true; };

        window.addEventListener('focus', handleFocus);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        initAuth();

        return () => {
            isMountedRef.current = false;
            clearTimeout(timeoutId);
            if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (authSubscriptionRef.current?.unsubscribe) authSubscriptionRef.current.unsubscribe();
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps — auth.isAuthenticated lido via closure estável

    // 3. Inactivity Check — desconecta após 1.5h sem interação
    useEffect(() => {
        const updateActivity = () => { lastActivityRef.current = Date.now(); };
        const checkInactivity = setInterval(() => {
            const ONE_HOUR_THIRTY = 1.5 * 60 * 60 * 1000;
            if (auth.isAuthenticated && Date.now() - lastActivityRef.current > ONE_HOUR_THIRTY) {
                console.info('[AuthProvider] Sessão expirada por inatividade.');
                setAuth({ user: null, isAuthenticated: false });
                SessionStorage.clear();
                localStorage.removeItem('nexus_tech_session_v2');
                window.location.reload();
            }
        }, 60000);

        const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
        events.forEach(e => window.addEventListener(e, updateActivity, { passive: true }));

        return () => {
            clearInterval(checkInactivity);
            events.forEach(e => window.removeEventListener(e, updateActivity));
        };
    }, [auth.isAuthenticated]);

    // Public API
    const login = (user: User) => {
        setAuth({ user, isAuthenticated: true });
    };

    const logout = useCallback(async () => {
        // 1. Update React state immediately for UI responsiveness
        setAuth({ user: null, isAuthenticated: false });

        // 2. Clear both session and global storage
        SessionStorage.clear();
        GlobalStorage.remove('persistent_user');

        // 3. Clear legacy/tech specific keys
        localStorage.removeItem('nexus_tech_session_v2');
        localStorage.removeItem('nexus_tech_cache_v2');

        // 4. Supabase SignOut
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('[AuthContext] Error signing out from Supabase:', err);
        }
    }, []);

    const refreshUser = async () => {
        const user = await DataService.refreshUser();
        if (user) setAuth({ user, isAuthenticated: true });
        return user;
    };

    return (
        <AuthContext.Provider value={{ auth, setAuth, isInitializing, login, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};

// Hook fácil de usar
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};
