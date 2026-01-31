
import React, { useState, useEffect } from 'react';
import {
  X, Save, Search, Box, User, Hash, ChevronRight,
  CheckCircle2, CalendarDays, MapPin, Tag, Plus,
  UserPlus, Info, ChevronLeft, AtSign, Building2, Edit3, Laptop, UserMinus
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, TextArea } from '../ui/Input';
import { OrderPriority, OrderStatus, ServiceOrder, User as UserType } from '../../types';
import { DataService } from '../../services/dataService';

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
  const [step, setStep] = useState<1 | 2 | 3>(initialData ? 2 : 1);
  const [loading, setLoading] = useState(false);
  const [technicians, setTechnicians] = useState<UserType[]>([]);
  const [searchMode, setSearchMode] = useState<'client' | 'serial'>('client');
  const [clientSearch, setClientSearch] = useState(initialData?.customerName || '');
  const [serialSearch, setSerialSearch] = useState('');
  const [techSearch, setTechSearch] = useState('');
  const [isClientListOpen, setIsClientListOpen] = useState(false);
  const [isSerialListOpen, setIsSerialListOpen] = useState(false);

  const [clients, setClients] = useState<any[]>([]);
  const [equipments, setEquipments] = useState<any[]>([]);

  const [selectedClientId, setSelectedClientId] = useState(initialData ? 'initial' : '');
  const [selectedEquipIds, setSelectedEquipIds] = useState<string[]>([]);

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
    equipmentSerial: initialData?.equipmentSerial || ''
  });

  const isCompleted = initialData?.status === OrderStatus.COMPLETED;

  useEffect(() => {
    const loadData = async () => {
      try {
        const [techs, loadedClients, loadedEquipments] = await Promise.all([
          DataService.getAllTechnicians(),
          DataService.getCustomers(),
          DataService.getEquipments()
        ]);

        setTechnicians(techs);
        setClients(loadedClients);
        setEquipments(loadedEquipments);

        // Se estiver editando, tentar encontrar o ID do cliente e equipamentos
        if (initialData) {
          const client = loadedClients.find(c => c.name === initialData.customerName);
          if (client) setSelectedClientId(client.id);

          const equip = loadedEquipments.find(e => e.serialNumber === initialData.equipmentSerial);
          if (equip) setSelectedEquipIds([equip.id]);
        }
      } catch (error) {
        console.error('Erro ao carregar dados:', error);
      }
    };

    loadData();
  }, [initialData]);

  const handleSelectTechnician = (techId: string) => {
    if (isCompleted) return;
    setFormData(prev => ({
      ...prev,
      assignedTo: techId,
      status: techId ? OrderStatus.ASSIGNED : OrderStatus.PENDING
    }));
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


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      };

      console.log('Dados finais a serem enviados:', finalData);

      await onSubmit(finalData);
      console.log('✅ Ordem criada com sucesso!');
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

  return (
    <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/40 backdrop-blur-xl p-4 sm:p-8 overflow-hidden">
      <div className="bg-white rounded-[3rem] w-full max-w-[96vw] h-[92vh] shadow-[0_32px_128px_rgba(0,0,0,0.2)] border border-white/50 overflow-hidden flex flex-col animate-scale-up">

        {/* HEADER COMPACTO */}
        <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg">
              {initialData ? <Edit3 size={20} /> : <Plus size={20} />}
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 uppercase tracking-tighter italic leading-none">
                {initialData ? `Protocolo #${initialData.id}` : 'Novo Chamado'}
              </h2>
              <p className="text-[9px] font-black text-indigo-500 uppercase tracking-widest mt-1 italic">
                Nexus Operacional • Registro Técnico
              </p>
            </div>
          </div>

          <div className="flex items-center gap-5">
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((s) => (
                <div key={s} className="flex items-center">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black transition-all border ${step === s ? 'bg-indigo-600 border-indigo-600 text-white shadow-md' : (step > s ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-white border-slate-200 text-slate-400')
                    }`}>
                    {step > s ? <CheckCircle2 size={14} /> : s}
                  </div>
                  {s < 3 && <div className={`w-6 h-0.5 mx-0.5 rounded-full ${step > s ? 'bg-emerald-500' : 'bg-slate-200'}`} />}
                </div>
              ))}
            </div>
            <button onClick={onClose} className="p-2 text-slate-300 hover:text-slate-900 transition-all">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-8 bg-white custom-scrollbar">
          {step === 1 && (
            <div className="animate-fade-in space-y-6">
              {!initialData && (
                <div className="flex bg-slate-100 p-1 rounded-xl w-fit mx-auto mb-6 border border-slate-200">
                  <button
                    onClick={() => setSearchMode('client')}
                    className={`px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${searchMode === 'client' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Por Cliente
                  </button>
                  <button
                    onClick={() => setSearchMode('serial')}
                    className={`px-6 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${searchMode === 'serial' ? 'bg-white text-indigo-600 shadow-sm border border-slate-200' : 'text-slate-400 hover:text-slate-600'}`}
                  >
                    Por Serial
                  </button>
                </div>
              )}

              <div className="space-y-3">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] px-1 flex items-center gap-2">
                  {searchMode === 'client' ? <Building2 size={12} /> : <Hash size={12} />}
                  Localizar Unidade Técnica
                </label>

                <div className="relative">
                  <Input
                    placeholder={searchMode === 'client' ? "Nome do cliente..." : "Número de série..."}
                    value={searchMode === 'client' ? clientSearch : serialSearch}
                    className="rounded-xl py-4 font-bold text-sm border-slate-200 focus:ring-indigo-50"
                    onChange={e => {
                      if (searchMode === 'client') { setClientSearch(e.target.value); setIsClientListOpen(true); }
                      else { setSerialSearch(e.target.value); setIsSerialListOpen(true); }
                    }}
                    onFocus={() => searchMode === 'client' ? setIsClientListOpen(true) : setIsSerialListOpen(true)}
                    icon={searchMode === 'client' ? <Building2 size={16} /> : <Hash size={16} />}
                  />

                  {(isClientListOpen && searchMode === 'client' && clientSearch) && (
                    <div className="absolute z-[170] top-full mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto">
                      {filteredClients.length > 0 ? filteredClients.map(c => (
                        <button key={c.id} onClick={() => handleSelectClient(c)} className="w-full text-left px-5 py-3 hover:bg-slate-50 flex justify-between items-center border-b border-slate-50 last:border-0 transition-colors">
                          <div>
                            <p className="text-[11px] font-black uppercase text-slate-700">{c.name}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase truncate max-w-sm">{c.address}</p>
                          </div>
                          <ChevronRight size={14} className="text-slate-300" />
                        </button>
                      )) : (
                        <div className="p-4 text-center text-slate-400 text-[10px] font-bold uppercase">Nenhum cliente</div>
                      )}
                    </div>
                  )}

                  {(isSerialListOpen && searchMode === 'serial' && serialSearch) && (
                    <div className="absolute z-[170] top-full mt-1 w-full bg-white border border-slate-200 rounded-2xl shadow-xl max-h-48 overflow-y-auto">
                      {filteredSerials.length > 0 ? filteredSerials.map(e => (
                        <button key={e.id} onClick={() => handleSelectBySerial(e)} className="w-full text-left px-5 py-3 hover:bg-slate-50 flex justify-between items-center border-b border-slate-50 last:border-0 transition-colors">
                          <div className="flex items-center gap-3">
                            <Laptop size={14} className="text-slate-400" />
                            <div>
                              <p className="text-[10px] font-black uppercase">SN: {e.serialNumber}</p>
                              <p className="text-[9px] text-indigo-600 font-bold uppercase">{e.model}</p>
                            </div>
                          </div>
                          <ChevronRight size={14} className="text-slate-300" />
                        </button>
                      )) : (
                        <div className="p-4 text-center text-slate-400 text-[10px] font-bold uppercase">Serial não localizado</div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {(selectedClientId || initialData) && (
                <div className="space-y-3 animate-fade-in-up">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-[0.15em] px-1 flex items-center gap-2">
                    <Box size={12} /> Ativos Vinculados
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {equipments.filter(e => e.customerId === selectedClientId).map(eq => (
                      <div
                        key={eq.id}
                        onClick={() => handleEquipmentToggle(eq.id)}
                        className={`flex items-center gap-4 p-4 rounded-2xl border transition-all cursor-pointer ${selectedEquipIds.includes(eq.id) ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-slate-100 bg-slate-50/30 hover:border-slate-200'
                          }`}
                      >
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${selectedEquipIds.includes(eq.id) ? 'bg-indigo-600 text-white shadow-md' : 'bg-white border border-slate-100 text-slate-300'}`}>
                          <Box size={16} />
                        </div>
                        <div className="flex-1">
                          <p className="text-[10px] font-black uppercase text-slate-700 truncate">{eq.model}</p>
                          <p className="text-[9px] text-slate-400 italic font-bold">#{eq.serialNumber}</p>
                        </div>
                        {selectedEquipIds.includes(eq.id) && <CheckCircle2 size={16} className="text-indigo-600" />}
                      </div>
                    ))}
                    {equipments.filter(e => e.customerId === selectedClientId).length === 0 && (
                      <div className="col-span-full py-6 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        <p className="text-[9px] font-black text-slate-300 uppercase italic">Nenhum ativo registrado</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                  <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100 space-y-4">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block italic">Programação Agenda</label>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <span className="text-[8px] font-black text-slate-500 uppercase ml-1">Data</span>
                        <Input
                          type="date"
                          required
                          min={getLocalDate()}
                          className="rounded-xl border-slate-200 bg-white text-xs font-bold py-2"
                          value={formData.scheduledDate}
                          onChange={e => setFormData({ ...formData, scheduledDate: e.target.value })}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[8px] font-black text-slate-500 uppercase ml-1">Horário</span>
                        <Input
                          type="time"
                          className="rounded-xl border-slate-200 bg-white text-xs font-bold py-2"
                          value={formData.scheduledTime}
                          onChange={e => setFormData({ ...formData, scheduledTime: e.target.value })}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4 px-1">
                    <div className="grid grid-cols-1 gap-4">
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase ml-1 tracking-widest">Tipo de Atendimento</span>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase text-slate-700 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                          value={formData.operationType}
                          onChange={e => setFormData({ ...formData, operationType: e.target.value })}
                        >
                          {OS_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <span className="text-[9px] font-black text-slate-400 uppercase ml-1 tracking-widest">Prioridade Crítica</span>
                        <select
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase text-slate-700 focus:ring-2 focus:ring-indigo-100 transition-all outline-none"
                          value={formData.priority}
                          onChange={e => setFormData({ ...formData, priority: e.target.value as OrderPriority })}
                        >
                          {Object.values(OrderPriority).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex justify-between items-center px-1">
                    <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                      Alocação de Técnico
                    </label>
                  </div>

                  <div className="relative">
                    <Input
                      placeholder="Filtrar por nome..."
                      value={techSearch}
                      onChange={e => setTechSearch(e.target.value)}
                      className="rounded-xl py-2 px-4 text-xs font-bold border-slate-200"
                      icon={<Search size={14} className="text-slate-300" />}
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-2 max-h-[180px] overflow-y-auto pr-2 custom-scrollbar">
                    <button
                      type="button"
                      onClick={() => handleSelectTechnician('')}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${formData.assignedTo === '' ? 'border-amber-400 bg-amber-50 shadow-sm' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
                        }`}
                    >
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-100 flex items-center justify-center text-slate-300">
                        <UserMinus size={14} />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase text-slate-700">Manter em Aberto</p>
                        <p className="text-[8px] text-slate-400 uppercase font-bold italic">Triagem posterior</p>
                      </div>
                    </button>

                    {filteredTechs.map(t => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectTechnician(t.id)}
                        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${formData.assignedTo === t.id ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-slate-100 bg-slate-50/50 hover:border-slate-200'
                          }`}
                      >
                        <img src={t.avatar} className="w-8 h-8 rounded-lg object-cover border border-white shadow-sm" alt={t.name} />
                        <div>
                          <p className="text-[10px] font-black uppercase text-slate-700">{t.name}</p>
                          <p className="text-[8px] text-slate-400 font-bold italic">{t.email}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="animate-fade-in space-y-6 max-w-2xl mx-auto">
              <div className="bg-emerald-50 border border-emerald-100 p-6 rounded-[2rem] flex items-center gap-6">
                <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-emerald-500 shadow-md">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h3 className="text-sm font-black text-emerald-900 uppercase italic">Revisão Técnica</h3>
                  <p className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Protocolo pronto para emissão</p>
                </div>
              </div>

              <form id="os-form" onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 italic">Título da Atividade</label>
                  <Input
                    placeholder="Ex: Manutenção Corretiva Compressor B..."
                    required
                    className="rounded-xl py-3 px-4 font-bold text-sm border-slate-200"
                    value={formData.title}
                    onChange={e => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-1 italic">Observações / Detalhes</label>
                  <TextArea
                    placeholder="Anotações técnicas adicionais..."
                    rows={5}
                    required
                    className="rounded-2xl p-6 text-xs font-medium italic border-slate-100 bg-slate-50/50"
                    value={formData.description}
                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                  />
                </div>
              </form>
            </div>
          )}
        </div>

        {/* FOOTER COMPACTO */}
        <div className="px-8 py-5 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center">
          <button
            type="button"
            key="back-btn"
            onClick={step > 1 ? () => setStep((step - 1) as any) : onClose}
            className="flex items-center gap-1.5 text-[9px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-600 transition-colors"
          >
            {step === 1 ? 'Descartar' : 'Etapa Anterior'}
          </button>

          <div className="flex gap-3">
            {step < 3 ? (
              <Button
                type="button"
                key={`next-btn-${step}`}
                className="rounded-xl px-8 py-2.5 font-black text-[10px] uppercase italic tracking-wider shadow-md"
                onClick={() => step === 1 ? goToStep2() : setStep(3)}
              >
                Próximo <ChevronRight size={14} className="ml-1" />
              </Button>
            ) : (
              <Button
                type="submit"
                key="submit-btn"
                form="os-form"
                isLoading={loading}
                className="rounded-xl px-12 py-3 font-black text-xs uppercase italic tracking-wider shadow-lg shadow-indigo-600/10"
              >
                <Save size={16} className="mr-2" /> {initialData ? 'Atualizar OS' : 'Emitir Protocolo'}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

