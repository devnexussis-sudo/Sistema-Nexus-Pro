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
        setAuth({ user: null, isAuthenticated: false });
        SessionStorage.clear();
        GlobalStorage.remove('persistent_user');
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error('[AuthContext] signOut error:', err);
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
