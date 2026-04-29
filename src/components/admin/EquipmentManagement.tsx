
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Input, TextArea } from '../ui/Input';
import {
  Plus, Box, Laptop, Search, Trash2, Edit2, X, Save,
  Power, PowerOff, Info, User, Tag, Hash, LayoutGrid,
  Layers, Settings2, MapPin, Filter, Calendar, ChevronLeft
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';

import { Customer, Equipment, EquipmentFamily, OrderStatus } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
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

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

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
      const matchesSearch = (e.model || '').toLowerCase().includes(searchTerm.toLowerCase()) || (e.serialNumber || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? e.active : !e.active);
      return matchesSearch && matchesStatus;
    })
    : families.filter(f => {
      const matchesSearch = (f.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? f.active : !f.active);
      return matchesSearch && matchesStatus;
    });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, statusFilter]);

  const paginatedItems = filteredItems.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(filteredItems.length / ITEMS_PER_PAGE);

  return (
    <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">

      {/* TOOLBAR PADRONIZADA (Externa) */}
      <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3">
          
          <div className="flex items-center gap-1">
            <div className="flex bg-white/60 p-1 rounded-xl border border-[#1c2d4f]/10 shadow-sm">
              <button
                onClick={() => setActiveTab('list')}
                className={`px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'list' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}
              >
                <Box size={14} /> Ativos
              </button>
              <button
                onClick={() => setActiveTab('families')}
                className={`px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'families' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}
              >
                <Layers size={14} /> Famílias
              </button>
            </div>
          </div>

          <div className="relative flex-1 min-w-[200px] w-full lg:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder={activeTab === 'list' ? "Buscar por modelo ou serial..." : "Buscar categoria..."}
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
                <option value="ALL">Todos Status</option>
                <option value="ACTIVE">Ativos</option>
                <option value="INACTIVE">Inativos</option>
              </select>
            </div>

            <Button
              onClick={() => setIsModalOpen(true)}
              className="h-10 px-4 gap-1.5 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] shadow-lg shadow-[#1c2d4f]/20 text-[11px] rounded-xl font-bold whitespace-nowrap text-white"
            >
              <Plus size={16} /> {activeTab === 'list' ? 'Novo' : 'Nova Categoria'}
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">

        {/* TABELA PADRONIZADA */}
        <div className="flex-1 overflow-auto p-0 custom-scrollbar">
          {activeTab === 'list' ? (
            <table className="w-full border-separate border-spacing-y-1">
              <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10">
                <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-center font-poppins">
                  <th className="px-4 py-2">equipamento / modelo</th>
                  <th className="px-4 py-2 text-center whitespace-nowrap">nº de série</th>
                  <th className="px-4 py-2">proprietário</th>
                  <th className="px-4 py-2 text-center">status</th>
                  <th className="px-4 py-3 text-right pr-6">Ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((e: any) => (
                  <tr key={e.id} className="bg-white hover:bg-primary-50/40 transition-all group shadow-sm hover:shadow-md cursor-pointer">
                    <td className="px-4 py-1.5 rounded-l-[1.5rem] border border-slate-100 border-r-0 font-bold text-xs max-w-[200px]">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-primary-400 shadow-inner group-hover:bg-primary-600 group-hover:text-white transition-all shrink-0">
                          <Box size={18} />
                        </div>
                        <div className="truncate">
                          <p className="text-slate-900 tracking-tight truncate text-[13px] font-medium">{e.model}</p>
                          <p className="text-[11px] text-primary-400 mt-1 truncate">{e.familyName}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-1.5 border-y border-slate-100 text-center font-mono text-[12px] text-slate-500 tracking-tighter whitespace-nowrap">#{e.serialNumber}</td>
                    <td className="px-4 py-1.5 border-y border-slate-100 text-[12px] text-slate-600 tracking-tight truncate max-w-[150px]">
                      {customers.find(c => c.id === e.customerId)?.name || e.customerName || 'Não vinculado'}
                    </td>

                    <td className="px-4 py-1.5 border-y border-slate-100 text-center">
                      <StatusBadge status={e.active ? OrderStatus.COMPLETED : OrderStatus.CANCELED} />
                    </td>
                    <td className="px-4 py-1.5 rounded-r-[1.5rem] border border-slate-100 border-l-0 text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={(evt) => { evt.stopPropagation(); toggleEquipmentStatus(e); }} className={`p-2.5 rounded-lg shadow-sm border border-transparent transition-all active:scale-95 ${e.active ? 'bg-slate-50 text-amber-500 hover:bg-white hover:border-amber-100 hover:text-amber-600' : 'bg-slate-50 text-emerald-500 hover:bg-white hover:border-emerald-100 hover:text-emerald-600'}`}>
                          {e.active ? <PowerOff size={16} /> : <Power size={16} />}
                        </button>
                        <button onClick={(evt) => { evt.stopPropagation(); setEqFormData(e); setEditingId(e.id); setIsModalOpen(true); }} className="p-2.5 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-95" title="Editar"><Edit2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-separate border-spacing-y-1">
              <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10">
                <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-center font-poppins">
                  <th className="px-4 py-2">nome da família</th>
                  <th className="px-4 py-2">descrição técnica de escopo</th>
                  <th className="px-4 py-2 text-center">status</th>
                  <th className="px-4 py-2 text-right pr-6">ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((f: any) => (
                  <tr key={f.id} className="bg-white hover:bg-primary-50/30 transition-all group shadow-sm cursor-pointer">
                    <td className="px-4 py-1.5 rounded-l-[1.5rem] border border-slate-100 border-r-0 font-bold text-xs max-w-[200px]">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary-50 text-primary-600 shadow-inner group-hover:bg-primary-600 group-hover:text-white transition-all shrink-0">
                          <Layers size={18} />
                        </div>
                        <p className="text-slate-900 tracking-tight truncate text-[13px] font-medium">{f.name}</p>
                      </div>
                    </td>
                    <td className="px-4 py-1.5 border-y border-slate-100 text-[11px] text-slate-500 max-w-sm truncate">{f.description}</td>
                    <td className="px-4 py-1.5 border-y border-slate-100 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-bold   border ${f.active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        {f.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-4 py-1.5 rounded-r-[1.5rem] border border-slate-100 border-l-0 text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => setFamilies(families.map(item => item.id === f.id ? { ...item, active: !item.active } : item))} className={`p-2.5 rounded-lg shadow-sm border border-transparent transition-all active:scale-95 ${f.active ? 'bg-slate-50 text-amber-500 hover:bg-amber-50' : 'bg-slate-50 text-emerald-500 hover:bg-emerald-50'}`}>
                          {f.active ? <PowerOff size={16} /> : <Power size={16} />}
                        </button>
                        <button onClick={() => { setFamilyFormData(f); setEditingId(f.id); setIsModalOpen(true); }} className="p-2.5 bg-slate-50 text-slate-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-95"><Edit2 size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredItems.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
        />
      </div>

      {
        isModalOpen && createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in">
            <div className="bg-white rounded-none lg:rounded-xl w-full max-w-3xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200">
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-start sm:items-center shrink-0 bg-white">
                <div className="flex items-center gap-6">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-[#1c2d4f] shrink-0">
                    {activeTab === 'list' ? <Box size={18} /> : <Layers size={18} />}
                  </div>
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900 font-poppins">
                      {activeTab === 'list' ? (editingId ? 'Atualizar Ativo' : 'Novo Registro de Ativo') : (editingId ? 'Editar Categoria' : 'Nova Categoria Técnica')}
                    </h2>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5">Controle técnico de inventário</p>
                  </div>
                </div>
                <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-900 transition-all shadow-sm"><X size={20} /></button>
              </div>

              <form onSubmit={activeTab === 'list' ? handleSaveEquipment : handleSaveFamily} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
                {activeTab === 'list' ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="md:col-span-2">
                        <Input
                          label="Nome do Ativo"
                          required
                          placeholder="Ex: Gerador Principal - Bloco A"
                          icon={<Tag size={16} />}
                          className="rounded-2xl py-4 font-bold border-slate-200"
                          value={eqFormData.name || ''}
                          onChange={e => setEqFormData({ ...eqFormData, name: e.target.value })}
                        />
                      </div>
                      <Input label="Modelo do Ativo" required icon={<Laptop size={16} />} className="rounded-2xl py-4 font-bold border-slate-200" value={eqFormData.model || ''} onChange={e => setEqFormData({ ...eqFormData, model: e.target.value })} />
                      <Input label="Número de Série (Serial)" required icon={<Hash size={16} />} className="rounded-2xl py-4 font-bold border-slate-200" value={eqFormData.serialNumber || ''} onChange={e => setEqFormData({ ...eqFormData, serialNumber: e.target.value })} />
                      <div className="w-full">
                        <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Família Técnica</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-xs font-bold  text-slate-900 focus:ring-4 focus:ring-primary-100 transition-all"
                          required
                          value={eqFormData.familyId || ''}
                          onChange={e => setEqFormData({ ...eqFormData, familyId: e.target.value })}
                        >
                          <option value="" disabled>Selecione a Família...</option>
                          {families.filter(f => f.active).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                        </select>
                      </div>
                      <div className="w-full">
                        <label className="text-[11px] font-medium text-slate-400 mb-1 block px-1">Cliente Proprietário</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 text-xs font-bold  text-slate-900 focus:ring-4 focus:ring-primary-100 transition-all"
                          required
                          value={eqFormData.customerId || ''}
                          onChange={e => setEqFormData({ ...eqFormData, customerId: e.target.value })}
                        >

                          <option value="" disabled>Vincular a um Cliente...</option>
                          {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}

                        </select>
                      </div>
                    </div>
                    <TextArea label="Ficha Técnica / Memorial Descritivo" rows={4} className="rounded-xl p-3 border-slate-200" value={eqFormData.description || ''} onChange={e => setEqFormData({ ...eqFormData, description: e.target.value })} />
                  </>
                ) : (
                  <div className="space-y-5">
                    <Input label="Nome da Categoria (Família)" required placeholder="Ex: Equipamentos de Redes" icon={<Layers size={16} />} className="rounded-2xl py-4 font-bold border-slate-200" value={familyFormData.name || ''} onChange={e => setFamilyFormData({ ...familyFormData, name: e.target.value })} />
                    <TextArea label="Escopo Técnico da Família" placeholder="Quais ativos pertencem a este grupo de processos?" rows={4} className="rounded-xl p-3 border-slate-200" value={familyFormData.description || ''} onChange={e => setFamilyFormData({ ...familyFormData, description: e.target.value })} />
                  </div>
                )}
              </form>

              <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                <Button variant="secondary" className="h-9 px-5 rounded-xl text-xs" onClick={closeModal}>Cancelar</Button>
                <Button onClick={activeTab === 'list' ? handleSaveEquipment : handleSaveFamily} className="h-9 px-6 rounded-xl text-xs font-bold bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f]">
                  <Save size={14} className="mr-2" /> {activeTab === 'list' ? 'Salvar Ativo' : 'Salvar Categoria'}
                </Button>
              </div>
            </div>
          </div>, document.body
        )
      }
    </div >
  );
};
