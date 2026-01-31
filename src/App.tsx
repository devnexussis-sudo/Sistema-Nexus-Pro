
import React, { useState, useEffect } from 'react';
import { Login } from './components/Login';
import { Button } from './components/ui/Button';
import { AdminLogin } from './components/admin/AdminLogin';
import { TechLogin } from './components/tech/TechLogin';
import { MasterLogin } from './components/admin/MasterLogin';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { AdminOverview } from './components/admin/AdminOverview';
import { CustomerManagement } from './components/admin/CustomerManagement';
import { EquipmentManagement } from './components/admin/EquipmentManagement';
import { TechnicianManagement } from './components/admin/TechnicianManagement';
import { FormManagement } from './components/admin/FormManagement';
import { SettingsPage } from './components/admin/SettingsPage';
import { SuperAdminPage } from './components/admin/SuperAdminPage';
import { UserManagement } from './components/admin/UserManagement';
import { TechDashboard } from './components/tech/TechDashboard';
import { PublicOrderView } from './components/public/PublicOrderView';
import { PublicQuoteView } from './components/public/PublicQuoteView';
import { PlannedMaintenance } from './components/admin/PlannedMaintenance';
import { QuoteManagement } from './components/admin/QuoteManagement';
import { StockManagement } from './components/admin/StockManagement';
import { AuthState, User, UserRole, UserPermissions, ServiceOrder, OrderStatus, Customer, Equipment, StockItem } from './types';

import { DataService } from './services/dataService';
import SessionStorage, { GlobalStorage } from './lib/sessionStorage';
import { Hexagon, LayoutDashboard, ClipboardList, CalendarClock, Users, Box, Wrench, Workflow, ShieldAlert, ShieldCheck, Settings, LogOut, Bell, CheckCircle2, DollarSign, RefreshCw, Package, ArrowRight, Shield, AlertTriangle, Lock } from 'lucide-react';

const getInitialDateRange = () => {
  return {
    start: '',
    end: ''
  };
};

