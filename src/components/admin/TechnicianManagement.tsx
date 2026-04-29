
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Plus, Edit2, X, Save, Lock, AtSign,
  Smartphone, Search, Filter, ChevronLeft
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { DataService } from '../../services/dataService';
import { User as UserType, UserRole, OrderStatus } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';

export const TechnicianManagement: React.FC = () => {
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
      const detail = error?.message || "Erro desconhecido no Supabase";
      const hint = error?.details || "Verifique se a tabela 'technicians' tem o RLS desativado.";
      window.alert(`[ERRO DE BANCO DE DADOS]\n\nMotivo: ${detail}\n\nDica: ${hint}`);
    } finally {
      setLoading(false);
    }
  };



  return (
    <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">

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
                <option value="ALL">Status</option>
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
                <th className="px-4 py-3">Identidade Visual</th>
                <th className="px-4 py-3">Credencial (E-mail)</th>
                <th className="px-4 py-3 text-center">Status App</th>
                <th className="px-4 py-3 text-right pr-6">Ações</th>
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
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6 animate-in fade-in">
            <div className="bg-white rounded-[3.5rem] w-full max-w-xl shadow-2xl border border-white/20 overflow-hidden flex flex-col animate-fade-in-up">
              <div className="flex justify-between items-center px-10 py-8 border-b border-slate-200 bg-slate-50/50">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-600/20">
                    {editingId ? <Edit2 size={24} /> : <Plus size={24} />}
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight leading-none">{editingId ? 'Editar Técnico' : 'Novo Técnico'}</h2>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-2">Acesso exclusivo via App Móvel</p>
                  </div>
                </div>
                <button
                  onClick={() => { setIsModalOpen(false); setEditingId(null); setFormData({ name: '', email: '', active: true, phone: '', jobTitle: '' }); }}
                  className="p-3 bg-white text-slate-300 hover:text-slate-900 rounded-xl shadow-sm border border-slate-200 transition-all"
                >
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="p-10 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Nome Completo</label>
                    <Input
                      required
                      placeholder="Ex: Roberto Refrigeração"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      className="rounded-2xl py-4 italic font-bold border-slate-200 focus:ring-emerald-50"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">E-mail (Login do App)</label>
                    <Input
                      required
                      type="email"
                      placeholder="tecnico@nexus.pro"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      className="rounded-2xl py-4 italic font-bold border-slate-200 focus:ring-emerald-50"
                      icon={<AtSign size={18} />}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Função / Cargo (Aparece no Perfil)</label>
                    <Input
                      placeholder="Ex: Técnico de Ar Condicionado"
                      value={formData.jobTitle}
                      onChange={e => setFormData({ ...formData, jobTitle: e.target.value })}
                      className="rounded-2xl py-4 italic font-bold border-slate-200 focus:ring-emerald-50"
                      icon={<Smartphone size={18} />}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Telefone / WhatsApp (Com Máscara)</label>
                    <Input
                      placeholder="(00) 00000-0000"
                      value={formData.phone}
                      onChange={handlePhoneChange}
                      className="rounded-2xl py-4 italic font-bold border-slate-200 focus:ring-emerald-50"
                      icon={<Smartphone size={18} />}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Status de Acesso</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-5 py-4 text-xs font-black uppercase text-slate-700 outline-none focus:ring-4 focus:ring-emerald-50 transition-all"
                        value={formData.active ? 'ACTIVE' : 'INACTIVE'}
                        onChange={e => setFormData({ ...formData, active: e.target.value === 'ACTIVE' })}
                      >
                        <option value="ACTIVE">Liberado (App Ativo)</option>
                        <option value="INACTIVE">Suspenso (Bloqueado)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-6">
                  <Button
                    type="submit"
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl py-5 font-bold uppercase tracking-widest shadow-sm shadow-emerald-500/10 transition-all border-none"
                  >
                    <Save size={20} className="mr-3" /> {editingId ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                  </Button>
                </div>
              </form>
            </div>
          </div>, document.body
        )
      }
    </div >
  );
};

