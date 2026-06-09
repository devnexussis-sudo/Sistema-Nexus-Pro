// ============================================================
// src/contexts/AuthContext.tsx
// 🛡️ NEXUS LINE — Authentication Context v5.0 (Passive Listener)
//
// ARQUITETURA:
//  - NÃO registra onAuthStateChange — o Singleton em supabaseClient.ts faz isso.
//  - Escuta o CustomEvent 'NEXUS_AUTH_EVENT' emitido pelo Singleton.
//  - Isso garante que NUNCA haverá duas assinaturas brigando pelo auth lock.
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AuthState, User } from '../types';
import { DataService } from '../services/dataService';
import SessionStorage, { GlobalStorage } from '../lib/sessionStorage';
import { globalSession, globalSessionOk } from '../lib/supabaseClient';
import { supabase } from '../lib/supabase';

interface AuthContextType {
    auth: AuthState;
    setAuth: React.Dispatch<React.SetStateAction<AuthState>>;
    isAuthLoading: boolean;
    isInitializing: boolean; // Alias para retrocompatibilidade
    session: any | null;
    login: (user: User) => void;
    logout: () => Promise<void>;
    refreshUser: () => Promise<User | undefined>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    // Inicializa do "bolso" global do Singleton — sem esperar assíncrono
    const [session, setSession] = useState<any | null>(globalSession);
    const [isAuthLoading, setIsAuthLoading] = useState(!globalSessionOk);

    const [auth, setAuth] = useState<AuthState>(() => {
        const stored = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
        return stored ? { user: stored, isAuthenticated: true } : { user: null, isAuthenticated: false };
    });

    const isMounted = useRef(true);
    // Mutex para evitar N chamadas simultâneas de refreshUser
    const isRefreshingUser = useRef(false);

    // Controle de inatividade (8 horas)
    const EIGHT_HOURS_MS = 8 * 60 * 60 * 1000;
    const lastActivityRef = useRef<number>(Date.now());

    // ── Setup: escuta eventos do Singleton (sem registrar novo onAuthStateChange) ──
    useEffect(() => {
        isMounted.current = true;

        // ── Inicialização: sincroniza com o estado atual do Singleton ──
        const bootstrap = async () => {
            // Se o Singleton já tem sessão no "bolso", usa direto (zero latência)
            if (globalSessionOk && globalSession) {
                setSession(globalSession);
                setIsAuthLoading(false);

                if (!isRefreshingUser.current) {
                    isRefreshingUser.current = true;
                    const rUser = await DataService.refreshUser().catch(() => null);
                    isRefreshingUser.current = false;
                    if (rUser && isMounted.current) {
                        setAuth({ user: rUser, isAuthenticated: true });
                    }
                }
                return;
            }

            // Sem sessão no bolso — pode ser rota pública ou sessão expirada
            // Usamos .href.includes pois pode ser hash ou path parameter
            if (window.location.href.includes('/view')) {
                setIsAuthLoading(false);
                return;
            }

            // Leitura passiva (não chama getSession na rede, lê do localStorage)
            // O Singleton já vai disparar NEXUS_AUTH_EVENT quando o SDK inicializar
            // Apenas libera a UI após 1s de segurança
            const safetyTimer = setTimeout(() => {
                if (isMounted.current) setIsAuthLoading(false);
            }, 1500);

            return () => clearTimeout(safetyTimer);
        };

        bootstrap();

        // ── Listener do Singleton — ÚNICA fonte de verdade de auth ──
        const handleAuthEvent = async (e: Event) => {
            if (!isMounted.current) return;

            const { event, session: newSession } = (e as CustomEvent).detail;
            console.log(`[AuthContext] 📡 NEXUS_AUTH_EVENT: ${event}`);

            setSession(newSession);
            setIsAuthLoading(false);

            if (event === 'SIGNED_IN' && newSession?.user) {
                // Apenas no login inicial — carrega o perfil Nexus do usuário
                if (!isRefreshingUser.current) {
                    isRefreshingUser.current = true;
                    const rUser = await DataService.refreshUser().catch(() => null);
                    isRefreshingUser.current = false;
                    if (rUser && isMounted.current) {
                        setAuth({ user: rUser, isAuthenticated: true });
                    }
                }
            } else if (event === 'TOKEN_REFRESHED' && newSession?.user) {
                // Token renovado: atualiza sessão sem re-buscar perfil do banco
                // (o usuário não mudou, só o JWT expirou e foi renovado)
                setAuth(prev => prev.isAuthenticated ? prev : { user: null, isAuthenticated: false });
            } else if (event === 'SIGNED_OUT') {
                setAuth({ user: null, isAuthenticated: false });
            }
        };

        window.addEventListener('NEXUS_AUTH_EVENT', handleAuthEvent);

        return () => {
            isMounted.current = false;
            window.removeEventListener('NEXUS_AUTH_EVENT', handleAuthEvent);
        };
    }, []);

    const login = useCallback((user: User) => {
        GlobalStorage.set('last_activity', Date.now());
        setAuth({ user, isAuthenticated: true });
    }, []);

