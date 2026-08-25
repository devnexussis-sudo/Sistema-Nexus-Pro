
import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import {
  ShieldCheck, Globe, Plus, Building2, Users,
  Activity, Server, Database, Save, X, ExternalLink,
  ChevronRight, Laptop, Briefcase, Search, LayoutDashboard,
  Settings, Mail, Phone, MapPin, Trash2, Edit3, BarChart3, LogOut, Loader2, Lock, Unlock, PauseCircle, PlayCircle, ShieldAlert,
  MessageSquare, CheckCircle2, AlertTriangle, Send, ClipboardList, DollarSign, CalendarClock, Box, Package, Wrench, Workflow,
  ClipboardCheck, HardHat, FileText, Layout, UploadCloud, DownloadCloud, Eye, RefreshCw, GraduationCap, Video
} from 'lucide-react';
import { Button as NexusButton } from '../ui/Button';
import { Input as NexusInput } from '../ui/Input';
import { BackupEngine } from '../../lib/backupEngine';

interface Tenant {
  id: string;
  slug?: string;
  name?: string;
  companyName?: string;
  company_name?: string; // Add snake_case support
  tradingName?: string;
  trading_name?: string; // Add snake_case support
  cnpj?: string;
  adminEmail?: string;
  admin_email?: string; // Add snake_case support
  email?: string;
  phone?: string;
  address?: string;
  status: 'active' | 'suspended';
  created_at?: string;
  updated_at?: string;
  active_techs?: number;
  os_count?: number;
  equipment_count?: number;
  user_count?: number;
  userCount?: number;
  osCount?: number;
  activeTechs?: number;
  osPrefix?: string;
  os_prefix?: string;
  osStartNumber?: number;
  os_start_number?: number;
  street?: string;
  number?: string;
  complement?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  cep?: string;
  logo_url?: string;
  logoUrl?: string;
  website?: string;
  state_registration?: string;
  stateRegistration?: string;
  initialPassword?: string;
  enabled_modules?: Record<string, boolean>;
  enabledModules?: Record<string, boolean>;
  max_technicians?: number; // Limite de licenças de técnicos
  max_ai_manuals?: number; // Cota de manuais de IA por empresa (0 = ilimitado)
  metadata?: any;
}

import { DataService } from '../../services/dataService';
import SessionStorage from '../../lib/sessionStorage';

