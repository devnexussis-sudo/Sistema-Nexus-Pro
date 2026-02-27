// ============================================================
// src/contexts/AuthContext.tsx
// 🛡️ NEXUS LINE — Authentication Context
// Padrão: Big Tech / Clean Architecture
//
// REGRAS DE GOVERNANÇA:
//  ✅ Não chama refreshSession() manualmente (race condition fatal)
//  ✅ Delegates refresh para o SDK via autoRefreshToken
//  ✅ Um único useEffect de setup — deps estabilizadas via useRef
//  ✅ Mutex isValidatingRef para evitar chamadas simultâneas
//  ✅ Escuta visibilitychange (PWA/mobile) + focus (desktop fallback)
//  ✅ Responde ao evento NEXUS_RECOVERY_COMPLETE da camada de infra
//  ✅ Logout defensivo apenas em falhas reais — erros de rede preservam estado
// ============================================================

import React, {
    createContext,
    useContext,
    useState,
    useEffect,
    useCallback,
    useRef,
} from 'react';
import { AuthState, User } from '../types';
import { DataService } from '../services/dataService';
import SessionStorage, { GlobalStorage } from '../lib/sessionStorage';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------
// Context Types
// ---------------------------------------------------------------
interface AuthContextType {
    auth: AuthState;
    setAuth: React.Dispatch<React.SetStateAction<AuthState>>;
    isInitializing: boolean;
    login: (user: User) => void;
    logout: () => Promise<void>;
    refreshUser: () => Promise<User | undefined>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ---------------------------------------------------------------
// AuthProvider
// ---------------------------------------------------------------
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // ── Estado ──────────────────────────────────────────────────
    const [auth, setAuth] = useState<AuthState>(() => {
        const stored = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
        return stored
            ? { user: stored, isAuthenticated: true }
            : { user: null, isAuthenticated: false };
    });

    const [isInitializing, setIsInitializing] = useState(true);

