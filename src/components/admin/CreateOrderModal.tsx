
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useI18n } from '../../i18n';
import { useDialog } from '../../contexts/DialogContext';
import {
  UserPlus, Info, ChevronLeft, AtSign, Building2, Edit3, Laptop, UserMinus, Plus, Box,
  DollarSign, Trash2, Eye, EyeOff, Package, ShoppingCart, ChevronRight, Save, X, Search, CheckCircle2, Hash, RefreshCw, Clock, FileText, Link2, Unlink, ChevronDown, MapPin, AlertCircle, AlertTriangle, Calendar
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input, TextArea } from '../ui/Input';
import { OrderPriority, OrderStatus, ServiceOrder, User as UserType, OrderItem, StockItem, FormTemplate, Quote, DefectType } from '../../types';
import { DataService } from '../../services/dataService';
import { OrderService } from '../../services/orderService';
import { OrderTimeline } from '../shared/OrderTimeline';
import { VisitHistoryTab } from './VisitHistoryTab';
import { VisitService } from '../../services/visitService';
import * as turf from '@turf/turf';
import { getRegions } from '../../services/regionService';
import { Region } from '../../types/region';
import { useTenant } from '../../hooks/nexusHooks';
import { supabase } from '../../lib/supabase';
import { getTodayLocalDate } from '../../utils/dateUtils';

const PriorityBadge = ({ priority }: { priority: OrderPriority }) => {
  switch (priority) {
    case OrderPriority.LOW:
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">Baixa</span>;
    case OrderPriority.MEDIUM:
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-600 border border-blue-200">Média</span>;
    case OrderPriority.HIGH:
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-600 border border-amber-200">Alta</span>;
    case OrderPriority.CRITICAL:
      return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-red-600 text-white shadow-sm shadow-red-600/30 border border-red-600"><AlertCircle size={10} /> Crítica</span>;
    default:
      return <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">{priority}</span>;
  }
};
const checkWarrantyStatus = (manufactureDate?: string, warrantyMonths?: number) => {
  if (!manufactureDate || !warrantyMonths) return null;
  const mDate = new Date(manufactureDate);
  const expiryDate = new Date(mDate);
  expiryDate.setMonth(expiryDate.getMonth() + warrantyMonths);
  const now = new Date();
  return expiryDate >= now; // true = Em Garantia, false = Fora de Garantia
};

interface CreateOrderModalProps {
  onClose: () => void;
  onSubmit: (order: Partial<ServiceOrder>) => Promise<any>;
  initialData?: ServiceOrder;
  prefill?: {
    customerId?: string;
    customerName?: string;
    customerDocument?: string;
    equipmentSerial?: string;
    equipmentName?: string;
    description?: string;
  };
}

export const OS_TYPES = [
  'Garantia',
  'Fora de Garantia',
  'Orçamento',
  'Preventiva',
  'Garantia Estendida'
];

