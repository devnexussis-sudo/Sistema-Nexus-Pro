
import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { createPortal } from 'react-dom';
import { safeCreatePortal } from '../../utils/portal';
import { Button } from '../ui/Button';
import { Input, TextArea } from '../ui/Input';
import {
  Plus, Box, Laptop, Search, Trash2, Edit2, X, Save,
  Power, PowerOff, Info, User, Tag, Hash, LayoutGrid,
  Layers, Settings2, MapPin, Filter, Calendar, ChevronLeft, ChevronRight, Sparkles
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { usePermissions } from '../../hooks/usePermissions';
import { supabase } from '../../lib/supabase';
import { getCurrentTenantId } from '../../lib/tenantContext';

import { Customer, Equipment, EquipmentFamily, OrderStatus } from '../../types';
import { StatusBadge } from '../ui/StatusBadge';
import { DataService } from '../../services/dataService';
import { EquipmentService, formatAssetCode } from '../../services/equipmentService';

const checkWarrantyStatus = (manufactureDate?: string, warrantyMonths?: number) => {
  if (!manufactureDate || !warrantyMonths) return null;
  const mDate = new Date(manufactureDate);
  // Using UTC or local? Simple date is fine, let's just add months
  const expiryDate = new Date(mDate);
  expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);
  const now = new Date();
  return expiryDate >= now; // true = Green, false = Red
};


interface EquipmentManagementProps {
  equipments: Equipment[];
  customers: Customer[];
  onUpdateEquipments: (equips: Equipment[]) => void;
  initialParams?: any;
}

