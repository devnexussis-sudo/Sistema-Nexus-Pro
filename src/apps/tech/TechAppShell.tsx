
import React, { useState, useEffect } from 'react';
import { TechApp } from './TechApp';
import { DataService } from '../../services/dataService';
import { AuthState, UserRole, User } from '../../types';

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

    useEffect(() => {
        let isMounted = true;
        let unsubscribe: (() => void) | null = null;

        const initApp = async () => {
            try {
                const { supabase } = await import('../../lib/supabase');

                // Configura listener de auth
                const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                    if (!isMounted) return;

                    console.log('[TechAppShell] Auth event:', event);

                    if (session?.user) {
                        try {
                            const refreshedUser = await DataService.refreshUser();
                            if (refreshedUser && refreshedUser.role === UserRole.TECHNICIAN) {
                                TechSessionStorage.set(refreshedUser);
                                setAuth({ user: refreshedUser, isAuthenticated: true });
                            } else if (refreshedUser && refreshedUser.role !== UserRole.TECHNICIAN) {
                                // Usuário logado mas não é técnico
                                console.log('[TechAppShell] User is not a technician');
                                await supabase.auth.signOut();
                                TechSessionStorage.clear();
                                setAuth({ user: null, isAuthenticated: false });
                            }
                        } catch (err) {
                            console.error('[TechAppShell] Error refreshing user:', err);
                        }
                    } else if (event === 'SIGNED_OUT') {
                        TechSessionStorage.clear();
                        setAuth({ user: null, isAuthenticated: false });
                    }

                    setIsInitializing(false);
                });

                unsubscribe = () => subscription.unsubscribe();

                // Checa sessão inicial
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) {
                    setIsInitializing(false);
                }

            } catch (err: any) {
                console.error('[TechAppShell] Init error:', err);
                if (isMounted) {
                    setInitError(err.message || 'Erro ao inicializar');
                    setIsInitializing(false);
                }
            }
        };

        initApp();

        return () => {
            isMounted = false;
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const handleLogin = (user: User, rememberMe: boolean = false) => {
        TechSessionStorage.set(user);
        if (rememberMe) {
            TechPersistentStorage.set(user);
        }
        setAuth({ user, isAuthenticated: true });
    };

    const handleLogout = async () => {
        try {
            const { supabase } = await import('../../lib/supabase');
            await supabase.auth.signOut();
        } catch (e) {
            console.error('[TechAppShell] Logout error:', e);
        }
        TechSessionStorage.clear();
        setAuth({ user: null, isAuthenticated: false });
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
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm uppercase"
                >
                    Tentar Novamente
                </button>
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
