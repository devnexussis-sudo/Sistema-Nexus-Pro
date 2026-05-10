
import React, { useState, useEffect, useRef } from 'react';
import { useI18n } from '../../i18n';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Plus, Edit2, X, Save, Lock, AtSign, Loader2,
  Smartphone, Search, Filter, ChevronLeft, Hash
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { DataService } from '../../services/dataService';
import { TechnicianService, formatTechCode } from '../../services/technicianService';
import { User as UserType, UserRole, OrderStatus } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';

export const TechnicianManagement: React.FC = () => {
  const { t } = useI18n();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
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
      const techs = await DataService.getAllTechnicians();
      setTechnicians(techs);
    } catch (error) {
      console.error("Erro ao carregar técnicos:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTechs(); }, []);

  // 🔑 Backfill: atribui códigos a técnicos antigos sem código
  useEffect(() => {
    TechnicianService.backfillMissingCodes().catch(console.warn);
  }, []);

  const filteredTechs = technicians.filter(t => {
    const matchesSearch = t.name.toLowerCase().includes(searchTerm.toLowerCase()) || t.email.toLowerCase().includes(searchTerm.toLowerCase());
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
        await DataService.updateTechnician({ ...formData, id: editingId });
      } else {
        await DataService.createTechnician(formData);
      }

      await loadTechs();
      setIsModalOpen(false);
      setEditingId(null);
      setFormData({ name: '', email: '', active: true, phone: '', jobTitle: '' });
      alert("✅ Técnico registrado e vinculado com sucesso!");
    } catch (error: any) {
      console.error("❌ ERRO FATAL AO SALVAR TÉCNICO:", error);
      let msg = error?.message || "Erro desconhecido no sistema.";
      if (msg.includes("already been registered")) {
        msg = "Este e-mail já está em uso por outra empresa. Para evitar conflitos de acesso, é necessário usar um outro e-mail.";
      }
      setSaveError(msg);
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">
      {loading && technicians.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 h-full">
          <Loader2 size={40} className="animate-spin text-[#1c2d4f] mb-4" />
          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Carregando dados da tela...</p>
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
              className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
            <div className="flex items-center bg-white border border-[#1c2d4f]/20 rounded-xl pl-2 pr-1 h-10 shadow-sm">
              <Filter size={12} className="text-slate-400 mr-2" />
              <select
                className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-full cursor-pointer h-full"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">{t.common.status}</option>
                <option value="ACTIVE">Liberados</option>
                <option value="INACTIVE">Suspensos</option>
              </select>
            </div>

            <Button
              onClick={() => setIsModalOpen(true)}
              className="h-10 px-4 gap-1.5 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] shadow-lg shadow-[#1c2d4f]/20 text-[11px] rounded-xl font-bold whitespace-nowrap text-white"
            >
              <Plus size={16} /> Novo Técnico
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">
        <div className="flex-1 overflow-auto p-0 custom-scrollbar">
          <table className="w-full border-separate border-spacing-y-1">
            <thead className="sticky top-0 bg-slate-200/60 backdrop-blur-md z-10 border-b border-slate-300 shadow-sm">
              <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-center font-poppins">
                <th className="px-4 py-3 text-left">Identidade Visual</th>
                <th className="px-4 py-3 text-center">Código</th>
                <th className="px-4 py-3">Credencial (E-mail)</th>
                <th className="px-4 py-3 text-center">Status App</th>
                <th className="px-4 py-3 text-right pr-6">{t.common.actions}</th>
              </tr>
            </thead>
            <tbody>
              {paginatedTechs.map(t => (
                <tr key={t.id} className="bg-white hover:bg-emerald-50/40 transition-all group shadow-sm hover:shadow-md">
                  <td className="px-4 py-1.5 rounded-l-[1.5rem] border border-slate-100 border-r-0">
                    <div className="flex items-center gap-4">
                      <div className="relative group/avatar shrink-0">
                        <img src={t.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(t.name) + '&background=10b981&color=fff'} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-md bg-slate-100 transition-transform group-hover/avatar:scale-105" alt={t.name} />
                      </div>
                      <div className="truncate">
                        <p className="text-slate-900 tracking-tight text-[13px] font-medium truncate max-w-[150px]">{t.name}</p>
                        <div className="flex items-center gap-1.5 mt-0.5"><Smartphone size={10} className="text-emerald-500" /><span className="text-[10px] text-emerald-500 tracking-widest">Mobile Ativo</span></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-1.5 border-y border-slate-100 text-center">
                    <span className="font-mono text-[11px] font-bold text-[#1c2d4f] bg-[#1c2d4f]/8 px-2.5 py-1 rounded-lg tracking-widest border border-[#1c2d4f]/15">
                      {formatTechCode((t as any).techCode)}
                    </span>
                  </td>
                  <td className="px-4 py-1.5 border-y border-slate-100 text-[12px] text-slate-500 truncate max-w-[180px]">{t.email}</td>
                  <td className="px-4 py-1.5 border-y border-slate-100 text-center whitespace-nowrap">
                    <StatusBadge status={t.active ? OrderStatus.COMPLETED : OrderStatus.CANCELED} />
                  </td>
                  <td className="px-4 py-1.5 rounded-r-[1.5rem] border border-slate-100 border-l-0 text-right pr-4">
                    <button onClick={() => { setFormData(t); setEditingId(t.id); setIsModalOpen(true); }} className="p-2.5 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-90" title="Editar Técnico"><Edit2 size={16} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredTechs.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
        />
      </div>

      {
        isModalOpen && createPortal(
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden">
            <div className="bg-white rounded-xl w-full max-w-[96vw] h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up">

              {/* HEADER — idêntico ao da OS */}
              <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                    {editingId ? <Edit2 size={18} /> : <Plus size={18} />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                      {editingId ? `Editar Técnico` : 'Novo Técnico'}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] font-bold text-slate-400">Nexus Field • acesso via app móvel</p>
                      {editingId && (formData as any).techCode && (
                        <span className="font-mono text-[10px] font-bold text-[#1c2d4f] bg-[#1c2d4f]/8 px-2 py-0.5 rounded border border-[#1c2d4f]/15 tracking-widest">
                          {(formData as any).techCode}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => { setIsModalOpen(false); setEditingId(null); setFormData({ name: '', email: '', active: true, phone: '', jobTitle: '' }); setSaveError(null); }}
                  className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50"
                >
                  <X size={20} />
                </button>
              </div>

              {/* BODY — bg-slate-50/30 p-8 igual à OS */}
              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
                <div className="space-y-8 max-w-4xl mx-auto">

                  {saveError && (
                    <div className="bg-rose-50 border border-rose-200 p-4 rounded-xl flex items-start gap-3 text-rose-600 animate-fade-in shadow-sm">
                      <div className="shrink-0 mt-0.5">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold">Atenção!</h4>
                        <p className="text-xs font-medium mt-1">{saveError}</p>
                      </div>
                    </div>
                  )}

                  {/* Card de Identificação */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">identificação do técnico</h3>
                    </div>
                    
                    <div className="p-6 flex flex-col sm:flex-row gap-8 items-start">
                      {/* Quadro da Foto (Avatar) */}
                      <div className="flex flex-col items-center gap-3 shrink-0 pt-2">
                        <div className="relative group">
                          <img
                            src={formData.avatar || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(formData.name || 'Tech') + '&background=10b981&color=fff&size=256'}
                            className="w-32 h-32 sm:w-40 sm:h-40 rounded-3xl object-cover border-4 border-white shadow-xl bg-slate-50 transition-transform duration-300 group-hover:scale-105"
                            alt={formData.name}
                          />
                          <div className="absolute inset-0 rounded-3xl ring-1 ring-inset ring-slate-900/10" />
                          {/* Indicador de Status na foto */}
                          <div className={`absolute -bottom-2 -right-2 w-10 h-10 rounded-full border-4 border-white flex items-center justify-center shadow-md transition-colors ${formData.active ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                            <div className="w-3 h-3 bg-white rounded-full animate-pulse" />
                          </div>
                        </div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center mt-2 w-32 sm:w-40 leading-relaxed">
                          Foto do Perfil<br/>(Sincronizada do App)
                        </p>
                      </div>

                      {/* Campos do Formulário */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 flex-1 w-full">
                        <div className="md:col-span-2">
                          <Input
                            label="Nome Completo"
                            required
                            placeholder="Ex: Roberto Refrigeração"
                            value={formData.name}
                            onChange={e => setFormData({ ...formData, name: e.target.value })}
                            className="rounded-xl py-3 font-medium border-slate-200 text-lg"
                          />
                        </div>

                        <Input
                          label="E-mail (Login do App)"
                          required
                          type="email"
                          placeholder="tecnico@nexus.pro"
                          value={formData.email}
                          onChange={e => setFormData({ ...formData, email: e.target.value })}
                          className="rounded-xl py-3 font-medium border-slate-200"
                          icon={<AtSign size={16} />}
                        />

                        <Input
                          label="Telefone / WhatsApp"
                          placeholder="(00) 00000-0000"
                          value={formData.phone}
                          onChange={handlePhoneChange}
                          className="rounded-xl py-3 font-medium border-slate-200"
                          icon={<Smartphone size={16} />}
                        />

                        <div className="md:col-span-2">
                          <Input
                            label="Função / Cargo"
                            placeholder="Ex: Técnico de Ar Condicionado"
                            value={formData.jobTitle}
                            onChange={e => setFormData({ ...formData, jobTitle: e.target.value })}
                            className="rounded-xl py-3 font-medium border-slate-200"
                            icon={<Smartphone size={16} />}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card de Controle */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-slate-100">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">controle de acesso</h3>
                    </div>
                    <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">

                      {/* Código — somente leitura */}
                      <div className="w-full">
                        <label className="text-[10px] font-bold text-slate-400 mb-1.5 block ml-1">Código do Técnico</label>
                        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                          <Hash size={15} className="text-slate-300 shrink-0" />
                          <span className="font-mono text-sm font-bold text-[#1c2d4f] tracking-[0.2em] flex-1">
                            {(formData as any).techCode ?? '— gerado ao salvar —'}
                          </span>
                          <span className="text-[9px] font-bold text-slate-300 uppercase tracking-widest shrink-0">somente leitura</span>
                        </div>
                      </div>

                      <div className="w-full">
                        <label className="text-[10px] font-bold text-slate-400 mb-1.5 block ml-1">Status de Acesso</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#1c2d4f]/10 focus:border-[#1c2d4f] transition-all outline-none cursor-pointer"
                          value={formData.active ? 'ACTIVE' : 'INACTIVE'}
                          onChange={e => setFormData({ ...formData, active: e.target.value === 'ACTIVE' })}
                        >
                          <option value="ACTIVE">Liberado (App Ativo)</option>
                          <option value="INACTIVE">Suspenso (Bloqueado)</option>
                        </select>
                      </div>

                    </div>
                  </div>

                </div>
              </form>

              {/* FOOTER — idêntico ao da OS */}
              <div className="px-8 py-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { setIsModalOpen(false); setEditingId(null); setFormData({ name: '', email: '', active: true, phone: '', jobTitle: '' }); setSaveError(null); }}
                  className="h-9 px-5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors"
                >
                  Cancelar
                </button>
                <Button
                  onClick={handleSubmit as any}
                  disabled={loading}
                  className="h-9 px-6 rounded-xl text-xs font-bold bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] text-white disabled:opacity-70 disabled:cursor-not-allowed transition-all"
                >
                  {loading ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Save size={14} className="mr-2" />}
                  {loading ? 'Salvando...' : editingId ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                </Button>
              </div>

            </div>
          </div>, document.body
        )
      }
      </>
      )}
    </div>
  );
};
