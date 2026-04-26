
import React, { useState, useEffect } from 'react';
import {
  UserPlus, Info, ChevronLeft, AtSign, Building2, Edit3, Laptop, UserMinus, Plus, Box,
  DollarSign, Trash2, Eye, EyeOff, Package, ShoppingCart, ChevronRight, Save, X, Search, CheckCircle2, Hash, RefreshCw, Clock, FileText, Link2, Unlink
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, TextArea } from '../ui/Input';
import { OrderPriority, OrderStatus, ServiceOrder, User as UserType, OrderItem, StockItem, FormTemplate, Quote } from '../../types';
import { DataService } from '../../services/dataService';
import { OrderService } from '../../services/orderService';
import { OrderTimeline } from '../shared/OrderTimeline';
import { VisitHistoryTab } from './VisitHistoryTab';
import { VisitService } from '../../services/visitService';

interface CreateOrderModalProps {
  onClose: () => void;
  onSubmit: (order: Partial<ServiceOrder>) => Promise<any>;
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
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(initialData ? 2 : 1);
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

  const [localStatus, setLocalStatus] = useState<string | undefined>(initialData?.status);
  const isReadOnly = initialData?.status === OrderStatus.COMPLETED || initialData?.status === OrderStatus.CANCELED;
  const isCompleted = localStatus === OrderStatus.COMPLETED;
  const canCreateVisit = localStatus === OrderStatus.BLOCKED;
  const [isClientListOpen, setIsClientListOpen] = useState(false);
  const [isSerialListOpen, setIsSerialListOpen] = useState(false);