const App: React.FC = () => {
  // 🛡️ Nexus Auto-Login: Inicializa o estado já buscando o cache (especialmente útil para técnicos)
  const [auth, setAuth] = useState<AuthState>(() => {
    const stored = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
    return stored ? { user: stored, isAuthenticated: true } : { user: null, isAuthenticated: false };
  });
  const [currentView, setCurrentView] = useState<'dashboard' | 'orders' | 'contracts' | 'quotes' | 'techs' | 'equip' | 'clients' | 'forms' | 'settings' | 'superadmin' | 'users' | 'stock'>('dashboard');
  const [viewParams, setViewParams] = useState<any>(null);
  const [orders, setOrders] = useState<ServiceOrder[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [techs, setTechs] = useState<User[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [equipments, setEquipments] = useState<Equipment[]>([]);
  const [stockItems, setStockItems] = useState<StockItem[]>([]);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isPublicView, setIsPublicView] = useState(false);
  const [isPublicQuoteView, setIsPublicQuoteView] = useState(false);
  const [publicOrderId, setPublicOrderId] = useState<string | null>(null);
  const [publicQuoteId, setPublicQuoteId] = useState<string | null>(null);
  const [fetchedPublicOrder, setFetchedPublicOrder] = useState<ServiceOrder | null>(null);
  const [isFetchingPublicOrder, setIsFetchingPublicOrder] = useState(false);
  const [isSuperMode, setIsSuperMode] = useState(false);
  const [isMasterAuthenticated, setIsMasterAuthenticated] = useState(false);
  const [isImpersonating, setIsImpersonating] = useState(false);
  const [currentPortal, setCurrentPortal] = useState<'admin' | 'tech'>('admin');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showInbox, setShowInbox] = useState(false);
  const [showUrgentPopup, setShowUrgentPopup] = useState<any>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFetchingData, setIsFetchingData] = useState(false);
  const [systemNotifications, setSystemNotifications] = useState<any[]>([]);
  const [activeSystemNotification, setActiveSystemNotification] = useState<any>(null);

  const [overviewDateRange, setOverviewDateRange] = useState(getInitialDateRange());
  const [activitiesDateRange, setActivitiesDateRange] = useState(getInitialDateRange());

  const handleManualRefresh = async () => {
    try {
      setIsRefreshing(true);
      await fetchGlobalData();
      // Simula um pequeno delay para a animação ser percebida
      setTimeout(() => setIsRefreshing(false), 600);
    } catch (e) {
      console.error(e);
      setIsRefreshing(false);
    }
  };

  const handleHashChange = () => {
    const hash = window.location.hash;
    const pathname = window.location.pathname;
    const normalizedPath = pathname.replace(/\/$/, '') || '/';

    // 🛡️ PRIORIDADE 1: Detectar modo Master PRIMEIRO
    const impersonating = SessionStorage.get('is_impersonating') === true;
    const isMasterRoute = (normalizedPath === '/master' || hash === '#/master') && !impersonating;
    const masterSession = SessionStorage.get('master_session_v2') === true;

    console.log('🔍 Master Detection:', {
      pathname,
      normalizedPath,
      hash,
      isMasterRoute,
      masterSession,
      impersonating,
      sessionId: SessionStorage.getSessionId()
    });

    // Se for rota Master, seta os estados e PARA aqui
    if (isMasterRoute) {
      console.log("🛡️ Nexus Master Route Detected - Setting Super Mode");
      setIsSuperMode(true);
      setIsMasterAuthenticated(masterSession);
      setIsImpersonating(false);
      setCurrentPortal('admin'); // Master usa UI base do admin
      return; // PARA AQUI - não executa resto da lógica
    }

    // Se NÃO for Master, continua com lógica normal
    setIsSuperMode(false);
    setIsImpersonating(impersonating);

    // 🔍 DEBUG: Log de Auditoria
    if (impersonating) {
      console.log("🕵️ Modo Auditoria Ativo: Desenhando Sidebar com permissões totais");
    }

    // Detecção de Portal baseada no endereço (pathname)
    if (pathname === '/tech' || hash.includes('/tech')) {
      setCurrentPortal('tech');
    } else {
      setCurrentPortal('admin');
    }

    // Detecção de visualização pública
    if (hash.startsWith('#/view/')) {
      setPublicOrderId(hash.split('#/view/')[1]);
      setIsPublicView(true);
      setIsPublicQuoteView(false);
    } else if (hash.startsWith('#/view-quote/')) {
      setPublicQuoteId(hash.split('#/view-quote/')[1]);
      setIsPublicQuoteView(true);
      setIsPublicView(false);
    } else {
      setIsPublicView(false);
      setIsPublicQuoteView(false);
    }
  };

  useEffect(() => {
    let sub: any = null;

    // 🛡️ Timeout de Segurança (Fail-safe): Se o Supabase não responder em 2s, desbloqueia o App
    const initTimeout = setTimeout(() => {
      setIsInitializing(false);
    }, 2000);

    const initApp = async () => {
      // 🛡️ NEXUS CACHE BUSTER: Força limpeza se a versão mudar
      const CURRENT_VERSION = 'v1.1.5-cam-fix'; // v1.1.5: Final Rear Camera Fix Integration
      const storedVersion = localStorage.getItem('nexus_version');

      if (storedVersion !== CURRENT_VERSION) {
        console.log("🚀 Nova versão detectada! Limpando cache...");
        // Remove apenas chaves específicas do App para não deslogar o usuário
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('nexus_') || key.startsWith('form_')) {
            localStorage.removeItem(key);
          }
        });
        SessionStorage.clear();

        localStorage.setItem('nexus_version', CURRENT_VERSION);

        // Pequeno delay para garantir que o storage foi limpo antes do reload
        setTimeout(() => window.location.reload(), 100);
        return;
      }

      handleHashChange();
      try {
        const { supabase } = await import('./lib/supabase');
        const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
          try {
            const isMaster = window.location.pathname === '/master' || window.location.hash === '#/master';
            const isImpersonatingLocal = SessionStorage.get('is_impersonating') === true;

            if (session?.user && !isMaster && !isImpersonatingLocal) {
              // 🛡️ Nexus Safety: Timeout para sincronização de perfil (5s)
              const refreshPromise = DataService.refreshUser();
              const refreshTimeout = new Promise<null>((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_SYNC')), 5000));

              const refreshedUser = await Promise.race([refreshPromise, refreshTimeout]).catch(err => {
                console.warn("⚠️ Falha ou timeout no Sync de Perfil:", err.message);
                return null; // Fallback para cache local
              });

              if (refreshedUser) {
                setAuth(prev => {
                  if (JSON.stringify(prev.user) === JSON.stringify(refreshedUser) && prev.isAuthenticated) return prev;
                  return { user: refreshedUser, isAuthenticated: true };
                });
              } else {
                const stored = SessionStorage.get('user') || GlobalStorage.get('persistent_user');

                if (stored) {
                  setAuth(prev => {
                    if (JSON.stringify(prev.user) === JSON.stringify(stored) && prev.isAuthenticated) return prev;
                    return { user: stored, isAuthenticated: true };
                  });
                }
              }
            } else if (session?.user && (isMaster || isImpersonatingLocal)) {
              const stored = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
              if (stored) {
                setAuth(prev => {
                  if (JSON.stringify(prev.user) === JSON.stringify(stored) && prev.isAuthenticated) return prev;
                  return { user: stored, isAuthenticated: true };
                });
              }
            } else if (!session?.user && isImpersonatingLocal) {
              const stored = SessionStorage.get('user');
              if (stored) {
                setAuth(prev => {
                  if (JSON.stringify(prev.user) === JSON.stringify(stored) && prev.isAuthenticated) return prev;
                  return { user: stored, isAuthenticated: true };
                });
              }
            } else {
              // 🛡️ Nexus Auto-Login Logic: Só limpa se for um evento de logout real (Explícito)
              // Se for apenas uma falha de carregamento inicial, mas temos um persistente, mantemos o acesso.
              const isExplicitLogout = event === 'SIGNED_OUT';
              const persistent = GlobalStorage.get('persistent_user');

              if (isExplicitLogout || (!persistent && !isImpersonatingLocal)) {
                setAuth(prev => {
                  if (prev.user === null && !prev.isAuthenticated) return prev;
                  return { user: null, isAuthenticated: false };
                });
              } else if (persistent) {
                // Mantém o usuário persistente se a sessão do Supabase falhou mas não foi logout
                setAuth(prev => {
                  if (JSON.stringify(prev.user) === JSON.stringify(persistent) && prev.isAuthenticated) return prev;
                  return { user: persistent, isAuthenticated: true };
                });
              }

              if (isExplicitLogout) {
                SessionStorage.remove('user');
                SessionStorage.remove('is_impersonating');
                GlobalStorage.remove('persistent_user');
              }
            }
          } catch (error: any) {
            console.error("Auth sync error:", error);

            // 🚨 Tratamento de Empresa Suspensa (Bloqueio Total)
            if (error?.message === 'TENANT_SUSPENDED') {
              alert("🚫 ACESSO BLOQUEADO\n\nEsta empresa foi suspensa pelo administrador do sistema. Entre em contato com o suporte para regularizar sua situação.");
              setAuth({ user: null, isAuthenticated: false });
              SessionStorage.clear();
              window.location.hash = '';
              return;
            }

            const stored = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
            if (stored) {
              setAuth(prev => {
                if (JSON.stringify(prev.user) === JSON.stringify(stored) && prev.isAuthenticated) return prev;
                return { user: stored, isAuthenticated: true };
              });
            }
          } finally {
            clearTimeout(initTimeout);
            setIsInitializing(false);
          }
        });
        sub = data.subscription;
      } catch (err) {
        console.error("Critical Boot Error:", err);
        setIsInitializing(false);
      }
    };

    initApp();
    window.addEventListener('hashchange', handleHashChange);
    return () => {
      clearTimeout(initTimeout);
      if (sub) sub.unsubscribe();
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  // 📢 Nexus Messenger: Gerenciador de Comunicados Globais
  useEffect(() => {
    if (auth.isAuthenticated && auth.user && !isSuperMode) {
      DataService.getUnreadSystemNotifications(auth.user.id).then(notifs => {
        setSystemNotifications(notifs);
        if (notifs.length > 0) {
          // Pequeno delay para não sobrepor o carregamento inicial
          setTimeout(() => setActiveSystemNotification(notifs[0]), 1000);
        }
      });
    }
  }, [auth.isAuthenticated, auth.user, isSuperMode]);

  useEffect(() => {
    if (isPublicView && publicOrderId) {
      (async () => {
        try {
          setIsFetchingPublicOrder(true);
          const order = await DataService.getPublicOrderById(publicOrderId);
          setFetchedPublicOrder(order);
        } catch (e) { console.error(e); } finally { setIsFetchingPublicOrder(false); }
      })();
    } else setFetchedPublicOrder(null);
  }, [isPublicView, publicOrderId]);

  const fetchGlobalData = async () => {
    try {
      setIsFetchingData(true);

      // 🛡️ Nexus Safety Check: Verifica se a empresa não foi suspensa durante a sessão
      if (auth.user && auth.isAuthenticated && !isSuperMode) {
        try {
          await DataService.refreshUser(); // Isso já contém a lógica de expulsão se estiver suspensa
        } catch (e: any) {
          if (e.message === 'TENANT_SUSPENDED') return; // refreshUser já tratou o logout
        }
      }

      const [o, c_list, q_list, t, c, e, s] = await Promise.all([
        DataService.getOrders(),
        DataService.getContracts(),
        DataService.getQuotes(), // Carregar Orçamentos
        DataService.getAllTechnicians(),
        DataService.getCustomers(),
        DataService.getEquipments(),
        DataService.getStockItems()
      ]);
      setOrders(o);
      setContracts(c_list);
      setQuotes(q_list);
      setTechs(t);
      setCustomers(c);
      setEquipments(e);
      setStockItems(s);
    } catch (e) {
      console.error(e);
    } finally {
      setIsFetchingData(false);
    }
  };

  const handleLogout = async () => {
    if (!!import.meta.env.VITE_SUPABASE_URL) {
      const { supabase } = await import('./lib/supabase');
      await supabase.auth.signOut();
    }

    // 🧹 Limpeza Profunda: Remove dados da sessão e também o cache legado
    SessionStorage.clear();

    // Remove chaves que o script de migração tenta restaurar
    localStorage.removeItem('nexus_user');
    localStorage.removeItem('nexus_current_tenant');
    localStorage.removeItem('nexus_is_impersonating');

    setAuth({ user: null, isAuthenticated: false });
    window.location.hash = '';

    // Se estiver no portal tech ou admin, recarrega para limpar estado
    if (window.location.pathname === '/tech' || window.location.pathname === '/admin' || window.location.pathname === '/') {
      window.location.reload();
    }
  };

  const handleMasterLogout = () => {
    SessionStorage.remove('master_session_v2');
    setIsMasterAuthenticated(false);
    window.location.pathname = '/';
  };

  const createContract = async (contract: any) => {
    await DataService.createContract(contract);
    await fetchGlobalData();
  };

  const editContract = async (contract: any) => {
    await DataService.updateContract(contract);
    await fetchGlobalData();
  };

  useEffect(() => { if (auth.isAuthenticated || isMasterAuthenticated || isPublicView || isPublicQuoteView) fetchGlobalData(); }, [auth.isAuthenticated, isMasterAuthenticated, isPublicView, isPublicQuoteView]);

  useEffect(() => {
    if (!auth.isAuthenticated && !isMasterAuthenticated) return;
    (async () => {
      const { supabase } = await import('./lib/supabase');
      const channels = ['customers', 'orders', 'equipments', 'users', 'contracts', 'quotes'].map(table =>
        supabase.channel(`${table}-changes`).on('postgres_changes', { event: '*', schema: 'public', table }, async () => { await fetchGlobalData(); }).subscribe()
      );
      return () => channels.forEach(c => supabase.removeChannel(c));
    })();
  }, [auth.isAuthenticated, isMasterAuthenticated]);

  useEffect(() => {
    if (!auth.user || auth.user.role !== UserRole.ADMIN) return;

    const checkContracts = () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const newAlerts: any[] = [];

      contracts.filter(c => c.status !== OrderStatus.CANCELED && c.alertSettings?.enabled).forEach(contract => {
        const maintenanceDay = contract.maintenanceDay || 1;
        const daysBefore = contract.alertSettings?.daysBefore || 5;

        let targetDate = new Date(today.getFullYear(), today.getMonth(), maintenanceDay);
        if (today > targetDate) {
          targetDate = new Date(today.getFullYear(), today.getMonth() + 1, maintenanceDay);
        }

        const diffTime = targetDate.getTime() - today.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= daysBefore && diffDays > 0) {
          const alertId = `pmoc-alert-${contract.id}-${targetDate.getMonth() + 1}-${targetDate.getFullYear()}`;
          newAlerts.push({
            id: alertId,
            title: '⚠️ PMOC Recorrente',
            message: `Atenção: A manutenção do cliente "${contract.customerName}" está programada para daqui a ${diffDays} dias (Dia ${maintenanceDay}).`,
            date: new Date().toISOString(),
            status: 'unread'
          });
        }
      });

      setNotifications(prev => {
        const existingIds = prev.map(n => n.id);
        const filteredNew = newAlerts.filter(a => !existingIds.includes(a.id));
        return [...filteredNew, ...prev].slice(0, 50);
      });

      if (newAlerts.length > 0) {
        const todayStr = today.toISOString().split('T')[0];
        const key = `nexus_popups_${todayStr}`;
        const count = Number(localStorage.getItem(key) || 0);

        if (count < 2) {
          if (newAlerts.length > 1) {
            setShowUrgentPopup({
              id: `unified-alert-${todayStr}`,
              title: '📑 Múltiplos PMOCs Pendentes',
              message: `Atenção: Existem ${newAlerts.length} contratos aproximando-se da data de execução semanal/mensal. Verifique a central de contratos para detalhes.`,
              date: new Date().toISOString()
            });
          } else {
            setShowUrgentPopup(newAlerts[0]);
          }
          localStorage.setItem(key, String(count + 1));
        }
      }
    };

    checkContracts();
    const interval = setInterval(checkContracts, 1000 * 60 * 60);
    return () => clearInterval(interval);
  }, [contracts, auth.user]);

  if (isPublicQuoteView && publicQuoteId) {
    return <PublicQuoteView id={publicQuoteId} />;
  }

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (isPublicView && publicOrderId) {
    if (isFetchingPublicOrder) return (<div className="min-h-screen bg-[#111422] flex items-center justify-center"><Hexagon size={48} className="animate-spin text-indigo-500" /></div>);
    if (!fetchedPublicOrder) return <div className="min-h-screen bg-[#111422] flex flex-col items-center justify-center text-white"><h2>Não encontrado</h2></div>;
    return <PublicOrderView order={fetchedPublicOrder} techs={techs} />;
  }

  // 🔍 DEBUG: Log de renderização
  console.log('🎨 Render Decision:', {
    isSuperMode,
    isMasterAuthenticated,
    isAuthenticated: auth.isAuthenticated,
    currentPortal,
    pathname: window.location.pathname
  });

  if (isSuperMode && !isMasterAuthenticated) {
    console.log('✅ Renderizando: MasterLogin');
    return <MasterLogin onLogin={() => {
      console.log('🔐 Master Login Success - Setting session');
      SessionStorage.set('master_session_v2', true);
      setIsMasterAuthenticated(true);
      handleHashChange(); // Atualiza o estado após login
    }} onCancel={() => { window.location.pathname = "/"; }} />;
  }

  if (isSuperMode && isMasterAuthenticated) {
    console.log('✅ Renderizando: SuperAdminPage');
    return <SuperAdminPage onLogout={handleMasterLogout} />;
  }

  if (!auth.isAuthenticated) {
    if (currentPortal === 'tech') {
      console.log('✅ Renderizando: TechLogin');
      return <TechLogin onLogin={(user) => { SessionStorage.set('user', user); setAuth({ user, isAuthenticated: true }); }} />;
    }
    console.log('✅ Renderizando: AdminLogin');
    return <AdminLogin onLogin={(user) => { SessionStorage.set('user', user); setAuth({ user, isAuthenticated: true }); }} onToggleMaster={() => { window.location.href = window.location.origin + '/master'; }} />;
  }

  if (auth.user?.role === UserRole.TECHNICIAN) {
    return <TechDashboard
      user={auth.user}
      orders={orders.filter(o => o.assignedTo === auth.user?.id)}
      onUpdateStatus={async (id, s, n, d) => { await DataService.updateOrderStatus(id, s, n, d); await fetchGlobalData(); }}
      onRefresh={fetchGlobalData}
      onLogout={handleLogout}
      isFetching={isFetchingData}
    />;
  }

  const hasPermission = (module: keyof UserPermissions, action: 'read' | 'create' | 'update' | 'delete' | null = 'read'): boolean => {
    // 🛡️ REGRA DE OURO: Se estiver em modo Auditoria (Master acessando empresa), 
    // libera TUDO automaticamente para garantir que o Master consiga ver tudo.
    if (isImpersonating) return true;

    if (!auth.user || !auth.user.permissions) return false;

    // Para permissões booleanas diretas
    if (typeof (auth.user.permissions as any)[module] === 'boolean') {
      return (auth.user.permissions as any)[module];
    }

    // Para permissões de objeto {read, create, etc}
    if (action && (auth.user.permissions as any)[module]?.[action] !== undefined) {
      return (auth.user.permissions as any)[module][action];
    }

    return false;
  };

  console.log('🛠️ Sidebar Build:', {
    hasUser: !!auth.user,
    role: auth.user?.role,
    permissions: !!auth.user?.permissions,
    isImpersonating
  });

  const isModuleEnabled = (moduleId: string): boolean => {
    if (isImpersonating) return true;
    const user = auth.user as any;
    if (!user || !user.enabledModules) return true; // Default to shown if not loaded yet
    return user.enabledModules[moduleId] !== false;
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true, enabled: isModuleEnabled('dashboard') },
    { id: 'orders', label: 'Atividades', icon: ClipboardList, visible: hasPermission('orders', 'read'), enabled: isModuleEnabled('orders') },
    { id: 'quotes', label: 'Orçamentos', icon: DollarSign, visible: hasPermission('quotes', 'read'), enabled: isModuleEnabled('quotes') },
    { id: 'contracts', label: 'Contratos', icon: CalendarClock, visible: hasPermission('contracts', 'read'), enabled: isModuleEnabled('contracts') },
    { id: 'clients', label: 'Clientes', icon: Users, visible: hasPermission('customers', 'read'), enabled: isModuleEnabled('clients') },
    { id: 'equip', label: 'Ativos', icon: Box, visible: hasPermission('equipments', 'read'), enabled: isModuleEnabled('equip') },
    { id: 'stock', label: 'Estoque', icon: Package, visible: hasPermission('stock', 'read'), enabled: isModuleEnabled('stock') },
    { id: 'techs', label: 'Técnicos', icon: Wrench, visible: hasPermission('technicians', 'read'), enabled: isModuleEnabled('techs') },
    { id: 'forms', label: 'Processos', icon: Workflow, visible: hasPermission('forms', 'read'), enabled: isModuleEnabled('forms') },
    { id: 'users', label: 'Usuários', icon: ShieldAlert, visible: hasPermission('manageUsers'), enabled: isModuleEnabled('users') },
    { id: 'settings', label: 'Configurações', icon: Settings, visible: hasPermission('settings'), enabled: isModuleEnabled('settings') },
  ].filter(item => item.visible);

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
      <aside className="w-80 bg-[#0f172a] flex flex-col border-r border-white/5 shadow-2xl z-50 overflow-y-auto">
        <div className="p-10">
          <div className="flex items-center gap-4 mb-10"><div className="p-3 bg-indigo-600 rounded-2xl"><Hexagon size={28} className="text-white" /></div><h1 className="text-white font-black text-xl italic uppercase">Nexus<span className="text-indigo-500">.Pro</span></h1></div>
          <nav className="space-y-1">
            {menuItems.map(item => (
              <button
                key={item.id}
                onClick={() => item.enabled && setCurrentView(item.id as any)}
                disabled={!item.enabled}
                className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all relative ${!item.enabled
                  ? 'opacity-30 grayscale cursor-not-allowed text-slate-600 border border-transparent translate-x-0'
                  : currentView === item.id
                    ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 italic translate-x-1'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                  }`}
              >
                <div className="flex items-center gap-4">
                  <item.icon size={20} />
                  {item.label}
                </div>
                {!item.enabled && (
                  <Lock size={12} className="text-slate-600 animate-pulse" />
                )}
              </button>
            ))}
          </nav>
        </div>
        <div className="mt-auto p-10 space-y-4">
          {isImpersonating && (
            <button
              onClick={() => {
                SessionStorage.remove('is_impersonating');
                SessionStorage.remove('user');
                window.location.href = '/master';
              }}
              className="w-full py-5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-[2rem] text-[10px] font-black uppercase tracking-[0.2em] shadow-2xl shadow-purple-500/40 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 border border-white/20 italic"
            >
              <ShieldCheck size={18} className="animate-pulse" /> Finalizar Auditoria
            </button>
          )}
          <button
            onClick={handleLogout}
            className="w-full py-4 bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-600/20 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-3"
          >
            <LogOut size={16} /> Encerrar Sessão
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden flex flex-col relative bg-slate-50/50">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-100 px-10 flex justify-between items-center z-[100] shadow-sm">
          <div className="flex flex-col">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] italic">Nexus Pro / Enterprise Control Layer</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${!!import.meta.env.VITE_SUPABASE_URL ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500'}`}></span>
              <span className="text-[8px] font-black uppercase text-slate-300 tracking-widest">
                {!!import.meta.env.VITE_SUPABASE_URL ? 'Cloud Uplink Active' : 'Local Mode'}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex flex-col items-end border-r border-slate-200 pr-6">
              <span className="text-[10px] font-black text-slate-900 uppercase italic">{auth.user?.name}</span>
              <span className="text-[8px] font-black text-indigo-500 uppercase tracking-widest">Acesso Autorizado <span className="text-slate-300">v1.1.5</span></span>
            </div>
            <div className="relative flex items-center gap-2">
              <button
                onClick={handleManualRefresh}
                disabled={isRefreshing}
                className={`p-3 rounded-2xl border bg-white border-slate-200 text-slate-400 hover:shadow-md transition-all active:scale-95 ${isRefreshing ? 'opacity-50' : ''}`}
                title="Atualizar Dados"
              >
                <RefreshCw size={18} className={isRefreshing ? 'animate-spin text-indigo-500' : ''} />
              </button>

              <button onClick={() => setShowInbox(!showInbox)} className={`p-3 rounded-2xl border transition-all ${showInbox ? 'bg-indigo-600 text-white shadow-xl' : 'bg-white border-slate-200 text-slate-400 hover:shadow-md'}`}><Bell size={18} /></button>
              {showInbox && (
                <div className="absolute top-16 right-0 w-80 bg-white rounded-[2rem] shadow-2xl border border-slate-100 overflow-hidden animate-fade-in z-[200]">
                  <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center"><h4 className="text-[10px] font-black uppercase text-slate-900 italic">Notificações</h4><button onClick={() => setNotifications([])} className="text-[8px] font-black text-red-400 uppercase">Limpar</button></div>
                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    {notifications.map(n => (<div key={n.id} className="p-5 border-b border-slate-50 hover:bg-slate-50/50 transition-colors"><div className="flex justify-between gap-3 mb-1"><h5 className="text-[9px] font-black uppercase text-indigo-600 italic">{n.title}</h5><span className="text-[7px] text-slate-400">{new Date(n.date).toLocaleTimeString()}</span></div><p className="text-[9px] font-bold text-slate-600 leading-snug">{n.message}</p></div>))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-hidden relative">
          {currentView === 'dashboard' && (
            <AdminOverview
              orders={orders}
              contracts={contracts}
              startDate={overviewDateRange.start}
              endDate={overviewDateRange.end}
              onDateChange={(start, end) => setOverviewDateRange({ start, end })}
            />
          )}
          {currentView === 'orders' && hasPermission('orders', 'read') && (
            <AdminDashboard
              orders={orders}
              techs={techs}
              customers={customers}
              startDate={activitiesDateRange.start}
              endDate={activitiesDateRange.end}
              onDateChange={(start, end) => setActivitiesDateRange({ start, end })}
              onUpdateOrders={fetchGlobalData}
              onEditOrder={async (o) => { await DataService.updateOrder(o); await fetchGlobalData(); }}
              onCreateOrder={async (o) => { await DataService.createOrder(o as any); await fetchGlobalData(); }}
            />
          )}
          {currentView === 'contracts' && hasPermission('contracts', 'read') && <PlannedMaintenance orders={contracts} techs={techs} customers={customers} equipments={equipments} user={auth.user} onUpdateOrders={fetchGlobalData} onEditOrder={editContract} onCreateOrder={createContract} />}
          {currentView === 'quotes' && hasPermission('quotes', 'read') && (
            <QuoteManagement
              quotes={quotes}
              customers={customers}
              orders={orders}
              stockItems={stockItems}
              onUpdateQuotes={fetchGlobalData}
              onEditQuote={async (q) => { await DataService.updateQuote(q); await fetchGlobalData(); }}
              onCreateQuote={async (q) => { await DataService.createQuote(q); await fetchGlobalData(); }}
              onDeleteQuote={async (id) => { await DataService.deleteQuote(id); await fetchGlobalData(); }}
              onCreateOrder={async (o) => { await DataService.createOrder(o as any); await fetchGlobalData(); }}
            />
          )}
          {currentView === 'clients' && hasPermission('customers', 'read') && <CustomerManagement customers={customers} equipments={equipments} onUpdateCustomers={fetchGlobalData} onSwitchView={(v, p) => { setCurrentView(v); setViewParams(p); }} />}
          {currentView === 'equip' && hasPermission('equipments', 'read') && <EquipmentManagement equipments={equipments} customers={customers} onUpdateEquipments={fetchGlobalData} />}
          {currentView === 'stock' && hasPermission('stock', 'read') && <StockManagement />}
          {currentView === 'techs' && hasPermission('technicians', 'read') && <TechnicianManagement />}
          {currentView === 'forms' && hasPermission('forms', 'read') && <FormManagement />}
          {currentView === 'users' && hasPermission('manageUsers') && <UserManagement />}
          {currentView === 'settings' && hasPermission('settings') && <SettingsPage />}

          {/* Fallback para visualização proibida */}
          {['orders', 'quotes', 'contracts', 'clients', 'equip', 'stock', 'techs', 'forms', 'users', 'settings'].includes(currentView) &&
            !menuItems.find(i => i.id === currentView) && (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 p-20 text-center">
                <ShieldAlert size={48} className="mb-4 opacity-20" />
                <h2 className="text-sm font-black uppercase tracking-widest italic">Acesso Restrito</h2>
                <p className="text-[10px] font-bold uppercase mt-2">Você não possui permissões de leitura para este módulo tecnológico.</p>
                <Button onClick={() => setCurrentView('dashboard')} className="mt-8 rounded-2xl">Voltar ao Início</Button>
              </div>
            )
          }
        </div>
      </main>

      {showUrgentPopup && (
        <div className="fixed inset-0 z-[1500] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-[3rem] shadow-2xl p-10 max-w-sm text-center animate-fade-in-up border border-white/20">
            <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl mx-auto flex items-center justify-center mb-6"><Bell size={32} /></div>
            <h2 className="text-lg font-black text-slate-900 uppercase italic mb-4">Ação Preditiva</h2>
            <p className="text-[11px] font-bold text-slate-500 uppercase leading-relaxed mb-8">{showUrgentPopup.message}</p>
            <button onClick={() => { setCurrentView('contracts'); setShowUrgentPopup(null); }} className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-indigo-700 transition-all">Ver Contrato agora</button>
          </div>
        </div>
      )}

      {/* 📢 Nexus Global Alert: Modal de Comunicado do Super Admin */}
      {activeSystemNotification && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-xl animate-fade-in">
          <div className="bg-white rounded-[3.5rem] shadow-2xl p-12 max-w-lg w-full text-center border border-indigo-100 relative overflow-hidden animate-scale-in">
            {activeSystemNotification.priority === 'urgent' && (
              <div className="absolute top-0 left-0 w-full h-3 bg-red-500 animate-pulse" />
            )}

            <div className={`w-24 h-24 rounded-[2rem] mx-auto flex items-center justify-center mb-8 shadow-2xl shadow-indigo-500/10 ${activeSystemNotification.priority === 'urgent' ? 'bg-red-50 text-red-500 rotate-12' :
              activeSystemNotification.priority === 'warning' ? 'bg-amber-50 text-amber-500 -rotate-6' :
                'bg-indigo-50 text-indigo-500'
              }`}>
              {activeSystemNotification.priority === 'urgent' ? <ShieldAlert size={48} /> :
                activeSystemNotification.priority === 'warning' ? <AlertTriangle size={48} /> :
                  <ShieldCheck size={48} />}
            </div>

            <h2 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter mb-6 leading-none">
              {activeSystemNotification.title}
            </h2>

            <div className="bg-slate-50 rounded-[2rem] p-8 mb-10 text-left border border-slate-100">
              <p className="text-xs font-bold text-slate-600 leading-relaxed uppercase">
                {activeSystemNotification.content}
              </p>
            </div>

            <Button
              onClick={async () => {
                if (auth.user) {
                  try {
                    await DataService.markSystemNotificationAsRead(auth.user.id, activeSystemNotification.id);
                    const remaining = systemNotifications.filter(n => n.id !== activeSystemNotification.id);
                    setSystemNotifications(remaining);

                    // Adiciona à caixa de entrada local para consulta futura
                    setNotifications(prev => [{
                      id: activeSystemNotification.id,
                      title: `📢 ${activeSystemNotification.title}`,
                      message: activeSystemNotification.content,
                      date: activeSystemNotification.created_at || new Date().toISOString(),
                      status: 'read'
                    }, ...prev]);

                    setActiveSystemNotification(remaining.length > 0 ? remaining[0] : null);
                  } catch (e) {
                    console.error("Erro ao processar leitura:", e);
                    setActiveSystemNotification(null);
                  }
                }
              }}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl py-6 font-black uppercase tracking-[0.2em] shadow-2xl active:scale-95 transition-all italic text-xs"
            >
              Confirmar Leitura <ArrowRight size={18} className="ml-2" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
