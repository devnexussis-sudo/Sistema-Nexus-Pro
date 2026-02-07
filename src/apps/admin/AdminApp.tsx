
import React, { useState, useEffect } from 'react';
import { AdminLogin } from '../../components/admin/AdminLogin';
import { AdminDashboard } from '../../components/admin/AdminDashboard';
import { AdminOverview } from '../../components/admin/AdminOverview';
import { CustomerManagement } from '../../components/admin/CustomerManagement';
import { EquipmentManagement } from '../../components/admin/EquipmentManagement';
import { TechnicianManagement } from '../../components/admin/TechnicianManagement';
import { FormManagement } from '../../components/admin/FormManagement';
import { SettingsPage } from '../../components/admin/SettingsPage';
import { UserManagement } from '../../components/admin/UserManagement';
import { StockManagement } from '../../components/admin/StockManagement';
import { FinancialDashboard } from '../../components/admin/FinancialDashboard';
import { TechnicianMap } from '../../components/admin/TechnicianMap';
import { OrderCalendar } from '../../components/admin/OrderCalendar';
import { PlannedMaintenance } from '../../components/admin/PlannedMaintenance';
import { QuoteManagement } from '../../components/admin/QuoteManagement';
import { DataService } from '../../services/dataService';
import SessionStorage from '../../lib/sessionStorage';
import { useQuery } from '../../hooks/useQuery';
import {
    Hexagon, LayoutDashboard, ClipboardList, CalendarClock, Calendar,
    Users, Box, Wrench, Workflow, ShieldAlert, ShieldCheck,
    Settings, LogOut, Bell, RefreshCw, Package, ArrowRight,
    AlertTriangle, Lock, Navigation, DollarSign, ChevronLeft, ChevronRight, WifiOff, X
} from 'lucide-react';
import { AuthState, User, UserRole, UserPermissions, ServiceOrder, OrderStatus, Customer, Equipment, StockItem } from '../../types';
import { Button } from '../../components/ui/Button';

interface AdminAppProps {
    auth: AuthState;
    onLogin: (user: User) => void;
    onLogout: () => void;
    isImpersonating: boolean;
    onToggleMaster: () => void;
    systemNotifications: any[];
    onMarkNotificationRead: (id: string) => void;
}

const getInitialDateRange = () => ({ start: '', end: '' });