export const EquipmentManagement: React.FC<EquipmentManagementProps> = ({
  equipments, customers, onUpdateEquipments, initialParams
}) => {
  const { t } = useI18n();
  const { canCreate, canEdit } = usePermissions();

  const [activeTab, setActiveTab] = useState<'list' | 'families'>('list');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalTab, setModalTab] = useState<'dados' | 'historico'>('dados');
  const [equipmentOrders, setEquipmentOrders] = useState<any[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  const [eqFormData, setEqFormData] = useState<Partial<Equipment>>({ active: true });
  const [clientSearch, setClientSearch] = useState('');
  const [isClientListOpen, setIsClientListOpen] = useState(false);
  const [familySearch, setFamilySearch] = useState('');
  const [isFamilyListOpen, setIsFamilyListOpen] = useState(false);

  useEffect(() => {
    if (initialParams?.customerId) {
      setEqFormData({
        active: true,
        customerId: initialParams.customerId
      });
      const cName = customers.find(c => c.id === initialParams.customerId)?.name || '';
      setClientSearch(cName);
      setIsModalOpen(true);
      setActiveTab('list');
    }
  }, [initialParams]);

  // 🔑 Backfill: Atribui códigos a ativos antigos sem código
  useEffect(() => {
    EquipmentService.backfillMissingCodes().catch(console.warn);
  }, []);


  const [families, setFamilies] = useState<EquipmentFamily[]>([]);

  useEffect(() => {
    async function loadFamilies() {
      try {
        const loaded = await EquipmentService.getEquipmentFamilies();
        setFamilies(loaded);
      } catch (err) {
        console.warn("Erro ao carregar famílias de ativos:", err);
      }
    }
    loadFamilies();
  }, []);



  useEffect(() => {
    localStorage.setItem('nexus_equipments_db', JSON.stringify(equipments));
  }, [equipments]);



  const [familyFormData, setFamilyFormData] = useState<Partial<EquipmentFamily>>({ active: true });



  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setEqFormData({ active: true });
    setFamilyFormData({ active: true });
    setModalTab('dados');
    setEquipmentOrders([]);
    setClientSearch('');
    setFamilySearch('');
  };

  const loadEquipmentHistory = async (equipmentId: string, serial: string) => {
    setLoadingOrders(true);
    const tenantId = getCurrentTenantId();
    if (!tenantId) return;

    try {
      // Busca OS onde o equipamento está vinculado (forma direta)
      const { data: directOrders } = await supabase
        .from('orders')
        .select('id, display_id, created_at, status, title, public_token')
        .eq('tenant_id', tenantId)
        .eq('equipment_serial', serial)
        .order('created_at', { ascending: false });

      // Busca OS via tabela de relacionamento
      const { data: linkedOrders } = await supabase
        .from('service_order_equipments')
        .select('order_id, orders(id, display_id, created_at, status, title, public_token)')
        .eq('tenant_id', tenantId)
        .eq('equipment_id', equipmentId);

      const allOrdersMap = new Map();
      
      (directOrders || []).forEach((o: any) => allOrdersMap.set(o.id, o));
      
      (linkedOrders || []).forEach((link: any) => {
        if (link.orders && !allOrdersMap.has(link.orders.id)) {
          allOrdersMap.set(link.orders.id, link.orders);
        }
      });

      const finalOrders = Array.from(allOrdersMap.values()).sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setEquipmentOrders(finalOrders);
    } catch (e) {
      console.error("Erro ao buscar histórico:", e);
    } finally {
      setLoadingOrders(false);
    }
  };

  useEffect(() => {
    if (isModalOpen && activeTab === 'list' && editingId && modalTab === 'historico') {
      const eq = equipments.find(e => e.id === editingId);
      if (eq) loadEquipmentHistory(eq.id, eq.serialNumber);
    }
  }, [isModalOpen, activeTab, editingId, modalTab]);

  const generateRandomSerial = () => {
    return Math.floor(100000 + Math.random() * 900000).toString();
  };

  const handleSaveEquipment = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!eqFormData.serialNumber || !eqFormData.serialNumber.trim()) {
      alert("Atenção: É obrigatório informar ou gerar um Número de Série para o ativo antes de salvar.");
      return;
    }

    if (!eqFormData.familyId) {
      alert("Atenção: É obrigatório selecionar a Família Técnica do ativo antes de salvar.");
      return;
    }

    if (!eqFormData.customerId) {
      alert("Atenção: É obrigatório selecionar o Cliente Proprietário do ativo antes de salvar.");
      return;
    }

    const selectedClient = customers.find(c => c.id === eqFormData.customerId);
    const selectedFamily = families.find(f => f.id === eqFormData.familyId);

    if (!selectedFamily) {
      alert("Atenção: Por favor, selecione uma Família Técnica válida da lista.");
      return;
    }

    if (!selectedClient) {
      alert("Atenção: Por favor, selecione um Cliente Proprietário válido da lista.");
      return;
    }

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



  const handleSaveFamily = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyFormData.name?.trim()) {
      alert("Atenção: É obrigatório informar o Nome da Categoria (Família).");
      return;
    }

    try {
      if (editingId) {
        const updatedFam = {
          ...families.find(f => f.id === editingId),
          ...familyFormData,
          name: familyFormData.name.trim()
        } as EquipmentFamily;
        const saved = await EquipmentService.saveEquipmentFamily(updatedFam);
        setFamilies(families.map(f => f.id === editingId ? saved : f));
      } else {
        const newFam = {
          ...familyFormData,
          id: `f-${Date.now()}`,
          name: familyFormData.name.trim(),
          description: familyFormData.description?.trim() || '',
          active: true
        } as EquipmentFamily;
        const saved = await EquipmentService.saveEquipmentFamily(newFam);
        setFamilies([saved, ...families]);
      }
      closeModal();
    } catch (err: any) {
      console.error("Erro ao salvar família de equipamentos:", err);
      alert(`Erro ao salvar categoria: ${err.message || 'Falha na conexão'}`);
    }
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

  const filteredClients = customers.filter(c => {
    if (!clientSearch.trim()) return true;
    const q = clientSearch.toLowerCase();
    const qRaw = q.replace(/[.\-\/]/g, ''); // Remove pontuação para comparar CPF/CNPJ
    const nameMatch = c.name.toLowerCase().includes(q);
    const docRaw = ((c as any).document || (c as any).cpf || (c as any).cnpj || '').replace(/[.\-\/]/g, '');
    const docMatch = docRaw && docRaw.includes(qRaw);
    return nameMatch || docMatch;
  });

  const filteredFamilies = families.filter(f => f.active && f.name.toLowerCase().includes(familySearch.toLowerCase()));

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
              className="w-full h-10 bg-white border border-slate-300 rounded-xl pl-9 pr-4 text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
            <div className="flex items-center bg-white border border-slate-300 rounded-xl pl-2 pr-1 h-10 shadow-sm focus-within:border-[#1c2d4f] focus-within:ring-2 focus-within:ring-[#1c2d4f]/10">
              <Filter size={12} className="text-slate-400 mr-2" />
              <select
                className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full cursor-pointer h-full"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Todos Status</option>
                <option value="ACTIVE">Ativos</option>
                <option value="INACTIVE">Inativos</option>
              </select>
            </div>

              <Button
                onClick={(e) => {
                  if (!canCreate('equipments')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para esta ação.'); return; }
                  setIsModalOpen(true);
                }}
                className={`hidden md:flex h-10 px-4 gap-1.5 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] shadow-lg shadow-[#1c2d4f]/20 text-[11px] rounded-xl font-bold whitespace-nowrap text-white ${!canCreate('equipments') ? 'opacity-50 !cursor-not-allowed' : ''}`}
              >
                <Plus size={16} /> {activeTab === 'list' ? 'Novo' : 'Nova Categoria'}
              </Button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">

        {/* 💻 DESKTOP TABLE VIEW */}
        <div className="hidden md:block flex-1 overflow-auto p-0 custom-scrollbar">
          {activeTab === 'list' ? (
            <table className="w-full border-separate border-spacing-y-1">
              <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10">
                <tr className="text-[12px] font-semibold text-slate-600 tracking-tight text-center font-poppins">
                  <th className="px-3 py-1 text-center hidden md:table-cell w-28">código</th>
                  <th className="px-3 py-1 text-center">equipamento / modelo</th>
                  <th className="px-3 py-1 text-center whitespace-nowrap hidden md:table-cell">nº de série</th>
                  <th className="px-3 py-1 text-center hidden md:table-cell">proprietário</th>
                  <th className="px-3 py-1 text-center hidden lg:table-cell">garantia</th>
                  <th className="px-3 py-1 text-right pr-6">{t.common.actions}</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((e: any) => (
                  <tr key={e.id} className="bg-white hover:bg-primary-50/40 transition-all group shadow-sm hover:shadow-md cursor-pointer">
                    <td className="px-3 py-1 rounded-l-[1.5rem] border border-slate-100 border-r-0 text-center hidden md:table-cell">
                      <span className="font-mono text-[11px] font-bold text-[#1c2d4f] bg-[#1c2d4f]/8 px-2.5 py-1 rounded-lg tracking-widest border border-[#1c2d4f]/15">
                        {formatAssetCode(e.assetCode)}
                      </span>
                    </td>
                    <td className="px-3 py-1 md:rounded-none rounded-l-[1.5rem] border border-slate-100 border-r-0 md:border-y md:border-x-0 font-bold text-xs max-w-[200px]">
                      <div className="flex items-center justify-center md:justify-start gap-3">
                        <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-primary-400 shadow-inner group-hover:bg-primary-600 group-hover:text-white transition-all shrink-0">
                          <Box size={18} />
                        </div>
                        <div className="truncate text-left">
                          <p className="text-slate-900 tracking-tight truncate text-[13px] font-medium">{e.model}</p>
                          <p className="text-[11px] text-primary-400 mt-1 truncate">{e.familyName}</p>
                          <div className="md:hidden mt-1 flex flex-col gap-0.5">
                            <span className="text-[10px] text-slate-500 font-mono">SN: {e.serialNumber}</span>
                            <span className="text-[10px] text-slate-600 truncate">{customers.find(c => c.id === e.customerId)?.name || e.customerName || 'Não vinculado'}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-1 border-y border-slate-100 text-center font-mono text-[12px] text-slate-500 tracking-tighter whitespace-nowrap hidden md:table-cell">#{e.serialNumber}</td>
                    <td className="px-3 py-1 border-y border-slate-100 text-center text-[12px] text-slate-600 tracking-tight truncate max-w-[150px] hidden md:table-cell">
                      {customers.find(c => c.id === e.customerId)?.name || e.customerName || 'Não vinculado'}
                    </td>

                    <td className="px-3 py-1 border-y border-slate-100 text-center hidden lg:table-cell">
                      {e.manufactureDate && e.warrantyMonths ? (
                        <div className={`text-[9px] font-bold px-2.5 py-1 rounded-full w-max mx-auto border ${checkWarrantyStatus(e.manufactureDate, e.warrantyMonths) ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-rose-50 text-rose-600 border-rose-200'}`}>
                          {checkWarrantyStatus(e.manufactureDate, e.warrantyMonths) ? 'Em Garantia' : 'Fora de Garantia'}
                        </div>
                      ) : (
                        <div className="text-[9px] font-bold px-2.5 py-1 rounded-full w-max mx-auto border bg-slate-50 text-slate-400 border-slate-200">
                          Sem Info.
                        </div>
                      )}
                    </td>

                    <td className="px-3 py-1 rounded-r-[1.5rem] border border-slate-100 border-l-0 text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                          <>
                            <button onClick={(evt) => {
                              if (!canEdit('equipments')) { evt.preventDefault(); evt.stopPropagation(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                              evt.stopPropagation(); toggleEquipmentStatus(e);
                            }} className={`p-2.5 rounded-lg shadow-sm border border-transparent transition-all active:scale-95 ${e.active ? 'bg-slate-50 text-amber-500 hover:bg-white hover:border-amber-100 hover:text-amber-600' : 'bg-slate-50 text-emerald-500 hover:bg-white hover:border-emerald-100 hover:text-emerald-600'} ${!canEdit('equipments') ? 'opacity-50 !cursor-not-allowed' : ''}`}>
                              {e.active ? <PowerOff size={16} /> : <Power size={16} />}
                            </button>
                            <button onClick={(evt) => {
                              if (!canEdit('equipments')) { evt.preventDefault(); evt.stopPropagation(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                              evt.stopPropagation();
                              setEqFormData(e);
                              setEditingId(e.id);
                              const cName = customers.find(c => c.id === e.customerId)?.name || '';
                              setClientSearch(cName);
                              const fName = families.find(f => f.id === e.familyId)?.name || '';
                              setFamilySearch(fName);
                              setIsModalOpen(true);
                            }} className={`p-2.5 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-95 ${!canEdit('equipments') ? 'opacity-50 !cursor-not-allowed' : ''}`} title="Editar"><Edit2 size={16} /></button>
                          </>
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
                  <th className="px-3 py-1">nome da família</th>
                  <th className="px-3 py-1 hidden md:table-cell">descrição técnica de escopo</th>
                  <th className="px-3 py-1 text-center">status</th>
                  <th className="px-3 py-1 text-right pr-6">ações</th>
                </tr>
              </thead>
              <tbody>
                {paginatedItems.map((f: any) => (
                  <tr key={f.id} className="bg-white hover:bg-primary-50/30 transition-all group shadow-sm cursor-pointer">
                    <td className="px-3 py-1 rounded-l-[1.5rem] border border-slate-100 border-r-0 font-bold text-xs max-w-[200px]">
                      <div className="flex items-center gap-3">
                        <div className="p-2.5 rounded-xl bg-primary-50 text-primary-600 shadow-inner group-hover:bg-primary-600 group-hover:text-white transition-all shrink-0">
                          <Layers size={18} />
                        </div>
                        <p className="text-slate-900 tracking-tight truncate text-[13px] font-medium">{f.name}</p>
                      </div>
                    </td>
                    <td className="px-3 py-1 border-y border-slate-100 text-[11px] text-slate-500 max-w-sm truncate hidden md:table-cell">{f.description}</td>
                    <td className="px-3 py-1 border-y border-slate-100 text-center">
                      <span className={`px-4 py-1.5 rounded-full text-[9px] font-bold   border ${f.active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                        {f.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-3 py-1 rounded-r-[1.5rem] border border-slate-100 border-l-0 text-right pr-4">
                      <div className="flex items-center justify-end gap-1.5">
                          <>
                            <button onClick={async (evt) => {
                              if (!canEdit('equipments')) { evt.preventDefault(); evt.stopPropagation(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                              const updatedFam = { ...f, active: !f.active };
                              await EquipmentService.saveEquipmentFamily(updatedFam);
                              setFamilies(families.map(item => item.id === f.id ? updatedFam : item));
                            }} className={`p-2.5 rounded-lg shadow-sm border border-transparent transition-all active:scale-95 ${f.active ? 'bg-slate-50 text-amber-500 hover:bg-amber-50' : 'bg-slate-50 text-emerald-500 hover:bg-emerald-50'} ${!canEdit('equipments') ? 'opacity-50 !cursor-not-allowed' : ''}`}>
                              {f.active ? <PowerOff size={16} /> : <Power size={16} />}
                            </button>
                            <button onClick={(evt) => {
                              if (!canEdit('equipments')) { evt.preventDefault(); evt.stopPropagation(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                              setFamilyFormData(f); setEditingId(f.id); setIsModalOpen(true);
                            }} className={`p-2.5 bg-slate-50 text-slate-400 hover:text-primary-600 hover:bg-white rounded-xl shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-95 ${!canEdit('equipments') ? 'opacity-50 !cursor-not-allowed' : ''}`}><Edit2 size={16} /></button>
                          </>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 📱 MOBILE CARDS VIEW */}
        <div className="md:hidden flex-1 overflow-auto custom-scrollbar bg-slate-50/50 p-2 space-y-2 pb-28">
          {paginatedItems.length > 0 ? (
            paginatedItems.map((item: any) => {
              if (activeTab === 'list') {
                return (
                  <div 
                    key={item.id}
                    onClick={(e) => {
                      if (canEdit('equipments')) {
                        setEqFormData(item);
                        setEditingId(item.id);
                        const cName = customers.find(c => c.id === item.customerId)?.name || '';
                        setClientSearch(cName);
                        const fName = families.find(f => f.id === item.familyId)?.name || '';
                        setFamilySearch(fName);
                        setIsModalOpen(true);
                      }
                    }}
                    className={`bg-white p-3 rounded-2xl shadow-sm border border-slate-200/60 active:scale-[0.98] transition-transform flex flex-col gap-2 ${!item.active ? 'opacity-60' : ''}`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-3">
                        <div className="w-10 h-10 bg-primary-50 text-primary-600 rounded-xl flex items-center justify-center shrink-0 border border-primary-100">
                          <Box size={18} />
                        </div>
                        <div>
                          <h3 className="text-sm font-bold text-slate-800 line-clamp-1">{item.model || item.name}</h3>
                          <p className="text-[11px] text-slate-500 font-mono mt-0.5">SN: {item.serialNumber}</p>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-100">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Proprietário</span>
                        <span className="text-xs text-slate-700 truncate">{customers.find(c => c.id === item.customerId)?.name || item.customerName || 'Não vinculado'}</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-[9px] font-bold text-slate-400 uppercase">Garantia</span>
                        <span className="text-xs text-slate-700 truncate">
                          {item.manufactureDate && item.warrantyMonths ? (checkWarrantyStatus(item.manufactureDate, item.warrantyMonths) ? 'Sim' : 'Não') : '---'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div 
                    key={item.id}
                    onClick={(e) => {
                      if (canEdit('equipments')) {
                        setFamilyFormData(item); setEditingId(item.id); setIsModalOpen(true);
                      }
                    }}
                    className={`bg-white p-3 rounded-2xl shadow-sm border border-slate-200/60 active:scale-[0.98] transition-transform flex flex-col gap-2 ${!item.active ? 'opacity-60' : ''}`}
                  >
                     <div className="flex items-start justify-between gap-2">
                        <div className="flex gap-3">
                          <div className="w-10 h-10 bg-slate-50 text-slate-600 rounded-xl flex items-center justify-center shrink-0 border border-slate-200">
                            <Layers size={18} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-slate-800 line-clamp-1">{item.name}</h3>
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-1">{item.description}</p>
                          </div>
                        </div>
                     </div>
                  </div>
                );
              }
            })
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Search size={32} className="text-slate-300 mb-3" />
              <p className="text-xs font-medium">Nenhum registro localizado</p>
            </div>
          )}
        </div>

        {/* MOBILE FAB (Floating Action Button) */}
        {canCreate('equipments') && (
          <button
            onClick={() => setIsModalOpen(true)}
            className="md:hidden fixed bottom-24 right-4 w-14 h-14 bg-gradient-to-tr from-[#1c2d4f] to-[#253a66] text-white rounded-full shadow-[0_8px_30px_rgba(28,45,79,0.4)] flex items-center justify-center z-50 active:scale-90 transition-transform"
          >
            <Plus size={24} />
          </button>
        )}
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredItems.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
        />
      </div>

      {
        isModalOpen && safeCreatePortal(
          <div className="fixed inset-0 z-[1000] flex items-end md:items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 md:p-8 animate-in fade-in duration-300">
            <div className="bg-white md:rounded-2xl w-full max-w-6xl h-full md:h-[92vh] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-8 md:slide-in-from-bottom-0 md:zoom-in-95 duration-300">

              {/* HEADER — padrão OS */}
              <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                    {activeTab === 'list' ? <Box size={18} /> : <Layers size={18} />}
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                      {activeTab === 'list' ? (editingId ? 'Editar Ativo' : 'Novo Ativo') : (editingId ? 'Editar Categoria' : 'Nova Categoria')}
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] font-bold text-slate-400">Nexus Inventário • controle técnico</p>
                      {editingId && eqFormData.assetCode && (
                        <span className="font-mono text-[10px] font-bold text-[#1c2d4f] bg-[#1c2d4f]/8 px-2 py-0.5 rounded border border-[#1c2d4f]/15 tracking-widest">
                          {formatAssetCode(eqFormData.assetCode)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={closeModal} className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50">
                  <X size={20} />
                </button>
              </div>

              {/* BODY WITH SIDEBAR */}
              <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                {activeTab === 'list' && (
                  <div className="w-full md:w-64 bg-slate-50/50 border-b md:border-b-0 md:border-r border-slate-200 p-4 md:p-6 flex flex-row md:flex-col gap-2 shrink-0 overflow-x-auto">
                    <button type="button" onClick={() => setModalTab('dados')}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                        modalTab === 'dados' ? 'bg-white text-[#1c2d4f] shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                      }`}>
                      <Box size={16} /> Dados do Ativo
                    </button>
                    {editingId && (
                      <button type="button" onClick={() => setModalTab('historico')}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                          modalTab === 'historico' ? 'bg-white text-[#1c2d4f] shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                        }`}>
                        <Calendar size={16} /> Histórico de OS
                        {equipmentOrders.length > 0 && (
                          <span className="ml-auto bg-[#1c2d4f] text-white text-[9px] px-1.5 py-0.5 rounded-full leading-none">{equipmentOrders.length}</span>
                        )}
                      </button>
                    )}
                  </div>
                )}

                {/* CONTENT AREA */}
                <form
                  onSubmit={activeTab === 'list' && modalTab === 'dados' ? handleSaveEquipment : handleSaveFamily}
                  className="flex-1 overflow-y-auto custom-scrollbar bg-white"
                >
                  <div className="p-8 space-y-6">

                  {/* ── ABA: DADOS ── */}
                  {(activeTab === 'list' && (modalTab === 'dados' || !editingId)) && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 p-8 space-y-6">
                      <h3 className="text-sm font-bold text-slate-900 border-l-4 border-[#1c2d4f] pl-3">identificação do ativo</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="md:col-span-2">
                          <Input
                            label="Nome do Ativo e Local de Instalação"
                            required
                            placeholder="Ex: Gerador Principal - Bloco A, 2º Andar"
                            icon={<Tag size={16} />}
                            className="rounded-xl py-2.5 text-xs font-bold border border-slate-300 bg-white text-slate-900 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm"
                            value={eqFormData.name || ''}
                            onChange={e => setEqFormData({ ...eqFormData, name: e.target.value })}
                          />
                        </div>
                        <Input label="Modelo" required icon={<Laptop size={16} />} className="rounded-xl py-2.5 text-xs font-bold border border-slate-300 bg-white text-slate-900 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm" value={eqFormData.model || ''} onChange={e => setEqFormData({ ...eqFormData, model: e.target.value })} />
                        
                        <div className="w-full relative">
                          <label className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center justify-between ml-1">
                            <span>Número de Série (Serial) <span className="text-rose-500 font-bold">*</span></span>
                            {!eqFormData.serialNumber?.trim() && (
                              <span className="text-[9px] font-bold text-rose-500 uppercase bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">Obrigatório</span>
                            )}
                          </label>
                          <div className="flex items-center gap-2">
                            <div className="relative flex-1">
                              <Hash className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                              <input
                                type="text"
                                required
                                placeholder="Ex: 849204"
                                value={eqFormData.serialNumber || ''}
                                onChange={e => setEqFormData({ ...eqFormData, serialNumber: e.target.value })}
                                className={`w-full h-11 pl-10 pr-4 bg-white border rounded-xl text-xs font-bold font-mono text-slate-900 outline-none focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm transition-all ${!eqFormData.serialNumber?.trim() ? 'border-amber-400' : 'border-slate-300'}`}
                              />
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                const generated = generateRandomSerial();
                                setEqFormData({ ...eqFormData, serialNumber: generated });
                              }}
                              className="h-11 px-3.5 bg-primary-50/70 hover:bg-primary-100/80 border border-primary-200/80 text-primary-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-sm active:scale-95 shrink-0"
                              title="Gerar número de série automático"
                            >
                              <Sparkles size={15} className="text-primary-600" />
                              <span className="hidden sm:inline">Gerar Serial</span>
                            </button>
                          </div>
                        </div>
                        
                        <Input type="date" label="Data de Fabricação" icon={<Calendar size={16} />} className="rounded-xl py-2.5 text-xs font-bold border border-slate-300 bg-white text-slate-900 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm" value={eqFormData.manufactureDate || ''} onChange={e => setEqFormData({ ...eqFormData, manufactureDate: e.target.value })} />
                        <Input type="number" label="Garantia (Meses)" icon={<Calendar size={16} />} className="rounded-xl py-2.5 text-xs font-bold border border-slate-300 bg-white text-slate-900 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm" value={eqFormData.warrantyMonths || ''} onChange={e => setEqFormData({ ...eqFormData, warrantyMonths: e.target.value ? parseInt(e.target.value) : undefined })} />

                        {eqFormData.manufactureDate && eqFormData.warrantyMonths ? (
                          <div className="md:col-span-2">
                             <div className={`p-3 rounded-xl border flex items-center justify-center gap-2 text-xs font-bold shadow-sm ${checkWarrantyStatus(eqFormData.manufactureDate, eqFormData.warrantyMonths) ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                               <Info size={16} />
                               {checkWarrantyStatus(eqFormData.manufactureDate, eqFormData.warrantyMonths) ? 'Equipamento em Garantia' : 'Equipamento Fora de Garantia'}
                             </div>
                          </div>
                        ) : null}

                        {/* Código do Ativo — somente leitura */}
                        <div className="w-full">
                          <label className="text-[11px] font-bold text-slate-700 mb-1.5 block ml-1">Código do Ativo</label>
                          <div className="flex items-center gap-3 bg-slate-50 border border-slate-300 rounded-xl px-4 py-2.5">
                            <Hash size={15} className="text-slate-400 shrink-0" />
                            <span className="font-mono text-sm font-bold text-[#1c2d4f] tracking-[0.2em] flex-1">
                              {eqFormData.assetCode ?? '— gerado ao salvar —'}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest shrink-0">somente leitura</span>
                          </div>
                        </div>

                        <div className="w-full relative">
                          <label className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center justify-between ml-1">
                            <span>Família Técnica <span className="text-rose-500 font-bold">*</span></span>
                            {!eqFormData.familyId && (
                              <span className="text-[9px] font-bold text-rose-500 uppercase bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">Obrigatório</span>
                            )}
                          </label>
                          <div className="relative">
                            <Layers className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                              type="text"
                              required={!eqFormData.familyId}
                              placeholder="Buscar família técnica..."
                              value={familySearch}
                              onChange={(e) => {
                                setFamilySearch(e.target.value);
                                setEqFormData({ ...eqFormData, familyId: undefined });
                                setIsFamilyListOpen(true);
                              }}
                              onFocus={() => setIsFamilyListOpen(true)}
                              onBlur={() => setTimeout(() => setIsFamilyListOpen(false), 200)}
                              className={`w-full h-11 pl-10 pr-4 bg-white border rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm transition-all ${!eqFormData.familyId ? 'border-amber-400' : 'border-slate-300'}`}
                            />
                            {eqFormData.familyId && (
                              <button 
                                type="button" 
                                onClick={() => { setFamilySearch(''); setEqFormData({ ...eqFormData, familyId: undefined }); setIsFamilyListOpen(true); }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>

                          {isFamilyListOpen && (
                            <div className="absolute z-[170] top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2">
                              {filteredFamilies.length > 0 ? filteredFamilies.map(f => (
                                <button
                                  key={f.id}
                                  type="button"
                                  onClick={() => {
                                    setEqFormData({ ...eqFormData, familyId: f.id });
                                    setFamilySearch(f.name);
                                    setIsFamilyListOpen(false);
                                  }}
                                  className="w-full text-left px-5 py-3 hover:bg-slate-50 flex justify-between items-center border-b border-slate-100 last:border-0 transition-colors group"
                                >
                                  <div>
                                    <p className="text-xs font-bold text-slate-800 group-hover:text-[#1c2d4f] transition-colors">{f.name}</p>
                                    <p className="text-[10px] text-slate-400 font-medium truncate max-w-sm mt-0.5">{f.description}</p>
                                  </div>
                                  <ChevronRight size={16} className="text-slate-300 group-hover:text-[#1c2d4f] group-hover:translate-x-1 transition-all" />
                                </button>
                              )) : (
                                <div className="p-4 text-center text-slate-400 text-xs font-medium">Nenhuma família localizada</div>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="w-full relative">
                          <label className="text-[11px] font-bold text-slate-700 mb-1.5 flex items-center justify-between ml-1">
                            <span>Cliente Proprietário <span className="text-rose-500 font-bold">*</span></span>
                            {!eqFormData.customerId && (
                              <span className="text-[9px] font-bold text-rose-500 uppercase bg-rose-50 px-1.5 py-0.5 rounded border border-rose-100">Obrigatório</span>
                            )}
                          </label>
                          <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input
                              type="text"
                              required={!eqFormData.customerId}
                              placeholder="Buscar cliente por nome, CPF ou CNPJ..."
                              value={clientSearch}
                              onChange={(e) => {
                                setClientSearch(e.target.value);
                                setEqFormData({ ...eqFormData, customerId: undefined });
                                setIsClientListOpen(true);
                              }}
                              onFocus={() => setIsClientListOpen(true)}
                              onBlur={() => setTimeout(() => setIsClientListOpen(false), 200)}
                              className={`w-full h-11 pl-10 pr-4 bg-white border rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm transition-all ${!eqFormData.customerId ? 'border-amber-400' : 'border-slate-300'}`}
                            />
                            {eqFormData.customerId && (
                              <button 
                                type="button" 
                                onClick={() => { setClientSearch(''); setEqFormData({ ...eqFormData, customerId: undefined }); setIsClientListOpen(true); }}
                                className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-rose-500 transition-colors"
                              >
                                <X size={14} />
                              </button>
                            )}
                          </div>

                          {isClientListOpen && clientSearch && (
                            <div className="absolute z-[170] top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2">
                              {filteredClients.length > 0 ? filteredClients.map(c => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    setEqFormData({ ...eqFormData, customerId: c.id });
                                    setClientSearch(c.name);
                                    setIsClientListOpen(false);
                                  }}
                                  className="w-full text-left px-5 py-3 hover:bg-slate-50 flex justify-between items-center border-b border-slate-100 last:border-0 transition-colors group"
                                >
                                  <div>
                                    <p className="text-xs font-bold text-slate-800 group-hover:text-[#1c2d4f] transition-colors">{c.name}</p>
                                    <p className="text-[10px] text-slate-400 font-medium truncate max-w-sm mt-0.5">
                                      {((c as any).document || (c as any).cpf || (c as any).cnpj) && <span className="font-mono mr-2">{((c as any).document || (c as any).cpf || (c as any).cnpj)}</span>}
                                      {c.address}
                                    </p>
                                  </div>
                                  <ChevronRight size={16} className="text-slate-300 group-hover:text-[#1c2d4f] group-hover:translate-x-1 transition-all" />
                                </button>
                              )) : (
                                <div className="p-4 text-center text-slate-400 text-xs font-medium">Nenhum cliente localizado</div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                      <TextArea label="Ficha Técnica / Memorial Descritivo" rows={3} className="rounded-xl p-3 border border-slate-300 bg-white text-slate-900 font-bold focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm" value={eqFormData.description || ''} onChange={e => setEqFormData({ ...eqFormData, description: e.target.value })} />
                    </div>
                  )}

                  {/* ── ABA: HISTÓRICO ── */}
                  {activeTab === 'list' && editingId && modalTab === 'historico' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden">
                      <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Ordens de Serviço Vinculadas</span>
                        {equipmentOrders.length > 0 && (
                          <span className="text-[10px] font-bold text-slate-400">{equipmentOrders.length} registros</span>
                        )}
                      </div>

                      {loadingOrders ? (
                        <div className="py-12 text-center text-slate-400 text-xs font-medium">
                          <div className="w-6 h-6 border-2 border-slate-200 border-t-[#1c2d4f] rounded-full animate-spin mx-auto mb-3" />
                          Buscando histórico...
                        </div>
                      ) : equipmentOrders.length === 0 ? (
                        <div className="py-16 text-center">
                          <Box size={32} className="mx-auto text-slate-200 mb-3" />
                          <p className="text-xs font-semibold text-slate-400">Nenhuma Ordem de Serviço encontrada</p>
                          <p className="text-[10px] text-slate-300 mt-1">Este ativo ainda não possui histórico de manutenções.</p>
                        </div>
                      ) : (
                        <table className="w-full text-left">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-100">
                              <th className="px-6 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Protocolo</th>
                              <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Título</th>
                              <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-center">{t.common.status}</th>
                              <th className="px-4 py-2.5 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Data</th>
                              <th className="px-4 py-2.5"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-50">
                            {equipmentOrders.map(order => (
                              <tr key={order.id} 
                                  onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      window.open(`/#/order/view/${order.public_token || order.id}`, '_blank');
                                  }}
                                  className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                              >
                                <td className="px-6 py-3">
                                  <span className="font-mono text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">#{order.display_id}</span>
                                </td>
                                <td className="px-4 py-3 max-w-[220px]">
                                  <p className="text-xs font-semibold text-slate-800 truncate">{order.title}</p>
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <StatusBadge status={order.status} />
                                </td>
                                <td className="px-4 py-3">
                                  <p className="text-[11px] text-slate-500">{new Date(order.created_at).toLocaleDateString('pt-BR')}</p>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <button
                                    type="button"
                                    className="w-8 h-8 flex items-center justify-center bg-slate-50 text-slate-400 rounded-lg group-hover:bg-[#1c2d4f] group-hover:text-white transition-colors shadow-sm ml-auto"
                                    title="Abrir Link Público da OS"
                                  >
                                    <ChevronLeft size={14} className="rotate-180" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  )}

                  {/* ── FAMÍLIAS ── */}
                  {activeTab === 'families' && (
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 p-8 space-y-5">
                      <h3 className="text-sm font-bold text-slate-900 border-l-4 border-[#1c2d4f] pl-3">categoria técnica</h3>
                      <Input label="Nome da Categoria (Família)" required placeholder="Ex: Equipamentos de Redes" icon={<Layers size={16} />} className="rounded-xl py-2.5 text-xs font-bold border border-slate-300 bg-white text-slate-900 focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm" value={familyFormData.name || ''} onChange={e => setFamilyFormData({ ...familyFormData, name: e.target.value })} />
                      <TextArea label="Escopo Técnico da Família" placeholder="Quais ativos pertencem a este grupo de processos?" rows={4} className="rounded-xl p-3 border border-slate-300 bg-white text-slate-900 font-bold focus:border-[#1c2d4f] focus:ring-2 focus:ring-[#1c2d4f]/10 shadow-sm" value={familyFormData.description || ''} onChange={e => setFamilyFormData({ ...familyFormData, description: e.target.value })} />
                    </div>
                  )}

                </div>
              </form>
              </div>

              {/* FOOTER */}
              <div className="px-8 py-5 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                <button type="button" onClick={closeModal} className="h-9 px-5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                  Cancelar
                </button>
                {(activeTab !== 'list' || modalTab === 'dados') && (
                  <Button
                    onClick={activeTab === 'list' ? handleSaveEquipment : handleSaveFamily}
                    className="h-9 px-6 rounded-xl text-xs font-bold bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] text-white"
                  >
                    <Save size={14} className="mr-2" />
                    {activeTab === 'list' ? 'Salvar Ativo' : 'Salvar Categoria'}
                  </Button>
                )}
              </div>

            </div>
          </div>, document.body
        )
      }
    </div >
  );
};