    // ── Refs (estáveis entre renders — não disparam re-criação de efeitos) ──
    const isMountedRef = useRef(true);
    const authSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);
    const isValidatingRef = useRef(false);               // Mutex: evita validações simultâneas
    const focusDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wasOfflineRef = useRef(false);
    const lastActivityRef = useRef<number>(
        GlobalStorage.get<number>('last_activity') || Date.now()
    );
    // Ref para auth.isAuthenticated — lido nos handlers sem criar nova closure
    const isAuthenticatedRef = useRef(auth.isAuthenticated);
    useEffect(() => {
        isAuthenticatedRef.current = auth.isAuthenticated;
    }, [auth.isAuthenticated]);

    // ── Login ────────────────────────────────────────────────────
    const login = useCallback((user: User) => {
        setAuth({ user, isAuthenticated: true });
    }, []);

    // ── Logout ───────────────────────────────────────────────────
    // useCallback sem deps voláteis — estável entre renders
    const logout = useCallback(async () => {
        logger.info('[AuthContext] Iniciando logout...');

        setAuth({ user: null, isAuthenticated: false });
        SessionStorage.clear();
        GlobalStorage.remove('persistent_user');

        const authKeys = [
            'nexus_shared_auth',
            'supabase.auth.token',
            'nexus_tech_session_v2',
            'nexus_tech_cache_v2',
            'persistent_user',
        ];
        authKeys.forEach(key => {
            localStorage.removeItem(key);
            localStorage.removeItem(`nexus_global_${key}`);
            sessionStorage.removeItem(key);
        });

        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('[AuthContext] Erro no signOut:', err);
        }
    }, []);

    // Ref estável para logout — usada dentro de closures sem criar deps
    const logoutRef = useRef(logout);
    useEffect(() => { logoutRef.current = logout; }, [logout]);

    // ── validateAndRestoreSession ────────────────────────────────
    // ⚠️ REGRA CRÍTICA: NÃO chama supabase.auth.refreshSession() manualmente.
    // O SDK com autoRefreshToken:true emite TOKEN_REFRESHED via onAuthStateChange
    // quando necessário. Refresh manual causa race condition e invalida o token.
    //
    // Esta função apenas lê a sessão do cache local (sem chamada de rede) e
    // atualiza o estado React com os dados mais recentes do usuário no banco.
    const validateAndRestoreSession = useCallback(async (silent = true): Promise<void> => {
        if (isValidatingRef.current) {
            logger.info('[AuthContext] Validação já em andamento — ignorando chamada paralela.');
            return;
        }
        isValidatingRef.current = true;

        try {
            // 🕒 Logout por inatividade real de 24h (Big Tech Security)
            const now = Date.now();
            const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
            if (isAuthenticatedRef.current && (now - lastActivityRef.current > TWENTY_FOUR_HOURS_MS)) {
                logger.warn('[AuthContext] ⏰ Inatividade de 24h — logout seguro.');
                await logoutRef.current();
                window.location.reload();
                return;
            }

            // getSession() lê do cache do SDK — sem chamada de rede primária.
            // Se o token estiver próximo do vencimento, o autoRefreshToken dispara
            // a renovação em background. Não interferimos nesse processo.
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error) {
                const isNetworkError =
                    error.message.includes('Failed to fetch') ||
                    error.message.includes('Network') ||
                    error.message.includes('network');

                if (isNetworkError) {
                    console.warn('[AuthContext] ⚠️ Erro de rede ao verificar sessão. Estado local preservado.');
                    return; // Não desloga por erro de rede — pode ser queda temporária
                }

                console.error('[AuthContext] ❌ Erro de sessão:', error.message);
                if (isMountedRef.current) {
                    setAuth({ user: null, isAuthenticated: false });
                    SessionStorage.remove('user');
                    GlobalStorage.remove('persistent_user');
                }
                return;
            }

            if (!session) {
                console.warn('[AuthContext] 🗝️ Sem sessão ativa. Limpando estado.');
                if (isMountedRef.current) {
                    setAuth({ user: null, isAuthenticated: false });
                    SessionStorage.remove('user');
                    GlobalStorage.remove('persistent_user');
                }
                return;
            }

            // ✅ Sessão válida — atualiza dados do perfil
            const refreshedUser = await DataService.refreshUser().catch(() => null);
            if (refreshedUser && isMountedRef.current) {
                setAuth({ user: refreshedUser, isAuthenticated: true });
                if (!silent && wasOfflineRef.current) {
                    wasOfflineRef.current = false;
                    logger.info('[AuthContext] ✅ Sessão restaurada após período offline.');
                }
            }
        } catch (err: unknown) {
            const error = err as Error;
            // Erros de Lock são esperados em abas concorrentes — não são fatais
            if (error?.name === 'AbortError' || error?.message?.includes('Lock')) {
                setTimeout(() => validateAndRestoreSession(true), 5_000);
            } else {
                console.error('[AuthContext] 💥 Erro inesperado na validação:', err);
            }
        } finally {
            isValidatingRef.current = false;
        }
    }, []); // ✅ DEPS VAZIAS: toda a lógica usa refs — re-cria apenas uma vez

    // Ref estável para validateAndRestoreSession
    const validateRef = useRef(validateAndRestoreSession);
    useEffect(() => { validateRef.current = validateAndRestoreSession; }, [validateAndRestoreSession]);

    // ── Setup Principal (um único useEffect com deps estáveis) ───
    useEffect(() => {
        isMountedRef.current = true;

        // Safety timeout: libera a UI se a inicialização travar por qualquer motivo
        const initTimeoutId = setTimeout(() => {
            setIsInitializing(prev => {
                if (prev) {
                    console.warn('[AuthContext] ⚠️ Init Timeout — liberando UI.');
                    return false;
                }
                return prev;
            });
        }, 3_000);

        // ── Inicialização ────────────────────────────────────────
        const initAuth = async () => {
            // Rotas públicas não precisam de validação de sessão
            const isPublicRoute =
                window.location.hash.startsWith('#/view/') ||
                window.location.hash.startsWith('#/view-quote/') ||
                window.location.hash.includes('reset-password');

            if (isPublicRoute) {
                logger.info('[AuthContext] Rota pública detectada. Pulando validação.');
                if (isMountedRef.current) setIsInitializing(false);
                return;
            }

            await validateRef.current(true);
            if (isMountedRef.current) setIsInitializing(false);

            // 🔔 Listener oficial do SDK para mudanças de autenticação.
            // TOKEN_REFRESHED é emitido automaticamente pelo autoRefreshToken — não forçar.
            const { data: { subscription } } = supabase.auth.onAuthStateChange(
                async (event, session) => {
                    if (!isMountedRef.current) return;
                    logger.info(`[AuthContext] Auth Event: ${event}`);

                    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
                        const refreshedUser = await DataService.refreshUser().catch(() => null);

                        if (refreshedUser && isMountedRef.current) {
                            setAuth({ user: refreshedUser, isAuthenticated: true });
                        } else if (event === 'SIGNED_IN') {
                            // Usuário autenticado no Provider mas não registrado no Nexus
                            logger.error('[AuthContext] 🛑 Usuário não autorizado no sistema.');
                            await supabase.auth.signOut().catch(() => { });
                            if (isMountedRef.current) {
                                setAuth({ user: null, isAuthenticated: false });
                            }
                        }
                    } else if (event === 'SIGNED_OUT') {
                        if (isMountedRef.current) setAuth({ user: null, isAuthenticated: false });
                        SessionStorage.clear();
                    }

                    if (isMountedRef.current) setIsInitializing(false);
                }
            );

            authSubscriptionRef.current = subscription;
        };

        // ── Handler de Recovery (debounced) ─────────────────────
        // Chamado quando o browser/SO devolve o controle para a aba (visibilitychange,
        // focus) ou quando a rede é restaurada. Não chama refreshSession() — apenas
        // re-valida via getSession() e atualiza o perfil.
        const handleRecovery = (source: string) => {
            if (!isAuthenticatedRef.current) return;

            if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);

            focusDebounceRef.current = setTimeout(async () => {
                logger.info(`[AuthContext] Recovery trigger: ${source}`);
                await validateRef.current(true);
                // Invalida cache de queries para forçar re-fetch de dados
                DataService.forceGlobalRefresh?.();
                window.dispatchEvent(new CustomEvent('NEXUS_QUERY_INVALIDATE', { detail: { key: '*' } }));
            }, 500); // Debounce 500ms: ignora disparos múltiplos do mesmo evento
        };

        // ── Handlers específicos por evento ──────────────────────
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                handleRecovery('visibilitychange'); // Principal: cobre PWA + Safari Mobile
            }
        };

        const handleWindowFocus = () => {
            handleRecovery('window.focus'); // Fallback: Desktop browsers
        };

        const handleOnline = () => {
            wasOfflineRef.current = false;
            if (isAuthenticatedRef.current) validateRef.current(false);
        };

        const handleOffline = () => {
            wasOfflineRef.current = true;
        };

        // ── Listener do evento de recovery da camada de infra ────
        // O supabaseClient.ts dispara NEXUS_RECOVERY_COMPLETE após reconectar.
        // Aqui apenas sincronizamos o estado React com o que a infra já fez.
        const handleInfraRecovery = (e: Event) => {
            const detail = (e as CustomEvent).detail as { hasSession: boolean; source: string };
            logger.info(`[AuthContext] NEXUS_RECOVERY_COMPLETE recebido — source: ${detail?.source}, hasSession: ${detail?.hasSession}`);
            if (detail?.hasSession && isAuthenticatedRef.current) {
                // Atualiza dados do perfil silenciosamente
                DataService.refreshUser()
                    .then(user => {
                        if (user && isMountedRef.current) {
                            setAuth({ user, isAuthenticated: true });
                        }
                    })
                    .catch(() => { /* Silencioso: não crítico */ });
            }
        };

        // ── Rastreamento de Atividade (throttled a 30s) ──────────
        const updateActivity = () => {
            const now = Date.now();
            if (now - lastActivityRef.current > 30_000) {
                lastActivityRef.current = now;
                GlobalStorage.set('last_activity', now);
            }
        };
        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'] as const;

        // ── Verificação periódica de sessão (60s) ────────────────
        // Apenas lê do cache local. O autoRefreshToken cuida da renovação.
        const inactivityIntervalId = setInterval(() => {
            if (isAuthenticatedRef.current) validateRef.current(true);
        }, 60_000);

        // ── Registro de Listeners ────────────────────────────────
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleWindowFocus);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('NEXUS_RECOVERY_COMPLETE', handleInfraRecovery);
        activityEvents.forEach(evt => window.addEventListener(evt, updateActivity, { passive: true }));

        initAuth();

        // ── Cleanup ─────────────────────────────────────────────
        return () => {
            isMountedRef.current = false;
            clearTimeout(initTimeoutId);
            clearInterval(inactivityIntervalId);
            if (focusDebounceRef.current) clearTimeout(focusDebounceRef.current);

            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleWindowFocus);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('NEXUS_RECOVERY_COMPLETE', handleInfraRecovery);
            activityEvents.forEach(evt => window.removeEventListener(evt, updateActivity));

            authSubscriptionRef.current?.unsubscribe();
        };
    }, []); // ✅ DEPS VAZIAS: toda mutabilidade gerenciada via refs — efeito roda uma única vez

    // ── refreshUser (API pública) ────────────────────────────────
    const refreshUser = async (): Promise<User | undefined> => {
        const user = await DataService.refreshUser();
        if (user && isMountedRef.current) setAuth({ user, isAuthenticated: true });
        return user;
    };

    return (
        <AuthContext.Provider value={{ auth, setAuth, isInitializing, login, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};

// ── Hook de Consumo ──────────────────────────────────────────────
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('[Nexus] useAuth deve ser usado dentro de um AuthProvider.');
    }
    return context;
};
