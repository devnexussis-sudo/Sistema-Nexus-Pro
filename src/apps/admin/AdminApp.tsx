
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
import {
    Hexagon, LayoutDashboard, ClipboardList, CalendarClock, Calendar,
    Users, Box, Wrench, Workflow, ShieldAlert, ShieldCheck,
    Settings, LogOut, Bell, RefreshCw, Package, ArrowRight,
    AlertTriangle, Lock, Navigation, DollarSign, ChevronLeft, ChevronRight
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

    const fetchGlobalData = async () => {
        try {
            setIsFetchingData(true);
            const [o, c_list, q_list, t, c, e, s] = await Promise.all([
                DataService.getOrders(),
                DataService.getContracts(),
                DataService.getQuotes(),
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
        await fetchGlobalData();
        // Garante pelo menos 1s de feedback visual
        setTimeout(() => setIsRefreshing(false), 1000);
    };

    const hasPermission = (module: keyof UserPermissions, action: 'read' | 'create' | 'update' | 'delete' | null = 'read'): boolean => {
        if (isImpersonating) return true;
        if (!auth.user || !auth.user.permissions) return false;
        if (typeof (auth.user.permissions as any)[module] === 'boolean') {
            return (auth.user.permissions as any)[module];
        }
        if (action && (auth.user.permissions as any)[module]?.[action] !== undefined) {
            return (auth.user.permissions as any)[module][action];
        }
        return false;
    };

    const isModuleEnabled = (moduleId: string): boolean => {
        if (isImpersonating) return true;
        const user = auth.user as any;
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
            <aside className={`${isSidebarCollapsed ? 'w-20' : 'w-56'} bg-[#0f172a] h-screen flex flex-col border-r border-white/5 shadow-2xl z-50 transition-all duration-300 ease-in-out relative overflow-hidden`}>
                <button
                    onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
                    className="absolute -right-3 top-20 w-6 h-6 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg hover:bg-indigo-700 transition-all z-[60] border border-white/10"
                >
                    {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                <div className={`flex-1 overflow-y-auto overflow-x-hidden p-5 custom-scrollbar ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
                    <div className={`flex items-center gap-3 mb-8 transition-all ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <div className="p-2 bg-indigo-600 rounded-xl shrink-0">
                            <Hexagon size={20} className="text-white" />
                        </div>
                        {!isSidebarCollapsed && (
                            <h1 className="text-white font-black text-base italic uppercase">
                                Nexus<span className="text-indigo-500">.Pro</span>
                            </h1>
                        )}
                    </div>

                    <nav className="space-y-1">
                        {menuItems.map(item => (
                            <button
                                key={item.id}
                                onClick={() => item.enabled && setCurrentView(item.id as any)}
                                disabled={!item.enabled}
                                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'justify-between px-5'} py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all relative overflow-hidden ${!item.enabled
                                    ? 'opacity-30 grayscale cursor-not-allowed'
                                    : currentView === item.id
                                        ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-600/20 italic translate-x-1'
                                        : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
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

                <div className={`shrink-0 p-5 space-y-3 border-t border-white/5 bg-[#0f172a] ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
                    {isImpersonating && (
                        <button
                            onClick={() => { SessionStorage.remove('is_impersonating'); onLogout(); }}
                            className="w-full py-4 bg-purple-600 text-white rounded-2xl text-[10px] font-black uppercase"
                        >
                            <ShieldCheck size={18} /> {!isSidebarCollapsed && "Finalizar Auditoria"}
                        </button>
                    )}
                    <button onClick={onLogout} className="w-full py-4 bg-red-600/10 text-red-500 rounded-2xl text-[10px] font-black uppercase flex items-center justify-center gap-3">
                        <LogOut size={16} /> {!isSidebarCollapsed && "Sair"}
                    </button>
                </div>
            </aside>

            <main className="flex-1 overflow-hidden flex flex-col relative bg-slate-50/50">
                <header className="h-16 bg-white/80 backdrop-blur-md border-b border-slate-100 px-8 flex justify-between items-center z-[100] shadow-sm">
                    <div className="flex flex-col">
                        <p className="text-[9px] font-black text-slate-400 uppercase italic">Nexus Pro / Enterprise Control Layer</p>
                    </div>
                    <div className="flex items-center gap-6">
                        <div className="flex flex-col items-end border-r border-slate-200 pr-6">
                            <span className="text-[10px] font-black text-slate-900 uppercase italic">{auth.user?.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleManualRefresh}
                                disabled={isRefreshing}
                                className="p-2.5 rounded-2xl border bg-white shadow-sm hover:bg-slate-50 active:scale-95 transition-all text-slate-600 hover:text-indigo-600"
                                title="Atualizar Dados"
                            >
                                <RefreshCw size={18} className={isRefreshing ? 'animate-spin text-indigo-600' : ''} />
                            </button>
                            <button onClick={() => setShowInbox(!showInbox)} className="p-2.5 rounded-2xl border bg-white"><Bell size={18} /></button>
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
                    {currentView === 'financial' && <FinancialDashboard orders={orders} quotes={quotes} />}
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
            {activeSystemNotification && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-900/80 backdrop-blur-xl">
                    <div className="bg-white rounded-[3.5rem] p-12 max-w-lg w-full text-center border relative">
                        <h2 className="text-3xl font-black uppercase italic mb-6">{activeSystemNotification.title}</h2>
                        <p className="text-xs font-bold text-slate-600 leading-relaxed uppercase mb-10">{activeSystemNotification.content}</p>
                        <Button onClick={() => { onMarkNotificationRead(activeSystemNotification.id); setActiveSystemNotification(null); }} className="w-full bg-slate-900 text-white rounded-2xl py-6 font-black uppercase">Confirmar Leitura</Button>
                    </div>
                </div>
            )}
        </div>
    );
};
