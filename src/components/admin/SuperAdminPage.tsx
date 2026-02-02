
import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, Globe, Plus, Building2, Users,
  Activity, Server, Database, Save, X, ExternalLink,
  ChevronRight, Laptop, Briefcase, Search, LayoutDashboard,
  Settings, Mail, Phone, MapPin, Trash2, Edit3, BarChart3, LogOut, Loader2, Lock, Unlock, PauseCircle, PlayCircle, ShieldAlert,
  MessageSquare, CheckCircle2, AlertTriangle, Send, ClipboardList, DollarSign, CalendarClock, Box, Package, Wrench, Workflow,
  ClipboardCheck, HardHat, FileText, Layout
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
  initialPassword?: string;
  enabled_modules?: Record<string, boolean>;
  enabledModules?: Record<string, boolean>;
  metadata?: any;
}

import { DataService } from '../../services/dataService';
import SessionStorage from '../../lib/sessionStorage';
import { adminSupabase } from '../../lib/supabase';

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
            companyName: 'Nexus Pro Principal',
            tradingName: 'Nexus Principal',
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
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=master',
      // 🔑 PERMISSÕES COMPLETAS DE SUPER ADMIN
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

  return (
    <div className="min-h-screen bg-[#0d0d12] text-white p-8 font-sans overflow-y-auto custom-scrollbar">
      <div className="max-w-7xl mx-auto space-y-10 pb-20 animate-fade-in">
        <header className="flex justify-between items-end border-b border-white/5 pb-10">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="p-2 bg-purple-600 rounded-lg shadow-lg shadow-purple-500/20">
                <ShieldCheck size={24} />
              </div>
              <span className="text-[10px] font-black uppercase tracking-[0.4em] text-purple-400">Master Control</span>
            </div>
            <h1 className="text-4xl font-black italic tracking-tighter uppercase">Nexus <span className="text-purple-500">Global</span></h1>
            <p className="text-gray-500 text-sm mt-2 font-medium">Provisionamento inteligente e auditoria de ecossistemas técnicos.</p>
          </div>
          <div className="flex gap-4">
            <NexusButton onClick={handleLogout} variant="secondary" className="rounded-2xl px-6 py-6 font-black uppercase tracking-widest text-[10px] hover:bg-red-500/20 hover:text-red-400 border border-transparent hover:border-red-500/30 transition-all">
              <LogOut size={18} className="mr-2" /> Sair
            </NexusButton>
            <NexusButton onClick={() => setIsMessageModalOpen(true)} variant="secondary" className="rounded-2xl px-6 py-6 font-black uppercase tracking-widest text-[10px] bg-white/5 border-white/10 hover:bg-white/10 transition-all">
              <MessageSquare size={18} className="mr-2 text-purple-400" /> Enviar Comunicado
            </NexusButton>
            <NexusButton onClick={() => setIsModalOpen(true)} className="bg-purple-600 hover:bg-purple-500 rounded-2xl px-8 py-6 font-black italic shadow-2xl shadow-purple-500/20 active:scale-95 transition-all">
              <Plus size={20} className="mr-2" /> Provisionar Empresa
            </NexusButton>
          </div>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          <div className="bg-[#16161e] p-7 rounded-[2.5rem] border border-white/5 shadow-xl hover:border-purple-500/20 transition-colors group">
            <div className="p-3 bg-purple-500/10 text-purple-400 rounded-2xl mb-4 w-fit group-hover:scale-110 transition-transform"><Globe size={22} /></div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Empresas</p>
            <p className="text-3xl font-black mt-3 leading-none italic">{tenants.length}</p>
          </div>
          <div className="bg-[#16161e] p-7 rounded-[2.5rem] border border-white/5 shadow-xl hover:border-blue-500/20 transition-colors group">
            <div className="p-3 bg-blue-500/10 text-blue-400 rounded-2xl mb-4 w-fit group-hover:scale-110 transition-transform"><Users size={22} /></div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Técnicos Ativos</p>
            <p className="text-3xl font-black mt-3 leading-none italic">{tenants.reduce((acc, t) => acc + (Number(t.active_techs || (t as any).activeTechs) || 0), 0)}</p>
          </div>
          <div className="bg-[#16161e] p-7 rounded-[2.5rem] border border-white/5 shadow-xl hover:border-emerald-500/20 transition-colors group">
            <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-2xl mb-4 w-fit group-hover:scale-110 transition-transform"><BarChart3 size={22} /></div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">OS Geradas</p>
            <p className="text-3xl font-black mt-3 leading-none italic">{tenants.reduce((acc, t) => acc + (Number(t.os_count || (t as any).osCount) || 0), 0)}</p>
          </div>
          <div className="bg-[#16161e] p-7 rounded-[2.5rem] border border-white/5 shadow-xl hover:border-indigo-500/20 transition-colors group">
            <div className="p-3 bg-indigo-500/10 text-indigo-400 rounded-2xl mb-4 w-fit group-hover:scale-110 transition-transform"><Database size={22} /></div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Ativos Geridos</p>
            <p className="text-3xl font-black mt-3 leading-none italic">{tenants.reduce((acc, t) => acc + (Number(t.equipment_count || (t as any).equipmentCount) || 0), 0)}</p>
          </div>
          <div className="bg-[#16161e] p-7 rounded-[2.5rem] border border-white/5 shadow-xl border-emerald-500/20 sm:col-span-2 lg:col-span-1">
            <div className="p-3 bg-amber-500/10 text-amber-400 rounded-2xl mb-4 w-fit"><Server size={22} /></div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Interface Master</p>
            <p className="text-xl font-black mt-3 text-emerald-500 uppercase italic leading-none tracking-tighter">ESTÁVEL</p>
          </div>
        </div>

        <section className="space-y-6">
          <div className="flex items-center justify-between px-4">
            <h2 className="text-xs font-black uppercase tracking-widest text-gray-400">Instâncias Corporativas Isoladas</h2>
            <div className="relative">
              <Search size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" />
              <input type="text" placeholder="Buscar empresa ou ID..." className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-[10px] font-black uppercase tracking-widest outline-none focus:border-purple-500/50" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6">
            {tenants.map(tenant => {
              // Normalize data for UI consistency
              const displayTitle = tenant.company_name || tenant.name || tenant.companyName || "Empresa sem Nome";
              const displayEmail = tenant.admin_email || tenant.email || tenant.adminEmail || "sem-email@nexus.com";
              const displayId = tenant.slug || tenant.id;

              return (
                <div key={tenant.id} className="bg-[#16161e] hover:bg-[#1a1a24] border border-white/5 p-8 rounded-[3.5rem] transition-all flex flex-col xl:flex-row items-center gap-10 group relative">

                  {/* Info Principal */}
                  <div className="flex items-center gap-8 flex-1 w-full">
                    <div className="w-20 h-20 bg-gradient-to-br from-purple-600 to-indigo-700 rounded-[2rem] flex items-center justify-center font-black text-3xl italic shadow-2xl shadow-purple-500/20 group-hover:scale-105 transition-transform">
                      {displayTitle.charAt(0)}
                    </div>
                    <div>
                      <h3 className="text-2xl font-black italic tracking-tighter uppercase leading-none">{displayTitle}</h3>
                      <div className="flex flex-wrap items-center gap-4 mt-3">
                        <span className="text-[9px] font-black text-purple-400 uppercase bg-purple-500/10 px-3 py-1 rounded-full border border-purple-500/20 shadow-sm">ID: {displayId}</span>
                        <span className="text-[9px] font-black text-gray-500 uppercase flex items-center gap-1.5"><Mail size={12} /> {displayEmail}</span>
                        {tenant.status === 'suspended' ? (
                          <span className="text-[9px] font-black text-red-400 uppercase flex items-center gap-1.5"><ShieldAlert size={12} className="text-red-500" /> Suspensa</span>
                        ) : (
                          <span className="text-[9px] font-black text-gray-500 uppercase flex items-center gap-1.5"><Activity size={12} className="text-emerald-500" /> Ativa</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dashboard Rápido (Stats da Empresa) */}
                  <div className="grid grid-cols-3 gap-6 bg-black/30 p-6 rounded-[2.5rem] border border-white/5 w-full xl:w-auto">
                    <div className="text-center px-4">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Técnicos</p>
                      <p className="text-lg font-black text-white">{(tenant as any).real_active_techs ?? tenant.active_techs ?? (tenant as any).activeTechs ?? 0}</p>
                    </div>
                    <div className="text-center px-4 border-x border-white/5">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Ordens</p>
                      <p className="text-lg font-black text-white">{(tenant as any).real_os_count ?? tenant.os_count ?? (tenant as any).osCount ?? 0}</p>
                    </div>
                    <div className="text-center px-4">
                      <p className="text-[8px] font-black text-gray-500 uppercase tracking-widest">Ativos</p>
                      <p className="text-lg font-black text-white">{(tenant as any).real_equipment_count ?? tenant.equipment_count ?? (tenant as any).equipmentCount ?? 0}</p>
                    </div>
                  </div>

                  {/* Ações de Gestão */}
                  <div className="flex items-center gap-3 w-full xl:w-auto">
                    <button
                      onClick={() => {
                        setEditingTenant(tenant);
                        setFormData({
                          ...tenant,
                          companyName: tenant.company_name || tenant.name || tenant.companyName,
                          tradingName: tenant.trading_name || tenant.company_name || tenant.name || tenant.tradingName,
                          adminEmail: tenant.admin_email || tenant.email || tenant.adminEmail,
                          cnpj: tenant.cnpj || tenant.document || tenant.cnpj,
                          stateRegistration: (tenant as any).state_registration || (tenant as any).stateRegistration,
                          website: (tenant as any).website,
                          id: tenant.slug || tenant.id,
                          // Carrega as colunas individuais ou do metadata
                          street: (tenant as any).street || (tenant as any).metadata?.street,
                          number: (tenant as any).number || (tenant as any).metadata?.number,
                          complement: (tenant as any).complement || (tenant as any).metadata?.complement,
                          neighborhood: (tenant as any).neighborhood || (tenant as any).metadata?.neighborhood,
                          city: (tenant as any).city || (tenant as any).metadata?.city,
                          state: (tenant as any).state || (tenant as any).metadata?.state,
                          cep: (tenant as any).cep || (tenant as any).metadata?.cep,
                          enabled_modules: tenant.enabled_modules || (tenant as any).enabledModules || {
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
                        } as any);
                        setIsModalOpen(true);
                      }}
                      className="flex-1 xl:flex-none p-4 bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 rounded-2xl transition-all border border-white/5"
                      title="Editar Cadastro"
                    >
                      <Settings size={20} />
                    </button>
                    <button
                      onClick={() => handleToggleStatus(tenant.id, tenant.status)}
                      disabled={isSaving}
                      className={`flex-1 xl:flex-none p-4 rounded-2xl transition-all border ${tenant.status === 'suspended'
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/10 hover:bg-amber-600 hover:text-white'
                        : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/10 hover:bg-emerald-600 hover:text-white'
                        }`}
                      title={tenant.status === 'suspended' ? "Reativar Empresa" : "Suspender Acesso"}
                    >
                      {tenant.status === 'suspended' ? <Lock size={20} /> : <Unlock size={20} />}
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ id: tenant.id, name: displayTitle })}
                      disabled={isSaving}
                      className="flex-1 xl:flex-none p-4 bg-red-500/10 text-red-400 hover:text-white hover:bg-red-600 rounded-2xl transition-all border border-red-500/10 disabled:opacity-50"
                      title="Excluir Definitivamente"
                    >
                      <Trash2 size={20} />
                    </button>
                    <button
                      onClick={() => switchToTenant(tenant)}
                      className="flex-[2] xl:flex-none flex items-center justify-center gap-3 px-8 py-4 bg-purple-600 text-white rounded-2xl font-black text-[10px] uppercase italic tracking-widest shadow-xl shadow-purple-600/20 hover:bg-purple-500 transition-all active:scale-95"
                    >
                      <LayoutDashboard size={18} /> Acessar Painel
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        </section>

        {/* Modal de Cadastro/Edição de Empresa */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/95 backdrop-blur-2xl p-4 overflow-y-auto">
            <div className="bg-[#16161e] rounded-[4rem] w-full max-w-5xl shadow-2xl border border-white/10 animate-fade-in-up my-auto">
              <div className="p-12 border-b border-white/5 flex justify-between items-center">
                <div className="flex items-center gap-6">
                  <div className="p-5 bg-purple-600 rounded-[1.5rem] text-white shadow-xl shadow-purple-500/20">
                    <Building2 size={32} />
                  </div>
                  <div>
                    <h2 className="text-3xl font-black italic uppercase tracking-tighter">
                      {editingTenant ? 'Configurar Instância' : 'Nova Instância Nexus'}
                    </h2>
                    <p className="text-xs text-purple-400/60 font-black uppercase tracking-widest mt-1">Provisionamento de camada de dados isolada</p>
                  </div>
                </div>
                <button onClick={closeModal} className="p-4 bg-white/5 rounded-2xl text-gray-400 hover:text-white transition-all"><X size={32} /></button>
              </div>

              <div className="p-12 space-y-10">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  <div className="md:col-span-2">
                    <NexusInput
                      label="Razão Social Completa"
                      placeholder="Ex: Tech Solutions Brazil LTDA"
                      value={formData.companyName || ''}
                      onChange={e => setFormData({ ...formData, companyName: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                  </div>
                  <NexusInput
                    label="Nome Fantasia"
                    placeholder="Ex: Nexus Pro Systems"
                    value={formData.tradingName || ''}
                    onChange={e => setFormData({ ...formData, tradingName: e.target.value })}
                    className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                  />
                  <NexusInput
                    label="CNPJ"
                    placeholder="00.000.000/0001-00"
                    value={formData.cnpj || ''}
                    onChange={e => setFormData({ ...formData, cnpj: formatCNPJ(e.target.value) })}
                    className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                  />
                  <NexusInput
                    label="Inscrição Estadual"
                    placeholder="ISENTO"
                    value={(formData as any).stateRegistration || ''}
                    onChange={e => setFormData({ ...formData, stateRegistration: e.target.value } as any)}
                    className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                  />
                  <NexusInput
                    label="Identificador do Sistema (Slug)"
                    placeholder="ex-tech-brazil"
                    disabled={!!editingTenant}
                    value={(editingTenant ? (editingTenant as any).slug || editingTenant.id : formData.id) || ''}
                    onChange={e => setFormData({ ...formData, id: formatSlug(e.target.value) })}
                    className={`bg-white/5 border-white/10 text-white rounded-2xl py-4 ${editingTenant ? 'opacity-50 cursor-not-allowed' : ''}`}
                  />
                  <NexusInput
                    label="E-mail do Gestor Principal"
                    type="email"
                    placeholder="admin@empresa.com"
                    value={formData.adminEmail || ''}
                    onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
                    className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                  />
                  {!editingTenant && (
                    <NexusInput
                      label="Senha Inicial de Acesso"
                      type="password"
                      placeholder="••••••••"
                      value={formData.initialPassword || ''}
                      onChange={e => setFormData({ ...formData, initialPassword: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                      icon={<Lock size={16} className="text-purple-400" />}
                    />
                  )}
                  <NexusInput
                    label="Telefone Comercial"
                    placeholder="(11) 9999-9999"
                    value={formData.phone || ''}
                    onChange={e => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                    className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                  />
                  <NexusInput
                    label="Website"
                    placeholder="www.empresa.com.br"
                    value={(formData as any).website || ''}
                    onChange={e => setFormData({ ...formData, website: e.target.value } as any)}
                    className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                  />
                  <div className="lg:col-span-1">
                    <NexusInput
                      label="CEP"
                      placeholder="00000-000"
                      value={formData.cep || ''}
                      icon={isSearchingCep ? <Loader2 size={16} className="animate-spin text-purple-500" /> : <MapPin size={16} />}
                      onChange={e => {
                        const val = formatCEP(e.target.value);
                        setFormData({ ...formData, cep: val });
                        handleCepSearch(val);
                      }}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                  </div>
                  <div className="lg:col-span-2">
                    <NexusInput
                      label="Logradouro (Rua/Av)"
                      placeholder="Rua das Flores"
                      value={formData.street || formData.address || ''}
                      onChange={e => setFormData({ ...formData, street: e.target.value, address: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                  </div>
                  <div className="lg:col-span-1">
                    <NexusInput
                      label="Número"
                      placeholder="123"
                      value={formData.number || ''}
                      onChange={e => setFormData({ ...formData, number: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                  </div>
                  <div className="lg:col-span-1">
                    <NexusInput
                      label="Bairro"
                      placeholder="Centro"
                      value={formData.neighborhood || ''}
                      onChange={e => setFormData({ ...formData, neighborhood: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                  </div>
                  <div className="lg:col-span-1">
                    <NexusInput
                      label="Cidade"
                      placeholder="São Paulo"
                      value={formData.city || ''}
                      onChange={e => setFormData({ ...formData, city: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                  </div>
                  <div className="lg:col-span-1">
                    <NexusInput
                      label="Estado (UF)"
                      placeholder="SP"
                      value={formData.state || ''}
                      onChange={e => setFormData({ ...formData, state: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                  </div>
                  <div className="lg:col-span-3">
                    <NexusInput
                      label="Complemento"
                      placeholder="Sala 10, Bloco B"
                      value={formData.complement || ''}
                      onChange={e => setFormData({ ...formData, complement: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                  </div>
                </div>

                {/* 🧩 Seção de Módulos Habilitados */}
                <div className="bg-indigo-500/5 p-8 rounded-[2.5rem] border border-indigo-500/10 space-y-6">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <LayoutDashboard size={16} className="text-indigo-500" /> Módulos Habilitados (Plano de Acesso)
                    </h3>
                    <p className="text-[10px] text-gray-500 font-bold mt-1">Selecione quais áreas do sistema estarão disponíveis para esta empresa.</p>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                    {[
                      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                      { id: 'orders', label: 'Atividades', icon: ClipboardList },
                      { id: 'quotes', label: 'Orçamentos', icon: DollarSign },
                      { id: 'contracts', label: 'Contratos', icon: CalendarClock },
                      { id: 'clients', label: 'Clientes', icon: Users },
                      { id: 'equip', label: 'Ativos', icon: Box },
                      { id: 'stock', label: 'Estoque', icon: Package },
                      { id: 'techs', label: 'Técnicos', icon: Wrench },
                      { id: 'forms', label: 'Processos', icon: Workflow },
                      { id: 'users', label: 'Usuários', icon: ShieldAlert },
                      { id: 'settings', label: 'Configurações', icon: Settings },
                      { id: 'financial', label: 'Financeiro', icon: DollarSign },
                    ].map(module => (
                      <label
                        key={module.id}
                        className={`flex items-center gap-3 p-4 rounded-2xl border transition-all cursor-pointer ${(formData.enabled_modules?.[module.id] ?? (formData as any).enabledModules?.[module.id] ?? true)
                          ? 'bg-indigo-600/20 border-indigo-500/50 text-indigo-100 shadow-lg shadow-indigo-600/5'
                          : 'bg-white/5 border-white/5 text-gray-500 hover:border-white/10 opacity-60'
                          }`}
                      >
                        <input
                          type="checkbox"
                          className="hidden"
                          checked={!!(formData.enabled_modules?.[module.id] ?? (formData as any).enabledModules?.[module.id] ?? true)}
                          onChange={(e) => {
                            const newModules = {
                              ...(formData.enabled_modules || {}),
                              [module.id]: e.target.checked
                            };
                            setFormData({ ...formData, enabled_modules: newModules });
                          }}
                        />
                        <div className={`w-5 h-5 rounded-lg border flex items-center justify-center transition-all ${(formData.enabled_modules?.[module.id] ?? (formData as any).enabledModules?.[module.id] ?? true) ? 'bg-indigo-500 border-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]' : 'border-white/20'
                          }`}>
                          {(formData.enabled_modules?.[module.id] ?? (formData as any).enabledModules?.[module.id] ?? true) && <CheckCircle2 size={12} className="text-white" />}
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-tight">{module.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-800/50 p-8 rounded-[2.5rem] border border-white/5 space-y-6">
                  <div>
                    <h3 className="text-sm font-black text-white uppercase tracking-widest flex items-center gap-2">
                      <Settings size={16} className="text-purple-500" /> Configuração de Numeração (OS)
                    </h3>
                    <p className="text-[10px] text-gray-500 font-bold mt-1">Defina como os protocolos serão gerados para este cliente.</p>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <NexusInput
                      label="Prefixo do Código"
                      placeholder="Ex: OS-2025-"
                      value={formData.osPrefix || ''}
                      onChange={e => setFormData({ ...formData, osPrefix: e.target.value })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                    <NexusInput
                      label="Número Inicial (Sequencial)"
                      type="number"
                      placeholder="Ex: 1000"
                      value={formData.osStartNumber || ''}
                      onChange={e => setFormData({ ...formData, osStartNumber: Number(e.target.value) })}
                      className="bg-white/5 border-white/10 text-white rounded-2xl py-4"
                    />
                  </div>
                </div>

                <div className="bg-purple-500/5 p-8 rounded-[2.5rem] border border-purple-500/10 flex gap-6 items-center">
                  <div className="p-4 bg-purple-500/10 rounded-2xl text-purple-400">
                    <Database size={28} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-black text-purple-300 uppercase tracking-widest mb-1">Nota de Provisionamento</p>
                    <p className="text-[11px] font-bold text-gray-500 leading-relaxed italic">
                      Esta ação provisiona uma camada de dados isolada no banco Nexus. Todas as ordens de serviço, clientes e técnicos desta empresa serão criptografados e acessíveis apenas por este tenant.
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-12 border-t border-white/5 bg-black/20 flex justify-end gap-6 rounded-b-[4rem]">
                <NexusButton variant="secondary" onClick={closeModal} className="rounded-2xl border-white/10 text-gray-500 px-10">Descartar</NexusButton>
                <NexusButton onClick={handleSaveTenant} className="bg-purple-600 hover:bg-purple-500 rounded-2xl px-16 py-6 font-black italic shadow-2xl shadow-purple-600/20 active:scale-95 transition-all">
                  <Save size={20} className="mr-3" /> {editingTenant ? 'Atualizar Instância' : 'Provisionar Agora'}
                </NexusButton>
              </div>
            </div>
          </div>
        )}

        {/* 📢 Modal de Envio de Comunicado Global */}
        {isMessageModalOpen && (
          <div className="fixed inset-0 z-[1000] bg-black/80 backdrop-blur-xl flex items-center justify-center p-6 animate-fade-in">
            <div className="bg-[#111118] w-full max-w-2xl rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden relative">
              <div className="p-10 border-b border-white/5 bg-gradient-to-r from-purple-900/20 to-transparent">
                <div className="flex justify-between items-center text-center">
                  <div className="text-left">
                    <h2 className="text-2xl font-black italic uppercase tracking-tighter">Enviar Comunicado Global</h2>
                    <p className="text-[10px] font-bold text-purple-400 uppercase tracking-widest mt-1">Sincronização de avisos em tempo real para os painéis</p>
                  </div>
                  <button
                    onClick={() => setIsMessageModalOpen(false)}
                    className="p-3 hover:bg-white/5 rounded-2xl text-gray-500 transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>
              </div>

              <div className="p-10 space-y-8 max-h-[70vh] overflow-y-auto custom-scrollbar">
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
                    <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest px-2">Tipo de Envio</label>
                    <select
                      value={messageData.type}
                      onChange={e => setMessageData({ ...messageData, type: e.target.value as any })}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-3 px-4 text-[10px] font-black uppercase tracking-widest outline-none focus:border-purple-500/50"
                    >
                      <option value="broadcast">📢 Broadcast (Todos os Painéis)</option>
                      <option value="targeted">🎯 Targeted (Apenas Selecionados)</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest px-2">Criticidade</label>
                    <select
                      value={messageData.priority}
                      onChange={e => setMessageData({ ...messageData, priority: e.target.value as any })}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-3 px-4 text-[10px] font-black uppercase tracking-widest outline-none focus:border-purple-500/50"
                    >
                      <option value="info">💬 Informativo</option>
                      <option value="warning">⚠️ Aviso / Alerta</option>
                      <option value="urgent">🚨 Urgente / Crítico</option>
                    </select>
                  </div>

                  <div className="md:col-span-2 space-y-2">
                    <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest px-2">Conteúdo da Mensagem</label>
                    <textarea
                      rows={4}
                      placeholder="Escreva aqui a mensagem que aparecerá no centro da tela dos usuários..."
                      value={messageData.content}
                      onChange={e => setMessageData({ ...messageData, content: e.target.value })}
                      className="w-full bg-white/5 border border-white/10 text-white rounded-2xl py-4 px-4 text-xs font-medium outline-none focus:border-purple-500/50 transition-all placeholder:text-gray-600 appearance-none resize-none"
                    />
                  </div>

                  {messageData.type === 'targeted' && (
                    <div className="md:col-span-2 space-y-4">
                      <label className="text-[10px] font-black text-purple-400 uppercase tracking-widest px-2">Selecionar Clientes Alvo</label>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[200px] overflow-y-auto pr-2 custom-scrollbar">
                        {tenants.map(tenant => (
                          <label
                            key={tenant.id}
                            className={`flex items-center gap-3 p-3 rounded-xl border transition-all cursor-pointer ${messageData.selectedTenants.includes(tenant.id)
                              ? 'bg-purple-600/20 border-purple-500/50 text-white'
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
                            <div className={`w-4 h-4 rounded-md border flex items-center justify-center transition-all ${messageData.selectedTenants.includes(tenant.id) ? 'bg-purple-500 border-purple-500' : 'border-white/20'
                              }`}>
                              {messageData.selectedTenants.includes(tenant.id) && <CheckCircle2 size={10} />}
                            </div>
                            <span className="text-[9px] font-black uppercase truncate">{tenant.company_name || tenant.name || tenant.companyName}</span>
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
                  className="flex-[2] bg-purple-600 hover:bg-purple-500 rounded-2xl py-4 font-black italic uppercase shadow-xl shadow-purple-500/20"
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
              <div className="flex flex-col items-center text-center space-y-8">
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
