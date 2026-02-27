// ============================================================
// src/contexts/AuthContext.tsx
// 🛡️ NEXUS LINE — Authentication Context v3.0
// Padrão: Big Tech / Clean Architecture / Zero Gambiarra
//
// GOVERNANÇA (.cursorrules):
//  ✅ ZERO refreshSession() manual — race condition fatal
//  ✅ Único useEffect de setup — deps estabilizadas via useRef
//  ✅ isValidatingRef com reset garantido no finally (nunca fica preso)
//  ✅ Logout automático após 12h de inatividade (requisito de produto)
//  ✅ Listeners: visibilitychange (principal) + focus + online
//  ✅ Resposta ao NEXUS_RECOVERY_COMPLETE da camada de infra
//  ✅ Erros de rede NÃO geram logout — só falhas reais de sessão
//  ✅ Interval de heartbeat a cada 2 minutos (lightweight check local)
//  ✅ Cleanup completo no unmount — sem memory leaks
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
// Constantes de Sessão
// ---------------------------------------------------------------
const INACTIVITY_LOGOUT_MS = 12 * 60 * 60 * 1000;   // 12 horas (requisito de produto)
const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;          // 2 minutos (era 60s — reduz network noise)
const ACTIVITY_THROTTLE_MS = 30_000;                  // 30 segundos por update de atividade
const RECOVERY_DEBOUNCE_MS = 500;                     // Debounce de recovery

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

    // ── Refs — estáveis entre renders, não causam re-criação de effects ──
    const isMountedRef = useRef(true);
    const authSubscriptionRef = useRef<{ unsubscribe: () => void } | null>(null);

    /**
     * isValidatingRef: mutex para evitar validações de sessão simultâneas.
     * CRÍTICO: sempre deve ser resetado no finally — nunca pode ficar true
     * permanentemente pois travaria todas as futuras validações.
     */
    const isValidatingRef = useRef(false);

    const recoveryDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wasOfflineRef = useRef(false);

    /**
     * lastActivityRef: timestamp da última interação do usuário.
     * Persiste no GlobalStorage para sobreviver a reloads.
     */
    const lastActivityRef = useRef<number>(
        GlobalStorage.get<number>('last_activity') || Date.now()
    );

    /**
     * isAuthenticatedRef: snapshot de auth.isAuthenticated para leitura
     * segura em closures/handlers sem criar dependência no useEffect.
     */
    const isAuthenticatedRef = useRef(auth.isAuthenticated);
    useEffect(() => {
        isAuthenticatedRef.current = auth.isAuthenticated;
    }, [auth.isAuthenticated]);

    // ── Login ────────────────────────────────────────────────────
    const login = useCallback((user: User) => {
        lastActivityRef.current = Date.now();
        GlobalStorage.set('last_activity', lastActivityRef.current);
        setAuth({ user, isAuthenticated: true });
    }, []);

    // ── Logout ───────────────────────────────────────────────────
    /**
     * IMPORTANTE: useCallback sem deps voláteis → função estável entre renders.
     * Usado via logoutRef.current em closures para evitar dependências circulares.
     */
    const logout = useCallback(async () => {
        logger.info('[Auth] Iniciando logout...');

        // Limpa estado React imediatamente (UI responde rápido)
        setAuth({ user: null, isAuthenticated: false });

        // Limpa storages
        SessionStorage.clear();
        GlobalStorage.remove('persistent_user');
        GlobalStorage.remove('last_activity');

        const authKeys = [
            'nexus_shared_auth',
            'supabase.auth.token',
            'nexus_tech_session_v2',
            'nexus_tech_cache_v2',
            'persistent_user',
            'last_activity',
        ];
        authKeys.forEach(key => {
            try { localStorage.removeItem(key); } catch { /* noop */ }
            try { localStorage.removeItem(`nexus_global_${key}`); } catch { /* noop */ }
            try { sessionStorage.removeItem(key); } catch { /* noop */ }
        });

        // signOut do Supabase (invalida token no servidor)
        try {
            await supabase.auth.signOut();
            logger.info('[Auth] ✅ signOut concluído.');
        } catch (err) {
            // signOut falhou (rede offline etc.) — estado local já foi limpo
            console.error('[Auth] signOut error (não crítico — estado local limpo):', err);
        }
    }, []);

    const logoutRef = useRef(logout);
    useEffect(() => { logoutRef.current = logout; }, [logout]);

    // ── validateAndRestoreSession ────────────────────────────────
    /**
     * Valida a sessão atual e sincroniza o estado React.
     *
     * REGRAS CRÍTICAS:
     *  1. NÃO chama supabase.auth.refreshSession() manualmente.
     *     Causa race condition e invalida o refresh token.
     *  2. getSession() lê do cache local do SDK.
     *     Se o token estiver próximo do vencimento, o autoRefreshToken
     *     dispara a renovação em background. Não interferimos.
     *  3. isValidatingRef SEMPRE é resetado no finally.
     *     Se ficar true permanentemente, trava o sistema.
     *  4. Erros de rede NÃO geram logout.
     *     Apenas ausência real de sessão gera logout.
     */
    const validateAndRestoreSession = useCallback(async (silent = true): Promise<void> => {
        // Mutex: evita validações simultâneas
        if (isValidatingRef.current) {
            logger.info('[Auth] Validação já em andamento — ignorada.');
            return;
        }
        isValidatingRef.current = true; // ← SEMPRE resetado no finally

        try {
            // ── Verificação de Inatividade (12h) ────────────────
            const now = Date.now();
            if (isAuthenticatedRef.current && (now - lastActivityRef.current > INACTIVITY_LOGOUT_MS)) {
                logger.warn(`[Auth] ⏰ Inatividade de 12h detectada — logout automático.`);
                isValidatingRef.current = false; // Reset antes do logout (que pode ser async longo)
                await logoutRef.current();
                window.location.reload();
                return;
            }

            // ── Leitura de Sessão (cache local, sem rede primária) ──
            const { data: { session }, error } = await supabase.auth.getSession();

            if (error) {
                // Classifica o erro antes de agir
                const isNetworkError =
                    error.message.includes('Failed to fetch') ||
                    error.message.includes('NetworkError') ||
                    error.message.includes('network') ||
                    (typeof navigator !== 'undefined' && !navigator.onLine);

                if (isNetworkError) {
                    // Rede fora — preserva estado local, SDK vai retry
                    logger.warn('[Auth] ⚠️ Erro de rede em getSession — estado preservado.');
                    return;
                }

                // Erro real de sessão (token inválido, revogado, etc.)
                logger.error('[Auth] ❌ Sessão inválida:', error.message);
                if (isMountedRef.current) {
                    setAuth({ user: null, isAuthenticated: false });
                    SessionStorage.remove('user');
                    GlobalStorage.remove('persistent_user');
                }
                return;
            }

            if (!session) {
                // Sem sessão — limpa estado se estava autenticado
                if (isAuthenticatedRef.current) {
                    logger.warn('[Auth] 🗝️ Sem sessão ativa — limpando estado.');
                    if (isMountedRef.current) {
                        setAuth({ user: null, isAuthenticated: false });
                        SessionStorage.remove('user');
                        GlobalStorage.remove('persistent_user');
                    }
                }
                return;
            }

            // ── Sessão válida — atualiza perfil do usuário ───────
            const refreshedUser = await DataService.refreshUser().catch(err => {
                logger.warn('[Auth] refreshUser falhou (não crítico):', err?.message);
                return null;
            });

            if (refreshedUser && isMountedRef.current) {
                setAuth({ user: refreshedUser, isAuthenticated: true });
                if (!silent && wasOfflineRef.current) {
                    wasOfflineRef.current = false;
                    logger.info('[Auth] ✅ Sessão restaurada após período offline.');
                }
            }

        } catch (err: unknown) {
            const error = err as Error;
            // Erros de Lock (abas concorrentes) são esperados — retry com backoff
            if (error?.name === 'AbortError' || error?.message?.includes('Lock')) {
                logger.warn('[Auth] Lock concorrente detectado — retry em 5s.');
                setTimeout(() => validateRef.current(true), 5_000);
            } else {
                console.error('[Auth] 💥 Erro inesperado na validação:', err);
            }
        } finally {
            // ⚠️ CRÍTICO: SEMPRE reseta o mutex — nunca pode ficar preso
            isValidatingRef.current = false;
        }
    }, []); // ✅ deps vazias: toda lógica usa refs

    const validateRef = useRef(validateAndRestoreSession);
    useEffect(() => { validateRef.current = validateAndRestoreSession; }, [validateAndRestoreSession]);

    // ── Setup Principal ──────────────────────────────────────────
    useEffect(() => {
        isMountedRef.current = true;

        // Safety net: libera a UI se a inicialização travar
        const initTimeoutId = setTimeout(() => {
            setIsInitializing(prev => {
                if (prev) {
                    logger.warn('[Auth] ⚠️ Init timeout (3s) — liberando UI.');
                    return false;
                }
                return prev;
            });
        }, 3_000);

        // ── Inicialização ────────────────────────────────────────
        const initAuth = async () => {
            // Rotas públicas não requerem sessão
            const hash = window.location.hash || '';
            const isPublicRoute =
                hash.startsWith('#/view/') ||
                hash.startsWith('#/view-quote/') ||
                hash.includes('reset-password');

            if (isPublicRoute) {
                logger.info('[Auth] Rota pública — skip validação.');
                if (isMountedRef.current) setIsInitializing(false);
                return;
            }

            // Valida sessão na inicialização
            await validateRef.current(true);
            if (isMountedRef.current) setIsInitializing(false);

            // ── Listener oficial do SDK (onAuthStateChange) ──────
            // TOKEN_REFRESHED é emitido pelo autoRefreshToken automaticamente.
            // SIGNED_IN: login bem-sucedido ou restore de sessão.
            // SIGNED_OUT: signOut() ou token revogado.
            const { data: { subscription } } = supabase.auth.onAuthStateChange(
                async (event, session) => {
                    if (!isMountedRef.current) return;
                    logger.info(`[Auth] SDK Event: ${event}`);

                    if (event === 'TOKEN_REFRESHED' && session?.user) {
                        // Token renovado — atualiza perfil silenciosamente
                        const user = await DataService.refreshUser().catch(() => null);
                        if (user && isMountedRef.current) {
                            setAuth({ user, isAuthenticated: true });
                        }
                        return;
                    }

                    if (event === 'SIGNED_IN' && session?.user) {
                        const user = await DataService.refreshUser().catch(() => null);
                        if (user && isMountedRef.current) {
                            setAuth({ user, isAuthenticated: true });
                            lastActivityRef.current = Date.now();
                            GlobalStorage.set('last_activity', lastActivityRef.current);
                        } else if (!user) {
                            // Autenticado no Supabase mas não cadastrado no Nexus
                            logger.error('[Auth] 🛑 Usuário não autorizado no sistema Nexus.');
                            await supabase.auth.signOut().catch(() => { });
                            if (isMountedRef.current) setAuth({ user: null, isAuthenticated: false });
                        }
                        if (isMountedRef.current) setIsInitializing(false);
                        return;
                    }

                    if (event === 'SIGNED_OUT') {
                        if (isMountedRef.current) {
                            setAuth({ user: null, isAuthenticated: false });
                            SessionStorage.clear();
                        }
                        return;
                    }

                    if (isMountedRef.current) setIsInitializing(false);
                }
            );

            authSubscriptionRef.current = subscription;
        };

        // ── Handler de Recovery (usado pelos listeners de evento) ─
        /**
         * Debounced: agrupa múltiplos eventos simultâneos (focus + visibilitychange)
         * em uma única execução. Não executa se não autenticado.
         */
        const _scheduleRecovery = (source: string) => {
            if (!isAuthenticatedRef.current) return;

            if (recoveryDebounceRef.current) clearTimeout(recoveryDebounceRef.current);
            recoveryDebounceRef.current = setTimeout(async () => {
                logger.info(`[Auth] Recovery via: ${source}`);
                await validateRef.current(true);
                // Invalida cache de React Query para forçar re-fetch de dados frescos
                try { DataService.forceGlobalRefresh?.(); } catch { /* noop */ }
                window.dispatchEvent(new CustomEvent('NEXUS_QUERY_INVALIDATE', { detail: { key: '*' } }));
            }, RECOVERY_DEBOUNCE_MS);
        };

        // ── Handlers de Eventos ──────────────────────────────────
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') _scheduleRecovery('visibilitychange');
        };
        const handleFocus = () => _scheduleRecovery('window.focus');
        const handleOnline = () => {
            wasOfflineRef.current = false;
            _scheduleRecovery('network.online');
        };
        const handleOffline = () => { wasOfflineRef.current = true; };

        // ── Handler do Recovery da Infra (supabaseClient.ts) ────
        /**
         * O supabaseClient dispara NEXUS_RECOVERY_COMPLETE após reconectar o Realtime.
         * Aqui apenas sincronizamos os dados do perfil se a sessão está ativa.
         */
        const handleInfraRecovery = (e: Event) => {
            const detail = (e as CustomEvent<{ hasSession: boolean; source: string; ts: number }>).detail;
            logger.info(`[Auth] NEXUS_RECOVERY_COMPLETE — source: ${detail?.source}, hasSession: ${detail?.hasSession}`);

            if (detail?.hasSession && isAuthenticatedRef.current && isMountedRef.current) {
                DataService.refreshUser()
                    .then(user => {
                        if (user && isMountedRef.current) {
                            setAuth({ user, isAuthenticated: true });
                        }
                    })
                    .catch(() => { /* refresh de perfil não é crítico */ });
            }
        };

        // ── Rastreamento de Atividade (throttled) ────────────────
        /**
         * Atualiza lastActivityRef quando o usuário interage com a UI.
         * Persiste no GlobalStorage a cada ACTIVITY_THROTTLE_MS (30s).
         * Usado para calcular inatividade de 12h.
         */
        const updateActivity = () => {
            const now = Date.now();
            if (now - lastActivityRef.current > ACTIVITY_THROTTLE_MS) {
                lastActivityRef.current = now;
                GlobalStorage.set('last_activity', now);
            }
        };
        const activityEvents = ['mousedown', 'keydown', 'scroll', 'touchstart', 'pointermove'] as const;

        // ── Heartbeat — verificação periódica leve (a cada 2 min) ─
        /**
         * Valida a sessão periodicamente para garantir que o autoRefreshToken
         * está funcionando e tocar o SDK se necessário.
         *
         * IMPORTANTE: Apenas lê do cache local (getSession sem rede).
         * O autoRefreshToken do SDK age automaticamente quando necessário.
         * Intervalo de 2 minutos: menos agressivo que o anterior (60s)
         * mas suficiente para detectar problemas antes da expiração (1h padrão Supabase).
         */
        const heartbeatId = setInterval(() => {
            if (isAuthenticatedRef.current && isMountedRef.current) {
                validateRef.current(true)
                    .catch(err => logger.warn('[Auth] Heartbeat error:', err?.message));
            }
        }, HEARTBEAT_INTERVAL_MS);

        // ── Registro de Listeners ────────────────────────────────
        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('focus', handleFocus);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        window.addEventListener('NEXUS_RECOVERY_COMPLETE', handleInfraRecovery);
        activityEvents.forEach(evt => window.addEventListener(evt, updateActivity, { passive: true }));

        // Inicia auth
        initAuth().catch(err => {
            console.error('[Auth] 💥 Falha crítica na inicialização:', err);
            if (isMountedRef.current) setIsInitializing(false);
        });

        // ── Cleanup ─────────────────────────────────────────────
        return () => {
            isMountedRef.current = false;
            clearTimeout(initTimeoutId);
            clearInterval(heartbeatId);
            if (recoveryDebounceRef.current) clearTimeout(recoveryDebounceRef.current);

            document.removeEventListener('visibilitychange', handleVisibilityChange);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('NEXUS_RECOVERY_COMPLETE', handleInfraRecovery);
            activityEvents.forEach(evt => window.removeEventListener(evt, updateActivity));

            authSubscriptionRef.current?.unsubscribe();
        };
    }, []); // ✅ DEPS VAZIAS: toda mutabilidade via refs — efeito roda uma única vez

    // ── API Pública ───────────────────────────────────────────────
    const refreshUser = useCallback(async (): Promise<User | undefined> => {
        const user = await DataService.refreshUser();
        if (user && isMountedRef.current) setAuth({ user, isAuthenticated: true });
        return user;
    }, []);

    return (
        <AuthContext.Provider value={{ auth, setAuth, isInitializing, login, logout, refreshUser }}>
            {children}
        </AuthContext.Provider>
    );
};

// ── Hook de Consumo ────────────────────────────────────────────
export const useAuth = (): AuthContextType => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('[Nexus] useAuth deve ser usado dentro de um AuthProvider.');
    }
    return context;
};
