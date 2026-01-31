
import React, { useState, useEffect } from 'react';
import { Plus, FileText, Trash2, Edit2, X, Save, GripVertical, CheckCircle2, List, Settings, Settings2, Tag, Layers, ArrowRight, Info, Box, Cpu, Workflow, Search, Filter, Loader2 } from 'lucide-react';
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
    const loadAllProcessData = async () => {
      try {
        setLoading(true);
        const [st, f, r] = await Promise.all([
          DataService.getServiceTypes(),
          DataService.getFormTemplates(),
          DataService.getActivationRules()
        ]);
        setServiceTypes(st);
        setForms(f);
        setRules(r);
      } catch (err) {
        console.error("Nexus Sync Error:", err);
      } finally {
        setLoading(false);
      }
    };
    loadAllProcessData();
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

  return (
    <div className="p-6 md:p-10 space-y-8 flex-1 flex flex-col min-h-0 bg-white/50">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-3xl font-black text-gray-900 tracking-tighter italic uppercase flex items-center gap-3">
            <Workflow className="text-indigo-600" size={32} />
            Gestão de Processos
          </h1>
          <p className="text-gray-500 text-sm font-medium">Cadastre tipos, crie modelos e defina regras de ativação.</p>
        </div>
        <Button
          onClick={() => {
            if (activeTab === 'types') { setEditingType({ name: '' }); setIsTypeModalOpen(true); }
            if (activeTab === 'templates') { setEditingForm({ title: '', fields: [], active: true }); setIsModalOpen(true); }
            if (activeTab === 'rules') { setEditingRule({ serviceTypeId: '', equipmentFamily: '', formId: '' }); setIsRuleModalOpen(true); }
          }}
          className="rounded-[1.5rem] px-8 py-6 shadow-2xl shadow-indigo-600/20 border-b-4 border-indigo-800 active:border-b-0 transition-all"
        >
          <Plus size={20} className="mr-2" />
          {activeTab === 'types' ? 'Novo Tipo' : activeTab === 'templates' ? 'Novo Modelo' : 'Nova Regra'}
        </Button>
      </div>

      {/* Navegação por Abas */}
      <div className="flex gap-4 p-2 bg-gray-100/80 backdrop-blur-sm w-fit rounded-[2rem] border border-gray-200">
        <button
          onClick={() => setActiveTab('types')}
          className={`px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'types' ? 'bg-white text-indigo-600 shadow-xl border border-indigo-50' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <Tag size={18} /> 1. Tipos de Serviço
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'templates' ? 'bg-white text-indigo-600 shadow-xl border border-indigo-50' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <FileText size={18} /> 2. Modelos de Checklist
        </button>
        <button
          onClick={() => setActiveTab('rules')}
          className={`px-8 py-3 rounded-[1.5rem] text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 ${activeTab === 'rules' ? 'bg-white text-indigo-600 shadow-xl border border-indigo-50' : 'text-gray-400 hover:text-gray-600'}`}
        >
          <Layers size={18} /> 3. Regras de Vinculação
        </button>
      </div>

      <div className="bg-white border border-gray-100 rounded-[3.5rem] overflow-hidden flex-1 flex flex-col min-h-0 shadow-2xl shadow-gray-200/50">
        <div className="p-8 border-b border-gray-50 bg-gray-50/30 flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="relative w-full max-w-md">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
            <input
              type="text"
              placeholder="Procurar neste processo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-2xl pl-12 pr-6 py-4 text-xs font-bold text-slate-700 outline-none shadow-sm"
            />
          </div>
          {activeTab === 'templates' && (
            <div className="flex items-center gap-3">
              <div className="flex items-center bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
                <button className="p-3 text-slate-400 hover:text-indigo-600"><Filter size={18} /></button>
                <select
                  className="bg-transparent pr-4 py-2 text-[10px] font-black uppercase text-slate-500 outline-none"
                  value={statusFilter}
                  onChange={e => setStatusFilter(e.target.value)}
                >
                  <option value="ALL">Status</option>
                  <option value="ACTIVE">Ativos</option>
                  <option value="INACTIVE">Inativos</option>
                </select>
              </div>
            </div>
          )}
        </div>
        <div className="overflow-auto flex-1 p-8">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4 text-indigo-600">
              <Loader2 size={48} className="animate-spin" />
              <p className="text-xs font-black uppercase tracking-widest italic">Sincronizando com a Cloud Nexus...</p>
            </div>
          ) : (
            <>
              {/* ABA 1: TIPOS DE SERVIÇO */}
              {activeTab === 'types' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTypes.map(type => (
                    <div key={type.id} className="bg-gray-50/50 p-6 rounded-[2.5rem] border border-gray-100 flex items-center justify-between group hover:bg-white transition-all">
                      <div className="flex items-center gap-4">
                        <div className="p-3 bg-white rounded-2xl text-indigo-600 shadow-sm"><Tag size={20} /></div>
                        <span className="font-bold text-gray-900 uppercase text-xs tracking-tight">{type.name}</span>
                      </div>
                      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                        <button onClick={() => { setEditingType(type); setIsTypeModalOpen(true); }} className="p-2 text-gray-400 hover:text-indigo-600"><Edit2 size={16} /></button>
                        <button onClick={(e) => handleDeleteType(type.id, e)} className="p-2 text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ABA 2: MODELOS DE CHECKLIST */}
              {activeTab === 'templates' && (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {filteredForms.map(form => (
                    <div key={form.id} className="bg-gray-50/30 p-8 rounded-[3rem] border border-gray-100 hover:border-indigo-200 hover:bg-white transition-all group relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity flex gap-2">
                        <button onClick={() => { setEditingForm(form); setIsModalOpen(true); }} className="p-3 bg-white text-indigo-600 rounded-2xl shadow-md"><Edit2 size={16} /></button>
                        <button onClick={(e) => handleDeleteForm(form.id, e)} className="p-3 bg-white text-red-500 rounded-2xl shadow-md"><Trash2 size={16} /></button>
                      </div>
                      <div className="p-5 bg-white rounded-[2rem] shadow-sm border border-gray-100 w-fit mb-6 text-indigo-600"><FileText size={32} /></div>
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
                    {filteredRules.map(rule => (
                      <div key={rule.id} className="bg-white border border-gray-100 p-8 rounded-[3rem] shadow-sm flex flex-col md:flex-row items-center gap-8 group hover:shadow-xl transition-all">
                        <div className="flex-1 flex flex-col md:flex-row items-center gap-8 w-full">
                          <div className="bg-indigo-50 p-6 rounded-[2rem] text-indigo-600 flex flex-col items-center justify-center min-w-[180px]">
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
                          <Workflow className="text-indigo-400" size={28} />
                          <div className="flex-1">
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Abre o Checklist:</p>
                            <p className="font-black text-gray-900 text-lg tracking-tight">
                              {forms.find(f => f.id === rule.formId || f.id === (rule as any).form_id)?.title || 'Modelo Excluído'}
                            </p>
                          </div>
                          <button onClick={(e) => handleDeleteRule(rule.id, e)} className="p-4 text-red-300 hover:text-red-500 hover:bg-white rounded-2xl transition-all">
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
      </div>

      {/* MODAL 1: TIPO DE SERVIÇO */}
      {isTypeModalOpen && editingType && (
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
                className="rounded-2xl py-5 font-black text-lg border-indigo-100 bg-indigo-50/10"
              />
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest px-2 italic">
                Dica: Use o mesmo nome que deseja exibir na abertura da Ordem de Serviço.
              </p>
            </div>
            <div className="p-10 bg-gray-50 border-t border-gray-100 flex justify-end gap-6 rounded-b-[4rem]">
              <Button variant="secondary" className="rounded-2xl px-8" onClick={() => setIsTypeModalOpen(false)}>Cancelar</Button>
              <Button onClick={handleSaveType} className="rounded-2xl px-12 shadow-xl shadow-indigo-600/20 font-black italic">
                <Save size={20} className="mr-3" /> Salvar Tipo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: CONSTRUTOR DE FORMULÁRIO */}
      {isModalOpen && editingForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0d0e25]/80 backdrop-blur-xl p-4">
          <div className="bg-white rounded-[4rem] w-full max-w-5xl shadow-2xl border border-white/20 overflow-hidden flex flex-col max-h-[94vh] animate-fade-in-up">
            <div className="p-12 border-b border-gray-100 flex justify-between items-center bg-white sticky top-0 z-10">
              <div className="flex items-center gap-6">
                <div className="p-6 bg-indigo-50 text-indigo-600 rounded-[2rem]"><Settings2 size={40} /></div>
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
                className="rounded-2xl py-5 font-black text-xl border-indigo-100 bg-indigo-50/5"
              />
              <div className="space-y-6">
                <div className="flex items-center justify-between px-2">
                  <h3 className="text-xs font-black text-indigo-600 uppercase tracking-[0.2em] flex items-center gap-2"><List size={16} /> Campos do Formulário</h3>
                  <Button onClick={addField} variant="secondary" className="rounded-2xl border-indigo-200 text-indigo-600 px-8 py-3 font-black"><Plus size={20} className="mr-2" /> Adicionar Pergunta</Button>
                </div>
                <div className="grid grid-cols-1 gap-6">
                  {(editingForm.fields || []).map((field) => (
                    <div key={field.id} className="bg-white border-2 border-gray-50 p-8 rounded-[3rem] flex gap-8 items-start group hover:border-indigo-100 hover:shadow-xl transition-all">
                      <div className="pt-4 text-gray-200 cursor-grab"><GripVertical size={24} /></div>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-12 gap-8">
                        <div className="md:col-span-7">
                          <Input
                            label="Pergunta"
                            value={field.label}
                            onChange={e => setEditingForm({ ...editingForm, fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, label: e.target.value } : f) })}
                            className="rounded-2xl bg-gray-50/50 border-transparent font-bold"
                          />
                        </div>
                        <div className="md:col-span-3">
                          <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-2 mb-2 block">Tipo</label>
                          <select
                            className="w-full bg-gray-50 border-transparent rounded-2xl px-5 py-3 text-xs font-black text-gray-700 focus:ring-2 focus:ring-indigo-500 appearance-none shadow-inner"
                            value={field.type}
                            onChange={e => setEditingForm({ ...editingForm, fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, type: e.target.value as FormFieldType } : f) })}
                          >
                            <option value={FormFieldType.TEXT}>Texto</option>
                            <option value={FormFieldType.SELECT}>Alternativas</option>
                            <option value={FormFieldType.PHOTO}>Câmera / Foto</option>
                            {/* Assinatura agora é fixa no encerramento */}
                          </select>
                        </div>
                        <div className="md:col-span-2 flex flex-col justify-center items-end gap-4">
                          <button onClick={() => setEditingForm({ ...editingForm, fields: editingForm.fields?.filter(f => f.id !== field.id) })} className="p-4 text-red-300 hover:text-red-500 hover:bg-red-50 rounded-2xl transition-all"><Trash2 size={24} /></button>
                        </div>

                        {/* Configuração de Alternativas */}
                        {field.type === FormFieldType.SELECT && (
                          <div className="col-span-1 md:col-span-12 bg-indigo-50/50 p-6 rounded-2xl border border-indigo-100 flex flex-col gap-2">
                            <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest px-1 flex items-center gap-2">
                              Opções de Resposta <span className="text-[8px] text-gray-400 font-bold normal-case">(Separe por vírgula)</span>
                            </label>
                            <Input
                              placeholder="Ex: Sim, Não, Talvez"
                              value={field.options?.join(', ') || ''}
                              onChange={e => {
                                const newOptions = e.target.value.split(',').map(s => s.trim());
                                setEditingForm({
                                  ...editingForm,
                                  fields: editingForm.fields?.map(f => f.id === field.id ? { ...f, options: newOptions } : f)
                                });
                              }}
                              className="bg-white border-indigo-100 font-medium"
                            />
                            <div className="flex gap-2 flex-wrap mt-2">
                              {field.options?.filter(o => o.trim()).map((opt, idx) => (
                                <span key={idx} className="bg-white border border-indigo-100 text-indigo-600 px-3 py-1 rounded-lg text-[10px] font-black uppercase shadow-sm">
                                  {opt}
                                </span>
                              ))}
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
              <Button onClick={handleSaveForm} className="rounded-[1.5rem] px-20 shadow-2xl shadow-indigo-600/30 font-black italic">
                <Save size={24} className="mr-3" /> Gravar Modelo
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: REGRA DE VINCULAÇÃO */}
      {isRuleModalOpen && editingRule && (
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
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest px-2 block">1. Se o Tipo de Serviço for:</label>
                <select
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 text-sm font-black text-gray-900 focus:ring-4 focus:ring-indigo-100"
                  value={editingRule.serviceTypeId}
                  onChange={e => setEditingRule({ ...editingRule, serviceTypeId: e.target.value })}
                >
                  <option value="">Selecione um Tipo...</option>
                  {serviceTypes.map(st => <option key={st.id} value={st.id}>{st.name}</option>)}
                </select>
              </div>
              <div className="space-y-4">
                <label className="text-[10px] font-black text-indigo-600 uppercase tracking-widest px-2 block">2. E a Família do Equipamento for:</label>
                <select
                  className="w-full bg-gray-50 border border-gray-100 rounded-2xl px-6 py-4 text-sm font-black text-gray-900 focus:ring-4 focus:ring-indigo-100"
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
              <Button onClick={handleSaveRule} className="rounded-2xl px-12 shadow-xl shadow-indigo-600/20 font-black italic">
                <Workflow size={20} className="mr-3" /> Aplicar Vínculo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
