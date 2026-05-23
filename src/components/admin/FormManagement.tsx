
import React, { useState, useEffect, useCallback } from 'react';
import { useI18n } from '../../i18n';
import { createPortal } from 'react-dom';
import { Plus, FileText, Trash2, Edit2, X, Save, GripVertical, CheckCircle2, List, Settings, Settings2, Tag, Layers, ArrowRight, Info, Box, Cpu, Workflow, Search, Filter, Loader2, ChevronLeft, RefreshCw, ChevronUp, ChevronDown } from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FormTemplate, FormField, FormFieldType } from '../../types';
import { DataService } from '../../services/dataService';
import { useForms, useServiceTypes, useActivationRules, useTenant, NexusQueryClient } from '../../hooks/nexusHooks';
import { usePermissions } from '../../hooks/usePermissions';

// Famílias vindas do EquipmentManagement para consistência
export const EQUIPMENT_FAMILIES = [
  'Refrigeração Industrial',
  'Elétrica',
  'Climatização',
  'Segurança Eletrônica',
  'Redes e TI'
];


interface ServiceType {
  id: string;
  name: string;
}

interface ActivationRule {
  id: string;
  serviceTypeId: string;
  equipmentFamily: string;
  formId: string;
  financialFormId?: string;
}

export const FormManagement: React.FC = () => {
    const { t } = useI18n();
    const { canCreate, canEdit, canDelete } = usePermissions();

  const [activeTab, setActiveTab] = useState<'types' | 'templates' | 'rules'>('templates');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [ruleDropdown, setRuleDropdown] = useState<string | null>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  const [tenantReady, setTenantReady] = useState(false);

  const {
    data: serviceTypesRaw = [],
    isLoading: typesLoading,
    refetch: refetchTypes
  } = useServiceTypes(tenantReady);

  const {
    data: formsRaw = [],
    isLoading: formsLoading,
    refetch: refetchForms
  } = useForms(tenantReady);

  const {
    data: rulesRaw = [],
    isLoading: rulesLoading,
    refetch: refetchRules
  } = useActivationRules(tenantReady);

  // 🛡️ Lógica de "Wake up" para garantir Tenant ID (crítico para localhost)
  useEffect(() => {
    async function wakeUp() {
      const tid = DataService.getCurrentTenantId();
      if (tid) {
        setTenantReady(true);
        return;
      }

      // Se não tem no cache, tenta forçar leitura da sessão
      try {
        const { data: { session } } = await (await import('../../lib/supabase')).supabase.auth.getSession();
        if (session?.user?.user_metadata?.tenantId || session?.user?.user_metadata?.tenant_id) {
          console.log('🛡️ [FormManagement] Tenant ID recuperado via Session Wake-up');
          setTenantReady(true);
        } else {
          // Fallback: se houver sessão mas sem metadata, o serviceTypes pode falhar, 
          // mas vamos liberar o tenantReady para que o erro apareça ou tente o default
          setTenantReady(true);
        }
      } catch (e) {
        setTenantReady(true);
      }
    }
    wakeUp();
  }, []);

  // Estado local apenas para edição (não afeta o cache)
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [rules, setRules] = useState<ActivationRule[]>([]);

  // Sincroniza dados do cache com estado local para edição otimista
  useEffect(() => {
    setServiceTypes(serviceTypesRaw as ServiceType[]);
  }, [serviceTypesRaw]);

  useEffect(() => {
    setForms(formsRaw as FormTemplate[]);
  }, [formsRaw]);

  useEffect(() => {
    if (rulesRaw) {
      // Normaliza snake_case → camelCase vindo do banco
      const normalized = (rulesRaw as any[]).map(r => ({
        ...r,
        serviceTypeId: r.serviceTypeId ?? r.service_type_id,
        equipmentFamily: r.equipmentFamily ?? r.equipment_family,
        formId: r.formId ?? r.form_id,
      }));
      setRules(normalized);
    }
  }, [rulesRaw]);

  const loading = typesLoading || formsLoading || rulesLoading;

  const handleManualRefresh = useCallback(async () => {
    await Promise.all([refetchTypes(), refetchForms(), refetchRules()]);
  }, [refetchTypes, refetchForms, refetchRules]);

  const [editingType, setEditingType] = useState<Partial<ServiceType> | null>(null);
  const [editingForm, setEditingForm] = useState<Partial<FormTemplate> | null>(null);
  const [editingRule, setEditingRule] = useState<Partial<ActivationRule> | null>(null);

  const [draggedFieldIndex, setDraggedFieldIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = 'move';
    setDraggedFieldIndex(index);
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedFieldIndex === null || draggedFieldIndex === dropIndex) return;
    if (!editingForm?.fields) return;

    const newFields = [...editingForm.fields];
    const [draggedItem] = newFields.splice(draggedFieldIndex, 1);
    newFields.splice(dropIndex, 0, draggedItem);

    setEditingForm({ ...editingForm, fields: newFields });
    setDraggedFieldIndex(null);
  };

  const moveField = (fromIndex: number, toIndex: number) => {
    if (!editingForm?.fields) return;
    if (toIndex < 0 || toIndex >= editingForm.fields.length) return;
    const newFields = [...editingForm.fields];
    const [moved] = newFields.splice(fromIndex, 1);
    newFields.splice(toIndex, 0, moved);
    setEditingForm({ ...editingForm, fields: newFields });
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [fieldDropdown, setFieldDropdown] = useState<{ fieldId: string; type: 'fieldType' | 'condField' | 'condValue' } | null>(null);

  const FIELD_TYPE_OPTIONS = [
    { value: FormFieldType.TEXT, label: 'Resposta Curta' },
    { value: FormFieldType.LONG_TEXT, label: 'Parágrafo' },
    { value: FormFieldType.SELECT, label: 'Múltipla Escolha' },
    { value: FormFieldType.MULTI_SELECT, label: 'Múltipla Seleção (Checklist)' },
    { value: FormFieldType.PHOTO, label: 'Upload de Foto' },
  ];

  // Handlers para Tipos (Cloud)
  const handleSaveType = async () => {
    if (!editingType?.name) return;
    try {
      await DataService.saveServiceType(editingType);
      await refetchTypes();
      setIsTypeModalOpen(false);
    } catch (e: any) {
      console.error("Erro ao salvar tipo:", e);
      alert(`Falha ao salvar tipo: ${e.message || e.error_description || 'Erro desconhecido no servidor'}`);
    }
  };

  const handleDeleteType = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Deseja realmente excluir este tipo? Isso pode afetar regras existentes.")) return;
    try {
      await DataService.deleteServiceType(id);
      await refetchTypes();
    } catch (e) { alert("Erro ao deletar."); }
  };

  // Handlers para Formulários (Cloud)
  const handleSaveForm = async () => {
    if (!editingForm?.title) return;
    try {
      await DataService.saveFormTemplate(editingForm as FormTemplate);
      await refetchForms();
      setIsModalOpen(false);
    } catch (e: any) {
      console.error("ERRO NEXUS CLOUD:", e);
      alert(`Falha ao salvar: ${e.message || 'Erro desconhecido no servidor'}`);
    }
  };

  const handleDeleteForm = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("Isso apagará o modelo permanentemente. Confirmar?")) return;

    try {
      console.log('[FormManagement] Tentando deletar formulário:', id);
      await DataService.deleteFormTemplate(id);
      console.log('[FormManagement] ✅ Formulário deletado com sucesso');
      await refetchForms();
      alert('Formulário excluído com sucesso!');
    } catch (e: any) {
      console.error('[FormManagement] ❌ Erro ao deletar formulário:', e);
      alert(`Erro ao deletar: ${e.message || 'Erro desconhecido'}`);
    }
  };

  const addField = () => {
    if (!editingForm) return;
    const newField: FormField = {
      id: Math.random().toString(36).substr(2, 9),
      label: 'Nova Pergunta',
      type: FormFieldType.TEXT,
      required: false
    };
    setEditingForm({ ...editingForm, fields: [...(editingForm.fields || []), newField] });
  };

  // Handlers para Regras (Cloud)
  const handleSaveRule = async () => {
    if (!editingRule?.serviceTypeId || !editingRule?.equipmentFamily || !editingRule?.formId) {
      alert("Preencha todos os campos da regra.");
      return;
    }
    try {
      await DataService.saveActivationRule(editingRule);
      await refetchRules();
      setIsRuleModalOpen(false);
    } catch (e: any) {
      console.error("ERRO NEXUS REGRA:", e);
      alert(`Falha ao salvar regra: ${e.message || 'Erro de conexão com o servidor'}`);
    }
  };

  const handleDeleteRule = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await DataService.deleteActivationRule(id);
      await refetchRules();
    } catch (e) { alert("Erro ao deletar regra."); }
  };

  const filteredTypes = serviceTypes.filter(t => t.name.toLowerCase().includes(searchTerm.toLowerCase()));
  const filteredForms = forms.filter(f => {
    const matchesSearch = f.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || (statusFilter === 'ACTIVE' ? f.active : !f.active);
    return matchesSearch && matchesStatus;
  });
  const filteredRules = rules.filter(r => {
    const stName = serviceTypes.find(t => t.id === r.serviceTypeId)?.name || '';
    const fName = forms.find(f => f.id === r.formId)?.title || '';
    return stName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.equipmentFamily.toLowerCase().includes(searchTerm.toLowerCase()) ||
      fName.toLowerCase().includes(searchTerm.toLowerCase());
  });

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, activeTab, statusFilter]);

  const paginatedTypes = filteredTypes.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const paginatedForms = filteredForms.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
  const paginatedRules = filteredRules.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

  const totalItems = activeTab === 'types' ? filteredTypes.length : activeTab === 'templates' ? filteredForms.length : filteredRules.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);

  return (
    <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden font-poppins">
      {loading && forms.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 h-full animate-fade-in">
          <div className="w-8 h-8 border-[3px] border-slate-200 border-t-primary-500 rounded-full animate-spin mb-4" />
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em]">carregando dados...</p>
        </div>
      ) : (
        <>
      {/* Toolbar */}
      <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
        <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3">
          
          <div className="flex items-center gap-1">
            <div className="flex bg-white/60 p-1 rounded-xl border border-[#1c2d4f]/10 shadow-sm">
              <button
                onClick={() => setActiveTab('types')}
                className={`px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'types' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}
              >
                <Tag size={14} /> Tipos
              </button>
              <button
                onClick={() => setActiveTab('templates')}
                className={`px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'templates' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}
              >
                <FileText size={14} /> Modelos
              </button>
              <button
                onClick={() => setActiveTab('rules')}
                className={`px-3 h-8 rounded-lg text-[9px] font-bold transition-all flex items-center gap-1.5 ${activeTab === 'rules' ? 'bg-[#1c2d4f] text-white shadow-md' : 'text-slate-500 hover:text-[#1c2d4f] hover:bg-white'}`}
              >
                <Layers size={14} /> Regras
              </button>
            </div>
          </div>

          <div className="relative flex-1 min-w-[200px] w-full lg:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              id="form-search"
              name="form-search"
              type="text"
              autoComplete="off"
              placeholder="Pesquisar..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center gap-2 w-full lg:w-auto justify-end">
            {activeTab === 'templates' && (
              <button
                onClick={() => setShowFilters(!showFilters)}
                className={`flex items-center gap-1.5 px-3 h-10 rounded-xl border transition-all text-[10px] font-bold ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-[#1c2d4f]/20 text-[#1c2d4f] hover:bg-[#1c2d4f]/5 shadow-sm'}`}
              >
                <Filter size={14} /> <span className="hidden sm:inline">{showFilters ? 'Ocultar' : 'Avançado'}</span>
              </button>
            )}



            <Button 
              variant="primary" 
              className={`h-10 px-5 gap-2 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] shadow-lg shadow-[#1c2d4f]/20 text-[11px] rounded-xl font-bold transition-all ${!canCreate('forms') ? 'opacity-50 !cursor-not-allowed' : ''}`}
              onClick={(e) => {
                if (!canCreate('forms')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para esta ação.'); return; }
                if (activeTab === 'types') { setEditingType({ name: '' }); setIsTypeModalOpen(true); }
                else if (activeTab === 'templates') { setEditingForm({ title: '', fields: [], active: true, category: 'TECHNICAL' }); setIsModalOpen(true); }
                else if (activeTab === 'rules') { setEditingRule({ serviceTypeId: '', equipmentFamily: '', formId: '', financialFormId: '' }); setIsRuleModalOpen(true); }
              }}
            >
              <Plus size={16} /> 
              {activeTab === 'types' ? 'Novo Tipo' : activeTab === 'templates' ? 'Novo Modelo' : 'Nova Regra'}
            </Button>
          </div>
        </div>

        {showFilters && activeTab === 'templates' && (
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
                  <option value="INACTIVE">Inativo</option>
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
                Limpar Filtros
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">
        <div className="overflow-auto flex-1 p-6 custom-scrollbar">
          {/* Só mostra spinner se estiver carregando E não tiver dados ainda */}
          {(loading && forms.length === 0 && serviceTypes.length === 0) ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4 text-slate-400">
              <Loader2 size={48} className="animate-spin text-primary-500" />
              <div className="text-center">
                <p className="text-sm font-bold text-slate-600">Sincronizando com a Cloud DUNO...</p>
                <p className="text-[10px] uppercase tracking-widest mt-1">Aguarde um momento</p>
              </div>
            </div>
          ) : (
            <>
              {/* ABA 1: TIPOS DE SERVIÇO */}
              {activeTab === 'types' && (
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-slate-200/60 border-b border-slate-300 z-10 shadow-sm">
                      <tr className="text-[11px] font-bold text-slate-500 text-center">
                        <th className="px-4 py-3">tipo de atendimento</th>
                        <th className="px-4 py-3 text-right">ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedTypes.map(type => (
                        <tr key={type.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <Tag size={16} className="text-primary-600" />
                              <span className="text-slate-700 text-[13px] font-medium">{type.name}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => {
                                if (!canEdit('forms')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                                setEditingType(type); setIsTypeModalOpen(true);
                              }} className={`p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-all ${!canEdit('forms') ? 'opacity-50 !cursor-not-allowed' : ''}`} title="Editar"><Edit2 size={16} /></button>
                              <button onClick={(e) => {
                                if (!canDelete('forms')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para excluir.'); return; }
                                handleDeleteType(type.id, e);
                              }} className={`p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all ${!canDelete('forms') ? 'opacity-50 !cursor-not-allowed' : ''}`} title="Excluir"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {paginatedTypes.length === 0 && (
                        <tr><td colSpan={2} className="py-10 text-center text-slate-400 text-xs font-bold">Nenhum tipo encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ABA 2: MODELOS DE CHECKLIST */}
              {activeTab === 'templates' && (
                <div className="flex-1 overflow-auto custom-scrollbar">
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-slate-200/60 border-b border-slate-300 z-10 shadow-sm">
                      <tr className="text-[11px] font-bold text-slate-500 text-center">
                        <th className="px-4 py-3">nome do modelo</th>
                        <th className="px-4 py-3">tipo</th>
                        <th className="px-4 py-3">qtd. questões</th>
                        <th className="px-4 py-3 text-right">ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedForms.map(form => (
                        <tr key={form.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <FileText size={16} className="text-primary-600" />
                              <span className="text-slate-700 text-[13px] font-medium">{form.title}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wide ${form.category === 'FINANCIAL' ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'bg-indigo-50 text-indigo-600 border border-indigo-200'}`}>
                              {form.category === 'FINANCIAL' ? 'Financeiro' : 'Técnico'}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{form.fields.length} Questões</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button onClick={(e) => {
                                if (!canEdit('forms')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                                setEditingForm(form); setIsModalOpen(true);
                              }} className={`p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-all ${!canEdit('forms') ? 'opacity-50 !cursor-not-allowed' : ''}`} title="Editar"><Edit2 size={16} /></button>
                              <button onClick={(e) => {
                                if (!canDelete('forms')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para excluir.'); return; }
                                handleDeleteForm(form.id, e);
                              }} className={`p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all ${!canDelete('forms') ? 'opacity-50 !cursor-not-allowed' : ''}`} title="Excluir"><Trash2 size={16} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {paginatedForms.length === 0 && (
                        <tr><td colSpan={3} className="py-10 text-center text-slate-400 text-xs font-bold">Nenhum modelo encontrado.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ABA 3: REGRAS DE VINCULAÇÃO */}
              {activeTab === 'rules' && (
                <div className="flex-1 overflow-auto custom-scrollbar flex flex-col">
                  <div className="flex justify-between items-center mb-4 px-1">
                    <h2 className="text-[10px] font-bold text-slate-400 tracking-[0.3em] lowercase">matriz de ativação automática</h2>
                  </div>
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 bg-slate-200/60 border-b border-slate-300 z-10 shadow-sm">
                      <tr className="text-[11px] font-bold text-slate-500 text-center">
                        <th className="px-4 py-3">tipo de atendimento</th>
                        <th className="px-4 py-3">família equipamento</th>
                        <th className="px-4 py-3"><Workflow size={14} className="inline mr-1" /> técnico</th>
                        <th className="px-4 py-3"><Workflow size={14} className="inline mr-1" /> financeiro</th>
                        <th className="px-4 py-3 text-right">ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {paginatedRules.map(rule => (
                        <tr key={rule.id} className="hover:bg-slate-50 transition-colors group">
                          <td className="px-4 py-3 text-[11px] font-bold text-slate-700">
                             <div className="flex items-center gap-2">
                               <Tag size={14} className="text-slate-400" />
                               <span className="text-slate-700 text-[12px] font-medium">{serviceTypes.find(t => t.id === rule.serviceTypeId || t.id === (rule as any).service_type_id)?.name || 'Desconhecido'}</span>
                             </div>
                          </td>
                          <td className="px-4 py-3 text-[11px] font-bold text-slate-700">
                             <div className="flex items-center gap-2">
                               <Cpu size={14} className="text-slate-400" />
                               <span className="text-slate-700 text-[12px] font-medium">{rule.equipmentFamily}</span>
                             </div>
                          </td>
                          <td className="px-4 py-3 text-[11px] font-bold text-primary-700">
                             <span className="bg-primary-50 py-1 px-3 border border-primary-100 rounded-md text-[12px] font-medium block text-center truncate max-w-[150px]" title={forms.find(f => f.id === rule.formId || f.id === (rule as any).form_id)?.title || 'Não vinculado'}>
                               {forms.find(f => f.id === rule.formId || f.id === (rule as any).form_id)?.title || 'Não vinculado'}
                             </span>
                          </td>
                          <td className="px-4 py-3 text-[11px] font-bold text-amber-700">
                             <span className="bg-amber-50 py-1 px-3 border border-amber-100 rounded-md text-[12px] font-medium block text-center truncate max-w-[150px]" title={forms.find(f => f.id === (rule as any).financialFormId)?.title || 'Não vinculado'}>
                               {forms.find(f => f.id === (rule as any).financialFormId)?.title || 'Não vinculado'}
                             </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                             <div className="flex justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                               <button onClick={(e) => {
                                 if (!canEdit('forms')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para editar.'); return; }
                                 setEditingRule({ id: rule.id, serviceTypeId: rule.serviceTypeId, equipmentFamily: rule.equipmentFamily, formId: rule.formId, financialFormId: (rule as any).financialFormId }); setIsRuleModalOpen(true);
                               }} className={`p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-all ${!canEdit('forms') ? 'opacity-50 !cursor-not-allowed' : ''}`} title="Editar Regra"><Edit2 size={16} /></button>
                               <button onClick={(e) => {
                                 if (!canDelete('forms')) { e.preventDefault(); showAlert('Acesso Negado: Você não tem permissão para excluir.'); return; }
                                 handleDeleteRule(rule.id, e);
                               }} className={`p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all ${!canDelete('forms') ? 'opacity-50 !cursor-not-allowed' : ''}`} title="Excluir"><Trash2 size={16} /></button>
                             </div>
                          </td>
                        </tr>
                      ))}
                      {paginatedRules.length === 0 && (
                        <tr><td colSpan={4} className="py-10 text-center text-slate-400 text-xs font-bold">Nenhuma regra encontrada.</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>
        {!loading && (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={ITEMS_PER_PAGE}
            onPageChange={setCurrentPage}
          />
        )}
      </div>

      {/* MODAL 1: TIPO DE SERVIÇO */}
      {
        isTypeModalOpen && editingType && createPortal(
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden">
            <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up">

              {/* HEADER */}
              <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                    <Tag size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 tracking-tight">Tipo de Atendimento</h2>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">Nexus Forms • Nomeie a operação comercial</p>
                  </div>
                </div>
                <button onClick={() => setIsTypeModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50"><X size={20} /></button>
              </div>

              {/* BODY */}
              <div className="p-6 bg-slate-50/30 space-y-5">
                <Input
                  label="Nome do Atendimento (Ex: Garantia)"
                  value={editingType.name}
                  onChange={e => setEditingType({ ...editingType, name: e.target.value })}
                  className="rounded-xl py-3 border-slate-200"
                />
                <p className="text-[10px] text-slate-400 font-medium px-1">
                  Dica: Use o mesmo nome que deseja exibir na abertura da Ordem de Serviço.
                </p>
              </div>

              {/* FOOTER */}
              <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setIsTypeModalOpen(false)} className="h-9 px-5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancelar</button>
                <Button onClick={handleSaveType} className="h-9 px-6 rounded-xl text-xs font-semibold bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] text-white">
                  <Save size={14} className="mr-2" /> Salvar Tipo
                </Button>
              </div>

            </div>
          </div>, document.body
        )
      }

      {/* MODAL 2: CONSTRUTOR DE FORMULÁRIO */}
      {
        isModalOpen && editingForm && createPortal(
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in">
            <div className="bg-white rounded-none lg:rounded-xl w-full max-w-4xl h-full lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200">
              {/* HEADER — Padrão CreateOrderModal */}
              <div className="px-4 sm:px-6 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-start sm:items-center shrink-0 bg-white">
                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center border bg-slate-50 border-slate-200 text-[#1c2d4f] shrink-0">
                    <Settings2 size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-3">
                      <h2 className="text-sm sm:text-base font-semibold text-slate-900 font-poppins truncate">Construtor de Checklist</h2>
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest border bg-slate-50 text-slate-500 border-slate-200">{(editingForm.fields || []).length} questões</span>
                    </div>
                    <p className="text-[10px] sm:text-xs text-slate-500 font-medium mt-0.5">Estruture os campos de coleta de dados técnicos</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button onClick={() => setIsModalOpen(false)} className="p-2 text-slate-400 hover:text-slate-900 transition-all">
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* BODY */}
              <div className="flex-1 overflow-y-auto bg-slate-50/50 custom-scrollbar py-5">
                <div className="max-w-3xl mx-auto px-4 sm:px-6 space-y-4 pb-12">
                  
                  <div className="bg-white border-t-4 border-t-[#1c2d4f] shadow-sm rounded-xl p-4 sm:p-5 relative space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                      <div className="flex-1 w-full">
                        <input
                          type="text"
                          value={editingForm.title}
                          onChange={e => setEditingForm({ ...editingForm, title: e.target.value })}
                          placeholder="Título do Formulário"
                          className="w-full bg-transparent border-b-2 border-transparent focus:border-slate-300 pb-1 text-base sm:text-lg font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-300"
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5 ml-0.5">Personalize os campos de coleta de dados abaixo.</p>
                      </div>
                      <div className="w-full sm:w-48 shrink-0">
                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">Categoria do Formulário</label>
                        <select
                          value={editingForm.category || 'TECHNICAL'}
                          onChange={e => setEditingForm({ ...editingForm, category: e.target.value as any })}
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-bold text-slate-700 outline-none focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f]"
                        >
                          <option value="TECHNICAL">Técnico Operacional</option>
                          <option value="FINANCIAL">Financeiro / Custos</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* LISTA DE PERGUNTAS */}
                  <div className="space-y-3">
                    {(editingForm.fields || []).map((field, index) => (
                      <div
                        key={field.id}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; }}
                        onDrop={(e) => handleDrop(e, index)}
                        className={`bg-white border-l-4 ${draggedFieldIndex === index ? 'opacity-50 border-l-slate-300' : 'border-l-transparent focus-within:border-l-primary-500'} border border-slate-200 rounded-xl p-3 sm:p-4 transition-all group shadow-sm hover:shadow-md relative`}
                      >
                        
                        {/* Drag Handle Limitado (Não afeta os inputs) */}
                        <div
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragEnd={() => setDraggedFieldIndex(null)}
                          className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 flex justify-center items-center opacity-0 group-hover:opacity-100 cursor-grab active:cursor-grabbing hover:bg-slate-50 rounded-b-md transition-all z-10"
                          title="Segure e arraste para reordenar"
                        >
                          <GripVertical size={16} className="rotate-90 text-slate-400" />
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3 mb-3 mt-1 items-start sm:items-center">
                          {/* Number Badge */}
                          <div className="flex-shrink-0 bg-primary-50 border border-primary-100 text-primary-700 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold">
                            {index + 1}
                          </div>

                          {/* Label Input */}
                          <input
                            type="text"
                            value={field.label}
                            onChange={e => setEditingForm({ ...editingForm, fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, label: e.target.value } : f) })}
                            placeholder="Sua pergunta..."
                            className="flex-1 bg-slate-50 border-b border-slate-200 px-3 py-2 text-xs font-medium text-slate-800 outline-none focus:border-primary-500 focus:bg-slate-100/50 transition-colors rounded-t-md"
                          />
                          <div className="w-full sm:w-44 shrink-0 relative">
                            <button type="button" onClick={() => setFieldDropdown(fieldDropdown?.fieldId === field.id && fieldDropdown?.type === 'fieldType' ? null : { fieldId: field.id, type: 'fieldType' })} className="w-full bg-white border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-medium text-left flex items-center justify-between transition-all hover:border-[#1c2d4f]/30 outline-none">
                              <span className="text-slate-700">{FIELD_TYPE_OPTIONS.find(o => o.value === field.type)?.label || 'Selecione...'}</span>
                              <ChevronDown size={12} className={`text-slate-400 transition-transform ${fieldDropdown?.fieldId === field.id && fieldDropdown?.type === 'fieldType' ? 'rotate-180' : ''}`} />
                            </button>
                            {fieldDropdown?.fieldId === field.id && fieldDropdown?.type === 'fieldType' && (
                              <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden animate-fade-in">
                                {FIELD_TYPE_OPTIONS.map(opt => (
                                  <button key={opt.value} type="button" onClick={() => { setEditingForm({ ...editingForm, fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, type: opt.value } : f) }); setFieldDropdown(null); }} className={`w-full text-left px-3 py-2 text-[10px] font-medium transition-colors flex items-center gap-2 ${field.type === opt.value ? 'bg-[#1c2d4f]/5 text-[#1c2d4f]' : 'text-slate-600 hover:bg-slate-50'}`}>
                                    {field.type === opt.value && <CheckCircle2 size={12} className="text-[#1c2d4f] shrink-0" />}
                                    <span>{opt.label}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Opções (Apenas se SELECT ou MULTI_SELECT) */}
                        {(field.type === FormFieldType.SELECT || field.type === FormFieldType.MULTI_SELECT) && (
                          <div className="mb-3 pl-1">
                            <div className="flex items-center gap-2 mb-2">
                              <List size={13} className="text-slate-400 shrink-0" />
                              <input
                                type="text"
                                placeholder="Digite as opções separadas por vírgula..."
                                value={field.options?.join(', ') || ''}
                                onChange={e => {
                                  const newOptions = e.target.value.split(',').map(s => s.trim());
                                  setEditingForm({ ...editingForm, fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, options: newOptions } : f) });
                                }}
                                className="flex-1 bg-white border-b border-slate-200 px-2 py-1.5 text-[10px] font-medium text-slate-700 outline-none focus:border-primary-400 transition-all placeholder:text-slate-300"
                              />
                            </div>
                            <div className="flex gap-1.5 flex-wrap pl-5">
                              {field.options?.filter(o => o.trim()).map((opt, idx) => (
                                <div key={idx} className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2 py-1 rounded-full">
                                  {field.type === FormFieldType.MULTI_SELECT
                                    ? <div className="w-2.5 h-2.5 rounded-[3px] border border-slate-400 bg-white" />
                                    : <div className="w-2.5 h-2.5 rounded-full border border-slate-400 bg-white" />
                                  }
                                  <span className="text-[10px] font-medium text-slate-700">{opt}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Painel de Lógica */}
                        {(field.condition?.fieldId || (field as any).showCondition) && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 border-dashed rounded-lg p-3">
                            <Workflow size={16} className="text-amber-600 shrink-0" />
                            <span className="text-xs font-bold text-amber-800 shrink-0">Exibir pergunta se:</span>
                            <div className="relative flex-1 min-w-[150px]">
                              <button type="button" onClick={() => setFieldDropdown(fieldDropdown?.fieldId === field.id && fieldDropdown?.type === 'condField' ? null : { fieldId: field.id, type: 'condField' })} className="w-full bg-white border border-amber-200 rounded-md px-3 py-2 text-[10px] font-medium text-left flex items-center justify-between transition-all hover:border-amber-300 outline-none">
                                <span className={field.condition?.fieldId ? 'text-slate-700' : 'text-slate-400'}>{field.condition?.fieldId ? (editingForm.fields?.find(f => f.id === field.condition?.fieldId)?.label || 'Sem título') : 'Sempre (Padrão)'}</span>
                                <ChevronDown size={12} className={`text-amber-400 transition-transform ${fieldDropdown?.fieldId === field.id && fieldDropdown?.type === 'condField' ? 'rotate-180' : ''}`} />
                              </button>
                              {fieldDropdown?.fieldId === field.id && fieldDropdown?.type === 'condField' && (
                                <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto custom-scrollbar animate-fade-in">
                                  <button type="button" onClick={() => { const fields = editingForm.fields?.map(f => f.id === field.id ? { ...f, condition: undefined } : f); setEditingForm({ ...editingForm, fields }); setFieldDropdown(null); }} className={`w-full text-left px-3 py-2 text-[10px] font-medium transition-colors ${!field.condition?.fieldId ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}>Sempre (Padrão)</button>
                                  {editingForm.fields?.filter(f => f.id !== field.id).map(f => (
                                    <button key={f.id} type="button" onClick={() => { const fields = editingForm.fields?.map(ff => ff.id === field.id ? { ...ff, condition: { fieldId: f.id, value: '', operator: 'equals' as const } } : ff); setEditingForm({ ...editingForm, fields }); setFieldDropdown(null); }} className={`w-full text-left px-3 py-2 text-[10px] font-medium transition-colors ${field.condition?.fieldId === f.id ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}>{f.label || 'Sem título'}</button>
                                  ))}
                                </div>
                              )}
                            </div>

                            {field.condition?.fieldId && (
                              <div className="flex items-center gap-3 flex-1 min-w-[150px]">
                                <span className="text-xs font-bold text-amber-800 shrink-0">for igual a</span>
                                {(() => {
                                  const parentField = editingForm.fields?.find(f => f.id === field.condition?.fieldId);
                                  if ((parentField?.type === FormFieldType.SELECT || parentField?.type === FormFieldType.MULTI_SELECT) && parentField.options && parentField.options.length > 0) {
                                    return (
                                      <div className="relative w-full">
                                        <button type="button" onClick={() => setFieldDropdown(fieldDropdown?.fieldId === field.id && fieldDropdown?.type === 'condValue' ? null : { fieldId: field.id, type: 'condValue' })} className="w-full bg-white border border-amber-200 rounded-md px-3 py-2 text-[10px] font-medium text-left flex items-center justify-between transition-all hover:border-amber-300 outline-none">
                                          <span className={field.condition.value ? 'text-slate-700' : 'text-slate-400'}>{field.condition.value || 'Selecione...'}</span>
                                          <ChevronDown size={12} className={`text-amber-400 transition-transform ${fieldDropdown?.fieldId === field.id && fieldDropdown?.type === 'condValue' ? 'rotate-180' : ''}`} />
                                        </button>
                                        {fieldDropdown?.fieldId === field.id && fieldDropdown?.type === 'condValue' && (
                                          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto custom-scrollbar animate-fade-in">
                                            {parentField.options.map((opt, idx) => (
                                              <button key={idx} type="button" onClick={() => { const fields = editingForm.fields?.map(f => f.id === field.id ? { ...f, condition: { ...f.condition!, value: opt } } : f); setEditingForm({ ...editingForm, fields }); setFieldDropdown(null); }} className={`w-full text-left px-3 py-2 text-[10px] font-medium transition-colors ${field.condition.value === opt ? 'bg-amber-50 text-amber-700' : 'text-slate-600 hover:bg-slate-50'}`}>{opt}</button>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }
                                  return (
                                    <input
                                      type="text"
                                      placeholder="Valor..."
                                      className="bg-white border border-amber-200 rounded-md px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-amber-200 w-full"
                                      value={field.condition.value}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const fields = editingForm.fields?.map(f => {
                                          if (f.id === field.id) return { ...f, condition: { ...f.condition!, value: val } };
                                          return f;
                                        });
                                        setEditingForm({ ...editingForm, fields });
                                      }}
                                    />
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Divider */}
                        <hr className="my-3 border-slate-100" />

                        {/* Controles Inferiores */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                          
                          {/* Botão de Lógica */}
                          <button
                            title="Gatilho Inteligente"
                            onClick={() => {
                              const fields = editingForm.fields?.map(f => {
                                if (f.id === field.id) return { ...f, showCondition: !(f as any).showCondition };
                                return f;
                              });
                              setEditingForm({ ...editingForm, fields });
                            }}
                            className={`flex items-center gap-1 px-2 py-1.5 rounded-lg text-[10px] font-medium transition-all ${field.condition?.fieldId ? 'bg-amber-50 text-amber-600 border border-amber-200' : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'}`}
                          >
                            <Workflow size={14} />
                            {field.condition?.fieldId ? 'Lógica Ativa' : 'Adicionar Lógica'}
                          </button>

                          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

                          {/* Toggle Obrigatório */}
                          <label className="flex items-center gap-1.5 cursor-pointer group">
                            <span className="text-[10px] font-medium text-slate-500 group-hover:text-slate-700 transition-colors">Obrigatória</span>
                            <div className={`relative w-8 h-4 rounded-full transition-colors duration-300 ${field.required ? 'bg-[#1c2d4f]' : 'bg-slate-300'}`}>
                              <div className={`absolute top-0.5 left-0.5 bg-white w-3 h-3 rounded-full shadow-sm transition-transform duration-300 ${field.required ? 'translate-x-4' : ''}`} />
                            </div>
                            <input
                              type="checkbox"
                              className="hidden"
                              checked={field.required}
                              onChange={() => {
                                const fields = editingForm.fields?.map(f => f.id === field.id ? { ...f, required: !f.required } : f);
                                setEditingForm({ ...editingForm, fields });
                              }}
                            />
                          </label>

                          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

                          {/* Ordenação Manual (Cima / Baixo) */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => moveField(index, index - 1)}
                              disabled={index === 0}
                              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
                              title="Mover para cima"
                            >
                              <ChevronUp size={18} />
                            </button>
                            <button
                              onClick={() => moveField(index, index + 1)}
                              disabled={index === (editingForm.fields?.length || 0) - 1}
                              className="p-1.5 text-slate-400 hover:text-primary-600 hover:bg-primary-50 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-all"
                              title="Mover para baixo"
                            >
                              <ChevronDown size={18} />
                            </button>
                          </div>

                          <div className="h-6 w-px bg-slate-200 hidden sm:block" />

                          {/* Deletar */}
                          <button
                            onClick={() => setEditingForm({ ...editingForm, fields: editingForm.fields?.filter(f => f.id !== field.id) })}
                            className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                            title="Excluir Pergunta"
                          >
                            <Trash2 size={14} />
                          </button>

                        </div>

                      </div>
                    ))}
                  </div>

                  {/* Add Field Button */}
                  <div className="flex justify-center mt-5">
                    <button onClick={addField} className="flex items-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 shadow-sm text-slate-600 rounded-full hover:shadow-md hover:text-[#1c2d4f] hover:border-slate-300 transition-all font-medium text-xs">
                      <Plus size={16} /> Adicionar Pergunta
                    </button>
                  </div>

                </div>
              </div>

              {/* FOOTER */}
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                <Button variant="secondary" className="h-9 px-5 rounded-xl text-xs" onClick={() => setIsModalOpen(false)}>{t.common.cancel}</Button>
                <Button onClick={handleSaveForm} className="h-9 px-6 rounded-xl text-xs font-bold shadow-md shadow-primary-600/20 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f]">
                  <Save size={14} className="mr-2" /> Gravar Modelo
                </Button>
              </div>
            </div>
          </div>, document.body
        )
      }

      {/* MODAL 3: REGRA DE VINCULAÇÃO */}
      {
        isRuleModalOpen && editingRule && createPortal(
          <div className="fixed inset-0 z-[160] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 sm:p-8 overflow-hidden">
            <div className="bg-white rounded-xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-scale-up">

              {/* HEADER */}
              <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                    <Layers size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900 tracking-tight">{editingRule.id ? 'Editar Vinculação' : 'Nova Vinculação'}</h2>
                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">Nexus Forms • {editingRule.id ? 'Altere os campos da regra' : 'Configure o gatilho inteligente'}</p>
                  </div>
                </div>
                <button onClick={() => setIsRuleModalOpen(false)} className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50"><X size={20} /></button>
              </div>

              {/* BODY */}
              <div className="p-6 bg-slate-50/30">
                <div className="space-y-4">

                  {/* Tipo de Serviço */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-slate-400 ml-1 block">Tipo de Serviço</label>
                    <div className="relative">
                      <button type="button" onClick={() => setRuleDropdown(ruleDropdown === 'type' ? null : 'type')} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium text-left flex items-center justify-between transition-all hover:border-[#1c2d4f]/30 focus:ring-2 focus:ring-[#1c2d4f]/10 focus:border-[#1c2d4f] outline-none">
                        <span className={editingRule.serviceTypeId ? 'text-slate-700' : 'text-slate-400'}>{serviceTypes.find(s => s.id === editingRule.serviceTypeId)?.name || 'Selecione um Tipo...'}</span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform ${ruleDropdown === 'type' ? 'rotate-180' : ''}`} />
                      </button>
                      {ruleDropdown === 'type' && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar animate-fade-in">
                          {serviceTypes.map(st => (
                            <button key={st.id} type="button" onClick={() => { setEditingRule({ ...editingRule, serviceTypeId: st.id }); setRuleDropdown(null); }} className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 ${editingRule.serviceTypeId === st.id ? 'bg-[#1c2d4f]/5 text-[#1c2d4f]' : 'text-slate-600 hover:bg-slate-50'}`}>
                              {editingRule.serviceTypeId === st.id && <CheckCircle2 size={14} className="text-[#1c2d4f] shrink-0" />}
                              <span>{st.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Família do Equipamento */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-slate-400 ml-1 block">Família do Equipamento</label>
                    <div className="relative">
                      <button type="button" onClick={() => setRuleDropdown(ruleDropdown === 'family' ? null : 'family')} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium text-left flex items-center justify-between transition-all hover:border-[#1c2d4f]/30 focus:ring-2 focus:ring-[#1c2d4f]/10 focus:border-[#1c2d4f] outline-none">
                        <span className={editingRule.equipmentFamily ? 'text-slate-700' : 'text-slate-400'}>{editingRule.equipmentFamily || 'Selecione uma Família...'}</span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform ${ruleDropdown === 'family' ? 'rotate-180' : ''}`} />
                      </button>
                      {ruleDropdown === 'family' && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar animate-fade-in">
                          {EQUIPMENT_FAMILIES.map(fam => (
                            <button key={fam} type="button" onClick={() => { setEditingRule({ ...editingRule, equipmentFamily: fam }); setRuleDropdown(null); }} className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 ${editingRule.equipmentFamily === fam ? 'bg-[#1c2d4f]/5 text-[#1c2d4f]' : 'text-slate-600 hover:bg-slate-50'}`}>
                              {editingRule.equipmentFamily === fam && <CheckCircle2 size={14} className="text-[#1c2d4f] shrink-0" />}
                              <span>{fam}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checklist Vinculado */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-slate-400 ml-1 block">Checklist Técnico Vinculado</label>
                    <div className="relative">
                      <button type="button" onClick={() => setRuleDropdown(ruleDropdown === 'form' ? null : 'form')} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium text-left flex items-center justify-between transition-all hover:border-[#1c2d4f]/30 focus:ring-2 focus:ring-[#1c2d4f]/10 focus:border-[#1c2d4f] outline-none">
                        <span className={editingRule.formId ? 'text-slate-700' : 'text-slate-400'}>{forms.find(f => f.id === editingRule.formId)?.title || 'Selecione um Checklist Técnico...'}</span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform ${ruleDropdown === 'form' ? 'rotate-180' : ''}`} />
                      </button>
                      {ruleDropdown === 'form' && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar animate-fade-in">
                          {forms.filter(f => f.category !== 'FINANCIAL').map(f => (
                            <button key={f.id} type="button" onClick={() => { setEditingRule({ ...editingRule, formId: f.id }); setRuleDropdown(null); }} className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 ${editingRule.formId === f.id ? 'bg-[#1c2d4f]/5 text-[#1c2d4f]' : 'text-slate-600 hover:bg-slate-50'}`}>
                              {editingRule.formId === f.id && <CheckCircle2 size={14} className="text-[#1c2d4f] shrink-0" />}
                              <span>{f.title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Checklist Financeiro Vinculado */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-medium text-slate-400 ml-1 block">Checklist Financeiro/Custos Vinculado (Opcional)</label>
                    <div className="relative">
                      <button type="button" onClick={() => setRuleDropdown(ruleDropdown === 'finForm' ? null : 'finForm')} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-xs font-medium text-left flex items-center justify-between transition-all hover:border-[#1c2d4f]/30 focus:ring-2 focus:ring-[#1c2d4f]/10 focus:border-[#1c2d4f] outline-none">
                        <span className={(editingRule as any).financialFormId ? 'text-slate-700' : 'text-slate-400'}>{forms.find(f => f.id === (editingRule as any).financialFormId)?.title || 'Nenhum Checklist Financeiro...'}</span>
                        <ChevronDown size={14} className={`text-slate-400 transition-transform ${ruleDropdown === 'finForm' ? 'rotate-180' : ''}`} />
                      </button>
                      {ruleDropdown === 'finForm' && (
                        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-48 overflow-y-auto custom-scrollbar animate-fade-in">
                          <button type="button" onClick={() => { setEditingRule({ ...editingRule, financialFormId: null } as any); setRuleDropdown(null); }} className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 ${!(editingRule as any).financialFormId ? 'bg-rose-50 text-rose-600' : 'text-slate-500 hover:bg-slate-50'}`}>
                            <X size={14} className="shrink-0" />
                            <span>Nenhum / Remover Vínculo</span>
                          </button>
                          {forms.filter(f => f.category === 'FINANCIAL').map(f => (
                            <button key={f.id} type="button" onClick={() => { setEditingRule({ ...editingRule, financialFormId: f.id } as any); setRuleDropdown(null); }} className={`w-full text-left px-4 py-2.5 text-xs font-medium transition-colors flex items-center gap-2 ${(editingRule as any).financialFormId === f.id ? 'bg-[#1c2d4f]/5 text-[#1c2d4f]' : 'text-slate-600 hover:bg-slate-50'}`}>
                              {(editingRule as any).financialFormId === f.id && <CheckCircle2 size={14} className="text-[#1c2d4f] shrink-0" />}
                              <span>{f.title}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>

              {/* FOOTER */}
              <div className="px-6 py-4 border-t border-slate-200 bg-white flex justify-end gap-3 shrink-0">
                <button type="button" onClick={() => setIsRuleModalOpen(false)} className="h-9 px-5 rounded-xl text-xs font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">Cancelar</button>
                <Button onClick={handleSaveRule} className="h-9 px-6 rounded-xl text-xs font-semibold bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] text-white">
                  <Workflow size={14} className="mr-2" /> {editingRule.id ? 'Salvar Alterações' : 'Aplicar Vínculo'}
                </Button>
              </div>

            </div>
          </div>, document.body
        )
      }
      </>
      )}
    </div>
  );
};