export const SuperAdminPage: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const { t } = useI18n();

  const [tenants, setTenants] = useState<Tenant[]>([]);

  console.log("SuperAdminPage Rendering");

  const handleBackup = async (tenantId: string) => {
    setBackupState({ isOpen: true, status: 'Preparando exportação...', progress: 5, tenantId });
    try {
      const engine = new BackupEngine(tenantId, (status, progress) => {
        setBackupState(prev => ({ ...prev, status, progress }));
      });
      await engine.executeBackup();
      setTimeout(() => setBackupState({ isOpen: false, status: '', progress: 0, tenantId: null }), 3000);
    } catch (e: any) {
      setBackupState(prev => ({ ...prev, status: `Erro na exportação: ${e.message}`, progress: 0 }));
    }
  };

  const loadTenants = async () => {
    try {
      const list = await DataService.getTenants();
      if (list.length === 0) {
        // Initial Seed if empty (Simulated for Demo)
        setTenants([
          {
            id: 'default',
            companyName: 'DUNO Pro Principal',
            tradingName: 'DUNO Principal',
            cnpj: '00.000.000/0001-00',
            adminEmail: 'admin@serviceflow.com',
            phone: '(11) 9999-9999',
            address: 'Rua Principal, 100',
            status: 'active',
            created_at: new Date().toISOString(),
            userCount: 0,
            osCount: 0,
            activeTechs: 0
          }
        ]);
      } else {
        setTenants(list);
      }
    } catch (e) {
      console.error("Failed to load tenants", e);
    }
  };

  useEffect(() => {
    loadTenants();
  }, []);

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      SessionStorage.remove('master_session_v2');
      SessionStorage.clear();
      window.location.hash = '';
      window.location.reload();
    }
  };

  // Removed localStorage useEffect

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Backup State
  const [backupState, setBackupState] = useState<{isOpen: boolean, status: string, progress: number, tenantId: string | null}>({isOpen: false, status: '', progress: 0, tenantId: null});

  const [formData, setFormData] = useState<Partial<Tenant>>({
    status: 'active',
    enabled_modules: {
      dashboard: true,
      orders: true,
      quotes: true,
      contracts: true,
      customers: true,
      equipments: true,
      stock: true,
      technicians: true,
      forms: true,
      users: true,
      settings: true
    }
  });
  const [isSearchingCep, setIsSearchingCep] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string, name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [targetSearchQuery, setTargetSearchQuery] = useState('');
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [messageData, setMessageData] = useState({
    title: '',
    content: '',
    type: 'broadcast' as 'broadcast' | 'targeted',
    priority: 'info' as 'info' | 'warning' | 'urgent',
    actionLabel: '',
    actionUrl: '',
    expiresAt: '',
    selectedTenants: [] as string[],
    selectedRoles: [] as string[]
  });

  const [masterNotifications, setMasterNotifications] = useState<any[]>([]);
  const [isLoadingStats, setIsLoadingStats] = useState(false);

  const loadMasterNotifications = React.useCallback(async () => {
    try {
      setIsLoadingStats(true);
      const data = await DataService.getMasterNotificationStats();
      setMasterNotifications(data || []);
    } catch (e) {
      console.error('[SuperAdminPage] Erro ao carregar estatísticas de comunicados:', e);
    } finally {
      setIsLoadingStats(false);
    }
  }, []);

  useEffect(() => {
    loadMasterNotifications();
  }, [loadMasterNotifications]);

  const handleCepSearch = async (cep: string) => {
    const rawCep = cep.replace(/\D/g, '');
    if (rawCep.length === 8) {
      setIsSearchingCep(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${rawCep}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            address: data.logradouro,
            street: data.logradouro,
            neighborhood: data.bairro,
            city: data.localidade,
            state: data.uf
          }));
        }
      } catch (error) {
        console.error("Erro ao buscar CEP:", error);
      } finally {
        setIsSearchingCep(false);
      }
    }
  };

  const handleSaveTenant = async () => {
    if (!formData.companyName || !formData.id) {
      alert("Preencha o nome e o identificador (Slug)");
      return;
    }

    if (!editingTenant && !formData.initialPassword) {
      alert("Defina uma senha inicial para o acesso da empresa.");
      return;
    }

    if (editingTenant && editingTenant.id === 'default') {
      alert("Não é possível editar a instância de teste 'default' no banco de dados real. Por favor, crie uma nova empresa para testar o provisionamento.");
      return;
    }

    try {
      // Unified Mapping (Frontend -> Database Schema)
      const payload = {
        name: formData.companyName,
        company_name: formData.companyName,
        trading_name: formData.tradingName || formData.companyName,
        cnpj: formData.cnpj,
        admin_email: formData.adminEmail,
        phone: formData.phone,
        website: (formData as any).website || '',
        state_registration: (formData as any).stateRegistration || 'ISENTO',
        status: formData.status || 'active',
        os_prefix: formData.osPrefix || (formData as any).os_prefix || 'OS-',
        os_start_number: Number(formData.osStartNumber || (formData as any).os_start_number) || 1000,
        // Colunas individuais solicitadas
        street: formData.street || formData.address,
        number: formData.number,
        complement: formData.complement,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        cep: formData.cep,
        logo_url: formData.logoUrl,
        enabled_modules: formData.enabled_modules || (formData as any).enabledModules,
        metadata: editingTenant ? (editingTenant as any).metadata : undefined,
        max_technicians: formData.max_technicians ?? 0,
        max_ai_manuals: (formData as any).max_ai_manuals !== undefined ? Number((formData as any).max_ai_manuals) : 50,
        video_quality: (formData as any).video_quality || 'hd'
      };

      if (editingTenant) {
        console.log("Attempting Update:", { id: editingTenant.id, payload });
        const result = await DataService.updateTenant({
          ...payload,
          id: editingTenant.id
        });
        console.log("Update Success:", result);
      } else {
        // Create: Let DB generate ID, but provide the slug
        const slug = formData.id.toLowerCase().replace(/\s+/g, '-');
        console.log("Attempting Create:", { slug, payload });
        const result = await DataService.createTenant({
          ...payload,
          slug: slug,
          initialPassword: formData.initialPassword
        });
        console.log("Create Success:", result);
        alert(`Empresa criada com sucesso! Acesso liberado para: ${formData.adminEmail}`);
      }

      await loadTenants();
      try {
        const { queryClient } = await import('../../hooks/useQuery');
        queryClient.clearAll();
      } catch(e) {}
      closeModal();
    } catch (e: any) {
      console.error("DETAILED ERROR FROM SUPABASE:", e);
      alert(`Erro ao salvar empresa: ${e.message || 'Verifique o console para detalhes'}`);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingTenant(null);
    setFormData({
      status: 'active',
      osPrefix: 'OS-',
      osStartNumber: 1000,
      enabled_modules: {
        dashboard: true,
        orders: true,
        quotes: true,
        contracts: true,
        customers: true,
        equipments: true,
        stock: true,
        technicians: true,
        forms: true,
        users: true,
        settings: true
      }
    });
  };

  const switchToTenant = (tenant: any) => {
    // MECANISMO DE ACESSO DIRETO (IMPERSONATION)
    // 1. Injeta o Tenant ID no Session Storage (isolado por aba)
    SessionStorage.set('current_tenant', tenant.id);

    // 2. Cria o usuário master temporário para este tenant com PERMISSÕES COMPLETAS
    const masterAdminUser = {
      id: 'master-override',
      tenantId: tenant.id, // Explicit ID for data synchronization
      name: `Master (@${tenant.id})`,
      email: tenant.admin_email || tenant.email || tenant.adminEmail,
      role: 'ADMIN',
      avatar: '',
      active: true, // 🔑 PERMISSÕES COMPLETAS DE SUPER ADMIN
      permissions: {
        orders: { create: true, read: true, update: true, delete: true },
        customers: { create: true, read: true, update: true, delete: true },
        equipments: { create: true, read: true, update: true, delete: true },
        technicians: { create: true, read: true, update: true, delete: true },
        quotes: { create: true, read: true, update: true, delete: true },
        contracts: { create: true, read: true, update: true, delete: true },
        stock: { create: true, read: true, update: true, delete: true },
        forms: { create: true, read: true, update: true, delete: true },
        settings: true,
        manageUsers: true,
        accessSuperAdmin: true,
        financial: { read: true, update: true }
      }
    };

    // 3. Sistema de Handoff (Cross-Tab Impersonation)
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    
    // Armazena temporariamente no localStorage para a nova aba capturar
    localStorage.setItem(`nexus_handoff_${token}`, JSON.stringify({
      user: masterAdminUser,
      is_impersonating: true,
      current_tenant: tenant.id,
      supabase_auth: localStorage.getItem('nexus-line-auth') || sessionStorage.getItem('nexus-line-auth')
    }));

    // 4. Abre a nova aba passando o token pela URL
    window.open(`/#/?handoff=${token}`, '_blank');
  };

  const handleDeleteTenant = async () => {
    if (!deleteConfirm) return;
    const { id, name } = deleteConfirm;

    if (id === 'default') {
      alert("Operação não permitida para a instância principal.");
      setDeleteConfirm(null);
      return;
    }

    try {
      setIsSaving(true);
      await DataService.deleteTenant(id);
      await loadTenants();
      setDeleteConfirm(null);
      alert("✅ Empresa e todos os dados vinculados foram removidos com sucesso.");
    } catch (err: any) {
      alert("❌ Erro fatal ao excluir empresa:" + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleStatus = async (tenantId: string, currentStatus: string) => {
    // Calculamos o novo status previsto
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';

    try {
      setIsSaving(true);

      // ⚡ Optimistic Update: Atualiza a interface imediatamente (sem esperar o servidor)
      // Isso resolve o problema visual de ter que recarregar a página
      setTenants(prev => prev.map(t =>
        t.id === tenantId ? { ...t, status: newStatus } : t
      ));

      // Dispara a atualização real no banco usando a função já estável e exportada
      await DataService.updateTenant({ id: tenantId, status: newStatus as any });

      // Nota: Não chamamos loadTenants() aqui intencionalmente para evitar 
      // sobrescrever o estado atualizado com dados antigos do cache (ttl 30s)
    } catch (err: any) {
      console.error("Erro no toggle:", err);
      alert("Erro ao alterar status:" + err.message);
      // Se deu erro, recarregamos para garantir consistência
      loadTenants();
    } finally {
      setIsSaving(false);
    }
  };


  /* Mascaras */
  const formatSlug = (value: string) => {
    return value.toLowerCase().replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
  };

  const formatCNPJ = (value: string) => {
    const v = value.replace(/\D/g, '');
    if (v.length <= 14) {
      return v
        .replace(/^(\d{2})(\d)/, '$1.$2')
        .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
        .replace(/\.(\d{3})(\d)/, '.$1/$2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .slice(0, 18);
    }
    return value.slice(0, 18);
  };

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length > 10) {
      return numbers.replace(/^(\d\d)(\d{5})(\d{4}).*/, '($1) $2-$3');
    }
    return numbers.replace(/^(\d\d)(\d{4})(\d{0,4}).*/, '($1) $2-$3');
  };

  const formatCEP = (value: string) => {
    return value.replace(/\D/g, '').replace(/^(\d{5})(\d)/, '$1-$2').slice(0, 9);
  };

  // Filtro de empresas
  const filteredTenants = tenants.filter(t => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const name = (t.company_name || t.name || t.companyName || '').toLowerCase();
    const email = (t.admin_email || t.email || t.adminEmail || '').toLowerCase();
    const slug = (t.slug || t.id || '').toLowerCase();
    return name.includes(q) || email.includes(q) || slug.includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-poppins relative overflow-y-auto custom-scrollbar select-none">
      {/* 🌌 Atmospheric Mesh & Grid Background */}
      <div className="fixed inset-0 bg-[radial-gradient(circle_1000px_at_50%_-200px,#1c2d4f,transparent)] opacity-40 pointer-events-none" />
      <div className="fixed inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-20 pointer-events-none" />

      <div className="max-w-[1600px] mx-auto p-4 md:p-8 space-y-6 pb-16 relative z-10">
        {/* ─── Header Big Tech Control Console ─── */}
        <header className="bg-slate-900/60 backdrop-blur-2xl border border-slate-800/80 shadow-2xl rounded-3xl p-5 md:p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden ring-1 ring-white/5">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-b from-[#1c2d4f] to-[#121f38] rounded-2xl shadow-lg shadow-[#1c2d4f]/40 ring-1 ring-white/10 shrink-0">
              <ShieldCheck size={26} className="text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-2xl font-black tracking-tight uppercase text-white flex items-center gap-2">
                  DUNO <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-indigo-300">Global</span>
                </h1>
                <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-[9px] font-extrabold uppercase tracking-[0.25em] text-blue-400 shadow-xs">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500"></span>
                  </span>
                  Master Control
                </div>
              </div>
              <p className="text-slate-400 text-xs mt-1 font-medium">Provisionamento, auditoria e telemetria de ecossistemas corporativos</p>
            </div>
          </div>

          <div className="flex gap-2.5 flex-wrap w-full md:w-auto">
            <NexusButton onClick={handleLogout} variant="secondary" className="rounded-2xl px-4 py-2.5 font-bold uppercase tracking-wider text-[10px] bg-slate-800/50 hover:bg-rose-500/20 hover:text-rose-400 border border-slate-700/60 hover:border-rose-500/40 transition-all">
              <LogOut size={14} className="mr-1.5" /> Sair
            </NexusButton>
            <NexusButton onClick={() => setIsMessageModalOpen(true)} variant="secondary" className="rounded-2xl px-4 py-2.5 font-bold uppercase tracking-wider text-[10px] bg-slate-800/60 hover:bg-slate-700/60 text-slate-200 border border-slate-700/80 transition-all flex items-center gap-1.5">
              <MessageSquare size={14} className="text-blue-400" /> Comunicado
            </NexusButton>
            <NexusButton onClick={() => setIsModalOpen(true)} className="bg-[#1c2d4f] hover:bg-[#253a66] active:bg-[#162440] text-white rounded-2xl px-6 py-2.5 font-bold text-[10px] uppercase tracking-wider shadow-lg shadow-[#1c2d4f]/30 border border-blue-400/20 active:scale-95 transition-all">
              <Plus size={15} className="mr-1.5" /> Nova Empresa
            </NexusButton>
          </div>
        </header>

        {/* ─── Stats KPI Row ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 hover:border-blue-500/40 p-4 sm:p-5 rounded-2xl shadow-xl transition-all duration-300 group hover:-translate-y-0.5 relative overflow-hidden">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl group-hover:scale-110 transition-transform border border-blue-500/20"><Globe size={16} /></div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Empresas</p>
            </div>
            <p className="text-3xl font-black text-white leading-none tracking-tight">{tenants.length}</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 hover:border-blue-500/40 p-4 sm:p-5 rounded-2xl shadow-xl transition-all duration-300 group hover:-translate-y-0.5 relative overflow-hidden">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="p-2 bg-blue-500/10 text-blue-400 rounded-xl group-hover:scale-110 transition-transform border border-blue-500/20"><Users size={16} /></div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Técnicos</p>
            </div>
            <p className="text-3xl font-black text-white leading-none tracking-tight">{tenants.reduce((acc, t) => acc + (Number(t.active_techs || (t as any).activeTechs) || 0), 0)}</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 hover:border-emerald-500/40 p-4 sm:p-5 rounded-2xl shadow-xl transition-all duration-300 group hover:-translate-y-0.5 relative overflow-hidden">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl group-hover:scale-110 transition-transform border border-emerald-500/20"><BarChart3 size={16} /></div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Ordens</p>
            </div>
            <p className="text-3xl font-black text-white leading-none tracking-tight">{tenants.reduce((acc, t) => acc + (Number(t.os_count || (t as any).osCount) || 0), 0)}</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-slate-800/80 hover:border-indigo-500/40 p-4 sm:p-5 rounded-2xl shadow-xl transition-all duration-300 group hover:-translate-y-0.5 relative overflow-hidden">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="p-2 bg-indigo-500/10 text-indigo-400 rounded-xl group-hover:scale-110 transition-transform border border-indigo-500/20"><Database size={16} /></div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Ativos</p>
            </div>
            <p className="text-3xl font-black text-white leading-none tracking-tight">{tenants.reduce((acc, t) => acc + (Number(t.equipment_count || (t as any).equipmentCount) || 0), 0)}</p>
          </div>

          <div className="bg-slate-900/50 backdrop-blur-xl border border-emerald-500/30 p-4 sm:p-5 rounded-2xl shadow-xl transition-all duration-300 col-span-2 sm:col-span-1 relative overflow-hidden ring-1 ring-emerald-500/10">
            <div className="flex items-center gap-2.5 mb-2.5">
              <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl border border-emerald-500/20"><Server size={16} /></div>
              <p className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">{t.common.status}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <p className="text-sm font-black text-emerald-400 uppercase tracking-wide leading-none">ESTÁVEL</p>
            </div>
          </div>
        </div>

        {/* ─── Tenant List Section ─── */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <Building2 size={16} className="text-blue-400" /> Instâncias Corporativas ({filteredTenants.length})
            </h2>
            <div className="relative w-full sm:w-auto">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar empresa por nome, CNPJ, slug..."
                className="bg-slate-900/60 border border-slate-800 rounded-2xl pl-9 pr-4 py-2 text-xs font-medium text-white outline-none focus:border-blue-500/60 w-full sm:w-64 placeholder:text-slate-500 transition-all focus:sm:w-80 shadow-inner"
              />
            </div>
          </div>

          <div className="space-y-3">
            {filteredTenants.map(tenant => {
              const displayTitle = tenant.company_name || tenant.name || tenant.companyName || "Empresa sem Nome";
              const displayEmail = tenant.admin_email || tenant.email || tenant.adminEmail || "sem-email@nexus.com";
              const displayId = tenant.slug || tenant.id;

              return (
                <div key={tenant.id} className="bg-slate-900/40 hover:bg-slate-900/80 backdrop-blur-xl border border-slate-800/80 hover:border-slate-700 p-5 rounded-2xl transition-all duration-300 shadow-lg hover:shadow-2xl flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 group">

                  {/* Tenant Info */}
                  <div className="flex items-center gap-4 flex-1 w-full min-w-0">
                    <div className="w-12 h-12 shrink-0 bg-gradient-to-br from-[#1c2d4f] to-[#121f38] rounded-2xl flex items-center justify-center font-black text-lg text-white group-hover:scale-105 transition-transform border border-blue-500/20 shadow-md overflow-hidden">
                       {tenant.logo_url || tenant.logoUrl ? (
                         <img src={tenant.logo_url || tenant.logoUrl} alt={displayTitle} className="w-full h-full object-cover" />
                       ) : (
                         <span className="text-white text-base font-black">{displayTitle.charAt(0)}</span>
                       )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold tracking-tight uppercase leading-snug text-white truncate group-hover:text-blue-300 transition-colors">{displayTitle}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-[9px] font-extrabold text-blue-400 uppercase bg-blue-500/10 px-2.5 py-0.5 rounded-lg border border-blue-500/20 flex items-center gap-1"><ShieldCheck size={11} /> {displayId}</span>
                        <span className="text-[9px] font-bold text-white uppercase flex items-center gap-1 bg-slate-800/60 px-2.5 py-0.5 rounded-lg border border-slate-700/60"><Mail size={11} className="text-blue-400" /> {displayEmail}</span>
                        {tenant.status === 'suspended' ? (
                          <span className="text-[9px] font-extrabold text-amber-400 uppercase flex items-center gap-1 bg-amber-500/10 px-2.5 py-0.5 rounded-lg border border-amber-500/20"><ShieldAlert size={11} /> Suspensa</span>
                        ) : (
                          <span className="text-[9px] font-extrabold text-emerald-400 uppercase flex items-center gap-1 bg-emerald-500/10 px-2.5 py-0.5 rounded-lg border border-emerald-500/20"><Activity size={11} /> Ativa</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Tenant Stats Counter */}
                  <div className="flex items-center gap-4 bg-slate-950/60 px-4 py-2.5 rounded-2xl border border-slate-800/80 shrink-0 w-full lg:w-auto justify-between lg:justify-start">
                    <div className="text-center px-1">
                      <p className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">Técs</p>
                      <p className="text-xs font-black text-white mt-0.5">{(tenant as any).real_active_techs ?? tenant.active_techs ?? (tenant as any).activeTechs ?? 0}</p>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="text-center px-1">
                      <p className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">OS</p>
                      <p className="text-xs font-black text-white mt-0.5">{(tenant as any).real_os_count ?? tenant.os_count ?? (tenant as any).osCount ?? 0}</p>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="text-center px-1">
                      <p className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">Ativos</p>
                      <p className="text-xs font-black text-white mt-0.5">{(tenant as any).real_equipment_count ?? tenant.equipment_count ?? (tenant as any).equipmentCount ?? 0}</p>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="text-center px-1" title="Licenças de técnicos">
                      <p className="text-[8px] font-extrabold text-amber-400 uppercase tracking-widest">Licenças</p>
                      <p className="text-xs font-black text-amber-300 mt-0.5">
                        {(tenant as any).max_technicians > 0 ? (tenant as any).max_technicians : '∞'}
                      </p>
                    </div>
                    <div className="w-px h-6 bg-slate-800" />
                    <div className="text-center px-1" title="Cota de Manuais Duno IA">
                      <p className="text-[8px] font-extrabold text-indigo-400 uppercase tracking-widest">Manuais IA</p>
                      <p className="text-xs font-black text-indigo-300 mt-0.5">
                        {(() => {
                          const val = (tenant as any).max_ai_manuals ?? (tenant as any).metadata?.max_ai_manuals;
                          if (val === 0) return '∞';
                          return val !== undefined && val !== null ? val : '50';
                        })()}
                      </p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 w-full lg:w-auto justify-end">
                    <button
                      onClick={async () => {
                        const fullTenant = await DataService.getTenantById(tenant.id);
                        const mergedTenant = fullTenant || tenant;
                        setEditingTenant(mergedTenant);
                        setFormData({
                          ...mergedTenant,
                          companyName: mergedTenant.company_name || mergedTenant.name || mergedTenant.companyName,
                          tradingName: mergedTenant.trading_name || mergedTenant.company_name || mergedTenant.name || mergedTenant.tradingName,
                          adminEmail: mergedTenant.admin_email || mergedTenant.email || mergedTenant.adminEmail,
                          cnpj: mergedTenant.cnpj || mergedTenant.document || mergedTenant.cnpj,
                          id: mergedTenant.slug || mergedTenant.id,
                          street: (mergedTenant as any).street || (mergedTenant as any).metadata?.street,
                          number: (mergedTenant as any).number || (mergedTenant as any).metadata?.number,
                          complement: (mergedTenant as any).complement || (mergedTenant as any).metadata?.complement,
                          neighborhood: (mergedTenant as any).neighborhood || (mergedTenant as any).metadata?.neighborhood,
                          city: (mergedTenant as any).city || (mergedTenant as any).metadata?.city,
                          state: (mergedTenant as any).state || (mergedTenant as any).metadata?.state,
                          cep: (mergedTenant as any).cep || (mergedTenant as any).metadata?.cep,
                          website: (mergedTenant as any).website || (mergedTenant as any).metadata?.website || '',
                          stateRegistration: (mergedTenant as any).state_registration || (mergedTenant as any).stateRegistration || 'ISENTO',
                          logoUrl: (mergedTenant as any).logo_url || (mergedTenant as any).logoUrl || null,
                          osPrefix: (mergedTenant as any).os_prefix || (mergedTenant as any).osPrefix || (mergedTenant as any).metadata?.os_prefix || 'OS-',
                          osStartNumber: (mergedTenant as any).os_start_number || (mergedTenant as any).osStartNumber || (mergedTenant as any).metadata?.os_start_number || 1000,
                          max_ai_manuals: (mergedTenant as any).max_ai_manuals ?? (mergedTenant as any).metadata?.max_ai_manuals ?? 50,
                          video_quality: (mergedTenant as any).video_quality ?? (mergedTenant as any).metadata?.video_quality ?? 'hd',
                          enabled_modules: mergedTenant.enabled_modules || (mergedTenant as any).enabledModules || {
                            dashboard: true, orders: true, quotes: true, contracts: true,
                            customers: true, equipments: true, stock: true, technicians: true,
                            forms: true, users: true, settings: true
                          }
                        } as any);
                        setIsModalOpen(true);
                      }}
                      className="p-2.5 bg-slate-800/60 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl transition-all border border-slate-700/60"
                      title="Editar Cadastro"
                    >
                      <Settings size={15} />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(tenant.id, tenant.status)}
                      disabled={isSaving}
                      className={`p-2.5 rounded-xl transition-all border ${tenant.status === 'suspended'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/20 hover:bg-amber-600 hover:text-white'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-600 hover:text-white'
                        }`}
                      title={tenant.status === 'suspended' ? "Reativar" : "Suspender"}
                    >
                      {tenant.status === 'suspended' ? <Lock size={15} /> : <Unlock size={15} />}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ id: tenant.id, name: displayTitle })}
                      disabled={isSaving}
                      className="p-2.5 bg-rose-500/10 text-rose-400 hover:text-white hover:bg-rose-600 rounded-xl transition-all border border-rose-500/20 disabled:opacity-50"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                    <button
                      onClick={() => switchToTenant(tenant)}
                      className="flex items-center gap-2 px-5 py-2.5 bg-[#1c2d4f] hover:bg-[#253a66] active:bg-[#162440] text-white rounded-xl font-bold text-[10px] uppercase tracking-wider border border-blue-400/20 shadow-md transition-all active:scale-95"
                    >
                      <LayoutDashboard size={14} /> Acessar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* 📢 Telemetria & Histórico de Comunicados (Fase 4) */}
        <section className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                <MessageSquare size={16} className="text-blue-400" /> Telemetria & Histórico de Comunicados
              </h2>
              <p className="text-slate-400 text-xs mt-1">Acompanhe entregabilidade, confirmações de leitura e revogue avisos em tempo real</p>
            </div>
            <button
              onClick={loadMasterNotifications}
              disabled={isLoadingStats}
              className="px-4 py-2 bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 rounded-2xl text-[10px] font-bold uppercase tracking-wider transition-all border border-slate-800 flex items-center gap-2 shrink-0 self-start sm:self-auto"
            >
              <RefreshCw size={13} className={isLoadingStats ? 'animate-spin text-blue-400' : ''} /> Atualizar Telemetria
            </button>
          </div>

          <div className="bg-slate-900/40 backdrop-blur-xl rounded-2xl border border-slate-800/80 overflow-hidden shadow-xl">
            {masterNotifications.length === 0 ? (
              <div className="p-10 text-center text-slate-500 text-xs font-medium">
                Nenhum comunicado histórico registrado no sistema.
              </div>
            ) : (
              <div className="divide-y divide-slate-800/60">
                {masterNotifications.map(notif => (
                  <div key={notif.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/30 transition-colors">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className={`px-2.5 py-0.5 rounded-lg text-[9px] font-extrabold uppercase ${
                          notif.priority === 'urgent' ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' :
                          notif.priority === 'warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                          'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        }`}>
                          {notif.priority}
                        </span>
                        <span className="text-white font-bold text-xs truncate">{notif.title}</span>
                        <span className="text-slate-500 text-[10px] font-medium">
                          ({new Date(notif.created_at || notif.createdAt).toLocaleDateString('pt-BR')} {new Date(notif.created_at || notif.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })})
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs line-clamp-1 font-medium">{notif.content}</p>
                      
                      <div className="flex items-center gap-3 text-[10px] text-slate-500 pt-1 flex-wrap font-medium">
                        <span>Público: <strong className="text-slate-300 uppercase">{notif.type === 'broadcast' ? '📢 Todos os Tenants' : `🎯 ${notif.targetTenants?.length || 0} Tenant(s)`}</strong></span>
                        {notif.targetRoles && notif.targetRoles.length > 0 && (
                          <span>Cargos: <strong className="text-blue-400 uppercase">{notif.targetRoles.join(', ')}</strong></span>
                        )}
                        {notif.actionUrl && (
                          <span className="text-emerald-400">CTA: <strong>{notif.actionLabel || 'Link'}</strong></span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {/* Telemetria de Leitura */}
                      <div className="flex items-center gap-2 bg-slate-950/80 px-3.5 py-2 rounded-xl border border-slate-800">
                        <Eye size={15} className="text-blue-400" />
                        <div className="flex flex-col">
                          <span className="text-[8px] font-extrabold text-slate-400 uppercase tracking-widest">Leituras</span>
                          <span className="text-xs font-black text-white leading-none">{notif.readCount || 0} confirmações</span>
                        </div>
                      </div>

                      {/* Revogação Instantânea Realtime */}
                      <button
                        onClick={async () => {
                          if (confirm(`Tem certeza que deseja revogar o comunicado "${notif.title}"? Ele será removido instantaneamente da tela de todos os usuários.`)) {
                            try {
                              await DataService.revokeSystemNotification(notif.id);
                              setMasterNotifications(prev => prev.filter(n => n.id !== notif.id));
                              alert('🗑️ Comunicado revogado com sucesso!');
                            } catch (e: any) {
                              alert('Erro ao revogar comunicado: ' + e.message);
                            }
                          }
                        }}
                        className="p-2.5 bg-rose-500/10 hover:bg-rose-600 text-rose-400 hover:text-white rounded-xl transition-all border border-rose-500/20 text-xs font-bold uppercase flex items-center gap-1.5"
                        title="Revogar Comunicado em Tempo Real"
                      >
                        <Trash2 size={14} /> Revogar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Modal de Cadastro/Edição de Empresa */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/80 backdrop-blur-2xl p-4 overflow-y-auto animate-in fade-in duration-300">
            <div className="bg-slate-900/90 border border-slate-800 rounded-3xl w-full max-w-4xl shadow-[0_25px_60px_rgba(0,0,0,0.8)] my-auto max-h-[95vh] flex flex-col overflow-hidden ring-1 ring-white/10">
              <div className="px-6 py-5 border-b border-slate-800 flex justify-between items-center shrink-0 bg-slate-950/40">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-gradient-to-b from-[#1c2d4f] to-[#121f38] rounded-2xl text-white shadow-lg border border-blue-500/20">
                    <Building2 size={22} className="text-blue-400" />
                  </div>
                  <div>
                    <h2 className="text-lg font-black uppercase tracking-tight text-white">
                      {editingTenant ? 'Configurar Instância' : 'Nova Instância DUNO'}
                    </h2>
                    <p className="text-[9px] text-blue-400 font-extrabold uppercase tracking-[0.2em] mt-0.5">Provisionamento de camada de dados isolada</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {editingTenant && (
                    <button 
                      onClick={() => handleBackup(editingTenant.id)}
                      className="flex items-center gap-2 px-3 py-1.5 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 rounded-lg text-[10px] uppercase font-medium tracking-widest transition-all border border-indigo-500/20"
                      title="Gerar Backup Rápido (Gravação Direta / ZIP)"
                    >
                      <DownloadCloud size={14} /> Exportar Dados
                    </button>
                  )}
                  <button onClick={closeModal} className="p-2 bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all"><X size={20} /></button>
                </div>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                <div className="bg-white/[0.02] p-5 rounded-xl border border-white/5 space-y-4">
                  <h3 className="text-[11px] font-medium text-white uppercase tracking-widest flex items-center gap-2">
                    <Briefcase size={14} className="text-primary-500" /> 1. Identidade e Documentação
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="md:col-span-2">
                      <NexusInput
                        label="Razão Social Completa"
                        placeholder="Ex: Tech Solutions Brazil LTDA"
                        value={formData.companyName || ''}
                        onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                        className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                      />
                    </div>
                    <NexusInput
                      label="Nome Fantasia"
                      placeholder="Ex: DUNO Pro Systems"
                      value={formData.tradingName || ''}
                      onChange={e => setFormData({ ...formData, tradingName: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                    />
                    <NexusInput
                      label="CNPJ"
                      placeholder="00.000.000/0001-00"
                      value={formData.cnpj || ''}
                      onChange={e => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
                      className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                    />
                    <NexusInput
                      label="Inscrição Estadual"
                      placeholder="ISENTO"
                      value={(formData as any).stateRegistration || ''}
                      onChange={e => setFormData({ ...formData, stateRegistration: e.target.value } as any)}
                      className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                    />
                    <div className="col-span-1">
                      <label className="text-[10px] font-medium text-primary-400 uppercase tracking-widest mb-4 block">Logo Oficial</label>
                      <div className="flex items-center gap-4">
                        <div className="relative group cursor-pointer" onClick={() => (document.getElementById('super-logo-upload') as HTMLInputElement)?.click()}>
                          <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center transition-all overflow-hidden ${formData.logoUrl ? 'border-primary-500/50 bg-primary-500/10' : 'border-white/10 bg-white/5 hover:border-primary-500/30 border-dashed'}`}>
                            {formData.logoUrl ? (
                              <img src={formData.logoUrl} className="w-full h-full object-contain p-2 bg-white" alt="Logo" />
                            ) : (
                              <div className="text-center font-normal text-gray-400 text-[8px] uppercase">Upload</div>
                            )}
                          </div>
                          <input
                            id="super-logo-upload"
                            type="file"
                            className="hidden"
                            accept="image/*"
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const reader = new FileReader();
                                reader.onload = (ev) => setFormData({ ...formData, logoUrl: ev.target?.result as string });
                                reader.readAsDataURL(file);
                              }
                            }}
                          />
                        </div>
                        {formData.logoUrl && (
                          <button onClick={() => setFormData({ ...formData, logoUrl: undefined })} className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all">
                            <X size={16} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white/[0.02] p-5 rounded-xl border border-white/5 space-y-4">
                  <h3 className="text-[11px] font-medium text-white uppercase tracking-widest flex items-center gap-2">
                    <MapPin size={14} className="text-primary-500" /> 2. Contato e Localização
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <NexusInput
                      label="Telefone Comercial"
                      placeholder="(11) 9999-9999"
                      value={formData.phone || ''}
                      onChange={e => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                      className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                    />
                    <NexusInput
                      label="Website"
                      placeholder="www.empresa.com.br"
                      value={(formData as any).website || ''}
                      onChange={e => setFormData({ ...formData, website: e.target.value } as any)}
                      className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                    />
                    <div className="lg:col-span-1">
                      <NexusInput
                        label="CEP"
                        placeholder="00000-000"
                        value={formData.cep || ''}
                        icon={isSearchingCep ? <Loader2 size={16} className="animate-spin text-primary-500" /> : <MapPin size={16} />}
                        onChange={e => {
                          const val = formatCEP(e.target.value);
                          setFormData({ ...formData, cep: val });
                          handleCepSearch(val);
                        }}
                        className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                      />
                    </div>
                    <div className="lg:col-span-2">
                      <NexusInput
                        label="Logradouro (Rua/Av)"
                        placeholder="Rua das Flores"
                        value={formData.street || formData.address || ''}
                        onChange={e => setFormData({ ...formData, street: e.target.value, address: e.target.value })}
                        className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                      />
                    </div>
                    <div className="lg:col-span-1">
                      <NexusInput
                        label="Número"
                        placeholder="123"
                        value={formData.number || ''}
                        onChange={e => setFormData({ ...formData, number: e.target.value })}
                        className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                      />
                    </div>
                    <div className="lg:col-span-1">
                      <NexusInput
                        label="Bairro"
                        placeholder="Centro"
                        value={formData.neighborhood || ''}
                        onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                        className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                      />
                    </div>
                    <div className="lg:col-span-1">
                      <NexusInput
                        label="Cidade"
                        placeholder="São Paulo"
                        value={formData.city || ''}
                        onChange={e => setFormData({ ...formData, city: e.target.value })}
                        className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                      />
                    </div>
                    <div className="lg:col-span-1">
                      <NexusInput
                        label="Estado (UF)"
                        placeholder="SP"
                        value={formData.state || ''}
                        onChange={e => setFormData({ ...formData, state: e.target.value })}
                        className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                      />
                    </div>
                    <div className="lg:col-span-3">
                      <NexusInput
                        label="Complemento"
                        placeholder="Sala 10, Bloco B"
                        value={formData.complement || ''}
                        onChange={e => setFormData({ ...formData, complement: e.target.value })}
                        className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                      />
                    </div>
                  </div>
                </div>

                <div className="bg-white/[0.02] p-5 rounded-xl border border-white/5 space-y-4">
                  <h3 className="text-[11px] font-medium text-white uppercase tracking-widest flex items-center gap-2">
                    <Server size={14} className="text-primary-500" /> 3. Configuração da Instância
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <NexusInput
                      label="Identificador do Sistema (Slug)"
                      labelClassName="!text-slate-300 font-medium text-xs"
                      placeholder="ex-tech-brazil"
                      disabled={!!editingTenant}
                      value={(editingTenant ? (editingTenant as any).slug || editingTenant.id : formData.id) || ''}
                      onChange={e => setFormData({ ...formData, id: formatSlug(e.target.value) })}
                      className={`!bg-slate-950 !text-white !border-slate-800 rounded-xl py-4 ${editingTenant ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                    <NexusInput
                      label="E-mail do Gestor Principal"
                      labelClassName="!text-slate-300 font-medium text-xs"
                      type="email"
                      placeholder="admin@empresa.com"
                      value={formData.adminEmail || ''}
                      onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
                      className="!bg-slate-950 !text-white !border-slate-800 font-medium rounded-xl py-4 focus:ring-blue-500"
                    />
                    {!editingTenant ? (
                      <NexusInput
                        label="Senha Inicial do Gestor"
                        labelClassName="!text-slate-300 font-medium text-xs"
                        type="password"
                        placeholder="••••••••"
                        value={formData.initialPassword || ''}
                        onChange={e => setFormData({ ...formData, initialPassword: e.target.value })}
                        className="!bg-slate-950 !text-white !border-slate-800 rounded-xl py-4"
                        icon={<Lock size={16} className="text-amber-400" />}
                      />
                    ) : (
                      <div className="col-span-1 flex flex-col justify-center text-gray-400 text-[10px] uppercase font-medium">
                        * A senha deste usuário gestor só pode ser alterada no painel principal ou via"Esqueci minha senha"
                      </div>
                    )}
                    <NexusInput
                      label="Prefixo do Código OS"
                      labelClassName="!text-slate-300 font-medium text-xs"
                      placeholder="Ex: OS-2025-"
                      value={formData.osPrefix ?? (formData as any).os_prefix ?? ''}
                      onChange={e => setFormData({ ...formData, osPrefix: e.target.value })}
                      className="!bg-slate-950 !text-white !border-slate-800 rounded-xl py-4"
                    />
                    <NexusInput
                      label="Número Inicial OS"
                      labelClassName="!text-slate-300 font-medium text-xs"
                      type="number"
                      placeholder="Ex: 1000"
                      value={formData.osStartNumber ?? (formData as any).os_start_number ?? ''}
                      onChange={e => setFormData({ ...formData, osStartNumber: Number(e.target.value) })}
                      className="!bg-slate-950 !text-white !border-slate-800 rounded-xl py-4"
                    />
                  </div>
                </div>

                {/* ─── Licenças de Técnicos ─── */}
                <div className="bg-amber-500/5 p-5 rounded-xl border border-amber-500/20 space-y-4">
                  <h3 className="text-sm font-medium text-white uppercase tracking-widest flex items-center gap-2">
                    <HardHat size={14} className="text-amber-400" /> 4. Licenças de Técnicos
                  </h3>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    Define o número máximo de técnicos que esta empresa pode cadastrar no sistema.
                    Impacta diretamente no valor do plano contratado. Deixe <strong className="text-white">0</strong> para ilimitado.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <NexusInput
                      label="Limite de Técnicos (Licenças)"
                      type="number"
                      placeholder="Ex: 5 (0 = ilimitado)"
                      value={formData.max_technicians ?? ''}
                      onChange={e => setFormData({ ...formData, max_technicians: Number(e.target.value) || 0 })}
                      className="bg-white/5 border-amber-500/20 text-white rounded-xl py-4"
                      icon={<HardHat size={16} className="text-amber-400" />}
                    />
                    <div className="flex flex-col justify-center gap-1 px-2">
                      <p className="text-xs text-amber-400 font-medium">Referência de Planos</p>
                      <div className="space-y-1">
                        {[{n:1,p:'Starter'},{n:3,p:'Basic'},{n:10,p:'Pro'},{n:25,p:'Business'},{n:0,p:'Enterprise'}].map(({n,p}) => (
                          <button key={n} type="button"
                            onClick={() => setFormData({ ...formData, max_technicians: n })}
                            className={`text-[9px] font-medium px-2 py-0.5 rounded border transition-all mr-1 ${
                              formData.max_technicians === n
                                ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:border-amber-500/30'
                            }`}
                          >
                            {n === 0 ? '∞' : n} - {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ─── Cota de Manuais Duno IA ─── */}
                <div className="bg-violet-500/5 p-5 rounded-xl border border-violet-500/20 space-y-4">
                  <h3 className="text-sm font-medium text-white uppercase tracking-widest flex items-center gap-2">
                    <GraduationCap size={14} className="text-violet-400" /> 4.5. Cota de Manuais Duno IA
                  </h3>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    Define o número máximo de manuais em PDF que esta empresa pode enviar para o aprendizado da Duno IA.
                    Deixe <strong className="text-white">0</strong> para ilimitado (Enterprise). Padrão: <strong>50</strong>.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <NexusInput
                      label="Cota de Manuais IA (PDFs)"
                      type="number"
                      placeholder="Ex: 50 (0 = ilimitado)"
                      value={(formData as any).max_ai_manuals ?? 50}
                      onChange={e => setFormData({ ...formData, max_ai_manuals: Number(e.target.value) || 0 } as any)}
                      className="bg-white/5 border-violet-500/20 text-white rounded-xl py-4"
                      icon={<GraduationCap size={16} className="text-violet-400" />}
                    />
                    <div className="flex flex-col justify-center gap-1 px-2">
                      <p className="text-xs text-violet-400 font-medium">Presets Rápidos</p>
                      <div className="space-y-1">
                        {[{n:10,p:'10 Manuais'},{n:30,p:'30 Manuais'},{n:50,p:'50 (Padrão)'},{n:100,p:'100 Manuais'},{n:0,p:'Ilimitado (∞)'}].map(({n,p}) => (
                          <button key={n} type="button"
                            onClick={() => setFormData({ ...formData, max_ai_manuals: n } as any)}
                            className={`text-[9px] font-medium px-2 py-0.5 rounded border transition-all mr-1 ${
                              (formData as any).max_ai_manuals === n
                                ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                                : 'bg-white/5 border-white/10 text-gray-400 hover:border-violet-500/30'
                            }`}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                {/* ─── Qualidade de Vídeo (Mobile) ─── */}
                <div className="bg-sky-500/5 p-5 rounded-xl border border-sky-500/20 space-y-4">
                  <h3 className="text-sm font-medium text-white uppercase tracking-widest flex items-center gap-2">
                    <Video size={14} className="text-sky-400" /> 4.6. Resolução de Vídeo (Mobile)
                  </h3>
                  <p className="text-gray-400 text-xs leading-relaxed">
                    Define a qualidade de compressão dos vídeos enviados pelos técnicos no aplicativo móvel. 
                    <strong className="text-white"> Básica</strong> reduz drasticamente o uso de armazenamento em nuvem.
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-medium text-slate-300 uppercase tracking-widest px-1">Qualidade Habilitada</label>
                      <select
                        value={(formData as any).video_quality || 'hd'}
                        onChange={e => setFormData({ ...formData, video_quality: e.target.value } as any)}
                        className="w-full bg-slate-950 border border-slate-800 text-white rounded-xl py-3 px-4 text-xs font-medium outline-none focus:border-sky-500"
                      >
                        <option value="hd">🌟 Alta (HD 720p - Mais Nitidez)</option>
                        <option value="basic">🔋 Básica (576p - Economia de Espaço)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="bg-primary-900/20 p-5 rounded-xl border border-primary-500/20 space-y-4">
                  <h3 className="text-sm font-medium text-white uppercase tracking-widest flex items-center gap-2">
                    <LayoutDashboard size={14} className="text-primary-500" /> 5. Módulos e Páginas Habilitados
                  </h3>
                  <p className="text-gray-400 text-xs leading-relaxed">Controle quais módulos e páginas esta empresa pode acessar no painel.</p>

                  <div className="space-y-3">
                    <p className="text-[9px] font-medium text-primary-400 uppercase tracking-widest">─ Módulos Principais ─</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {[
                      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                      { id: 'orders', label: 'Ordens de Serviço', icon: ClipboardList },
                      { id: 'quotes', label: 'Orçamentos', icon: DollarSign },
                      { id: 'contracts', label: 'Contratos', icon: CalendarClock },
                      { id: 'customers', label: 'Clientes', icon: Users },
                      { id: 'equipments', label: 'Ativos', icon: Box },
                      { id: 'stock', label: 'Estoque', icon: Package },
                      { id: 'technicians', label: 'Técnicos', icon: Wrench },
                      { id: 'forms', label: 'Processos/Forms', icon: Workflow },
                      { id: 'users', label: 'Gestão de Usuários', icon: ShieldAlert },
                      { id: 'settings', label: 'Configurações', icon: Settings },
                    ].map(module => {
                      const isEnabled = !!(formData.enabled_modules?.[module.id] ?? (formData as any).enabledModules?.[module.id] ?? true);
                      return (
                        <label
                          key={module.id}
                          className={`flex justify-between items-center p-3 rounded-lg border transition-all cursor-pointer select-none
                            ${isEnabled 
                              ? 'bg-[#161618] border-primary-500/40 text-white' 
                              : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/20'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-4">
                            <span className={isEnabled ?"text-primary-400" :"text-gray-700"}>
                              <module.icon size={14} />
                            </span>
                            <span className="text-[9px] font-normal uppercase tracking-tight truncate">{module.label}</span>
                          </div>
                          
                          <div className="shrink-0">
                            <input type="checkbox" className="hidden" checked={isEnabled}
                              onChange={(e) => {
                                const newModules = { ...(formData.enabled_modules || {}), [module.id]: e.target.checked };
                                setFormData({ ...formData, enabled_modules: newModules });
                              }}
                            />
                            <div className={`w-8 h-4 rounded-full transition-colors flex items-center relative ${isEnabled ? 'bg-primary-500' : 'bg-[#1c1c1e]'}`}>
                              <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform absolute top-0.5 ${isEnabled ? 'translate-x-4' : 'translate-x-0.5 opacity-30'}`} />
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                  </div>

                  <p className="text-[9px] font-medium text-amber-400 uppercase tracking-widest mt-3">─ Páginas Premium / Avançadas ─</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {[
                      { id: 'financial', label: 'Financeiro', icon: DollarSign },
                      { id: 'calendar', label: 'Calendário', icon: CalendarClock },
                      { id: 'map', label: 'Mapa de Técnicos', icon: MapPin },
                      { id: 'regions', label: 'Gestão de Regiões', icon: Globe },
                      { id: 'ai', label: 'Duno IA', icon: MessageSquare },
                      { id: 'docs', label: 'Docs / FAQ', icon: FileText },
                      { id: 'integrations', label: 'Integrações', icon: Server },
                    ].map(module => {
                      const isEnabled = !!(formData.enabled_modules?.[module.id] ?? (formData as any).enabledModules?.[module.id] ?? true);
                      return (
                        <label
                          key={module.id}
                          className={`flex justify-between items-center p-3 rounded-lg border transition-all cursor-pointer select-none
                            ${isEnabled
                              ? 'bg-[#161618] border-amber-500/40 text-white'
                              : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/20'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-4">
                            <span className={isEnabled ? 'text-amber-400' : 'text-gray-700'}>
                              <module.icon size={14} />
                            </span>
                            <span className="text-[9px] font-normal uppercase tracking-tight truncate">{module.label}</span>
                          </div>
                          <div className="shrink-0">
                            <input type="checkbox" className="hidden" checked={isEnabled}
                              onChange={(e) => {
                                const newModules = { ...(formData.enabled_modules || {}), [module.id]: e.target.checked };
                                setFormData({ ...formData, enabled_modules: newModules });
                              }}
                            />
                            <div className={`w-8 h-4 rounded-full transition-colors flex items-center relative ${isEnabled ? 'bg-amber-500' : 'bg-[#1c1c1e]'}`}>
                              <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform absolute top-0.5 ${isEnabled ? 'translate-x-4' : 'translate-x-0.5 opacity-30'}`} />
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>

                  <p className="text-[9px] font-medium text-violet-400 uppercase tracking-widest mt-3">─ Sub-Páginas de Configurações ─</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 mt-2">
                    {[
                      { id: 'settings_company', label: 'Aba: Empresa', icon: Settings },
                      { id: 'settings_system', label: 'Aba: Sistema', icon: Settings },
                      { id: 'settings_app', label: 'Aba: App', icon: Settings },
                      { id: 'settings_dashboard', label: 'Aba: Dashboard', icon: Settings },
                      { id: 'settings_whatsapp', label: 'Aba: WhatsApp Bot', icon: Settings },
                    ].map(module => {
                      const isEnabled = !!(formData.enabled_modules?.[module.id] ?? (formData as any).enabledModules?.[module.id] ?? true);
                      return (
                        <label
                          key={module.id}
                          className={`flex justify-between items-center p-3 rounded-lg border transition-all cursor-pointer select-none
                            ${isEnabled
                              ? 'bg-[#161618] border-violet-500/40 text-white'
                              : 'bg-black/30 border-white/5 text-gray-400 hover:border-white/20'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-4">
                            <span className={isEnabled ? 'text-violet-400' : 'text-gray-700'}>
                              <module.icon size={14} />
                            </span>
                            <span className="text-[9px] font-normal uppercase tracking-tight truncate">{module.label}</span>
                          </div>
                          <div className="shrink-0">
                            <input type="checkbox" className="hidden" checked={isEnabled}
                              onChange={(e) => {
                                const newModules = { ...(formData.enabled_modules || {}), [module.id]: e.target.checked };
                                setFormData({ ...formData, enabled_modules: newModules });
                              }}
                            />
                            <div className={`w-8 h-4 rounded-full transition-colors flex items-center relative ${isEnabled ? 'bg-violet-500' : 'bg-[#1c1c1e]'}`}>
                              <div className={`w-3 h-3 bg-white rounded-full shadow transition-transform absolute top-0.5 ${isEnabled ? 'translate-x-4' : 'translate-x-0.5 opacity-30'}`} />
                            </div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>



                <div className="bg-primary-500/5 p-4 rounded-xl border border-primary-500/10 flex gap-3 items-center">
                  <div className="p-2 bg-primary-500/10 rounded-lg text-primary-400 shrink-0">
                    <Database size={18} />
                  </div>
                  <p className="text-[10px] font-medium text-gray-400 leading-relaxed">
                    Esta ação provisiona uma camada de dados isolada no banco Nexus. Dados desta empresa são acessíveis apenas por este tenant.
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-white/5 bg-black/20 flex justify-end gap-3 rounded-b-2xl shrink-0">
                <NexusButton variant="secondary" onClick={closeModal} className="rounded-xl border-white/10 text-gray-400 px-6 py-2 text-xs">Descartar</NexusButton>
                <NexusButton onClick={handleSaveTenant} className="bg-primary-600 hover:bg-primary-500 rounded-xl px-8 py-2 font-medium  text-xs shadow-lg shadow-primary-600/20 active:scale-95 transition-all">
                  <Save size={16} className="mr-2" /> {editingTenant ? 'Atualizar' : 'Provisionar'}
                </NexusButton>
              </div>
            </div>
          </div>
        )}

        {/* Modal de Progresso do Backup */}
        {backupState.isOpen && (
          <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-xl p-4">
            <div className="bg-[#0a0a0a] rounded-2xl w-full max-w-md p-6 shadow-2xl border border-white/10 animate-in fade-in zoom-in duration-300">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2.5 bg-indigo-500/20 text-indigo-400 rounded-xl">
                  {backupState.progress === 100 ? <CheckCircle2 size={24} /> : <DownloadCloud size={24} className="animate-pulse" />}
                </div>
                <div>
                  <h3 className="text-white font-medium">Exportação de Dados</h3>
                  <p className="text-[10px] text-gray-400 uppercase tracking-widest">Empresa ID: {backupState.tenantId}</p>
                </div>
              </div>
              
              <div className="space-y-3 mt-6">
                <div className="flex justify-between text-xs">
                  <span className={backupState.progress === 100 ? 'text-emerald-400' : 'text-indigo-400'}>{backupState.status}</span>
                  <span className="text-white font-medium">{Math.round(backupState.progress)}%</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-2 overflow-hidden border border-white/10">
                  <div 
                    className={`h-full transition-all duration-300 ${backupState.progress === 100 ? 'bg-emerald-500' : 'bg-indigo-500 relative overflow-hidden'}`}
                    style={{ width: `${backupState.progress}%` }}
                  >
                    {backupState.progress < 100 && (
                      <div className="absolute top-0 left-0 right-0 bottom-0 bg-white/20 w-full animate-[shimmer_1s_infinite]" />
                    )}
                  </div>
                </div>
              </div>

              {backupState.progress === 100 && (
                <div className="mt-6">
                  <button onClick={() => setBackupState(prev => ({...prev, isOpen: false}))} className="w-full py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm font-medium transition-all">
                    Fechar
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {isMessageModalOpen && (
          <div className="fixed inset-0 z-[1000] bg-slate-950/80 backdrop-blur-2xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-300">
            <div className="bg-slate-900/95 w-full max-w-3xl max-h-[90vh] flex flex-col rounded-3xl border border-slate-800 shadow-[0_25px_60px_rgba(0,0,0,0.8)] overflow-hidden relative ring-1 ring-white/10">
              <div className="px-6 py-4 border-b border-slate-800 bg-slate-950/60 shrink-0">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-b from-[#1c2d4f] to-[#121f38] rounded-2xl text-blue-400 border border-blue-500/20 shadow-md">
                      <MessageSquare size={20} />
                    </div>
                    <div>
                      <h2 className="text-lg font-black uppercase tracking-tight text-white">Enviar Comunicado</h2>
                      <p className="text-[9px] font-extrabold text-blue-400 uppercase tracking-[0.2em] mt-0.5">Sincronização em tempo real WebSockets</p>
                    </div>
                  </div>
                  <button onClick={() => setIsMessageModalOpen(false)} className="p-2 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="md:col-span-2">
                    <NexusInput
                      label="Título do Comunicado"
                      labelClassName="!text-slate-300 font-medium text-xs"
                      placeholder="Ex: Manutenção Programada do Sistema"
                      value={messageData.title}
                      onChange={e => setMessageData({ ...messageData, title: e.target.value })}
                      className="!bg-slate-950 !text-white !border-slate-800 rounded-2xl py-3.5"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-medium text-slate-300 uppercase tracking-widest px-1">Tipo de Envio</label>
                    <select
                      value={messageData.type}
                      onChange={e => setMessageData({ ...messageData, type: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl py-3 px-4 text-xs font-medium outline-none focus:border-blue-500"
                    >
                      <option value="broadcast">📢 Broadcast (Todos os Painéis)</option>
                      <option value="targeted">🎯 Targeted (Apenas Selecionados)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-medium text-slate-300 uppercase tracking-widest px-1">Criticidade</label>
                    <select
                      value={messageData.priority}
                      onChange={e => setMessageData({ ...messageData, priority: e.target.value as any })}
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl py-3 px-4 text-xs font-medium outline-none focus:border-blue-500"
                    >
                      <option value="info">💬 Informativo</option>
                      <option value="warning">⚠️ Aviso / Alerta</option>
                      <option value="urgent">🚨 Urgente / Crítico</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-medium text-slate-300 uppercase tracking-widest px-1">Conteúdo da Mensagem</label>
                    <textarea
                      rows={4}
                      placeholder="Escreva aqui a mensagem que aparecerá para os usuários..."
                      value={messageData.content}
                      onChange={e => setMessageData({ ...messageData, content: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl py-3.5 px-4 text-xs font-medium outline-none focus:border-blue-500 transition-all placeholder:text-slate-500 appearance-none resize-none"
                    />
                  </div>

                  {/* 🔗 Botão de Ação CTA & Link (Opcionais - Big Tech Standard) */}
                  <div className="space-y-2">
                    <NexusInput
                      label="Rótulo do Botão de Ação / CTA (Opcional)"
                      labelClassName="!text-slate-300 font-medium text-xs"
                      placeholder="Ex: Ver Detalhes, Pagar Fatura..."
                      value={messageData.actionLabel}
                      onChange={e => setMessageData({ ...messageData, actionLabel: e.target.value })}
                      className="!bg-slate-950 !text-white !border-slate-800 rounded-2xl py-3"
                    />
                  </div>

                  <div className="space-y-2">
                    <NexusInput
                      label="URL de Destino do Botão (Opcional)"
                      labelClassName="!text-slate-300 font-medium text-xs"
                      placeholder="Ex: /admin/financial ou https://..."
                      value={messageData.actionUrl}
                      onChange={e => setMessageData({ ...messageData, actionUrl: e.target.value })}
                      className="!bg-slate-950 !text-white !border-slate-800 rounded-2xl py-3"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-medium text-slate-300 uppercase tracking-widest px-1">Data/Hora de Expiração (Opcional - Manutenção Temporária)</label>
                    <input
                      type="datetime-local"
                      value={messageData.expiresAt}
                      onChange={e => setMessageData({ ...messageData, expiresAt: e.target.value })}
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl py-3 px-4 text-xs font-medium outline-none focus:border-blue-500 transition-all"
                    />
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-medium text-slate-300 uppercase tracking-widest px-1">Cargos Alvo / Perfil de Usuários</label>
                    <select
                      value={messageData.selectedRoles.length === 0 ? 'ALL' : messageData.selectedRoles[0]}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'ALL') {
                          setMessageData({ ...messageData, selectedRoles: [] });
                        } else {
                          setMessageData({ ...messageData, selectedRoles: [val] });
                        }
                      }}
                      className="w-full bg-slate-950 border border-slate-800 text-white rounded-2xl py-3 px-4 text-xs font-medium outline-none focus:border-blue-500"
                    >
                      <option value="ALL">🌐 Todos os Cargos (Gestores + Técnicos)</option>
                      <option value="ADMIN">🛡️ Apenas Gestores / Administradores (ADMIN)</option>
                      <option value="TECHNICIAN">🔧 Apenas Técnicos do App (TECHNICIAN)</option>
                    </select>
                  </div>

                  {messageData.type === 'targeted' && (
                    <div className="md:col-span-2 space-y-3">
                      <label className="text-[10px] font-medium text-slate-300 uppercase tracking-widest px-1">Selecionar Empresas Alvo</label>
                      
                      {/* Search filter */}
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          value={targetSearchQuery}
                          onChange={e => setTargetSearchQuery(e.target.value)}
                          placeholder="Filtrar por nome, CNPJ..."
                          className="w-full bg-slate-950 border border-slate-800 text-white rounded-lg pl-8 pr-3 py-2 text-xs font-normal outline-none focus:border-blue-500 placeholder:text-slate-500"
                        />
                      </div>

                      {/* Selected count */}
                      {messageData.selectedTenants.length > 0 && (
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[9px] font-bold text-emerald-400 uppercase">{messageData.selectedTenants.length} empresa(s) selecionada(s)</span>
                          <button
                            onClick={() => setMessageData({ ...messageData, selectedTenants: [] })}
                            className="text-[9px] font-bold text-red-400 uppercase hover:text-red-300 transition-colors"
                          >Limpar seleção</button>
                        </div>
                      )}

                      {/* Filtered tenant list */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[200px] overflow-y-auto pr-1 custom-scrollbar">
                        {tenants
                          .filter(t => {
                            if (!targetSearchQuery) return true;
                            const q = targetSearchQuery.toLowerCase();
                            const name = (t.company_name || t.name || t.companyName || '').toLowerCase();
                            const cnpj = (t.cnpj || t.document || '').toLowerCase();
                            const email = (t.admin_email || t.email || t.adminEmail || '').toLowerCase();
                            return name.includes(q) || cnpj.includes(q) || email.includes(q);
                          })
                          .map(tenant => (
                          <label
                            key={tenant.id}
                            className={`flex items-center gap-2 p-2.5 rounded-lg border transition-all cursor-pointer ${messageData.selectedTenants.includes(tenant.id)
                              ? 'bg-blue-600/20 border-blue-500 text-white'
                              : 'bg-slate-950 border-slate-800 text-gray-300 hover:border-slate-700'
                              }`}
                          >
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={messageData.selectedTenants.includes(tenant.id)}
                              onChange={(e) => {
                                const ids = e.target.checked
                                  ? [...messageData.selectedTenants, tenant.id]
                                  : messageData.selectedTenants.filter(id => id !== tenant.id);
                                setMessageData({ ...messageData, selectedTenants: ids });
                              }}
                            />
                            <div className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-all ${messageData.selectedTenants.includes(tenant.id) ? 'bg-blue-500 border-blue-500' : 'border-slate-700'
                              }`}>
                              {messageData.selectedTenants.includes(tenant.id) && <CheckCircle2 size={9} />}
                            </div>
                            <div className="min-w-0">
                              <span className="text-[9px] font-bold uppercase truncate block text-white">{tenant.company_name || tenant.name || tenant.companyName}</span>
                              {(tenant.cnpj || tenant.document) && (
                                <span className="text-[8px] text-slate-400 block">{tenant.cnpj || tenant.document}</span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/80 shrink-0 flex gap-4">
                <NexusButton
                  variant="secondary"
                  onClick={() => setIsMessageModalOpen(false)}
                  className="flex-1 rounded-2xl py-3.5 font-bold uppercase text-xs"
                >
                  Cancelar
                </NexusButton>
                <NexusButton
                  onClick={async () => {
                    if (!messageData.title || !messageData.content) {
                      alert("Por favor, preencha o título e o conteúdo.");
                      return;
                    }
                    if (messageData.type === 'targeted' && messageData.selectedTenants.length === 0) {
                      alert("Selecione pelo menos uma empresa para envio direcionado.");
                      return;
                    }

                    try {
                      setIsSaving(true);
                      await DataService.createSystemNotification({
                        title: messageData.title,
                        content: messageData.content,
                        type: messageData.type,
                        priority: messageData.priority,
                        actionLabel: messageData.actionLabel.trim() || undefined,
                        actionUrl: messageData.actionUrl.trim() || undefined,
                        expiresAt: messageData.expiresAt ? new Date(messageData.expiresAt).toISOString() : undefined,
                        targetTenants: messageData.type === 'targeted' ? messageData.selectedTenants : undefined,
                        targetRoles: messageData.selectedRoles.length > 0 ? messageData.selectedRoles : undefined
                      });
                      alert("🚀 Comunicado enviado com sucesso em tempo real!");
                      setIsMessageModalOpen(false);
                      setMessageData({
                        title: '',
                        content: '',
                        type: 'broadcast',
                        priority: 'info',
                        actionLabel: '',
                        actionUrl: '',
                        expiresAt: '',
                        selectedTenants: [],
                        selectedRoles: []
                      });
                      await loadMasterNotifications();
                    } catch (e: any) {
                      alert("Erro ao enviar comunicado:" + e.message);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  isLoading={isSaving}
                  className="flex-[2] bg-primary-600 hover:bg-primary-500 rounded-2xl py-3.5 font-bold uppercase shadow-xl shadow-primary-500/20"
                >
                  Disparar Comunicado <Send size={16} className="ml-2" />
                </NexusButton>
              </div>
            </div>
          </div>
        )}

        {/* 🚨 Modal de Confirmação Crítica de Exclusão */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/98 backdrop-blur-3xl p-4">
            <div className="bg-[#1c1c26] border border-red-500/20 rounded-[3rem] w-full max-w-lg p-12 shadow-2xl animate-scale-in">
              <div className="flex flex-col items-center text-center space-y-8 font-poppins">
                <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                  <ShieldAlert size={48} />
                </div>

                <div className="space-y-4">
                  <h3 className="text-3xl font-medium  uppercase tracking-tight text-white">Excluir Nexus</h3>
                  <p className="text-gray-400 font-medium px-4">
                    Você está prestes a remover <span className="text-white font-medium">"{deleteConfirm.name}"</span> e todos os seus dados vinculados.
                  </p>
                  <p className="bg-red-500/10 text-red-400 text-[10px] font-medium uppercase p-4 rounded-2xl border border-red-500/20">
                    ⚠️ Esta ação é irreversível e apagará permanentemente todos os usuários e ordens de serviço.
                  </p>
                </div>

                <div className="flex flex-col w-full gap-4">
                  <NexusButton
                    variant="primary"
                    onClick={handleDeleteTenant}
                    disabled={isSaving}
                    className="bg-red-600 hover:bg-red-500 py-6 rounded-2xl font-medium uppercase tracking-widest text-xs  shadow-2xl shadow-red-600/30 active:scale-95 transition-all"
                  >
                    {isSaving ? <Loader2 className="animate-spin mr-2" /> :"Sim, Excluir Instantaneamente"}
                  </NexusButton>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    disabled={isSaving}
                    className="py-4 text-gray-400 hover:text-white font-medium uppercase tracking-[0.3em] text-[9px] transition-colors"
                  >
                    Cancelar Operação
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
