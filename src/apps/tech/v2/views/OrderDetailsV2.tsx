
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

    // 🔄 Load Logic (Template)
    useEffect(() => {
        const loadTemplate = async () => {
            if (activeSection === 'checklist' && !template) {
                try {
                    // 1. Tenta carregar regra de ativação baseada no Tipo de Serviço e Família (se houver)
                    // Simplificação V2: Tenta buscar template padrão ou específico
                    const templates = await DataService.getFormTemplates();
                    // Lógica simples: Pega o primeiro que der match ou um padrão.
                    // Idealmente: DataService.getRelevantTemplate(order)
                    // Vou usar uma heurística simples: buscar por nome do serviço
                    const match = templates.find(t => t.serviceTypes.includes(order.operationType || ''));
                    if (match) {
                        setTemplate(match);
                    } else if (templates.length > 0) {
                        setTemplate(templates[0]); // Fallback para o primeiro disponível
                    }
                } catch (e) {
                    console.error("Erro ao carregar checklist:", e);
                }
            }
        };
        loadTemplate();
    }, [activeSection, order.operationType]);

    const handleAnswerChange = (fieldId: string, value: any) => {
        setAnswers(prev => ({ ...prev, [fieldId]: value }));
    };

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
        <div className="fixed inset-0 z-[100] bg-[#05070a] flex flex-col animate-in">
            {/* Header Premium */}
            <div className="glass px-6 pt-12 pb-6 flex justify-between items-center sticky top-0 z-10">
                <button onClick={onClose} className="p-2 rounded-2xl bg-white/5 border border-white/10 active:scale-90 transition-all">
                    <X size={20} className="text-slate-400" />
                </button>
                <div className="text-center">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Ordem de Serviço</p>
                    <h2 className="text-sm font-bold text-white tracking-tight">#{order.id.slice(0, 8)}</h2>
                </div>
                <div className={`status-pill ${order.priority === OrderPriority.CRITICAL || order.priority === OrderPriority.HIGH ? 'bg-red-500/20 text-red-400' : 'bg-emerald-500/20 text-emerald-400'}`}>
                    {order.priority}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 pb-40">
                {/* Status Hero */}
                <div className="glass-emerald p-6 rounded-[32px] flex items-center justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase text-emerald-500/60 mb-1">Status Atual</p>
                        <h3 className="text-xl font-black text-white">{order.status}</h3>
                    </div>
                    <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                        <Info size={24} />
                    </div>
                </div>

                {/* Section Selector */}
                <div className="flex gap-2 p-1.5 glass rounded-2xl">
                    <button
                        onClick={() => setActiveSection('info')}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${activeSection === 'info' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}
                    >
                        Info
                    </button>
                    <button
                        onClick={() => setActiveSection('checklist')}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${activeSection === 'checklist' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}
                    >
                        Checklist
                    </button>
                    <button
                        onClick={() => setActiveSection('finish')}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${activeSection === 'finish' ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-500'}`}
                    >
                        Assinatura
                    </button>
                </div>

                {activeSection === 'info' && (
                    <div className="space-y-6 animate-in">
                        {/* Start Button Contextual */}
                        {(order.status === OrderStatus.PENDING || order.status === OrderStatus.ASSIGNED) && (
                            <button
                                onClick={async () => {
                                    setIsLoading(true);
                                    await onUpdateStatus(OrderStatus.IN_PROGRESS);
                                    setIsLoading(false);
                                }}
                                disabled={isLoading}
                                className="w-full py-5 bg-emerald-500 rounded-[24px] text-white font-black uppercase text-sm tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                            >
                                {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white rounded-full border-t-transparent" /> : <Play size={20} fill="currentColor" />}
                                Iniciar Atendimento
                            </button>
                        )}

                        {/* Client Info */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest pl-1">Cliente & Local</h4>
                            <div className="glass p-6 rounded-[32px] space-y-4">
                                <div>
                                    <p className="text-lg font-black text-white">{order.customerName}</p>
                                    <p className="text-xs text-slate-400 mt-1">{order.customerAddress}</p>
                                </div>
                                <button className="w-full py-4 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center gap-3 text-emerald-400 font-bold text-sm active:scale-95 transition-all">
                                    <Navigation size={18} />
                                    Abrir no Mapa
                                </button>
                            </div>
                        </div>

                        {/* Equipment Info */}
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest pl-1">Ativo / Equipamento</h4>
                            <div className="glass p-6 rounded-[32px] space-y-2">
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-slate-500 font-bold uppercase">Modelo</p>
                                    <p className="text-sm font-bold text-white">{order.equipmentName || 'Não especificado'}</p>
                                </div>
                                <div className="flex justify-between items-center">
                                    <p className="text-xs text-slate-500 font-bold uppercase">Série</p>
                                    <p className="text-sm font-bold text-slate-300">{order.equipmentSerial || '---'}</p>
                                </div>
                            </div>
                        </div>

                        {/* Description */}
                        <div className="glass p-6 rounded-[32px]">
                            <p className="text-sm text-slate-300 leading-relaxed italic">
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
                                    className="w-full py-4 bg-white/5 border border-emerald-500/30 text-emerald-400 rounded-2xl font-bold uppercase text-xs tracking-widest"
                                >
                                    Salvar Progresso
                                </button>
                            </>
                        ) : (
                            <div className="py-12 text-center glass rounded-[32px] border-dashed border-white/10">
                                <AlertCircle size={40} className="mx-auto text-slate-700 mb-4" />
                                <p className="text-slate-500 text-sm font-bold">Nenhum checklist vinculado.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeSection === 'finish' && (
                    <div className="space-y-6 animate-in">
                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest pl-1">Responsável pelo Recebimento</h4>

                            <div className="glass p-4 rounded-3xl space-y-4">
                                <div className="flex items-center gap-3 bg-black/20 p-3 rounded-2xl border border-white/5">
                                    <User size={18} className="text-slate-500" />
                                    <input
                                        type="text"
                                        placeholder="Nome Completo"
                                        value={signerName}
                                        onChange={e => setSignerName(e.target.value)}
                                        className="bg-transparent w-full text-sm text-white outline-none placeholder:text-slate-600"
                                    />
                                </div>
                                <div className="flex items-center gap-3 bg-black/20 p-3 rounded-2xl border border-white/5">
                                    <span className="text-slate-500 text-xs font-bold w-[18px] text-center">ID</span>
                                    <input
                                        type="text"
                                        placeholder="CPF / Documento (Opcional)"
                                        value={signerDoc}
                                        onChange={e => setSignerDoc(e.target.value)}
                                        className="bg-transparent w-full text-sm text-white outline-none placeholder:text-slate-600"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h4 className="text-[10px] font-black uppercase text-slate-500 tracking-widest pl-1">Assinatura Digital</h4>
                            <SignatureCanvas
                                onEnd={setSignature}
                                onClear={() => setSignature(null)}
                            />
                        </div>

                        {order.status === OrderStatus.IN_PROGRESS && (
                            <button
                                onClick={handleFinish}
                                disabled={isLoading || !signature || !signerName}
                                className={`w-full py-5 rounded-[24px] font-black uppercase text-sm tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${signature && signerName
                                        ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                                        : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                                    }`}
                            >
                                {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white rounded-full border-t-transparent" /> : <CheckCircle2 size={20} />}
                                Finalizar Ordem
                            </button>
                        )}

                        {order.status !== OrderStatus.IN_PROGRESS && (
                            <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs text-center font-bold">
                                Inicie o atendimento para habilitar a finalização.
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
