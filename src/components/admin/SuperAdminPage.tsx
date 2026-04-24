
import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, Globe, Plus, Building2, Users,
  Activity, Server, Database, Save, X, ExternalLink,
  ChevronRight, Laptop, Briefcase, Search, LayoutDashboard,
  Settings, Mail, Phone, MapPin, Trash2, Edit3, BarChart3, LogOut, Loader2, Lock, Unlock, PauseCircle, PlayCircle, ShieldAlert,
  MessageSquare, CheckCircle2, AlertTriangle, Send, ClipboardList, DollarSign, CalendarClock, Box, Package, Wrench, Workflow,
  ClipboardCheck, HardHat, FileText, Layout, UploadCloud
} from 'lucide-react';
import { Button as NexusButton } from '../ui/Button';
import { Input as NexusInput } from '../ui/Input';

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
  metadata?: any;
}

import { DataService } from '../../services/dataService';
import SessionStorage from '../../lib/sessionStorage';

export const SuperAdminPage: React.FC<{ onLogout?: () => void }> = ({ onLogout }) => {
  const [tenants, setTenants] = useState<Tenant[]>([]);

  console.log("SuperAdminPage Rendering");

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
    selectedTenants: [] as string[]
  });

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
        os_prefix: formData.osPrefix || 'OS-',
        os_start_number: Number(formData.osStartNumber) || 1000,
        // Colunas individuais solicitadas
        street: formData.street || formData.address,
        number: formData.number,
        complement: formData.complement,
        neighborhood: formData.neighborhood,
        city: formData.city,
        state: formData.state,
        cep: formData.cep,
        logo_url: formData.logoUrl,
        enabled_modules: formData.enabled_modules || (formData as any).enabledModules
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

    // 3. Define flags de estado (isolados nesta aba)
    SessionStorage.set('user', masterAdminUser);
    SessionStorage.set('is_impersonating', true);

    // 4. Limpa o hash para evitar loops de redirecionamento no App.tsx
    window.location.hash = "";

    // 5. Redirecionamento forçado para a raiz para sair do modo Master UI
    setTimeout(() => {
      window.location.href = '/';
    }, 100);
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
      alert("❌ Erro fatal ao excluir empresa: " + err.message);
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

      // Dispara a atualização real no banco
      await DataService.toggleTenantStatus(tenantId, currentStatus);

      // Nota: Não chamamos loadTenants() aqui intencionalmente para evitar 
      // sobrescrever o estado atualizado com dados antigos do cache (ttl 30s)
    } catch (err: any) {
      console.error("Erro no toggle:", err);
      alert("Erro ao alterar status: " + err.message);
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
    <div className="min-h-screen bg-black text-white p-4 md:p-6 font-poppins overflow-y-auto custom-scrollbar">
      <div className="max-w-[1600px] mx-auto space-y-5 pb-10 animate-fade-in">
        {/* ─── Header ─── */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-600 rounded-lg shadow-lg shadow-primary-500/20">
              <ShieldCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black italic tracking-tighter uppercase">DUNO <span className="text-primary-500">Global</span></h1>
                <span className="text-[8px] font-black uppercase tracking-[0.3em] text-primary-400 bg-primary-500/10 px-2 py-0.5 rounded-full border border-primary-500/20">Master Control</span>
              </div>
              <p className="text-gray-500 text-[11px] mt-0.5 font-medium">Provisionamento e auditoria de ecossistemas técnicos</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <NexusButton onClick={handleLogout} variant="secondary" className="rounded-xl px-4 py-2 font-bold uppercase tracking-wider text-[9px] hover:bg-red-500/20 hover:text-red-400 border border-transparent hover:border-red-500/30 transition-all">
              <LogOut size={14} className="mr-1.5" /> Sair
            </NexusButton>
            <NexusButton onClick={() => setIsMessageModalOpen(true)} variant="secondary" className="rounded-xl px-4 py-2 font-bold uppercase tracking-wider text-[9px] bg-white/5 border-white/10 hover:bg-white/10 transition-all">
              <MessageSquare size={14} className="mr-1.5 text-primary-400" /> Comunicado
            </NexusButton>
            <NexusButton onClick={() => setIsModalOpen(true)} className="bg-primary-600 hover:bg-primary-500 rounded-xl px-5 py-2 font-black italic text-[10px] shadow-lg shadow-primary-500/20 active:scale-95 transition-all">
              <Plus size={14} className="mr-1.5" /> Nova Empresa
            </NexusButton>
          </div>
        </header>

        {/* ─── Stats Row ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <div className="bg-[#111113] p-4 rounded-xl border border-white/5 hover:border-primary-500/20 transition-colors group">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-primary-500/10 text-primary-400 rounded-lg group-hover:scale-110 transition-transform"><Globe size={16} /></div>
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Empresas</p>
            </div>
            <p className="text-2xl font-black leading-none">{tenants.length}</p>
          </div>
          <div className="bg-[#111113] p-4 rounded-xl border border-white/5 hover:border-primary-500/20 transition-colors group">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-primary-500/10 text-primary-400 rounded-lg group-hover:scale-110 transition-transform"><Users size={16} /></div>
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Técnicos</p>
            </div>
            <p className="text-2xl font-black leading-none">{tenants.reduce((acc, t) => acc + (Number(t.active_techs || (t as any).activeTechs) || 0), 0)}</p>
          </div>
          <div className="bg-[#111113] p-4 rounded-xl border border-white/5 hover:border-emerald-500/20 transition-colors group">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-emerald-500/10 text-emerald-400 rounded-lg group-hover:scale-110 transition-transform"><BarChart3 size={16} /></div>
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Ordens</p>
            </div>
            <p className="text-2xl font-black leading-none">{tenants.reduce((acc, t) => acc + (Number(t.os_count || (t as any).osCount) || 0), 0)}</p>
          </div>
          <div className="bg-[#111113] p-4 rounded-xl border border-white/5 hover:border-primary-500/20 transition-colors group">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-primary-500/10 text-primary-400 rounded-lg group-hover:scale-110 transition-transform"><Database size={16} /></div>
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Ativos</p>
            </div>
            <p className="text-2xl font-black leading-none">{tenants.reduce((acc, t) => acc + (Number(t.equipment_count || (t as any).equipmentCount) || 0), 0)}</p>
          </div>
          <div className="bg-[#111113] p-4 rounded-xl border border-white/5 border-emerald-500/20 col-span-2 sm:col-span-1">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-1.5 bg-amber-500/10 text-amber-400 rounded-lg"><Server size={16} /></div>
              <p className="text-[9px] font-bold text-gray-500 uppercase tracking-wider">Status</p>
            </div>
            <p className="text-sm font-black text-emerald-500 uppercase italic leading-none">ESTÁVEL</p>
          </div>
        </div>

        {/* ─── Tenant List ─── */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-gray-500">Instâncias Corporativas ({filteredTenants.length})</h2>
            <div className="relative">
              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Buscar empresa..."
                className="bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-[10px] font-bold outline-none focus:border-primary-500/50 w-48 placeholder:text-gray-600 transition-all focus:w-64"
              />
            </div>
          </div>

          <div className="space-y-2">
            {filteredTenants.map(tenant => {
              const displayTitle = tenant.company_name || tenant.name || tenant.companyName || "Empresa sem Nome";
              const displayEmail = tenant.admin_email || tenant.email || tenant.adminEmail || "sem-email@nexus.com";
              const displayId = tenant.slug || tenant.id;

              return (
                <div key={tenant.id} className="bg-[#111113] hover:bg-[#18181b] border border-white/5 hover:border-white/10 px-5 py-4 rounded-xl transition-all flex flex-col lg:flex-row items-center gap-4 group">

                  {/* Info */}
                  <div className="flex items-center gap-4 flex-1 w-full min-w-0">
                    <div className="w-11 h-11 shrink-0 bg-gradient-to-br from-primary-600 to-indigo-800 rounded-xl flex items-center justify-center font-black text-lg italic shadow-lg shadow-primary-500/20 group-hover:scale-105 transition-transform border border-white/10 overflow-hidden">
                       {tenant.logo_url || tenant.logoUrl ? (
                         <img src={tenant.logo_url || tenant.logoUrl} alt={displayTitle} className="w-full h-full object-cover" />
                       ) : (
                         <span className="text-white text-sm">{displayTitle.charAt(0)}</span>
                       )}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-black tracking-tight uppercase leading-none text-white truncate">{displayTitle}</h3>
                      <div className="flex flex-wrap items-center gap-2 mt-1.5">
                        <span className="text-[8px] font-bold text-primary-400 uppercase bg-primary-500/10 px-2 py-0.5 rounded border border-primary-500/20 flex items-center gap-1"><ShieldCheck size={10} /> {displayId}</span>
                        <span className="text-[8px] font-bold text-gray-500 uppercase flex items-center gap-1"><Mail size={10} /> {displayEmail}</span>
                        {tenant.status === 'suspended' ? (
                          <span className="text-[8px] font-bold text-red-400 uppercase flex items-center gap-1 bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20"><ShieldAlert size={10} /> Suspensa</span>
                        ) : (
                          <span className="text-[8px] font-bold text-emerald-400 uppercase flex items-center gap-1 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20"><Activity size={10} /> Ativa</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-4 bg-black/30 px-4 py-2.5 rounded-lg border border-white/5 shrink-0">
                    <div className="text-center">
                      <p className="text-[7px] font-bold text-gray-500 uppercase">Técs</p>
                      <p className="text-sm font-black text-white">{(tenant as any).real_active_techs ?? tenant.active_techs ?? (tenant as any).activeTechs ?? 0}</p>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="text-center">
                      <p className="text-[7px] font-bold text-gray-500 uppercase">OS</p>
                      <p className="text-sm font-black text-white">{(tenant as any).real_os_count ?? tenant.os_count ?? (tenant as any).osCount ?? 0}</p>
                    </div>
                    <div className="w-px h-6 bg-white/10" />
                    <div className="text-center">
                      <p className="text-[7px] font-bold text-gray-500 uppercase">Ativos</p>
                      <p className="text-sm font-black text-white">{(tenant as any).real_equipment_count ?? tenant.equipment_count ?? (tenant as any).equipmentCount ?? 0}</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setEditingTenant(tenant);
                        setFormData({
                          ...tenant,
                          companyName: tenant.company_name || tenant.name || tenant.companyName,
                          tradingName: tenant.trading_name || tenant.company_name || tenant.name || tenant.tradingName,
                          adminEmail: tenant.admin_email || tenant.email || tenant.adminEmail,
                          cnpj: tenant.cnpj || tenant.document || tenant.cnpj,
                          id: tenant.slug || tenant.id,
                          street: (tenant as any).street || (tenant as any).metadata?.street,
                          number: (tenant as any).number || (tenant as any).metadata?.number,
                          complement: (tenant as any).complement || (tenant as any).metadata?.complement,
                          neighborhood: (tenant as any).neighborhood || (tenant as any).metadata?.neighborhood,
                          city: (tenant as any).city || (tenant as any).metadata?.city,
                          state: (tenant as any).state || (tenant as any).metadata?.state,
                          cep: (tenant as any).cep || (tenant as any).metadata?.cep,
                          website: (tenant as any).website || (tenant as any).metadata?.website || '',
                          stateRegistration: (tenant as any).state_registration || (tenant as any).stateRegistration || 'ISENTO',
                          logoUrl: (tenant as any).logo_url || (tenant as any).logoUrl || null,
                          enabled_modules: tenant.enabled_modules || (tenant as any).enabledModules || {
                            dashboard: true, orders: true, quotes: true, contracts: true,
                            customers: true, equipments: true, stock: true, technicians: true,
                            forms: true, users: true, settings: true
                          }
                        } as any);
                        setIsModalOpen(true);
                      }}
                      className="p-2.5 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-all border border-white/5"
                      title="Editar Cadastro"
                    >
                      <Settings size={16} />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(tenant.id, tenant.status)}
                      disabled={isSaving}
                      className={`p-2.5 rounded-lg transition-all border ${tenant.status === 'suspended'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/10 hover:bg-amber-600 hover:text-white'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10 hover:bg-emerald-600 hover:text-white'
                        }`}
                      title={tenant.status === 'suspended' ? "Reativar" : "Suspender"}
                    >
                      {tenant.status === 'suspended' ? <Lock size={16} /> : <Unlock size={16} />}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ id: tenant.id, name: displayTitle })}
                      disabled={isSaving}
                      className="p-2.5 bg-red-500/10 text-red-400 hover:text-white hover:bg-red-600 rounded-lg transition-all border border-red-500/10 disabled:opacity-50"
                      title="Excluir"
                    >
                      <Trash2 size={16} />
                    </button>
                    <button
                      onClick={() => switchToTenant(tenant)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-primary-600 text-white rounded-lg font-bold text-[9px] uppercase tracking-wider shadow-md shadow-primary-600/20 hover:bg-primary-500 transition-all active:scale-95"
                    >
                      <LayoutDashboard size={14} /> Acessar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Modal de Cadastro/Edição de Empresa */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/90 backdrop-blur-xl p-3 overflow-y-auto">
            <div className="bg-[#111113] rounded-2xl w-full max-w-4xl shadow-2xl border border-white/10 animate-fade-in-up my-auto max-h-[95vh] flex flex-col">
              <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary-600 rounded-xl text-white shadow-lg shadow-primary-500/20">
                    <Building2 size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black italic uppercase tracking-tighter">
                      {editingTenant ? 'Configurar Instância' : 'Nova Instância DUNO'}
                    </h2>
                    <p className="text-[9px] text-primary-400/60 font-bold uppercase tracking-widest">Provisionamento de camada de dados isolada</p>
                  </div>
                </div>
                <button onClick={closeModal} className="p-2 bg-white/5 rounded-lg text-gray-400 hover:text-white transition-all"><X size={20} /></button>
              </div>

              <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
                <div className="bg-white/[0.02] p-5 rounded-xl border border-white/5 space-y-4">
                  <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
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
                      <label className="text-[10px] font-black text-primary-400 uppercase tracking-widest mb-4 block">Logo Oficial</label>
                      <div className="flex items-center gap-4">
                        <div className="relative group cursor-pointer" onClick={() => (document.getElementById('super-logo-upload') as HTMLInputElement)?.click()}>
                          <div className={`w-16 h-16 rounded-2xl border flex items-center justify-center transition-all overflow-hidden ${formData.logoUrl ? 'border-primary-500/50 bg-primary-500/10' : 'border-white/10 bg-white/5 hover:border-primary-500/30 border-dashed'}`}>
                            {formData.logoUrl ? (
                              <img src={formData.logoUrl} className="w-full h-full object-contain p-2 bg-white" alt="Logo" />
                            ) : (
                              <div className="text-center font-bold text-gray-500 text-[8px] uppercase">Upload</div>
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
                  <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
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
                  <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <Server size={14} className="text-primary-500" /> 3. Configuração da Instância
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <NexusInput
                      label="Identificador do Sistema (Slug)"
                      placeholder="ex-tech-brazil"
                      disabled={!!editingTenant}
                      value={(editingTenant ? (editingTenant as any).slug || editingTenant.id : formData.id) || ''}
                      onChange={e => setFormData({ ...formData, id: formatSlug(e.target.value) })}
                      className={`bg-white/5 border-white/10 text-white rounded-xl py-4 ${editingTenant ? 'opacity-50 cursor-not-allowed' : ''}`}
                    />
                    <NexusInput
                      label="E-mail do Gestor Principal"
                      type="email"
                      placeholder="admin@empresa.com"
                      value={formData.adminEmail || ''}
                      onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
                      className="bg-white/5 border-white/10 text-emerald-400 font-bold rounded-xl py-4 focus:ring-emerald-500"
                    />
                    {!editingTenant ? (
                      <NexusInput
                        label="Senha Inicial do Gestor"
                        type="password"
                        placeholder="••••••••"
                        value={formData.initialPassword || ''}
                        onChange={e => setFormData({ ...formData, initialPassword: e.target.value })}
                        className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                        icon={<Lock size={16} className="text-amber-400" />}
                      />
                    ) : (
                      <div className="col-span-1 flex flex-col justify-center text-gray-500 text-[10px] uppercase font-black">
                        * A senha deste usuário gestor só pode ser alterada no painel principal ou via "Esqueci minha senha"
                      </div>
                    )}
                    <NexusInput
                      label="Prefixo do Código OS"
                      placeholder="Ex: OS-2025-"
                      value={formData.osPrefix || ''}
                      onChange={e => setFormData({ ...formData, osPrefix: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                    />
                    <NexusInput
                      label="Número Inicial OS"
                      type="number"
                      placeholder="Ex: 1000"
                      value={formData.osStartNumber || ''}
                      onChange={e => setFormData({ ...formData, osStartNumber: Number(e.target.value) })}
                      className="bg-white/5 border-white/10 text-white rounded-xl py-4"
                    />
                  </div>
                </div>

                <div className="bg-primary-900/20 p-5 rounded-xl border border-primary-500/20 space-y-4">
                  <h3 className="text-[11px] font-black text-white uppercase tracking-widest flex items-center gap-2">
                    <LayoutDashboard size={14} className="text-primary-500" /> 4. Módulos Habilitados
                  </h3>

                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                    {[
                      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                      { id: 'orders', label: 'Ordens de Serviço', icon: ClipboardList },
                      { id: 'quotes', label: 'Orçamentos', icon: DollarSign },
                      { id: 'contracts', label: 'Contratos', icon: CalendarClock },
                      { id: 'clients', label: 'Clientes', icon: Users },
                      { id: 'equip', label: 'Ativos', icon: Box },
                      { id: 'stock', label: 'Estoque', icon: Package },
                      { id: 'techs', label: 'Técnicos', icon: Wrench },
                      { id: 'forms', label: 'Processos', icon: Workflow },
                      { id: 'users', label: 'Gestão Admin', icon: ShieldAlert },
                      { id: 'settings', label: 'Config. Globais', icon: Settings },
                      { id: 'financial', label: 'Financeiro', icon: DollarSign },
                    ].map(module => {
                      const isEnabled = !!(formData.enabled_modules?.[module.id] ?? (formData as any).enabledModules?.[module.id] ?? true);
                      return (
                        <label
                          key={module.id}
                          className={`flex justify-between items-center p-3 rounded-lg border transition-all cursor-pointer select-none
                            ${isEnabled 
                              ? 'bg-[#161618] border-primary-500/40 text-white' 
                              : 'bg-black/30 border-white/5 text-gray-600 hover:border-white/20'}`}
                        >
                          <div className="flex items-center gap-2 min-w-0 pr-4">
                            <span className={isEnabled ? "text-primary-400" : "text-gray-700"}>
                              <module.icon size={14} />
                            </span>
                            <span className="text-[9px] font-bold uppercase tracking-tight truncate">{module.label}</span>
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



                <div className="bg-primary-500/5 p-4 rounded-xl border border-primary-500/10 flex gap-3 items-center">
                  <div className="p-2 bg-primary-500/10 rounded-lg text-primary-400 shrink-0">
                    <Database size={18} />
                  </div>
                  <p className="text-[10px] font-medium text-gray-500 leading-relaxed italic">
                    Esta ação provisiona uma camada de dados isolada no banco Nexus. Dados desta empresa são acessíveis apenas por este tenant.
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-white/5 bg-black/20 flex justify-end gap-3 rounded-b-2xl shrink-0">
                <NexusButton variant="secondary" onClick={closeModal} className="rounded-xl border-white/10 text-gray-500 px-6 py-2 text-xs">Descartar</NexusButton>
                <NexusButton onClick={handleSaveTenant} className="bg-primary-600 hover:bg-primary-500 rounded-xl px-8 py-2 font-black italic text-xs shadow-lg shadow-primary-600/20 active:scale-95 transition-all">
                  <Save size={16} className="mr-2" /> {editingTenant ? 'Atualizar' : 'Provisionar'}
                </NexusButton>
              </div>
            </div>
          </div>
        )}

        {isMessageModalOpen && (
          <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 animate-fade-in">
            <div className="bg-[#0e0e10] w-full max-w-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative">
              <div className="px-6 py-4 border-b border-white/5 bg-gradient-to-r from-primary-900/20 to-transparent">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-black italic uppercase tracking-tighter">Enviar Comunicado</h2>
                    <p className="text-[9px] font-bold text-primary-400 uppercase tracking-widest mt-0.5">Sincronização em tempo real</p>
                  </div>
                  <button onClick={() => setIsMessageModalOpen(false)} className="p-2 hover:bg-white/5 rounded-lg text-gray-500 transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="md:col-span-2">
                    <NexusInput
                      label="Título do Comunicado"
                      placeholder="Ex: Manutenção Programada do Sistema"
                      value={messageData.title}
                      onChange={e => setMessageData({ ...messageData, title: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-primary-400 uppercase tracking-widest px-2">Tipo de Envio</label>
                    <select
                      value={messageData.type}
                      onChange={e => setMessageData({ ...messageData, type: e.target.value as any })}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-3 px-4 text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary-500/50"
                    >
                      <option value="broadcast">📢 Broadcast (Todos os Painéis)</option>
                      <option value="targeted">🎯 Targeted (Apenas Selecionados)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-primary-400 uppercase tracking-widest px-2">Criticidade</label>
                    <select
                      value={messageData.priority}
                      onChange={e => setMessageData({ ...messageData, priority: e.target.value as any })}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-3 px-4 text-[10px] font-black uppercase tracking-widest outline-none focus:border-primary-500/50"
                    >
                      <option value="info">💬 Informativo</option>
                      <option value="warning">⚠️ Aviso / Alerta</option>
                      <option value="urgent">🚨 Urgente / Crítico</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-primary-400 uppercase tracking-widest px-2">Conteúdo da Mensagem</label>
                    <textarea
                      rows={4}
                      placeholder="Escreva aqui a mensagem que aparecerá no centro da tela dos usuários..."
                      value={messageData.content}
                      onChange={e => setMessageData({ ...messageData, content: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-4 px-4 text-xs font-medium outline-none focus:border-primary-500/50 transition-all placeholder:text-gray-600 appearance-none resize-none"
                    />
                  </div>

                  {messageData.type === 'targeted' && (
                    <div className="md:col-span-2 space-y-3">
                      <label className="text-[10px] font-black text-primary-400 uppercase tracking-widest px-2">Selecionar Empresas Alvo</label>
                      
                      {/* Search filter */}
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-600" />
                        <input
                          type="text"
                          value={targetSearchQuery}
                          onChange={e => setTargetSearchQuery(e.target.value)}
                          placeholder="Filtrar por nome, CNPJ..."
                          className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-[10px] font-bold outline-none focus:border-primary-500/50 placeholder:text-gray-600"
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
                              ? 'bg-primary-600/20 border-primary-500/50 text-white'
                              : 'bg-white/5 border-white/5 text-gray-400 hover:border-white/10'
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
                            <div className={`w-3.5 h-3.5 rounded shrink-0 border flex items-center justify-center transition-all ${messageData.selectedTenants.includes(tenant.id) ? 'bg-primary-500 border-primary-500' : 'border-white/20'
                              }`}>
                              {messageData.selectedTenants.includes(tenant.id) && <CheckCircle2 size={9} />}
                            </div>
                            <div className="min-w-0">
                              <span className="text-[9px] font-bold uppercase truncate block">{tenant.company_name || tenant.name || tenant.companyName}</span>
                              {(tenant.cnpj || tenant.document) && (
                                <span className="text-[8px] text-gray-500 block">{tenant.cnpj || tenant.document}</span>
                              )}
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="p-10 border-t border-white/5 bg-black/20 flex gap-4">
                <NexusButton
                  variant="secondary"
                  onClick={() => setIsMessageModalOpen(false)}
                  className="flex-1 rounded-2xl py-4 font-black uppercase text-[10px]"
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
                        targetTenants: messageData.type === 'targeted' ? messageData.selectedTenants : undefined
                      });
                      alert("🚀 Comunicado enviado com sucesso para todos os destinos!");
                      setIsMessageModalOpen(false);
                      setMessageData({
                        title: '',
                        content: '',
                        type: 'broadcast',
                        priority: 'info',
                        selectedTenants: []
                      });
                    } catch (e: any) {
                      alert("Erro ao enviar comunicado: " + e.message);
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  isLoading={isSaving}
                  className="flex-[2] bg-primary-600 hover:bg-primary-500 rounded-2xl py-4 font-black italic uppercase shadow-xl shadow-primary-500/20"
                >
                  Disparar Comunicado <Send size={16} className="ml-2" />
                </NexusButton>
              </div>
            </div>
          </div>
        )}

        {/* 🚨 Modal de Confirmação Crítica de Exclusão */}
        {deleteConfirm && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/98 backdrop-blur-3xl p-4">
            <div className="bg-[#1c1c26] border border-red-500/20 rounded-[3rem] w-full max-w-lg p-12 shadow-2xl animate-scale-in">
              <div className="flex flex-col items-center text-center space-y-8 font-poppins">
                <div className="w-24 h-24 bg-red-500/10 rounded-full flex items-center justify-center text-red-500 animate-pulse">
                  <ShieldAlert size={48} />
                </div>

                <div className="space-y-4">
                  <h3 className="text-3xl font-black italic uppercase tracking-tighter text-white">Excluir Nexus</h3>
                  <p className="text-gray-400 font-medium px-4">
                    Você está prestes a remover <span className="text-white font-black">"{deleteConfirm.name}"</span> e todos os seus dados vinculados.
                  </p>
                  <p className="bg-red-500/10 text-red-400 text-[10px] font-black uppercase p-4 rounded-2xl border border-red-500/20">
                    ⚠️ Esta ação é irreversível e apagará permanentemente todos os usuários e ordens de serviço.
                  </p>
                </div>

                <div className="flex flex-col w-full gap-4">
                  <NexusButton
                    variant="primary"
                    onClick={handleDeleteTenant}
                    disabled={isSaving}
                    className="bg-red-600 hover:bg-red-500 py-6 rounded-2xl font-black uppercase tracking-widest text-xs italic shadow-2xl shadow-red-600/30 active:scale-95 transition-all"
                  >
                    {isSaving ? <Loader2 className="animate-spin mr-2" /> : "Sim, Excluir Instantaneamente"}
                  </NexusButton>
                  <button
                    onClick={() => setDeleteConfirm(null)}
                    disabled={isSaving}
                    className="py-4 text-gray-500 hover:text-white font-black uppercase tracking-[0.3em] text-[9px] transition-colors"
                  >
                    Cancelar Operação
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div >
  );
};
