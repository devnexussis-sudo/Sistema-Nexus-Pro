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

    // 1. Session Restoration Logic (Ported from App.tsx)
    const validateAndRestoreSession = useCallback(async (silent = true) => {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();

            // Handle invalid session
            if (error || !session) {
                const localUser = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
                if (!localUser && !error) {
                    if (isMountedRef.current) setAuth({ user: null, isAuthenticated: false });
                    return;
                }

                console.warn('[AuthProvider] 🗝️ Sessão inválida ou expirada. Realizando limpeza de segurança.');
                if (isMountedRef.current) {
                    setAuth({ user: null, isAuthenticated: false });
                    SessionStorage.clear();
                }
                return;
            }

            // Restore/Refresh User Data
            const refreshedUser = await DataService.refreshUser().catch(() => null);
            if (refreshedUser && isMountedRef.current) {
                setAuth({ user: refreshedUser, isAuthenticated: true });
                if (!silent && wasOfflineRef.current) {
                    wasOfflineRef.current = false;
                    logger.info('Session restored after offline period');
                }
            }
        } catch (err: any) {
            if (err?.name === 'AbortError' || err?.message?.includes('Lock')) {
                setTimeout(() => validateAndRestoreSession(true), 5000);
            }
        }
    }, []);

    // 2. Setup Listeners
    useEffect(() => {
        isMountedRef.current = true;

        // Init Timeout Safety
        const timeoutId = setTimeout(() => {
            setIsInitializing(prev => {
                if (prev) {
                    console.warn('[AuthProvider] ⚠️ Init Timeout - O sistema demorou a responder, liberando interface.');
                    return false;
                }
                return prev;
            });
        }, 3000);

        const initAuth = async () => {
            // Check if Public Route
            const isPublic = window.location.hash.startsWith('#/view/') || window.location.hash.startsWith('#/view-quote/');
            if (isPublic) {
                logger.info('Rota Pública detectada. Ignorando Heartbeat de sessão.');
                setIsInitializing(false);
                return;
            }

            await validateAndRestoreSession(true);
            if (isMountedRef.current) setIsInitializing(false);

            // Supabase Listener
            const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
                if (!isMountedRef.current) return;
                console.log(`[AuthProvider] Auth Event: ${event}`);

                if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
                    const refreshedUser = await DataService.refreshUser().catch(() => null);
                    if (refreshedUser && isMountedRef.current) setAuth({ user: refreshedUser, isAuthenticated: true });
                } else if (event === 'SIGNED_OUT') {
                    if (isMountedRef.current) setAuth({ user: null, isAuthenticated: false });
                    SessionStorage.clear();
                }
                if (isMountedRef.current) setIsInitializing(false);
            });

            authSubscriptionRef.current = subscription;
        };

        const handleFocus = async () => {
            if (auth.isAuthenticated) {
                const currentTenant = DataService.getCurrentTenantId();
                if (!currentTenant) await validateAndRestoreSession(false);
                await validateAndRestoreSession(true);
                DataService.forceGlobalRefresh();
            }
        };

        const handleOnline = () => { if (auth.isAuthenticated) validateAndRestoreSession(false); };
        const handleOffline = () => { wasOfflineRef.current = true; };

        // Bind events
        window.addEventListener('focus', handleFocus);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        initAuth();

        return () => {
            isMountedRef.current = false;
            clearTimeout(timeoutId);
            window.removeEventListener('focus', handleFocus);
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            if (authSubscriptionRef.current?.unsubscribe) authSubscriptionRef.current.unsubscribe();
        };
    }, []); // Run once on mount

    // 3. Inactivity Check
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

    const logout = () => {
        setAuth({ user: null, isAuthenticated: false });
        SessionStorage.clear();
        supabase.auth.signOut();
    };

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
