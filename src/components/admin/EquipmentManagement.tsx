
import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input, TextArea } from '../ui/Input';
import {
  Plus, Box, Laptop, Search, Trash2, Edit2, X, Save,
  Power, PowerOff, Info, User, Tag, Hash, LayoutGrid,
  Layers, Settings2, MapPin, Filter, Calendar
} from 'lucide-react';

import { Customer, Equipment, EquipmentFamily } from '../../types';
import { DataService } from '../../services/dataService';




interface EquipmentManagementProps {
  equipments: Equipment[];
  customers: Customer[];
  onUpdateEquipments: (equips: Equipment[]) => void;
  initialParams?: any;
}

export const EquipmentManagement: React.FC<EquipmentManagementProps> = ({
  equipments, customers, onUpdateEquipments, initialParams
}) => {
  const [activeTab, setActiveTab] = useState<'list' | 'families'>('list');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const [eqFormData, setEqFormData] = useState<Partial<Equipment>>({ active: true });

  useEffect(() => {
    if (initialParams?.customerId) {
      setEqFormData({
        active: true,
        customerId: initialParams.customerId
      });
      setIsModalOpen(true);
      setActiveTab('list');
    }
  }, [initialParams]);


  const [families, setFamilies] = useState<EquipmentFamily[]>([
    { id: 'f-refri', name: 'Refrigeração Industrial', description: 'Chillers, balcões refrigerados e câmaras frias', active: true },
    { id: 'f-eletrica', name: 'Elétrica', description: 'Painéis, geradores e quadros de força', active: true },
    { id: 'f-clima', name: 'Climatização', description: 'Ar condicionados e cortinas de ar', active: true },
    { id: 'f-seg', name: 'Segurança Eletrônica', description: 'Câmeras IP, Alarmes e Sensores', active: true },
    { id: 'f-ti', name: 'Redes e TI', description: 'Roteadores, Switches e Servidores', active: true }
  ]);



  useEffect(() => {
    localStorage.setItem('nexus_equipments_db', JSON.stringify(equipments));
  }, [equipments]);



  const [familyFormData, setFamilyFormData] = useState<Partial<EquipmentFamily>>({ active: true });



  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setEqFormData({ active: true });
    setFamilyFormData({ active: true });
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();

    const selectedClient = customers.find(c => c.id === eqFormData.customerId);
    const selectedFamily = families.find(f => f.id === eqFormData.familyId);

    const syncData = {
      customerName: selectedClient?.name || 'Não vinculado',
      familyName: selectedFamily?.name || 'Outros'
    };

    try {
      if (editingId) {
        const updatedEq = {
          ...equipments.find(eq => eq.id === editingId),
          ...eqFormData,
          ...syncData
        } as Equipment;
        await DataService.updateEquipment(updatedEq);
        onUpdateEquipments(equipments.map(e => e.id === editingId ? updatedEq : e));
      } else {
        const newEq = {
          ...eqFormData,
          id: `e-${Date.now()}`,
          createdAt: new Date().toISOString(),
          ...syncData,
          active: true
        } as Equipment;
        await DataService.createEquipment(newEq);
        onUpdateEquipments([newEq, ...equipments]);
      }
      closeModal();
    } catch (error: any) {
      console.error("ERRO NEXUS ATIVO:", error);
      alert(`Erro ao salvar equipamento: ${error.message || 'Falha na conexão com o servidor'}`);
    }
  };

  const toggleEquipmentStatus = async (equipment: Equipment) => {
    try {
      const updatedEq = { ...equipment, active: !equipment.active };
      await DataService.updateEquipment(updatedEq);
      onUpdateEquipments(equipments.map(e => e.id === equipment.id ? updatedEq : e));
    } catch (error) {
      console.error(error);
      alert("Erro ao alterar status.");
    }
  };



  const handleSaveFamily = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      setFamilies(families.map(f => f.id === editingId ? { ...f, ...familyFormData } as EquipmentFamily : f));
    } else {
      const newFam = { ...familyFormData, id: `f-${Date.now()}`, active: true } as EquipmentFamily;
      setFamilies([...families, newFam]);
    }
    closeModal();
  };

  const [statusFilter, setStatusFilter] = useState('ALL');

  const filteredItems = activeTab === 'list'
    ? equipments.filter(e => {
      const matchesSearch = e.model.toLowerCase().includes(searchTerm.toLowerCase()) || e.serialNumber.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? e.active : !e.active);
      return matchesSearch && matchesStatus;
    })
    : families.filter(f => {
      const matchesSearch = f.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? f.active : !f.active);
      return matchesSearch && matchesStatus;
    });

  return (
    <div className="p-4 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden">

      {/* TOOLBAR PADRONIZADA (Externa) */}
      <div className="mb-2 flex flex-col xl:flex-row items-center gap-3">
        {/* Abas Compactas */}
        <div className="flex bg-white/60 p-1 rounded-xl border border-slate-200 backdrop-blur-sm shadow-sm">
          <button
            onClick={() => setActiveTab('list')}
            className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === 'list' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <div className="flex items-center gap-2"><Box size={14} /> Ativos</div>
          </button>
          <button
            onClick={() => setActiveTab('families')}
            className={`px-4 py-2 rounded-lg text-[9px] font-bold uppercase tracking-widest transition-all ${activeTab === 'families' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <div className="flex items-center gap-2"><Layers size={14} /> Famílias</div>
          </button>
        </div>

        {/* Busca (Grow) */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder={activeTab === 'list' ? "Localizar por modelo ou serial..." : "Localizar categoria..."}
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-6 py-3 text-[11px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary-100 transition-all shadow-sm"
          />
        </div>

        {/* Filtros e Ações */}
        <div className="flex items-center gap-2 w-full xl:w-auto">
          <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-sm h-[46px]">
            <Filter size={14} className="text-slate-400 mr-2" />
            <select
              className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
            >
              <option value="ALL">Todos</option>
              <option value="ACTIVE">Ativos</option>
              <option value="INACTIVE">Inativos</option>
            </select>
          </div>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="rounded-xl px-6 h-[46px] font-bold uppercase text-[10px] tracking-widest shadow-sm shadow-[#1c2d4f]/10 whitespace-nowrap bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f]"
          >
            <Plus size={16} className="mr-2" /> {activeTab === 'list' ? 'Novo' : 'Nova Categoria'}
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2.5rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0 mx-2 mb-2">

        {/* TABELA PADRONIZADA */}
        <div className="flex-1 overflow-auto p-0 custom-scrollbar">
          {activeTab === 'list' ? (
            <table className="w-full border-separate border-spacing-y-3 px-8">
              <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10">
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-left">
                  <th className="px-8 py-5">Equipamento / Modelo</th>
                  <th className="px-8 py-5 text-center">Nº de Série</th>
                  <th className="px-8 py-5">Proprietário</th>
                  <th className="px-8 py-5 text-center">Status</th>
                  <th className="px-8 py-5 text-right pr-12">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((e: any) => (
                  <tr key={e.id} className="bg-white hover:bg-primary-50/40 transition-all group shadow-sm hover:shadow-md cursor-pointer">
                    <td className="px-8 py-6 rounded-l-[2rem] border border-slate-100 border-r-0 font-black text-xs">
                      <div className="flex items-center gap-5">
                        <div className="p-4 rounded-2xl bg-slate-50 border border-slate-100 text-primary-400 shadow-inner group-hover:bg-primary-600 group-hover:text-white transition-all">
                          <Box size={22} />
                        </div>
                        <div>
                          <p className="text-slate-900 uppercase italic tracking-tight">{e.model}</p>
                          <p className="text-[9px] font-black text-primary-400 uppercase tracking-widest mt-1 italic">{e.familyName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 border-y border-slate-100 text-center font-mono text-[11px] font-black text-slate-500 tracking-tighter italic uppercase">#{e.serialNumber}</td>
                    <td className="px-8 py-6 border-y border-slate-100 text-[10px] font-black uppercase text-slate-600 italic tracking-tight">
                      {customers.find(c => c.id === e.customerId)?.name || e.customerName || 'Não vinculado'}
                    </td>

                    <td className="px-8 py-6 border-y border-slate-100 text-center">
                      <StatusBadge status={e.active ? OrderStatus.COMPLETED : OrderStatus.CANCELED} />
                    </td>
                    <td className="px-8 py-6 rounded-r-[2rem] border border-slate-100 border-l-0 text-right pr-8">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={(evt) => { evt.stopPropagation(); toggleEquipmentStatus(e); }} className={`p-3 rounded-xl shadow-sm border border-transparent transition-all active:scale-95 ${e.active ? 'bg-slate-50 text-amber-500 hover:bg-white hover:border-amber-100 hover:text-amber-600' : 'bg-slate-50 text-emerald-500 hover:bg-white hover:border-emerald-100 hover:text-emerald-600'}`}>
                          {e.active ? <PowerOff size={18} /> : <Power size={18} />}
                        </button>
                        <button onClick={(evt) => { evt.stopPropagation(); setEqFormData(e); setEditingId(e.id); setIsModalOpen(true); }} className="p-3 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-95" title="Editar"><Edit2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-separate border-spacing-y-3 px-8">
              <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10">
                <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-left">
                  <th className="px-8 py-5">Nome da Família</th>
                  <th className="px-8 py-5">Descrição Técnica de Escopo</th>
                  <th className="px-8 py-5 text-center">Status</th>
                  <th className="px-8 py-5 text-right pr-12">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((f: any) => (
                  <tr key={f.id} className="bg-white hover:bg-primary-50/30 transition-all group shadow-sm cursor-pointer">
                    <td className="px-8 py-6 rounded-l-[2rem] border border-slate-100 border-r-0 font-black text-xs">
                      <div className="flex items-center gap-5">
                        <div className="p-4 rounded-2xl bg-primary-50 text-primary-600 shadow-inner group-hover:bg-primary-600 group-hover:text-white transition-all">
                          <Layers size={22} />
                        </div>
                        <p className="text-slate-900 uppercase italic tracking-tight">{f.name}</p>
                      </div>
                    </td>
                    <td className="px-8 py-6 border-y border-slate-100 text-[10px] font-medium text-slate-500 italic max-w-sm truncate">{f.description}</td>
                    <td className="px-8 py-6 border-y border-slate-100 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${f.active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        {f.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-8 py-6 rounded-r-[2rem] border border-slate-100 border-l-0 text-right pr-8">
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => setFamilies(families.map(item => item.id === f.id ? { ...item, active: !item.active } : item))} className={`p-3 rounded-xl shadow-sm border border-transparent transition-all ${f.active ? 'bg-slate-50 text-amber-500 hover:bg-amber-50' : 'bg-slate-50 text-emerald-500 hover:bg-emerald-50'}`}>
                          {f.active ? <PowerOff size={18} /> : <Power size={18} />}
                        </button>
                        <button onClick={() => { setFamilyFormData(f); setEditingId(f.id); setIsModalOpen(true); }} className="p-3 bg-slate-50 text-slate-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-primary-100 transition-all"><Edit2 size={18} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white rounded-[4rem] w-full max-w-3xl shadow-2xl border border-white/20 overflow-hidden flex flex-col max-h-[92vh] animate-fade-in-up">
            <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center rounded-t-[4rem]">
              <div className="flex items-center gap-6">
                <div className="p-5 bg-[#1c2d4f] rounded-[1.5rem] text-white shadow-xl">
                  {activeTab === 'list' ? <Box size={32} /> : <Layers size={32} />}
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight leading-none">
                    {activeTab === 'list' ? (editingId ? 'Atualizar Ativo' : 'Novo Registro de Ativo') : (editingId ? 'Editar Categoria' : 'Nova Categoria Técnica')}
                  </h2>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-2">Controle técnico de inventário</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-4 bg-white border border-slate-100 rounded-2xl text-slate-300 hover:text-slate-900 transition-all shadow-sm"><X size={28} /></button>
            </div>

            <form onSubmit={activeTab === 'list' ? handleSaveEquipment : handleSaveFamily} className="p-12 space-y-10 overflow-y-auto custom-scrollbar flex-1">
              {activeTab === 'list' ? (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                    <Input label="Modelo do Ativo" required icon={<Laptop size={16} />} className="rounded-2xl py-4 font-bold border-slate-200" value={eqFormData.model || ''} onChange={e => setEqFormData({ ...eqFormData, model: e.target.value })} />
                    <Input label="Número de Série (Serial)" required icon={<Hash size={16} />} className="rounded-2xl py-4 font-bold border-slate-200" value={eqFormData.serialNumber || ''} onChange={e => setEqFormData({ ...eqFormData, serialNumber: e.target.value })} />
                    <div className="w-full">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-2 block italic">Família Técnica</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-xs font-black uppercase text-slate-900 focus:ring-4 focus:ring-primary-100 transition-all"
                        required
                        value={eqFormData.familyId || ''}
                        onChange={e => setEqFormData({ ...eqFormData, familyId: e.target.value })}
                      >
                        <option value="" disabled>Selecione a Família...</option>
                        {families.filter(f => f.active).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                      </select>
                    </div>
                    <div className="w-full">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest px-2 mb-2 block italic">Cliente Proprietário</label>
                      <select
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-xs font-black uppercase text-slate-900 focus:ring-4 focus:ring-primary-100 transition-all"
                        required
                        value={eqFormData.customerId || ''}
                        onChange={e => setEqFormData({ ...eqFormData, customerId: e.target.value })}
                      >

                        <option value="" disabled>Vincular a um Cliente...</option>
                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}

                      </select>
                    </div>
                  </div>
                  <TextArea label="Ficha Técnica / Memorial Descritivo" rows={4} className="rounded-[2.5rem] p-8 italic shadow-inner border-slate-200" value={eqFormData.description || ''} onChange={e => setEqFormData({ ...eqFormData, description: e.target.value })} />
                </>
              ) : (
                <div className="space-y-10">
                  <Input label="Nome da Categoria (Família)" required placeholder="Ex: Equipamentos de Redes" icon={<Layers size={16} />} className="rounded-2xl py-4 font-bold border-slate-200" value={familyFormData.name || ''} onChange={e => setFamilyFormData({ ...familyFormData, name: e.target.value })} />
                  <TextArea label="Escopo Técnico da Família" placeholder="Quais ativos pertencem a este grupo de processos?" rows={4} className="rounded-[2.5rem] p-8 italic shadow-inner border-slate-200" value={familyFormData.description || ''} onChange={e => setFamilyFormData({ ...familyFormData, description: e.target.value })} />
                </div>
              )}
            </form>

            <div className="p-10 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-6 rounded-b-[4rem]">
              <Button variant="secondary" className="rounded-2xl px-12" onClick={closeModal}>Descartar</Button>
              <Button onClick={activeTab === 'list' ? handleSaveEquipment : handleSaveFamily} className="rounded-2xl px-20 shadow-sm font-bold uppercase bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f]">
                <Save size={20} className="mr-3" /> Gravar Ativo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
