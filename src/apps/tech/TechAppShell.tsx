
import React, { useState, useEffect } from 'react';
import { TechApp } from './TechApp';
import { DataService } from '../../services/dataService';
import { AuthState, UserRole, User } from '../../types';
import { useLocationTracker } from '../../hooks/useLocationTracker';

// Chaves de storage específicas para o Tech App (isoladas do Admin)
const TECH_SESSION_KEY = 'nexus_tech_session';
const TECH_PERSISTENT_KEY = 'nexus_tech_persistent';

const TechSessionStorage = {
    set: (value: any) => {
        try {
            sessionStorage.setItem(TECH_SESSION_KEY, JSON.stringify(value));
        } catch (e) {
            console.error('TechSessionStorage.set error:', e);
        }
    },
    get: <T = any>(): T | null => {
        try {
            const data = sessionStorage.getItem(TECH_SESSION_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    },
    clear: () => {
        try {
            sessionStorage.removeItem(TECH_SESSION_KEY);
            localStorage.removeItem(TECH_PERSISTENT_KEY);
        } catch (e) {
            console.error('TechSessionStorage.clear error:', e);
        }
    }
};

const TechPersistentStorage = {
    set: (value: any) => {
        try {
            localStorage.setItem(TECH_PERSISTENT_KEY, JSON.stringify(value));
        } catch (e) {
            console.error('TechPersistentStorage.set error:', e);
        }
    },
    get: <T = any>(): T | null => {
        try {
            const data = localStorage.getItem(TECH_PERSISTENT_KEY);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            return null;
        }
    }
};

export const TechAppShell: React.FC = () => {
    const [auth, setAuth] = useState<AuthState>(() => {
        // Busca sessão específica do Tech App
        const stored = TechSessionStorage.get<User>() || TechPersistentStorage.get<User>();
        if (stored && stored.role === UserRole.TECHNICIAN) {
            return { user: stored, isAuthenticated: true };
        }
        return { user: null, isAuthenticated: false };
    });
    const [isInitializing, setIsInitializing] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);

    const { startTracking, stopTracking, isTracking, error: gpsError } = useLocationTracker();

    useEffect(() => {
        let isMounted = true;
        let unsubscribe: (() => void) | null = null;

        // Safety timeout: destrava o "Carregando" após 6 segundos caso o banco demore
        const timeoutId = setTimeout(() => {
            if (isMounted) {
                console.warn('[TechAppShell] Init Timeout - Forçando carregamento');
                setIsInitializing(false);
            }
        }, 6000);

        const initApp = async () => {
            try {
                const { supabase } = await import('../../lib/supabase');

                // 1. Checa sessão inicial IMEDIATAMENTE
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();

                if (sessionError) throw sessionError;

                if (session?.user) {
                    let refreshedUser = null;
                    try {
                        refreshedUser = await DataService.refreshUser();
                    } catch (refreshErr: any) {
                        console.warn('[TechAppShell] Falha no refresh do user:', refreshErr);
                        // Se for erro de abort/network, tentamos seguir com o usuário da sessão se tivermos metadados suficientes
                        // Mas idealmente precisamos do refresh. Vamos silenciar o erro fatal se for "abort"
                        if (refreshErr.message?.includes('aborted')) {
                            // Ignora abort e tenta seguir
                        }
                    }

                    if (isMounted) {
                        // Se refresh falhou, usamos null. Se sucesso, usamos o user.
                        // Mas precisamos que user não seja null para entrar.
                        // Se refresh falhar, infelizmente pode ser inseguro entrar.
                        // VAMOS FAZER UM RETRY SIMPLES?
                        if (!refreshedUser) {
                            // Tentativa de fallback: se falhou refresh, tenta recuperar do storage local pra não bloquear
                            const stored = TechSessionStorage.get<User>();
                            if (stored && stored.id === session.user.id) {
                                refreshedUser = stored;
                                console.log('[TechAppShell] Usando usuário em cache após falha de refresh.');
                            }
                        }

                        if (refreshedUser && refreshedUser.role === UserRole.TECHNICIAN) {
                            TechSessionStorage.set(refreshedUser);
                            setAuth({ user: refreshedUser, isAuthenticated: true });
                            startTracking(); // 📍 Inicia Rastreamento GPS ao logar
                        } else if (refreshedUser) {
                            // Usuário existe mas não é tech
                            await supabase.auth.signOut();
                            TechSessionStorage.clear();
                        }
                        // Se refreshedUser for null (erro persistente), o loading vai parar no finally e mostrar o app deslogado?
                        // Não, se session existe mas user não, ele não seta nada.
                        // O ideal é deixar cair no catch se for crítico, mas abort não é crítico.
                    }
                }

                // 2. Configura listener para mudanças futuras
                const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                    if (!isMounted) return;

                    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
                        if (session?.user) {
                            let user = null;
                            try {
                                user = await DataService.refreshUser();
                            } catch (e: any) {
                                console.warn('[TechAppShell] AuthState Change Refresh Error:', e);
                                // Tenta fallback do storage se abortar
                                if (e.message?.includes('aborted')) {
                                    user = TechSessionStorage.get<User>();
                                }
                            }

                            if (user && user.role === UserRole.TECHNICIAN) {
                                TechSessionStorage.set(user);
                                setAuth({ user: user, isAuthenticated: true });
                                startTracking(); // 📍 Inicia Rastreamento
                            }
                        }
                    } else if (event === 'SIGNED_OUT') {
                        TechSessionStorage.clear();
                        setAuth({ user: null, isAuthenticated: false });
                        stopTracking(); // 🛑 Para Rastreamento
                    }
                });

                unsubscribe = () => subscription.unsubscribe();

            } catch (err: any) {
                console.error('[TechAppShell] Init error:', err);
                if (isMounted) {
                    // Ignora erros de abort na inicialização geral também, se já tivermos auth
                    if (err.message?.includes('aborted') && TechSessionStorage.get()) {
                        console.warn('Silencing init abort error because we have cache');
                        setIsInitializing(false);
                        return;
                    }
                    setInitError(err.message || 'Erro ao conectar');
                }
            } finally {
                if (isMounted) {
                    clearTimeout(timeoutId);
                    setIsInitializing(false);
                }
            }
        };

        initApp();

        return () => {
            isMounted = false;
            clearTimeout(timeoutId);
            if (unsubscribe) unsubscribe();
            stopTracking();
        };
    }, [startTracking, stopTracking]);

    const handleLogin = (user: User, rememberMe: boolean = false) => {
        TechSessionStorage.set(user);
        if (rememberMe) {
            TechPersistentStorage.set(user);
        }
        setAuth({ user, isAuthenticated: true });
    };

    const handleLogout = async () => {
        // 1. Limpeza Otimista (UI Primeiro)
        TechSessionStorage.clear();
        setAuth({ user: null, isAuthenticated: false });
        stopTracking();

        // 2. Backend em background (Fire-and-forget controlada)
        try {
            const { supabase } = await import('../../lib/supabase');
            // Pequeno delay para garantir que a UI já atualizou
            setTimeout(async () => {
                await supabase.auth.signOut().catch(err => console.warn('Background SignOut Error:', err));
            }, 100);
        } catch (e) {
            console.error('[TechAppShell] Logout setup error:', e);
        }
    };

    if (initError) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-8 text-center">
                <div className="w-16 h-16 bg-red-500/20 rounded-2xl flex items-center justify-center mb-6">
                    <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h2 className="text-xl font-black text-white uppercase mb-3">Erro de Conexão</h2>
                <p className="text-slate-400 text-sm mb-6">{initError}</p>
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button
                        onClick={() => window.location.reload()}
                        className="w-full px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm uppercase"
                    >
                        Tentar Novamente
                    </button>
                    <button
                        onClick={() => {
                            TechSessionStorage.clear();
                            window.location.reload();
                        }}
                        className="w-full px-6 py-3 bg-slate-800 text-slate-400 rounded-xl font-bold text-xs uppercase"
                    >
                        Sair / Limpar Sessão
                    </button>
                </div>
            </div>
        );
    }

    if (isInitializing) {
        return (
            <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500 mb-4"></div>
                <p className="text-slate-400 text-xs uppercase font-bold">Carregando...</p>
            </div>
        );
    }

    return (
        <TechApp
            auth={auth}
            onLogin={handleLogin}
            onLogout={handleLogout}
        />
    );
};
