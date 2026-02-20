
import React, { useState, useEffect } from 'react';
import {
  UserPlus, Info, ChevronLeft, AtSign, Building2, Edit3, Laptop, UserMinus, Plus, Box,
  DollarSign, Trash2, Eye, EyeOff, Package, ShoppingCart, ChevronRight, Save, X, Search, CheckCircle2, Hash, RefreshCw, Clock
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, TextArea } from '../ui/Input';
import { OrderPriority, OrderStatus, ServiceOrder, User as UserType, OrderItem, StockItem, FormTemplate } from '../../types';
import { DataService } from '../../services/dataService';
import { OrderService } from '../../services/orderService';
import { OrderTimeline } from '../shared/OrderTimeline';

interface CreateOrderModalProps {
  onClose: () => void;
  onSubmit: (order: Partial<ServiceOrder>) => Promise<void>;
  initialData?: ServiceOrder;
}

export const OS_TYPES = [
  'Garantia',
  'Fora de Garantia',
  'Orçamento',
  'Preventiva',
  'Garantia Estendida'
];

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({ onClose, onSubmit, initialData }) => {
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(initialData ? 2 : 1);
  const [loading, setLoading] = useState(false);
  const [schedulingVisit, setSchedulingVisit] = useState(false);
  const [timelineKey, setTimelineKey] = useState(0);
  const [showNewVisitModal, setShowNewVisitModal] = useState(false);
  const [newVisitData, setNewVisitData] = useState({
    assignedTo: '',
    scheduledDate: '',
    scheduledTime: '',
    notes: ''
  });
  const [technicians, setTechnicians] = useState<UserType[]>([]);
  const [searchMode, setSearchMode] = useState<'client' | 'serial'>('client');
  const [clientSearch, setClientSearch] = useState(initialData?.customerName || '');
  const [serialSearch, setSerialSearch] = useState('');
  const [techSearch, setTechSearch] = useState('');
  const [isClientListOpen, setIsClientListOpen] = useState(false);
  const [isSerialListOpen, setIsSerialListOpen] = useState(false);

  const [clients, setClients] = useState<any[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);

  const [selectedClientId, setSelectedClientId] = useState(initialData ? 'initial' : '');
  const [selectedEquipIds, setSelectedEquipIds] = useState<string[]>([]);
  const [formTemplates, setFormTemplates] = useState<FormTemplate[]>([]);
  const [activationRules, setActivationRules] = useState<any[]>([]);

  const [serviceTypes, setServiceTypes] = useState<any[]>(OS_TYPES.map(t => ({ id: t, name: t }))); // Default to hardcoded

  const getLocalDate = () => {
    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now.getTime() - offset).toISOString().split('T')[0];
  };

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    customerName: initialData?.customerName || '',
    customerAddress: initialData?.customerAddress || '',
    description: initialData?.description || '',
    priority: initialData?.priority || OrderPriority.MEDIUM,
    operationType: initialData?.operationType || OS_TYPES[0],
    assignedTo: initialData?.assignedTo || '',
    scheduledDate: initialData?.scheduledDate || getLocalDate(),
    scheduledTime: initialData?.scheduledTime || '',
    formId: initialData?.formId || 'f-padrao',
    status: initialData?.status || OrderStatus.PENDING,
    equipmentName: initialData?.equipmentName || '',
    equipmentModel: initialData?.equipmentModel || '',
    equipmentSerial: initialData?.equipmentSerial || '',
    showValueToClient: initialData?.showValueToClient || false
  });

  const [items, setItems] = useState<OrderItem[]>(initialData?.items || []);
  const [isStockListOpen, setIsStockListOpen] = useState(false);
  const [stockSearch, setStockSearch] = useState('');

  const isCompleted = initialData?.status === OrderStatus.COMPLETED;

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      // 🛡️ Forçar verificação de sessão para renovar token se necessário
      const currentUser = await DataService.getCurrentUser();
      if (!currentUser) {
        console.warn("⚠️ Sessão pode estar expirada. Tentando buscar dados mesmo assim...");
      }

      const [techs, loadedClients, loadedEquipments, loadedStock, loadedFormTemplates, loadedRules, loadedServiceTypes] = await Promise.all([
        DataService.getAllTechnicians(),
        DataService.getCustomers(),
        DataService.getEquipments(),
        DataService.getStockItems(),
        DataService.getFormTemplates(),
        DataService.getActivationRules(),
        DataService.getServiceTypes()
      ]);

      setTechnicians(techs);
      setClients(loadedClients);
      setEquipments(loadedEquipments);
      setStock(loadedStock);
      setFormTemplates(loadedFormTemplates);
      setActivationRules(loadedRules);

      if (loadedServiceTypes && loadedServiceTypes.length > 0) {
        setServiceTypes(loadedServiceTypes);
        // If creating new order, set default to first available type
        if (!initialData) {
          setFormData(prev => ({ ...prev, operationType: loadedServiceTypes[0].name }));
        }
      }

      // Se estiver editando, tentar encontrar o ID do cliente e equipamentos
      if (initialData) {
        const client = loadedClients.find(c => c.name === initialData.customerName);
        if (client) setSelectedClientId(client.id);

        const equip = loadedEquipments.find(e => e.serialNumber === initialData.equipmentSerial);
        if (equip) setSelectedEquipIds([equip.id]);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      // alert("Erro ao carregar dados. Verifique sua conexão ou recarregue a página.");
    } finally {
      setLoading(false);
    }
  }, [initialData]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectTechnician = async (techId: string) => {
    if (isCompleted) return;
    setFormData(prev => ({
      ...prev,
      assignedTo: techId,
      status: techId ? OrderStatus.ASSIGNED : OrderStatus.PENDING
    }));

    // Ao selecionar um técnico, carregar o estoque DELE para as peças
    if (techId) {
      try {
        const techItems = await DataService.getTechStock(techId);
        const formattedStock = techItems.map(ts => ({
          ...ts.item,
          id: ts.stockItemId,
          quantity: ts.quantity
        }));
        setStock(formattedStock as any);
      } catch (error) {
        console.error('Erro ao carregar estoque do técnico:', error);
      }
    } else {
      const generalStock = await DataService.getStockItems();
      setStock(generalStock);
    }
  };

  const handleSelectClient = (client: any) => {
    setSelectedClientId(client.id);
    setClientSearch(client.name);
    const fullAddress = client.address + (client.number ? `, ${client.number}` : '') + (client.city ? ` - ${client.city}` : '');
    setFormData(prev => ({
      ...prev,
      customerName: client.name,
      customerAddress: fullAddress
    }));
    setIsClientListOpen(false);
    setSelectedEquipIds([]);
  };

  const handleSelectBySerial = (equip: any) => {
    const client = clients.find(c => c.id === equip.customerId);
    if (client) {
      handleSelectClient(client);
      setSerialSearch(equip.serialNumber);
      setSelectedEquipIds([equip.id]);
      setFormData(prev => ({
        ...prev,
        title: equip.model
      }));
      setIsSerialListOpen(false);
    }
  };

  const handleEquipmentToggle = (id: string) => {
    setSelectedEquipIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  // Logic to auto-select form template based on rules
  useEffect(() => {
    if (!formData.operationType) return;

    // Resolve Service Type ID because operationType stores Name
    const matchedService = serviceTypes.find(s => s.name === formData.operationType);
    const serviceTypeId = matchedService?.id || formData.operationType; // ID or Name

    let targetFamily = '';
    if (selectedEquipIds.length > 0) {
      const equip = equipments.find(e => e.id === selectedEquipIds[0]);
      if (equip) targetFamily = equip.familyName;
    }

    // Find a matching rule
    const matchingRule = activationRules.find(r =>
      (r.service_type_id === serviceTypeId || r.serviceTypeId === serviceTypeId) &&
      (!r.equipmentFamily || r.equipmentFamily === targetFamily)
    );

    if (matchingRule) {
      setFormData(prev => ({ ...prev, formId: matchingRule.formId || matchingRule.form_id }));
    } else {
      // Fallback: search for a form that matches the service type in its metadata or title (Name based)
      const fallbackForm = formTemplates.find(f =>
        f.title.toLowerCase().includes(formData.operationType.toLowerCase()) ||
        f.serviceTypes?.includes(formData.operationType)
      );
      if (fallbackForm) {
        setFormData(prev => ({ ...prev, formId: fallbackForm.id }));
      }
    }
  }, [formData.operationType, selectedEquipIds, activationRules, formTemplates, serviceTypes]);

  const goToStep2 = () => {
    if (!selectedClientId && !initialData) {
      alert('Selecione um cliente para prosseguir.');
      return;
    }
    if (selectedEquipIds.length === 0 && !initialData) {
      alert('Selecione ao menos um ativo para o atendimento.');
      return;
    }
    setStep(2);
  };


  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    console.log('=== INICIANDO CRIAÇÃO DE ORDEM ===');
    console.log('FormData:', formData);

    if (!formData.scheduledDate) {
      alert('A data de agendamento é obrigatória.');
      return;
    }

    if (!formData.title) {
      alert('O título da ordem é obrigatório.');
      return;
    }

    if (!formData.description) {
      alert('A descrição é obrigatória.');
      return;
    }

    // 🛡️ Nexus Integrity Check: Validação de data retroativa
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(formData.scheduledDate + 'T12:00:00');

    if (selectedDate < today) {
      alert('A data de agendamento não pode ser anterior ao dia de hoje.');
      return;
    }

    setLoading(true);
    try {
      const selectedEquip = equipments.find(e => e.id === selectedEquipIds[0]);
      console.log('Equipamento selecionado:', selectedEquip);

      const finalData = {
        ...formData,
        equipmentName: selectedEquip ? selectedEquip.model : formData.equipmentName || 'Não especificado',
        equipmentModel: selectedEquip ? selectedEquip.model : formData.equipmentModel || '-',
        equipmentSerial: selectedEquip ? selectedEquip.serialNumber : formData.equipmentSerial || '-',
        assignedTo: formData.assignedTo || null,
        scheduledTime: formData.scheduledTime || null,
        items: items,
        showValueToClient: formData.showValueToClient
      };

      console.log('Dados finais a serem enviados:', finalData);

      const orderResult: any = await onSubmit(finalData);

      // Se a OS foi FINALIZADA ou é um novo protocolo com itens do estoque
      // Dar baixa no estoque do técnico
      if (formData.assignedTo && items.some(i => i.fromStock)) {
        const orderId = orderResult?.id || initialData?.id;
        if (orderId) {
          for (const item of items) {
            if (item.fromStock && item.stockItemId) {
              try {
                await DataService.consumeTechStock(
                  formData.assignedTo,
                  item.stockItemId,
                  item.quantity,
                  orderId
                );
              } catch (e) {
                console.warn('Alerta de estoque:', e);
                // Não bloqueia a criação da OS mas avisa
              }
            }
          }
        }
      }

      console.log('✅ Ordem processada com sucesso!');
      onClose();
    } catch (error: any) {
      console.error('❌ ERRO COMPLETO:', error);
      console.error('Tipo do erro:', typeof error);
      console.error('Error.message:', error?.message);
      console.error('Error.stack:', error?.stack);
      console.error('Error completo (JSON):', JSON.stringify(error, null, 2));

      const errorMessage = error?.message || error?.error_description || (typeof error === 'string' ? error : null) || 'Erro desconhecido';
      const techDetails = typeof error === 'object' ? JSON.stringify(error) : String(error);
      alert(`Erro ao criar ordem: ${errorMessage}\n\nDetalhes técnicos: ${techDetails}`);
    } finally {
      setLoading(false);
    }
  };



  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase())
  );

  const filteredSerials = equipments.filter(e =>
    e.serialNumber.toLowerCase().includes(serialSearch.toLowerCase())
  );

  const filteredTechs = technicians.filter(t =>
    t.name.toLowerCase().includes(techSearch.toLowerCase())
  );

  const addItem = (item: Partial<OrderItem>) => {
    const newItem: OrderItem = {
      id: Math.random().toString(36).substr(2, 9),
      description: item.description || '',
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || 0,
      total: (item.quantity || 1) * (item.unitPrice || 0),
      fromStock: item.fromStock || false,
      stockItemId: item.stockItemId
    };
    setItems([...items, newItem]);
  };

  const removeItem = (id: string) => {
    setItems(items.filter(i => i.id !== id));
  };

  const updateItem = (id: string, updates: Partial<OrderItem>) => {
    setItems(items.map(i => {
      if (i.id === id) {
        const updated = { ...i, ...updates };
        updated.total = updated.quantity * updated.unitPrice;
        return updated;
      }
      return i;
    }));
  };

  const totalValue = items.reduce((acc, i) => acc + i.total, 0);

  const filteredStock = stock.filter(s =>
    s.description.toLowerCase().includes(stockSearch.toLowerCase()) ||
    s.code.toLowerCase().includes(stockSearch.toLowerCase())
  );

  const openNewVisitModal = () => {
    setNewVisitData({
      assignedTo: formData?.assignedTo || '',
      scheduledDate: new Date().toISOString().split('T')[0],
      scheduledTime: '',
      notes: ''
    });
    setShowNewVisitModal(true);
  };

  const confirmScheduleNewVisit = async () => {
    if (!initialData || !newVisitData.assignedTo || !newVisitData.scheduledDate) {
      alert("Selecione um técnico e uma data para a visita.");
      return;
    }
    setSchedulingVisit(true);
    try {
      await OrderService.scheduleNewVisit(
        initialData.id,
        newVisitData.assignedTo,
        newVisitData.scheduledDate,
        newVisitData.scheduledTime,
        newVisitData.notes
      );
      alert("Nova visita agendada com sucesso!");
      setShowNewVisitModal(false);
      setTimelineKey(prev => prev + 1);
    } catch (e: any) {
      alert(`Erro ao agendar visita: ${e.message}`);
    } finally {
      setSchedulingVisit(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden">
      <div className="bg-white rounded-xl w-full max-w-[96vw] h-[92vh] shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up">

        {/* HEADER */}
        <div className="px-8 py-5 border-b border-slate-200 flex justify-between items-center bg-white">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
              {initialData ? <Edit3 size={18} /> : <Plus size={18} />}
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 tracking-tight">
                {initialData ? `Editar Protocolo #${initialData.displayId || initialData.id}` : 'Novo Atendimento'}
              </h2>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                Nexus Operacional • Registro Técnico
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2">
              {[1, 2, 3, 4, ...(initialData ? [5] : [])].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold transition-all border ${step === s
                    ? 'bg-[#1c2d4f] border-[#1c2d4f] text-white shadow-md'
                    : (step > s ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-50 border-slate-200 text-slate-400')
                    }`}>
                    {step > s ? <CheckCircle2 size={16} /> : (s === 5 ? <Clock size={16} /> : s)}
                  </div>
                  {(s < 4 || (s === 4 && initialData)) && <div className={`w-6 h-0.5 mx-1 rounded-full ${step > s ? 'bg-emerald-500' : 'bg-slate-100'}`} />}
                </div>
              ))}
            </div>
            <button onClick={loadData} className="p-2 text-slate-400 hover:text-primary-600 transition-all rounded-lg hover:bg-primary-50" title="Recarregar Dados">
              <RefreshCw size={20} className={loading ? 'animate-spin' : ''} />
            </button>
            <button onClick={onClose} className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-slate-50/30 custom-scrollbar">
          {step === 1 && (
            <div className="animate-fade-in space-y-8 max-w-4xl mx-auto">
              {!initialData && (
                <div className="flex bg-white p-1 rounded-xl w-fit mx-auto border border-slate-200 shadow-sm">
                  <button
                    onClick={() => setSearchMode('client')}
                    className={`px-8 py-2.5 rounded-lg text-xs font-bold transition-all ${searchMode === 'client'
                      ? 'bg-[#1c2d4f] text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    Por Cliente
                  </button>
                  <button
                    onClick={() => setSearchMode('serial')}
                    className={`px-8 py-2.5 rounded-lg text-xs font-bold transition-all ${searchMode === 'serial'
                      ? 'bg-[#1c2d4f] text-white shadow-md'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                      }`}
                  >
                    Por Serial
                  </button>
                </div>
              )}

              <div className="space-y-4">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
                  {searchMode === 'client' ? <Building2 size={12} /> : <Hash size={12} />}
                  Localizar Unidade Técnico
                </label>

                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      placeholder={searchMode === 'client' ? "Nome do cliente..." : "Número de série..."}
                      value={searchMode === 'client' ? clientSearch : serialSearch}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-4 py-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all shadow-sm"
                      onChange={e => {
                        if (searchMode === 'client') { setClientSearch(e.target.value); setIsClientListOpen(true); }
                        else { setSerialSearch(e.target.value); setIsSerialListOpen(true); }
                      }}
                      onFocus={() => searchMode === 'client' ? setIsClientListOpen(true) : setIsSerialListOpen(true)}
                    />
                  </div>

                  {(isClientListOpen && searchMode === 'client' && clientSearch) && (
                    <div className="absolute z-[170] top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2">
                      {filteredClients.length > 0 ? filteredClients.map(c => (
                        <button key={c.id} onClick={() => handleSelectClient(c)} className="w-full text-left px-5 py-4 hover:bg-slate-50 flex justify-between items-center border-b border-slate-100 last:border-0 transition-colors group">
                          <div>
                            <p className="text-xs font-bold text-slate-800 group-hover:text-[#1c2d4f] transition-colors">{c.name}</p>
                            <p className="text-[10px] text-slate-400 font-medium truncate max-w-sm mt-0.5">{c.address}</p>
                          </div>
                          <ChevronRight size={16} className="text-slate-300 group-hover:text-[#1c2d4f] group-hover:translate-x-1 transition-all" />
                        </button>
                      )) : (
                        <div className="p-6 text-center text-slate-400 text-xs font-medium">Nenhum cliente localizado</div>
                      )}
                    </div>
                  )}

                  {(isSerialListOpen && searchMode === 'serial' && serialSearch) && (
                    <div className="absolute z-[170] top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2">
                      {filteredSerials.length > 0 ? filteredSerials.map(e => (
                        <button key={e.id} onClick={() => handleSelectBySerial(e)} className="w-full text-left px-5 py-4 hover:bg-slate-50 flex justify-between items-center border-b border-slate-100 last:border-0 transition-colors group">
                          <div className="flex items-center gap-4">
                            <div className="p-2 bg-slate-50 rounded-lg group-hover:bg-[#1c2d4f10] transition-colors">
                              <Laptop size={16} className="text-slate-400 group-hover:text-[#1c2d4f]" />
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-800 group-hover:text-[#1c2d4f]">SN: {e.serialNumber}</p>
                              <p className="text-[10px] text-slate-400 font-medium mt-0.5">{e.model}</p>
                            </div>
                          </div>
                          <ChevronRight size={16} className="text-slate-300 group-hover:text-[#1c2d4f] group-hover:translate-x-1 transition-all" />
                        </button>
                      )) : (
                        <div className="p-6 text-center text-slate-400 text-xs font-medium">Serial não localizado</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {(selectedClientId || initialData) && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 flex items-center gap-2">
                    <Box size={12} /> Ativos Vinculados
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {equipments.filter(e => e.customerId === selectedClientId).map(eq => (
                      <div
                        key={eq.id}
                        onClick={() => handleEquipmentToggle(eq.id)}
                        className={`flex items-center gap-4 p-5 rounded-xl border transition-all cursor-pointer group ${selectedEquipIds.includes(eq.id)
                          ? 'border-[#1c2d4f] bg-[#1c2d4f05] ring-1 ring-[#1c2d4f]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                          }`}
                      >
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${selectedEquipIds.includes(eq.id) ? 'bg-[#1c2d4f] text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-slate-100'
                          }`}>
                          <Box size={18} />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-slate-800">{eq.model}</p>
                          <p className="text-[10px] text-slate-400 font-medium mt-0.5">#{eq.serialNumber}</p>
                        </div>
                        {selectedEquipIds.includes(eq.id) && (
                          <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center text-white shadow-sm">
                            <CheckCircle2 size={12} />
                          </div>
                        )}
                      </div>
                    ))}
                    {equipments.filter(e => e.customerId === selectedClientId).length === 0 && (
                      <div className="col-span-full py-12 text-center bg-white rounded-xl border border-dashed border-slate-200">
                        <Box size={32} className="mx-auto text-slate-200 mb-3" />
                        <p className="text-xs font-semibold text-slate-400">Nenhum ativo registrado para esta unidade</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in space-y-8 max-w-4xl mx-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* CONFIGURAÇÃO DA AGENDA */}
                <div className="md:col-span-2 space-y-8">
                  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
                    <h3 className="text-sm font-bold text-slate-900 border-l-4 border-[#1c2d4f] pl-3">Programação e Prioridade</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Data Agendada</label>
                        <Input
                          type="date"
                          required
                          min={getLocalDate()}
                          className="rounded-xl border-slate-200 font-medium text-sm py-3"
                          value={formData.scheduledDate}
                          onChange={e => setFormData({ ...formData, scheduledDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Horário Previsto</label>
                        <Input
                          type="time"
                          className="rounded-xl border-slate-200 font-medium text-sm py-3"
                          value={formData.scheduledTime}
                          onChange={e => setFormData({ ...formData, scheduledTime: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Modalidade</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all outline-none cursor-pointer"
                          value={formData.operationType}
                          onChange={e => setFormData({ ...formData, operationType: e.target.value })}
                        >
                          {serviceTypes.map(type => (
                            <option key={type.id || type.name} value={type.name}>{type.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Nível de Prioridade</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all outline-none cursor-pointer"
                          value={formData.priority}
                          onChange={e => setFormData({ ...formData, priority: e.target.value as OrderPriority })}
                        >
                          {Object.values(OrderPriority).map(p => (
                            <option key={p} value={p}>{p === OrderPriority.LOW ? 'Baixa' : p === OrderPriority.MEDIUM ? 'Média' : 'Alta / Crítica'}</option>
                          ))}
                        </select>
                      </div>

                    </div>
                  </div>
                </div>

                {/* ALOCAÇÃO DE TÉCNICO */}
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col h-full">
                    <h3 className="text-sm font-bold text-slate-900 border-l-4 border-emerald-500 pl-3 mb-6">Responsável Técnico</h3>

                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                      <input
                        placeholder="Pesquisar técnico..."
                        value={techSearch}
                        onChange={e => setTechSearch(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] transition-all"
                      />
                    </div>

                    <div className="flex-1 space-y-2 overflow-y-auto pr-2 custom-scrollbar max-h-[300px]">
                      <button
                        type="button"
                        onClick={() => handleSelectTechnician('')}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${formData.assignedTo === ''
                          ? 'border-amber-200 bg-amber-50 shadow-sm'
                          : 'border-slate-50 bg-slate-50/50 hover:border-slate-200 hover:bg-white'
                          }`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-colors ${formData.assignedTo === '' ? 'bg-amber-400 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-400 group-hover:text-amber-500'
                          }`}>
                          <UserMinus size={16} />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-800">Manter Pendente</p>
                          <p className="text-[9px] text-slate-500 font-medium">Alocação em triagem</p>
                        </div>
                      </button>

                      {filteredTechs.map(t => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => handleSelectTechnician(t.id)}
                          className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left group ${formData.assignedTo === t.id
                            ? 'border-[#1c2d4f] bg-[#1c2d4f05] shadow-sm'
                            : 'border-slate-50 bg-slate-50/50 hover:border-slate-200 hover:bg-white'
                            }`}
                        >
                          <div className="relative">
                            <img src={t.avatar} className="w-9 h-9 rounded-lg object-cover border border-slate-200" alt={t.name} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[11px] font-bold text-slate-800 truncate">{t.name}</p>
                            <p className="text-[9px] text-slate-500 font-medium truncate">{t.email}</p>
                          </div>
                          {formData.assignedTo === t.id && <CheckCircle2 size={14} className="text-[#1c2d4f]" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-in space-y-8 max-w-5xl mx-auto">
              {/* HEADER DA ETAPA */}
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-xl font-bold text-slate-900 tracking-tight">Composição de Valores</h3>
                  <p className="text-xs text-slate-500 font-medium mt-1">Vincule peças do estoque ou adicione serviços manuais</p>
                </div>

                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, showValueToClient: !formData.showValueToClient })}
                  className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all border ${formData.showValueToClient
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
                    }`}
                >
                  {formData.showValueToClient ? <><Eye size={16} /> Visível para Cliente</> : <><EyeOff size={16} /> Oculto para Cliente</>}
                </button>
              </div>

              {/* TABELA DE ITENS */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">
                      <th className="px-4 py-4">Item / Descrição</th>
                      <th className="px-4 py-4 w-28 text-center">Qtd</th>
                      <th className="px-4 py-4 w-32">Unitário (R$)</th>
                      <th className="px-4 py-4 w-36">Subtotal</th>
                      <th className="px-4 py-4 text-center w-20">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-4 py-3">
                          <input
                            type="text"
                            value={item.description}
                            onChange={e => updateItem(item.id, { description: e.target.value })}
                            className="bg-transparent border-none text-[11px] font-bold text-slate-700 outline-none w-full focus:ring-0 truncate"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.1"
                            value={item.quantity}
                            onChange={e => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                            className="bg-slate-50 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none w-16 border border-slate-100 focus:border-[#1c2d4f] focus:ring-1 focus:ring-[#1c2d4f10] transition-all text-center"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            type="number"
                            step="0.01"
                            value={item.unitPrice}
                            onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                            className="bg-slate-50 rounded-lg px-2.5 py-1.5 text-[11px] font-bold text-slate-700 outline-none w-28 border border-slate-100 focus:border-[#1c2d4f] focus:ring-1 focus:ring-[#1c2d4f10] transition-all"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[12px] font-black text-slate-900 whitespace-nowrap">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => removeItem(item.id)} className="p-2 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all">
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-8 py-16 text-center">
                          <div className="flex flex-col items-center">
                            <ShoppingCart size={32} className="text-slate-200 mb-3" />
                            <p className="text-xs font-semibold text-slate-400">Nenhum item adicionado ao orçamento</p>
                          </div>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* CONTROLES DE ADIÇÃO E TOTAL */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* BUSCA NO ESTOQUE */}
                    <div className="space-y-3 relative">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Buscar no Estoque</label>
                      <div className="relative">
                        <div className="relative">
                          <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                          <input
                            placeholder="Nome da peça ou SKU..."
                            value={stockSearch}
                            onChange={e => { setStockSearch(e.target.value); setIsStockListOpen(true); }}
                            onFocus={() => setIsStockListOpen(true)}
                            className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all shadow-sm"
                          />
                        </div>

                        {(isStockListOpen && stockSearch) && (
                          <div className="absolute z-[180] bottom-full mb-2 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto custom-scrollbar animate-in slide-in-from-bottom-2">
                            {filteredStock.length > 0 ? filteredStock.map(s => (
                              <button
                                key={s.id}
                                onClick={() => {
                                  addItem({ description: s.description, unitPrice: s.sellPrice, fromStock: true, stockItemId: s.id });
                                  setStockSearch('');
                                  setIsStockListOpen(false);
                                }}
                                className="w-full text-left px-5 py-4 hover:bg-slate-50 flex justify-between items-center border-b border-slate-50 last:border-0 group"
                              >
                                <div className="flex items-center gap-3">
                                  <div className="p-2 bg-slate-100 rounded-lg group-hover:bg-[#1c2d4f10] transition-colors">
                                    <Box size={14} className="text-slate-400 group-hover:text-[#1c2d4f]" />
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-bold text-slate-800">{s.description}</p>
                                    <p className="text-[10px] text-[#1c2d4f] font-bold">R$ {s.sellPrice.toLocaleString('pt-BR')}</p>
                                  </div>
                                </div>
                                <span className="text-[9px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">Qtd: {s.quantity}</span>
                              </button>
                            )) : (
                              <div className="p-6 text-center text-xs font-medium text-slate-400">Item não localizado no estoque</div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* ADIÇÃO MANUAL */}
                    <div className="space-y-3">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Adição Manual</label>
                      <button
                        type="button"
                        onClick={() => addItem({ description: 'DESCREVA O SERVIÇO OU PEÇA...', unitPrice: 0 })}
                        className="w-full h-[46px] border-2 border-dashed border-slate-200 text-slate-400 rounded-xl text-xs font-bold uppercase flex items-center justify-center gap-2 hover:border-[#1c2d4f] hover:text-[#1c2d4f] hover:bg-[#1c2d4f05] transition-all"
                      >
                        <Plus size={16} /> Novo Item Personalizado
                      </button>
                    </div>
                  </div>
                </div>

                {/* RESUMO DE VALORES */}
                <div className="bg-[#1c2d4f] rounded-2xl p-8 text-white shadow-xl shadow-[#1c2d4f20] flex flex-col justify-between">
                  <div>
                    <div className="flex items-center gap-3 opacity-60 mb-2">
                      <DollarSign size={18} />
                      <h4 className="text-[10px] font-bold uppercase tracking-widest">Valor Total Previsto</h4>
                    </div>
                    <p className="text-4xl font-bold tracking-tight">
                      R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <div className="mt-6 pt-6 border-t border-white/10">
                    <p className="text-[10px] font-medium text-white/50 leading-relaxed uppercase">
                      Estimativa sujeita à disponibilidade técnica e variação de insumos.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-fade-in space-y-8 max-w-2xl mx-auto">
              {/* REVISÃO TÉCNICA */}
              <div className="bg-emerald-50 border border-emerald-100 p-8 rounded-2xl flex items-center gap-6">
                <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-sm border border-emerald-100">
                  <CheckCircle2 size={28} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-emerald-900 tracking-tight">Revisão e Finalização</h3>
                  <p className="text-xs text-emerald-600 font-medium mt-1">Preencha os detalhes finais para emissão do protocolo técnico</p>
                </div>
              </div>

              <form id="os-form" onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 ml-1">Título do Atendimento</label>
                  <Input
                    placeholder="Ex: Manutenção Preventiva do Sistema Central..."
                    required
                    className="rounded-xl py-4 px-4 font-semibold text-sm border-slate-200 shadow-sm focus:ring-[#1c2d4f10]"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1 ml-1">Descrição Técnico-Operacional</label>
                  <TextArea
                    placeholder="Relate detalhadamente a necessidade do cliente e o escopo do trabalho..."
                    rows={6}
                    required
                    className="rounded-2xl p-6 text-sm font-medium border-slate-200 bg-white shadow-sm focus:ring-[#1c2d4f10]"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </form>
            </div>
          )}

          {step === 5 && initialData && (
            <div className="animate-fade-in space-y-8 max-w-4xl mx-auto">
              <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Gerenciamento de Visitas</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Você pode emitir um novo agendamento para esta mesma Ordem se ela estiver pausada ou precisar de retorno.</p>
                </div>
                <Button
                  onClick={openNewVisitModal}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg px-4 py-2 font-bold text-xs"
                >
                  + Nova Visita
                </Button>
              </div>
              <OrderTimeline key={`timeline-${timelineKey}`} orderId={initialData.id} />
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-8 py-5 border-t border-slate-200 bg-white flex justify-between items-center">
          <button
            type="button"
            key="back-btn"
            onClick={step > 1 ? () => setStep((step - 1) as any) : onClose}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors uppercase tracking-widest"
          >
            {step === 1 ? 'Cancelar Registro' : 'Voltar Etapa'}
          </button>

          <div className="flex gap-4">
            {step < (initialData ? 5 : 4) ? (
              <Button
                type="button"
                key={`next-btn-${step}`}
                className="bg-[#1c2d4f] hover:bg-[#2a3e66] text-white rounded-xl px-10 py-3 font-bold text-xs uppercase tracking-widest shadow-lg shadow-[#1c2d4f20] transition-all flex items-center gap-2"
                onClick={() => {
                  if (step === 1) goToStep2();
                  else if (step === 2) setStep(3);
                  else if (step === 3) setStep(4);
                  else if (step === 4 && initialData) setStep(5);
                }}
              >
                Continuar <ChevronRight size={16} />
              </Button>
            ) : (
              <Button
                type={step === 5 ? "button" : "submit"}
                key="submit-btn"
                form={step === 5 ? undefined : "os-form"}
                onClick={step === 5 ? () => handleSubmit() : undefined}
                isLoading={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-12 py-3 font-bold text-xs uppercase tracking-widest shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                <Save size={18} /> {initialData ? 'Salvar Alterações' : 'Emitir Protocolo'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {showNewVisitModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-lg border border-slate-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-slate-800">Agendar Nova Visita</h3>
              <button type="button" onClick={() => setShowNewVisitModal(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Técnico Designado *</label>
                <select
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold outline-none focus:border-[#1c2d4f]"
                  value={newVisitData.assignedTo}
                  onChange={e => setNewVisitData({ ...newVisitData, assignedTo: e.target.value })}
                >
                  <option value="">Selecione um técnico...</option>
                  {technicians.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Data *</label>
                  <input
                    type="date"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold outline-none focus:border-[#1c2d4f]"
                    value={newVisitData.scheduledDate}
                    onChange={e => setNewVisitData({ ...newVisitData, scheduledDate: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Horário (Opcional)</label>
                  <input
                    type="time"
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold outline-none focus:border-[#1c2d4f]"
                    value={newVisitData.scheduledTime}
                    onChange={e => setNewVisitData({ ...newVisitData, scheduledTime: e.target.value })}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Observações da Visita / Motivo</label>
                <TextArea
                  placeholder="Instruções para o técnico..."
                  value={newVisitData.notes}
                  onChange={e => setNewVisitData({ ...newVisitData, notes: e.target.value })}
                />
              </div>

              <div className="pt-4 flex gap-3 flex-row-reverse">
                <Button
                  onClick={confirmScheduleNewVisit}
                  isLoading={schedulingVisit}
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl py-3 font-bold"
                >
                  Confirmar Agendamento
                </Button>
                <Button type="button" onClick={() => setShowNewVisitModal(false)} className="flex-1 shadow-none bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl py-3 font-bold">Cancelar</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