  const [clients, setClients] = useState<any[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]);
  const [stock, setStock] = useState<StockItem[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [linkedQuoteIds, setLinkedQuoteIds] = useState<string[]>(initialData?.linkedQuotes || []);
  const [quoteSearch, setQuoteSearch] = useState('');

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

  const loadData = React.useCallback(async () => {
    setLoading(true);
    try {
      // 🛡️ Forçar verificação de sessão para renovar token se necessário
      const currentUser = await DataService.getCurrentUser();
      if (!currentUser) {
        console.warn("⚠️ Sessão pode estar expirada. Tentando buscar dados mesmo assim...");
      }

      const [techs, loadedClients, loadedEquipments, loadedStock, loadedFormTemplates, loadedRules, loadedServiceTypes, loadedQuotes] = await Promise.all([
        DataService.getAllTechnicians(),
        DataService.getCustomers(),
        DataService.getEquipments(),
        DataService.getStockItems(),
        DataService.getFormTemplates(),
        DataService.getActivationRules(),
        DataService.getServiceTypes(),
        DataService.getQuotes()
      ]);

      setTechnicians(techs);
      setClients(loadedClients);
      setEquipments(loadedEquipments);
      setStock(loadedStock);
      setFormTemplates(loadedFormTemplates);
      setActivationRules(loadedRules);
      setQuotes(loadedQuotes || []);

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
    if (isReadOnly) return;
    setFormData(prev => ({
      ...prev,
      assignedTo: techId,
      status: techId ? OrderStatus.ASSIGNED : OrderStatus.PENDING
    }));

    // No painel administrativo (Admin/Nexus Dashboard), a aba de Composição 
    // de Valores sempre deve buscar as peças do "Estoque Geral" da empresa, 
    // mesmo quando a OS já está designada a um técnico.
    // Portanto, a sobreposição do estado de estoque por getTechStock() foi desativada.
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

      const finalData = {
        ...formData,
        equipmentName: selectedEquip ? selectedEquip.model : formData.equipmentName || 'Não especificado',
        equipmentModel: selectedEquip ? selectedEquip.model : formData.equipmentModel || '-',
        equipmentSerial: selectedEquip ? selectedEquip.serialNumber : formData.equipmentSerial || '-',
        assignedTo: formData.assignedTo || null,
        scheduledTime: formData.scheduledTime || null,
        items: items,
        showValueToClient: formData.showValueToClient,
        linkedQuotes: linkedQuoteIds
      };

      const orderResult: any = await onSubmit(finalData);
      const orderId: string | undefined = orderResult?.id;

      // ── Persistir todos os equipamentos sequencialmente (sem race condition) ──
      if (orderId && selectedEquipIds.length > 0) {
        for (let idx = 0; idx < selectedEquipIds.length; idx++) {
          const eqId = selectedEquipIds[idx];
          const eq = equipments.find(e => e.id === eqId);
          if (!eq) continue;
          try {
            await VisitService.addEquipmentToOrder({
              orderId,
              equipmentId: eq.id,
              equipmentName: eq.model,
              equipmentModel: eq.model,
              equipmentSerial: eq.serialNumber,
              equipmentFamily: (eq as any).familyName || '',
            });
          } catch (e: any) {
            console.error(`[OS] Falha ao vincular equip idx=${idx}:`, e?.message);
          }
        }
      }


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
    (s.description || '').toLowerCase().includes((stockSearch || '').toLowerCase()) ||
    (s.code || '').toLowerCase().includes((stockSearch || '').toLowerCase())
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
      // Usa VisitService com guardas enterprise de estado
      await VisitService.createNewVisit({
        orderId: initialData.id,
        orderStatus: localStatus || initialData.status,
        technicianId: newVisitData.assignedTo,
        scheduledDate: newVisitData.scheduledDate,
        scheduledTime: newVisitData.scheduledTime,
        notes: newVisitData.notes,
      });
      alert("Nova visita agendada com sucesso!");
      setShowNewVisitModal(false);
      setTimelineKey(prev => prev + 1);
      setLocalStatus(OrderStatus.ASSIGNED);
    } catch (e: any) {
      // Mensagem clara para erros de regra de negócio
      const msg = e.message?.startsWith('INVALID_')
        ? e.message.split(': ')[1]
        : `Erro ao agendar visita: ${e.message}`;
      alert(msg);
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
              <p className="text-[10px] font-bold text-slate-400   mt-0.5">
                Nexus Operacional • registro técnico
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2">
              {[1, 2, 3, 4, 5, ...(initialData ? [6] : [])].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold transition-all border ${step === s
                    ? 'bg-[#1c2d4f] border-[#1c2d4f] text-white shadow-md'
                    : (step > s ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-slate-50 border-slate-200 text-slate-400')
                    }`}>
                    {step > s ? <CheckCircle2 size={14} /> : (s === 6 ? <Clock size={14} /> : s)}
                  </div>
                  {(s < 5 || (s === 5 && initialData)) && <div className={`w-4 h-0.5 mx-0.5 rounded-full ${step > s ? 'bg-emerald-500' : 'bg-slate-100'}`} />}
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
                <div className="flex bg-white p-1 rounded-xl w-fit mx-auto border border-slate-200 shadow-lg shadow-slate-200/50">
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
                <label className="text-[10px] font-bold text-slate-400   px-1 flex items-center gap-2">
                  {searchMode === 'client' ? <Building2 size={12} /> : <Hash size={12} />}
                  Localizar Unidade Técnico
                </label>

                <div className="relative">
                  <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input
                      placeholder={searchMode === 'client' ? "Nome do cliente..." : "Número de série..."}
                      value={searchMode === 'client' ? clientSearch : serialSearch}
                      disabled={isReadOnly}
                      className="w-full bg-white border border-slate-200 rounded-xl pl-12 pr-4 py-4 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all shadow-sm disabled:opacity-50"
                      onChange={e => {
                        if (searchMode === 'client') { setClientSearch(e.target.value); setIsClientListOpen(true); }
                        else { setSerialSearch(e.target.value); setIsSerialListOpen(true); }
                      }}
                      onFocus={() => !isReadOnly && (searchMode === 'client' ? setIsClientListOpen(true) : setIsSerialListOpen(true))}
                    />
                  </div>

                  {(isClientListOpen && searchMode === 'client' && clientSearch) && (
                    <div className="absolute z-[170] top-full mt-2 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-2">
                      {filteredClients.length > 0 ? filteredClients.map(c => (
                        <button key={c.id} onClick={() => handleSelectClient(c)} className="w-full text-left px-5 py-4 hover:bg-slate-50 flex justify-between items-center border-b border-slate-200 last:border-0 transition-colors group">
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
                        <button key={e.id} onClick={() => handleSelectBySerial(e)} className="w-full text-left px-5 py-4 hover:bg-slate-50 flex justify-between items-center border-b border-slate-200 last:border-0 transition-colors group">
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
                  <label className="text-[10px] font-bold text-slate-400   px-1 flex items-center gap-2">
                    <Box size={12} /> Ativos Vinculados
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {equipments.filter(e => e.customerId === selectedClientId).map(eq => (
                      <div
                        key={eq.id}
                        onClick={() => !isReadOnly && handleEquipmentToggle(eq.id)}
                        className={`flex items-center gap-4 p-5 rounded-xl border transition-all cursor-pointer group ${selectedEquipIds.includes(eq.id)
                          ? 'border-[#1c2d4f] bg-[#1c2d4f05] ring-1 ring-[#1c2d4f]'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-md'
                          } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
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
                  <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 space-y-6">
                    <h3 className="text-sm font-bold text-slate-900 border-l-4 border-[#1c2d4f] pl-3">programação e prioridade</h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400   ml-1">data agendada</label>
                        <Input
                          type="date"
                          required
                          min={getLocalDate()}
                          disabled={isReadOnly}
                          className="rounded-xl border-slate-200 font-medium text-sm py-3 disabled:opacity-50"
                          value={formData.scheduledDate}
                          onChange={e => setFormData({ ...formData, scheduledDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400   ml-1">horário previsto</label>
                        <Input
                          type="time"
                          disabled={isReadOnly}
                          className="rounded-xl border-slate-200 font-medium text-sm py-3 disabled:opacity-50"
                          value={formData.scheduledTime}
                          onChange={e => setFormData({ ...formData, scheduledTime: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400   ml-1">modalidade</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all outline-none cursor-pointer disabled:opacity-50"
                          value={formData.operationType}
                          disabled={isReadOnly}
                          onChange={e => setFormData({ ...formData, operationType: e.target.value })}
                        >
                          {serviceTypes.map(type => (
                            <option key={type.id || type.name} value={type.name}>{type.name}</option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-slate-400   ml-1">nível de prioridade</label>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all outline-none cursor-pointer disabled:opacity-50"
                          value={formData.priority}
                          disabled={isReadOnly}
                          onChange={e => setFormData({ ...formData, priority: e.target.value as OrderPriority })}
                        >
                          {Object.values(OrderPriority).map(p => (
                            <option key={p} value={p}>{p === OrderPriority.LOW ? 'Baixo' : p === OrderPriority.MEDIUM ? 'Média' : p === OrderPriority.HIGH ? 'Alta' : 'Urgente'}</option>
                          ))}
                        </select>
                      </div>

                    </div>
                  </div>
                </div>

                {/* ALOCAÇÃO DE TÉCNICO */}
                <div className="space-y-6">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-lg shadow-slate-200/50 flex flex-col h-full">
                    <h3 className="text-sm font-bold text-slate-900 border-l-4 border-emerald-500 pl-3 mb-6">responsável técnico</h3>

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
            <div className="animate-fade-in space-y-5 max-w-4xl mx-auto">
              {/* HEADER COMPACTO */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center"><DollarSign size={15} className="text-slate-500" /></div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 tracking-tight">Composição de Valores</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Peças, serviços e mão de obra</p>
                  </div>
                </div>
                <button type="button" onClick={() => setFormData({ ...formData, showValueToClient: !formData.showValueToClient })}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all border ${formData.showValueToClient ? 'bg-emerald-50 text-emerald-600 border-emerald-200' : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'}`}>
                  {formData.showValueToClient ? <><Eye size={12} /> Visível</> : <><EyeOff size={12} /> Oculto</>}
                </button>
              </div>

              {/* AÇÕES DE ADIÇÃO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="relative">
                  <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                  <input placeholder="Buscar peça no estoque..." value={stockSearch}
                    onChange={e => { setStockSearch(e.target.value); setIsStockListOpen(true); }}
                    onFocus={() => setIsStockListOpen(true)}
                    className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#1c2d4f] transition-all" />
                  {(isStockListOpen && stockSearch) && (
                    <div className="absolute z-[180] top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-52 overflow-y-auto custom-scrollbar">
                      {filteredStock.length > 0 ? filteredStock.map(s => (
                        <button key={s.id} onClick={() => { addItem({ description: s.description, unitPrice: s.sellPrice, fromStock: true, stockItemId: s.id }); setStockSearch(''); setIsStockListOpen(false); }}
                          className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex justify-between items-center border-b border-slate-100 last:border-0 group">
                          <div className="flex items-center gap-2">
                            <Box size={12} className="text-slate-400 group-hover:text-[#1c2d4f]" />
                            <div>
                              <p className="text-[11px] font-bold text-slate-700">{s.description}</p>
                              <p className="text-[10px] text-[#1c2d4f] font-bold">R$ {s.sellPrice.toLocaleString('pt-BR')}</p>
                            </div>
                          </div>
                          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Qtd: {s.quantity}</span>
                        </button>
                      )) : <div className="p-4 text-center text-[10px] font-medium text-slate-400">Nenhum item encontrado</div>}
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => !isReadOnly && addItem({ description: '', unitPrice: 0 })} disabled={isReadOnly}
                  className="border border-dashed border-slate-200 text-slate-400 rounded-lg py-2.5 text-[11px] font-bold flex items-center justify-center gap-1.5 hover:border-[#1c2d4f] hover:text-[#1c2d4f] hover:bg-[#1c2d4f05] transition-all disabled:opacity-50">
                  <Plus size={14} /> Adicionar Item Manual
                </button>
              </div>

              {/* TABELA COMPACTA */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-[9px] font-bold text-slate-400 uppercase border-b border-slate-200">
                      <th className="px-3 py-2">Item / Descrição</th>
                      <th className="px-3 py-2 w-20 text-center">Qtd</th>
                      <th className="px-3 py-2 w-28">Unit. (R$)</th>
                      <th className="px-3 py-2 w-28 text-right">Subtotal</th>
                      <th className="px-3 py-2 text-center w-12"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {items.map(item => (
                      <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-3 py-2">
                          <input type="text" value={item.description} disabled={isReadOnly}
                            onChange={e => updateItem(item.id, { description: e.target.value })}
                            placeholder="Descreva o item..."
                            className="bg-transparent border-none text-[11px] font-semibold text-slate-700 outline-none w-full placeholder:text-slate-300 disabled:opacity-50" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.1" value={item.quantity} disabled={isReadOnly}
                            onChange={e => updateItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                            className="bg-slate-50 rounded-md px-2 py-1 text-[11px] font-bold text-slate-700 outline-none w-14 border border-slate-100 focus:border-[#1c2d4f] transition-all text-center disabled:opacity-50" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" step="0.01" value={item.unitPrice} disabled={isReadOnly}
                            onChange={e => updateItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                            className="bg-slate-50 rounded-md px-2 py-1 text-[11px] font-bold text-slate-700 outline-none w-24 border border-slate-100 focus:border-[#1c2d4f] transition-all disabled:opacity-50" />
                        </td>
                        <td className="px-3 py-2 text-right">
                          <span className="text-[11px] font-bold text-slate-800">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button onClick={() => !isReadOnly && removeItem(item.id)} disabled={isReadOnly}
                            className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all disabled:opacity-30">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {items.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-6 py-10 text-center">
                          <ShoppingCart size={24} className="mx-auto text-slate-200 mb-2" />
                          <p className="text-[10px] font-semibold text-slate-400">Nenhum item adicionado</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                {/* TOTAL INLINE */}
                <div className="bg-slate-50 border-t border-slate-200 px-3 py-2.5 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Total Estimado</span>
                  <span className="text-sm font-bold text-slate-900">R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="animate-fade-in space-y-5 max-w-4xl mx-auto">
              {/* HEADER */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-slate-100 rounded-lg flex items-center justify-center"><FileText size={15} className="text-slate-500" /></div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight">Vincular Orçamentos</h3>
                  <p className="text-[10px] text-slate-400 font-medium">Associe orçamentos existentes a esta ordem de serviço</p>
                </div>
              </div>

              {/* BUSCAR ORÇAMENTO */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                <input placeholder="Pesquisar por título, cliente ou código..." value={quoteSearch}
                  onChange={e => setQuoteSearch(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2.5 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#1c2d4f] transition-all" />
              </div>

              {/* ORÇAMENTOS VINCULADOS */}
              {linkedQuoteIds.length > 0 && (
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Vinculados ({linkedQuoteIds.length})</label>
                  <div className="space-y-1.5">
                    {linkedQuoteIds.map(qid => {
                      const q = quotes.find(qt => qt.id === qid);
                      return (
                        <div key={qid} className="flex items-center justify-between bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 group">
                          <div className="flex items-center gap-2.5">
                            <Link2 size={13} className="text-emerald-500" />
                            <div>
                              <p className="text-[11px] font-bold text-slate-800">{q?.displayId || q?.title || qid}</p>
                              <p className="text-[10px] text-slate-500">{q?.customerName || '—'} • R$ {(q?.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${q?.status === 'APROVADO' ? 'bg-emerald-100 text-emerald-700' : q?.status === 'REJEITADO' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}>{q?.status || '—'}</span>
                            {!isReadOnly && (
                              <button onClick={() => setLinkedQuoteIds(prev => prev.filter(id => id !== qid))}
                                className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-all">
                                <Unlink size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* LISTA DE ORÇAMENTOS DISPONÍVEIS */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase px-1">Disponíveis</label>
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden max-h-[320px] overflow-y-auto custom-scrollbar">
                  {quotes.filter(q => !linkedQuoteIds.includes(q.id) && (
                    !quoteSearch || q.title?.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                    q.customerName?.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                    q.displayId?.toLowerCase().includes(quoteSearch.toLowerCase())
                  )).length > 0 ? quotes.filter(q => !linkedQuoteIds.includes(q.id) && (
                    !quoteSearch || q.title?.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                    q.customerName?.toLowerCase().includes(quoteSearch.toLowerCase()) ||
                    q.displayId?.toLowerCase().includes(quoteSearch.toLowerCase())
                  )).map(q => (
                    <button key={q.id} onClick={() => !isReadOnly && setLinkedQuoteIds(prev => [...prev, q.id])} disabled={isReadOnly}
                      className="w-full text-left px-3 py-2.5 hover:bg-slate-50 flex items-center justify-between border-b border-slate-100 last:border-0 transition-colors group disabled:opacity-50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-slate-50 rounded flex items-center justify-center group-hover:bg-[#1c2d4f10] transition-colors">
                          <FileText size={13} className="text-slate-400 group-hover:text-[#1c2d4f]" />
                        </div>
                        <div>
                          <p className="text-[11px] font-bold text-slate-700 group-hover:text-[#1c2d4f]">{q.displayId || q.title}</p>
                          <p className="text-[10px] text-slate-400">{q.customerName} • R$ {(q.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${q.status === 'APROVADO' ? 'bg-emerald-100 text-emerald-700' : q.status === 'REJEITADO' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}>{q.status}</span>
                        <Plus size={14} className="text-slate-300 group-hover:text-[#1c2d4f] transition-colors" />
                      </div>
                    </button>
                  )) : (
                    <div className="px-6 py-10 text-center">
                      <FileText size={24} className="mx-auto text-slate-200 mb-2" />
                      <p className="text-[10px] font-semibold text-slate-400">{quoteSearch ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento disponível'}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
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
                  <label className="text-[10px] font-bold text-slate-400   px-1 ml-1">título do atendimento</label>
                  <Input
                    placeholder="Ex: Manutenção Preventiva do Sistema Central..."
                    required
                    disabled={isReadOnly}
                    className="rounded-xl py-4 px-4 font-semibold text-sm border-slate-200 shadow-sm focus:ring-[#1c2d4f10] disabled:opacity-50"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400   px-1 ml-1">descrição técnico-operacional</label>
                  <TextArea
                    placeholder="Relate detalhadamente a necessidade do cliente e o escopo do trabalho..."
                    rows={6}
                    required
                    disabled={isReadOnly}
                    className="rounded-2xl p-6 text-sm font-medium border-slate-200 bg-white shadow-sm focus:ring-[#1c2d4f10] disabled:opacity-50"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </form>
            </div>
          )}

          {step === 6 && initialData && (
            <div className="animate-fade-in space-y-6 max-w-4xl mx-auto">
              {/* Card de controle de nova visita */}
              <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-slate-200">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Gerenciamento de Visitas</h3>
                  <p className="text-[10px] text-slate-500 font-medium">Emita uma nova visita quando a OS estiver pausada ou impedida.</p>
                </div>
                {isReadOnly ? (
                  <div className="bg-slate-100 text-slate-500 px-4 py-2 rounded-lg font-bold text-xs flex items-center gap-2 border border-slate-200">
                    <CheckCircle2 size={16} /> Protocolo {initialData?.status === OrderStatus.COMPLETED ? 'Concluído' : 'Cancelado'}
                  </div>
                ) : (
                  <Button
                    onClick={openNewVisitModal}
                    disabled={!canCreateVisit}
                    className={`rounded-lg px-4 py-2 font-bold text-xs ${canCreateVisit ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                    title={!canCreateVisit ? "Apenas ordens pausadas ou impedidas permitem novas visitas." : ""}
                  >
                    + Nova Visita
                  </Button>
                )}
              </div>

              {/* Histórico completo de visitas (lazy-loaded, sempre ativo no step 5) */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 flex items-center gap-2">
                  <span className="text-[10px] font-bold   text-slate-500">Histórico de Visitas</span>
                </div>
                <VisitHistoryTab
                  orderId={initialData.id}
                  isActive={step === 6}
                />
              </div>

              {/* Timeline de Eventos do Sistema (legado — mantido para compatibilidade) */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-lg shadow-slate-200/50 overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200">
                  <span className="text-[10px] font-bold   text-slate-500">Linha do Tempo do Sistema</span>
                </div>
                <div className="p-4">
                  <OrderTimeline key={`timeline-${timelineKey}`} orderId={initialData.id} />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* FOOTER */}
        <div className="px-8 py-5 border-t border-slate-200 bg-white flex justify-between items-center">
          <button
            type="button"
            key="back-btn"
            onClick={step > 1 ? () => setStep((step - 1) as any) : onClose}
            className="flex items-center gap-2 px-4 py-2 text-xs font-bold text-slate-400 hover:text-slate-600 transition-colors  "
          >
            {step === 1 ? 'Cancelar Registro' : 'Voltar Etapa'}
          </button>

          <div className="flex gap-4">
            {step < (initialData ? 6 : 5) ? (
              <Button
                type="button"
                key={`next-btn-${step}`}
                className="bg-[#1c2d4f] hover:bg-[#2a3e66] text-white rounded-xl px-10 py-3 font-bold text-xs   shadow-lg shadow-[#1c2d4f20] transition-all flex items-center gap-2"
                onClick={() => {
                  if (step === 1) goToStep2();
                  else if (step === 2) setStep(3);
                  else if (step === 3) setStep(4);
                  else if (step === 4) setStep(5);
                  else if (step === 5 && initialData) setStep(6);
                }}
              >
                Continuar <ChevronRight size={16} />
              </Button>
            ) : isReadOnly ? (
              <Button
                type="button"
                key="submit-btn"
                className="bg-slate-200 text-slate-500 rounded-xl px-12 py-3 font-bold text-xs   shadow-none cursor-not-allowed flex items-center gap-2"
                title="Protocolo finalizado ou cancelado. Apenas visualização."
                disabled
              >
                <CheckCircle2 size={18} /> Apenas Consulta
              </Button>
            ) : (
              <Button
                type={step === 6 ? "button" : "submit"}
                key="submit-btn"
                form={step === 6 ? undefined : "os-form"}
                onClick={step === 6 ? () => handleSubmit() : undefined}
                isLoading={loading}
                className="bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl px-12 py-3 font-bold text-xs   shadow-lg shadow-emerald-600/20 transition-all flex items-center gap-2"
              >
                <Save size={18} /> {initialData ? 'Salvar Alterações' : 'Emitir Protocolo'}
              </Button>
            )}
          </div>
        </div>
      </div>

      {
        showNewVisitModal && (
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
                  <label className="block text-xs font-bold text-slate-700  mb-1">técnico designado *</label>
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
                    <label className="block text-xs font-bold text-slate-700  mb-1">data *</label>
                    <input
                      type="date"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold outline-none focus:border-[#1c2d4f]"
                      value={newVisitData.scheduledDate}
                      onChange={e => setNewVisitData({ ...newVisitData, scheduledDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700  mb-1">horário (opcional)</label>
                    <input
                      type="time"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-sm font-semibold outline-none focus:border-[#1c2d4f]"
                      value={newVisitData.scheduledTime}
                      onChange={e => setNewVisitData({ ...newVisitData, scheduledTime: e.target.value })}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700  mb-1">observações da visita / motivo</label>
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
        )
      }
    </div >
  );
};

