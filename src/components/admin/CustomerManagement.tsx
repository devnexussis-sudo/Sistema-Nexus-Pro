
import React, { useState, useEffect } from 'react';
import { useI18n } from '../../i18n';
import { useDialog } from '../../contexts/DialogContext';
import { createPortal } from 'react-dom';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Search, Plus, Building2, User, MapPin, Phone, Mail,
  Trash2, Edit2, X, Save, Power, PowerOff, Info, Box,
  ChevronDown, ChevronUp, Laptop, Hash, Filter, Calendar, ChevronLeft
} from 'lucide-react';
import { Pagination } from '../ui/Pagination';

import { Customer, Equipment } from '../../types';
import { DataService } from '../../services/dataService';
import { EquipmentService } from '../../services/equipmentService';

interface LinkedEquipment {
  id: string;
  model: string;
  serialNumber: string;
  familyName: string;
  active: boolean;
}



interface CustomerManagementProps {
  customers: Customer[];
  equipments: Equipment[];
  onUpdateCustomers: (customers: Customer[]) => void;
  onSwitchView?: (view: any, params?: any) => void;
}


export const CustomerManagement: React.FC<CustomerManagementProps> = ({
  customers, equipments, onUpdateCustomers, onSwitchView
}) => {
    const { t } = useI18n();
  const { showAlert, showConfirm } = useDialog();


  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalTab, setModalTab] = useState<'dados' | 'ativos'>('dados');
  const [showLinkAsset, setShowLinkAsset] = useState(false);
  const [linkingAsset, setLinkingAsset] = useState(false);
  const [assetSearch, setAssetSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  const [mockEquipments, setMockEquipments] = useState<Record<string, LinkedEquipment[]>>({});

  useEffect(() => {
    const grouped: Record<string, LinkedEquipment[]> = {};
    equipments.forEach((eq: any) => {
      if (!grouped[eq.customerId]) grouped[eq.customerId] = [];
      grouped[eq.customerId].push(eq);
    });
    setMockEquipments(grouped);
  }, [equipments]);


  const [loadingZip, setLoadingZip] = useState(false);

  // Máscaras de formatação
  const formatCPF = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
      .substring(0, 14);
  };

  const formatCNPJ = (value: string) => {
    return value
      .replace(/\D/g, '')
      .replace(/(\d{2})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1/$2')
      .replace(/(\d{4})(\d{1,2})$/, '$1-$2')
      .substring(0, 18);
  };

  const formatPhone = (value: string) => {
    const cleaned = value.replace(/\D/g, '');
    if (cleaned.length <= 10) {
      return cleaned
        .replace(/(\d{2})(\d)/, '($1) $2')
        .replace(/(\d{4})(\d)/, '$1-$2')
        .substring(0, 14);
    }
    return cleaned
      .replace(/(\d{2})(\d)/, '($1) $2')
      .replace(/(\d{5})(\d)/, '$1-$2')
      .substring(0, 15);
  };
  const [formData, setFormData] = useState<Partial<Customer>>({
    type: 'PJ',
    state: '',
    city: '',
    address: '',
    active: true
  });

  const [documentDuplicate, setDocumentDuplicate] = useState<string | null>(null);

  // Validação em tempo real de documento duplicado
  useEffect(() => {
    const cleanDocument = formData.document?.replace(/\D/g, '') || '';
    if (cleanDocument.length >= 11) { // CPF tem 11 dígitos, CNPJ tem 14
      const duplicate = customers.find(c =>
        c.id !== editingId &&
        c.active &&
        c.document?.replace(/\D/g, '') === cleanDocument
      );
      setDocumentDuplicate(duplicate ? duplicate.name : null);
    } else {
      setDocumentDuplicate(null);
    }
  }, [formData.document, customers, editingId]);

  const fetchCoordinates = async (address: string, city: string, state: string, currentLat?: number, currentLng?: number) => {
    if (currentLat && currentLng) return { lat: currentLat, lng: currentLng };
    if (!address || !city || !state) return null;

    try {
      const query = encodeURIComponent(`${address}, ${city}, ${state}, Brasil`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`, {
        headers: { 'Accept-Language': 'pt-BR' }
      });
      const data = await res.json();
      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon)
        };
      }
    } catch (err) {
      console.error("Erro geocoding nominatim", err);
    }
    return null;
  }

  const handleZipBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const zip = e.target.value.replace(/\D/g, '');
    if (zip.length === 8) {
      setLoadingZip(true);
      try {
        let addressData: any = null;
        try {
          const response = await fetch(`https://brasilapi.com.br/api/cep/v2/${zip}`);
          const data = await response.json();
          if (!data.errors) {
            addressData = {
              zip: data.cep,
              state: data.state,
              city: data.city,
              address: data.street,
              neighborhood: data.neighborhood,
              initialLat: data.location?.coordinates?.latitude ? parseFloat(data.location.coordinates.latitude) : undefined,
              initialLng: data.location?.coordinates?.longitude ? parseFloat(data.location.coordinates.longitude) : undefined,
            };
          }
        } catch (error) {
          console.error("Erro na BrasilAPI, tentando ViaCEP...");
        }

        if (!addressData) {
          const fallbackResponse = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
          const fallbackData = await fallbackResponse.json();
          if (!fallbackData.erro) {
            addressData = {
              zip: fallbackData.cep,
              state: fallbackData.uf,
              city: fallbackData.localidade,
              address: fallbackData.logradouro,
              neighborhood: fallbackData.bairro
            }
          }
        }

        if (addressData) {
          const coords = await fetchCoordinates(addressData.address, addressData.city, addressData.state, addressData.initialLat, addressData.initialLng);

          setFormData(prev => ({
            ...prev,
            zip: addressData.zip || prev.zip,
            state: addressData.state || prev.state,
            city: addressData.city || prev.city,
            address: addressData.address || prev.address,
            neighborhood: addressData.neighborhood || prev.neighborhood,
            latitude: coords?.lat,
            longitude: coords?.lng
          }));
        }

      } catch (error) {
        console.error("Erro geral na busca de CEP", error);
      } finally {
        setLoadingZip(false);
      }
    }
  };


  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (errorMessage) {
      const timer = setTimeout(() => setErrorMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    try {
      // Validação de documento duplicado
      const cleanDocument = formData.document?.replace(/\D/g, '') || '';
      const duplicateCustomer = customers.find(c =>
        c.id !== editingId &&
        c.active &&
        c.document?.replace(/\D/g, '') === cleanDocument
      );

      if (duplicateCustomer && cleanDocument) {
        setErrorMessage(`${formData.type === 'PJ' ? 'CNPJ' : 'CPF'} já cadastrado para: ${duplicateCustomer.name}`);
        return;
      }

      if (editingId) {
        const updatedCustomer = { ...formData, id: editingId } as Customer;
        await DataService.updateCustomer(updatedCustomer);
        onUpdateCustomers(customers.map(c => c.id === editingId ? updatedCustomer : c));
      } else {
        const newId = `c-${Date.now()}`;
        const newCustomer = { ...formData, id: newId, active: true } as Customer;
        await DataService.createCustomer(newCustomer);
        onUpdateCustomers([newCustomer, ...customers]);
      }
      closeModal();
    } catch (error: any) {
      console.error("Erro detalhado:", error);

      // Tratamento específico para erro de constraint unique do Supabase
      if (error.message?.includes('duplicate key') || error.message?.includes('unique constraint')) {
        setErrorMessage(`${formData.type === 'PJ' ? 'CNPJ' : 'CPF'} já cadastrado no sistema.`);
      } else {
        setErrorMessage(error.message || "Falha desconhecida ao salvar.");
      }
    }
  };

  const handleEdit = (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setFormData(customer);
    setEditingId(customer.id);
    setIsModalOpen(true);
  };

  const toggleStatus = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    try {
      const updatedCustomer = { ...customer, active: !customer.active };
      await DataService.updateCustomer(updatedCustomer);
      onUpdateCustomers(customers.map(c => c.id === id ? updatedCustomer : c));
    } catch (error) {
      showAlert("Erro ao atualizar status.", 'error');
      console.error(error);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    showConfirm(
      `Deseja inativar o cliente "${customer.name}"? O cliente será marcado como inativo mas seus dados serão preservados.`,
      async () => {
        try {
          const updatedCustomer = { ...customer, active: false };
          await DataService.updateCustomer(updatedCustomer);
          onUpdateCustomers(customers.map(c => c.id === id ? updatedCustomer : c));
        } catch (error) {
          showAlert("Erro ao inativar cliente.", 'error');
          console.error(error);
        }
      },
      'Inativar Cliente',
      'Inativar',
      true
    );
  };



  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setModalTab('dados');
    setShowLinkAsset(false);
    setAssetSearch('');
    setFormData({ type: 'PJ', state: '', city: '', address: '', active: true });
  };

  const handleLinkAsset = async (eq: Equipment) => {
    if (!editingId) return;
    setLinkingAsset(true);
    try {
      await EquipmentService.updateEquipment({ ...eq, customerId: editingId });
      // Rebuild grouped equipments locally
      const grouped: Record<string, LinkedEquipment[]> = {};
      equipments.forEach((e: any) => {
        const cid = e.id === eq.id ? editingId : e.customerId;
        if (!cid) return;
        if (!grouped[cid]) grouped[cid] = [];
        grouped[cid].push(e);
      });
      // Ensure newly linked shows up
      if (!grouped[editingId]) grouped[editingId] = [];
      if (!grouped[editingId].find(e => e.id === eq.id)) {
        grouped[editingId].push(eq as any);
      }
      setMockEquipments(grouped);
      setShowLinkAsset(false);
      setAssetSearch('');
    } catch (err: any) {
      showAlert('Erro ao vincular ativo: ' + err.message, 'error');
    } finally {
      setLinkingAsset(false);
    }
  };


  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchTerm.toLowerCase()) || c.document.includes(searchTerm);
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? c.active : !c.active);
    return matchesSearch && matchesStatus;
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter]);

  const paginatedCustomers = filteredCustomers.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE);

  return (
    <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">
      {/* Toolbar */}
      <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3">
          
          <div className="relative flex-1 min-w-[200px] w-full lg:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Localizar cliente..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-1.5 px-3 h-10 rounded-xl border transition-all text-[10px] font-bold ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-[#1c2d4f]/20 text-[#1c2d4f] hover:bg-[#1c2d4f]/5 shadow-sm'}`}
            >
              <Filter size={14} /> <span className="hidden sm:inline">{showFilters ? 'Ocultar' : 'Avançado'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
             <Button
                onClick={() => setIsModalOpen(true)}
                className="h-10 px-4 gap-1.5 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] shadow-lg shadow-[#1c2d4f]/20 text-[11px] rounded-xl font-bold whitespace-nowrap"
              >
                <Plus size={16} /> Novo Cliente
             </Button>
          </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 p-3 bg-white/60 rounded-xl border border-[#1c2d4f]/10 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex flex-col gap-1">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">{t.common.status}</label>
              <div className="flex items-center bg-white border border-[#1c2d4f]/20 rounded-lg pl-2 pr-1 h-9 shadow-sm">
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
            </div>
            
            <div className="flex items-end pb-0.5">
              <button
                onClick={() => {
                  setSearchTerm(''); setStatusFilter('ALL');
                }}
                className="h-9 w-full px-4 text-[10px] font-bold bg-rose-50 text-rose-500 hover:bg-rose-100 hover:text-rose-600 rounded-lg transition-colors uppercase tracking-widest border border-rose-100"
              >
                Limpar Todos os Filtros
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">
        {/* TABELA PADRONIZADA */}
        <div className="flex-1 overflow-auto p-0 custom-scrollbar">
          <table className="w-full border-separate border-spacing-y-1">
            <thead className="sticky top-0 bg-white/80 backdrop-blur-md z-10">
              <tr className="text-[10px] font-bold text-slate-400  tracking-[0.3em] text-center lowercase">
                <th className="px-4 py-2 text-left">cliente / documento</th>
                <th className="px-4 py-2">contato principal</th>
                <th className="px-4 py-2">localização</th>
                <th className="px-4 py-2 text-center">status</th>
                <th className="px-4 py-2 text-right pr-6">ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCustomers.map(c => {
                return (
                  <React.Fragment key={c.id}>
                    <tr
                      className={`bg-white hover:bg-slate-50 transition-all group shadow-sm hover:shadow-md ${!c.active ? 'opacity-50' : ''}`}
                    >
                      <td className="px-4 py-1.5 border-y border-slate-100 rounded-l-[1.5rem] border-l">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl border-2 shrink-0 ${c.type === 'PJ' ? 'bg-primary-50 border-primary-100 text-primary-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                            {c.type === 'PJ' ? <Building2 size={16} /> : <User size={16} />}
                          </div>
                          <div className="truncate">
                            <p className="text-slate-800 tracking-tight truncate max-w-[180px] text-[13px] font-medium">{c.name}</p>
                            <p className="text-[11px] text-slate-400 mt-0.5 truncate">{c.document}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-1.5 border-y border-slate-100">
                        <div className="space-y-0.5">
                          <p className="text-[11px] text-slate-600 flex items-center gap-1.5 truncate max-w-[150px]"><Mail size={12} className="text-primary-400" /> {c.email}</p>
                          <p className="text-[11px] text-emerald-500 flex items-center gap-1.5 tracking-tighter"><Phone size={12} /> {c.whatsapp || c.phone}</p>
                        </div>
                      </td>
                      <td className="px-4 py-1.5 border-y border-slate-100 text-[11px] text-slate-500 truncate max-w-[120px]">
                        <div className="flex items-center gap-1.5">
                          <MapPin size={14} className="text-primary-400" />
                          <span className="truncate">{c.city} • {c.state}</span>
                        </div>
                      </td>
                      <td className="px-4 py-1.5 border-y border-slate-100 text-center whitespace-nowrap">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-bold   border ${c.active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                          {c.active ? 'Ativo' : 'Suspenso'}
                        </span>
                      </td>
                      <td className="px-4 py-1.5 rounded-r-[1.5rem] border border-slate-100 border-l-0 text-right pr-4">

                        <div className="flex items-center justify-end gap-1.5" onClick={e => e.stopPropagation()}>
                          <button onClick={(e) => toggleStatus(c.id, e)} title={c.active ? "Suspender" : "Liberar"} className="p-2.5 bg-slate-50 text-slate-400 hover:text-amber-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-amber-100 transition-all active:scale-90">
                            {c.active ? <PowerOff size={16} /> : <Power size={16} />}
                          </button>
                          <button onClick={(e) => handleEdit(c, e)} title="Editar" className="p-2.5 bg-primary-50/50 text-primary-400 hover:text-primary-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-primary-100 transition-all active:scale-90">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={(e) => handleDelete(c.id, e)} title="Excluir" className="p-2.5 bg-rose-50/50 text-rose-400 hover:text-rose-600 hover:bg-white rounded-lg shadow-sm border border-transparent hover:border-rose-100 transition-all active:scale-90">
                            <Trash2 size={16} />
                          </button>
                        </div>

                      </td>
                    </tr>


                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredCustomers.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
        />
      </div>

      {
        isModalOpen && createPortal(
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden">
            <div className="bg-white rounded-xl w-full max-w-[96vw] h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up">

              {/* HEADER */}
              <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                      {editingId ? 'Editar Cliente' : 'Novo Cliente'}
                    </h2>
                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">Nexus Operacional • registro de unidade</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button onClick={closeModal} className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* BODY WITH SIDEBAR */}
              <div className="flex-1 flex overflow-hidden">
                {/* SIDEBAR MENU */}
                <div className="w-64 bg-slate-50/50 border-r border-slate-200 p-6 flex flex-col gap-2 shrink-0">
                  <button type="button" onClick={() => setModalTab('dados')}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                      modalTab === 'dados' ? 'bg-white text-[#1c2d4f] shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                    }`}>
                    <User size={16} /> Dados do Cliente
                  </button>
                  {editingId && (
                    <button type="button" onClick={() => setModalTab('ativos')}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all ${
                        modalTab === 'ativos' ? 'bg-white text-[#1c2d4f] shadow-sm border border-slate-200' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
                      }`}>
                      <Box size={16} /> Ativos Vinculados
                    </button>
                  )}
                </div>

                {/* CONTENT AREA */}
                <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar">

                {/* ABA: DADOS */}
                {modalTab === 'dados' && (
                  <form id="customer-form" onSubmit={handleSubmit} className="space-y-6 max-w-4xl mx-auto">

                    {/* Tipo */}
                    <div className="flex bg-white p-1 rounded-xl w-fit border border-slate-200 shadow-sm">
                      <button type="button" onClick={() => setFormData({ ...formData, type: 'PJ' })}
                        className={`px-8 py-2 rounded-lg text-xs font-bold transition-all ${
                          formData.type === 'PJ' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                        }`}>Empresa (PJ)</button>
                      <button type="button" onClick={() => setFormData({ ...formData, type: 'PF' })}
                        className={`px-8 py-2 rounded-lg text-xs font-bold transition-all ${
                          formData.type === 'PF' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                        }`}>Individual (PF)</button>
                    </div>

                    {/* Card: Identificação */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">identificação</h3>
                      </div>
                      <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div className="md:col-span-2">
                          <Input label={formData.type === 'PJ' ? 'Razão Social' : 'Nome Completo'} required className="rounded-xl py-3 font-medium border-slate-200" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                        </div>
                        <div className="relative">
                          <Input label={formData.type === 'PJ' ? 'CNPJ' : 'CPF'} required
                            className={`rounded-xl py-3 font-medium ${documentDuplicate ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                            value={formData.document || ''}
                            placeholder={formData.type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                            onChange={e => setFormData({ ...formData, document: formData.type === 'PJ' ? formatCNPJ(e.target.value) : formatCPF(e.target.value) })} />
                          {documentDuplicate && <p className="text-red-500 text-[10px] font-bold mt-1 ml-1">⚠️ Já cadastrado: {documentDuplicate}</p>}
                        </div>
                        <Input label="E-mail" type="email" required icon={<Mail size={16} />} className="rounded-xl py-3 font-medium border-slate-200" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                        <Input label="Telefone" className="rounded-xl py-3 font-medium border-slate-200" value={formData.phone || ''} onChange={e => setFormData({ ...formData, phone: formatPhone(e.target.value) })} placeholder="(00) 0000-0000" />
                        <Input label="WhatsApp" icon={<Phone size={14} className="text-emerald-500" />} className="rounded-xl py-3 font-medium border-slate-200" value={formData.whatsapp || ''} onChange={e => setFormData({ ...formData, whatsapp: formatPhone(e.target.value) })} placeholder="(00) 00000-0000" />
                      </div>
                    </div>

                    {/* Card: Localização */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      <div className="px-6 py-4 border-b border-slate-100">
                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">localização e atendimento</h3>
                      </div>
                      <div className="p-6 space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                          <Input label="CEP" onBlur={handleZipBlur} required className="rounded-xl py-3 font-medium border-slate-200" value={formData.zip || ''} onChange={e => setFormData({ ...formData, zip: e.target.value })} />
                          <Input label="Estado (UF)" className="rounded-xl py-3 font-medium border-slate-200" value={formData.state || ''} onChange={e => setFormData({ ...formData, state: e.target.value })} />
                          <Input label="Cidade" className="rounded-xl py-3 font-medium border-slate-200" value={formData.city || ''} onChange={e => setFormData({ ...formData, city: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                          <div className="md:col-span-2"><Input label="Logradouro" className="rounded-xl py-3 font-medium border-slate-200" value={formData.address || ''} onChange={e => setFormData({ ...formData, address: e.target.value })} /></div>
                          <Input label="Número" required className="rounded-xl py-3 font-medium border-slate-200" value={formData.number || ''} onChange={e => setFormData({ ...formData, number: e.target.value })} />
                          <Input label="Bairro" required className="rounded-xl py-3 font-medium border-slate-200" value={formData.neighborhood || ''} onChange={e => setFormData({ ...formData, neighborhood: e.target.value })} />
                        </div>
                        <Input label="Complemento / Referência" icon={<Info size={16} />} className="rounded-xl py-3 font-medium border-slate-200" value={formData.complement || ''} onChange={e => setFormData({ ...formData, complement: e.target.value })} />
                        <div className="grid grid-cols-2 gap-5 bg-slate-50 p-4 rounded-xl border border-slate-100">
                          <div className="col-span-full"><p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Geolocalização (preenchida automaticamente via CEP)</p></div>
                          <Input label="Latitude" type="number" step="any" className="rounded-xl py-3 font-medium border-slate-200" value={formData.latitude || ''} onChange={e => setFormData({ ...formData, latitude: parseFloat(e.target.value) || undefined })} />
                          <Input label="Longitude" type="number" step="any" className="rounded-xl py-3 font-medium border-slate-200" value={formData.longitude || ''} onChange={e => setFormData({ ...formData, longitude: parseFloat(e.target.value) || undefined })} />
                        </div>
                      </div>
                    </div>

                    {errorMessage && (
                      <div className="p-4 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs font-bold">{errorMessage}</div>
                    )}
                  </form>
                )}

                {/* ABA: ATIVOS VINCULADOS */}
                {modalTab === 'ativos' && editingId && (
                  <div className="max-w-4xl mx-auto space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">ativos vinculados ao cliente</h3>
                      <button type="button" onClick={() => { setShowLinkAsset(true); setAssetSearch(''); }}
                        className="flex items-center gap-2 px-4 py-2 bg-[#1c2d4f] text-white rounded-xl text-[11px] font-bold hover:bg-[#253a66] transition-all">
                        <Plus size={14} /> Vincular Ativo
                      </button>
                    </div>

                    {/* Sub-painel: vincular ativo livre */}
                    {showLinkAsset && (() => {
                      const freeAssets = equipments.filter((eq: any) =>
                        (!eq.customerId || eq.customerId === editingId) && eq.id !== editingId
                      ).filter((eq: any) =>
                        assetSearch === '' ||
                        eq.model?.toLowerCase().includes(assetSearch.toLowerCase()) ||
                        eq.serialNumber?.toLowerCase().includes(assetSearch.toLowerCase())
                      );
                      const alreadyLinked = new Set((mockEquipments[editingId!] || []).map(e => e.id));
                      const available = freeAssets.filter((eq: any) => !alreadyLinked.has(eq.id));
                      return (
                        <div className="bg-slate-50 border border-[#1c2d4f]/20 rounded-xl overflow-hidden">
                          <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between bg-white">
                            <p className="text-xs font-bold text-[#1c2d4f]">Selecione um ativo para vincular</p>
                            <button onClick={() => setShowLinkAsset(false)} className="p-1 text-slate-400 hover:text-rose-500 rounded"><X size={16} /></button>
                          </div>
                          <div className="p-3">
                            <div className="relative mb-3">
                              <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                              <input
                                value={assetSearch}
                                onChange={e => setAssetSearch(e.target.value)}
                                placeholder="Buscar por modelo ou serial..."
                                className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-[#1c2d4f]/10"
                              />
                            </div>
                            {available.length === 0 ? (
                              <p className="text-center py-6 text-xs text-slate-400 font-medium">Nenhum ativo disponível para vincular</p>
                            ) : (
                              <div className="max-h-52 overflow-y-auto custom-scrollbar divide-y divide-slate-100">
                                {available.map((eq: any) => (
                                  <div key={eq.id} className="flex items-center justify-between py-2.5 px-2 hover:bg-white rounded-lg transition-colors">
                                    <div className="flex items-center gap-3">
                                      <div className="w-7 h-7 bg-[#1c2d4f]/8 rounded-lg flex items-center justify-center text-[#1c2d4f]"><Laptop size={13} /></div>
                                      <div>
                                        <p className="text-xs font-semibold text-slate-800">{eq.model || eq.name}</p>
                                        <p className="font-mono text-[10px] text-slate-400">{eq.serialNumber}</p>
                                      </div>
                                    </div>
                                    <button
                                      onClick={() => handleLinkAsset(eq)}
                                      disabled={linkingAsset}
                                      className="px-3 py-1 bg-[#1c2d4f] text-white rounded-lg text-[10px] font-bold hover:bg-[#253a66] transition-colors disabled:opacity-50"
                                    >
                                      Vincular
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                      {mockEquipments[editingId] && mockEquipments[editingId].length > 0 ? (
                        <table className="w-full">
                          <thead className="bg-slate-50 border-b border-slate-200">
                            <tr className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                              <th className="px-5 py-3 text-left">Modelo / Nome</th>
                              <th className="px-5 py-3 text-left">Nº de Série</th>
                              <th className="px-5 py-3 text-left">Família</th>
                              <th className="px-5 py-3 text-center">{t.common.status}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {mockEquipments[editingId].map(eq => (
                              <tr key={eq.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-5 py-3">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-[#1c2d4f]/8 rounded-lg flex items-center justify-center text-[#1c2d4f]"><Laptop size={14} /></div>
                                    <span className="text-xs font-semibold text-slate-800">{eq.model}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-3 font-mono text-xs text-slate-500">{eq.serialNumber}</td>
                                <td className="px-5 py-3 text-xs text-slate-500">{eq.familyName || '—'}</td>
                                <td className="px-5 py-3 text-center">
                                  <span className={`px-3 py-1 rounded-full text-[9px] font-bold ${
                                    eq.active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400'
                                  }`}>{eq.active ? 'Ativo' : 'Inativo'}</span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="py-16 text-center">
                          <Laptop size={32} className="mx-auto text-slate-200 mb-3" />
                          <p className="text-sm font-bold text-slate-300">Nenhum ativo vinculado</p>
                          <p className="text-xs text-slate-300 mt-1">Cadastre ativos na aba de Equipamentos</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
              </div>
              
              {/* FOOTER */}
              <div className="px-8 py-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                <button type="button" onClick={closeModal} className="h-9 px-5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">{t.common.cancel}</button>
                {modalTab === 'dados' && (
                  <Button form="customer-form" onClick={handleSubmit} disabled={!!documentDuplicate}
                    className={`h-9 px-6 rounded-xl text-xs font-bold ${
                      documentDuplicate ? 'bg-gray-400 cursor-not-allowed opacity-50' : 'bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f]'
                    }`}>
                    <Save size={14} className="mr-2" /> Salvar Cadastro
                  </Button>
                )}
              </div>

            </div>
          </div>, document.body
        )
      }
    </div>
  );
};
