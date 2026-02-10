

import React, { useState, useEffect, useRef } from 'react';
import { AuthState, User, UserRole, ServiceOrder } from './types';
import { DataService } from './services/dataService';
import SessionStorage, { GlobalStorage } from './lib/sessionStorage';
import { AdminApp } from './apps/admin/AdminApp';
import { PublicApp } from './apps/public/PublicApp';
import { MasterLogin } from './components/admin/MasterLogin';
import { SuperAdminPage } from './components/admin/SuperAdminPage';
import { Hexagon, Phone } from 'lucide-react';
import { logger } from './lib/logger';

const App: React.FC = () => {
  const [auth, setAuth] = useState<AuthState>(() => {
    const stored = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
    return stored ? { user: stored, isAuthenticated: true } : { user: null, isAuthenticated: false };
  });

  const [isInitializing, setIsInitializing] = useState(true);
  const [isSuperMode, setIsSuperMode] = useState(false);
  const [isMasterAuthenticated, setIsMasterAuthenticated] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);

  const [publicOrderId, setPublicOrderId] = useState<string | null>(null);
  const [publicQuoteId, setPublicQuoteId] = useState<string | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [systemNotifications, setSystemNotifications] = useState<any[]>([]);

  // ✅ Track auth subscription for cleanup
  const authSubscriptionRef = useRef<any>(null);

  const handleHashChange = () => {
    const hash = window.location.hash;
    const pathname = window.location.pathname;
    const normalizedPath = pathname.replace(/\/$/, '') || '/';

    const impersonating = SessionStorage.get('is_impersonating') === true;
    const isMasterRoute = (normalizedPath === '/master' || hash === '#/master') && !impersonating;
    const masterSession = SessionStorage.get('master_session_v2') === true;

    if (isMasterRoute) {
      setIsSuperMode(true);
      setIsMasterAuthenticated(masterSession);
      setIsImpersonating(false);
      return;
    }

    setIsSuperMode(false);
    setIsImpersonating(impersonating);

    if (hash.startsWith('#/view/')) {
      setPublicOrderId(hash.split('#/view/')[1]);
      setPublicQuoteId(null);
    } else if (hash.startsWith('#/view-quote/')) {
      setPublicQuoteId(hash.split('#/view-quote/')[1]);
      setPublicOrderId(null);
    } else {
      setPublicOrderId(null);
      setPublicQuoteId(null);
    }
  };

  useEffect(() => {
    let isMounted = true;
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    // Safety timeout: destrava o carregamento após 8 segundos (apenas se ainda estiver carregando)
    const timeoutId = setTimeout(() => {
      // Usamos o setter funcional para garantir que verificamos o valor mais recente
      setIsInitializing(prev => {
        if (prev) {
          console.warn('[App] ⚠️ Init Timeout - O sistema demorou a responder, liberando interface.');
          return false;
        }
        return prev;
      });
    }, 8000);

    const validateAndRestoreSession = async (silent = true) => {
      try {
        const { supabase } = await import('./lib/supabase');
        const { data: { session }, error } = await supabase.auth.getSession();

        // 🛡️ Se a sessão expirou ou está inválida, força o refresh do token
        if (error || !session) {
          // Se não há sessão e não temos usuário local, é um estado normal de deslogado
          const localUser = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
          if (!localUser && !error) {
            if (isMounted) setAuth({ user: null, isAuthenticated: false });
            return;
          }

          console.warn('[App] 🗝️ Sessão expirada ou instável. Tentando refresh do Heartbeat...');
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();

          if (refreshError || !refreshData.session) {
            // Se o erro for "sessão ausente" ou "token inválido", limpamos tudo silenciosamente
            const isCriticalAuthError =
              refreshError?.message?.includes('session missing') ||
              refreshError?.name === 'AuthSessionMissingError' ||
              refreshError?.message?.includes('Invalid Refresh Token') || // 🛡️ Correção para Token Not Found
              refreshError?.message?.includes('Refresh Token Not Found');

            if (isCriticalAuthError) {
              console.log('[App] 💤 Sessão inválida ou expirada. Limpando estado local para novo login.');
              if (isMounted) {
                setAuth({ user: null, isAuthenticated: false });
                SessionStorage.clear();
                // Opcional: window.location.reload() para garantir limpeza total se necessário
              }
              return;
            }

            console.error('[App] ❌ Falha crítica na re-hidratação de sessão:', refreshError);
            return;
          }
        }

        // 🔄 Sincroniza dados do usuário para garantir que o tenantId esteja correto
        const refreshedUser = await DataService.refreshUser().catch(() => null);
        if (refreshedUser && isMounted) {
          setAuth({ user: refreshedUser, isAuthenticated: true });

          if (!silent) {
            setToast({ message: 'Conexão restaurada', type: 'success' });
            setTimeout(() => setToast(null), 3000);
          }
        }
      } catch (err: any) {
        // 🛡️ Nexus Silent Recovery: Se for um erro de trava ou aborto, tenta novamente em 2s
        if (err?.name === 'AbortError' || err?.message?.includes('Lock') || err?.message?.includes('aborted')) {
          console.debug('[App] 🛡️ Lock Conflict detectado no Heartbeat. Agendando retry silencioso (5s)...');
          setTimeout(() => validateAndRestoreSession(true), 5000);
          return;
        }
        console.error('[App] Heartbeat Recovery Error:', err);
      }
    };

    const handleFocus = () => {
      if (auth.isAuthenticated) {
        console.log('[App] 🔋 Janela focada - Verificando integridade da sessão...');
        validateAndRestoreSession(false);
        DataService.forceGlobalRefresh(); // 🌪️ Invalida caches locais
      }
    };

    const initApp = async () => {
      // 🛡️ Nexus Public Route Detector: Verifica o hash diretamente para evitar delay de estado
      const hash = window.location.hash;
      const isPublic = hash.startsWith('#/view/') || hash.startsWith('#/view-quote/');

      if (isPublic) {
        logger.info('Rota Pública detectada. Ignorando Heartbeat de sessão.');
        setIsInitializing(false);
        return;
      }

      try {
        const { supabase } = await import('./lib/supabase');

        // 1. Check session immediately
        await validateAndRestoreSession(true);

        if (isMounted) setIsInitializing(false);

        // 2. Listen for auth changes with proper cleanup
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (!isMounted) return;

          logger.debug(`Auth Event: ${event}`, session ? 'Session Active' : 'No Session');

          if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user && !isSuperMode) {
            const refreshedUser = await DataService.refreshUser().catch(() => null);
            if (refreshedUser) {
              setAuth({ user: refreshedUser, isAuthenticated: true });
            }
          } else if (event === 'SIGNED_OUT') {
            logger.info('Signed out event - Clearing session');
            setAuth({ user: null, isAuthenticated: false });
            SessionStorage.clear();
          } else if (event === 'TOKEN_REFRESHED' && !session) {
            // Token refresh failed - force logout
            logger.error('Token refresh failed - Forcing logout');
            setAuth({ user: null, isAuthenticated: false });
            SessionStorage.clear();
            window.location.reload();
          }
          setIsInitializing(false);
        });

        // ✅ CRITICAL: Store subscription for cleanup
        authSubscriptionRef.current = subscription;
      } catch (err) {
        logger.error('Init Error:', err);
        if (isMounted) setIsInitializing(false);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('focus', handleFocus);
    initApp();

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('focus', handleFocus);

      // ✅ CLEANUP AUTH LISTENER TO PREVENT MEMORY LEAKS
      if (authSubscriptionRef.current) {
        logger.debug('Cleaning up auth subscription');
        authSubscriptionRef.current.unsubscribe();
        authSubscriptionRef.current = null;
      }
    };
  }, [publicOrderId, publicQuoteId, auth.isAuthenticated]);

  useEffect(() => {
    if (auth.isAuthenticated && auth.user && !isSuperMode && !publicOrderId && !publicQuoteId) {
      DataService.getUnreadSystemNotifications(auth.user.id)
        .then(setSystemNotifications)
        .catch(err => console.error("Falha ao buscar notificações:", err));
    }
  }, [auth.isAuthenticated, auth.user, isSuperMode, publicOrderId, publicQuoteId]);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  // Visualizações Públicas
  if (publicOrderId || publicQuoteId) {
    return <PublicApp publicOrderId={publicOrderId} publicQuoteId={publicQuoteId} />;
  }

  // Admin Master / Super Admin
  if (isSuperMode) {
    if (!isMasterAuthenticated) {
      return <MasterLogin onLogin={() => {
        SessionStorage.set('master_session_v2', true);
        setIsMasterAuthenticated(true);
      }} onCancel={() => { window.location.pathname = "/"; }} />;
    }
    return <SuperAdminPage onLogout={() => {
      SessionStorage.remove('master_session_v2');
      setIsMasterAuthenticated(false);
      window.location.pathname = '/';
    }} />;
  }

  // Admin / Technician (Redirecionamento para tech se for tech)
  if (auth.isAuthenticated && auth.user?.role === UserRole.TECHNICIAN) {
    // Se estiver no index.html mas for técnico, avisamos para ir ao tech.html ou apenas dizemos que não é admin
    // Mas para manter compatibilidade, vamos avisar ou redirecionar.
    // O ideal é que o técnico use tech.html.
    return (
      <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white p-10 text-center">
        <Hexagon size={64} className="text-emerald-500 mb-8" />
        <h2 className="text-2xl font-black uppercase italic mb-4">Acesso Técnico Detectado</h2>
        <p className="text-slate-400 uppercase font-bold text-xs mb-8">Por favor, utilize o aplicativo correto para técnicos.</p>
        <a href="/tech.html" className="px-8 py-4 bg-emerald-600 rounded-2xl font-black uppercase text-sm shadow-xl">Abrir APP Técnico</a>
        <button onClick={() => { SessionStorage.clear(); window.location.reload(); }} className="mt-8 text-xs text-slate-500 uppercase underline">Sair</button>
      </div>
    );
  }

  return (
    <>
      <AdminApp
        auth={auth}
        onLogin={(user) => { SessionStorage.set('user', user); setAuth({ user, isAuthenticated: true }); }}
        onLogout={async () => {
          logger.info('Logout iniciado');

          try {
            // 1. Cleanup auth listener FIRST
            if (authSubscriptionRef.current) {
              logger.debug('Removendo listener de autenticação');
              authSubscriptionRef.current.unsubscribe();
              authSubscriptionRef.current = null;
            }

            // 2. Sign out from Supabase
            const { supabase } = await import('./lib/supabase');
            await supabase.auth.signOut();

            // 3. Clear all storage
            SessionStorage.clear();
            localStorage.removeItem('nexus_tech_session_v2');
            localStorage.removeItem('nexus_tech_cache_v2');

            // 4. Update state
            setAuth({ user: null, isAuthenticated: false });

            // 5. Force reload to clear any remaining subscriptions
            logger.info('Logout completo - Recarregando página');
            window.location.reload();
          } catch (error) {
            logger.error('Erro durante logout:', error);
            // Force reload anyway to ensure clean state
            window.location.reload();
          }
        }}
        isImpersonating={isImpersonating}
        onToggleMaster={() => { window.location.href = window.location.origin + '/master'; }}
        systemNotifications={systemNotifications}
        onMarkNotificationRead={(id) => {
          DataService.markSystemNotificationAsRead(auth.user!.id, id);
          setSystemNotifications(prev => prev.filter(n => n.id !== id));
        }}
      />

      {/* Global Toast Layer */}
      {toast && (
        <div className="fixed bottom-24 right-8 z-[9999] animate-in slide-in-from-right fade-in duration-300">
          <div className={`px-6 py-4 rounded-2xl shadow-2xl border flex items-center gap-3 backdrop-blur-xl ${toast.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
            }`}>
            <div className={`w-2 h-2 rounded-full animate-pulse ${toast.type === 'success' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            <span className="text-xs font-black uppercase tracking-widest">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Floating Support Balloon */}

    </>
  );
};

export default App;