    const logout = useCallback(async () => {
        // Exibe o spinner global (splash screen) IMEDIATAMENTE antes de qualquer mudança de estado.
        // Isso evita que o React re-renderize para a tela de Login enquanto a navegação/signOut ainda está processando.
        const splash = document.getElementById('nexus-loading-screen');
        if (splash) {
            splash.style.transition = 'none'; // Remove fade-out
            splash.style.opacity = '1';
            splash.style.pointerEvents = 'auto';
            splash.style.display = 'flex';
            splash.classList.remove('fade-out');
        }

        SessionStorage.clear();
        GlobalStorage.remove('persistent_user');
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('[AuthContext] signOut error:', err);
        }
        
        // setAuth não é chamado aqui de propósito para evitar que a UI "pisque" para a tela de login
        // antes do redirecionamento global (window.location.href = '/') fazer o refresh.
    }, []);

    // ── Auto Logout por inatividade (8 horas) ──
    useEffect(() => {
        if (!auth.isAuthenticated) return;

        // Sincroniza inicial
        lastActivityRef.current = Date.now();

        const updateActivity = () => {
            const now = Date.now();
            if (now - lastActivityRef.current > EIGHT_HOURS_MS) {
                // Se já passou 8 horas e o usuário tentou mexer, desloga
                logout().then(() => { window.location.href = '/'; });
            } else {
                lastActivityRef.current = now;
            }
        };

        let throttleTimeout: NodeJS.Timeout | null = null;
        const handleActivity = () => {
            if (!throttleTimeout) {
                updateActivity();
                throttleTimeout = setTimeout(() => { throttleTimeout = null; }, 5000); // Throttling de 5s
            }
        };

        const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'mousemove'];
        events.forEach(e => window.addEventListener(e, handleActivity, { passive: true }));

        const interval = setInterval(() => {
            const now = Date.now();
            if (now - lastActivityRef.current > EIGHT_HOURS_MS) {
                // Estourou o tempo sem evento
                logout().then(() => { window.location.href = '/'; });
            }
        }, 60000); // Verifica a cada minuto

        return () => {
            events.forEach(e => window.removeEventListener(e, handleActivity));
            if (throttleTimeout) clearTimeout(throttleTimeout);
            clearInterval(interval);
        };
    }, [auth.isAuthenticated, logout]);

    // 🔒 TENANT SUSPENSION GUARD — Realtime (Big Tech Standard)
    //
    // ARQUITETURA: Zero polling. Zero queries periódicas.
    // Usa Supabase Realtime (WebSocket já aberto) para escutar mudanças
    // na linha exata do tenant do usuário logado.
    //
    // Custo em produção com 10.000 usuários ativos simultâneos:
    //   - Polling (2min): ~5.000 queries/min → inaceitável
    //   - Realtime:       0 queries/min — evento só é empurrado quando
    //                     o Master Admin realmente altera o status.
    useEffect(() => {
        if (!auth.isAuthenticated || !auth.user?.tenantId) return;

        const tenantId = auth.user.tenantId;

        // Verificação única no mount (cobre o caso de suspensão antes do login)
        // Usa o campo já carregado em memória — sem query extra se já disponível
        const verifyOnMount = async () => {
            const isSuspended = await DataService.checkTenantSuspended(tenantId).catch(() => false);
            if (isSuspended && isMounted.current) {
                console.warn(`[AuthContext] 🔒 Tenant ${tenantId} já suspenso no mount. Encerrando sessão.`);
                await logout();
                window.location.href = '/#/login?reason=suspended';
            }
        };
        verifyOnMount();

        // Canal Realtime — filtrado pelo tenant específico (não escuta outras empresas)
        const channelName = `tenant-suspension-guard-${tenantId}`;
        const channel = supabase
            .channel(channelName)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',         // Só UPDATE — INSERT/DELETE não são relevantes aqui
                    schema: 'public',
                    table: 'tenants',
                    filter: `id=eq.${tenantId}` // Filtro server-side: só este tenant
                },
                async (payload) => {
                    const newStatus = (payload.new as any)?.status;
                    if (newStatus === 'suspended' && isMounted.current) {
                        console.warn(`[AuthContext] 🔒 Realtime: tenant ${tenantId} foi suspenso. Encerrando sessão.`);
                        await logout();
                        window.location.href = '/#/login?reason=suspended';
                    }
                }
            )
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[AuthContext] 📡 Suspension guard ativo para tenant: ${tenantId}`);
                }
            });

        // Cleanup: cancela a subscrição ao sair (desmount ou logout)
        return () => {
            supabase.removeChannel(channel);
        };
    }, [auth.isAuthenticated, auth.user?.tenantId, logout]);


    const refreshUser = useCallback(async () => {
        const u = await DataService.refreshUser().catch(() => undefined);
        if (u && isMounted.current) setAuth(prev => ({ ...prev, user: u }));
        return u;
    }, []);

    return (
        <AuthContext.Provider value={{
            auth,
            setAuth,
            isAuthLoading,
            isInitializing: isAuthLoading,
            session,
            login,
            logout,
            refreshUser
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
