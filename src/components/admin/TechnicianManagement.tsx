
import React, { useState, useEffect, useRef } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Plus, Edit2, X, Save, Lock, UserCheck, AtSign,
  Camera, Trash2, Smartphone, Search, Filter, Calendar, RefreshCw
} from 'lucide-react';
import { DataService } from '../../services/dataService';
import { User as UserType, UserRole } from '../../types';

export const TechnicianManagement: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [technicians, setTechnicians] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<any>({
    name: '', email: '', password: 'password', avatar: '', active: true, phone: ''
  });

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
      setFormData({ name: '', email: '', password: 'password', active: true, phone: '' });
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

  const handleRandomizeAvatar = async (tech: UserType) => {
    try {
      // Randomiza entre diferentes estilos de avatar humanizados
      const styles = ['avataaars', 'lorelei', 'personas', 'bottts-neutral', 'fun-emoji'];
      const randomStyle = styles[Math.floor(Math.random() * styles.length)];
      const randomSeed = `${tech.name}-${Date.now()}`;
      const newAvatar = `https://api.dicebear.com/7.x/${randomStyle}/svg?seed=${encodeURIComponent(randomSeed)}&backgroundColor=10b981`;

      // Atualiza localmente para feedback instantâneo
      setTechnicians(prev => prev.map(t => t.id === tech.id ? { ...t, avatar: newAvatar } : t));

      // Persiste no banco
      await DataService.updateTechnician({ ...tech, avatar: newAvatar });
    } catch (error) {
      console.error("Erro ao randomizar avatar:", error);
      alert("Erro ao trocar avatar. Verifique a conexão.");
    }
  };

  return (
    <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden">

      {/* Toolbar */}
      <div className="mb-2 flex flex-col md:flex-row gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Localizar técnico por nome ou e-mail..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-6 py-2.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-emerald-50 transition-all shadow-sm"
          />
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-2 w-full md:w-auto justify-end">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-sm h-[42px]">
            <Filter size={14} className="text-slate-400 mr-2" />
            <select
              className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer"
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
            className="bg-emerald-600 hover:bg-emerald-700 rounded-xl px-6 h-[42px] font-black italic uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-600/20 whitespace-nowrap text-white"
          >
            <Plus size={16} className="mr-2" /> Novo Técnico
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/50 flex-1 min-h-0">
        <div className="flex-1 overflow-auto p-0 custom-scrollbar">
          <table className="w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-left">
                <th className="px-8 py-2">Identidade Visual</th>
                <th className="px-8 py-2">Credencial (E-mail)</th>
                <th className="px-8 py-2 text-center">Status App</th>
                <th className="px-8 py-2 text-right pr-12">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredTechs.map(t => (
                <tr key={t.id} className="bg-white hover:bg-emerald-50/30 transition-all group shadow-sm">
                  <td className="px-8 py-6 rounded-l-[2rem] border border-slate-100 border-r-0">
                    <div className="flex items-center gap-5">
                      <div className="relative group/avatar">
                        <img src={t.avatar} className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-md bg-slate-100 transition-transform group-hover/avatar:scale-105" alt={t.name} />
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRandomizeAvatar(t); }}
                          className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 text-white rounded-lg shadow-lg opacity-0 group-hover/avatar:opacity-100 transition-all hover:bg-indigo-700 scale-75 group-hover/avatar:scale-100"
                          title="Trocar Avatar Aleatório"
                        >
                          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
                        </button>
                      </div>
                      <div>
                        <p className="font-black text-slate-900 uppercase tracking-tight text-sm">{t.name}</p>
                        <div className="flex items-center gap-2 mt-1"><Smartphone size={10} className="text-emerald-500" /><span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Mobile Ativo</span></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 border-y border-slate-100 italic text-xs font-bold text-slate-500">{t.email}</td>
                  <td className="px-8 py-6 border-y border-slate-100 text-center">
                    <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${t.active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                      {t.active ? 'Liberado' : 'Suspenso'}
                    </span>
                  </td>
                  <td className="px-8 py-6 rounded-r-[2rem] border border-slate-100 border-l-0 text-right pr-8">
                    <button onClick={() => { setFormData(t); setEditingId(t.id); setIsModalOpen(true); }} className="p-3 text-slate-400 hover:text-emerald-600 bg-slate-50 hover:bg-white rounded-xl shadow-sm transition-all"><Edit2 size={18} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white rounded-[3.5rem] w-full max-w-xl shadow-2xl border border-white/20 overflow-hidden flex flex-col animate-fade-in-up">
            <div className="flex justify-between items-center px-10 py-8 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-emerald-600 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-emerald-600/20">
                  {editingId ? <Edit2 size={24} /> : <Plus size={24} />}
                </div>
                <div>
                  <h2 className="text-xl font-black text-slate-900 uppercase tracking-tighter italic leading-none">{editingId ? 'Editar Técnico' : 'Novo Técnico'}</h2>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2 italic">Acesso exclusivo via App Móvel</p>
                </div>
              </div>
              <button
                onClick={() => { setIsModalOpen(false); setEditingId(null); setFormData({ name: '', email: '', password: 'password', active: true, phone: '' }); }}
                className="p-3 bg-white text-slate-300 hover:text-slate-900 rounded-xl shadow-sm border border-slate-100 transition-all"
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
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-1">Senha de Acesso</label>
                    <Input
                      required
                      type="password"
                      placeholder="******"
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      className="rounded-2xl py-4 font-bold border-slate-200 focus:ring-emerald-50"
                      icon={<Lock size={18} />}
                    />
                  </div>
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
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl py-5 font-black uppercase italic tracking-widest shadow-xl shadow-emerald-600/20 transition-all"
                >
                  <Save size={20} className="mr-3" /> {editingId ? 'Salvar Alterações' : 'Confirmar Cadastro'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

