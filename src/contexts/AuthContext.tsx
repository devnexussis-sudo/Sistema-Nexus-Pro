// ============================================================
// src/contexts/AuthContext.tsx
// 🛡️ NEXUS LINE — Authentication Context v4.0 (Maestro)
// ============================================================

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { AuthState, User } from '../types';
import { DataService } from '../services/dataService';
import SessionStorage, { GlobalStorage } from '../lib/sessionStorage';
import { logger } from '../lib/logger';
import { supabase } from '../lib/supabase';

interface AuthContextType {
    auth: AuthState;
    setAuth: React.Dispatch<React.SetStateAction<AuthState>>;
    isAuthLoading: boolean;
    isInitializing: boolean; // Mantido por retrocompatibilidade
    session: any | null;
    login: (user: User) => void;
    logout: () => Promise<void>;
    refreshUser: () => Promise<User | undefined>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [session, setSession] = useState<any | null>(null);
    const [isAuthLoading, setIsAuthLoading] = useState(true);

    const [auth, setAuth] = useState<AuthState>(() => {
        const stored = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
        return stored ? { user: stored, isAuthenticated: true } : { user: null, isAuthenticated: false };
    });

    const isMounted = useRef(true);

    // ── O Maestro: Inicialização ÚNICA ─────────────────────────────
    useEffect(() => {
        isMounted.current = true;

        const initMaestro = async () => {
            try {
                // 1. Pede sessão (Lê do cache local/storage) UMA VEZ
                const { data: { session: currentSession }, error } = await supabase.auth.getSession();

                if (isMounted.current) {
                    setSession(currentSession);
                    setIsAuthLoading(false);

                    if (currentSession?.user) {
                        // Sincroniza o usuário interno do Nexus
                        DataService.refreshUser().then(rUser => {
                            if (rUser && isMounted.current) {
                                setAuth({ user: rUser, isAuthenticated: true });
                            }
                        }).catch(() => { });
                    } else if (error || !currentSession) {
                        setAuth({ user: null, isAuthenticated: false });
                    }
                }

                // 2. Escuta mudanças na sessão (renovação, logout) UMA VEZ
                supabase.auth.onAuthStateChange(async (event, newSession) => {
                    if (!isMounted.current) return;
                    logger.info(`[Auth Maestro] Event: ${event}`);

                    setSession(newSession);

                    if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && newSession?.user) {
                        const rUser = await DataService.refreshUser().catch(() => null);
                        if (rUser && isMounted.current) {
                            setAuth({ user: rUser, isAuthenticated: true });
                        } else if (rUser === undefined && event === 'SIGNED_IN') {
                            setAuth({ user: null, isAuthenticated: false });
                        }
                    } else if (event === 'SIGNED_OUT') {
                        setAuth({ user: null, isAuthenticated: false });
                    }
                });

            } catch (err) {
                console.error('[Auth Maestro] Falha na inicialização:', err);
                if (isMounted.current) setIsAuthLoading(false);
            }
        };

        if (window.location.hash.startsWith('#/view')) {
            setIsAuthLoading(false); // Rota pública não precisa travar
        } else {
            initMaestro();
        }

        // NOTA: O Recovery Engine em supabaseClient.ts já escuta visibilitychange/focus
        // e dispara NEXUS_RECOVERY_COMPLETE quando necessário.
        // Não duplicamos listeners aqui para evitar condição de corrida.

        return () => {
            isMounted.current = false;
        };
    }, []);

    const login = useCallback((user: User) => {
        GlobalStorage.set('last_activity', Date.now());
        setAuth({ user, isAuthenticated: true });
    }, []);

    const logout = useCallback(async () => {
        setAuth({ user: null, isAuthenticated: false });
        SessionStorage.clear();
        GlobalStorage.remove('persistent_user');
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('[Auth Maestro] signOut error:', err);
        }
    }, []);

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
            isInitializing: isAuthLoading, // Alias
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
