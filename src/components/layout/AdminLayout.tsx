import React, { useState, useCallback, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
    Hexagon, LayoutDashboard, ClipboardList, CalendarClock, Calendar,
    Users, Box, Wrench, Workflow, ShieldAlert, ShieldCheck,
    Settings, LogOut, Bell, Package, ArrowRight, FileText,
    AlertTriangle, Lock, Navigation, DollarSign, ChevronLeft, ChevronRight, WifiOff, X, Phone, Menu, Bot, Code2, BookOpen, MapPin, MessageCircle, ClipboardCheck,
    Camera, Upload, Sparkles, Check, CheckCircle2, Loader2, Key, Mail, FolderTree, ExternalLink
} from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { NexusBranding } from '../ui/NexusBranding';
import { User } from '../../types';

import SessionStorage, { GlobalStorage } from '../../lib/sessionStorage';
import { supabase } from '../../lib/supabase';
import { Button } from '../ui/Button';
import { ResilienceIndicator } from '../ResilienceIndicator';
import { useI18n } from '../../i18n';
import { usePermissions } from '../../hooks/usePermissions';
import { useAuth } from '../../contexts/AuthContext';
import { StorageService } from '../../services/storageService';
import { AuthService } from '../../services/authService';
import { GlobalChatBot } from '../common/GlobalChatBot';
import { useGlobalWhatsAppNotifications } from '../../hooks/useGlobalWhatsAppNotifications';
import { useWhatsAppMonitor } from '../../hooks/useWhatsAppMonitor';

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
    const navigate = useNavigate();
    const [showInbox, setShowInbox] = useState(false);
    const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
    // IDs de notificações já dispensadas neste ciclo de vida (evita flash durante gravação)
    const [locallyDismissed, setLocallyDismissed] = useState<string[]>([]);
    const [whatsappWaitingCount, setWhatsappWaitingCount] = useState(0);
    const [solicitacoesCount, setSolicitacoesCount] = useState(0);
    const { setAuth, logout } = useAuth();
    const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
    const [avatarInput, setAvatarInput] = useState('');
    const [isSavingAvatar, setIsSavingAvatar] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const userMenuRef = useRef<HTMLDivElement>(null);

    const handleActionClick = (url?: string) => {
        if (!url) return;
        let targetUrl = url.trim();

        // 1. Se for uma URL externa (começa com http, https, www ou dominio externo)
        if (/^(https?:\/\/|www\.)/i.test(targetUrl)) {
            if (!/^https?:\/\//i.test(targetUrl)) {
                targetUrl = `https://${targetUrl}`;
            }
            window.open(targetUrl, '_blank', 'noopener,noreferrer');
            return;
        }

        // 2. Se for uma rota interna do Nexus (ex: /admin/orders, #/admin/financial, quotes)
        if (targetUrl.startsWith('#')) {
            targetUrl = targetUrl.substring(1);
        }
        if (!targetUrl.startsWith('/')) {
            targetUrl = `/${targetUrl}`;
        }

        navigate(targetUrl);
    };

    // Fechar popover ao clicar fora
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
                setIsAvatarModalOpen(false);
            }
        };
        if (isAvatarModalOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isAvatarModalOpen]);

    // Estado da aba de perfil (Foto / Alterar Senha)
    const [profileTab, setProfileTab] = useState<'avatar' | 'password'>('avatar');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState(false);
    const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
    const [isSendingResetEmail, setIsSendingResetEmail] = useState(false);
    const [isEmailSent, setIsEmailSent] = useState(false);

    const handleAvatarFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        try {
            setIsSavingAvatar(true);
            const uploadedUrl = await StorageService.uploadUserAvatar(file, user?.id || 'user');
            setAvatarInput(uploadedUrl);
        } catch (err) {
            const reader = new FileReader();
            reader.onload = (evt) => {
                if (evt.target?.result) {
                    setAvatarInput(evt.target.result as string);
                }
            };
            reader.readAsDataURL(file);
        } finally {
            setIsSavingAvatar(false);
        }
    };

    const handleSaveAvatar = async () => {
        if (!user) return;
        try {
            setIsSavingAvatar(true);
            await supabase.from('users').update({ avatar: avatarInput }).eq('id', user.id);

            const updatedUser = { ...user, avatar: avatarInput };
            SessionStorage.set('user', updatedUser);
            GlobalStorage.set('persistent_user', updatedUser);
            setAuth(prev => ({ ...prev, user: updatedUser }));

            setIsAvatarModalOpen(false);
        } catch (err: any) {
            console.error('Error saving avatar:', err);
            alert('Erro ao salvar avatar: ' + (err.message || 'Falha na conexão'));
        } finally {
            setIsSavingAvatar(false);
        }
    };

    const handleUpdatePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (isUpdatingPassword) return;

        const pass = newPassword.trim();
        const confirm = confirmPassword.trim();

        // 🛡️ Validação BigTech Standard (8+ chars, 1 maiúscula, 1 número)
        const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
        if (!passwordRegex.test(pass)) {
            setPasswordError('A senha deve ter pelo menos 8 caracteres, incluindo 1 letra maiúscula e 1 número.');
            return;
        }

        if (pass !== confirm) {
            setPasswordError('As senhas não coincidem.');
            return;
        }

        try {
            setPasswordError('');
            setIsUpdatingPassword(true);

            const { error } = await supabase.auth.updateUser({ password: pass });
            if (error) throw error;

            setPasswordSuccess(true);

            // 🔐 Padrão BigTech: encerra sessão e força logoff para o usuário logar com a nova senha
            setTimeout(async () => {
                await logout();
                window.location.href = '/#/login?reason=password_changed';
            }, 2500);

        } catch (err: any) {
            console.error('Erro ao atualizar senha:', err);
            setPasswordError(err.message || 'Falha ao atualizar senha.');
            setIsUpdatingPassword(false);
        }
    };

    const handleSendResetEmail = async () => {
        if (!user?.email || isSendingResetEmail) return;
        try {
            setIsSendingResetEmail(true);
            await AuthService.resetPasswordForEmail(user.email);
            setIsEmailSent(true);
        } catch (err: any) {
            console.error('Erro ao enviar e-mail de redefinição:', err);
            alert('Erro ao enviar e-mail de redefinição: ' + (err.message || 'Falha na conexão'));
        } finally {
            setIsSendingResetEmail(false);
        }
    };

    const { t } = useI18n();
    const { canAccessMenu, isAdmin, can } = usePermissions();
    const isStandalone = location.search.includes('standalone=true') || window.location.hash.includes('standalone=true');

    // Hook global que verifica mensagens novas independente da aba aberta
    const { alertCount } = useGlobalWhatsAppNotifications(user?.id || null, isAdmin, location.pathname);

    // 📡 Monitoramento Global da Conexão do WhatsApp
    const { isDisconnected: isWppDisconnected } = useWhatsAppMonitor(tenant, isAdmin);

    // Buscar contador de WhatsApp aguardando humano
    useEffect(() => {
        if (!isAdmin) return;
        const fetchWACount = async () => {
            // 1. Contar conversas na fila global (qualquer um pode pegar)
            const { count: waitingCount } = await supabase
                .from('whatsapp_conversations')
                .select('*', { count: 'exact', head: true })
                .eq('state', 'WAITING_HUMAN');
                
            // 2. Contar conversas já atribuídas a MIM onde o cliente mandou a última mensagem
            let myUnread = 0;
            if (user?.id) {
                const { data: myConversations } = await supabase
                    .from('whatsapp_conversations')
                    .select('id, history')
                    .eq('state', 'HUMAN_ACTIVE')
                    .eq('assigned_agent_id', user.id);
                    
                let receipts: Record<string, string> = {};
                try {
                    const receiptsStr = localStorage.getItem('wa_read_receipts');
                    if (receiptsStr) receipts = JSON.parse(receiptsStr);
                } catch(e) {}

                if (myConversations) {
                    myConversations.forEach(conv => {
                        const history = conv.history as any[];
                        if (history && history.length > 0) {
                            const lastMsg = history[history.length - 1];
                            // Se a conversa é minha, mas a última mensagem NÃO foi minha (foi do cliente ou de outro agente que transferiu), então é 'não lida'
                            const isMyMessage = lastMsg.role === 'agent' && lastMsg.agent_id === user.id;
                            if (!isMyMessage) {
                                // Checa se já clicou/leu localmente
                                const readAtStr = receipts[conv.id];
                                const msgTime = lastMsg.timestamp ? new Date(lastMsg.timestamp) : new Date(0);
                                const readTime = readAtStr ? new Date(readAtStr) : new Date(0);
                                
                                if (!readAtStr || msgTime > readTime) {
                                    myUnread++;
                                }
                            }
                        }
                    });
                }
            }
            
            setWhatsappWaitingCount((waitingCount || 0) + myUnread);
        };
        fetchWACount();
        const interval = setInterval(fetchWACount, 5000); // atualiza o menu a cada 5s
        
        // Listener imediato para ações tomadas no painel
        window.addEventListener('whatsapp_state_changed', fetchWACount);
        window.addEventListener('wa_read_receipts_changed', fetchWACount);
        
        return () => {
            clearInterval(interval);
            window.removeEventListener('whatsapp_state_changed', fetchWACount);
            window.removeEventListener('wa_read_receipts_changed', fetchWACount);
        };
    }, [isAdmin, alertCount, user?.id]);

    // Buscar contador de solicitações pendentes
    useEffect(() => {
        if (!isAdmin) return;
        const fetchSolicitacoesCount = async () => {
            const { count } = await supabase
                .from('whatsapp_service_requests')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'PENDING');
            setSolicitacoesCount(count || 0);
        };
        fetchSolicitacoesCount();
        const interval = setInterval(fetchSolicitacoesCount, 5000); // atualiza o menu a cada 5s
        
        return () => clearInterval(interval);
    }, [isAdmin]);

    // Fecha sidebar mobile ao navegar
    useEffect(() => {
        setIsMobileSidebarOpen(false);
    }, [location.pathname]);

    // Fecha sidebar mobile ao redimensionar para desktop
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 1024) {
                setIsMobileSidebarOpen(false);
            }
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Usa isAdmin do hook — que já respeita grupos vinculados corretamente
    const menuVisible = (menu: string): boolean => {
        if (!user) return false;
        if (isAdmin) return true;
        return canAccessMenu(menu as any);
    };

    const isModuleEnabled = (moduleId: string): boolean => {
        // 0. SE FOR MASTER OVERRIDE (IMPERSONATING), LIBERA TUDO ABSOLUTAMENTE
        if (SessionStorage.get('is_impersonating') === true || user?.id === 'master-override') {
            return true;
        }

        // 1. REGRA MASTER (Prioridade Máxima): A empresa (Tenant) tem este módulo habilitado pelo SuperAdmin?
        const tenantModules = tenant?.enabled_modules || tenant?.enabledModules;
        if (tenantModules && tenantModules[moduleId] === false) {
            return false; // Bloqueado pelo Master (SuperAdmin). NINGUÉM do tenant acessa.
        }

        // 2. Se a empresa tem acesso, e o usuário logado for ADMIN, libera o acesso para ele.
        if (isAdmin) return true;

        // 3. Se não for admin, verifica se há restrições específicas para este usuário
        if (!user || !(user as any).enabledModules) return true;
        return (user as any).enabledModules[moduleId] !== false;
    };

    const menuItems = [
        { path: '/admin', id: 'dashboard', label: t.nav.dashboard, icon: LayoutDashboard, visible: menuVisible('dashboard'), enabled: isModuleEnabled('dashboard') },
        { path: '/admin/ai', id: 'ai', label: 'Duno IA', icon: Bot, visible: menuVisible('settings'), enabled: isModuleEnabled('ai') },
        { path: '/admin/docs', id: 'docs', label: 'Docs / FAQ', icon: BookOpen, visible: true, enabled: isModuleEnabled('docs') },
        { path: '/admin/whatsapp', id: 'whatsapp', label: 'WhatsApp Inbox', icon: MessageCircle, visible: isAdmin, enabled: isModuleEnabled('ai'), badge: whatsappWaitingCount },
        { path: '/admin/solicitacoes', id: 'solicitacoes', label: 'Solicitações', icon: ClipboardCheck, visible: isAdmin, enabled: isModuleEnabled('ai'), badge: solicitacoesCount },
        { path: '/admin/orders', id: 'orders', label: t.nav.orders, icon: ClipboardList, visible: menuVisible('orders'), enabled: isModuleEnabled('orders') },
        { path: '/admin/calendar', id: 'calendar', label: t.nav.calendar, icon: Calendar, visible: menuVisible('calendar'), enabled: isModuleEnabled('calendar') },
        { path: '/admin/map', id: 'map', label: t.nav.map, icon: Navigation, visible: menuVisible('map'), enabled: isModuleEnabled('map') },
        { path: '/admin/financial', id: 'financial', label: t.nav.financial, icon: DollarSign, visible: menuVisible('financial'), enabled: isModuleEnabled('financial') },
        { path: '/admin/quotes', id: 'quotes', label: t.nav.quotes, icon: FileText, visible: menuVisible('quotes'), enabled: isModuleEnabled('quotes') },
        { path: '/admin/stock', id: 'stock', label: t.nav.stock, icon: Package, visible: menuVisible('stock'), enabled: isModuleEnabled('stock') },
        { path: '/admin/contracts', id: 'contracts', label: t.nav.contracts, icon: CalendarClock, visible: menuVisible('contracts'), enabled: isModuleEnabled('contracts') },
        { path: '/admin/customers', id: 'clients', label: t.nav.customers, icon: Users, visible: menuVisible('customers'), enabled: isModuleEnabled('customers') },
        { path: '/admin/equipments', id: 'equip', label: t.nav.equipments, icon: Box, visible: menuVisible('equipments'), enabled: isModuleEnabled('equipments') },
        { path: '/admin/forms', id: 'forms', label: t.nav.forms, icon: Workflow, visible: menuVisible('forms'), enabled: isModuleEnabled('forms') },
        { path: '/admin/technicians', id: 'techs', label: t.nav.technicians, icon: Wrench, visible: menuVisible('technicians'), enabled: isModuleEnabled('technicians') },
        { path: '/admin/regions', id: 'regions', label: 'Gestão de Regiões', icon: MapPin, visible: menuVisible('regions'), enabled: isModuleEnabled('regions') },
        { path: '/admin/users', id: 'users', label: t.nav.users, icon: ShieldAlert, visible: menuVisible('users'), enabled: isModuleEnabled('users') },
        { path: '/admin/settings', id: 'settings', label: t.nav.settings, icon: Settings, visible: menuVisible('settings'), enabled: isModuleEnabled('settings') },
        { path: '/admin/integrations', id: 'integrations', label: 'Integrações', icon: Code2, visible: menuVisible('settings'), enabled: isModuleEnabled('integrations') },
    ];

    const activeItem = menuItems.find(item =>
        location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path))
    );

    // ── Componente de Sidebar Navigation (reutilizado mobile + desktop) ──
    const SidebarNav = ({ onItemClick }: { onItemClick?: () => void }) => (
        <>
            <nav className="space-y-1">
                {menuItems.map(item => {
                    const isActive = location.pathname === item.path || (item.path !== '/admin' && location.pathname.startsWith(item.path));
                    return (
                        <Link
                            key={item.id}
                            to={item.enabled && item.visible ? item.path : '#'}
                            onClick={(e) => {
                                if (!item.enabled) {
                                    e.preventDefault();
                                    alert("Módulo desabilitado temporariamente.");
                                } else if (!item.visible) {
                                    e.preventDefault();
                                    alert("Acesso Negado: Você não tem permissão para acessar este módulo. Contate o administrador.");
                                } else if (onItemClick) {
                                    onItemClick();
                                }
                            }}
                            className={`w-full flex items-center ${isSidebarCollapsed && !onItemClick ? 'justify-center px-0' : 'px-3'} py-2.5 rounded-md text-sm font-medium transition-all duration-200 ${(!item.enabled || !item.visible)
                                ? 'bg-slate-800/30 text-slate-400 cursor-not-allowed hover:bg-slate-800/50'
                                : isActive
                                    ? 'bg-white/10 text-white shadow-sm'
                                    : 'text-white/70 hover:text-white hover:bg-white/5'
                                }`}
                        >
                            <div className="flex items-center justify-between w-full relative">
                                <div className="flex items-center gap-3">
                                    <item.icon size={18} className={`${isActive ? 'text-white' : 'text-white/60'}`} />
                                    {(!isSidebarCollapsed || onItemClick) && <span>{item.label}</span>}
                                </div>
                                {(item.badge || 0) > 0 && (
                                    isSidebarCollapsed && !onItemClick ? (
                                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-400 rounded-full border border-[#1c2d4f] shadow-sm shadow-amber-400/50" />
                                    ) : (
                                        <span className="min-w-[20px] h-5 px-1.5 inline-flex items-center justify-center rounded-full bg-amber-400 text-slate-950 text-[10px] font-black leading-none shadow-sm shadow-amber-400/40 border border-amber-300/50 shrink-0">
                                            {item.badge}
                                        </span>
                                    )
                                )}
                            </div>
                        </Link>
                    );
                })}
            </nav>

            <div className="pt-4 border-t border-white/5 mx-2">
                <a
                    href="https://wa.me/5535984274972"
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-full flex items-center ${isSidebarCollapsed && !onItemClick ? 'justify-center px-0' : 'px-3 justify-start'} py-2.5 rounded-lg transition-all duration-200 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 group`}
                    title="Suporte Técnico"
                >
                    <div className="flex items-center gap-3">
                        <div className="p-1.5 bg-emerald-500/20 rounded-md group-hover:bg-emerald-500 group-hover:text-white transition-all">
                            <Phone size={14} className="text-emerald-400 group-hover:text-white" />
                        </div>
                        {(!isSidebarCollapsed || onItemClick) && (
                            <div className="flex flex-col">
                                <span className="text-[10px] font-bold   text-emerald-100/90 group-hover:text-white">suporte</span>
                                <span className="text-[8px] font-bold text-emerald-500/80 group-hover:text-emerald-400">online agora</span>
                            </div>
                        )}
                    </div>
                </a>
            </div>
        </>
    );

    return (
        <div className="flex flex-col h-screen bg-slate-50 overflow-hidden font-poppins print:h-auto print:overflow-visible print:block relative">
            {/* Header Global */}
            {!isStandalone && (
            <header className="h-12 bg-white text-slate-900 flex justify-between items-center z-[100] shadow-sm shrink-0 border-b border-slate-200 print:hidden">
                <div className="flex items-center">
                    {/* Mobile: Hamburger button */}
                    <button
                        onClick={() => setIsMobileSidebarOpen(true)}
                        className="lg:hidden p-3 text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors"
                        aria-label="Abrir menu"
                    >
                        <Menu size={22} />
                    </button>

                    {/* Desktop: Logo area */}
                    <div className={`hidden lg:flex ${isSidebarCollapsed ? 'w-16 justify-center' : 'w-52 justify-start pl-6'} transition-all duration-300 ease-in-out items-center overflow-hidden shrink-0`}>
                        {isSidebarCollapsed ? (
                            // Monograma "D" — identidade compacta da marca Duno
                            <div className="flex items-center justify-center w-9 h-9 rounded-xl bg-[#1c2d4f] shadow-md select-none">
                                <span className="text-white font-black text-lg tracking-tighter leading-none" style={{ fontFamily: 'inherit', letterSpacing: '-0.04em' }}>D</span>
                            </div>
                        ) : (
                            <NexusBranding
                                variant="dark"
                                size="lg"
                                className="h-12"
                            />
                        )}
                    </div>


                    {/* Mobile: Compact branding */}
                    <div className="lg:hidden flex items-center">
                        <NexusBranding
                            variant="dark"
                            size="lg"
                            className="h-10"
                        />
                    </div>

                    {/* Desktop: Page title */}
                    <div className="hidden lg:flex items-center gap-6 border-l border-slate-100 pl-6 h-8 ml-4">
                        <h2 className="text-sm font-semibold text-slate-900 lowercase tracking-tight">
                            {activeItem?.label || 'dashboard'}
                        </h2>
                    </div>
                </div>

                <div className="flex items-center gap-2 sm:gap-6 pr-2 sm:pr-4">
                    {/* User info & clickable avatar with Dropdown Popover */}
                    <div className="flex items-center gap-3 border-r border-slate-100 pr-3 sm:pr-6 relative" ref={userMenuRef}>
                        <div className="hidden sm:flex flex-col items-end">
                            <span className="text-sm font-semibold text-slate-900 tracking-tight">{user?.name}</span>
                            <span className="text-[10px] font-medium text-slate-400 tracking-tighter">{user?.groupName || t.layout.adminRole}</span>
                        </div>
                        <div 
                            onClick={() => {
                                setAvatarInput(user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random&color=fff&bold=true`);
                                setIsEmailSent(false);
                                setProfileTab('avatar');
                                setIsAvatarModalOpen(!isAvatarModalOpen);
                            }}
                            className="relative group cursor-pointer shrink-0"
                            title="Perfil e Configurações"
                        >
                            <img
                                src={user?.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random&color=fff&bold=true`}
                                alt={user?.name || 'Avatar'}
                                className="w-8 h-8 sm:w-9 sm:h-9 rounded-full object-cover border-2 border-slate-200 group-hover:border-primary-500 shadow-sm transition-all bg-slate-100"
                                onError={(e) => {
                                    (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random&color=fff&bold=true`;
                                }}
                            />
                            <div className="absolute inset-0 bg-slate-900/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                                <Camera size={12} className="text-white" />
                            </div>
                        </div>

                        {/* POPOVER DROPDOWN MENU — BigTech Standard */}
                        {isAvatarModalOpen && (
                            <div className="absolute top-full right-0 mt-2 w-80 sm:w-96 bg-white rounded-3xl shadow-2xl border border-slate-200 p-5 z-[9999] animate-in fade-in slide-in-from-top-2 duration-200 font-poppins flex flex-col gap-4">
                                
                                {/* 1. Header do Usuário + Grupo */}
                                <div className="flex items-center gap-3 pb-3 border-b border-slate-100">
                                    <img
                                        src={avatarInput || `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random&color=fff&bold=true`}
                                        alt={user?.name || 'Avatar'}
                                        className="w-12 h-12 rounded-full object-cover border-2 border-primary-500 shadow-sm bg-slate-50 shrink-0"
                                        onError={(e) => {
                                            (e.target as HTMLImageElement).src = `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random&color=fff&bold=true`;
                                        }}
                                    />
                                    <div className="truncate min-w-0">
                                        <h3 className="text-sm font-bold text-slate-900 truncate leading-tight">{user?.name}</h3>
                                        <p className="text-[11px] font-medium text-slate-400 truncate">{user?.email}</p>
                                        
                                        {/* Badge do Grupo de Acesso */}
                                        <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-amber-50 border border-amber-200 text-amber-700">
                                            <FolderTree size={10} className="text-amber-500" />
                                            <span>Grupo: {user?.groupName || 'Administradores'}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* 2. Abas: Foto / Alterar Senha */}
                                <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200">
                                    <button
                                        type="button"
                                        onClick={() => setProfileTab('avatar')}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                                            profileTab === 'avatar' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <Camera size={13} /> Foto de Perfil
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setProfileTab('password')}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 ${
                                            profileTab === 'password' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                                        }`}
                                    >
                                        <Key size={13} /> Alterar Senha
                                    </button>
                                </div>

                                {/* 3. Conteúdo Aba 1: Foto */}
                                {profileTab === 'avatar' && (
                                    <div className="space-y-3">
                                        <div className="space-y-2">
                                            <button
                                                type="button"
                                                onClick={() => fileInputRef.current?.click()}
                                                className="w-full py-2.5 px-3 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all flex items-center justify-center gap-2 shadow-sm"
                                            >
                                                <Upload size={15} className="text-primary-600" /> Alterar Foto do Perfil
                                            </button>
                                            <input
                                                ref={fileInputRef}
                                                type="file"
                                                accept="image/*"
                                                className="hidden"
                                                onChange={handleAvatarFileUpload}
                                            />

                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setAvatarInput(`https://ui-avatars.com/api/?name=${encodeURIComponent(user?.name || 'User')}&background=random&color=fff&bold=true`);
                                                }}
                                                className="w-full py-2.5 px-3 bg-primary-50/60 hover:bg-primary-50 border border-primary-100 rounded-xl text-xs font-bold text-primary-700 transition-all flex items-center justify-center gap-2"
                                            >
                                                <Sparkles size={15} className="text-primary-600" /> Gerar Avatar
                                            </button>
                                        </div>

                                        <button
                                            onClick={handleSaveAvatar}
                                            disabled={isSavingAvatar}
                                            className="w-full py-2.5 bg-[#1c2d4f] hover:bg-[#253a66] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                                        >
                                            {isSavingAvatar ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                            {isSavingAvatar ? 'Salvando...' : 'Salvar Foto'}
                                        </button>
                                    </div>
                                )}

                                {/* 4. Conteúdo Aba 2: Alterar Senha (LGPD Email Mandatory) */}
                                {profileTab === 'password' && (
                                    <div className="space-y-3 font-poppins">
                                        {isEmailSent ? (
                                            <div className="p-4 bg-emerald-50/90 border border-emerald-200 rounded-2xl text-center space-y-2.5 animate-in fade-in">
                                                <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-sm">
                                                    <Mail size={20} />
                                                </div>
                                                <div>
                                                    <h4 className="text-xs font-bold text-emerald-950">E-mail Enviado! ✨</h4>
                                                    <p className="text-[10px] font-medium text-emerald-700 mt-0.5 leading-relaxed">
                                                        Enviamos o link seguro para: <br />
                                                        <span className="font-bold text-emerald-900 bg-emerald-100/70 px-2 py-0.5 rounded inline-block mt-0.5">{user?.email}</span>
                                                    </p>
                                                </div>
                                                <p className="text-[9px] text-emerald-800 font-semibold italic">
                                                    Acesse seu e-mail para redefinir sua senha com segurança.
                                                </p>
                                            </div>
                                        ) : (
                                            <div className="space-y-3">
                                                <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-100 flex items-start gap-2.5">
                                                    <Key size={15} className="text-blue-600 shrink-0 mt-0.5" />
                                                    <p className="text-[10px] text-blue-700 font-medium leading-relaxed">
                                                        Em conformidade com a <span className="font-bold">LGPD</span>, alterações de senha são enviadas via link de verificação para o seu e-mail cadastrado.
                                                    </p>
                                                </div>

                                                <button
                                                    type="button"
                                                    onClick={handleSendResetEmail}
                                                    disabled={isSendingResetEmail}
                                                    className="w-full py-2.5 bg-[#1c2d4f] hover:bg-[#253a66] text-white text-xs font-bold rounded-xl shadow-md transition-all flex items-center justify-center gap-2"
                                                >
                                                    {isSendingResetEmail ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} />}
                                                    {isSendingResetEmail ? 'Enviando...' : 'Enviar Link de Redefinição de Senha'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* 5. Rodapé fixo do Popover: Botão Sair da Conta (Logoff) */}
                                <div className="pt-3 border-t border-slate-100 flex items-center justify-between w-full">
                                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Sessão Conectada</span>
                                    <button
                                        type="button"
                                        onClick={async () => {
                                            if (onLogout) {
                                                onLogout();
                                            } else {
                                                await logout();
                                                window.location.href = '/#/login';
                                            }
                                        }}
                                        className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200/80 rounded-xl text-[11px] font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                                    >
                                        <LogOut size={13} /> Sair da Conta
                                    </button>
                                </div>

                            </div>
                        )}
                    </div>
                    <div className="flex items-center gap-2 relative">
                        <button onClick={() => setShowInbox(!showInbox)} className="p-2 text-slate-400 hover:text-[#1c2d4f] hover:bg-slate-50 rounded-md transition-all relative">
                            <Bell size={20} />
                            {systemNotifications.filter(n => !n.isRead).length > 0 && <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-rose-500 rounded-full border-2 border-white"></span>}
                        </button>
                        
                        {/* INBOX POPOVER */}
                        {showInbox && (
                            <div className="absolute top-full right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden z-[200] max-h-[480px] flex flex-col">
                                {/* Header com contador */}
                                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/60 flex justify-between items-center">
                                    <div className="flex items-center gap-2">
                                        <Bell size={14} className="text-slate-500" />
                                        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-tight">{t.layout.inbox}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {systemNotifications.filter(n => !n.isRead).length > 0 && (
                                            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-full">
                                                {systemNotifications.filter(n => !n.isRead).length} não lida{systemNotifications.filter(n => !n.isRead).length > 1 ? 's' : ''}
                                            </span>
                                        )}
                                        <span className="text-[10px] text-slate-400">{systemNotifications.length} total</span>
                                    </div>
                                </div>

                                {/* Lista de notificações */}
                                <div className="overflow-y-auto flex-1 divide-y divide-slate-50 custom-scrollbar">
                                    {systemNotifications.length === 0 ? (
                                        <div className="p-8 text-center text-slate-400 text-xs flex flex-col items-center gap-2">
                                            <Bell size={24} className="text-slate-200" />
                                            {t.layout.noMessages}
                                        </div>
                                    ) : (
                                        systemNotifications.map(notif => (
                                            <div
                                                key={notif.id}
                                                className={`px-4 py-3 flex gap-3 transition-colors ${notif.isRead ? 'bg-white hover:bg-slate-50' : 'bg-blue-50/30 hover:bg-blue-50/60'}`}
                                            >
                                                {/* Dot de status não lida */}
                                                <div className="flex flex-col items-center pt-1 shrink-0">
                                                    {!notif.isRead ? <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" title="Não lida" /> : <div className="w-2 h-2" />}
                                                </div>

                                                {/* Conteúdo */}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start justify-between gap-2 mb-0.5">
                                                        <div className="flex items-center gap-1.5">
                                                            {notif.priority === 'urgent' && <AlertTriangle size={11} className={`${notif.isRead ? 'text-slate-400' : 'text-rose-500'} shrink-0`} />}
                                                            {notif.priority === 'warning' && <ShieldAlert size={11} className={`${notif.isRead ? 'text-slate-400' : 'text-amber-500'} shrink-0`} />}
                                                            {notif.priority === 'info' && <Bell size={11} className={`${notif.isRead ? 'text-slate-400' : 'text-blue-500'} shrink-0`} />}
                                                            <h4 className={`text-[11px] font-bold uppercase line-clamp-1 ${notif.isRead ? 'text-slate-400' : 'text-slate-800'}`}>
                                                                {notif.title}
                                                            </h4>
                                                        </div>
                                                        {/* Badge "Nova" */}
                                                        {!notif.isRead && (
                                                            <span className="shrink-0 text-[9px] font-semibold text-blue-600 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-full">
                                                                Nova
                                                            </span>
                                                        )}
                                                    </div>

                                                    <p className={`text-[10px] line-clamp-2 leading-relaxed ${notif.isRead ? 'text-slate-400' : 'text-slate-600'}`}>
                                                        {notif.content}
                                                    </p>

                                                    {/* Ações: CTA (Link) + "Marcar como lida" inline */}
                                                    <div className="mt-2 flex items-center justify-between gap-2">
                                                        {(notif.actionUrl || notif.action_url) ? (
                                                            <button
                                                                onClick={() => {
                                                                    handleActionClick(notif.actionUrl || notif.action_url);
                                                                    setShowInbox(false);
                                                                    if (!notif.isRead && onMarkNotificationRead) onMarkNotificationRead(notif.id);
                                                                }}
                                                                className="text-[10px] font-bold text-primary-600 hover:text-primary-800 uppercase tracking-wide transition-colors flex items-center gap-1"
                                                            >
                                                                {notif.actionLabel || notif.action_label || 'Acessar Link'} <ExternalLink size={10} />
                                                            </button>
                                                        ) : <span />}

                                                        {!notif.isRead && (
                                                            <button
                                                                onClick={() => onMarkNotificationRead && onMarkNotificationRead(notif.id)}
                                                                className="text-[9px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-wide transition-colors"
                                                            >
                                                                {t.layout.markAsRead} →
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </header>
            )}

            {/* 📣 CENTER GLASSMORPHIC POPUP OVERLAY (UNREAD SYSTEM NOTIFICATIONS) */}
            {!isStandalone && systemNotifications
                .filter(n => !n.isRead && !locallyDismissed.includes(n.id))
                .slice(0, 1)
                .map(activeNotif => {
                    const isUrgent = activeNotif.priority === 'urgent';
                    const isWarning = activeNotif.priority === 'warning';
                    
                    const headerBg = isUrgent
                        ? 'bg-rose-500/10 border-rose-500/20'
                        : isWarning
                            ? 'bg-amber-500/10 border-amber-500/20'
                            : 'bg-blue-500/10 border-blue-500/20';

                    const iconColor = isUrgent ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-blue-400';
                    const iconBg = isUrgent ? 'bg-rose-500/20 border-rose-500/30' : isWarning ? 'bg-amber-500/20 border-amber-500/30' : 'bg-blue-500/20 border-blue-500/30';
                    const badgeText = isUrgent ? '🚨 Comunicado Urgente' : isWarning ? '⚠️ Alerta de Sistema' : '📢 Comunicado do Sistema';
                    const badgeColor = isUrgent ? 'text-rose-400' : isWarning ? 'text-amber-400' : 'text-blue-400';

                    return (
                        <div key={activeNotif.id} className="fixed inset-0 z-[9999] bg-slate-950/50 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300 print:hidden">
                            <div className="bg-slate-900/95 w-full max-w-lg rounded-3xl border border-slate-800 shadow-[0_25px_70px_rgba(0,0,0,0.9)] overflow-hidden relative ring-1 ring-white/10 animate-in zoom-in-95 duration-300">
                                
                                {/* Header com Glassmorphism e Ícone de Severidade */}
                                <div className={`p-6 border-b flex items-start justify-between ${headerBg}`}>
                                    <div className="flex items-center gap-3.5 min-w-0">
                                        <div className={`p-3 rounded-2xl border ${iconBg} ${iconColor} shrink-0 shadow-inner`}>
                                            {isUrgent ? <AlertTriangle size={24} /> : isWarning ? <ShieldAlert size={24} /> : <Bell size={24} />}
                                        </div>
                                        <div className="min-w-0">
                                            <span className={`text-[10px] font-extrabold uppercase tracking-widest block ${badgeColor}`}>
                                                {badgeText}
                                            </span>
                                            <h2 className="text-base font-black text-white uppercase tracking-tight leading-snug truncate mt-0.5">
                                                {activeNotif.title}
                                            </h2>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            setLocallyDismissed(prev => [...prev, activeNotif.id]);
                                            if (onMarkNotificationRead) onMarkNotificationRead(activeNotif.id);
                                        }}
                                        className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors shrink-0 -mr-2 -mt-2"
                                        title="Fechar"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>

                                {/* Corpo da Mensagem em Texto Branco Cristalino */}
                                <div className="p-6 space-y-3">
                                    <p className="text-sm font-medium text-slate-200 leading-relaxed whitespace-pre-wrap">
                                        {activeNotif.content}
                                    </p>
                                </div>

                                {/* Rodapé da Janela com Botões de Ação */}
                                <div className="p-5 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row gap-3">
                                    {(activeNotif.actionUrl || activeNotif.action_url) && (
                                        <button
                                            onClick={() => {
                                                handleActionClick(activeNotif.actionUrl || activeNotif.action_url);
                                                setLocallyDismissed(prev => [...prev, activeNotif.id]);
                                                if (onMarkNotificationRead) onMarkNotificationRead(activeNotif.id);
                                            }}
                                            className={`flex-1 px-5 py-3.5 rounded-2xl text-xs font-black uppercase transition-all shadow-lg flex items-center justify-center gap-2 active:scale-95 ${
                                                isUrgent
                                                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/25'
                                                    : isWarning
                                                        ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/25'
                                                        : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/25'
                                            }`}
                                        >
                                            {activeNotif.actionLabel || activeNotif.action_label || 'Acessar Link'} <ExternalLink size={14} />
                                        </button>
                                    )}

                                    <button
                                        onClick={() => {
                                            setLocallyDismissed(prev => [...prev, activeNotif.id]);
                                            if (onMarkNotificationRead) onMarkNotificationRead(activeNotif.id);
                                        }}
                                        className="flex-1 px-5 py-3.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-2xl text-xs font-bold uppercase transition-all flex items-center justify-center gap-2 active:scale-95"
                                    >
                                        <CheckCircle2 size={15} className="text-emerald-400" /> Entendido
                                    </button>
                                </div>

                            </div>
                        </div>
                    );
                })}

            <div className="flex flex-1 overflow-hidden print:overflow-visible print:block">
                {/* ── Mobile Sidebar Overlay ─────────────────────────────── */}
                {!isStandalone && isMobileSidebarOpen && (
                    <div className="fixed inset-0 z-[300] lg:hidden print:hidden">
                        {/* Backdrop */}
                        <div 
                            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm animate-fade-in"
                            onClick={() => setIsMobileSidebarOpen(false)} 
                        />
                        {/* Drawer */}
                        <aside className="absolute left-0 top-0 bottom-0 w-72 bg-[#1c2d4f] flex flex-col shadow-2xl animate-slide-in-left z-[301]">
                            {/* Drawer Header */}
                            <div className="h-14 flex items-center justify-between px-4 border-b border-white/10 shrink-0">
                                <div className="flex items-center gap-3">
                                    <img src="/duno-icon.png" alt="DUNO" className="w-8 h-8 rounded-lg" />
                                    <span className="text-white font-bold text-sm tracking-tight">DUNO Nexus</span>
                                </div>
                                <button 
                                    onClick={() => setIsMobileSidebarOpen(false)}
                                    className="p-2 text-white/40 hover:text-white transition-colors rounded-lg"
                                >
                                    <X size={18} />
                                </button>
                            </div>

                            {/* User card (mobile) */}
                            <div className="px-4 py-3 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white font-bold text-sm">
                                        {user?.name?.charAt(0) || 'A'}
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-white text-sm font-semibold truncate max-w-[160px]">{user?.name}</span>
                                        <span className="text-white/40 text-[10px] font-medium">administrador</span>
                                    </div>
                                </div>
                            </div>

                            {/* Nav items */}
                            <div className="flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar">
                                <SidebarNav onItemClick={() => setIsMobileSidebarOpen(false)} />
                            </div>

                            {/* Bottom actions */}
                            <div className="shrink-0 p-4 border-t border-white/5 flex flex-col gap-2">
                                {isImpersonating && (
                                    <button
                                        onClick={() => { SessionStorage.remove('is_impersonating'); onLogout(); }}
                                        className="w-full py-2.5 bg-primary-600/20 text-primary-100 rounded-md text-xs font-semibold hover:bg-primary-600/30 transition-all border border-primary-500/20"
                                    >
                                        <ShieldCheck size={16} className="inline mr-2" /> Finalizar Auditoria
                                    </button>
                                )}
                                <button
                                    onClick={onLogout}
                                    className="w-full py-2 text-white/40 hover:text-rose-400 hover:bg-rose-500/5 rounded-md text-[10px] font-bold flex items-center justify-center gap-2 transition-all"
                                >
                                    <LogOut size={14} /> sair da conta
                                </button>
                            </div>
                        </aside>
                    </div>
                )}

                {/* ── Desktop Sidebar ───────────────────────────────────── */}
                {!isStandalone && (
                <aside className={`hidden lg:flex ${isSidebarCollapsed ? 'w-16' : 'w-52'} bg-[#1c2d4f] h-full flex-col shadow-none z-50 transition-all duration-300 ease-in-out relative border-r border-white/5 print:hidden`}>
                    <button
                        onClick={onToggleSidebar}
                        className="absolute -right-3 top-6 w-6 h-6 bg-[#1c2d4f] text-white/50 border border-white/10 rounded-full flex items-center justify-center hover:text-white transition-all z-[60]"
                    >
                        {isSidebarCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>

                    <div className={`flex-1 overflow-y-auto overflow-x-hidden p-4 custom-scrollbar ${isSidebarCollapsed ? 'flex flex-col items-center' : ''}`}>
                        <SidebarNav />
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
                )}

                <main className="flex-1 min-w-0 overflow-hidden flex flex-col relative bg-slate-50/50 print:bg-transparent print:overflow-visible print:block print:h-auto">
                    {/* 🚨 Alerta de Desconexão do WhatsApp */}
                    {isWppDisconnected && (
                        <div className="bg-red-50 border-b border-red-200 px-4 py-3 shrink-0 flex items-center justify-between z-10 animate-fade-in print:hidden">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-red-100 text-red-600 rounded-full animate-pulse shrink-0">
                                    <WifiOff size={16} />
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-red-800 uppercase tracking-wide">Alerta: WhatsApp Desconectado</p>
                                    <p className="text-[10px] font-medium text-red-600 mt-0.5 leading-tight">O sistema não está enviando ou recebendo mensagens. O robô está inativo.</p>
                                </div>
                            </div>
                            <Link to="/admin/settings" className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg shadow-sm transition-colors whitespace-nowrap shrink-0">
                                Resolver
                            </Link>
                        </div>
                    )}

                    {/* Mobile: Page title bar */}
                    {!isStandalone && (
                    <div className="lg:hidden flex items-center h-10 px-4 bg-white border-b border-slate-100 shrink-0 print:hidden">
                        <h2 className="text-xs font-semibold text-slate-700 lowercase tracking-tight">
                            {activeItem?.label || 'dashboard'}
                        </h2>
                    </div>
                    )}
                    <div key={location.pathname} className={`flex-1 overflow-y-auto relative custom-scrollbar print:overflow-visible print:block ${!isStandalone ? 'pb-24 lg:pb-0' : ''} animate-fade-in duration-300`}>
                        {children}
                    </div>
                </main>
            </div>
            
            {/* Bottom Tab Bar (Mobile) */}
            {!isStandalone && (
            <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white border-t border-slate-200 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] flex items-center justify-around z-[150] pb-safe print:hidden px-2">
                <Link to="/admin" className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors ${location.pathname === '/admin' ? 'text-primary-600' : 'text-slate-400 hover:text-slate-600'}`}>
                    <LayoutDashboard size={20} className={location.pathname === '/admin' ? 'fill-primary-50 text-primary-600' : ''} />
                    <span className="text-[9px] font-semibold tracking-wide">Início</span>
                </Link>
                
                {menuVisible('orders') && isModuleEnabled('orders') && (
                <Link to="/admin/orders" className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors ${location.pathname.startsWith('/admin/orders') ? 'text-primary-600' : 'text-slate-400 hover:text-slate-600'}`}>
                    <ClipboardList size={20} className={location.pathname.startsWith('/admin/orders') ? 'fill-primary-50 text-primary-600' : ''} />
                    <span className="text-[9px] font-semibold tracking-wide">Ordens</span>
                </Link>
                )}
                
                {menuVisible('customers') && isModuleEnabled('customers') && (
                <Link to="/admin/customers" className={`flex flex-col items-center justify-center gap-1 w-16 h-full transition-colors ${location.pathname.startsWith('/admin/customers') ? 'text-primary-600' : 'text-slate-400 hover:text-slate-600'}`}>
                    <Users size={20} className={location.pathname.startsWith('/admin/customers') ? 'fill-primary-50 text-primary-600' : ''} />
                    <span className="text-[9px] font-semibold tracking-wide">Clientes</span>
                </Link>
                )}
                
                <button onClick={() => setIsMobileSidebarOpen(true)} className="flex flex-col items-center justify-center gap-1 w-16 h-full text-slate-400 hover:text-slate-600 transition-colors">
                    <Menu size={20} />
                    <span className="text-[9px] font-semibold tracking-wide">Menu</span>
                </button>
            </nav>
            )}

            {!isStandalone && <GlobalChatBot />}


        </div>
    );
};
