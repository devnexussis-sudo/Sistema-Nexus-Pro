
import React, { useState, useEffect } from 'react';
import { AuthState, User, UserRole, ServiceOrder } from './types';
import { DataService } from './services/dataService';
import SessionStorage, { GlobalStorage } from './lib/sessionStorage';
import { AdminApp } from './apps/admin/AdminApp';
import { PublicApp } from './apps/public/PublicApp';
import { MasterLogin } from './components/admin/MasterLogin';
import { SuperAdminPage } from './components/admin/SuperAdminPage';
import { Hexagon } from 'lucide-react';

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

  const [systemNotifications, setSystemNotifications] = useState<any[]>([]);

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
    handleHashChange();
    window.addEventListener('hashchange', handleHashChange);

    const initApp = async () => {
      try {
        const { supabase } = await import('./lib/supabase');
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (session?.user && !isSuperMode) {
            const refreshedUser = await DataService.refreshUser().catch(() => null);
            if (refreshedUser) {
              setAuth({ user: refreshedUser, isAuthenticated: true });
            }
          } else if (!session?.user && event === 'SIGNED_OUT') {
            setAuth({ user: null, isAuthenticated: false });
            SessionStorage.clear();
          }
          setIsInitializing(false);
        });
      } catch (err) {
        setIsInitializing(false);
      }
    };
    initApp();

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    if (auth.isAuthenticated && auth.user && !isSuperMode) {
      DataService.getUnreadSystemNotifications(auth.user.id).then(setSystemNotifications);
    }
  }, [auth.isAuthenticated, auth.user, isSuperMode]);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
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
    <AdminApp
      auth={auth}
      onLogin={(user) => { SessionStorage.set('user', user); setAuth({ user, isAuthenticated: true }); }}
      onLogout={async () => {
        const { supabase } = await import('./lib/supabase');
        await supabase.auth.signOut();
        SessionStorage.clear();
        setAuth({ user: null, isAuthenticated: false });
        window.location.reload();
      }}
      isImpersonating={isImpersonating}
      onToggleMaster={() => { window.location.href = window.location.origin + '/master'; }}
      systemNotifications={systemNotifications}
      onMarkNotificationRead={(id) => {
        DataService.markSystemNotificationAsRead(auth.user!.id, id);
        setSystemNotifications(prev => prev.filter(n => n.id !== id));
      }}
      orders={orders}
      contracts={contracts}
      quotes={quotes}
      techs={techs}
      customers={customers}
      equipments={equipments}
      stockItems={stockItems}
      onUpdateData={fetchGlobalData}
    />
  );
};

export default App;
