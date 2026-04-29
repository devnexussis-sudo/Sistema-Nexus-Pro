
import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Plus, FileText, Trash2, Edit2, X, Save, GripVertical, CheckCircle2, List, Settings, Settings2, Tag, Layers, ArrowRight, Info, Box, Cpu, Workflow, Search, Filter, Loader2, ChevronLeft, RefreshCw } from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FormTemplate, FormField, FormFieldType } from '../../types';
import { DataService } from '../../services/dataService';
import { useForms, useServiceTypes, useActivationRules } from '../../hooks/nexusHooks';

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
}

export const FormManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'types' | 'templates' | 'rules'>('types');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isRuleModalOpen, setIsRuleModalOpen] = useState(false);
  const [isTypeModalOpen, setIsTypeModalOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  // ✅ React Query hooks — cache persistente, sem loop de loading
  const {
    data: serviceTypesRaw = [],
    isLoading: typesLoading,
    refetch: refetchTypes
  } = useServiceTypes(true);

  const {
    data: formsRaw = [],
    isLoading: formsLoading,
    refetch: refetchForms
  } = useForms(true);

  const {
    data: rulesRaw = [],
    isLoading: rulesLoading,
    refetch: refetchRules
  } = useActivationRules(true);

  // Estado local apenas para edição (não afeta o cache)
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [rules, setRules] = useState<ActivationRule[]>([]);

  // Sincroniza dados do cache com estado local para edição otimista
  useEffect(() => {
    if (serviceTypesRaw.length > 0) setServiceTypes(serviceTypesRaw as ServiceType[]);
  }, [serviceTypesRaw]);

  useEffect(() => {
    if (formsRaw.length > 0) setForms(formsRaw as FormTemplate[]);
  }, [formsRaw]);

  useEffect(() => {
    if (rulesRaw.length > 0) {
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

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

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

            <button
              onClick={handleManualRefresh}
              disabled={loading}
              title="Atualizar dados"
              className="flex items-center justify-center w-10 h-10 rounded-xl bg-white border border-[#1c2d4f]/20 text-[#1c2d4f] hover:bg-[#1c2d4f]/5 transition-all shadow-sm disabled:opacity-50"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            </button>

            <Button
              onClick={() => {
                if (activeTab === 'types') { setEditingType({ name: '' }); setIsTypeModalOpen(true); }
                if (activeTab === 'templates') { setEditingForm({ title: '', fields: [], active: true }); setIsModalOpen(true); }
                if (activeTab === 'rules') { setEditingRule({ serviceTypeId: '', equipmentFamily: '', formId: '' }); setIsRuleModalOpen(true); }
              }}
              className="h-10 px-4 gap-1.5 bg-[#1c2d4f] hover:bg-[#253a66] border-[#1c2d4f] shadow-lg shadow-[#1c2d4f]/20 text-[11px] rounded-xl font-bold whitespace-nowrap text-white"
            >
              <Plus size={16} /> {activeTab === 'types' ? 'Novo Tipo' : activeTab === 'templates' ? 'Novo Modelo' : 'Nova Regra'}
            </Button>
          </div>
        </div>

        {showFilters && activeTab === 'templates' && (
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
          {loading && serviceTypes.length === 0 && forms.length === 0 ? (
            <div className="py-10 flex flex-col items-center justify-center gap-4 text-primary-600">
              <Loader2 size={48} className="animate-spin" />
              <p className="text-xs font-bold   italic">Sincronizando com a Cloud DUNO...</p>
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
                              <button onClick={() => { setEditingType(type); setIsTypeModalOpen(true); }} className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-all" title="Editar"><Edit2 size={16} /></button>
                              <button onClick={(e) => handleDeleteType(type.id, e)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all" title="Excluir"><Trash2 size={16} /></button>
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
                            <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-md">{form.fields.length} Questões</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex justify-end gap-2 opacity-80 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => { setEditingForm(form); setIsModalOpen(true); }} className="p-2 text-primary-600 hover:bg-primary-50 rounded-lg transition-all" title="Editar"><Edit2 size={16} /></button>
                              <button onClick={(e) => handleDeleteForm(form.id, e)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all" title="Excluir"><Trash2 size={16} /></button>
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
                        <th className="px-4 py-3"><Workflow size={14} className="inline mr-1" /> checklist vinculado</th>
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
                             <span className="bg-primary-50 py-1 px-3 border border-primary-100 rounded-md text-[12px] font-medium">
                               {forms.find(f => f.id === rule.formId || f.id === (rule as any).form_id)?.title || 'Excluído'}
                             </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                             <button onClick={(e) => handleDeleteRule(rule.id, e)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition-all" title="Excluir"><Trash2 size={16} /></button>
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
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0d0e25]/80 backdrop-blur-md p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl border border-white/20 animate-fade-in-up">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tighter italic ">Tipo de Atendimento</h2>
                  <p className="text-xs text-gray-400 font-bold   mt-1">Nomeie a operação comercial</p>
                </div>
                <button onClick={() => setIsTypeModalOpen(false)} className="p-3 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-2xl"><X size={24} /></button>
              </div>
              <div className="p-6 space-y-6">
                <Input
                  label="Nome do Atendimento (Ex: Garantia)"
                  value={editingType.name}
                  onChange={e => setEditingType({ ...editingType, name: e.target.value })}
                  className="rounded-2xl py-5 font-bold text-lg border-primary-100 bg-primary-50/10"
                />
                <p className="text-[10px] text-gray-400 font-bold   px-2 italic">
                  Dica: Use o mesmo nome que deseja exibir na abertura da Ordem de Serviço.
                </p>
              </div>
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-6 rounded-b-2xl">
                <Button variant="secondary" className="rounded-2xl px-8" onClick={() => setIsTypeModalOpen(false)}>Cancelar</Button>
                <Button onClick={handleSaveType} className="rounded-2xl px-12 shadow-xl shadow-primary-600/20 font-bold italic">
                  <Save size={20} className="mr-3" /> Salvar Tipo
                </Button>
              </div>
            </div>
          </div>, document.body
        )
      }

      {/* MODAL 2: CONSTRUTOR DE FORMULÁRIO */}
      {
        isModalOpen && editingForm && createPortal(
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-0 lg:p-4 animate-in fade-in">
            <div className="bg-white rounded-none lg:rounded-xl w-full max-w-6xl h-full lg:max-h-[92vh] shadow-2xl flex flex-col overflow-hidden border-0 lg:border border-slate-200">
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
              <div className="flex-1 overflow-y-auto bg-slate-50/30 custom-scrollbar">
                {/* Nome do Modelo — barra fixa no topo do conteúdo */}
                <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-6 py-3 flex items-center gap-4">
                  <label className="text-[10px] font-bold text-slate-500 whitespace-nowrap">Nome:</label>
                  <input
                    type="text"
                    value={editingForm.title}
                    onChange={e => setEditingForm({ ...editingForm, title: e.target.value })}
                    placeholder="Ex: Checklist Preventiva AR Condicionado"
                    className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary-300 transition-all"
                  />
                  <Button onClick={addField} variant="secondary" className="rounded-lg border-primary-200 text-primary-600 px-4 py-2 text-[10px] font-bold whitespace-nowrap">
                    <Plus size={16} className="mr-1.5" /> Pergunta
                  </Button>
                </div>

                {/* LISTA DE PERGUNTAS — Compacta */}
                <div className="p-4 space-y-3">
                  {(editingForm.fields || []).map((field, index) => (
                    <div key={field.id} className="bg-white border border-slate-200 rounded-lg p-3 hover:border-primary-200 transition-all group shadow-lg shadow-slate-200/50">
                      {/* ROW 1: Número + Label + Tipo + Controles */}
                      <div className="flex items-center gap-3">
                        {/* Badge Número */}
                        <span className="text-[9px] font-bold text-primary-600 bg-primary-50 border border-primary-100 px-2 py-1 rounded-md whitespace-nowrap flex-shrink-0">
                          #{index + 1}
                        </span>

                        {/* Label Input */}
                        <input
                          type="text"
                          value={field.label}
                          onChange={e => setEditingForm({ ...editingForm, fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, label: e.target.value } : f) })}
                          placeholder="O que deve ser perguntado?"
                          className="flex-1 bg-slate-50 border border-transparent rounded-lg px-3 py-2 text-sm font-bold text-slate-800 outline-none focus:bg-white focus:border-slate-200 focus:ring-2 focus:ring-primary-100 transition-all min-w-0"
                        />

                        {/* Select Tipo */}
                        <select
                          className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-[10px] font-bold text-slate-600 outline-none focus:ring-2 focus:ring-primary-100 transition-all flex-shrink-0 w-[140px]"
                          value={field.type}
                          onChange={e => setEditingForm({ ...editingForm, fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, type: e.target.value as FormFieldType } : f) })}
                        >
                          <option value={FormFieldType.TEXT}>Texto Curto</option>
                          <option value={FormFieldType.LONG_TEXT}>Texto Longo</option>
                          <option value={FormFieldType.SELECT}>Alternativas</option>
                          <option value={FormFieldType.PHOTO}>Foto</option>
                          <option value={FormFieldType.SIGNATURE}>Assinatura</option>
                        </select>

                        {/* Toggle Obrigatório */}
                        <button
                          title="Obrigatória"
                          onClick={() => {
                            const fields = editingForm.fields?.map(f => f.id === field.id ? { ...f, required: !f.required } : f);
                            setEditingForm({ ...editingForm, fields });
                          }}
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[10px] font-bold transition-all flex-shrink-0 ${field.required ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-400 hover:bg-slate-100'}`}
                        >
                          <CheckCircle2 size={12} className={field.required ? 'text-indigo-600' : 'text-slate-300'} />
                          {field.required ? 'Obrig.' : 'Opcional'}
                        </button>

                        {/* Toggle Lógica */}
                        <button
                          onClick={() => {
                            const fields = editingForm.fields?.map(f => {
                              if (f.id === field.id) return { ...f, showCondition: !(f as any).showCondition };
                              return f;
                            });
                            setEditingForm({ ...editingForm, fields });
                          }}
                          title="Gatilho Inteligente"
                          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border text-[10px] font-bold transition-all flex-shrink-0 ${field.condition?.fieldId ? 'bg-amber-500 text-white border-amber-500 ring-1 ring-amber-300' : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100'}`}
                        >
                          <Workflow size={12} />
                          {field.condition?.fieldId ? 'Ativa' : 'Lógica'}
                        </button>

                        {/* Delete */}
                        <button
                          onClick={() => setEditingForm({ ...editingForm, fields: editingForm.fields?.filter(f => f.id !== field.id) })}
                          className="p-2 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-lg transition-all flex-shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>

                      {/* ROW 2: Opções (Apenas se SELECT) */}
                      {field.type === FormFieldType.SELECT && (
                        <div className="mt-2 pl-8 flex items-center gap-2">
                          <List size={12} className="text-primary-400 flex-shrink-0" />
                          <input
                            type="text"
                            placeholder="Opções separadas por vírgula: Sim, Não, Bom, Ruim..."
                            value={field.options?.join(', ') || ''}
                            onChange={e => {
                              const newOptions = e.target.value.split(',').map(s => s.trim());
                              setEditingForm({ ...editingForm, fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, options: newOptions } : f) });
                            }}
                            className="flex-1 bg-primary-50/50 border border-primary-100 rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all"
                          />
                          <div className="flex gap-1 flex-wrap">
                            {field.options?.filter(o => o.trim()).map((opt, idx) => (
                              <span key={idx} className="bg-white text-primary-600 border border-primary-200 px-2 py-0.5 rounded text-[9px] font-bold">{opt}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* ROW 3: Painel de Lógica (Apenas se ativado) */}
                      {(field.condition?.fieldId || (field as any).showCondition) && (
                        <div className="mt-2 pl-8 flex items-center gap-3 bg-amber-50/80 border border-amber-200 border-dashed rounded-lg p-2.5">
                          <Workflow size={14} className="text-amber-600 flex-shrink-0" />
                          <span className="text-[9px] font-bold text-amber-700 flex-shrink-0">Exibir se:</span>
                          <select
                            className="bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-200 flex-1 min-w-0"
                            value={field.condition?.fieldId || ''}
                            onChange={e => {
                              const val = e.target.value;
                              const fields = editingForm.fields?.map(f => {
                                if (f.id === field.id) {
                                  if (!val) return { ...f, condition: undefined };
                                  return { ...f, condition: { fieldId: val, value: '', operator: 'equals' as const } };
                                }
                                return f;
                              });
                              setEditingForm({ ...editingForm, fields });
                            }}
                          >
                            <option value="">Sempre (Padrão)</option>
                            {editingForm.fields?.filter(f => f.id !== field.id).map(f => (
                              <option key={f.id} value={f.id}>{f.label || 'Sem título'}</option>
                            ))}
                          </select>

                          {field.condition?.fieldId && (
                            <>
                              <span className="text-[9px] font-bold text-amber-700 flex-shrink-0">=</span>
                              {(() => {
                                const parentField = editingForm.fields?.find(f => f.id === field.condition?.fieldId);
                                if (parentField?.type === FormFieldType.SELECT && parentField.options && parentField.options.length > 0) {
                                  return (
                                    <select
                                      className="bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-200 flex-1 min-w-0"
                                      value={field.condition.value}
                                      onChange={e => {
                                        const val = e.target.value;
                                        const fields = editingForm.fields?.map(f => {
                                          if (f.id === field.id) return { ...f, condition: { ...f.condition!, value: val } };
                                          return f;
                                        });
                                        setEditingForm({ ...editingForm, fields });
                                      }}
                                    >
                                      <option value="">Selecione...</option>
                                      {parentField.options.map((opt, idx) => (
                                        <option key={idx} value={opt}>{opt}</option>
                                      ))}
                                    </select>
                                  );
                                }
                                return (
                                  <input
                                    type="text"
                                    placeholder="Valor..."
                                    className="bg-white border border-amber-200 rounded-lg px-3 py-1.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-amber-200 flex-1 min-w-0"
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
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Botão Adicionar ao Final da Lista */}
                  <button onClick={addField} className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-primary-200 text-primary-600 rounded-lg hover:bg-primary-50 transition-colors font-bold text-sm group">
                    <Plus size={20} className="group-hover:scale-110 transition-transform" /> Adicionar Pergunta
                  </button>
                </div>
              </div>

              {/* FOOTER */}
              <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-100 bg-white flex justify-end gap-3 shrink-0">
                <Button variant="secondary" className="h-9 px-5 rounded-xl text-xs" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
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
          <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-[#0d0e25]/80 backdrop-blur-md p-4 animate-in fade-in">
            <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-white/20 animate-fade-in-up">
              <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 tracking-tighter italic ">Criar Nova Vinculação</h2>
                  <p className="text-xs text-gray-400 font-bold   mt-1">Defina o gatilho inteligente</p>
                </div>
                <button onClick={() => setIsRuleModalOpen(false)} className="p-3 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-2xl"><X size={24} /></button>
              </div>
              <div className="p-6 space-y-6">
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-primary-600   px-2 block">1. Se o Tipo de Serviço for:</label>
                  <select
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 text-sm font-bold text-gray-900 focus:ring-4 focus:ring-primary-100"
                    value={editingRule.serviceTypeId}
                    onChange={e => setEditingRule({ ...editingRule, serviceTypeId: e.target.value })}
                  >
                    <option value="">Selecione um Tipo...</option>
                    {serviceTypes.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-bold text-primary-600   px-2 block">2. E a Família do Equipamento for:</label>
                  <select
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 text-sm font-bold text-gray-900 focus:ring-4 focus:ring-primary-100"
                    value={editingRule.equipmentFamily}
                    onChange={e => setEditingRule({ ...editingRule, equipmentFamily: e.target.value })}
                  >
                    <option value="">Selecione uma Família...</option>
                    {EQUIPMENT_FAMILIES.map(fam => <option key={fam} value={fam}>{fam}</option>)}
                  </select>
                </div>
                <div className="space-y-4 pt-4 border-t-2 border-dashed border-gray-100">
                  <label className="text-[10px] font-bold text-emerald-600   px-2 block">3. Então ative o Modelo de Checklist:</label>
                  <select
                    className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl px-6 py-4 text-sm font-bold text-emerald-900 focus:ring-4 focus:ring-emerald-100"
                    value={editingRule.formId}
                    onChange={e => setEditingRule({ ...editingRule, formId: e.target.value })}
                  >
                    <option value="">Selecione um Checklist...</option>
                    {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-6 rounded-b-2xl">
                <Button variant="secondary" className="rounded-2xl px-8" onClick={() => setIsRuleModalOpen(false)}>Cancelar</Button>
                <Button onClick={handleSaveRule} className="rounded-2xl px-12 shadow-xl shadow-primary-600/20 font-bold italic">
                  <Workflow size={20} className="mr-3" /> Aplicar Vínculo
                </Button>
              </div>
            </div>
          </div>, document.body
        )
      }
    </div>
  );
};
