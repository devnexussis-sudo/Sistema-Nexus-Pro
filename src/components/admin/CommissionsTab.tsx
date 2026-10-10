import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FinancialService } from '../../services/financialService';
import { FormService } from '../../services/formService';
import { useI18n } from '../../i18n';
import { useDialog } from '../../contexts/DialogContext';
import { User } from '../../types';
import { Percent, DollarSign, Edit2, Trash2, Plus, Loader2, Save, X, Activity, Settings2, Info, ChevronDown, Power, PowerOff, FileSpreadsheet, Printer, CheckSquare, Square } from 'lucide-react';
import { exportToExcelWithStyle, printFinancialReport } from '../../utils/financialExportUtils';
import { FloatingBatchBar } from './FloatingBatchBar';

interface CommissionsTabProps {
    techs: User[];
}

export const CommissionsTab: React.FC<CommissionsTabProps> = ({ techs }) => {
    const { t } = useI18n();
    const { showAlert, showConfirm } = useDialog();
    const [rules, setRules] = useState<any[]>([]);
    const [selectedRuleIds, setSelectedRuleIds] = useState<string[]>([]);
    const [serviceTypes, setServiceTypes] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    
    // Modal state
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingRule, setEditingRule] = useState<any | null>(null);

    // Form state
    const [technicianId, setTechnicianId] = useState('');
    const [completedType, setCompletedType] = useState<'fixed' | 'percent'>('fixed');
    const [completedValue, setCompletedValue] = useState<number | ''>('');
    const [blockedType, setBlockedType] = useState<'fixed' | 'percent'>('fixed');
    const [blockedValue, setBlockedValue] = useState<number | ''>('');
    const [modalities, setModalities] = useState<any[]>([]);
    const [ruleType, setRuleType] = useState<'global' | 'modality'>('global');
    const [isActive, setIsActive] = useState(true);

    const loadData = async () => {
        setIsLoading(true);
        try {
            await FinancialService.syncCommissionsForCompletedOrders().catch(() => {});
            const [rulesData, typesData] = await Promise.all([
                FinancialService.getCommissionRules(),
                FormService.getServiceTypes()
            ]);
            setRules(rulesData);
            setServiceTypes(typesData.filter((t: any) => t.active));
        } catch (error: any) {
            showAlert(`Erro ao carregar dados: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const openModal = (rule?: any) => {
        if (rule) {
            setEditingRule(rule);
            setTechnicianId(rule.technicianId || rule.technician_id);
            setCompletedType(rule.completedType || rule.completed_type);
            setCompletedValue(rule.completedValue ?? rule.completed_value);
            setBlockedType(rule.blockedType || rule.blocked_type);
            setBlockedValue(rule.blockedValue ?? rule.blocked_value);
            setModalities(rule.modalities ? [...rule.modalities] : []);
            setRuleType(rule.modalities && rule.modalities.length > 0 ? 'modality' : 'global');
            setIsActive(rule.active !== false);
        } else {
            setEditingRule(null);
            setTechnicianId('');
            setCompletedType('fixed');
            setCompletedValue('');
            setBlockedType('fixed');
            setBlockedValue('');
            setModalities([]);
            setRuleType('global');
            setIsActive(true);
        }
        setIsModalOpen(true);
    };

    const addModality = () => {
        setModalities([...modalities, {
            operationType: '',
            completedType: 'fixed',
            completedValue: '',
            blockedType: 'fixed',
            blockedValue: ''
        }]);
    };

    const removeModality = (index: number) => {
        const newMods = [...modalities];
        newMods.splice(index, 1);
        setModalities(newMods);
    };

    const updateModality = (index: number, field: string, value: any) => {
        const newMods = [...modalities];
        newMods[index][field] = value;
        setModalities(newMods);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!technicianId) {
            showAlert('Selecione um técnico.', 'warning');
            return;
        }
        if (ruleType === 'modality') {
            // Validate modalities
            if (modalities.length === 0) {
                showAlert('Adicione pelo menos uma exceção por modalidade.', 'warning');
                return;
            }
            for (const mod of modalities) {
                if (!mod.operationType) {
                    showAlert('Selecione a Modalidade para todas as regras.', 'warning');
                    return;
                }
                if (mod.completedValue === '' || mod.blockedValue === '') {
                    showAlert('Preencha os valores para todas as regras de modalidade.', 'warning');
                    return;
                }
            }
        }

        // Check for duplicate modalities
        const usedTypes = new Set();
        for (const mod of modalities) {
            if (usedTypes.has(mod.operationType)) {
                showAlert(`A modalidade "${mod.operationType}" está duplicada.`, 'warning');
                return;
            }
            usedTypes.add(mod.operationType);
        }

        setIsSaving(true);
        try {
            const tech = techs.find(t => t.id === technicianId);
            if (!tech) throw new Error("Técnico não encontrado");

            await FinancialService.upsertCommissionRule({
                id: editingRule?.id,
                technicianId,
                technicianName: tech.name,
                completedType: ruleType === 'global' ? completedType : 'fixed',
                completedValue: ruleType === 'global' ? (Number(completedValue) || 0) : 0,
                blockedType: ruleType === 'global' ? blockedType : 'fixed',
                blockedValue: ruleType === 'global' ? (Number(blockedValue) || 0) : 0,
                modalities: ruleType === 'modality' ? modalities.map(m => ({
                    ...m,
                    completedValue: Number(m.completedValue) || 0,
                    blockedValue: Number(m.blockedValue) || 0
                })) : [],
                active: isActive
            });
            
            showAlert('Regra salva com sucesso!', 'success');
            setIsModalOpen(false);
            loadData();
        } catch (error: any) {
            showAlert(`Erro ao salvar regra: ${error.message}`, 'error');
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = (id: string) => {
        showConfirm(
            'Tem certeza que deseja excluir esta regra de comissão?',
            async () => {
                try {
                    await FinancialService.deleteCommissionRule(id);
                    showAlert('Regra excluída!', 'success');
                    loadData();
                } catch (error: any) {
                    showAlert(`Erro ao excluir: ${error.message}`, 'error');
                }
            },
            'Excluir Regra',
            'Excluir',
            true
        );
    };

    const toggleActive = async (rule: any) => {
        const nextState = !rule.active;
        const techName = rule.technicianName || rule.technician_name || 'o técnico';

        showConfirm(
            nextState 
                ? `Deseja ativar a regra de comissão de ${techName}? O sistema voltará a calcular comissões e enviar lançamentos para Contas a Pagar.`
                : `Deseja inativar a regra de comissão de ${techName}? Quando inativada, o sistema NÃO calculará comissões nem enviará lançamentos para Contas a Pagar.`,
            async () => {
                try {
                    await FinancialService.updateCommissionRuleStatus(rule.id, nextState);
                    showAlert(
                        nextState 
                            ? 'Regra ativada com sucesso! As comissões voltaram a ser calculadas.' 
                            : 'Regra inativada com sucesso! As comissões foram pausadas.', 
                        'success'
                    );
                    loadData();
                } catch (error: any) {
                    showAlert(`Erro ao alterar status da regra: ${error.message}`, 'error');
                }
            },
            nextState ? 'Ativar Regra' : 'Inativar Regra',
            nextState ? 'Ativar' : 'Inativar',
            !nextState
        );
    };

    const formatValue = (type: string, value: number) => {
        if (type === 'percent') return `${value}%`;
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    };

    const handleToggleSelectAll = () => {
        if (selectedRuleIds.length === rules.length) {
            setSelectedRuleIds([]);
        } else {
            setSelectedRuleIds(rules.map(r => r.id));
        }
    };

    const handleToggleRule = (id: string) => {
        setSelectedRuleIds(prev => 
            prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
        );
    };

    const handleExportExcel = () => {
        if (selectedRuleIds.length === 0) {
            showAlert('Selecione ao menos uma regra para exportar.', 'warning');
            return;
        }

        const itemsToExport = rules.filter(r => selectedRuleIds.includes(r.id));

        if (itemsToExport.length === 0) {
            showAlert('Nenhuma regra selecionada para exportar.', 'warning');
            return;
        }

        const headers = [
            'Técnico',
            'Status',
            'Tipo de Regra',
            'OS Concluída (Padrão)',
            'OS Impedida (Padrão)',
            'Exceções por Modalidade'
        ];

        const rows = itemsToExport.map(r => {
            const techName = r.technicianName || r.technician_name || 'N/A';
            const status = r.active !== false ? 'ATIVA' : 'PAUSADA / INATIVA';
            const ruleType = r.modalities && r.modalities.length > 0 ? 'Por Modalidade' : 'Padrão Global';
            const compStr = formatValue(r.completedType || r.completed_type, r.completedValue ?? r.completed_value);
            const blkStr = formatValue(r.blockedType || r.blocked_type, r.blockedValue ?? r.blocked_value);
            const modsStr = r.modalities && r.modalities.length > 0 
                ? r.modalities.map((m: any) => `${m.operationType}: Concl. ${formatValue(m.completedType, m.completedValue)} / Imp. ${formatValue(m.blockedType, m.blockedValue)}`).join('; ')
                : 'Nenhuma';

            return [techName, status, ruleType, compStr, blkStr, modsStr];
        });

        const colWidths = [
            { wch: 25 },
            { wch: 18 },
            { wch: 20 },
            { wch: 22 },
            { wch: 22 },
            { wch: 45 }
        ];

        exportToExcelWithStyle({
            filename: `Nexus_Regras_Comissao_${new Date().toISOString().split('T')[0]}`,
            sheetName: 'Regras de Comissão',
            headers,
            rows,
            colWidths
        });
    };

    const handlePrintPdf = () => {
        if (selectedRuleIds.length === 0) {
            showAlert('Selecione ao menos uma regra para imprimir.', 'warning');
            return;
        }

        const itemsToPrint = rules.filter(r => selectedRuleIds.includes(r.id));

        if (itemsToPrint.length === 0) {
            showAlert('Nenhuma regra selecionada para imprimir.', 'warning');
            return;
        }

        const headers = [
            'Técnico',
            'OS Concluída',
            'OS Impedida',
            'Exceções',
            'Status'
        ];

        const rows = itemsToPrint.map(r => {
            const techName = r.technicianName || r.technician_name || 'N/A';
            const compStr = formatValue(r.completedType || r.completed_type, r.completedValue ?? r.completed_value);
            const blkStr = formatValue(r.blockedType || r.blocked_type, r.blockedValue ?? r.blocked_value);
            const modsCount = r.modalities && r.modalities.length > 0 ? `${r.modalities.length} exceção(ões)` : 'Nenhuma';
            const status = r.active !== false ? 'ATIVA' : 'PAUSADA';

            return [techName, compStr, blkStr, modsCount, status];
        });

        const activeCount = itemsToPrint.filter(r => r.active !== false).length;
        const pausedCount = itemsToPrint.filter(r => r.active === false).length;

        const userStored = localStorage.getItem('nexus_user');
        let userName = 'Administrador';
        try { if (userStored) userName = JSON.parse(userStored)?.name || userName; } catch {}

        printFinancialReport({
            title: 'Relatório de Regras de Comissão',
            subtitle: `${itemsToPrint.length} Regras Selecionadas`,
            headers,
            rows,
            colAlignments: ['left', 'center', 'center', 'center', 'center'],
            summaryCards: [
                { label: 'Total de Regras', value: String(itemsToPrint.length), color: '#0f172a' },
                { label: 'Regras Ativas', value: String(activeCount), color: '#059669' },
                { label: 'Regras Pausadas', value: String(pausedCount), color: '#d97706' },
            ],
            userName
        });
    };

    return (
        <div className="p-4 bg-slate-50/20 h-full overflow-y-auto">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-800">Regras de Comissão</h2>
                    <p className="text-xs text-slate-500">Configure comissões automáticas (Padrão ou por Modalidade)</p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedRuleIds.length > 0 && (
                        <>
                            <button
                                onClick={handleExportExcel}
                                className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-emerald-700 rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 active:scale-95 animate-in fade-in"
                                title={`Exportar ${selectedRuleIds.length} regras selecionadas para Excel`}
                            >
                                <FileSpreadsheet size={14} className="text-emerald-600" />
                                <span className="hidden sm:inline">Excel ({selectedRuleIds.length})</span>
                            </button>

                            <button
                                onClick={handlePrintPdf}
                                className="h-9 px-3 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 hover:text-[#1c2d4f] rounded-lg text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 active:scale-95 animate-in fade-in"
                                title={`Imprimir ${selectedRuleIds.length} regras selecionadas em PDF`}
                            >
                                <Printer size={14} className="text-[#1c2d4f]" />
                                <span className="hidden sm:inline">PDF ({selectedRuleIds.length})</span>
                            </button>
                        </>
                    )}

                    <button
                        onClick={() => openModal()}
                        className="flex items-center gap-2 px-4 h-9 bg-[#1c2d4f] hover:bg-[#2a4170] text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                    >
                        <Plus size={16} /> Adicionar Regra
                    </button>
                </div>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center p-12 text-slate-400">
                    <Loader2 className="animate-spin mb-2" size={24} />
                    <span className="text-xs uppercase font-medium">Carregando regras...</span>
                </div>
            ) : rules.length === 0 ? (
                <div className="bg-white p-12 rounded-xl border border-slate-200 text-center shadow-sm">
                    <Activity size={32} className="mx-auto text-slate-300 mb-3" />
                    <h3 className="text-base font-semibold text-slate-700 mb-1">Nenhuma regra configurada</h3>
                    <p className="text-sm text-slate-500">Adicione regras para automatizar lançamentos de comissão nas contas a pagar.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/80 border-b border-slate-200">
                                <th className="py-3 px-3 w-10 text-center">
                                    <button
                                        type="button"
                                        onClick={handleToggleSelectAll}
                                        className="text-slate-400 hover:text-slate-700 transition-colors flex items-center justify-center mx-auto"
                                        title={selectedRuleIds.length === rules.length ? "Desmarcar todos" : "Selecionar todos"}
                                    >
                                        {rules.length > 0 && selectedRuleIds.length === rules.length ? (
                                            <CheckSquare size={16} className="text-[#1c2d4f]" />
                                        ) : (
                                            <Square size={16} />
                                        )}
                                    </button>
                                </th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest">Técnico</th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">OS Concluída (Padrão)</th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">OS Impedida (Padrão)</th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Exceções</th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Status</th>
                                <th className="py-3 px-4 text-[10px] font-bold text-slate-500 uppercase tracking-widest text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {rules.map(rule => {
                                const isSelected = selectedRuleIds.includes(rule.id);
                                return (
                                <tr key={rule.id} className={`transition-colors group ${isSelected ? 'bg-blue-50/50' : rule.active ? 'hover:bg-slate-50' : 'bg-slate-50/70 opacity-75 hover:bg-slate-100/70'}`}>
                                    <td className="py-3 px-3 w-10 text-center">
                                        <button
                                            type="button"
                                            onClick={() => handleToggleRule(rule.id)}
                                            className="text-slate-400 hover:text-slate-700 transition-colors flex items-center justify-center mx-auto"
                                        >
                                            {isSelected ? (
                                                <CheckSquare size={16} className="text-[#1c2d4f]" />
                                            ) : (
                                                <Square size={16} />
                                            )}
                                        </button>
                                    </td>
                                    <td className="py-3 px-4 font-semibold text-sm text-slate-700 uppercase">
                                        <div className="flex items-center gap-2">
                                            <span>{rule.technicianName || rule.technician_name}</span>
                                            {!rule.active && (
                                                <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-200">
                                                    Pausada
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100">
                                            {(rule.completedType || rule.completed_type) === 'percent' ? <Percent size={12} /> : <DollarSign size={12} />}
                                            {formatValue(rule.completedType || rule.completed_type, rule.completedValue ?? rule.completed_value)}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-100">
                                            {(rule.blockedType || rule.blocked_type) === 'percent' ? <Percent size={12} /> : <DollarSign size={12} />}
                                            {formatValue(rule.blockedType || rule.blocked_type, rule.blockedValue ?? rule.blocked_value)}
                                        </span>
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        {rule.modalities && rule.modalities.length > 0 ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100">
                                                <Settings2 size={12} /> {rule.modalities.length} {rule.modalities.length === 1 ? 'Exceção' : 'Exceções'}
                                            </span>
                                        ) : (
                                            <span className="text-xs text-slate-400 font-medium">Nenhuma</span>
                                        )}
                                    </td>
                                    <td className="py-3 px-4 text-center">
                                        <button 
                                            onClick={() => toggleActive(rule)} 
                                            title={rule.active ? "Regra Ativa: Clique para inativar" : "Regra Inativa: Clique para ativar"}
                                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                                                rule.active 
                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' 
                                                    : 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                                            }`}
                                        >
                                            <div className={`w-1.5 h-1.5 rounded-full ${rule.active ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                                            <span>{rule.active ? 'Ativa' : 'Inativa'}</span>
                                        </button>
                                    </td>
                                    <td className="py-3 px-4 text-right">
                                        <div className="flex justify-end items-center gap-1.5">
                                            <button 
                                                onClick={() => toggleActive(rule)} 
                                                className={`p-1.5 rounded-lg border transition-all ${
                                                    rule.active 
                                                        ? 'text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200' 
                                                        : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border-emerald-200'
                                                }`}
                                                title={rule.active ? "Inativar Regra (Pausar comissões e contas a pagar)" : "Ativar Regra (Voltar a comissionar)"}
                                            >
                                                {rule.active ? <PowerOff size={14} /> : <Power size={14} />}
                                            </button>
                                            <button 
                                                onClick={() => openModal(rule)} 
                                                className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors" 
                                                title="Editar Regra"
                                            >
                                                <Edit2 size={14} />
                                            </button>
                                            <button 
                                                onClick={() => handleDelete(rule.id)} 
                                                className="p-1.5 text-rose-500 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors" 
                                                title="Excluir Definitivamente"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            )})}
                        </tbody>
                    </table>
                </div>
            )}

            {/* Modal de Criação / Edição GIGANTE usando Portal para furar bloqueios de Z-Index */}
            {isModalOpen && createPortal(
                <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 bg-slate-50/80">
                            <div>
                                <h3 className="text-base sm:text-lg font-bold text-slate-800 uppercase tracking-wide">
                                    {editingRule ? 'Editar Regra de Comissão' : 'Nova Regra de Comissão'}
                                </h3>
                                <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Configure as regras padrão e exceções por modalidade.</p>
                            </div>
                            <div className="flex items-center gap-3 sm:gap-4">
                                <button 
                                    type="button"
                                    onClick={() => setIsActive(!isActive)}
                                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider border shadow-xs transition-all hover:scale-105 active:scale-95 cursor-pointer ${
                                        isActive 
                                            ? 'bg-emerald-50 border-emerald-300 text-emerald-700 hover:bg-emerald-100' 
                                            : 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100'
                                    }`}
                                    title={isActive ? 'Clique para inativar esta regra' : 'Clique para ativar esta regra'}
                                >
                                    {isActive ? <Power size={13} className="text-emerald-600" /> : <PowerOff size={13} className="text-amber-600" />}
                                    <span>{isActive ? 'Regra Ativa' : 'Regra Inativa'}</span>
                                </button>
                                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-600 transition-colors p-2 bg-white rounded-full shadow-sm border border-slate-200">
                                    <X size={18} />
                                </button>
                            </div>
                        </div>
                        
                        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 bg-slate-50/30">
                            <form id="commission-form" onSubmit={handleSave} className="space-y-6">
                                
                                {/* STATUS DA REGRA & AVISO DE COMISSIONAMENTO */}
                                <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all ${
                                    isActive ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950' : 'bg-amber-50/70 border-amber-200 text-amber-950'
                                }`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`p-2.5 rounded-xl ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                                            {isActive ? <Power size={20} /> : <PowerOff size={20} />}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-xs font-bold uppercase tracking-wider">
                                                    {isActive ? 'Status: Regra Ativa' : 'Status: Regra Inativada'}
                                                </span>
                                                <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-full ${isActive ? 'bg-emerald-200 text-emerald-800' : 'bg-amber-200 text-amber-800'}`}>
                                                    {isActive ? 'Comissionando' : 'Pausada'}
                                                </span>
                                            </div>
                                            <p className="text-[11px] font-medium text-slate-600 mt-0.5">
                                                {isActive 
                                                    ? 'O sistema calcula comissões automaticamente para este técnico e envia lançamentos para Contas a Pagar.' 
                                                    : 'Regra pausada: o sistema NÃO calculará comissões nem gerará lançamentos no Contas a Pagar.'}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setIsActive(!isActive)}
                                        className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border shadow-xs transition-all whitespace-nowrap self-start sm:self-auto cursor-pointer ${
                                            isActive 
                                                ? 'bg-amber-100 hover:bg-amber-200 text-amber-900 border-amber-300' 
                                                : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                                        }`}
                                    >
                                        {isActive ? 'Inativar Regra' : 'Ativar Regra'}
                                    </button>
                                </div>

                                {/* 1. SELEÇÃO DO TÉCNICO */}
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-3">
                                        1. Técnico
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={technicianId}
                                            onChange={e => setTechnicianId(e.target.value)}
                                            required
                                            disabled={!!editingRule}
                                            className="appearance-none cursor-pointer w-full text-sm font-semibold uppercase text-slate-800 bg-slate-50 border border-slate-200 rounded-lg h-12 pl-4 pr-10 outline-none focus:border-[#1c2d4f] focus:ring-1 focus:ring-[#1c2d4f] disabled:opacity-60"
                                        >
                                            <option value="">Selecione um técnico...</option>
                                            {techs.map(t => (
                                                <option key={t.id} value={t.id}>{t.name}</option>
                                            ))}
                                        </select>
                                        <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>

                                {/* OPÇÃO DE REGRA */}
                                <div className="bg-white p-4 sm:p-5 rounded-xl border border-slate-200 shadow-sm">
                                    <label className="text-[11px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2 mb-3">
                                        2. Formato da Regra
                                    </label>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <button
                                            type="button"
                                            onClick={() => setRuleType('global')}
                                            className={`flex-1 h-10 px-4 rounded-lg border font-bold text-xs uppercase tracking-wide transition-all ${ruleType === 'global' ? 'border-[#1c2d4f] bg-indigo-50/40 text-[#1c2d4f]' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                                        >
                                            <div className="flex items-center justify-center gap-2">
                                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${ruleType === 'global' ? 'border-[#1c2d4f]' : 'border-slate-300'}`}>
                                                    {ruleType === 'global' && <div className="w-1.5 h-1.5 bg-[#1c2d4f] rounded-full" />}
                                                </div>
                                                Padrão Global
                                            </div>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setRuleType('modality')}
                                            className={`flex-1 h-10 px-4 rounded-lg border font-bold text-xs uppercase tracking-wide transition-all ${ruleType === 'modality' ? 'border-[#1c2d4f] bg-indigo-50/40 text-[#1c2d4f]' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}
                                        >
                                            <div className="flex items-center justify-center gap-2">
                                                <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${ruleType === 'modality' ? 'border-[#1c2d4f]' : 'border-slate-300'}`}>
                                                    {ruleType === 'modality' && <div className="w-1.5 h-1.5 bg-[#1c2d4f] rounded-full" />}
                                                </div>
                                                Por Modalidade
                                            </div>
                                        </button>
                                    </div>
                                </div>

                                {/* 2. REGRA PADRÃO */}
                                {ruleType === 'global' && (
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="flex items-center gap-2 mb-4">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                                            3. Configurar Regra Padrão
                                        </label>
                                        <div className="group relative">
                                            <Info size={16} className="text-slate-400 cursor-help" />
                                            <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-64 p-2 bg-slate-800 text-white text-[11px] rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                                                Esses valores serão aplicados em TODAS as ordens de serviço, a não ser que haja uma exceção configurada abaixo para a modalidade específica da OS.
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <div className="grid grid-cols-2 gap-6">
                                        {/* OS Concluída */}
                                        <div className="space-y-4 p-4 bg-emerald-50/40 rounded-xl border border-emerald-100">
                                            <div className="text-xs font-bold text-emerald-700 uppercase tracking-widest border-b border-emerald-100 pb-2">
                                                ✅ Quando OS Concluída
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-semibold text-slate-500">Formato</label>
                                                    <div className="relative">
                                                        <select
                                                            value={completedType}
                                                            onChange={e => setCompletedType(e.target.value as 'fixed' | 'percent')}
                                                            className="appearance-none cursor-pointer w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg h-10 pl-3 pr-8 outline-none focus:border-emerald-500"
                                                        >
                                                            <option value="fixed">Fixo (R$)</option>
                                                            <option value="percent">Porcentagem (%)</option>
                                                        </select>
                                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-semibold text-slate-500">Valor / %</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={completedValue}
                                                        onChange={e => setCompletedValue(Number(e.target.value) || '')}
                                                        required
                                                        className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg h-10 px-3 outline-none focus:border-emerald-500"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* OS Impedida */}
                                        <div className="space-y-4 p-4 bg-rose-50/40 rounded-xl border border-rose-100">
                                            <div className="text-xs font-bold text-rose-700 uppercase tracking-widest border-b border-rose-100 pb-2">
                                                🚫 Quando OS Impedida
                                            </div>
                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-semibold text-slate-500">Formato</label>
                                                    <div className="relative">
                                                        <select
                                                            value={blockedType}
                                                            onChange={e => setBlockedType(e.target.value as 'fixed' | 'percent')}
                                                            className="appearance-none cursor-pointer w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg h-10 pl-3 pr-8 outline-none focus:border-rose-500"
                                                        >
                                                            <option value="fixed">Fixo (R$)</option>
                                                            <option value="percent">Porcentagem (%)</option>
                                                        </select>
                                                        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                    </div>
                                                </div>
                                                <div className="space-y-1.5">
                                                    <label className="text-[11px] font-semibold text-slate-500">Valor / %</label>
                                                    <input
                                                        type="number"
                                                        step="0.01"
                                                        min="0"
                                                        value={blockedValue}
                                                        onChange={e => setBlockedValue(Number(e.target.value) || '')}
                                                        required
                                                        className="w-full text-sm font-medium text-slate-700 bg-white border border-slate-200 rounded-lg h-10 px-3 outline-none focus:border-rose-500"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                )}

                                {/* 3. EXCEÇÕES POR MODALIDADE */}
                                {ruleType === 'modality' && (
                                <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-200">
                                    <div className="flex items-center justify-between mb-4">
                                        <label className="text-xs font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                                            3. Regras por Modalidade
                                        </label>
                                        <button
                                            type="button"
                                            onClick={addModality}
                                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-colors"
                                        >
                                            <Plus size={14} /> Adicionar Modalidade
                                        </button>
                                    </div>

                                    {modalities.length === 0 ? (
                                        <div className="p-8 border-2 border-dashed border-slate-200 rounded-xl text-center">
                                            <p className="text-sm text-slate-500 font-medium">Nenhuma modalidade configurada.</p>
                                            <p className="text-xs text-slate-400 mt-1">Adicione pelo menos uma modalidade para definir o comissionamento.</p>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {modalities.map((mod, index) => (
                                                <div key={index} className="grid grid-cols-12 gap-3 items-end p-4 bg-slate-50 rounded-xl border border-slate-200 relative group">
                                                    
                                                    {/* Botão Remover */}
                                                    <button
                                                        type="button"
                                                        onClick={() => removeModality(index)}
                                                        className="absolute -top-2 -right-2 p-1.5 bg-white border border-rose-200 text-rose-500 rounded-full shadow-sm hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity"
                                                        title="Remover exceção"
                                                    >
                                                        <X size={14} />
                                                    </button>

                                                    {/* Modalidade */}
                                                    <div className="col-span-12 lg:col-span-4 space-y-1.5">
                                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Modalidade</label>
                                                        <div className="relative">
                                                            <select
                                                                value={mod.operationType}
                                                                onChange={e => updateModality(index, 'operationType', e.target.value)}
                                                                required
                                                                className="appearance-none cursor-pointer w-full text-sm font-semibold text-slate-800 bg-white border border-slate-300 rounded-lg h-10 pl-3 pr-8 outline-none focus:border-indigo-500"
                                                            >
                                                                <option value="">Selecionar...</option>
                                                                {serviceTypes.map(st => (
                                                                    <option key={st.id} value={st.name}>{st.name}</option>
                                                                ))}
                                                            </select>
                                                            <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                        </div>
                                                    </div>

                                                    {/* Concluída */}
                                                    <div className="col-span-12 lg:col-span-4 p-3 bg-emerald-50/50 rounded-lg border border-emerald-100/50">
                                                        <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest mb-2">Concluída</div>
                                                        <div className="flex gap-2">
                                                            <div className="relative w-1/2">
                                                                <select
                                                                    value={mod.completedType}
                                                                    onChange={e => updateModality(index, 'completedType', e.target.value)}
                                                                    className="appearance-none cursor-pointer w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md h-8 pl-2 pr-6 outline-none focus:border-emerald-500"
                                                                >
                                                                    <option value="fixed">R$</option>
                                                                    <option value="percent">%</option>
                                                                </select>
                                                                <ChevronDown size={14} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                            </div>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={mod.completedValue}
                                                                onChange={e => updateModality(index, 'completedValue', Number(e.target.value) || '')}
                                                                required
                                                                placeholder="Valor"
                                                                className="w-1/2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md h-8 px-2 outline-none"
                                                            />
                                                        </div>
                                                    </div>

                                                    {/* Impedida */}
                                                    <div className="col-span-12 lg:col-span-4 p-3 bg-rose-50/50 rounded-lg border border-rose-100/50">
                                                        <div className="text-[10px] font-bold text-rose-700 uppercase tracking-widest mb-2">Impedida</div>
                                                        <div className="flex gap-2">
                                                            <div className="relative w-1/2">
                                                                <select
                                                                    value={mod.blockedType}
                                                                    onChange={e => updateModality(index, 'blockedType', e.target.value)}
                                                                    className="appearance-none cursor-pointer w-full text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md h-8 pl-2 pr-6 outline-none focus:border-rose-500"
                                                                >
                                                                    <option value="fixed">R$</option>
                                                                    <option value="percent">%</option>
                                                                </select>
                                                                <ChevronDown size={14} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                            </div>
                                                            <input
                                                                type="number"
                                                                step="0.01"
                                                                min="0"
                                                                value={mod.blockedValue}
                                                                onChange={e => updateModality(index, 'blockedValue', Number(e.target.value) || '')}
                                                                required
                                                                placeholder="Valor"
                                                                className="w-1/2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-md h-8 px-2 outline-none"
                                                            />
                                                        </div>
                                                    </div>

                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                )}
                            </form>
                        </div>
                        
                        <div className="p-4 sm:p-6 border-t border-slate-100 bg-white flex justify-end gap-3 mt-auto">
                            <button
                                type="button"
                                onClick={() => setIsModalOpen(false)}
                                className="px-5 py-2.5 text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                form="commission-form"
                                disabled={isSaving}
                                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-[#1c2d4f] hover:bg-[#2a4170] rounded-xl transition-colors shadow-md disabled:opacity-70 uppercase tracking-wide"
                            >
                                {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                {isSaving ? 'Salvando...' : 'Salvar Regra'}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}

            {selectedRuleIds.length > 0 && (
                <FloatingBatchBar
                    selectedCount={selectedRuleIds.length}
                    onExportExcel={handleExportExcel}
                    onPrintPdf={handlePrintPdf}
                    onClearSelection={() => setSelectedRuleIds([])}
                />
            )}
        </div>
    );
};
