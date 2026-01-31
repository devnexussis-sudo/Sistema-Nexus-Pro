
import React, { useState, useEffect } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import {
  Search, Plus, Building2, User, MapPin, Phone, Mail,
  Trash2, Edit2, X, Save, Power, PowerOff, Info, Box,
  ChevronDown, ChevronUp, Laptop, Hash, Filter, Calendar
} from 'lucide-react';

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

  const handleZipBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
    const zip = e.target.value.replace(/\D/g, '');
    if (zip.length === 8) {
      setLoadingZip(true);
      try {
        const response = await fetch(`https://viacep.com.br/ws/${zip}/json/`);
        const data = await response.json();
        if (!data.erro) {
          setFormData(prev => ({
            ...prev,
            zip: data.cep,
            state: data.uf,
            city: data.localidade,
            address: data.logradouro
          }));
        }
      } catch (error) {
        console.error("Erro ao buscar CEP", error);
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

  return (
    <div className="p-8 space-y-8 animate-fade-in flex flex-col h-full bg-slate-50/20 overflow-hidden">
      {/* HEADER PADRONIZADO */}
      <div className="flex flex-col md:flex-row justify-between items-center gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">Gestão de Clientes</h1>
          <p className="text-gray-500 text-sm font-medium mt-2 italic tracking-tight">Base centralizada de unidades, contratos e históricos técnicos.</p>
        </div>
        <Button onClick={() => setIsModalOpen(true)} className="rounded-[1.5rem] px-10 py-6 font-black italic uppercase text-xs tracking-widest shadow-2xl shadow-indigo-600/20">
          <Plus size={20} className="mr-3" /> Novo Cliente
        </Button>
      </div>

      <div className="bg-white border border-slate-100 rounded-[3.5rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/50 flex-1 min-h-0">
        {/* TOOLBAR PADRONIZADA */}
        <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Localizar por nome ou documento..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-6 py-4 text-xs font-bold text-slate-700 outline-none focus:ring-4 focus:ring-indigo-100 transition-all shadow-sm"
            />
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
              <button className="p-3 text-slate-400 hover:text-indigo-600"><Filter size={18} /></button>
              <select
                className="bg-transparent pr-4 py-2 text-[10px] font-black uppercase text-slate-500 outline-none"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Todos os Temas</option>
                <option value="ACTIVE">Clientes Ativos</option>
                <option value="INACTIVE">Suspender/Inativos</option>
              </select>
            </div>
            <button className="p-4 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-indigo-600 shadow-sm transition-all">
              <Calendar size={20} />
            </button>
          </div>
        </div>

        {/* TABELA PADRONIZADA */}
        <div className="flex-1 overflow-auto p-6 custom-scrollbar">
          <table className="w-full border-separate border-spacing-y-3">
            <thead>
              <tr className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] text-left">
                <th className="px-8 py-2 w-10"></th>
                <th className="px-8 py-2">Cliente / Documento</th>
                <th className="px-8 py-2">Contato Principal</th>
                <th className="px-8 py-2">Localização</th>
                <th className="px-8 py-2 text-center">Status</th>
                <th className="px-8 py-2 text-right pr-12">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.map(c => {
                const isSelected = selectedCustomerId === c.id;
                return (
                  <React.Fragment key={c.id}>
                    <tr
                      onClick={() => toggleSelectCustomer(c.id)}
                      className={`bg-white hover:bg-indigo-50/30 transition-all group shadow-sm cursor-pointer ${!c.active ? 'opacity-50' : ''}`}
                    >
                      <td className="px-8 py-6 rounded-l-[2rem] border border-slate-100 border-r-0 text-slate-300">
                        {isSelected ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </td>
                      <td className="px-8 py-6 border-y border-slate-100 font-black text-xs">
                        <div className="flex items-center gap-4">
                          <div className={`p-4 rounded-2xl border-2 ${c.type === 'PJ' ? 'bg-indigo-50 border-indigo-100 text-indigo-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}>
                            {c.type === 'PJ' ? <Building2 size={20} /> : <User size={20} />}
                          </div>
                          <div>
                            <p className="text-slate-800 uppercase italic tracking-tight">{c.name}</p>
                            <p className="text-[9px] text-slate-400 font-black mt-1 uppercase tracking-widest">{c.document}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-6 border-y border-slate-100">
                        <div className="space-y-1">
                          <p className="text-[10px] font-black text-slate-600 flex items-center gap-2"><Mail size={12} className="text-indigo-400" /> {c.email}</p>
                          <p className="text-[10px] font-black text-emerald-500 flex items-center gap-2 uppercase tracking-tighter"><Phone size={12} /> {c.whatsapp || c.phone}</p>
                        </div>
                      </td>
                      <td className="px-8 py-6 border-y border-slate-100 font-black text-[10px] uppercase text-slate-500 italic">
                        <div className="flex items-center gap-2">
                          <MapPin size={14} className="text-indigo-400" />
                          <span>{c.city} • {c.state}</span>
                        </div>
                      </td>
                      <td className="px-8 py-6 border-y border-slate-100 text-center">
                        <span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border ${c.active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>
                          {c.active ? 'Ativo' : 'Suspenso'}
                        </span>
                      </td>
                      <td className="px-8 py-6 rounded-r-[2rem] border border-slate-100 border-l-0 text-right pr-8">

                        <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                          <button onClick={(e) => toggleStatus(c.id, e)} title={c.active ? "Suspender" : "Liberar"} className="p-3 bg-slate-50 text-slate-400 hover:text-amber-600 hover:bg-white rounded-xl shadow-sm transition-all">
                            {c.active ? <PowerOff size={18} /> : <Power size={18} />}
                          </button>
                          <button onClick={(e) => handleEdit(c, e)} title="Editar" className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-xl shadow-sm transition-all border border-transparent hover:border-indigo-100">
                            <Edit2 size={18} />
                          </button>
                          <button onClick={(e) => handleDelete(c.id, e)} title="Excluir" className="p-3 bg-slate-50 text-slate-400 hover:text-red-600 hover:bg-white rounded-xl shadow-sm transition-all">
                            <Trash2 size={18} />
                          </button>
                        </div>

                      </td>
                    </tr>

                    {isSelected && (
                      <tr className="animate-fade-in-up">
                        <td colSpan={6} className="px-12 py-4 pb-8">
                          <div className="bg-slate-50 border-2 border-indigo-100 rounded-[3rem] p-8 shadow-inner">

                            <div className="flex items-center justify-between mb-8 border-b border-indigo-100 pb-5">
                              <div className="flex items-center gap-4">
                                <div className="p-3 bg-white rounded-2xl text-indigo-600 shadow-sm"><Box size={20} /></div>
                                <h3 className="text-xs font-black text-indigo-600 uppercase tracking-widest italic">Inventário de Ativos Vinculados</h3>
                              </div>
                              <button
                                onClick={() => {
                                  // Atalho para adicionar ativo já vinculado a este cliente
                                  if (onSwitchView) onSwitchView('equip', { customerId: c.id });
                                }}
                                className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-600/20"
                              >
                                <Plus size={14} /> Novo Ativo
                              </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                              {mockEquipments[c.id] && mockEquipments[c.id].map(eq => (
                                <div key={eq.id} className="bg-white p-6 rounded-[2rem] border border-indigo-100/50 shadow-sm flex items-center gap-5 group/item transition-all hover:scale-[1.03]">
                                  <div className="p-3 bg-indigo-50 text-indigo-400 rounded-xl group-hover/item:bg-indigo-600 group-hover/item:text-white transition-colors"><Laptop size={18} /></div>
                                  <div>
                                    <p className="text-xs font-black text-slate-800 uppercase tracking-tight">{eq.model}</p>
                                    <p className="text-[9px] text-slate-400 font-black uppercase mt-1 italic tracking-widest">SN: {eq.serialNumber}</p>
                                  </div>
                                </div>
                              ))}
                              {(!mockEquipments[c.id] || mockEquipments[c.id].length === 0) && (
                                <div className="col-span-full py-10 text-center text-[10px] font-black text-slate-300 uppercase italic tracking-widest">Nenhum ativo registrado para esta unidade.</div>
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
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-md p-6">
          <div className="bg-white rounded-[4rem] w-full max-w-4xl shadow-2xl border border-white/20 overflow-hidden flex flex-col max-h-[92vh] animate-fade-in-up">
            <div className="p-10 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center rounded-t-[4rem]">
              <div className="flex items-center gap-6">
                <div className="p-5 bg-indigo-600 rounded-[1.5rem] text-white shadow-xl shadow-indigo-600/20"><Building2 size={32} /></div>
                <div>
                  <h2 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">{editingId ? 'Atualizar Cliente' : 'Novo Cadastro Corporativo'}</h2>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mt-2 italic">Provisionamento de base operacional</p>
                </div>
              </div>
              <button onClick={closeModal} className="p-4 bg-white border border-slate-100 rounded-2xl text-slate-300 hover:text-slate-900 transition-all"><X size={28} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-12 space-y-12 overflow-y-auto custom-scrollbar flex-1">
              <div className="flex bg-slate-100 p-1.5 rounded-2xl w-fit">
                <button type="button" onClick={() => setFormData({ ...formData, type: 'PJ' })} className={`px-10 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${formData.type === 'PJ' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Empresa (PJ)</button>
                <button type="button" onClick={() => setFormData({ ...formData, type: 'PF' })} className={`px-10 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${formData.type === 'PF' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600'}`}>Individual (PF)</button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
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
                        {formData.type === 'PJ' ? 'CNPJ' : 'CPF'} já cadastrado para: <span className="font-black uppercase">{documentDuplicate}</span>
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

              <div className="pt-10 border-t border-slate-100 space-y-10">
                <div className="flex items-center gap-3 text-indigo-600 font-black text-xs uppercase tracking-[0.2em] italic"><MapPin size={20} /> Localização e Atendimento</div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                  <Input label="CEP" onBlur={handleZipBlur} required className="rounded-2xl py-4 font-bold border-slate-200" value={formData.zip || ''} onChange={e => setFormData({ ...formData, zip: e.target.value })} />
                  <Input label="Estado (UF)" value={formData.state || ''} readOnly className="rounded-2xl py-4 bg-slate-50 border-slate-100 font-black text-indigo-600" />
                  <Input label="Cidade" value={formData.city || ''} readOnly className="rounded-2xl py-4 bg-slate-50 border-slate-100 font-black" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                  <div className="md:col-span-9"><Input label="Logradouro" value={formData.address || ''} readOnly className="rounded-2xl py-4 bg-slate-50 border-slate-100 font-black" /></div>
                  <div className="md:col-span-3"><Input label="Número" required className="rounded-2xl py-4 font-bold border-slate-200" value={formData.number || ''} onChange={e => setFormData({ ...formData, number: e.target.value })} /></div>
                </div>
                <Input label="Ponto de Referência / Complemento" icon={<Info size={18} />} className="rounded-2xl py-4 font-bold border-slate-200" value={formData.complement || ''} onChange={e => setFormData({ ...formData, complement: e.target.value })} />
              </div>

              {errorMessage && (
                <div className="mx-auto w-full p-4 bg-red-100 border border-red-200 text-red-600 rounded-2xl text-center font-bold text-xs uppercase animate-pulse">
                  Erro: {errorMessage}
                </div>
              )}
            </form>

            <div className="p-10 border-t border-slate-100 bg-slate-50/50 flex justify-end gap-6 rounded-b-[4rem]">
              <Button variant="secondary" className="rounded-2xl px-12" onClick={closeModal}>Descartar</Button>
              <Button
                onClick={handleSubmit}
                disabled={!!documentDuplicate}
                className={`rounded-2xl px-20 shadow-2xl font-black italic uppercase ${documentDuplicate
                  ? 'bg-gray-400 cursor-not-allowed opacity-50'
                  : 'shadow-indigo-600/30'
                  }`}
              >
                <Save size={20} className="mr-3" /> Salvar Cadastro
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
