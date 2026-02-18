
import React, { useState, useCallback } from 'react';
import {
    Hexagon, LayoutDashboard, ClipboardList, CalendarClock, Calendar,
    Users, Box, Wrench, Workflow, ShieldAlert, ShieldCheck,
    Settings, LogOut, Bell, RefreshCw, Package, ArrowRight,
    AlertTriangle, Lock, Navigation, DollarSign, ChevronLeft, ChevronRight, WifiOff, X, Phone
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { NexusBranding } from '../ui/NexusBranding';
import { User, UserRole, UserPermissions } from '../../types';
import SessionStorage from '../../lib/sessionStorage';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';

interface AdminLayoutProps {
    children: React.ReactNode;
    user: User | null;
    isImpersonating: boolean;
    onLogout: () => void;
    systemNotifications: any[];
    onManualRefresh: () => Promise<void>;
    isRefreshing: boolean;
    onToggleSidebar: () => void;
    isSidebarCollapsed: boolean;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
    children, user, isImpersonating, onLogout, systemNotifications, onManualRefresh, isRefreshing, onToggleSidebar, isSidebarCollapsed
}) => {
    const location = useLocation();
    const [showInbox, setShowInbox] = useState(false);
    const [healthReport, setHealthReport] = useState<any>(null);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isCheckingHealth, setIsCheckingHealth] = useState(false);

    // ✅ Health check local — sem depender de DataService.checkSystemHealth
    const checkSystemHealth = useCallback(async () => {
        setIsCheckingHealth(true);
        const start = Date.now();
        try {
            const { error } = await supabase.from('tenants').select('id').limit(1);
            const latency = Date.now() - start;
            const report = {
                status: error ? '❌ Erro' : '✅ Online',
                latencia_ms: latency,
                banco_de_dados: error ? `Erro: ${error.message}` : 'Conectado',
                internet: navigator.onLine ? 'Online' : 'Offline',
                cache_local: `${Object.keys(localStorage).filter(k => k.startsWith('NEXUS_CACHE_')).length} entradas`,
                timestamp: new Date().toLocaleString('pt-BR'),
            };
            setHealthReport(report);
        } catch (e: any) {
            setHealthReport({
                status: '❌ Falha',
                erro: e.message,
                internet: navigator.onLine ? 'Online' : 'Offline',
                timestamp: new Date().toLocaleString('pt-BR'),
            });
        } finally {
            setIsCheckingHealth(false);
        }
    }, []);

    React.useEffect(() => {
        const handleStatusChange = () => setIsOnline(navigator.onLine);
        window.addEventListener('online', handleStatusChange);
        window.addEventListener('offline', handleStatusChange);
        return () => {
            window.removeEventListener('online', handleStatusChange);
            window.removeEventListener('offline', handleStatusChange);
        };
    }, []);

    const hasPermission = (module: keyof UserPermissions, action: 'read' | 'create' | 'update' | 'delete' | null = 'read'): boolean => {
        if (isImpersonating) return true;
        if (!user) return false;
        if (user.role === UserRole.ADMIN) return true;
        if (!user.permissions) return false;
        const perms = user.permissions as any;
        if (typeof perms[module] === 'boolean') return perms[module];
        if (action && perms[module]?.[action] !== undefined) return perms[module][action];
        return false;
    };

    const isModuleEnabled = (moduleId: string): boolean => {
        if (isImpersonating) return true;
        if (user?.role === UserRole.ADMIN) return true;
        if (!user || !user.enabledModules) return true;
        return user.enabledModules[moduleId] !== false;
    };

    const menuItems = [
        { path: '/admin', id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, visible: true, enabled: isModuleEnabled('dashboard') },
        { path: '/admin/orders', id: 'orders', label: 'Atividade', icon: ClipboardList, visible: hasPermission('orders', 'read'), enabled: isModuleEnabled('orders') },
        { path: '/admin/calendar', id: 'calendar', label: 'Calendário', icon: Calendar, visible: hasPermission('orders', 'read'), enabled: isModuleEnabled('orders') },
        { path: '/admin/map', id: 'map', label: 'Mapa NX', icon: Navigation, visible: hasPermission('technicians', 'read'), enabled: isModuleEnabled('map') },
        { path: '/admin/financial', id: 'financial', label: 'Financeiro', icon: DollarSign, visible: hasPermission('financial', 'read'), enabled: isModuleEnabled('financial') },
        { path: '/admin/quotes', id: 'quotes', label: 'Orçamentos', icon: DollarSign, visible: hasPermission('quotes', 'read'), enabled: isModuleEnabled('quotes') },
        { path: '/admin/stock', id: 'stock', label: 'Estoque', icon: Package, visible: hasPermission('stock', 'read'), enabled: isModuleEnabled('stock') },
        { path: '/admin/contracts', id: 'contracts', label: 'Contratos', icon: CalendarClock, visible: hasPermission('contracts', 'read'), enabled: isModuleEnabled('contracts') },
        { path: '/admin/customers', id: 'clients', label: 'Cliente', icon: Users, visible: hasPermission('customers', 'read'), enabled: isModuleEnabled('clients') },
        { path: '/admin/equipments', id: 'equip', label: 'Ativos', icon: Box, visible: hasPermission('equipments', 'read'), enabled: isModuleEnabled('equip') },
        { path: '/admin/forms', id: 'forms', label: 'Formulários', icon: Workflow, visible: hasPermission('forms', 'read'), enabled: isModuleEnabled('forms') },
        { path: '/admin/technicians', id: 'techs', label: 'Técnicos', icon: Wrench, visible: hasPermission('technicians', 'read'), enabled: isModuleEnabled('techs') },
        { path: '/admin/users', id: 'users', label: 'Usuários', icon: ShieldAlert, visible: hasPermission('manageUsers'), enabled: isModuleEnabled('users') },
        { path: '/admin/settings', id: 'settings', label: 'Configurações', icon: Settings, visible: hasPermission('settings'), enabled: isModuleEnabled('settings') },
    ].filter(item => item.visible);

    const activeItem = menuItems.find(item =>
        location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path))
    );

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-sans">
            {/* Header Global */}
            <header className="h-12 bg-white text-slate-900 flex justify-between items-center z-[100] shadow-sm shrink-0 border-b border-slate-200">
                <div className="flex items-center">
                    <div className={`${isSidebarCollapsed ? 'w-16 justify-center' : 'w-52 justify-center'} transition-all duration-300 ease-in-out flex items-center overflow-hidden`}>
                        <NexusBranding variant="dark" size="lg" className="h-12" />
                    </div>

                    <div className="flex items-center gap-6 border-l border-slate-100 pl-6 h-8 ml-4">
                        <h2 className="text-sm font-semibold text-slate-900 capitalize tracking-tight">
                            {activeItem?.label || 'Dashboard'}
                        </h2>
                        {(isRefreshing) && (
                            <div className="flex items-center gap-2 px-2 py-1 bg-slate-50 text-slate-400 rounded border border-slate-200">
                                <RefreshCw size={12} className="animate-spin" />
                                <span className="text-[10px] font-medium uppercase tracking-wider">Sincronizando</span>
                            </div>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-6 pr-4">
                    <div className="flex flex-col items-end border-r border-slate-100 pr-6">
                        <span className="text-sm font-semibold text-slate-900 tracking-tight">{user?.name}</span>
                        <span className="text-[10px] font-medium text-slate-400 uppercase tracking-tighter">Administrador</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {!isOnline && (
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-rose-500/20 border border-rose-500/40 rounded-full text-rose-200">
                                <WifiOff size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Offline</span>
                            </div>
                        )}
                        <button
                            onClick={checkSystemHealth}
                            disabled={isCheckingHealth}
                            className="p-2 text-slate-400 hover:text-[#1c2d4f] hover:bg-slate-50 rounded-md transition-all disabled:opacity-50"
                            title="Saúde do Sistema"
                        >
                            {isCheckingHealth
                                ? <RefreshCw size={20} className="animate-spin" />
                                : <ShieldCheck size={20} />}
                        </button>
                        <button
                            onClick={onManualRefresh}
                            disabled={isRefreshing}
                            className="p-2 text-slate-400 hover:text-[#1c2d4f] hover:bg-slate-50 rounded-md transition-all"
                            title="Atualizar Dados"
                        >
                            <RefreshCw size={20} className={isRefreshing ? 'animate-spin text-[#1c2d4f]' : ''} />
                        </button>
                        <button onClick={() => setShowInbox(!showInbox)} className="p-2 text-slate-400 hover:text-[#1c2d4f] hover:bg-slate-50 rounded-md transition-all relative">
                            <Bell size={20} />
                            {systemNotifications.length > 0 && <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>}
                        </button>
                    </div>
                </div>
            </header>

            <div className="flex flex-1 overflow-hidden">
                <aside className={`${isSidebarCollapsed ? 'w-16' : 'w-52'} bg-[#1c2d4f] h-full flex flex-col shadow-none z-50 transition-all duration-300 ease-in-out relative border-r border-white/5`}>
                    <button
                        onClick={onToggleSidebar}
                        className="absolute -right-3 top-6 w-6 h-6 bg-[#1c2d4f] text-white/50 border border-white/10 rounded-full flex items-center justify-center hover:text-white transition-all z-[60]"
                    >
                        {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>

                    <div className={`flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
                        <nav className="space-y-1">
                            {menuItems.map(item => {
                                const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path));
                                return (
                                    <Link
                                        key={item.id}
                                        to={item.enabled ? item.path : '#'}
                                        onClick={(e) => !item.enabled && e.preventDefault()}
                                        className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3'} py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${!item.enabled
                                            ? 'opacity-20 grayscale cursor-not-allowed'
                                            : isActive
                                                ? 'bg-white/10 text-white shadow-sm'
                                                : 'text-white/70 hover:text-white hover:bg-white/5'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <item.icon size={18} className={`${isActive ? 'text-white' : 'text-white/60'}`} />
                                            {!isSidebarCollapsed && <span>{item.label}</span>}
                                        </div>
                                    </Link>
                                );
                            })}
                        </nav>

                        <div className="mt-6 pt-4 border-t border-white/5 mx-2">
                            <a
                                href="https://wa.me/553534227420"
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`w-full flex items-center ${isSidebarCollapsed ? 'justify-center px-0' : 'px-3 justify-start'} py-2.5 rounded-lg transition-all duration-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 group`}
                                title="Suporte Técnico"
                            >
                                <div className="flex items-center gap-3">
                                    <div className="p-1.5 bg-emerald-500/20 rounded-md group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                        <Phone size={14} className="text-emerald-400 group-hover:text-white" />
                                    </div>
                                    {!isSidebarCollapsed && (
                                        <div className="flex flex-col">
                                            <span className="text-[10px] font-black uppercase tracking-widest text-emerald-100/90 group-hover:text-white">Suporte</span>
                                            <span className="text-[8px] font-bold text-emerald-500/80 group-hover:text-emerald-400">Online Agora</span>
                                        </div>
                                    )}
                                </div>
                            </a>
                        </div>
                    </div>

                    <div className={`shrink-0 p-4 border-t border-white/5 flex flex-col gap-2 ${isSidebarCollapsed ? 'items-center' : ''}`}>
                        {isImpersonating && (
                            <button
                                onClick={() => { SessionStorage.remove('is_impersonating'); onLogout(); }}
                                className="w-full py-2.5 bg-primary-600/20 text-primary-100 rounded-md text-xs font-semibold hover:bg-primary-600/30 transition-all border border-primary-500/20"
                            >
                                <ShieldCheck size={16} className="inline mr-2" /> {!isSidebarCollapsed && "Finalizar Auditoria"}
                            </button>
                        )}
                        <button
                            onClick={onLogout}
                            className="w-full py-2 text-white/40 hover:text-rose-400 hover:bg-rose-500/5 rounded-md text-[10px] font-bold uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                        >
                            <LogOut size={14} /> {!isSidebarCollapsed && "Sair da Conta"}
                        </button>
                    </div>
                </aside>

                <main className="flex-1 overflow-hidden flex flex-col relative bg-slate-50/50">
                    <div className="flex-1 overflow-hidden relative">
                        {children}
                    </div>
                </main>
            </div>

            {healthReport && (
                <div className="fixed inset-0 z-[2000] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-xl max-w-xl w-full border border-slate-200 overflow-hidden">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900">Status do Ecossistema</h3>
                                <p className="text-xs text-slate-500">Diagnóstico de infraestrutura e performance.</p>
                            </div>
                            <button onClick={() => setHealthReport(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-all"><X size={20} /></button>
                        </div>
                        <div className="p-8">
                            {/* ... Status Body ... */}
                            <pre className="text-xs bg-slate-100 p-4 rounded text-slate-600 mb-4 overflow-auto max-h-40">{JSON.stringify(healthReport, null, 2)}</pre>
                            <div className="flex gap-3">
                                <Button onClick={checkSystemHealth} disabled={isCheckingHealth} className="flex-1 h-11">
                                    {isCheckingHealth ? 'Verificando...' : 'Recarregar Status'}
                                </Button>
                                <Button variant="secondary" onClick={() => (window as any).NexusTelemetry?.downloadLogs()} className="px-6 h-11 text-slate-600 border border-slate-200">Baixar Logs</Button>
                                <Button variant="secondary" onClick={() => window.location.reload()} className="px-6 h-11 bg-rose-50 text-rose-600 hover:bg-rose-100 border-rose-100">Reload App</Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
