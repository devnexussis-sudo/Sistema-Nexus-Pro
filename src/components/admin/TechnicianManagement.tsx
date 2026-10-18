
import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Plus, Edit2, X, Save, Lock, AtSign, Loader2,
  Smartphone, Search, Filter, ChevronLeft, Hash, Globe, Monitor, Trash2,
  Wrench, AlertTriangle, CheckCircle2, Shield
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { DataService } from '../../services/dataService';
import { TechnicianService, formatTechCode, generateUniqueUnifiedCode } from '../../services/technicianService';
import { TenantService } from '../../services/tenantService';
import { User as UserType, UserRole, OrderStatus } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { usePermissions } from '../../hooks/usePermissions';

export const TechnicianManagement: React.FC = () => {
  const { t } = useI18n();
  const { canCreate, canEdit, canDelete, isAdmin } = usePermissions();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [tenantLimit, setTenantLimit] = useState<number>(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [techToDelete, setTechToDelete] = useState<UserType | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);


  const [formData, setFormData] = useState<any>({
    name: '', email: '', avatar: '', active: true, phone: '', jobTitle: ''
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  const loadTechs = async () => {
    setLoading(true);
    try {
      const techs = await DataService.getAllTechnicians(undefined, undefined, true);
      setTechnicians(techs || []);
      
      const tenant = await DataService.getTenantById();
      setTenantLimit(tenant?.max_technicians || 0);
      window.dispatchEvent(new Event('tech_limit_updated'));
    } catch (error) {
      console.error("Erro ao carregar técnicos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTechs(); }, []);

  // 🔑 Backfill: atribui códigos a técnicos antigos sem código
  useEffect(() => {
    TechnicianService.backfillMissingCodes().then((count) => {
      if (count > 0) {
        console.log(`[TechnicianManagement] Backfill atribuiu códigos a ${count} técnicos/usuários.`);
        loadTechs();
      }
    }).catch(console.warn);
  }, []);

  const filteredTechs = technicians.filter(t => {
    if (!t) return false;
    const nameStr = String(t.name || t.email || '').toLowerCase();
    const emailStr = String(t.email || '').toLowerCase();
    const searchStr = String(searchTerm || '').toLowerCase();
    const matchesSearch = nameStr.includes(searchStr) || emailStr.includes(searchStr);
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? t.active : !t.active);
    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const paginatedTechs = filteredTechs.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(filteredTechs.length / ITEMS_PER_PAGE);

  const formatPhone = (value: string) => {
    const numbers = value.replace(/\D/g, '');
    if (numbers.length <= 11) {
      return numbers
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{5})(\d)/, '$1-$2')
        .replace(/(-\d{4})\d+?$/, '$1');
    }
    return value;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, phone: formatPhone(e.target.value) });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaveError(null);

    try {
      setLoading(true);
      console.log("=== INICIANDO SALVAMENTO DE TÉCNICO ===");
      console.log("Dados do Form:", formData);

      if (editingId) {
        // Validação de Limite de Licenças na Edição (tentando reativar)
        const tenant = await DataService.getTenantById();
        if (tenant && tenant.max_technicians !== undefined && tenant.max_technicians > 0) {
           const countToEvaluate = technicians.filter(t => t.id !== editingId && t.active).length;
           if (formData.active && countToEvaluate >= tenant.max_technicians) {
               throw new Error(`Limite de licenças excedido! O plano atual permite no máximo ${tenant.max_technicians} técnico(s) ativo(s). Desative ou remova um técnico antigo ou faça um upgrade.`);
           }
        }
        await DataService.updateTechnician({ ...formData, id: editingId });
      } else {
        // Validação de Limite de Licenças na Criação
        const tenant = await DataService.getTenantById();
        if (tenant && tenant.max_technicians !== undefined && tenant.max_technicians > 0) {
           const countToEvaluate = technicians.filter(t => t.active).length;
           if (formData.active && countToEvaluate >= tenant.max_technicians) {
               throw new Error(`Limite de licenças excedido! O plano atual permite no máximo ${tenant.max_technicians} técnico(s) ativo(s) no total. Remova ou desative um técnico antigo ou contate o suporte para upgrade.`);
           }
        }
        await DataService.createTechnician(formData);
      }

      await loadTechs();
      setIsModalOpen(false);
      setEditingId(null);
      setIsReadOnly(false);
      setFormData({ name: '', email: '', active: true, phone: '', jobTitle: '' });
      alert("✅ Técnico registrado e vinculado com sucesso!");
    } catch (error: any) {
      console.error("❌ ERRO FATAL AO SALVAR TÉCNICO:", error);
      let msg = error?.message || "Erro desconhecido no sistema.";
      if (msg.includes("already been registered")) {
        msg = "Este e-mail já está em uso por outra empresa. Para evitar conflitos de acesso, é necessário usar um outro e-mail.";
      }
      setSaveError(msg);
      alert(msg); // <--- Adicionado para garantir que o usuário veja
    } finally {
      setLoading(false);
    }
  };

  const handleViewTech = (t: UserType, e: React.MouseEvent) => {
    e.stopPropagation();
    setIsReadOnly(true);
    const techCode = (t as any).techCode || (t as any).tech_code || (t as any).userCode || (t as any).user_code || '';
    setFormData({ ...t, techCode });
    setEditingId(t.id);
    setIsModalOpen(true);
  };


  return (
    <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">
      {loading && technicians.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 h-full animate-fade-in">
          <div className="w-8 h-8 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin mb-4" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">carregando dados...</p>
        </div>
      ) : (
        <>
          {/* Toolbar */}
      <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3">
          
          <div className="relative flex-1 min-w-[200px] w-full lg:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Buscar técnico por nome ou e-mail..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
            <div className="flex items-center bg-white border border-[#1c2d4f]/20 rounded-xl pl-2 pr-1 h-10 shadow-sm">
              <Filter size={12} className="text-slate-400 mr-2" />
              <select
                className="bg-transparent text-[10px] text-slate-600 outline-none w-full cursor-pointer h-full"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">{t.common.status}</option>
                <option value="ACTIVE">Liberados</option>
                <option value="INACTIVE">Suspensos</option>
              </select>
            </div>

              <Button
                onClick={async (e) => {
                  e.preventDefault();
                  if (!canCreate('technicians')) { alert('Acesso Negado: Você não tem permissão para esta ação.'); return; }
                  
                  // Busca o limite em tempo real para ter efeito imediato se alterado no Master
                  const currentTenant = await DataService.getTenantById();
                  const currentLimit = currentTenant?.max_technicians || 0;
                  setTenantLimit(currentLimit); // atualiza o state pra refletir visualmente em outros lugares se precisar

                  if (currentLimit > 0) {
                      const activeTechs = technicians.filter(t => t.active).length;
                      if (activeTechs >= currentLimit) {
                          alert(`Acesso Bloqueado: A empresa já atingiu o limite de ${currentLimit} técnico(s) ativo(s) em seu plano. Para adicionar um novo, desative um técnico antigo ou contate o suporte para upgrade.`);
                          return;
                      }
                  }

                  // 🔑 Gera código único automático do técnico para exibir no formulário
                  let autoCode = '';
                  try {
                    const tid = currentTenant?.id || localStorage.getItem('nexus_current_tenant') || '';
                    if (tid) {
                      autoCode = await generateUniqueUnifiedCode(tid);
                    }
                  } catch (codeErr) {
                    console.warn('⚠️ Falha ao gerar código automático do técnico:', codeErr);
                  }

                  setIsReadOnly(false);
                  setEditingId(null);
                  setFormData({ name: '', email: '', active: true, phone: '', jobTitle: '', techCode: autoCode });
                  setSaveError(null);
                  setIsModalOpen(true);
                }}
                className={`h-10 px-4 gap-1.5 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] shadow-lg shadow-[#1c2d4f]/20 text-[11px] rounded-xl whitespace-nowrap text-white ${!canCreate('technicians') ? 'opacity-50 !cursor-not-allowed' : ''}`}
              >
                <Plus size={16} /> Novo Técnico
              </Button>
          </div>
        </div>
      </div>

      <div className="relative bg-white border border-slate-300/80 rounded-xl shadow-lg shadow-slate-200/50 flex flex-col overflow-hidden flex-1 ring-1 ring-slate-200/80">
        {filteredTechs.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center animate-fade-in">
            <div className="w-16 h-16 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-4 border border-slate-200 shadow-inner">
              <Smartphone size={32} />
            </div>
            <h3 className="text-sm font-bold text-slate-700">Nenhum técnico localizado</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm leading-relaxed">
              {searchTerm || statusFilter !== 'ALL' 
                ? 'Nenhum técnico corresponde aos termos de busca ou filtros aplicados.' 
                : 'Nenhum técnico cadastrado ou habilitado. Você pode registrar um novo técnico pelo botão acima ou habilitar o acesso mobile em Usuários.'}
            </p>
            {(searchTerm || statusFilter !== 'ALL') ? (
              <Button onClick={() => { setSearchTerm(''); setStatusFilter('ALL'); }} className="mt-4 text-xs h-9 px-4 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold">
                Limpar Filtros de Busca
              </Button>
            ) : (
              <Button onClick={() => loadTechs()} className="mt-4 text-xs h-9 px-4 bg-[#1c2d4f] hover:bg-[#253a66] text-white rounded-xl font-bold shadow-md">
                Recarregar Lista
              </Button>
            )}
          </div>
        ) : (
          <>
            {/* 💻 DESKTOP TABLE VIEW */}
            <div className="hidden md:block flex-1 overflow-auto custom-scrollbar os-table-container">
              <table className="w-full text-left border-collapse table-auto">
                <thead className="sticky top-0 bg-slate-100/90 backdrop-blur-md border-b border-slate-200 z-10 shadow-xs font-poppins">
                  <tr className="text-[10px] font-bold text-slate-500 uppercase tracking-wider text-left">
                    <th className="px-4 py-2">Identidade Visual</th>
                    <th className="px-4 py-2 text-left">Código</th>
                    <th className="px-4 py-2 text-left">Credencial (E-mail)</th>
                    <th className="px-4 py-2 text-left">Acesso / Escopo</th>
                    <th className="px-4 py-2 text-left">Status App</th>
                    <th className="px-4 py-2 text-right pr-6">{t.common.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedTechs.map(t => {
                    const scope = (t as any).appScope || (t as any).app_scope || 'MOBILE';
                    const isHybrid = scope === 'HYBRID';
                    const isWeb = scope === 'WEB';

                    return (
                    <tr key={t.id} onClick={(e) => handleViewTech(t, e)} className="bg-white hover:bg-primary-50/40 border-b border-slate-50 transition-all group last:border-0 shadow-sm hover:shadow-md cursor-pointer">
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-3">
                          <div className="relative group/avatar shrink-0">
                            <img src={t.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(t.name) + '&background=10b981&color=fff'} className="w-8 h-8 rounded-lg object-cover border border-slate-200 shadow-sm bg-slate-100 transition-transform group-hover/avatar:scale-105" alt={t.name} />
                          </div>
                          <div className="truncate">
                            <p className="text-slate-900 tracking-tight text-[13px] font-medium truncate max-w-[150px]">{t.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {isHybrid ? (
                                <>
                                  <Globe size={11} className="text-indigo-600" />
                                  <span className="text-[10px] font-bold text-indigo-600 tracking-wider">Painel + Mobile</span>
                                </>
                              ) : (
                                <>
                                  <Smartphone size={11} className="text-emerald-500" />
                                  <span className="text-[10px] text-emerald-600 tracking-wider">App Mobile</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-2 text-left">
                        <span className="font-mono text-[11px] font-medium text-[#1c2d4f] bg-[#1c2d4f]/8 px-2.5 py-1 rounded-lg border border-[#1c2d4f]/15">
                          {formatTechCode((t as any).techCode || (t as any).tech_code || (t as any).userCode || (t as any).user_code)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-left text-[12px] text-slate-600 truncate max-w-[180px]">{t.email}</td>
                      
                      {/* Escopo de Acesso */}
                      <td className="px-4 py-2 text-left whitespace-nowrap">
                        {isHybrid ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 shadow-xs">
                            <Globe size={12} className="text-indigo-600" />
                            <Smartphone size={12} className="text-indigo-600" />
                            Painel + App
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-xs">
                            <Smartphone size={12} className="text-emerald-600" />
                            Apenas App
                          </span>
                        )}
                      </td>

                      <td className="px-4 py-2 text-left whitespace-nowrap">
                        <StatusBadge status={t.active ? OrderStatus.COMPLETED : OrderStatus.CANCELED} />
                      </td>
                      <td className="px-4 py-2 text-right pr-4">
                        <div className="flex items-center justify-end gap-1 transition-all">
                          <button onClick={(e) => {
                            if (!canEdit('technicians')) { e.preventDefault(); alert('Acesso Negado: Você não tem permissão para editar.'); return; }
                            e.stopPropagation();
                            setIsReadOnly(false);
                            const techCode = (t as any).techCode || (t as any).tech_code || (t as any).userCode || (t as any).user_code || '';
                            setFormData({ ...t, techCode }); setEditingId(t.id); setIsModalOpen(true);
                          }} className={`p-1.5 bg-slate-50 text-slate-400 hover:text-primary-700 hover:bg-primary-100 rounded-lg border border-slate-200/60 transition-all ${!canEdit('technicians') ? 'opacity-50 !cursor-not-allowed' : ''}`} title="Editar Técnico"><Edit2 size={15} /></button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!canDelete('technicians') && !isAdmin) {
                                alert("Acesso Negado: Você não tem permissão para excluir técnicos.");
                                return;
                              }
                              setTechToDelete(t);
                            }}
                            className={`p-1.5 bg-slate-50 text-slate-400 hover:text-rose-600 hover:bg-rose-100 rounded-lg border border-slate-200/60 transition-all ${(!canDelete('technicians') && !isAdmin) ? 'opacity-50 !cursor-not-allowed' : ''}`}
                            title="Excluir Técnico"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>

                    </tr>
                  );
                  })}
                </tbody>
              </table>
            </div>

            {/* 📱 MOBILE CARDS VIEW (PWA BIG TECH STANDARD) */}
            <div className="md:hidden flex-1 overflow-auto custom-scrollbar bg-slate-50/50 p-2.5 space-y-2.5 pb-28">
              {paginatedTechs.map(t => {
                const scope = (t as any).appScope || (t as any).app_scope || 'MOBILE';
                const isHybrid = scope === 'HYBRID';
                return (
                  <div
                    key={t.id}
                    onClick={(e) => handleViewTech(t, e)}
                    className="bg-white p-3.5 rounded-2xl shadow-sm border border-slate-200/70 active:scale-[0.98] transition-transform flex flex-col gap-2.5 cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={t.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(t.name) + '&background=10b981&color=fff'}
                          className="w-11 h-11 rounded-xl object-cover border-2 border-slate-100 shadow-sm shrink-0"
                          alt={t.name}
                        />
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-slate-900 truncate leading-tight">{t.name}</h3>
                          <p className="text-[11px] text-slate-500 truncate mt-0.5">{t.email}</p>
                        </div>
                      </div>
                      <StatusBadge status={t.active ? OrderStatus.COMPLETED : OrderStatus.CANCELED} />
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-bold text-[#1c2d4f] bg-[#1c2d4f]/8 px-2 py-0.5 rounded-md border border-[#1c2d4f]/15">
                          {formatTechCode((t as any).techCode || (t as any).tech_code || (t as any).userCode || (t as any).user_code)}
                        </span>
                        {isHybrid ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            <Globe size={10} /> Painel + App
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Smartphone size={10} /> App
                          </span>
                        )}
                      </div>
                      
                      <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                        <button
                          onClick={(e) => {
                            if (!canEdit('technicians')) { e.preventDefault(); alert('Acesso Negado: Você não tem permissão para editar.'); return; }
                            e.stopPropagation();
                            setIsReadOnly(false);
                            const techCode = (t as any).techCode || (t as any).tech_code || (t as any).userCode || (t as any).user_code || '';
                            setFormData({ ...t, techCode }); setEditingId(t.id); setIsModalOpen(true);
                          }}
                          className="p-2 text-primary-600 bg-primary-50 rounded-lg hover:bg-primary-100 transition-colors"
                          title="Editar"
                        >
                          <Edit2 size={14} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!canDelete('technicians') && !isAdmin) {
                              alert("Acesso Negado: Você não tem permissão para excluir técnicos.");
                              return;
                            }
                            setTechToDelete(t);
                          }}
                          className="p-2 text-rose-500 bg-rose-50 rounded-lg hover:bg-rose-100 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={filteredTechs.length}
              itemsPerPage={ITEMS_PER_PAGE}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>

      {
        isModalOpen && createPortal(
          <div className="fixed inset-0 z-[160] flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 md:p-3 lg:p-5 overflow-hidden animate-in fade-in duration-300">
            <div className="bg-white md:rounded-2xl w-full max-w-[1420px] h-full md:h-[95vh] shadow-2xl md:border border-slate-200 overflow-hidden flex flex-col animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 md:zoom-in-95 duration-300">

              {/* HEADER — padrão do sistema */}
              <div className="px-6 py-3.5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                    <Wrench size={18} />
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 tracking-tight">
                      {isReadOnly ? 'Detalhes do Técnico' : (editingId ? 'Editar Técnico' : 'Novo Técnico')}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[11px] font-normal text-slate-400">Nexus Field • credenciais e acesso do aplicativo de campo</p>
                      {editingId && ((formData as any).techCode || (formData as any).tech_code || (formData as any).userCode || (formData as any).user_code) && (
                        <span className="font-mono text-[10px] font-medium text-[#1c2d4f] bg-[#1c2d4f]/8 px-2 py-0.5 rounded border border-[#1c2d4f]/15 tracking-wider">
                          {(formData as any).techCode || (formData as any).tech_code || (formData as any).userCode || (formData as any).user_code}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => { setIsModalOpen(false); setEditingId(null); setIsReadOnly(false); setFormData({ name: '', email: '', active: true, phone: '', jobTitle: '' }); setSaveError(null); }}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50"
                >
                  <X size={20} />
                </button>
              </div>

              {/* BODY — Layout Widescreen lado a lado para preenchimento imediato sem rolagem */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50/30 custom-scrollbar flex flex-col justify-between">
                <div className="space-y-4">

                  {saveError && (
                    <div className="bg-rose-50 border border-rose-200 p-3.5 rounded-xl flex items-start gap-3 text-rose-600 animate-fade-in shadow-xs">
                      <AlertTriangle size={18} className="shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-semibold">Atenção ao preencher os dados</h4>
                        <p className="text-xs font-normal mt-0.5">{saveError}</p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
                    {/* COLUNA ESQUERDA: Identificação do Técnico */}
                    <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4">
                      <h3 className="text-xs font-semibold text-slate-800 border-l-3 border-[#1c2d4f] pl-2.5">
                        Identificação do Técnico
                      </h3>

                      <div className="flex flex-col sm:flex-row gap-5 items-start">
                        {/* Quadro da Foto (Avatar) */}
                        <div className="flex flex-col items-center gap-2 shrink-0 self-center sm:self-start">
                          <div className="relative group">
                            <img
                              src={formData.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(formData.name || 'Tech') + '&background=10b981&color=fff&size=256'}
                              className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover border-2 border-white shadow-md bg-slate-50"
                              alt={formData.name || 'Foto'}
                            />
                            <div className="absolute inset-0 rounded-2xl ring-1 ring-inset ring-slate-900/10" />
                            {/* Indicador de Status */}
                            <div className={`absolute -bottom-1 -right-1 w-6 h-6 rounded-full border-2 border-white flex items-center justify-center shadow-xs ${formData.active ? 'bg-emerald-500' : 'bg-rose-500'}`} title={formData.active ? 'Ativo' : 'Suspenso'}>
                              <div className="w-2 h-2 bg-white rounded-full" />
                            </div>
                          </div>
                          <p className="text-[10px] font-normal text-slate-400 text-center leading-tight">
                            Foto do Perfil<br/>(App Móvel)
                          </p>
                        </div>

                        {/* Campos do Formulário */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 flex-1 w-full">
                          <div className="md:col-span-2">
                            <Input
                              label="Nome Completo"
                              required
                              disabled={isReadOnly}
                              placeholder="Ex: Roberto Refrigeração"
                              value={formData.name}
                              onChange={e => setFormData({ ...formData, name: e.target.value })}
                              className="rounded-xl py-2 text-xs font-normal border-slate-300 bg-white text-slate-800 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-xs disabled:bg-slate-50"
                            />
                          </div>

                          <Input
                            label="E-mail (Login do App)"
                            required
                            disabled={isReadOnly}
                            type="email"
                            placeholder="tecnico@nexus.pro"
                            value={formData.email}
                            onChange={e => setFormData({ ...formData, email: e.target.value })}
                            className="rounded-xl py-2 text-xs font-normal border-slate-300 bg-white text-slate-800 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-xs disabled:bg-slate-50"
                            icon={<AtSign size={15} />}
                          />

                          <Input
                            label="Telefone / WhatsApp"
                            disabled={isReadOnly}
                            placeholder="(00) 00000-0000"
                            value={formData.phone}
                            onChange={handlePhoneChange}
                            className="rounded-xl py-2 text-xs font-normal border-slate-300 bg-white text-slate-800 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-xs disabled:bg-slate-50"
                            icon={<Smartphone size={15} />}
                          />

                          <div className="md:col-span-2">
                            <Input
                              label="Função / Cargo Técnico"
                              disabled={isReadOnly}
                              placeholder="Ex: Especialista em Refrigeração Industrial"
                              value={formData.jobTitle}
                              onChange={e => setFormData({ ...formData, jobTitle: e.target.value })}
                              className="rounded-xl py-2 text-xs font-normal border-slate-300 bg-white text-slate-800 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-xs disabled:bg-slate-50"
                              icon={<Shield size={15} />}
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* COLUNA DIREITA: Controle de Acesso & Informações */}
                    <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 shadow-xs p-5 space-y-4 flex flex-col justify-between">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-800 border-l-3 border-[#1c2d4f] pl-2.5 mb-4">
                          Controle de Acesso & Segurança
                        </h3>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3.5">
                          {/* Código — somente leitura */}
                          <div>
                            <label className="text-[11px] font-medium text-slate-600 mb-1 block ml-0.5">Código do Técnico</label>
                            <div className="flex items-center gap-2.5 bg-slate-50 border border-slate-300 rounded-xl px-3 h-10 shadow-xs">
                              <Hash size={14} className="text-slate-400 shrink-0" />
                              <span className="font-mono text-xs font-medium text-[#1c2d4f] tracking-wider flex-1 truncate">
                                {(formData as any).techCode || (formData as any).tech_code || (formData as any).userCode || (formData as any).user_code || '— gerado ao salvar —'}
                              </span>
                              <span className="text-[9px] font-medium text-slate-400 uppercase tracking-wider shrink-0">Automático</span>
                            </div>
                          </div>

                          {/* Status de Acesso */}
                          <div>
                            <label className="text-[11px] font-medium text-slate-600 mb-1 block ml-0.5">Status de Acesso</label>
                            <select
                              disabled={isReadOnly}
                              className="w-full bg-white border border-slate-300 rounded-xl px-3 h-10 text-xs font-normal text-slate-800 focus:ring-2 focus:ring-[#1c2d4f]/10 focus:border-[#1c2d4f] transition-all outline-none cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed shadow-xs"
                              value={formData.active ? 'ACTIVE' : 'INACTIVE'}
                              onChange={e => setFormData({ ...formData, active: e.target.value === 'ACTIVE' })}
                            >
                              <option value="ACTIVE">Liberado (App Ativo)</option>
                              <option value="INACTIVE">Suspenso (Bloqueado)</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Info Card de Integração Mobile */}
                      <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-3 mt-3">
                        <div className={`p-2 rounded-lg shrink-0 ${formData.active ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-rose-50 text-rose-600 border border-rose-200'}`}>
                          {formData.active ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                        </div>
                        <div className="text-xs">
                          <p className="font-medium text-slate-800">
                            {formData.active ? 'Acesso ao Aplicativo Móvel Liberado' : 'Acesso Suspenso no Aplicativo'}
                          </p>
                          <p className="text-[11px] text-slate-500 font-normal mt-0.5 leading-relaxed">
                            {formData.active 
                              ? 'O técnico pode autenticar no aplicativo de campo, receber ordens de serviço e registrar checklists operacionais.' 
                              : 'O técnico não conseguirá realizar login ou sincronizar dados no app enquanto estiver suspenso.'}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                </div>
              </form>

              {/* FOOTER — padrão do sistema */}
              <div className="px-6 py-3.5 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setEditingId(null); setIsReadOnly(false); setFormData({ name: '', email: '', active: true, phone: '', jobTitle: '' }); setSaveError(null); }}
                  className="h-9 px-5 rounded-xl text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  {isReadOnly ? 'Fechar' : 'Cancelar'}
                </button>
                {!isReadOnly && (
                  <Button
                    onClick={handleSubmit as any}
                    disabled={loading}
                    className="h-9 px-6 rounded-xl text-xs font-semibold bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] text-white disabled:opacity-70 disabled:cursor-not-allowed transition-all shadow-xs"
                  >
                    {loading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
                    {loading ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                  </Button>
                )}
              </div>

            </div>
          </div>, document.body
        )
      }

      {
        techToDelete && createPortal(
          <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-fade-in">
            <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl border border-slate-200 animate-scale-up space-y-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-100">
                  <Trash2 size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Excluir Técnico Permanentemente</h3>
                  <p className="text-xs font-semibold text-slate-400 mt-0.5">Esta ação apagará o perfil e acessos do técnico</p>
                </div>
              </div>
              
              <div className="p-4 bg-rose-50/50 rounded-xl border border-rose-100 text-xs text-rose-900 space-y-1">
                <p className="font-bold">Atenção: Ação Irreversível</p>
                <p className="text-[11px] text-rose-700 font-medium leading-relaxed">
                  Você está prestes a remover o técnico <strong>{techToDelete.name}</strong> ({techToDelete.email}) permanentemente do sistema e essa ação é irreversível. Tem certeza de que deseja continuar?
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTechToDelete(null)}
                  disabled={isDeleting}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={async () => {
                    setIsDeleting(true);
                    try {
                      await TenantService.deleteTechnician(techToDelete.id);
                      await loadTechs();
                      setTechToDelete(null);
                      alert("✅ Técnico excluído permanentemente com sucesso!");
                    } catch (err: any) {
                      alert("Erro ao excluir técnico: " + (err.message || err));
                    } finally {
                      setIsDeleting(false);
                    }
                  }}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-lg shadow-rose-600/20 flex items-center gap-2"
                >
                  {isDeleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                  {isDeleting ? 'Excluindo...' : 'Confirmar Exclusão'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      }
      </>
      )}
    </div>
  );
};