export const CreateOrderModal: React.FC<CreateOrderModalProps> = ({ onClose, onSubmit, initialData, prefill }) => {
  const { t } = useI18n();
  const { showAlert } = useDialog();

  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5 | 6>(initialData ? 2 : 1);
  const [step2Attempted, setStep2Attempted] = useState(false);
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
  const [visitTechSearch, setVisitTechSearch] = useState('');
  const [visitItems, setVisitItems] = useState<OrderItem[]>([]);
  const [visitStockSearch, setVisitStockSearch] = useState('');
  const [isVisitStockListOpen, setIsVisitStockListOpen] = useState(false);
  const [technicians, setTechnicians] = useState<UserType[]>([]);
  const [searchMode, setSearchMode] = useState<'client' | 'serial'>('client');
  const [clientSearch, setClientSearch] = useState(initialData?.customerName || prefill?.customerDocument || prefill?.customerName || '');
  const [serialSearch, setSerialSearch] = useState('');
  const [techSearch, setTechSearch] = useState('');
  const [openOrderWarning, setOpenOrderWarning] = useState<string | null>(null);

  const [localStatus, setLocalStatus] = useState<string | undefined>(initialData?.status);
  const isReadOnly = initialData?.status === OrderStatus.COMPLETED || initialData?.status === OrderStatus.CANCELED;
  const isCompleted = localStatus === OrderStatus.COMPLETED;
  const canCreateVisit = localStatus === OrderStatus.BLOCKED;
  const [isClientListOpen, setIsClientListOpen] = useState(false);
  const [isSerialListOpen, setIsSerialListOpen] = useState(false);
  const [isOperationTypeOpen, setIsOperationTypeOpen] = useState(false);
  const [isPriorityOpen, setIsPriorityOpen] = useState(false);

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
  const [regions, setRegions] = useState<Region[]>([]);
  
  const { data: tenant } = useTenant();
  const isGeofencingEnabled = tenant?.metadata?.enableGeofencing === true;

  const [serviceTypes, setServiceTypes] = useState<any[]>(OS_TYPES.map(t => ({ id: t, name: t }))); // Default to hardcoded
  const [defectTypes, setDefectTypes] = useState<DefectType[]>([]);
  const [isDefectDropdownOpen, setIsDefectDropdownOpen] = useState(false);
  const [defectSearch, setDefectSearch] = useState('');
  const defectDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (defectDropdownRef.current && !defectDropdownRef.current.contains(event.target as Node)) {
        setIsDefectDropdownOpen(false);
      }
    };
    if (isDefectDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDefectDropdownOpen]);

  const getLocalDate = () => getTodayLocalDate();

  const [formData, setFormData] = useState({
    title: initialData?.title || '',
    customerName: initialData?.customerName || '',
    customerAddress: initialData?.customerAddress || '',
    description: initialData?.description || '',
    priority: initialData?.priority || OrderPriority.MEDIUM,
    operationType: initialData?.operationType || OS_TYPES[0],
    defectTypeId: initialData?.defectTypeId || '',
    defectTypeCode: initialData?.defectTypeCode || '',
    defectTypeName: initialData?.defectTypeName || '',
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

      const [techs, loadedClients, loadedEquipments, loadedStock, loadedFormTemplates, loadedRules, loadedServiceTypes, loadedQuotes, loadedRegions, loadedDefects] = await Promise.all([
        DataService.getAllTechnicians(),
        DataService.getCustomers(),
        DataService.getEquipments(),
        DataService.getStockItems(),
        DataService.getFormTemplates(),
        DataService.getActivationRules(),
        DataService.getServiceTypes(),
        DataService.getQuotes(),
        getRegions(),
        DataService.getDefectTypes()
      ]);

      setTechnicians(techs);
      setClients(loadedClients);
      setEquipments(loadedEquipments);
      setStock(loadedStock);
      setFormTemplates(loadedFormTemplates);
      setActivationRules(loadedRules);
      setQuotes(loadedQuotes || []);
      setRegions(loadedRegions || []);

      if (loadedDefects && loadedDefects.length > 0) {
        const activeDefects = loadedDefects.filter(d => d.active !== false);
        setDefectTypes(activeDefects);
      }

      if (loadedServiceTypes && loadedServiceTypes.length > 0) {
        const activeTypes = loadedServiceTypes.filter(t => t.active !== false && t.is_active !== false);
        const typesToUse = activeTypes.length > 0 ? activeTypes : loadedServiceTypes;
        setServiceTypes(typesToUse);
        if (!initialData && typesToUse.length > 0) {
          setFormData(prev => ({ ...prev, operationType: typesToUse[0].name }));
        }
      }

      // Se estiver editando, tentar encontrar o ID do cliente e equipamentos
      if (initialData) {
        const client = loadedClients.find(c => c.name === initialData.customerName);
        if (client) setSelectedClientId(client.id);

        const equip = loadedEquipments.find(e => e.serialNumber === initialData.equipmentSerial);
        if (equip) setSelectedEquipIds([equip.id]);
      }

      // Pré-seleção via solicitação (prefill) — abre no step 1 mas já com cliente marcado
      if (!initialData && prefill) {
        let client = null;

        if (prefill.customerId) {
          client = loadedClients.find(c => c.id === prefill.customerId);
        }

        // Fallback: tentar casar por documento
        if (!client && prefill.customerDocument) {
          const docRaw = prefill.customerDocument.replace(/[.\-\/]/g, '');
          client = loadedClients.find(c => {
            const cDoc = (c.document || c.cpf || c.cnpj || '').replace(/[.\-\/]/g, '');
            return cDoc && cDoc === docRaw;
          });
        }

        // Fallback: tentar casar por nome exato
        if (!client && prefill.customerName) {
          const nameLower = prefill.customerName.toLowerCase().trim();
          client = loadedClients.find(c => c.name.toLowerCase().trim() === nameLower);
        }

        if (client) {
          setSelectedClientId(client.id);
          setClientSearch(client.name);
          const fullAddress = client.address + (client.number ? `, ${client.number}` : '') + (client.city ? ` - ${client.city}` : '');
          setFormData(prev => ({ ...prev, customerName: client.name, customerAddress: fullAddress }));
        }

        // Se veio com serial/nome de equipamento, pré-selecionar também
        if (prefill.equipmentSerial) {
          const equip = loadedEquipments.find(
            e => e.serialNumber === prefill.equipmentSerial ||
                 e.model?.toLowerCase() === prefill.equipmentName?.toLowerCase()
          );
          if (equip) setSelectedEquipIds([equip.id]);
        }

        // Pré-preencher descrição e título
        if (prefill.description) {
          setFormData(prev => ({
            ...prev,
            description: prefill.description || '',
            title: prefill.equipmentName ? `${prefill.equipmentName} — chamado via WhatsApp` : 'Chamado via WhatsApp',
          }));
        }
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

  const checkOpenOrderForEquipment = async (equip: any) => {
    if (initialData || !equip || !equip.serialNumber || equip.serialNumber === '-') return;
    
    try {
      const { data } = await supabase.from('orders')
        .select('display_id, status')
        .eq('equipment_serial', equip.serialNumber)
        .in('status', ['PENDENTE', 'ATRIBUÍDO', 'EM DESLOCAMENTO', 'EM ANDAMENTO', 'IMPEDIDO'])
        .limit(1);
        
      if (data && data.length > 0) {
        setOpenOrderWarning(data[0].display_id);
      } else {
        setOpenOrderWarning(null);
      }
    } catch (e) {
      console.error('Erro ao checar OS aberta', e);
    }
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
      checkOpenOrderForEquipment(equip);
    }
  };

  const handleEquipmentToggle = (id: string) => {
    const isSelecting = !selectedEquipIds.includes(id);
    setSelectedEquipIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );

    if (isSelecting) {
      const equip = equipments.find(e => e.id === id);
      checkOpenOrderForEquipment(equip);
    } else {
      setOpenOrderWarning(null);
    }
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

    // 🧠 Nexus FormRulesEngine: Prioridade e Especificidade
    // 1. Encontra regras compatíveis com a Modalidade (Tipo de OS)
    const rulesForService = activationRules.filter(r => 
      r.service_type_id === serviceTypeId || r.serviceTypeId === serviceTypeId
    );
    
    // 2. Busca o match EXATO (Modalidade + Família do Equipamento)
    let matchingRule = rulesForService.find(r => r.equipmentFamily === targetFamily);
    
    // 3. Fallback: Se não tem regra específica para a família, busca a regra genérica 'Todos'
    if (!matchingRule) {
      matchingRule = rulesForService.find(r => !r.equipmentFamily || r.equipmentFamily === 'Todos');
    }

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
      showAlert('Selecione um cliente para prosseguir.', 'warning');
      return;
    }
    if (selectedEquipIds.length === 0 && !initialData) {
      showAlert('Selecione ao menos um ativo para o atendimento.', 'warning');
      return;
    }
    setStep2Attempted(false);
    setStep(2);
  };

  const goToStep3 = () => {
    setStep2Attempted(true);
    const missingFields: string[] = [];
    if (!formData.scheduledDate?.trim()) missingFields.push('Data Agendada');
    if (!formData.scheduledTime?.trim()) missingFields.push('Horário Previsto');
    if (!formData.operationType?.trim()) missingFields.push('Modalidade');
    if (!formData.priority) missingFields.push('Prioridade');
    if (!formData.defectTypeCode?.trim() && !formData.defectTypeId?.trim()) {
      missingFields.push('Tipo de Defeito Reportado');
    }

    if (missingFields.length > 0) {
      showAlert(
        `Para avançar para o passo 3, preencha todos os campos obrigatórios da Etapa 2:\n\n${missingFields.map(f => `• ${f}`).join('\n')}`,
        'warning'
      );
      return;
    }

    // Validação de data retroativa
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(formData.scheduledDate + 'T12:00:00');
    if (selectedDate < today) {
      showAlert('A data de agendamento não pode ser anterior ao dia de hoje.', 'error');
      return;
    }

    // Validação de geofencing: se técnico foi selecionado, valida se atende a região
    if (isGeofencingEnabled && allowedTechIds !== null && formData.assignedTo) {
      const isTechAllowed = allowedTechIds.includes(formData.assignedTo);
      if (!isTechAllowed) {
        const techName = technicians.find(t => t.id === formData.assignedTo)?.name || 'selecionado';
        showAlert(`O técnico "${techName}" não atende a região demarcada do cliente. Por favor, selecione um técnico autorizado para esta área antes de continuar.`, 'error');
        return;
      }
    }

    setStep(3);
  };


  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    console.log('=== INICIANDO CRIAÇÃO DE ORDEM ===');
    console.log('FormData:', formData);

    if (!selectedClientId) {
      alert('A seleção de um cliente é obrigatória. Por favor, retorne à etapa 1 e selecione um cliente.');
      return;
    }

    if (selectedEquipIds.length === 0) {
      alert('A seleção de um ativo é obrigatória. Por favor, retorne à etapa 1 e selecione um ativo.');
      return;
    }

    if (!formData.scheduledDate) {
      showAlert('A data de agendamento é obrigatória.', 'warning');
      return;
    }

    if (!formData.scheduledTime) {
      showAlert('O horário previsto é obrigatório.', 'warning');
      return;
    }

    if (!formData.operationType) {
      showAlert('A modalidade é obrigatória.', 'warning');
      return;
    }

    if (!formData.defectTypeCode && !formData.defectTypeId) {
      showAlert('O tipo de defeito reportado é obrigatório.', 'warning');
      return;
    }

    if (!formData.title) {
      showAlert('O título da ordem é obrigatório.', 'warning');
      return;
    }

    if (!formData.description) {
      showAlert('A descrição é obrigatória.', 'warning');
      return;
    }

    // 🛡️ Nexus Integrity Check: Validação de data retroativa
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const selectedDate = new Date(formData.scheduledDate + 'T12:00:00');

    if (selectedDate < today) {
      showAlert('A data de agendamento não pode ser anterior ao dia de hoje.', 'error');
      return;
    }

    setLoading(true);
    try {
      const selectedEquip = equipments.find(e => e.id === selectedEquipIds[0]);

      const finalData = {
        ...formData,
        customerId: selectedClientId || undefined,
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
      // Dar baixa no estoque do técnico apenas se a OS já estiver concluída.
      if (formData.assignedTo && items.some(i => i.fromStock) && isCompleted) {
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



  const filteredClients = clients.filter(c => {
    if (!clientSearch.trim()) return true;
    const q = clientSearch.toLowerCase();
    const qRaw = q.replace(/[.\-\/]/g, ''); // Remove pontuação para comparar CPF/CNPJ
    const nameMatch = c.name.toLowerCase().includes(q);
    const docRaw = (c.document || c.cpf || c.cnpj || '').replace(/[.\-\/]/g, '');
    const docMatch = docRaw && docRaw.includes(qRaw);
    return nameMatch || docMatch;
  });

  const filteredSerials = equipments.filter(e =>
    e.serialNumber.toLowerCase().includes(serialSearch.toLowerCase())
  );

  const allowedTechIds = React.useMemo(() => {
    if (!isGeofencingEnabled) return null; // Bypass filter se a configuração estiver desativada
    if (!selectedClientId) return null; // null means all allowed
    const client = clients.find(c => c.id === selectedClientId);
    if (!client || !client.latitude || !client.longitude) return null;

    const pt = turf.point([client.longitude, client.latitude]);
    
    // Verifica regiões ativas com polígono
    const activeRegions = regions.filter(r => r.is_active && r.polygon_geojson);
    const matchingRegions = activeRegions.filter(r => {
      try {
        return turf.booleanPointInPolygon(pt, r.polygon_geojson as any);
      } catch (e) {
        return false;
      }
    });

    if (matchingRegions.length === 0) return null; // Nenhuma região cobre, todos liberados

    // Se estiver em uma ou mais regiões, libera apenas técnicos associados a elas
    const techIds = new Set<string>();
    matchingRegions.forEach(r => {
      if (r.technician_ids) {
        r.technician_ids.forEach(id => techIds.add(id));
      }
    });

    return Array.from(techIds);
  }, [selectedClientId, clients, regions]);

  // 📍 Geofencing Auto-Suggest: Sugere/Pre-seleciona automaticamente o técnico da região quando Geofencing está ativo
  useEffect(() => {
    if (isGeofencingEnabled && allowedTechIds && allowedTechIds.length > 0 && !initialData) {
      if (!formData.assignedTo || !allowedTechIds.includes(formData.assignedTo)) {
        const firstAllowed = technicians.find(t => allowedTechIds.includes(t.id));
        if (firstAllowed) {
          setFormData(prev => ({
            ...prev,
            assignedTo: firstAllowed.id,
            status: OrderStatus.ASSIGNED
          }));
        }
      }
    }
  }, [allowedTechIds, isGeofencingEnabled, initialData, technicians]);

  const filteredTechs = React.useMemo(() => {
    const q = techSearch.toLowerCase().trim();
    
    const filtered = technicians.filter(t => {
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || (t.email || '').toLowerCase().includes(q);
    });

    if (!isGeofencingEnabled || allowedTechIds === null) return filtered;

    // Coloca os técnicos designados para a área PRIMEIRO na lista!
    return [...filtered].sort((a, b) => {
      const aAllowed = allowedTechIds.includes(a.id);
      const bAllowed = allowedTechIds.includes(b.id);
      if (aAllowed && !bAllowed) return -1;
      if (!aAllowed && bAllowed) return 1;
      return 0;
    });
  }, [technicians, techSearch, allowedTechIds, isGeofencingEnabled]);

  const addItem = (item: Partial<OrderItem>) => {
    const newItem: OrderItem = {
      id: Math.random().toString(36).substr(2, 9),
      description: item.description || '',
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || 0,
      total: (item.quantity || 1) * (item.unitPrice || 0),
      fromStock: item.fromStock || false,
      stockItemId: item.stockItemId,
      customerId: selectedClientId || undefined,
      usedById: formData.assignedTo || undefined
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
      scheduledDate: getTodayLocalDate(),
      scheduledTime: '',
      notes: ''
    });
    setVisitItems([]);
    setVisitStockSearch('');
    setIsVisitStockListOpen(false);
    setShowNewVisitModal(true);
  };

  const addVisitItem = (item: Partial<OrderItem>) => {
    const newItem: OrderItem = {
      id: Math.random().toString(36).substr(2, 9),
      description: item.description || '',
      quantity: item.quantity || 1,
      unitPrice: item.unitPrice || 0,
      total: (item.quantity || 1) * (item.unitPrice || 0),
      fromStock: item.fromStock,
      stockItemId: item.stockItemId
    };
    setVisitItems(prev => [...prev, newItem]);
  };

  const removeVisitItem = (id: string) => {
    setVisitItems(prev => prev.filter(i => i.id !== id));
  };

  const updateVisitItem = (id: string, updates: Partial<OrderItem>) => {
    setVisitItems(prev => prev.map(i => {
      if (i.id !== id) return i;
      const updated = { ...i, ...updates };
      const q = typeof updated.quantity === 'number' ? updated.quantity : parseFloat(String(updated.quantity)) || 0;
      const u = typeof updated.unitPrice === 'number' ? updated.unitPrice : parseFloat(String(updated.unitPrice)) || 0;
      updated.total = q * u;
      return updated;
    }));
  };

  const visitTotalValue = visitItems.reduce((acc, i) => acc + (Number(i.total) || (Number(i.unitPrice || 0) * Number(i.quantity || 1)) || 0), 0);

  const confirmScheduleNewVisit = async () => {
    if (!initialData || !newVisitData.assignedTo || !newVisitData.scheduledDate) {
      alert("Selecione um técnico e uma data para a visita.");
      return;
    }
    setSchedulingVisit(true);
    try {
      // Busca visitas existentes para determinar o próximo número sequencial
      const existingVisits = await VisitService.getVisitsByOrderId(initialData.id);
      const nextVisitNum = existingVisits.length + 1;

      const itemsToConsolidate: OrderItem[] = visitItems.map(i => ({ ...i, visitNumber: nextVisitNum }));

      const validVisitItems = itemsToConsolidate
        .filter(i => {
          const tot = Number(i.total) || (Number(i.unitPrice || 0) * Number(i.quantity || 1)) || 0;
          return tot > 0 || Number(i.unitPrice || 0) > 0;
        })
        .map(i => {
          const qty = Number(i.quantity) || 1;
          const unit = Number(i.unitPrice) || 0;
          const tot = Number(i.total) || (qty * unit);
          return {
            ...i,
            id: i.id || `visit-item-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            description: i.description?.trim() || `Item / Peça - Visita nº ${nextVisitNum}`,
            quantity: qty,
            unitPrice: unit,
            total: tot,
            visitNumber: nextVisitNum,
          };
        });

      // Usa VisitService com guardas enterprise de estado e soma de custos/peças
      await VisitService.createNewVisit({
        orderId: initialData.id,
        orderStatus: localStatus || initialData.status,
        technicianId: newVisitData.assignedTo,
        scheduledDate: newVisitData.scheduledDate,
        scheduledTime: newVisitData.scheduledTime,
        notes: newVisitData.notes,
        items: validVisitItems,
      });
      alert("Nova visita agendada com sucesso!");
      setShowNewVisitModal(false);
      setTimelineKey(prev => prev + 1);
      setLocalStatus(OrderStatus.ASSIGNED);
      if (validVisitItems.length > 0) {
        setItems(prev => {
          const prevMap = new Map<string, OrderItem>();
          prev.map(i => ({ ...i, visitNumber: i.visitNumber || 1 })).forEach(i => prevMap.set(i.id || `${i.description}-${i.unitPrice}`, i));
          validVisitItems.forEach(i => prevMap.set(i.id || `${i.description}-${i.unitPrice}`, i));
          return Array.from(prevMap.values());
        });
      }
      setVisitItems([]);
      setVisitStockSearch('');
      setNewVisitData({ assignedTo: '', scheduledDate: '', scheduledTime: '', notes: '' });
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

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden">
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
                  Buscar Cliente
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
                            <p className="text-[10px] text-slate-400 font-medium truncate max-w-sm mt-0.5">
                              {(c.document || c.cpf || c.cnpj) && <span className="font-mono mr-2">{c.document || c.cpf || c.cnpj}</span>}
                              {c.address}
                            </p>
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
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider border-b border-slate-200">
                          <th className="px-4 py-3 w-12 text-center">Sel.</th>
                          <th className="px-4 py-3">Modelo do Equipamento</th>
                          <th className="px-4 py-3">Nº de Série</th>
                          <th className="px-4 py-3 text-center">Status (Garantia)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {equipments.filter(e => e.customerId === selectedClientId).map(eq => {
                          const isSelected = selectedEquipIds.includes(eq.id);
                          return (
                            <tr
                              key={eq.id}
                              onClick={() => !isReadOnly && handleEquipmentToggle(eq.id)}
                              className={`transition-colors cursor-pointer group ${isSelected
                                ? 'bg-indigo-50/40 hover:bg-indigo-50/60'
                                : 'hover:bg-slate-50/70'
                                } ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <td className="px-4 py-3.5 text-center shrink-0">
                                <input
                                  type="checkbox"
                                  className="w-4 h-4 rounded border-slate-300 text-[#1c2d4f] focus:ring-[#1c2d4f] cursor-pointer"
                                  checked={isSelected}
                                  readOnly
                                />
                              </td>
                              <td className="px-4 py-3.5">
                                <p className="text-xs font-bold text-slate-800">{eq.model}</p>
                              </td>
                              <td className="px-4 py-3.5">
                                <p className="text-xs font-mono text-slate-500 font-medium">#{eq.serialNumber}</p>
                              </td>
                              <td className="px-4 py-3.5 text-center">
                                {eq.manufactureDate && eq.warrantyMonths ? (
                                  <span className={`inline-flex items-center justify-center px-2 py-1 rounded-md text-[9px] font-bold border ${checkWarrantyStatus(eq.manufactureDate, eq.warrantyMonths) ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-rose-50 text-rose-600 border-rose-100'}`}>
                                    {checkWarrantyStatus(eq.manufactureDate, eq.warrantyMonths) ? 'Em Garantia' : 'Fora de Garantia'}
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded-md">N/D</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                        {equipments.filter(e => e.customerId === selectedClientId).length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-12 text-center bg-slate-50/30">
                              <Box size={32} className="mx-auto text-slate-300 mb-3" />
                              <p className="text-xs font-semibold text-slate-500">Nenhum ativo registrado para esta unidade</p>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  {openOrderWarning && (
                    <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-2 animate-in fade-in slide-in-from-top-1">
                      <Info className="text-amber-500 mt-0.5 shrink-0" size={14} />
                      <p className="text-xs text-amber-700 font-medium leading-relaxed">
                        <strong className="font-bold">Aviso:</strong> Já existe uma OS em aberto ({openOrderWarning}) para o equipamento selecionado. 
                        Você pode continuar normalmente com a criação deste protocolo se for um novo atendimento independente.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="animate-fade-in max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* COLUNA ESQUERDA: PROGRAMAÇÃO E TIPO DE DEFEITO */}
              <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Cabeçalho do Bloco */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-4 bg-[#1c2d4f] rounded-full" />
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">Programação & Defeito</h3>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                      Etapa 2 de 5
                    </span>
                  </div>

                  {/* Grid de Agendamento */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    {/* Data Agendada */}
                    <div className="sm:col-span-6 space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 ml-0.5">
                        <Calendar size={12} className="text-slate-400" />
                        Data Agendada <span className="text-rose-500">*</span>
                      </label>
                      <Input
                        type="date"
                        required
                        min={getLocalDate()}
                        disabled={isReadOnly}
                        className={`rounded-xl font-semibold text-xs py-2.5 disabled:opacity-50 w-full transition-colors ${
                          step2Attempted && !formData.scheduledDate
                            ? 'border-rose-400 bg-rose-50/30 ring-1 ring-rose-400/20'
                            : 'border-slate-200 bg-slate-50/50 focus:bg-white'
                        }`}
                        value={formData.scheduledDate}
                        onChange={e => setFormData({ ...formData, scheduledDate: e.target.value })}
                      />
                    </div>

                    {/* Horário Previsto */}
                    <div className="sm:col-span-6 space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 ml-0.5">
                        <Clock size={12} className="text-slate-400" />
                        Horário Previsto <span className="text-rose-500">*</span>
                      </label>
                      <Input
                        type="time"
                        disabled={isReadOnly}
                        className={`rounded-xl font-semibold text-xs py-2.5 disabled:opacity-50 w-full transition-colors ${
                          step2Attempted && !formData.scheduledTime
                            ? 'border-rose-400 bg-rose-50/30 ring-1 ring-rose-400/20'
                            : 'border-slate-200 bg-slate-50/50 focus:bg-white'
                        }`}
                        value={formData.scheduledTime}
                        onChange={e => setFormData({ ...formData, scheduledTime: e.target.value })}
                      />
                    </div>

                    {/* Modalidade */}
                    <div className="sm:col-span-7 space-y-1.5 relative">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 ml-0.5">
                        <Building2 size={12} className="text-slate-400" />
                        Modalidade <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => !isReadOnly && setIsOperationTypeOpen(!isOperationTypeOpen)}
                          onBlur={() => setTimeout(() => setIsOperationTypeOpen(false), 200)}
                          className={`w-full hover:bg-slate-50 border rounded-xl px-3.5 py-2.5 text-left text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] transition-all flex justify-between items-center disabled:opacity-50 ${
                            step2Attempted && !formData.operationType
                              ? 'border-rose-400 bg-rose-50/30 ring-1 ring-rose-400/20'
                              : 'border-slate-200 bg-slate-50/50'
                          }`}
                        >
                          <span className="truncate">{formData.operationType || 'Selecione...'}</span>
                          <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${isOperationTypeOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isOperationTypeOpen && (
                          <div className="absolute z-[170] top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-52 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-top-1">
                            {serviceTypes.filter(type => type.active !== false && type.is_active !== false).map(type => (
                              <button
                                key={type.id || type.name}
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, operationType: type.name });
                                  setIsOperationTypeOpen(false);
                                }}
                                className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 text-xs font-bold text-slate-700 hover:text-[#1c2d4f] border-b border-slate-100 last:border-0 transition-colors"
                              >
                                {type.name}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Nível de Prioridade */}
                    <div className="sm:col-span-5 space-y-1.5 relative">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 ml-0.5">
                        <AlertCircle size={12} className="text-slate-400" />
                        Prioridade <span className="text-rose-500">*</span>
                      </label>
                      <div className="relative">
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => !isReadOnly && setIsPriorityOpen(!isPriorityOpen)}
                          onBlur={() => setTimeout(() => setIsPriorityOpen(false), 200)}
                          className={`w-full hover:bg-slate-50 border rounded-xl px-3 py-2 text-left text-xs font-bold text-slate-700 focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] transition-all flex justify-between items-center disabled:opacity-50 h-[38px] ${
                            step2Attempted && !formData.priority
                              ? 'border-rose-400 bg-rose-50/30 ring-1 ring-rose-400/20'
                              : 'border-slate-200 bg-slate-50/50'
                          }`}
                        >
                          <span className="truncate flex items-center">
                            <PriorityBadge priority={formData.priority as OrderPriority} />
                          </span>
                          <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${isPriorityOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isPriorityOpen && (
                          <div className="absolute z-[170] top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-1">
                            {Object.values(OrderPriority).map(p => (
                              <button
                                key={p}
                                type="button"
                                onClick={() => {
                                  setFormData({ ...formData, priority: p as OrderPriority });
                                  setIsPriorityOpen(false);
                                }}
                                className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 text-xs font-bold text-slate-700 hover:text-[#1c2d4f] border-b border-slate-100 last:border-0 transition-colors flex items-center"
                              >
                                <PriorityBadge priority={p as OrderPriority} />
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Tipo de Defeito */}
                    <div className="sm:col-span-12 space-y-1.5 relative" ref={defectDropdownRef}>
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 ml-0.5">
                          <Hash size={12} className="text-slate-400" />
                          Tipo de Defeito Reportado <span className="text-rose-500">*</span>
                        </label>
                        {formData.defectTypeCode && (
                          <button
                            type="button"
                            disabled={isReadOnly}
                            onClick={() => setFormData({ ...formData, defectTypeId: '', defectTypeCode: '', defectTypeName: '' })}
                            className="text-[10px] font-bold text-rose-500 hover:text-rose-600 disabled:opacity-50 transition-colors"
                          >
                            Limpar seleção
                          </button>
                        )}
                      </div>
                      <div className="relative">
                        <button
                          type="button"
                          disabled={isReadOnly}
                          onClick={() => !isReadOnly && setIsDefectDropdownOpen(!isDefectDropdownOpen)}
                          className={`w-full hover:bg-slate-50 border rounded-xl px-3.5 py-2.5 text-left text-xs font-semibold text-slate-700 focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] transition-all flex justify-between items-center disabled:opacity-50 shadow-sm ${
                            step2Attempted && !formData.defectTypeCode
                              ? 'border-rose-400 bg-rose-50/30 ring-1 ring-rose-400/20'
                              : 'border-slate-200 bg-slate-50/50'
                          }`}
                        >
                          {formData.defectTypeCode ? (
                            <div className="flex items-center gap-2 truncate">
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-amber-50 text-amber-700 font-mono text-[11px] font-bold border border-amber-200">
                                <Hash size={11} className="text-amber-500" />
                                {formData.defectTypeCode}
                              </span>
                              <span className="font-bold text-slate-800 truncate">{formData.defectTypeName}</span>
                            </div>
                          ) : (
                            <span className="text-slate-400">Selecione o tipo de defeito (código de 4 dígitos)...</span>
                          )}
                          <ChevronDown size={15} className={`shrink-0 text-slate-400 transition-transform ${isDefectDropdownOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isDefectDropdownOpen && (
                          <div className="absolute z-[180] top-full mt-1.5 w-full bg-white border border-slate-200 rounded-xl shadow-2xl max-h-56 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1">
                            <div className="p-2 border-b border-slate-100 bg-slate-50/70">
                              <div className="relative">
                                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                                <input
                                  type="text"
                                  placeholder="Buscar por código ou nome..."
                                  value={defectSearch}
                                  onChange={e => setDefectSearch(e.target.value)}
                                  className="w-full bg-white border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 outline-none focus:border-[#1c2d4f]"
                                  autoFocus
                                />
                              </div>
                            </div>
                            <div className="overflow-y-auto max-h-44 custom-scrollbar divide-y divide-slate-100">
                              {defectTypes
                                .filter(d => {
                                  const term = defectSearch.toLowerCase().trim();
                                  if (!term) return true;
                                  return d.code.toLowerCase().includes(term) || d.name.toLowerCase().includes(term) || (d.description || '').toLowerCase().includes(term);
                                })
                                .map(defect => (
                                  <button
                                    key={defect.id || defect.code}
                                    type="button"
                                    onClick={() => {
                                      setFormData({
                                        ...formData,
                                        defectTypeId: defect.id || '',
                                        defectTypeCode: defect.code,
                                        defectTypeName: defect.name
                                      });
                                      setIsDefectDropdownOpen(false);
                                      setDefectSearch('');
                                    }}
                                    className="w-full text-left px-3.5 py-2.5 hover:bg-slate-50 transition-colors flex items-center justify-between gap-3 group"
                                  >
                                    <div className="flex items-center gap-2.5 min-w-0">
                                      <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[11px] font-bold border border-slate-200 group-hover:bg-[#1c2d4f] group-hover:text-white transition-colors">
                                        <Hash size={10} />
                                        {defect.code}
                                      </span>
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-800 truncate">{defect.name}</p>
                                        {defect.description && (
                                          <p className="text-[10px] text-slate-400 truncate max-w-sm">{defect.description}</p>
                                        )}
                                      </div>
                                    </div>
                                    {formData.defectTypeCode === defect.code && (
                                      <CheckCircle2 size={15} className="text-[#1c2d4f] shrink-0" />
                                    )}
                                  </button>
                                ))}
                              {defectTypes.length === 0 && (
                                <div className="p-4 text-center text-xs text-slate-400 font-medium">
                                  Nenhum tipo de defeito cadastrado na aba "Tipos de Defeitos".
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Informação no rodapé da coluna esquerda */}
                <div className="mt-4 p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/60 flex items-center gap-2 text-[11px] text-slate-500">
                  <Info size={13} className="text-[#1c2d4f] shrink-0" />
                  <span className="truncate">Defeito técnico classificado por código de 4 dígitos para fins de rastreabilidade.</span>
                </div>
              </div>

              {/* COLUNA DIREITA: RESPONSÁVEL TÉCNICO */}
              <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="space-y-4 flex-1 flex flex-col">
                  {/* Cabeçalho do Bloco */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-4 bg-emerald-500 rounded-full" />
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                        Responsável Técnico
                        <span className="text-[10px] font-normal text-slate-400 lowercase">(opcional)</span>
                      </h3>
                    </div>
                    {formData.assignedTo ? (
                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200 flex items-center gap-1">
                        <CheckCircle2 size={11} /> Definido
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                        Em Triagem (Sem Vínculo)
                      </span>
                    )}
                  </div>

                  {/* Banner Geofencing se ativo */}
                  {isGeofencingEnabled && allowedTechIds !== null && (
                    <div className="p-2.5 bg-emerald-50/70 border border-emerald-200/80 rounded-xl flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin size={13} className="text-emerald-600 shrink-0" />
                        <p className="text-[10px] font-medium text-emerald-800">
                          {allowedTechIds.length > 0
                            ? `${allowedTechIds.length} técnico(s) designado(s)`
                            : 'Endereço fora das regiões demarcadas'}
                        </p>
                      </div>
                      {allowedTechIds.length > 0 && (
                        <span className="text-[8px] font-bold text-emerald-800 bg-emerald-200/80 px-1.5 py-0.5 rounded-full uppercase">
                          Geofencing
                        </span>
                      )}
                    </div>
                  )}

                  {/* Busca de Técnico */}
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                    <input
                      placeholder={isGeofencingEnabled && allowedTechIds !== null ? "Pesquisar técnico designado..." : "Pesquisar por nome ou e-mail..."}
                      value={techSearch}
                      onChange={e => setTechSearch(e.target.value)}
                      className="w-full bg-slate-50/50 border border-slate-200 rounded-xl pl-8 pr-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-[#1c2d4f] focus:bg-white transition-all placeholder:text-slate-400"
                    />
                  </div>

                  {/* Lista de Técnicos com scroll dedicado */}
                  <div className="flex-1 space-y-2 overflow-y-auto pr-1.5 custom-scrollbar max-h-[220px]">
                    {/* Botão Sem Vínculo (Manter Pendente) */}
                    <button
                      type="button"
                      onClick={() => handleSelectTechnician('')}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${formData.assignedTo === ''
                        ? 'border-amber-300 bg-amber-50/70 shadow-sm'
                        : 'border-slate-100 bg-slate-50/40 hover:border-slate-200 hover:bg-slate-50'
                        }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center border shrink-0 transition-colors ${formData.assignedTo === '' ? 'bg-amber-400 border-amber-500 text-white' : 'bg-white border-slate-200 text-slate-400'
                        }`}>
                        <UserMinus size={15} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-bold text-slate-800">Sem Vínculo (Manter Pendente)</p>
                        <p className="text-[9px] text-slate-500 font-medium truncate">Alocar técnico posteriormente via triagem</p>
                      </div>
                      {formData.assignedTo === '' && <CheckCircle2 size={14} className="text-amber-600 shrink-0" />}
                    </button>
                    {/* Lista de Técnicos */}
                    {filteredTechs.map(t => {
                      const isAllowed = allowedTechIds === null || allowedTechIds.includes(t.id);
                      const isDesignated = allowedTechIds !== null && allowedTechIds.includes(t.id);
                      const isSelected = formData.assignedTo === t.id;
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => {
                            if (!isAllowed) {
                              showAlert(`O técnico ${t.name} não atende a região onde o cliente está localizado. Selecione um técnico autorizado para esta área.`, 'error');
                              return;
                            }
                            handleSelectTechnician(t.id);
                          }}
                          className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${
                            !isAllowed
                              ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-100'
                              : isSelected
                              ? 'border-[#1c2d4f] bg-[#1c2d4f]/5 shadow-sm'
                              : isDesignated
                              ? 'border-emerald-200 bg-emerald-50/30 hover:border-emerald-300 hover:bg-emerald-50/60'
                              : 'border-slate-100 bg-slate-50/40 hover:border-slate-200 hover:bg-slate-50'
                            }`}
                        >
                          <div className="relative shrink-0">
                            <img src={t.avatar} className="w-8 h-8 rounded-lg object-cover border border-slate-200" alt={t.name} />
                            {!isAllowed ? (
                              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 rounded-full flex items-center justify-center" title="Fora da região">
                                <span className="text-white text-[7px] font-bold">✕</span>
                              </div>
                            ) : isDesignated && (
                              <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center shadow-sm" title="Designado">
                                <span className="text-white text-[8px] font-bold">★</span>
                              </div>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[11px] font-bold text-slate-800 truncate">{t.name}</p>
                              {isDesignated && (
                                <span className="text-[8px] font-bold text-emerald-800 bg-emerald-100 px-1 py-0.2 rounded border border-emerald-200 shrink-0">
                                  Região
                                </span>
                              )}
                            </div>
                            <p className="text-[9px] font-medium truncate text-slate-400">
                              {!isAllowed ? <span className="text-rose-400">Fora da área demarcada</span> : t.email}
                            </p>
                          </div>
                          {isSelected && <CheckCircle2 size={14} className="text-[#1c2d4f] shrink-0" />}
                        </button>
                      );
                    })}

                    {technicians.length === 0 && (
                      <div className="py-4 text-center">
                        <p className="text-xs text-slate-400 font-medium">Nenhum técnico cadastrado no sistema.</p>
                      </div>
                    )}

                    {techSearch.trim() && filteredTechs.length === 0 && technicians.length > 0 && (
                      <div className="py-4 text-center">
                        <p className="text-xs text-slate-400 font-medium">Nenhum técnico encontrado para "{techSearch}".</p>
                      </div>
                    )}
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
                          <div className="flex items-center gap-2">
                            <input type="text" value={item.description} disabled={isReadOnly}
                              onChange={e => updateItem(item.id, { description: e.target.value })}
                              placeholder="Descreva o item..."
                              className="bg-transparent border-none text-[11px] font-semibold text-slate-700 outline-none w-full placeholder:text-slate-300 disabled:opacity-50" />
                            {item.visitNumber && item.visitNumber > 1 && (
                              <span className="shrink-0 text-[9px] font-bold text-[#1c2d4f] bg-[#1c2d4f]/10 px-1.5 py-0.5 rounded border border-[#1c2d4f]/20">
                                Visita {item.visitNumber}
                              </span>
                            )}
                          </div>
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
              {(() => {
                const term = quoteSearch.trim().toLowerCase();
                const tokens = term ? term.split(/\s+/).filter(Boolean) : [];
                const searchedQuotes = tokens.length > 0
                  ? quotes.filter(q => {
                      if (linkedQuoteIds.includes(q.id)) return false;
                      const searchable = `${q.displayId || ''} ${q.title || ''} ${q.customerName || ''} ${q.description || ''}`.toLowerCase();
                      return tokens.every(token => searchable.includes(token));
                    })
                  : [];

                return (
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase px-1">
                      {term ? `Resultados da Busca (${searchedQuotes.length})` : 'Buscar Orçamentos'}
                    </label>
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden min-h-[160px] max-h-[320px] overflow-y-auto custom-scrollbar">
                      {!term ? (
                        <div className="px-6 py-12 text-center flex flex-col items-center justify-center">
                          <div className="w-12 h-12 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 mb-3 border border-slate-200/60">
                            <Search size={20} />
                          </div>
                          <p className="text-xs font-bold text-slate-700">Digite para buscar orçamentos</p>
                          <p className="text-[11px] text-slate-400 font-medium max-w-sm mt-1">
                            Insira o código, título ou cliente no campo acima para pesquisar e vincular orçamentos a esta OS.
                          </p>
                        </div>
                      ) : searchedQuotes.length > 0 ? (
                        searchedQuotes.map(q => (
                          <button
                            key={q.id}
                            onClick={() => !isReadOnly && setLinkedQuoteIds(prev => [...prev, q.id])}
                            disabled={isReadOnly}
                            className="w-full text-left px-3.5 py-3 hover:bg-slate-50 flex items-center justify-between border-b border-slate-100 last:border-0 transition-colors group disabled:opacity-50"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center group-hover:bg-[#1c2d4f10] border border-slate-100 transition-colors">
                                <FileText size={14} className="text-slate-400 group-hover:text-[#1c2d4f]" />
                              </div>
                              <div>
                                <p className="text-xs font-bold text-slate-700 group-hover:text-[#1c2d4f]">{q.displayId || q.title}</p>
                                <p className="text-[10px] text-slate-400 font-medium">{q.customerName || 'Cliente não informado'} • R$ {(q.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${q.status === 'APROVADO' ? 'bg-emerald-100 text-emerald-700' : q.status === 'REJEITADO' ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'}`}>{q.status}</span>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#1c2d4f] bg-slate-100 group-hover:bg-[#1c2d4f] group-hover:text-white px-2 py-1 rounded-md transition-colors">
                                <Plus size={12} /> Vincular
                              </span>
                            </div>
                          </button>
                        ))
                      ) : (
                        <div className="px-6 py-10 text-center">
                          <FileText size={24} className="mx-auto text-slate-300 mb-2" />
                          <p className="text-xs font-bold text-slate-600">Nenhum orçamento encontrado</p>
                          <p className="text-[11px] text-slate-400 mt-1">Nenhum resultado corresponde à sua busca "{quoteSearch}".</p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {step === 5 && (
            <div className="animate-fade-in max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              {/* COLUNA ESQUERDA: RESUMO EXECUTIVO DO PROTOCOLO */}
              <div className="lg:col-span-5 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Cabeçalho do Bloco */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-4 bg-emerald-500 rounded-full" />
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">Resumo do Protocolo</h3>
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1">
                      <CheckCircle2 size={11} /> Etapa Final
                    </span>
                  </div>

                  {/* Detalhes do Atendimento */}
                  <div className="space-y-2.5">
                    {/* Cliente */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#1c2d4f] shrink-0 shadow-2xs">
                        <Building2 size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Cliente Solicitante</p>
                        <p className="font-bold text-slate-800 truncate text-xs">
                          {clients.find(c => c.id === selectedClientId)?.name || formData.customerName || 'Cliente não selecionado'}
                        </p>
                      </div>
                    </div>

                    {/* Equipamento */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#1c2d4f] shrink-0 shadow-2xs">
                        <Laptop size={14} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Equipamento / Ativo</p>
                        <p className="font-bold text-slate-800 truncate text-xs">
                          {equipments.find(e => selectedEquipIds.includes(e.id))?.model || formData.equipmentName || 'Equipamento'}
                          {formData.equipmentSerial && formData.equipmentSerial !== '-' && (
                            <span className="text-slate-500 font-normal ml-1.5 font-mono text-[11px]">({formData.equipmentSerial})</span>
                          )}
                        </p>
                      </div>
                    </div>

                    {/* Programação & Prioridade */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Calendar size={11} className="text-slate-400" /> Programação
                        </p>
                        <p className="font-bold text-slate-800 text-xs truncate mt-1">
                          {formData.scheduledDate ? (formData.scheduledDate.includes('-') ? formData.scheduledDate.split('-').reverse().join('/') : formData.scheduledDate) : 'Hoje'}
                          {formData.scheduledTime ? ` às ${formData.scheduledTime}` : ''}
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <AlertCircle size={11} className="text-slate-400" /> Prioridade
                        </p>
                        <div className="mt-1 flex items-center">
                          <PriorityBadge priority={formData.priority as OrderPriority} />
                        </div>
                      </div>
                    </div>

                    {/* Técnico & Defeito */}
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Técnico</p>
                        <p className="font-bold text-slate-800 text-xs truncate mt-1">
                          {technicians.find(t => t.id === formData.assignedTo)?.name || 'Em Triagem (Pendente)'}
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Defeito</p>
                        <p className="font-bold text-slate-800 text-xs truncate mt-1" title={formData.defectTypeName}>
                          {formData.defectTypeCode ? (
                            <span className="inline-flex items-center gap-1 text-amber-700 font-mono">
                              <Hash size={10} className="text-amber-500" />
                              {formData.defectTypeCode}
                            </span>
                          ) : 'Não informado'}
                        </p>
                      </div>
                    </div>

                    {/* Valores & Orçamentos */}
                    <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200/60 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <DollarSign size={14} className="text-emerald-600" />
                        <span className="text-xs font-semibold text-slate-600">
                          {items.length} {items.length === 1 ? 'item' : 'itens'} • {linkedQuoteIds.length} {linkedQuoteIds.length === 1 ? 'orçamento' : 'orçamentos'}
                        </span>
                      </div>
                      <span className="text-xs font-bold text-emerald-700 font-mono">
                        R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Rodapé da coluna esquerda */}
                <div className="mt-4 p-2.5 bg-emerald-50/60 rounded-xl border border-emerald-200/60 flex items-center gap-2 text-[11px] text-emerald-800">
                  <CheckCircle2 size={13} className="text-emerald-600 shrink-0" />
                  <span className="truncate">Todos os dados das etapas anteriores validados com sucesso.</span>
                </div>
              </div>

              {/* COLUNA DIREITA: TÍTULO E DESCRIÇÃO TÉCNICO-OPERACIONAL */}
              <div className="lg:col-span-7 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="space-y-4">
                  {/* Cabeçalho do Bloco */}
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-4 bg-[#1c2d4f] rounded-full" />
                      <h3 className="text-sm font-bold text-slate-900 tracking-tight">Título e Escopo Operacional</h3>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                      Obrigatório *
                    </span>
                  </div>

                  <form id="os-form" onSubmit={handleSubmit} className="space-y-4">
                    {/* Título do Atendimento */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 ml-0.5">
                        <FileText size={12} className="text-slate-400" />
                        Título do Atendimento <span className="text-rose-500">*</span>
                      </label>
                      <Input
                        placeholder="Ex: Manutenção Preventiva do Sistema Central..."
                        required
                        disabled={isReadOnly}
                        className="rounded-xl py-2.5 px-3.5 font-bold text-xs border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#1c2d4f] shadow-none disabled:opacity-50 transition-colors w-full"
                        value={formData.title}
                        onChange={e => setFormData({ ...formData, title: e.target.value })}
                      />
                    </div>

                    {/* Descrição Técnico-Operacional */}
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 ml-0.5">
                        <Info size={12} className="text-slate-400" />
                        Descrição Técnico-Operacional <span className="text-rose-500">*</span>
                      </label>
                      <TextArea
                        placeholder="Relate detalhadamente a necessidade do cliente, anomalias identificadas e o escopo do atendimento..."
                        rows={7}
                        required
                        disabled={isReadOnly}
                        className="rounded-xl p-3.5 text-xs font-medium border-slate-200 bg-slate-50/50 focus:bg-white focus:border-[#1c2d4f] shadow-none disabled:opacity-50 transition-colors w-full resize-none leading-relaxed"
                        value={formData.description}
                        onChange={e => setFormData({ ...formData, description: e.target.value })}
                      />
                    </div>
                  </form>
                </div>

                {/* Rodapé da coluna direita */}
                <div className="mt-4 p-2.5 bg-slate-50/80 rounded-xl border border-slate-200/60 flex items-center justify-between text-[11px] text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-[#1c2d4f]" />
                    <span>Ao emitir, a OS será registrada como <strong>{formData.assignedTo ? 'Atribuída' : 'Pendente (Triagem)'}</strong></span>
                  </div>
                </div>
              </div>
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
                    className={`rounded-lg px-4 py-2 font-bold text-xs ${canCreateVisit ? '!bg-[#1c2d4f] hover:!bg-[#253a66] text-white shadow-md shadow-[#1c2d4f]/20' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
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
                  else if (step === 2) goToStep3();
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
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-[#1c2d4f]/10 text-[#1c2d4f] flex items-center justify-center border border-[#1c2d4f]/20">
                    <Plus size={16} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-800">Agendar Nova Visita</h3>
                    <p className="text-[10px] text-slate-400 font-medium">Configure data, técnico e adicione custos ou peças necessárias</p>
                  </div>
                </div>
                <button type="button" onClick={() => setShowNewVisitModal(false)} className="text-slate-400 hover:text-slate-600">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">técnico designado *</label>
                  
                  {/* Barra de busca */}
                  <div className="relative mb-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou e-mail..."
                      value={visitTechSearch}
                      onChange={e => setVisitTechSearch(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-xs font-semibold text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1c2d4f]/10 focus:border-[#1c2d4f] transition-all"
                    />
                  </div>

                  {/* Lista de técnicos */}
                  <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                    {technicians
                      .filter(t =>
                        t.name.toLowerCase().includes(visitTechSearch.toLowerCase()) ||
                        t.email?.toLowerCase().includes(visitTechSearch.toLowerCase())
                      )
                      .sort((a, b) => {
                        if (!isGeofencingEnabled || allowedTechIds === null) return 0;
                        const aAllowed = allowedTechIds.includes(a.id);
                        const bAllowed = allowedTechIds.includes(b.id);
                        if (aAllowed && !bAllowed) return -1;
                        if (!aAllowed && bAllowed) return 1;
                        return 0;
                      })
                      .map(t => {
                        const isAllowed = allowedTechIds === null || allowedTechIds.includes(t.id);
                        const isDesignated = allowedTechIds !== null && allowedTechIds.includes(t.id);
                        const isSelected = newVisitData.assignedTo === t.id;
                        return (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => {
                              if (!isAllowed) {
                                showAlert(`O técnico ${t.name} não atende a região demarcada do cliente. Selecione um técnico autorizado para esta área.`, 'error');
                                return;
                              }
                              setNewVisitData({ ...newVisitData, assignedTo: t.id });
                            }}
                            className={`w-full flex items-center gap-3 p-2 rounded-xl border text-left transition-all ${
                              !isAllowed
                                ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-100'
                                : isSelected
                                ? 'border-[#1c2d4f] bg-[#1c2d4f]/5 shadow-sm font-semibold'
                                : isDesignated
                                ? 'border-emerald-300 bg-emerald-50/40 hover:border-emerald-400 hover:bg-emerald-50'
                                : 'border-slate-100 bg-slate-50 hover:border-slate-300 hover:bg-white'
                            }`}
                          >
                            <div className="relative shrink-0">
                              <img src={t.avatar} className="w-7 h-7 rounded-lg object-cover border border-slate-200" alt={t.name} />
                              {!isAllowed ? (
                                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-rose-500 rounded-full flex items-center justify-center">
                                  <span className="text-white text-[7px] font-bold">✕</span>
                                </div>
                              ) : isDesignated && (
                                <div className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-emerald-500 rounded-full flex items-center justify-center shadow-sm">
                                  <span className="text-white text-[8px] font-bold">★</span>
                                </div>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <p className="text-[11px] font-bold text-slate-800 truncate">{t.name}</p>
                                {isDesignated && (
                                  <span className="inline-flex items-center gap-0.5 text-[8px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300">
                                    <MapPin size={8} className="text-emerald-600" /> Região
                                  </span>
                                )}
                              </div>
                              <p className="text-[9px] font-medium truncate">
                                {!isAllowed
                                  ? <span className="text-rose-400">Fora da área demarcada</span>
                                  : <span className="text-slate-400">{t.email}</span>
                                }
                              </p>
                            </div>
                            {isSelected && <CheckCircle2 size={12} className="text-[#1c2d4f] shrink-0" />}
                          </button>
                        );
                      })
                    }
                    {technicians.filter(t =>
                      t.name.toLowerCase().includes(visitTechSearch.toLowerCase()) ||
                      t.email?.toLowerCase().includes(visitTechSearch.toLowerCase())
                    ).length === 0 && (
                      <p className="text-center text-xs text-slate-400 py-3">Nenhum técnico encontrado</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">data *</label>
                    <input
                      type="date"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-[#1c2d4f]"
                      value={newVisitData.scheduledDate}
                      onChange={e => setNewVisitData({ ...newVisitData, scheduledDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">horário (opcional)</label>
                    <input
                      type="time"
                      className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold outline-none focus:border-[#1c2d4f]"
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

                {/* COMPOSIÇÃO DE VALORES / PEÇAS DA NOVA VISITA */}
                <div className="pt-3 border-t border-slate-100 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 bg-slate-100 rounded-lg flex items-center justify-center text-slate-600">
                        <DollarSign size={13} />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-slate-800 tracking-tight">Custos e Peças Desta Visita</h4>
                        <p className="text-[10px] text-slate-400 font-medium">Adicione itens de estoque ou despesas de retorno para somar ao total da OS</p>
                      </div>
                    </div>
                    {visitTotalValue > 0 && (
                      <span className="text-[11px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                        + R$ {visitTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </div>

                  {/* AÇÕES DE ADIÇÃO (ESTOQUE E MANUAL) */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="relative">
                      <Package className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                      <input
                        placeholder="Buscar peça no estoque..."
                        value={visitStockSearch}
                        onChange={e => { setVisitStockSearch(e.target.value); setIsVisitStockListOpen(true); }}
                        onFocus={() => setIsVisitStockListOpen(true)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-2 text-[11px] font-semibold text-slate-700 outline-none focus:border-[#1c2d4f] transition-all"
                      />
                      {(isVisitStockListOpen && visitStockSearch) && (
                        <div className="absolute z-[180] top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-48 overflow-y-auto custom-scrollbar">
                          {stock.filter(s => s.description.toLowerCase().includes(visitStockSearch.toLowerCase())).length > 0 ? (
                            stock.filter(s => s.description.toLowerCase().includes(visitStockSearch.toLowerCase())).map(s => (
                              <button
                                key={s.id}
                                type="button"
                                onClick={() => {
                                  addVisitItem({ description: s.description, unitPrice: s.sellPrice, fromStock: true, stockItemId: s.id });
                                  setVisitStockSearch('');
                                  setIsVisitStockListOpen(false);
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-slate-50 flex justify-between items-center border-b border-slate-100 last:border-0 group"
                              >
                                <div className="flex items-center gap-2">
                                  <Box size={12} className="text-slate-400 group-hover:text-[#1c2d4f]" />
                                  <div>
                                    <p className="text-[11px] font-bold text-slate-700">{s.description}</p>
                                    <p className="text-[10px] text-[#1c2d4f] font-bold">R$ {s.sellPrice.toLocaleString('pt-BR')}</p>
                                  </div>
                                </div>
                                <span className="text-[9px] font-bold text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">Qtd: {s.quantity}</span>
                              </button>
                            ))
                          ) : (
                            <div className="p-3 text-center text-[10px] font-medium text-slate-400">Nenhum item encontrado no estoque</div>
                          )}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => addVisitItem({ description: '', unitPrice: 0 })}
                      className="border border-dashed border-slate-200 text-slate-500 rounded-lg py-2 text-[11px] font-bold flex items-center justify-center gap-1.5 hover:border-[#1c2d4f] hover:text-[#1c2d4f] hover:bg-[#1c2d4f05] transition-all"
                    >
                      <Plus size={13} /> Adicionar Item Manual
                    </button>
                  </div>

                  {/* TABELA DE ITENS DA VISITA */}
                  {visitItems.length > 0 && (
                    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                      <table className="w-full text-left">
                        <thead>
                          <tr className="bg-slate-50 text-[9px] font-bold text-slate-400 uppercase border-b border-slate-200">
                            <th className="px-3 py-1.5">Item / Descrição</th>
                            <th className="px-2 py-1.5 w-16 text-center">Qtd</th>
                            <th className="px-2 py-1.5 w-24">Unit. (R$)</th>
                            <th className="px-2 py-1.5 w-24 text-right">Subtotal</th>
                            <th className="px-2 py-1.5 text-center w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {visitItems.map(item => (
                            <tr key={item.id} className="hover:bg-slate-50/50 transition-colors">
                              <td className="px-3 py-1.5">
                                <input
                                  type="text"
                                  value={item.description}
                                  onChange={e => updateVisitItem(item.id, { description: e.target.value })}
                                  placeholder="Descreva o custo ou peça..."
                                  className="bg-transparent border-none text-[11px] font-semibold text-slate-700 outline-none w-full placeholder:text-slate-300"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={item.quantity}
                                  onChange={e => updateVisitItem(item.id, { quantity: parseFloat(e.target.value) || 0 })}
                                  className="bg-slate-50 rounded px-1.5 py-0.5 text-[11px] font-bold text-slate-700 outline-none w-14 border border-slate-100 focus:border-[#1c2d4f] transition-all text-center"
                                />
                              </td>
                              <td className="px-2 py-1.5">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={item.unitPrice}
                                  onChange={e => updateVisitItem(item.id, { unitPrice: parseFloat(e.target.value) || 0 })}
                                  className="bg-slate-50 rounded px-1.5 py-0.5 text-[11px] font-bold text-slate-700 outline-none w-20 border border-slate-100 focus:border-[#1c2d4f] transition-all"
                                />
                              </td>
                              <td className="px-2 py-1.5 text-right font-mono font-bold text-[11px] text-slate-800">
                                R$ {(item.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                              <td className="px-2 py-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => removeVisitItem(item.id)}
                                  className="p-1 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded transition-all"
                                >
                                  <Trash2 size={12} />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {/* TOTAL CONSOLIDADO */}
                      <div className="bg-slate-50 border-t border-slate-200 px-3 py-2 flex items-center justify-between text-xs">
                        <span className="text-[10px] font-semibold text-slate-500">
                          Total anterior: R$ {totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                          {visitTotalValue > 0 && ` + Visita: R$ ${visitTotalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                        </span>
                        <span className="text-[11px] font-bold text-slate-900 font-mono">
                          Novo Total da OS: R$ {(totalValue + visitTotalValue).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-3 flex gap-3 flex-row-reverse border-t border-slate-100">
                  <Button
                    onClick={confirmScheduleNewVisit}
                    isLoading={schedulingVisit}
                    className="flex-1 !bg-[#1c2d4f] hover:!bg-[#253a66] text-white rounded-xl py-3 font-bold shadow-md shadow-[#1c2d4f]/20"
                  >
                    Confirmar Agendamento
                  </Button>
                  <Button type="button" onClick={() => setShowNewVisitModal(false)} className="flex-1 shadow-none bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl py-3 font-bold">{t.common.cancel}</Button>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >,
    document.body
  );
};

