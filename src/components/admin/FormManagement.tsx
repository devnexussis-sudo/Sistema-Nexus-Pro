
import React, { useState, useEffect } from 'react';
import { Plus, FileText, Trash2, Edit2, X, Save, GripVertical, CheckCircle2, List, Settings, Settings2, Tag, Layers, ArrowRight, Info, Box, Cpu, Workflow, Search, Filter, Loader2, ChevronLeft } from 'lucide-react';
import { Pagination } from '../ui/Pagination';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { FormTemplate, FormField, FormFieldType } from '../../types';
import { DataService } from '../../services/dataService';

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

  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 12;

  // 1. Estados para Tipos de Atendimento com Persistência

  const [loading, setLoading] = useState(true);
  const [serviceTypes, setServiceTypes] = useState<ServiceType[]>([]);
  const [editingType, setEditingType] = useState<Partial<ServiceType> | null>(null);

  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [editingForm, setEditingForm] = useState<Partial<FormTemplate> | null>(null);

  const [rules, setRules] = useState<ActivationRule[]>([]);
  const [editingRule, setEditingRule] = useState<Partial<ActivationRule> | null>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  // Carregamento Inicial via Cloud
  useEffect(() => {
    let isMounted = true;

    const loadAllProcessData = async () => {
      try {
        if (isMounted) setLoading(true);

        // 🛡️ Fail-Safe: Se demorar mais de 10s, destrava a UI
        const safetyTimer = setTimeout(() => {
          if (isMounted) {
            console.warn("[FormManagement] ⚠️ Safety Timer ativado: destravando UI.");
            setLoading(false);
          }
        }, 10000);

        const [st, f, r] = await Promise.all([
          DataService.getServiceTypes(),
          DataService.getFormTemplates(),
          DataService.getActivationRules()
        ]);

        clearTimeout(safetyTimer);

        if (isMounted) {
          setServiceTypes(st);
          setForms(f);
          setRules(r);
        }
      } catch (err) {
        console.error("Nexus Sync Error:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadAllProcessData();

    // 📡 Auto-Wake: Recarrega se o usuário voltar para a aba após inatividade
    const handleFocus = () => {
      if (document.visibilityState === 'visible') {
        console.log("[FormManagement] 👁️ Aba focada - Verificando frescor dos dados...");
        loadAllProcessData();
      }
    };

    window.addEventListener('visibilitychange', handleFocus);
    window.addEventListener('focus', handleFocus);

    return () => {
      isMounted = false;
      window.removeEventListener('visibilitychange', handleFocus);
      window.removeEventListener('focus', handleFocus);
    }
  }, []);

  // Handlers para Tipos (Cloud)
  const handleSaveType = async () => {
    if (!editingType?.name) return;
    try {
      const res = await DataService.saveServiceType(editingType);
      if (editingType.id) {
        setServiceTypes(serviceTypes.map(t => t.id === res.id ? res : t));
      } else {
        setServiceTypes([...serviceTypes, res]);
      }
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
      setServiceTypes(serviceTypes.filter(t => t.id !== id));
    } catch (e) { alert("Erro ao deletar."); }
  };

  // Handlers para Formulários (Cloud)
  const handleSaveForm = async () => {
    if (!editingForm?.title) return;
    try {
      const res = await DataService.saveFormTemplate(editingForm as FormTemplate);
      if (editingForm.id) {
        setForms(forms.map(f => f.id === res.id ? res : f));
      } else {
        setForms([...forms, res]);
      }
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
      await DataService.deleteFormTemplate(id);
      setForms(forms.filter(f => f.id !== id));
    } catch (e) { alert("Erro ao deletar."); }
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
      const res = await DataService.saveActivationRule(editingRule);
      // Mapeia snake_case do DB para camelCase do front para exibição imediata
      const mappedRule = { ...res, serviceTypeId: res.service_type_id, equipmentFamily: res.equipment_family, formId: res.form_id };

      if (editingRule.id) {
        setRules(rules.map(r => r.id === mappedRule.id ? mappedRule : r));
      } else {
        setRules([...rules, mappedRule]);
      }
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
      setRules(rules.filter(r => r.id !== id));
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
    <div className="p-4 flex flex-col h-full bg-slate-50/20 overflow-hidden animate-fade-in">
      {/* Toolbar */}
      <div className="mb-2 flex flex-col xl:flex-row gap-3 items-center">
        {/* Tabs */}
        <div className="flex bg-white/60 p-1 rounded-xl border border-slate-200 backdrop-blur-sm shadow-sm flex-shrink-0">
          <button
            onClick={() => setActiveTab('types')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'types' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Tag size={14} /> Tipos
          </button>
          <button
            onClick={() => setActiveTab('templates')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'templates' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <FileText size={14} /> Modelos
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${activeTab === 'rules' ? 'bg-[#1c2d4f] text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            <Layers size={14} /> Regras
          </button>
        </div>

        {/* Search */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input
            type="text"
            placeholder="Pesquisar..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-6 py-2.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-4 focus:ring-primary-100 transition-all shadow-sm"
          />
        </div>

        {/* Filters & Actions */}
        <div className="flex items-center gap-2 flex-shrink-0 w-full xl:w-auto justify-end">
          {/* Only show filters if needed (e.g. templates status) */}
          {activeTab === 'templates' && (
            <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 px-3 shadow-sm h-[42px]">
              <Filter size={14} className="text-slate-400 mr-2" />
              <select
                className="bg-transparent text-[10px] font-black uppercase text-slate-600 outline-none cursor-pointer"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
              >
                <option value="ALL">Status</option>
                <option value="ACTIVE">Ativos</option>
                <option value="INACTIVE">Inativo</option>
              </select>
            </div>
          )}

          <Button
            onClick={() => {
              if (activeTab === 'types') { setEditingType({ name: '' }); setIsTypeModalOpen(true); }
              if (activeTab === 'templates') { setEditingForm({ title: '', fields: [], active: true }); setIsModalOpen(true); }
              if (activeTab === 'rules') { setEditingRule({ serviceTypeId: '', equipmentFamily: '', formId: '' }); setIsRuleModalOpen(true); }
            }}
            className="rounded-xl px-6 h-[42px] font-black italic uppercase text-[10px] tracking-widest shadow-lg shadow-primary-600/20 text-white whitespace-nowrap bg-primary-600 hover:bg-primary-700"
          >
            <Plus size={16} className="mr-2" />
            {activeTab === 'types' ? 'Novo Tipo' : activeTab === 'templates' ? 'Novo Modelo' : 'Nova Regra'}
          </Button>
        </div>
      </div>

      <div className="bg-white border border-slate-100 rounded-[2rem] flex flex-col overflow-hidden shadow-2xl shadow-slate-200/40 flex-1 min-h-0">
        <div className="overflow-auto flex-1 p-6 custom-scrollbar">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4 text-primary-600">
              <Loader2 size={48} className="animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest italic">Sincronizando com a Cloud Nexus...</p>
            </div>
          ) : (
            <>
              {/* ABA 1: TIPOS DE SERVIÇO */}
              {activeTab === 'types' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {paginatedTypes.map(type => (
                    <div key={type.id} className="bg-gray-50/50 p-6 rounded-[2.5rem] border border-gray-100 flex items-center justify-between group hover:bg-white transition-all">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white rounded-2xl text-primary-600 shadow-sm"><Tag size={20} /></div>
                        <span className="font-bold text-gray-900 uppercase text-xs tracking-tight">{type.name}</span>
                      </div>
                      <div className="flex gap-1.5 transition-all">
                        <button onClick={() => { setEditingType(type); setIsTypeModalOpen(true); }} className="p-2 bg-primary-50 text-primary-600 hover:bg-primary-100 rounded-xl transition-all border border-primary-200/50" title="Editar"><Edit2 size={16} /></button>
                        <button onClick={(e) => handleDeleteType(type.id, e)} className="p-2 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded-xl transition-all border border-rose-200/50" title="Excluir"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ABA 2: MODELOS DE CHECKLIST */}
              {activeTab === 'templates' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {paginatedForms.map(form => (
                    <div key={form.id} className="bg-slate-50/30 p-8 rounded-[3rem] border border-slate-100 hover:border-primary-200 hover:bg-white transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-6 flex gap-2">
                        <button onClick={() => { setEditingForm(form); setIsModalOpen(true); }} className="p-3 bg-primary-50 text-primary-600 rounded-2xl shadow-sm border border-primary-100 hover:bg-primary-100 transition-all" title="Editar"><Edit2 size={18} /></button>
                        <button onClick={(e) => handleDeleteForm(form.id, e)} className="p-3 bg-rose-50 text-rose-500 rounded-2xl shadow-sm border border-rose-100 hover:bg-rose-100 transition-all" title="Excluir"><Trash2 size={18} /></button>
                      </div>
                      <div className="p-5 bg-white rounded-[2rem] shadow-sm border border-gray-100 w-fit mb-6 text-primary-600"><FileText size={32} /></div>
                      <h3 className="text-xl font-black text-gray-900 mb-2 tracking-tight">{form.title}</h3>
                      <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">{form.fields.length} Questões Configuradas</p>
                    </div>
                  ))}
                </div>
              )}

              {/* ABA 3: REGRAS DE VINCULAÇÃO */}
              {activeTab === 'rules' && (
                <div className="space-y-6">
                  <div className="flex justify-between items-center mb-4 px-4">
                    <h2 className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em]">Matriz de Ativação Automática</h2>
                  </div>
                  <div className="grid grid-cols-1 gap-4">
                    {paginatedRules.map(rule => (
                      <div key={rule.id} className="bg-white border border-gray-100 p-8 rounded-[3rem] shadow-sm flex flex-col md:flex-row items-center gap-8 group hover:shadow-xl transition-all">
                        <div className="flex-1 flex flex-col md:flex-row items-center gap-8 w-full">
                          <div className="bg-primary-50 p-6 rounded-[2rem] text-primary-600 flex flex-col items-center justify-center min-w-[180px]">
                            <Tag size={20} className="mb-2 opacity-50" />
                            <span className="text-[10px] font-black text-center uppercase leading-tight">
                              {serviceTypes.find(t => t.id === rule.serviceTypeId || t.id === (rule as any).service_type_id)?.name || 'Desconhecido'}
                            </span>
                          </div>
                          <div className="text-gray-300 hidden md:block"><ArrowRight size={24} /></div>
                          <div className="bg-emerald-50 p-6 rounded-[2rem] text-emerald-600 flex flex-col items-center justify-center min-w-[180px]">
                            <Cpu size={20} className="mb-2 opacity-50" />
                            <span className="text-[10px] font-black text-center uppercase leading-tight">{rule.equipmentFamily}</span>
                          </div>
                        </div>
                        <div className="flex-1 flex items-center gap-6 bg-gray-50 px-8 py-6 rounded-[2.5rem] border border-dashed border-gray-200 w-full">
                          <Workflow className="text-primary-400" size={28} />
                          <div className="flex-1">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Abre o Checklist:</p>
                            <p className="font-black text-gray-900 text-lg tracking-tight">
                              {forms.find(f => f.id === rule.formId || f.id === (rule as any).form_id)?.title || 'Modelo Excluído'}
                            </p>
                          </div>
                          <button onClick={(e) => handleDeleteRule(rule.id, e)} className="p-4 text-rose-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all">
                            <Trash2 size={24} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {rules.length === 0 && (
                      <div className="py-20 text-center border-2 border-dashed border-gray-100 rounded-[3rem]">
                        <p className="text-gray-300 font-black uppercase tracking-widest text-xs">Nenhuma regra de ativação cadastrada</p>
                      </div>
                    )}
                  </div>
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
        isTypeModalOpen && editingType && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0e25]/80 backdrop-blur-md p-4">
            <div className="bg-white rounded-[4rem] w-full max-w-xl shadow-2xl border border-white/20 animate-fade-in-up">
              <div className="p-10 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic uppercase">Tipo de Atendimento</h2>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Nomeie a operação comercial</p>
                </div>
                <button onClick={() => setIsTypeModalOpen(false)} className="p-3 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-2xl"><X size={24} /></button>
              </div>
              <div className="p-10 space-y-6">
                <Input
                  label="Nome do Atendimento (Ex: Garantia)"
                  value={editingType.name}
                  onChange={e => setEditingType({ ...editingType, name: e.target.value })}
                  className="rounded-2xl py-5 font-black text-lg border-primary-100 bg-primary-50/10"
                />
                <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest px-2 italic">
                  Dica: Use o mesmo nome que deseja exibir na abertura da Ordem de Serviço.
                </p>
              </div>
              <div className="p-10 bg-gray-50 border-t border-gray-100 flex justify-end gap-6 rounded-b-[4rem]">
                <Button variant="secondary" className="rounded-2xl px-8" onClick={() => setIsTypeModalOpen(false)}>Cancelar</Button>
                <Button onClick={handleSaveType} className="rounded-2xl px-12 shadow-xl shadow-primary-600/20 font-black italic">
                  <Save size={20} className="mr-3" /> Salvar Tipo
                </Button>
              </div>
            </div>
          </div>
        )
      }

      {/* MODAL 2: CONSTRUTOR DE FORMULÁRIO */}
      {
        isModalOpen && editingForm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0e25]/80 backdrop-blur-xl p-4">
            <div className="bg-white rounded-[4rem] w-full max-w-5xl shadow-2xl border border-white/20 overflow-hidden flex flex-col max-h-[94vh] animate-fade-in-up">
              <div className="p-12 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
                <div className="flex items-center gap-6">
                  <div className="p-6 bg-primary-50 text-primary-600 rounded-[2rem]"><Settings2 size={40} /></div>
                  <div>
                    <h2 className="text-3xl font-black text-gray-900 tracking-tighter italic uppercase">Checklist Técnico</h2>
                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Estruture os campos de coleta de dados</p>
                  </div>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-5 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-[2.5rem] transition-all"><X size={36} /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-12 space-y-12">
                <Input
                  label="Nome do Modelo"
                  value={editingForm.title}
                  onChange={e => setEditingForm({ ...editingForm, title: e.target.value })}
                  className="rounded-2xl py-5 font-black text-xl border-primary-100 bg-primary-50/5"
                />
                <div className="space-y-6">
                  <div className="flex items-center justify-between px-2">
                    <h3 className="text-xs font-black text-primary-600 uppercase tracking-[0.2em] flex items-center gap-2"><List size={16} /> Campos do Formulário</h3>
                    <Button onClick={addField} variant="secondary" className="rounded-2xl border-primary-200 text-primary-600 px-8 py-3 font-black"><Plus size={20} className="mr-2" /> Adicionar Pergunta</Button>
                  </div>
                  <div className="grid grid-cols-1 gap-6">
                    {(editingForm.fields || []).map((field, index) => (
                      <div key={field.id} className="relative bg-white border-2 border-slate-100 rounded-[3rem] p-8 shadow-sm hover:border-primary-200 hover:shadow-2xl transition-all group">
                        {/* CARD HEADER: LOGIC & DELETE */}
                        <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8 pb-6 border-b border-slate-50">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2 bg-primary-50 px-4 py-2 rounded-2xl border border-primary-100">
                              <span className="text-[10px] font-black text-primary-600 uppercase">Pergunta #{index + 1}</span>
                            </div>

                            {/* REQUIRED TOGGLE */}
                            <button
                              onClick={() => {
                                const fields = editingForm.fields?.map(f => f.id === field.id ? { ...f, required: !f.required } : f);
                                setEditingForm({ ...editingForm, fields });
                              }}
                              className={`flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all ${field.required ? 'bg-red-50 border-red-200 text-red-600' : 'bg-slate-50 border-slate-200 text-slate-400'}`}
                            >
                              <span className="text-[9px] font-black uppercase tracking-widest">{field.required ? 'Obrigatória' : 'Opcional'}</span>
                              <div className={`w-8 h-4 rounded-full relative ${field.required ? 'bg-red-500' : 'bg-slate-300'}`}>
                                <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${field.required ? 'left-4.5' : 'left-0.5'}`} />
                              </div>
                            </button>

                            {/* 🎨 VISIBILITY LOGIC BUTTON (EXTREMELY PROMINENT) */}
                            <button
                              onClick={() => {
                                const fields = editingForm.fields?.map(f => {
                                  if (f.id === field.id) {
                                    return { ...f, showCondition: !(f as any).showCondition };
                                  }
                                  return f;
                                });
                                setEditingForm({ ...editingForm, fields });
                              }}
                              title="Clique para configurar quando esta pergunta deve aparecer"
                              className={`flex items-center gap-2 px-4 py-2 rounded-2xl border transition-all ${field.condition?.fieldId ? 'bg-amber-600 text-white shadow-xl ring-2 ring-amber-300 ring-offset-2' : 'bg-amber-50 border-amber-200 text-amber-600 hover:bg-amber-100 shadow-sm'}`}
                            >
                              <Workflow size={14} className={field.condition?.fieldId ? 'animate-pulse' : ''} />
                              <span className="text-[9px] font-black uppercase tracking-widest whitespace-nowrap">
                                {field.condition?.fieldId ? 'Lógica: Ativa' : 'Adicionar Lógica de Visibilidade'}
                              </span>
                            </button>
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="text-slate-200 cursor-grab px-2 hidden md:block"><GripVertical size={20} /></div>
                            <button onClick={() => setEditingForm({ ...editingForm, fields: editingForm.fields?.filter(f => f.id !== field.id) })} className="p-3 bg-red-50 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-2xl transition-all">
                              <Trash2 size={20} />
                            </button>
                          </div>
                        </div>

                        {/* CARD BODY: INPUTS */}
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
                          <div className="md:col-span-8">
                            <Input
                              label="O que deve ser perguntado?"
                              placeholder="Ex: Qual o estado das vedações?"
                              value={field.label}
                              onChange={e => setEditingForm({ ...editingForm, fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, label: e.target.value } : f) })}
                              className="rounded-2xl bg-slate-50 border-transparent font-bold text-base py-6 px-6"
                            />
                          </div>
                          <div className="md:col-span-4">
                            <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-2 mb-2 block">Tipo de Resposta</label>
                            <select
                              className="w-full bg-slate-50 border-transparent rounded-2xl px-6 py-4 text-xs font-black text-slate-700 focus:ring-4 focus:ring-primary-100 transition-all outline-none"
                              value={field.type}
                              onChange={e => setEditingForm({ ...editingForm, fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, type: e.target.value as FormFieldType } : f) })}
                            >
                              <option value={FormFieldType.TEXT}>Texto Curto</option>
                              <option value={FormFieldType.LONG_TEXT}>Texto Longo / Relato</option>
                              <option value={FormFieldType.SELECT}>Alternativas / Checklist</option>
                              <option value={FormFieldType.PHOTO}>Anexo Fotográfico</option>
                              <option value={FormFieldType.SIGNATURE}>Assinatura Digital</option>
                            </select>
                          </div>

                          {/* Configuração de Alternativas */}
                          {field.type === FormFieldType.SELECT && (
                            <div className="col-span-12 bg-primary-50/30 p-8 rounded-[2.5rem] border-2 border-primary-100/50 space-y-4">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-primary-600 text-white rounded-xl shadow-md"><List size={14} /></div>
                                <span className="text-[10px] font-black uppercase text-primary-600">Configurar Alternativas</span>
                              </div>
                              <Input
                                placeholder="Sim, Não, Regular, Pequeno Vazamento..."
                                value={field.options?.join(', ') || ''}
                                onChange={e => {
                                  const newOptions = e.target.value.split(',').map(s => s.trim());
                                  setEditingForm({
                                    ...editingForm,
                                    fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, options: newOptions } : f)
                                  });
                                }}
                                className="bg-white border-primary-200 font-bold"
                              />
                              <div className="flex gap-2 flex-wrap">
                                {field.options?.filter(o => o.trim()).map((opt, idx) => (
                                  <span key={idx} className="bg-white text-primary-600 border border-primary-200 px-4 py-2 rounded-xl text-[9px] font-black uppercase shadow-sm">
                                    {opt}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* 🧠 PAINEL DE LÓGICA (Google Forms Style) */}
                          {(field.condition?.fieldId || (field as any).showCondition) && (
                            <div className="col-span-12 bg-amber-50 p-8 rounded-[2.5rem] border-2 border-amber-200 border-dashed space-y-6">
                              <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-600 text-white rounded-xl shadow-md"><Workflow size={14} /></div>
                                <span className="text-[10px] font-black uppercase text-amber-700">Configuração de Gatilho Inteligente</span>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="space-y-3">
                                  <label className="text-[9px] font-black text-amber-800 uppercase tracking-widest px-1">Exibir esta pergunta somente se:</label>
                                  <select
                                    className="w-full bg-white border border-amber-200 rounded-2xl px-6 py-4 text-[11px] font-black text-slate-700 outline-none focus:ring-4 focus:ring-amber-200 shadow-sm"
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
                                    <option value="">Sempre exibir (Padrão)</option>
                                    {editingForm.fields?.filter(f => f.id !== field.id).map(f => (
                                      <option key={f.id} value={f.id}>{f.label || 'Sem título'}</option>
                                    ))}
                                  </select>
                                </div>

                                {field.condition?.fieldId && (
                                  <div className="space-y-3">
                                    <label className="text-[9px] font-black text-amber-800 uppercase tracking-widest px-1">A resposta for igual a:</label>
                                    {(() => {
                                      const parentField = editingForm.fields?.find(f => f.id === field.condition?.fieldId);
                                      if (parentField?.type === FormFieldType.SELECT && parentField.options && parentField.options.length > 0) {
                                        return (
                                          <select
                                            className="w-full bg-white border border-amber-200 rounded-2xl px-6 py-4 text-[11px] font-black text-slate-700 outline-none focus:ring-4 focus:ring-amber-200 shadow-sm"
                                            value={field.condition.value}
                                            onChange={e => {
                                              const val = e.target.value;
                                              const fields = editingForm.fields?.map(f => {
                                                if (f.id === field.id) {
                                                  return { ...f, condition: { ...f.condition!, value: val } };
                                                }
                                                return f;
                                              });
                                              setEditingForm({ ...editingForm, fields });
                                            }}
                                          >
                                            <option value="">Selecione uma opção...</option>
                                            {parentField.options.map((opt, idx) => (
                                              <option key={idx} value={opt}>{opt}</option>
                                            ))}
                                          </select>
                                        );
                                      }
                                      return (
                                        <input
                                          type="text"
                                          placeholder="Valor da resposta..."
                                          className="w-full bg-white border border-amber-200 rounded-2xl px-6 py-4 text-[11px] font-black text-slate-700 outline-none focus:ring-4 focus:ring-amber-200 shadow-sm"
                                          value={field.condition.value}
                                          onChange={e => {
                                            const val = e.target.value;
                                            const fields = editingForm.fields?.map(f => {
                                              if (f.id === field.id) {
                                                return { ...f, condition: { ...f.condition!, value: val } };
                                              }
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
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-12 border-t border-gray-100 bg-gray-50 flex justify-end gap-6 sticky bottom-0 z-10 rounded-b-[4rem]">
                <Button variant="secondary" className="rounded-[1.5rem] px-12" onClick={() => setIsModalOpen(false)}>Descartar</Button>
                <Button onClick={handleSaveForm} className="rounded-[1.5rem] px-20 shadow-2xl shadow-primary-600/30 font-black italic">
                  <Save size={24} className="mr-3" /> Gravar Modelo
                </Button>
              </div>
            </div>
          </div>
        )
      }

      {/* MODAL 3: REGRA DE VINCULAÇÃO */}
      {
        isRuleModalOpen && editingRule && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0e25]/80 backdrop-blur-md p-4">
            <div className="bg-white rounded-[4rem] w-full max-w-2xl shadow-2xl border border-white/20 animate-fade-in-up">
              <div className="p-10 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <h2 className="text-2xl font-black text-gray-900 tracking-tighter italic uppercase">Criar Nova Vinculação</h2>
                  <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mt-1">Defina o gatilho inteligente</p>
                </div>
                <button onClick={() => setIsRuleModalOpen(false)} className="p-3 text-gray-400 hover:text-gray-900 bg-gray-50 rounded-2xl"><X size={24} /></button>
              </div>
              <div className="p-10 space-y-10">
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-primary-600 uppercase tracking-widest px-2 block">1. Se o Tipo de Serviço for:</label>
                  <select
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 text-sm font-black text-gray-900 focus:ring-4 focus:ring-primary-100"
                    value={editingRule.serviceTypeId}
                    onChange={e => setEditingRule({ ...editingRule, serviceTypeId: e.target.value })}
                  >
                    <option value="">Selecione um Tipo...</option>
                    {serviceTypes.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                  </select>
                </div>
                <div className="space-y-4">
                  <label className="text-[10px] font-black text-primary-600 uppercase tracking-widest px-2 block">2. E a Família do Equipamento for:</label>
                  <select
                    className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 text-sm font-black text-gray-900 focus:ring-4 focus:ring-primary-100"
                    value={editingRule.equipmentFamily}
                    onChange={e => setEditingRule({ ...editingRule, equipmentFamily: e.target.value })}
                  >
                    <option value="">Selecione uma Família...</option>
                    {EQUIPMENT_FAMILIES.map(fam => <option key={fam} value={fam}>{fam}</option>)}
                  </select>
                </div>
                <div className="space-y-4 pt-4 border-t-2 border-dashed border-gray-100">
                  <label className="text-[10px] font-black text-emerald-600 uppercase tracking-widest px-2 block">3. Então ative o Modelo de Checklist:</label>
                  <select
                    className="w-full bg-emerald-50 border border-emerald-100 rounded-2xl px-6 py-4 text-sm font-black text-emerald-900 focus:ring-4 focus:ring-emerald-100"
                    value={editingRule.formId}
                    onChange={e => setEditingRule({ ...editingRule, formId: e.target.value })}
                  >
                    <option value="">Selecione um Checklist...</option>
                    {forms.map(f => <option key={f.id} value={f.id}>{f.title}</option>)}
                  </select>
                </div>
              </div>
              <div className="p-10 bg-gray-50 border-t border-gray-100 flex justify-end gap-6 rounded-b-[4rem]">
                <Button variant="secondary" className="rounded-2xl px-8" onClick={() => setIsRuleModalOpen(false)}>Cancelar</Button>
                <Button onClick={handleSaveRule} className="rounded-2xl px-12 shadow-xl shadow-primary-600/20 font-black italic">
                  <Workflow size={20} className="mr-3" /> Aplicar Vínculo
                </Button>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};
