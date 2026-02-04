
import React, { useState, useEffect } from 'react';
import { TechApp } from './TechApp';
import { DataService } from '../../services/dataService';
import SessionStorage, { GlobalStorage } from '../../lib/sessionStorage';
import { AuthState, UserRole } from '../../types';

export const TechAppShell: React.FC = () => {
    const [auth, setAuth] = useState<AuthState>(() => {
        const stored = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
        return stored ? { user: stored, isAuthenticated: true } : { user: null, isAuthenticated: false };
    });
    const [isInitializing, setIsInitializing] = useState(true);

    useEffect(() => {
        const initApp = async () => {
            try {
                const { supabase } = await import('../../lib/supabase');
                supabase.auth.onAuthStateChange(async (event, session) => {
                    if (session?.user) {
                        const refreshedUser = await DataService.refreshUser().catch(() => null);
                        if (refreshedUser) {
                            setAuth({ user: refreshedUser, isAuthenticated: true });
                        }
                    } else {
                        if (event === 'SIGNED_OUT') {
                            setAuth({ user: null, isAuthenticated: false });
                            SessionStorage.clear();
                        }
                    }
                    setIsInitializing(false);
                });
            } catch (err) {
                console.error(err);
                setIsInitializing(false);
            }
        };
        initApp();
    }, []);

    if (isInitializing) {
        return (
            <div className="min-h-screen bg-slate-900 flex items-center justify-center">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-emerald-500"></div>
            </div>
        );
    }

    return (
        <TechApp
            auth={auth}
            onLogin={(user) => { SessionStorage.set('user', user); setAuth({ user, isAuthenticated: true }); }}
            onLogout={async () => {
                const { supabase } = await import('../../lib/supabase');
                await supabase.auth.signOut();
                SessionStorage.clear();
                setAuth({ user: null, isAuthenticated: false });
                window.location.reload();
            }}
        />
    );
};
