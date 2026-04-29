
import React, { useState, useEffect } from 'react';
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

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
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
      alert("Erro ao atualizar status.");
      console.error(error);
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const customer = customers.find(c => c.id === id);
    if (!customer) return;

    if (confirm(`Deseja inativar o cliente "${customer.name}"? O cliente será marcado como inativo mas seus dados serão preservados.`)) {
      try {
        const updatedCustomer = { ...customer, active: false };
        await DataService.updateCustomer(updatedCustomer);
        onUpdateCustomers(customers.map(c => c.id === id ? updatedCustomer : c));
      } catch (error) {
        alert("Erro ao inativar cliente.");
        console.error(error);
      }
    }
  };



  const closeModal = () => {
    setIsModalOpen(false);
    setEditingId(null);
    setFormData({ type: 'PJ', state: '', city: '', address: '', active: true });
  };

  const toggleSelectCustomer = (id: string) => {
    setSelectedCustomerId(selectedCustomerId === id ? null : id);
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
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider px-1">Status</label>
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
                <th className="px-3 py-2 w-8"></th>
                <th className="px-4 py-2">cliente / documento</th>
                <th className="px-4 py-2">contato principal</th>
                <th className="px-4 py-2">localização</th>
                <th className="px-4 py-2 text-center">status</th>
                <th className="px-4 py-2 text-right pr-6">ações</th>
              </tr>
            </thead>
            <tbody>
              {paginatedCustomers.map(c => {
                const isSelected = selectedCustomerId === c.id;
                return (
                  <React.Fragment key={c.id}>
                    <tr
                      onClick={() => toggleSelectCustomer(c.id)}
                      className={`bg-white hover:bg-primary-50/40 transition-all group shadow-sm hover:shadow-md cursor-pointer ${!c.active ? 'opacity-50' : ''}`}
                    >
                      <td className="px-3 py-1.5 rounded-l-[1.5rem] border border-slate-100 border-r-0 text-slate-300">
                        {isSelected ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </td>
                      <td className="px-4 py-1.5 border-y border-slate-100">
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

                    {isSelected && (
                      <tr className="animate-fade-in-up">
                        <td colSpan={6} className="px-12 py-1.5 pb-8">
                          <div className="bg-slate-50 border-2 border-primary-100 rounded-[3rem] p-8 shadow-inner">

                            <div className="flex items-center justify-between mb-8 border-b border-primary-100 pb-5">
                              <div className="flex items-center gap-4">
                                <div className="p-3 bg-white rounded-2xl text-primary-600 shadow-sm"><Box size={20} /></div>
                                <h3 className="text-xs font-bold text-primary-600   italic">Inventário de Ativos Vinculados</h3>
                              </div>
                              <button
                                onClick={() => {
                                  // Atalho para adicionar ativo já vinculado a este cliente
                                  if (onSwitchView) onSwitchView('equip', { customerId: c.id });
                                }}
                                className="flex items-center gap-2 px-6 py-2 bg-primary-600 text-white rounded-xl text-[9px] font-bold   hover:bg-primary-700 transition-all shadow-lg shadow-primary-600/20"
                              >
                                <Plus size={14} /> Novo Ativo
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {mockEquipments[c.id] && mockEquipments[c.id].map(eq => (
                                <div key={eq.id} className="bg-white p-6 rounded-[2rem] border border-primary-100/50 shadow-lg shadow-slate-200/50 flex items-center gap-5 group/item transition-all hover:scale-[1.03]">
                                  <div className="p-3 bg-primary-50 text-primary-400 rounded-xl group-hover/item:bg-primary-600 group-hover/item:text-white transition-colors"><Laptop size={18} /></div>
                                  <div>
                                    <p className="text-xs font-bold text-slate-800  tracking-tight">{eq.model}</p>
                                    <p className="text-[9px] text-slate-400 font-bold  mt-1 italic ">SN: {eq.serialNumber}</p>
                                  </div>
                                </div>
                              ))}
                              {(!mockEquipments[c.id] || mockEquipments[c.id].length === 0) && (
                                <div className="col-span-full py-10 text-center text-[10px] font-bold text-slate-300  italic ">Nenhum ativo registrado para esta unidade.</div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
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
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in">
            <div className="bg-white rounded-none lg:rounded-xl w-full max-w-4xl h-full lg:h-auto lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200">
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-start sm:items-center shrink-0 bg-white">
                <div className="flex items-center gap-6">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-[#1c2d4f] shrink-0"><Building2 size={18} /></div>
                  <div>
                    <h2 className="text-sm sm:text-base font-semibold text-slate-900 font-poppins">{editingId ? 'atualizar cliente' : 'novo cadastro corporativo'}</h2>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5">provisionamento de base operacional</p>
                  </div>
                </div>
                <button onClick={closeModal} className="p-2 text-slate-400 hover:text-slate-900 transition-all"><X size={20} /></button>
              </div>

              <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 custom-scrollbar">
                <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
                  <button type="button" onClick={() => setFormData({ ...formData, type: 'PJ' })} className={`px-10 py-3 text-[10px] font-bold   rounded-xl transition-all ${formData.type === 'PJ' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Empresa (PJ)</button>
                  <button type="button" onClick={() => setFormData({ ...formData, type: 'PF' })} className={`px-10 py-3 text-[10px] font-bold   rounded-xl transition-all ${formData.type === 'PF' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Individual (PF)</button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <Input label={formData.type === 'PJ' ? "Razão Social" : "Nome Completo"} required className="rounded-2xl py-4 font-bold border-slate-200" value={formData.name || ''} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                  <div className="relative">
                    <Input
                      label={formData.type === 'PJ' ? "CNPJ" : "CPF"}
                      required
                      className={`rounded-2xl py-4 font-bold ${documentDuplicate ? 'border-red-500 bg-red-50' : 'border-slate-200'}`}
                      value={formData.document || ''}
                      onChange={e => {
                        const formatted = formData.type === 'PJ'
                          ? formatCNPJ(e.target.value)
                          : formatCPF(e.target.value);
                        setFormData({ ...formData, document: formatted });
                      }}
                      placeholder={formData.type === 'PJ' ? '00.000.000/0000-00' : '000.000.000-00'}
                    />
                    {documentDuplicate && (
                      <div className="mt-2 p-3 bg-red-100 border border-red-300 rounded-xl flex items-start gap-2 animate-pulse">
                        <span className="text-red-600 font-bold text-lg">⚠️</span>
                        <p className="text-red-700 text-xs font-bold">
                          {formData.type === 'PJ' ? 'CNPJ' : 'CPF'} já cadastrado para: <span className="font-bold ">{documentDuplicate}</span>
                        </p>
                      </div>
                    )}
                  </div>
                  <Input label="E-mail Administrativo" type="email" required icon={<Mail size={16} />} className="rounded-2xl py-4 font-bold border-slate-200" value={formData.email || ''} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                  <div className="grid grid-cols-2 gap-6">
                    <Input
                      label="Telefone Fixo"
                      className="rounded-2xl py-4 font-bold border-slate-200"
                      value={formData.phone || ''}
                      onChange={e => setFormData({ ...formData, phone: formatPhone(e.target.value) })}
                      placeholder="(00) 0000-0000"
                    />
                    <Input
                      label="WhatsApp Direto"
                      icon={<Phone size={14} className="text-emerald-500" />}
                      className="rounded-2xl py-4 font-bold border-slate-200"
                      value={formData.whatsapp || ''}
                      onChange={e => setFormData({ ...formData, whatsapp: formatPhone(e.target.value) })}
                      placeholder="(00) 00000-0000"
                    />
                  </div>
                </div>

                <div className="pt-5 border-t border-slate-200 space-y-5">
                  <div className="flex items-center gap-2 text-primary-600 font-bold text-xs tracking-[0.2em] italic"><MapPin size={16} /> localização e atendimento</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                    <Input label="CEP" onBlur={handleZipBlur} required className="rounded-2xl py-4 font-bold border-slate-200" value={formData.zip || ''} onChange={e => setFormData({ ...formData, zip: e.target.value })} />
                    <Input label="Estado (UF)" value={formData.state || ''} className="rounded-2xl py-4 border-slate-200 font-bold text-primary-600" onChange={e => setFormData({ ...formData, state: e.target.value })} />
                    <Input label="Cidade" value={formData.city || ''} className="rounded-2xl py-4 border-slate-200 font-bold text-slate-700" onChange={e => setFormData({ ...formData, city: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
                    <div className="md:col-span-2"><Input label="Logradouro" value={formData.address || ''} className="rounded-2xl py-4 border-slate-200 font-bold text-slate-700" onChange={e => setFormData({ ...formData, address: e.target.value })} /></div>
                    <div className="md:col-span-1"><Input label="Número" required className="rounded-2xl py-4 font-bold border-slate-200" value={formData.number || ''} onChange={e => setFormData({ ...formData, number: e.target.value })} /></div>
                    <div className="md:col-span-1"><Input label="Bairro" required className="rounded-2xl py-4 font-bold border-slate-200" value={formData.neighborhood || ''} onChange={e => setFormData({ ...formData, neighborhood: e.target.value })} /></div>
                  </div>
                  <Input label="Ponto de Referência / Complemento" icon={<Info size={18} />} className="rounded-2xl py-4 font-bold border-slate-200" value={formData.complement || ''} onChange={e => setFormData({ ...formData, complement: e.target.value })} />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 bg-slate-50 p-4 rounded-xl border border-slate-100">
                    <div className="col-span-full">
                      <h4 className="text-[10px] font-bold  text-slate-400 ">Geolocalização Customizada (Opcional)</h4>
                      <p className="text-[9px] text-slate-400 mt-1">Preenchido automaticamente via CEP. Só altere se a posição do pino estiver incorreta.</p>
                    </div>
                    <Input label="Latitude" type="number" step="any" value={formData.latitude || ''} className="rounded-2xl py-4 border-slate-200 font-bold text-primary-600" onChange={e => setFormData({ ...formData, latitude: parseFloat(e.target.value) || undefined })} />
                    <Input label="Longitude" type="number" step="any" value={formData.longitude || ''} className="rounded-2xl py-4 border-slate-200 font-bold text-primary-600" onChange={e => setFormData({ ...formData, longitude: parseFloat(e.target.value) || undefined })} />
                  </div>
                </div>

                {errorMessage && (
                  <div className="mx-auto w-full p-4 bg-red-100 border border-red-200 text-red-600 rounded-2xl text-center font-bold text-xs  animate-pulse">
                    Erro: {errorMessage}
                  </div>
                )}
              </form>

              <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                <Button variant="secondary" className="h-9 px-5 rounded-xl text-xs" onClick={closeModal}>Cancelar</Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!!documentDuplicate}
                  className={`h-9 px-6 rounded-xl text-xs font-bold transition-all ${documentDuplicate
                    ? 'bg-gray-400 cursor-not-allowed opacity-50'
                    : 'bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f]'
                    }`}
                >
                  <Save size={14} className="mr-2" /> Salvar Cadastro
                </Button>
              </div>
            </div>
          </div>, document.body
        )
      }
    </div >
  );
};