export const AdminApp: React.FC<AdminAppProps> = ({
    auth, onLogin, onLogout, isImpersonating, onToggleMaster,
    systemNotifications, onMarkNotificationRead
}) => {
    const [currentView, setCurrentView] = useState<any>('dashboard');
    const [orders, setOrders] = useState<ServiceOrder[]>([]);
    const [contracts, setContracts] = useState<any[]>([]);
    const [quotes, setQuotes] = useState<any[]>([]);
    const [techs, setTechs] = useState<User[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [equipments, setEquipments] = useState<Equipment[]>([]);
    const [stockItems, setStockItems] = useState<StockItem[]>([]);
    const [isFetchingData, setIsFetchingData] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [showInbox, setShowInbox] = useState(false);
    const [showUrgentPopup, setShowUrgentPopup] = useState<any>(null);
    const [overviewDateRange, setOverviewDateRange] = useState(getInitialDateRange());
    const [activitiesDateRange, setActivitiesDateRange] = useState(getInitialDateRange());
    const [activeSystemNotification, setActiveSystemNotification] = useState<any>(null);
    const [healthReport, setHealthReport] = useState<any>(null);

    // 🛡️ Big-Tech Resilience Layer: Hooks de busca automática com Retry
    const { data: oData, isLoading: oLoading, refetch: oRefetch, isError: oError } = useQuery('orders', DataService.getOrders, { enabled: !!auth.isAuthenticated });
    const { data: cData, isLoading: cLoading, refetch: cRefetch } = useQuery('contracts', DataService.getContracts, { enabled: !!auth.isAuthenticated });
    const { data: qData, isLoading: qLoading, refetch: qRefetch } = useQuery('quotes', DataService.getQuotes, { enabled: !!auth.isAuthenticated });
    const { data: tData, isLoading: tLoading, refetch: tRefetch } = useQuery('techs', DataService.getAllTechnicians, { enabled: !!auth.isAuthenticated });
    const { data: custData, isLoading: custLoading, refetch: custRefetch } = useQuery('customers', DataService.getCustomers, { enabled: !!auth.isAuthenticated });
    const { data: eData, isLoading: eLoading, refetch: eRefetch } = useQuery('equipments', DataService.getEquipments, { enabled: !!auth.isAuthenticated });
    const { data: sData, isLoading: sLoading, refetch: sRefetch } = useQuery('stock', DataService.getStockItems, { enabled: !!auth.isAuthenticated });

    // Sincronizar estados locais para compatibilidade com componentes filhos
    useEffect(() => { if (oData) setOrders(oData); }, [oData]);
    useEffect(() => { if (cData) setContracts(cData); }, [cData]);
    useEffect(() => { if (qData) setQuotes(qData); }, [qData]);
    useEffect(() => { if (tData) setTechs(tData); }, [tData]);
    useEffect(() => { if (custData) setCustomers(custData); }, [custData]);
    useEffect(() => { if (eData) setEquipments(eData); }, [eData]);
    useEffect(() => { if (sData) setStockItems(sData); }, [sData]);

    const isFetchingAny = oLoading || cLoading || qLoading || tLoading || custLoading || eLoading || sLoading;

    useEffect(() => {
        if (auth.user?.role !== UserRole.ADMIN) return;

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

    const [isOnline, setIsOnline] = useState(navigator.onLine);

    useEffect(() => {
        const handleStatusChange = () => {
            setIsOnline(navigator.onLine);
        };
        window.addEventListener('online', handleStatusChange);
        window.addEventListener('offline', handleStatusChange);
        return () => {
            window.removeEventListener('online', handleStatusChange);
            window.removeEventListener('offline', handleStatusChange);
        };
    }, []);

    const fetchGlobalData = async () => {
        await Promise.all([
            oRefetch(), cRefetch(), qRefetch(), tRefetch(), custRefetch(), eRefetch(), sRefetch()
        ]);
    };

    useEffect(() => {
        if (auth.isAuthenticated) fetchGlobalData();
    }, [auth.isAuthenticated]);

    useEffect(() => {
        if (systemNotifications.length > 0 && !activeSystemNotification) {
            setActiveSystemNotification(systemNotifications[0]);
        }
    }, [systemNotifications]);

    const handleManualRefresh = async () => {
        if (isRefreshing) return;
        setIsRefreshing(true);
        console.log('[AdminApp] 🔄 Atualizando dados manualmente...');

        try {
            await fetchGlobalData();
        } catch (e) {
            console.error('[AdminApp] Erro no refresh manual:', e);
        } finally {
            // Garante feedback visual mínimo e desliga o spinner SEMPRE
            setTimeout(() => setIsRefreshing(false), 1000);
        }
    };

    const hasPermission = (module: keyof UserPermissions, action: 'read' | 'create' | 'update' | 'delete' | null = 'read'): boolean => {
        if (isImpersonating) return true;
        if (!auth.user) return false;

        // Administradores têm acesso total por padrão
        if (auth.user.role === UserRole.ADMIN) return true;
        if (!auth.user.permissions) return false;

        const perms = auth.user.permissions as any;
        if (typeof perms[module] === 'boolean') {
            return perms[module];
        }
        if (action && perms[module]?.[action] !== undefined) {
            return perms[module][action];
        }
        return false;
    };

    const isModuleEnabled = (moduleId: string): boolean => {
        if (isImpersonating) return true;
        const user = auth.user as any;

        // Administradores vêem tudo habilitado por padrão
        if (user?.role === UserRole.ADMIN) return true;
        if (!user || !user.enabledModules) return true;
        return user.enabledModules[moduleId] !== false;
    };

    if (!auth.isAuthenticated) {
        return <AdminLogin onLogin={onLogin} onToggleMaster={onToggleMaster} />;
    }

    const menuItems = [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true, enabled: isModuleEnabled('dashboard') },
        { id: 'orders', label: 'Atividade', icon: ClipboardList, visible: hasPermission('orders', 'read'), enabled: isModuleEnabled('orders') },
        { id: 'calendar', label: 'Calendário', icon: Calendar, visible: hasPermission('orders', 'read'), enabled: isModuleEnabled('orders') },
        { id: 'map', label: 'Mapa NX', icon: Navigation, visible: hasPermission('technicians', 'read'), enabled: isModuleEnabled('map') },
        { id: 'financial', label: 'Financeiro', icon: DollarSign, visible: hasPermission('financial', 'read'), enabled: isModuleEnabled('financial') },
        { id: 'quotes', label: 'Orçamentos', icon: DollarSign, visible: hasPermission('quotes', 'read'), enabled: isModuleEnabled('quotes') },
        { id: 'stock', label: 'Estoque', icon: Package, visible: hasPermission('stock', 'read'), enabled: isModuleEnabled('stock') },
        { id: 'contracts', label: 'Contratos', icon: CalendarClock, visible: hasPermission('contracts', 'read'), enabled: isModuleEnabled('contracts') },
        { id: 'clients', label: 'Cliente', icon: Users, visible: hasPermission('customers', 'read'), enabled: isModuleEnabled('clients') },
        { id: 'equip', label: 'Ativos', icon: Box, visible: hasPermission('equipments', 'read'), enabled: isModuleEnabled('equip') },
        { id: 'forms', label: 'Formulários', icon: Workflow, visible: hasPermission('forms', 'read'), enabled: isModuleEnabled('forms') },
        { id: 'techs', label: 'Técnicos', icon: Wrench, visible: hasPermission('technicians', 'read'), enabled: isModuleEnabled('techs') },
        { id: 'users', label: 'Usuários', icon: ShieldAlert, visible: hasPermission('manageUsers'), enabled: isModuleEnabled('users') },
        { id: 'settings', label: 'Configurações', icon: Settings, visible: hasPermission('settings'), enabled: isModuleEnabled('settings') },
    ].filter(item => item.visible);

    return (
        <div className="flex h-screen bg-[#f8fafc] overflow-hidden">
            <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-56'} bg-primary-500 h-screen flex flex-col border-r border-white/5 shadow-none z-50 transition-all duration-300 ease-in-out relative overflow-hidden`}>
                <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="absolute -right-3 top-20 w-6 h-6 bg-primary-600 text-white rounded-full flex items-center justify-center shadow-md hover:bg-primary-700 transition-all z-[60] border border-white/10"
                >
                    {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                <div className={`flex-1 overflow-y-auto overflow-x-hidden p-5 custom-scrollbar ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
                    <div className={`flex items-center gap-3 mb-8 transition-all ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <div className="p-2 bg-white/10 rounded-lg shrink-0">
                            <Hexagon size={20} className="text-white" />
                        </div>
                        {!isSidebarCollapsed && (
                            <h1 className="text-white font-black text-base italic uppercase">
                                Nexus<span className="text-primary-300">.Pro</span>
                            </h1>
                        )}
                    </div>

                    <nav className="space-y-1">
                        {menuItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => item.enabled && setCurrentView(item.id as any)}
                                disabled={!item.enabled}
                                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-between px-5'} py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all duration-200 relative overflow-hidden ${!item.enabled
                                    ? 'opacity-30 grayscale cursor-not-allowed'
                                    : currentView === item.id
                                        ? 'bg-white/10 text-white italic translate-x-1'
                                        : 'text-primary-200 hover:text-white hover:bg-white/5'
                                    }`}
                            >
                                <div className="flex items-center gap-3">
                                    <item.icon size={18} />
                                    {!isSidebarCollapsed && <span>{item.label}</span>}
                                </div>
                            </button>
                        ))}
                    </nav>
                </div>

                <div className={`shrink-0 p-5 space-y-3 border-t border-white/5 bg-primary-600/20 ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
                    {isImpersonating && (
                        <button
                            onClick={() => { SessionStorage.remove('is_impersonating'); onLogout(); }}
                            className="w-full py-4 bg-purple-600 text-white rounded-lg text-[10px] font-black uppercase transition-all duration-200"
                        >
                            <ShieldCheck size={18} /> {!isSidebarCollapsed && "Finalizar Auditoria"}
                        </button>
                    )}
                    <button onClick={onLogout} className="w-full py-4 bg-red-600/10 text-red-500 rounded-lg text-[10px] font-black uppercase flex items-center justify-center gap-3 transition-all duration-200">
                        <LogOut size={16} /> {!isSidebarCollapsed && "Sair"}
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-hidden flex flex-col relative bg-slate-50/50">
                <header className="h-16 bg-white border-b border-slate-200 px-8 flex justify-between items-center z-[100]">
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col">
                            <p className="text-[9px] font-black text-slate-400 uppercase italic">Nexus Pro / Enterprise High-Performance</p>
                        </div>
                        {(isRefreshing || isFetchingAny) && (
                            <div className="flex items-center gap-2 px-3 py-1 bg-primary-50 text-primary-600 rounded-full border border-primary-100">
                                <RefreshCw size={10} className="animate-spin" />
                                <span className="text-[8px] font-black uppercase tracking-widest">Sincronizando...</span>
                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end border-r border-slate-200 pr-6">
                            <span className="text-[10px] font-black text-primary-500 uppercase italic">{auth.user?.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {!isOnline && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full animate-pulse">
                                    <WifiOff size={14} className="text-red-500" />
                                    <span className="text-[10px] font-black text-red-500 uppercase tracking-widest">Offline</span>
                                </div>
                            )}
                            <button
                                onClick={async () => setHealthReport(await DataService.checkSystemHealth())}
                                className={`p-2 rounded-lg border ${oError ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-slate-400 border-slate-200'} hover:border-primary-500 transition-all duration-200`}
                                title="Status do Sistema"
                            >
                                <ShieldCheck size={18} />
                            </button>
                            <button
                                onClick={handleManualRefresh}
                                disabled={isRefreshing}
                                className="p-2 rounded-lg border bg-white border-slate-200 hover:border-primary-500 transition-all duration-200 text-slate-400 hover:text-primary-500"
                                title="Atualizar Dados"
                            >
                                <RefreshCw size={18} className={isRefreshing || isFetchingAny ? 'animate-spin text-primary-500' : ''} />
                            </button>
                            <button onClick={() => setShowInbox(!showInbox)} className="p-2 rounded-lg border border-slate-200 bg-white text-slate-400 hover:border-primary-500 transition-all duration-200 relative">
                                <Bell size={18} />
                                {systemNotifications.length > 0 && <span className="absolute top-2 right-2 w-2 h-2 bg-rose-500 rounded-full border border-white"></span>}
                            </button>
                        </div>
                    </div>
                </header>

                <div className="flex-1 overflow-hidden relative">
                    {currentView === 'dashboard' && <AdminOverview orders={orders} contracts={contracts} techs={techs} customers={customers} startDate={overviewDateRange.start} endDate={overviewDateRange.end} onDateChange={(start, end) => setOverviewDateRange({ start, end })} onSwitchView={(v) => setCurrentView(v as any)} />}
                    {currentView === 'orders' && <AdminDashboard orders={orders} techs={techs} customers={customers} startDate={activitiesDateRange.start} endDate={activitiesDateRange.end} onDateChange={(start, end) => setActivitiesDateRange({ start, end })} onUpdateOrders={fetchGlobalData} onEditOrder={async (o) => { await DataService.updateOrder(o); await fetchGlobalData(); }} onCreateOrder={async (o) => { await DataService.createOrder(o as any); await fetchGlobalData(); }} />}
                    {currentView === 'contracts' && <PlannedMaintenance orders={contracts} techs={techs} customers={customers} equipments={equipments} user={auth.user} onUpdateOrders={fetchGlobalData} onEditOrder={async (c) => { await DataService.updateContract(c); await fetchGlobalData(); }} onCreateOrder={async (c) => { await DataService.createContract(c); await fetchGlobalData(); }} />}
                    {currentView === 'quotes' && <QuoteManagement quotes={quotes} customers={customers} orders={orders} stockItems={stockItems} onUpdateQuotes={fetchGlobalData} onEditQuote={async (q) => { await DataService.updateQuote(q); await fetchGlobalData(); }} onCreateQuote={async (q) => { await DataService.createQuote(q); await fetchGlobalData(); }} onDeleteQuote={async (id) => { await DataService.deleteQuote(id); await fetchGlobalData(); }} onCreateOrder={async (o) => { await DataService.createOrder(o as any); await fetchGlobalData(); }} />}
                    {currentView === 'clients' && <CustomerManagement customers={customers} equipments={equipments} onUpdateCustomers={fetchGlobalData} onSwitchView={(v, p) => setCurrentView(v)} />}
                    {currentView === 'equip' && <EquipmentManagement equipments={equipments} customers={customers} onUpdateEquipments={fetchGlobalData} />}
                    {currentView === 'stock' && <StockManagement />}
                    {currentView === 'techs' && <TechnicianManagement />}
                    {currentView === 'map' && <TechnicianMap />}
                    {currentView === 'forms' && <FormManagement />}
                    {currentView === 'users' && <UserManagement />}
                    {currentView === 'settings' && <SettingsPage />}
                    {currentView === 'financial' && <FinancialDashboard orders={orders} quotes={quotes} techs={techs} onRefresh={fetchGlobalData} />}
                    {currentView === 'calendar' && <OrderCalendar orders={orders} techs={techs} customers={customers} />}
                </div>
            </main>

            {/* Popups de Ação Preditiva */}
            {showUrgentPopup && (
                <div className="fixed inset-0 z-[1500] flex items-center justify-center p-6 bg-slate-900/40 backdrop-blur-sm">
                    <div className="bg-white rounded-[3rem] shadow-2xl p-10 max-w-sm text-center border border-white/20">
                        <div className="w-16 h-16 bg-amber-100 text-amber-600 rounded-2xl mx-auto flex items-center justify-center mb-6"><Bell size={32} /></div>
                        <h2 className="text-lg font-black text-slate-900 uppercase italic mb-4">Ação Preditiva</h2>
                        <p className="text-[11px] font-bold text-slate-500 uppercase leading-relaxed mb-8">{showUrgentPopup.message}</p>
                        <button onClick={() => { setCurrentView('contracts'); setShowUrgentPopup(null); }} className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase shadow-xl hover:bg-indigo-700 transition-all">Ver Contrato agora</button>
                    </div>
                </div>
            )}

            {/* Popups e Notificações do Sistema */}
            {/* Modal de Diagnóstico de Saúde do Sistema */}
            {healthReport && (
                <div className="fixed inset-0 z-[2500] flex items-center justify-center p-6 bg-slate-900/90 backdrop-blur-2xl">
                    <div className="bg-white rounded-[4rem] p-12 max-w-2xl w-full shadow-2xl border border-white/20 overflow-hidden relative">
                        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/5 rounded-full -mr-32 -mt-32 blur-3xl"></div>
                        <div className="relative z-10">
                            <div className="flex justify-between items-center mb-10">
                                <div>
                                    <h2 className="text-3xl font-black uppercase italic tracking-tighter">Diagnóstico Nexus</h2>
                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mt-1">Camada de Resiliência Big-Tech</p>
                                </div>
                                <button onClick={() => setHealthReport(null)} className="p-4 bg-slate-100 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all"><X size={24} /></button>
                            </div>

                            <div className="grid grid-cols-2 gap-6 mb-10">
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Conectividade</p>
                                    <p className={`text-sm font-black uppercase italic ${healthReport.connectivity === 'Healthy' ? 'text-emerald-600' : 'text-rose-600'}`}>{healthReport.connectivity}</p>
                                </div>
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Autenticação</p>
                                    <p className="text-sm font-black uppercase italic text-slate-700">{healthReport.auth}</p>
                                </div>
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Tenant ID</p>
                                    <p className="text-sm font-mono text-slate-500 truncate">{healthReport.tenantId || 'NÃO IDENTIFICADO'}</p>
                                </div>
                                <div className="p-6 bg-slate-50 rounded-3xl border border-slate-100">
                                    <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Latência</p>
                                    <p className="text-sm font-black text-indigo-600 uppercase italic">{healthReport.latency || 'N/D'}</p>
                                </div>
                            </div>

                            {healthReport.diagnosis && (
                                <div className="p-8 bg-amber-50 border border-amber-200 rounded-[2.5rem] mb-10">
                                    <div className="flex items-center gap-3 mb-3 text-amber-700">
                                        <AlertTriangle size={20} />
                                        <p className="text-[11px] font-black uppercase italic">Análise de Falha Identificada</p>
                                    </div>
                                    <p className="text-xs font-bold text-amber-900 leading-relaxed uppercase">{healthReport.diagnosis}</p>
                                </div>
                            )}

                            <div className="flex gap-4">
                                <Button onClick={async () => setHealthReport(await DataService.checkSystemHealth())} className="flex-1 bg-indigo-600 text-white rounded-2xl py-6 font-black uppercase text-xs italic tracking-widest shadow-xl shadow-indigo-600/20">Reciclar Conexão</Button>
                                <Button onClick={() => window.location.reload()} className="px-10 bg-slate-100 text-slate-600 rounded-2xl py-6 font-black uppercase text-xs">Reload</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
