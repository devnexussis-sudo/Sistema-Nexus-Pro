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
    const lastActivityRef = useRef<number>(GlobalStorage.get<number>('last_activity') || Date.now());
    const isMountedRef = useRef(true);

    // 🔒 Guard: evita validações simultâneas (FATAL-R1 fix)
    const isValidatingRef = useRef(false);
    // 🔒 Guard: debounce para handleFocus (FATAL-R2 fix)
    const focusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // 🚀 Public API (Defined early to avoid TDZ issues)
    const login = useCallback((user: User) => {
        setAuth({ user, isAuthenticated: true });
    }, []);

    const logout = useCallback(async () => {
        logger.info('[AuthContext] Iniciando logout completo...');

        // 1. Update React state immediately for UI responsiveness
        setAuth({ user: null, isAuthenticated: false });

        // 2. Clear both session and global storage
        SessionStorage.clear();
        GlobalStorage.remove('persistent_user');

        // 3. Clear all potential local auth keys (Supabase + Legacy)
        const authKeys = [
            'nexus_shared_auth', // Chave configurada no supabase.ts
            'supabase.auth.token',
            'nexus_tech_session_v2',
            'nexus_tech_cache_v2',
            'persistent_user'
        ];
        authKeys.forEach(key => {
            localStorage.removeItem(key);
            localStorage.removeItem(`nexus_global_${key}`);
            sessionStorage.removeItem(key);
        });

        // 4. Supabase SignOut (Garante invalidação no servidor)
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('[AuthContext] Error signing out from Supabase:', err);
        }
    }, []);

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
            // 🕒 Check: Inatividade de 24 horas (Big Tech Security Standard)
            const now = Date.now();
            const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
            const lastActivity = lastActivityRef.current;

            if (auth.isAuthenticated && (now - lastActivity > TWENTY_FOUR_HOURS)) {
                logger.warn('[AuthProvider] ⏰ Logout por inatividade (24h ultrapassadas).');
                // Use logout() instead of manual clear to ensure consistency
                await logout();
                window.location.reload();
                return;
            }

            // getSession() lê do cache local — sem chamada de rede, sem race condition.
            // O autoRefreshToken do SDK cuida da renovação quando necessário.
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error || !session) {
                // FATAL-FIX: Do not forcibly log out if the error is just a network fetch failure.
                // This prevents users from losing their session when waking the app from the background or offline.
                if (error && (error.message.includes('Failed to fetch') || error.message.includes('Network') || error.message.includes('network'))) {
                    console.warn('[AuthProvider] ⚠️ Network error fetching session (offline/background). Preserving local Auth state.');
                    return;
                }

                // Se não há sessão no Supabase e não é erro de rede, deve ser token revogado/expirado.
                console.warn('[AuthProvider] 🗝️ Sessão não encontrada ou token expirado/inválido. Limpando estado local.');
                if (isMountedRef.current) {
                    setAuth({ user: null, isAuthenticated: false });
                }
                SessionStorage.remove('user');
                GlobalStorage.remove('persistent_user');

                if (error) {
                    console.error('[AuthProvider] Erro de sessão detectado:', error.message);
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
    }, [auth.isAuthenticated, logout]);

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
            // 🛡️ Rotas críticas que NÃO devem disparar validação automática ou Heartbeat
            const isIgnored =
                window.location.hash.startsWith('#/view/') ||
                window.location.hash.startsWith('#/view-quote/') ||
                window.location.hash.includes('reset-password');

            if (isIgnored) {
                logger.info('[AuthProvider] Rota protegida detectada. Pulando validação automática.');
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
                    const refreshedUser = await DataService.refreshUser().catch(() => null);

                    if (refreshedUser && isMountedRef.current) {
                        setAuth({ user: refreshedUser, isAuthenticated: true });
                    } else if (event === 'SIGNED_IN') {
                        // 🛑 ACESSO NEGADO: Autenticado no Provider (Google), mas sem registro no Nexus.
                        logger.error('[AuthContext] Usuário não autorizado no sistema. Forçando logout.');
                        await supabase.auth.signOut().catch(() => { });
                        if (isMountedRef.current) {
                            setAuth({ user: null, isAuthenticated: false });
                        }
                        // Opcional: alert ou redirect com erro.
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

        // ⏰ Periodic Inactivity Check (Big Tech Resilience)
        const inactivityInterval = setInterval(() => {
            if (auth.isAuthenticated) {
                validateAndRestoreSession(true);
            }
        }, 60000); // Every 60 seconds

        // 🖱️ Activity Tracking
        const updateActivity = () => {
            const now = Date.now();
            // Throttle activity updates to every 30 seconds to save performance
            if (now - lastActivityRef.current > 30000) {
                lastActivityRef.current = now;
                GlobalStorage.set('last_activity', now);
            }
        };

        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
        activityEvents.forEach(event => window.addEventListener(event, updateActivity, { passive: true }));

        window.addEventListener('focus', handleFocus);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        initAuth();

        return () => {
            isMountedRef.current = false;
            clearTimeout(timeoutId);
            clearInterval(inactivityInterval);
            if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);
            activityEvents.forEach(event => window.removeEventListener(event, updateActivity));
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (authSubscriptionRef.current?.unsubscribe) authSubscriptionRef.current.unsubscribe();
        };
    }, [auth.isAuthenticated, validateAndRestoreSession]); // eslint-disable-line react-hooks/exhaustive-deps — auth.isAuthenticated lido via closure estável

    // O Inactivity Check de 1.5h foi INTENCIONALMENTE REMOVIDO aqui (FATAL-PWA).
    // Antes, deslogava forçadamente o usuário se fechasse a tab por mais de 1.5 horas.



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
