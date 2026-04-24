
import React, { useState, useCallback } from 'react';
import {
    Hexagon, LayoutDashboard, ClipboardList, CalendarClock, Calendar,
    Users, Box, Wrench, Workflow, ShieldAlert, ShieldCheck,
    Settings, LogOut, Bell, Package, ArrowRight, FileText,
    AlertTriangle, Lock, Navigation, DollarSign, ChevronLeft, ChevronRight, WifiOff, X, Phone
} from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { NexusBranding } from '../ui/NexusBranding';
import { User, UserRole, UserPermissions } from '../../types';
import SessionStorage from '../../lib/sessionStorage';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';

import { ResilienceIndicator } from '../ResilienceIndicator';

interface AdminLayoutProps {
    children: React.ReactNode;
    user: User | null;
    tenant: any | null;
    isImpersonating: boolean;
    onLogout: () => void;
    systemNotifications: any[];
    onToggleSidebar: () => void;
    isSidebarCollapsed: boolean;
    onMarkNotificationRead?: (id: string) => void;
}

export const AdminLayout: React.FC<AdminLayoutProps> = ({
    children, user, tenant, isImpersonating, onLogout, systemNotifications, onToggleSidebar, isSidebarCollapsed, onMarkNotificationRead
}) => {
    const location = useLocation();
    const [showInbox, setShowInbox] = useState(false);

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
        { path: '/admin/calendar', id: 'calendar', label: 'Agenda', icon: Calendar, visible: hasPermission('orders', 'read'), enabled: isModuleEnabled('orders') },
        { path: '/admin/map', id: 'map', label: 'Visão de campo', icon: Navigation, visible: hasPermission('technicians', 'read'), enabled: isModuleEnabled('map') },
        { path: '/admin/financial', id: 'financial', label: 'Financeiro', icon: DollarSign, visible: hasPermission('financial', 'read'), enabled: isModuleEnabled('financial') },
        { path: '/admin/quotes', id: 'quotes', label: 'Orçamentos', icon: FileText, visible: hasPermission('quotes', 'read'), enabled: isModuleEnabled('quotes') },
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
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-poppins">
            {/* Header Global */}
            <header className="h-12 bg-white text-slate-900 flex justify-between items-center z-[100] shadow-sm shrink-0 border-b border-slate-200">
                <div className="flex items-center">
                    <div className={`${isSidebarCollapsed ? 'w-16 justify-center' : 'w-52 justify-start pl-6'} transition-all duration-300 ease-in-out flex items-center overflow-hidden`}>
                        <NexusBranding
                            variant="dark"
                            size="lg"
                            className="h-12"
                        />
                    </div>

                    <div className="flex items-center gap-6 border-l border-slate-100 pl-6 h-8 ml-4">
                        <h2 className="text-sm font-semibold text-slate-900 lowercase tracking-tight">
                            {activeItem?.label || 'dashboard'}
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-6 pr-4">
                    <div className="flex flex-col items-end border-r border-slate-100 pr-6">
                        <span className="text-sm font-semibold text-slate-900 tracking-tight">{user?.name}</span>
                        <span className="text-[10px] font-medium text-slate-400  tracking-tighter">administrador</span>
                    </div>
                    <div className="flex items-center gap-2 relative">
                        <button onClick={() => setShowInbox(!showInbox)} className="p-2 text-slate-400 hover:text-[#1c2d4f] hover:bg-slate-50 rounded-md transition-all relative">
                            <Bell size={20} />
                            {systemNotifications.filter(n => !n.isRead).length > 0 && <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>}
                        </button>
                        
                        {/* INBOX POPOVER */}
                        {showInbox && (
                            <div className="absolute top-full right-0 mt-2 w-80 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-[200] max-h-[400px] flex flex-col">
                                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-tight">Caixa de Mensagens</h3>
                                    <span className="text-[10px] text-slate-400">{systemNotifications.length} avisos</span>
                                </div>
                                <div className="overflow-y-auto flex-1 p-2 space-y-2 custom-scrollbar">
                                    {systemNotifications.length === 0 ? (
                                        <div className="p-4 text-center text-slate-400 text-xs">Nenhuma mensagem.</div>
                                    ) : (
                                        systemNotifications.map(notif => (
                                            <div key={notif.id} className={`p-3 rounded-lg border text-left ${notif.isRead ? 'bg-white border-slate-100 opacity-75' : 'bg-blue-50/50 border-blue-100'}`}>
                                                <div className="flex items-center gap-2 mb-1">
                                                    {notif.priority === 'urgent' && <AlertTriangle size={12} className="text-rose-500 shrink-0" />}
                                                    {notif.priority === 'warning' && <ShieldAlert size={12} className="text-amber-500 shrink-0" />}
                                                    {notif.priority === 'info' && <Bell size={12} className="text-blue-500 shrink-0" />}
                                                    <h4 className="text-[11px] font-bold text-slate-800 uppercase leading-tight line-clamp-1">{notif.title}</h4>
                                                </div>
                                                <p className="text-[10px] text-slate-600 line-clamp-2 leading-relaxed">{notif.content}</p>
                                                {!notif.isRead && (
                                                    <button 
                                                        onClick={() => onMarkNotificationRead && onMarkNotificationRead(notif.id)}
                                                        className="mt-2 text-[9px] font-bold text-blue-600 hover:text-blue-700 uppercase"
                                                    >
                                                        Marcar como lido
                                                    </button>
                                                )}
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* UNREAD NOTIFICATION POPUP (MODAL) */}
            {systemNotifications.filter(n => !n.isRead).slice(0, 1).map(activeNotif => (
                <div key={activeNotif.id} className="fixed inset-0 z-[999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden animate-fade-in-up">
                        <div className={`p-6 border-b ${
                            activeNotif.priority === 'urgent' ? 'bg-rose-50 border-rose-100' :
                            activeNotif.priority === 'warning' ? 'bg-amber-50 border-amber-100' :
                            'bg-blue-50 border-blue-100'
                        }`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-3 rounded-xl ${
                                    activeNotif.priority === 'urgent' ? 'bg-rose-100 text-rose-600' :
                                    activeNotif.priority === 'warning' ? 'bg-amber-100 text-amber-600' :
                                    'bg-blue-100 text-blue-600'
                                }`}>
                                    <Bell size={24} />
                                </div>
                                <div>
                                    <h2 className="text-sm font-black text-slate-900 uppercase tracking-tight">{activeNotif.title}</h2>
                                    <p className={`text-[10px] font-bold uppercase tracking-widest ${
                                        activeNotif.priority === 'urgent' ? 'text-rose-500' :
                                        activeNotif.priority === 'warning' ? 'text-amber-500' :
                                        'text-blue-500'
                                    }`}>Comunicado do Sistema</p>
                                </div>
                            </div>
                        </div>
                        <div className="p-6">
                            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">{activeNotif.content}</p>
                        </div>
                        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                            <button
                                onClick={() => {
                                    if (onMarkNotificationRead) onMarkNotificationRead(activeNotif.id);
                                }}
                                className="bg-[#1c2d4f] hover:bg-[#253a66] text-white px-6 py-2.5 rounded-xl text-xs font-bold uppercase transition-all shadow-lg shadow-[#1c2d4f]/20"
                            >
                                Ciente, Confirmar Leitura
                            </button>
                        </div>
                    </div>
                </div>
            ))}

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


                        <div className="pt-4 border-t border-white/5 mx-2">
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
                                            <span className="text-[10px] font-bold   text-emerald-100/90 group-hover:text-white">suporte</span>
                                            <span className="text-[8px] font-bold text-emerald-500/80 group-hover:text-emerald-400">online agora</span>
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
                            className="w-full py-2 text-white/40 hover:text-rose-400 hover:bg-rose-500/5 rounded-md text-[10px] font-bold   flex items-center justify-center gap-2 transition-all"
                        >
                            <LogOut size={14} /> {!isSidebarCollapsed && "sair da conta"}
                        </button>
                    </div>
                </aside>

                <main className="flex-1 overflow-hidden flex flex-col relative bg-slate-50/50">
                    <div className="flex-1 overflow-y-auto relative custom-scrollbar">
                        {children}
                    </div>
                </main>
            </div>

        </div>
    );
};
