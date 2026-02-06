
import React, { useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, OrderPriority, FormTemplate } from '../../../../types';
import {
    X,
    Navigation,
    Info,
    CheckCircle2,
    Play,
    AlertCircle,
    User,
    Ban
} from 'lucide-react';
import { ChecklistRenderer } from '../components/ChecklistRenderer';
import { SignatureCanvas } from '../components/ui/SignatureCanvas';
import { DataService } from '../../../../services/dataService';

interface OrderDetailsV2Props {
    order: ServiceOrder;
    onClose: () => void;
    onUpdateStatus: (status: OrderStatus, notes?: string, formData?: any) => Promise<void>;
}

export const OrderDetailsV2: React.FC<OrderDetailsV2Props> = ({ order, onClose, onUpdateStatus }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [activeSection, setActiveSection] = useState<'info' | 'checklist' | 'finish'>('info');

    // Checklist State
    const [template, setTemplate] = useState<FormTemplate | null>(null);
    const [answers, setAnswers] = useState<Record<string, any>>(order.formData || {});

    // Finish/Signature State
    const [signature, setSignature] = useState<string | null>(order.signature || null);
    const [signerName, setSignerName] = useState(order.signatureName || '');
    const [signerDoc, setSignerDoc] = useState(order.signatureDoc || '');

    // Block State
    const [showBlockModal, setShowBlockModal] = useState(false);
    const [blockReason, setBlockReason] = useState('');

    const handleBlockOrder = async () => {
        if (!blockReason.trim()) return;
        setIsLoading(true);
        try {
            await onUpdateStatus(OrderStatus.BLOCKED, `IMPEDIMENTO: ${blockReason}`, {
                impediment_reason: blockReason,
                impediment_at: new Date().toISOString()
            });
            onClose();
        } catch (e) {
            console.error(e);
            alert("Erro ao registrar impedimento.");
        } finally {
            setIsLoading(false);
            setShowBlockModal(false);
        }
    };

    // 🔄 Load Logic (Template)    // Load Template Checklist
    useEffect(() => {
        const loadTemplate = async () => {
            console.log('[OrderDetails] 🔄 Iniciando carga de checklist (v2.1 - Fallback Robust)...', { type: order.operationType, serial: order.equipmentSerial });
            setIsLoading(true);
            if (!template) {
                try {
                    console.log('[OrderDetails] 🔍 Carregando checklist para:', order.operationType);

                    // Busca regras, templates e equipamentos
                    const [rules, templates, equipments] = await Promise.all([
                        DataService.getActivationRules(),
                        DataService.getFormTemplates(),
                        DataService.getEquipments()
                    ]);

                    console.log('[OrderDetails] 📊 Dados:', { rules: rules.length, templates: templates.length, equipments: equipments.length });

                    // Identifica a família do equipamento
                    let equipmentFamily = '';
                    const equipment = equipments.find((e: any) =>
                        (order.equipmentSerial && e.serialNumber === order.equipmentSerial) ||
                        (order.equipmentName && e.model === order.equipmentName)
                    );

                    if (equipment) {
                        equipmentFamily = equipment.familyName;
                        console.log('[OrderDetails] 🎯 Equipamento encontrado:', equipment.model, 'Família:', equipmentFamily);
                    }

                    // Busca regra de ativação que combina serviceType + family
                    const matchingRule = rules.find((r: any) =>
                        r.serviceType === order.operationType &&
                        (!r.equipmentFamily || r.equipmentFamily === equipmentFamily)
                    );

                    if (matchingRule && matchingRule.formTemplateId) {
                        const foundTemplate = templates.find((t: any) => t.id === matchingRule.formTemplateId);
                        if (foundTemplate) {
                            console.log('[OrderDetails] ✅ Template encontrado via regra:', foundTemplate.name);
                            setTemplate(foundTemplate);
                            return;
                        }
                    }

                    // Fallback: Busca template por serviceType (Agora mais flexível e case-insensitive)
                    const fallbackTemplate = templates.find((t: any) =>
                        t.serviceTypes?.some((st: string) => st.toLowerCase() === (order.operationType || '').toLowerCase()) ||
                        t.title?.toLowerCase().includes((order.operationType || '').toLowerCase())
                    );

                    if (fallbackTemplate) {
                        console.log('[OrderDetails] ⚠️ Template encontrado via fallback inteligente:', fallbackTemplate.title);
                        setTemplate(fallbackTemplate);
                        return;
                    }

                    // 🚨 SUPER FALLBACK: Se tudo falhar, usa o Mock da lista ou cria um Genérico
                    let finalFallback = templates.find((t: any) => t.id.startsWith('mock-'));

                    if (!finalFallback) {
                        // Se nem o Mock veio do DataService (porque havia outros templates), CRIAMOS UM NA HORA.
                        // Isso garante que NUNCA ficaremos sem checklist.
                        console.warn('[OrderDetails] ⚠️ Criando Checklist Genérico (Ultimate Fallback).');
                        finalFallback = {
                            id: 'fallback-generic-v99',
                            title: `Checklist: ${order.operationType || 'Padrão'}`,
                            active: true,
                            serviceTypes: [],
                            fields: [
                                { id: 'gl_status', type: 'SELECT', label: 'Status do Equipamento', required: true, options: ['Funcionando', 'Parado', 'Com Defeito'] },
                                { id: 'gl_photo_1', type: 'PHOTO', label: 'Foto Inicial', required: true },
                                { id: 'gl_desc', type: 'LONG_TEXT', label: 'Relatório Técnico', required: true },
                                { id: 'gl_photo_2', type: 'PHOTO', label: 'Foto Final', required: false }
                            ]
                        };
                    }

                    if (finalFallback) {
                        console.log('[OrderDetails] ✅ Usando Checklist de Fallback.');
                        setTemplate(finalFallback);
                        return;
                    }

                    console.error('[OrderDetails] ❌ IMPOSSÍVEL CARREGAR CHECKLIST (Isso não deve acontecer).');
                } catch (e) {
                    console.error("[OrderDetails] ❌ Erro ao carregar checklist:", e);
                } finally {
                    setIsLoading(false);
                }
            } else {
                setIsLoading(false);
            }
        };
        loadTemplate();
    }, [order.operationType, order.equipmentSerial, order.equipmentName]);

    const handleAnswerChange = (fieldId: string, value: any) => {
        setAnswers(prev => ({ ...prev, [fieldId]: value }));
    };

    // 🚀 Auto-Switch to Checklist when Status changes to IN_PROGRESS
    useEffect(() => {
        if (order.status === OrderStatus.IN_PROGRESS && activeSection === 'info') {
            setActiveSection('checklist');
        }
    }, [order.status, activeSection]);

    const handleSaveChecklist = async () => {
        setIsLoading(true);
        try {
            // Salva parcialmente sem mudar status
            await onUpdateStatus(order.status, undefined, answers);
            alert("Checklist salvo com sucesso!");
        } catch (e) {
            alert("Erro ao salvar checklist.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleFinish = async () => {
        if (!signature || !signerName) {
            alert("Assinatura e Nome do Responsável são obrigatórios.");
            return;
        }

        setIsLoading(true);
        try {
            const finalData = {
                ...answers,
                signature,
                signatureName: signerName,
                signatureDoc: signerDoc,
                finishedAt: new Date().toISOString()
            };
            await onUpdateStatus(OrderStatus.COMPLETED, "Serviço finalizado via App Técnico V2", finalData);
            onClose();
        } catch (e) {
            console.error(e);
            alert("Erro ao finalizar OS.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-[#f8fafc] flex flex-col animate-in text-slate-900">
            {/* Header Premium Clean - Mais Compacto */}
            <div className="bg-white/90 backdrop-blur-md px-6 pt-6 pb-4 flex justify-between items-center sticky top-0 z-10 border-b border-indigo-100 shadow-sm">
                <button onClick={onClose} className="p-2 rounded-xl bg-slate-50 border border-slate-200 active:scale-95 transition-all text-slate-500 hover:text-indigo-600">
                    <X size={18} />
                </button>
                <div className="text-center">
                    <p className="text-[9px] font-black uppercase text-indigo-400 tracking-widest">Ordem de Serviço</p>
                    <h2 className="text-sm font-bold text-slate-900 tracking-tight">#{order.id.slice(0, 8)}</h2>
                </div>
                <div className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${order.priority === OrderPriority.CRITICAL || order.priority === OrderPriority.HIGH ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-600'}`}>
                    {order.priority}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 pb-48">
                {/* Status Hero Styled */}
                <div className="bg-white p-6 rounded-[2.5rem] flex items-center justify-between shadow-sm border border-slate-100">
                    <div>
                        <p className="text-[10px] font-black uppercase text-slate-400 mb-1">Status Atual</p>
                        <h3 className="text-xl font-black text-indigo-600">{order.status}</h3>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                        <Info size={24} />
                    </div>
                </div>

                {activeSection === 'info' && (
                    <div className="space-y-6 animate-in">
                        {/* Client Info */}
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Cliente & Local</h4>
                            <div className="bg-white p-6 rounded-[2rem] space-y-4 shadow-sm border border-slate-100">
                                <div>
                                    <p className="text-lg font-black text-slate-900">{order.customerName}</p>
                                    <p className="text-xs text-slate-500 mt-1">{order.customerAddress}</p>
                                </div>
                                <button className="w-full py-4 rounded-2xl bg-indigo-50 border border-indigo-100 flex items-center justify-center gap-3 text-indigo-600 font-bold text-sm active:scale-95 transition-all hover:bg-indigo-100">
                                    <Navigation size={18} />
                                    Abrir no Mapa
                                </button>
                            </div>
                        </div>

                        {/* Equipment Info */}
                        <div className="space-y-3">
                            <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest pl-2">Ativo / Equipamento</h4>
                            <div className="bg-white p-6 rounded-[2rem] space-y-3 shadow-sm border border-slate-100">
                                <div className="flex justify-between items-center border-b border-slate-50 pb-3">
                                    <p className="text-xs text-slate-400 font-bold uppercase">Modelo</p>
                                    <p className="text-sm font-bold text-slate-900">{order.equipmentName || 'Não especificado'}</p>
                                </div>
                                <div className="flex justify-between items-center pt-1">
                                    <p className="text-xs text-slate-400 font-bold uppercase">Série</p>
                                    <p className="text-sm font-bold text-slate-600">{order.equipmentSerial || '---'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
                            <p className="text-sm text-slate-600 leading-relaxed italic">
                                "{order.description || 'Nenhuma descrição detalhada fornecida.'}"
                            </p>
                        </div>
                    </div>
                )}

                {activeSection === 'checklist' && (
                    <div className="space-y-6 animate-in">
                        {template ? (
                            <>
                                <ChecklistRenderer
                                    fields={template.fields}
                                    answers={answers}
                                    onAnswerChange={handleAnswerChange}
                                />
                                <button
                                    onClick={handleSaveChecklist}
                                    disabled={isLoading}
                                    className="w-full py-4 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl font-bold uppercase text-xs tracking-widest active:scale-95 transition-all mb-4"
                                >
                                    {isLoading ? 'Salvando...' : 'Salvar Progresso'}
                                </button>
                            </>
                        ) : (
                            <div className="py-12 text-center bg-white rounded-[2rem] border-2 border-dashed border-slate-200">
                                <AlertCircle size={40} className="mx-auto text-indigo-300 mb-4" />
                                <p className="text-slate-400 text-sm font-bold">Carregando checklist...</p>
                            </div>
                        )}
                    </div>
                )}

                {activeSection === 'parts' && (
                    <div className="space-y-6 animate-in">
                        <div className="bg-white p-8 rounded-[2rem] text-center shadow-sm border border-slate-100">
                            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <Ban size={32} />
                            </div>
                            <h3 className="text-lg font-black text-slate-900 mb-2">Solicitação de Peças</h3>
                            <p className="text-sm text-slate-500 mb-6">Esta funcionalidade permite requisitar itens do seu estoque ou almoxarifado para esta O.S.</p>
                            <button className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-xs shadow-lg shadow-indigo-200">
                                Adicionar Peça +
                            </button>
                        </div>
                    </div>
                )}

                {activeSection === 'finish' && (
                    <div className="space-y-6 animate-in">
                        {/* Informações de Quem Assinou */}
                        {order.signature && order.status === OrderStatus.COMPLETED && (
                            <div className="bg-white p-6 rounded-[2rem] border border-emerald-100 space-y-4 shadow-sm">
                                <h4 className="text-[10px] font-black uppercase text-emerald-600 tracking-widest">Assinado por</h4>
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                        <User size={24} />
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-slate-900">{order.signatureName}</p>
                                        <p className="text-xs text-slate-400">{order.signatureDoc || 'Sem documento'}</p>
                                    </div>
                                </div>
                                <div className="aspect-[3/1] bg-slate-50 rounded-2xl overflow-hidden border border-slate-100">
                                    <img src={order.signature} alt="Assinatura" className="w-full h-full object-contain mix-blend-multiply" />
                                </div>
                            </div>
                        )}

                        {order.status !== OrderStatus.COMPLETED && (
                            <>
                                <div className="space-y-4">
                                    <div className="bg-white p-6 rounded-[2.5rem] space-y-6 shadow-sm border border-slate-100">
                                        <h4 className="text-[10px] font-black uppercase text-indigo-400 tracking-widest text-center">Validação do Cliente</h4>

                                        <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                            <User size={18} className="text-indigo-300" />
                                            <input
                                                type="text"
                                                placeholder="Nome do Responsável"
                                                value={signerName}
                                                onChange={e => setSignerName(e.target.value)}
                                                className="bg-transparent w-full text-sm text-slate-900 outline-none placeholder:text-slate-400 font-bold"
                                            />
                                        </div>

                                        {/* Assinatura */}
                                        <div className="space-y-2">
                                            <SignatureCanvas
                                                onEnd={setSignature}
                                                onClear={() => setSignature(null)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* FIXED BOTTOM: TABS + ACTIONS */}
            <div className="fixed bottom-0 left-0 right-0 bg-[#0f172a] rounded-t-[2rem] shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.3)] z-[200] pb-6 pt-2">
                {/* Main Action Button (Floating on top of nav) */}
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 w-full px-6 flex justify-center gap-3">
                    {order.status === OrderStatus.PENDING || order.status === OrderStatus.ASSIGNED ? (
                        <>
                            <button
                                onClick={() => setShowBlockModal(true)}
                                disabled={isLoading}
                                className="w-12 h-12 bg-red-100 rounded-2xl text-red-500 border border-red-200 shadow-lg shadow-red-500/10 active:scale-95 transition-all flex items-center justify-center hover:bg-red-200"
                                title="Impedir Atendimento"
                            >
                                <Ban size={20} />
                            </button>

                            <button
                                onClick={async () => {
                                    setIsLoading(true);
                                    try {
                                        // 1. Update Server & Context
                                        await onUpdateStatus(OrderStatus.IN_PROGRESS);
                                        // 2. Force UI Switch (Redundant but Safe)
                                        setActiveSection('checklist');
                                    } catch (err) {
                                        console.error(err);
                                        alert("Erro ao iniciar execução. Verifique sua conexão.");
                                    } finally {
                                        setIsLoading(false);
                                    }
                                }}
                                disabled={isLoading}
                                className="flex-1 max-w-xs py-4 bg-indigo-600 rounded-2xl text-white font-black uppercase text-sm tracking-widest shadow-xl shadow-indigo-600/30 active:scale-95 transition-all flex items-center justify-center gap-2 hover:bg-indigo-500"
                            >
                                {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white rounded-full border-t-transparent" /> : <Play size={18} fill="currentColor" />}
                                INICIAR AGORA 🚀
                            </button>
                        </>
                    ) : order.status === OrderStatus.IN_PROGRESS && activeSection === 'finish' ? (
                        <button
                            onClick={handleFinish}
                            disabled={isLoading || !signature || !signerName}
                            className={`w-full max-w-sm py-4 rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${signature && signerName
                                ? 'bg-emerald-500 text-white shadow-emerald-500/20 hover:bg-emerald-400'
                                : 'bg-slate-700 text-slate-500 cursor-not-allowed'
                                }`}
                        >
                            {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white rounded-full border-t-transparent" /> : <CheckCircle2 size={18} />}
                            Finalizar Ordem
                        </button>
                    ) : null}
                </div>

                {/* MODAL IMPEDIMENTO */}
                {showBlockModal && (
                    <div className="fixed inset-0 z-[300] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in zoom-in duration-200">
                        <div className="bg-white rounded-[2rem] p-8 w-full max-w-sm shadow-2xl space-y-6">
                            <div className="text-center space-y-2">
                                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto text-red-500 mb-4">
                                    <Ban size={28} />
                                </div>
                                <h3 className="text-xl font-black text-slate-900 uppercase italic">Impedir Atendimento</h3>
                                <p className="text-xs text-slate-500 font-medium">Descreva o motivo pelo qual este atendimento não pode ser realizado.</p>
                            </div>

                            <textarea
                                className="w-full h-32 bg-slate-50 border border-slate-200 rounded-xl p-4 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-red-100 resize-none"
                                placeholder="Ex: Cliente ausente, chuva forte, falta de material..."
                                value={blockReason}
                                onChange={e => setBlockReason(e.target.value)}
                                autoFocus
                            />

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => { setShowBlockModal(false); setBlockReason(''); }}
                                    className="py-3 rounded-xl border border-slate-200 text-slate-500 font-black uppercase text-xs hover:bg-slate-50"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleBlockOrder}
                                    disabled={!blockReason.trim() || isLoading}
                                    className="py-3 rounded-xl bg-red-500 text-white font-black uppercase text-xs shadow-lg shadow-red-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:active:scale-100"
                                >
                                    {isLoading ? 'Processando...' : 'Confirmar'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB BAR NAVIGATION */}
                <div className="flex justify-between items-end px-6 pt-8 pb-2">
                    <button onClick={() => setActiveSection('info')} className={`flex flex-col items-center gap-1 transition-all ${activeSection === 'info' ? 'text-white' : 'text-slate-500'}`}>
                        <Info size={24} className={activeSection === 'info' ? 'text-indigo-400' : ''} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Detalhes</span>
                    </button>

                    <button onClick={() => setActiveSection('parts')} className={`flex flex-col items-center gap-1 transition-all ${activeSection === 'parts' ? 'text-white' : 'text-slate-500'}`}>
                        <Ban size={24} className={activeSection === 'parts' ? 'text-indigo-400' : ''} /> {/* Using Ban/Box as placeholder for Parts */}
                        <span className="text-[9px] font-black uppercase tracking-widest">Peças</span>
                    </button>

                    <div className="w-12"></div> {/* Spacing for Action Button */}

                    <button
                        onClick={() => order.status !== OrderStatus.PENDING && order.status !== OrderStatus.ASSIGNED && setActiveSection('checklist')}
                        disabled={order.status === OrderStatus.PENDING || order.status === OrderStatus.ASSIGNED}
                        className={`flex flex-col items-center gap-1 transition-all ${activeSection === 'checklist' ? 'text-white' : 'text-slate-500'} ${order.status === OrderStatus.PENDING ? 'opacity-30' : ''}`}
                    >
                        <CheckCircle2 size={24} className={activeSection === 'checklist' ? 'text-indigo-400' : ''} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Checklist</span>
                    </button>

                    <button onClick={() => setActiveSection('finish')} className={`flex flex-col items-center gap-1 transition-all ${activeSection === 'finish' ? 'text-white' : 'text-slate-500'}`}>
                        <User size={24} className={activeSection === 'finish' ? 'text-indigo-400' : ''} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Assinar</span>
                    </button>
                </div>
            </div>
        </div>
    );
};
