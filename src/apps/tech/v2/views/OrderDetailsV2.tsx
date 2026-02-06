
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

    // 🔄 Load Logic (Template) - Usando Activation Rules
    useEffect(() => {
        const loadTemplate = async () => {
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
                }
            }
        };
        loadTemplate();
    }, [order.operationType, order.equipmentSerial, order.equipmentName]);

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
                        Finalizar
                    </button>
                </div>

                {activeSection === 'info' && (
                    <div className="space-y-6 animate-in">
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
                                    disabled={isLoading}
                                    className="w-full py-4 bg-white/5 border border-emerald-500/30 text-emerald-400 rounded-2xl font-bold uppercase text-xs tracking-widest active:scale-95 transition-all"
                                >
                                    {isLoading ? 'Salvando...' : 'Salvar Progresso'}
                                </button>
                            </>
                        ) : (
                            <div className="py-12 text-center glass rounded-[32px] border-dashed border-white/10">
                                <AlertCircle size={40} className="mx-auto text-slate-700 mb-4" />
                                <p className="text-slate-500 text-sm font-bold">Carregando checklist...</p>
                                <p className="text-xs text-slate-600 mt-2">Verifique o console para debug</p>
                            </div>
                        )}
                    </div>
                )}

                {activeSection === 'finish' && (
                    <div className="space-y-6 animate-in">
                        {/* Informações de Quem Assinou */}
                        {order.signature && order.status === OrderStatus.COMPLETED && (
                            <div className="glass-emerald p-6 rounded-[32px] border-2 border-emerald-500/20 space-y-4">
                                <h4 className="text-[10px] font-black uppercase text-emerald-500 tracking-widest">Assinado por</h4>
                                <div className="flex items-center gap-4">
                                    <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-500">
                                        <User size={24} />
                                    </div>
                                    <div>
                                        <p className="text-lg font-black text-white">{order.signatureName}</p>
                                        <p className="text-xs text-slate-400">{order.signatureDoc || 'Sem documento'}</p>
                                    </div>
                                </div>
                                <div className="aspect-[3/1] bg-black/20 rounded-2xl overflow-hidden border border-white/10">
                                    <img src={order.signature} alt="Assinatura" className="w-full h-full object-contain" />
                                </div>
                            </div>
                        )}

                        {order.status !== OrderStatus.COMPLETED && (
                            <>
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

                                {order.status !== OrderStatus.IN_PROGRESS && (
                                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 text-xs text-center font-bold">
                                        Inicie o atendimento para habilitar a finalização.
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* Bottom Actions Premium - Z-INDEX ALTO para ficar acima da tab-bar */}
            <div className="glass px-6 pt-4 pb-8 fixed bottom-0 left-0 right-0 z-[200] flex gap-3">
                {order.status === OrderStatus.PENDING || order.status === OrderStatus.ASSIGNED ? (
                    <button
                        onClick={async () => {
                            setIsLoading(true);
                            await onUpdateStatus(OrderStatus.IN_PROGRESS);
                            setIsLoading(false);
                        }}
                        disabled={isLoading}
                        className="flex-[2] py-4 bg-emerald-500 rounded-2xl text-white font-black uppercase text-sm tracking-widest shadow-xl shadow-emerald-500/20 active:scale-95 transition-all flex items-center justify-center gap-2"
                    >
                        {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white rounded-full border-t-transparent" /> : <Play size={18} fill="currentColor" />}
                        Iniciar Atendimento
                    </button>
                ) : order.status === OrderStatus.IN_PROGRESS ? (
                    <button
                        onClick={handleFinish}
                        disabled={isLoading || !signature || !signerName}
                        className={`flex-[2] py-4 rounded-2xl font-black uppercase text-sm tracking-widest shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2 ${signature && signerName
                            ? 'bg-emerald-500 text-white shadow-emerald-500/20'
                            : 'bg-slate-800 text-slate-600 cursor-not-allowed'
                            }`}
                    >
                        {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white rounded-full border-t-transparent" /> : <CheckCircle2 size={18} />}
                        Finalizar Ordem
                    </button>
                ) : (
                    <button
                        disabled
                        className="flex-[2] py-4 bg-slate-800 rounded-2xl text-slate-500 font-black uppercase text-sm tracking-widest opacity-50 flex items-center justify-center gap-2"
                    >
                        <CheckCircle2 size={18} />
                        Serviço Finalizado
                    </button>
                )}

                <button
                    onClick={async () => {
                        if (confirm('Deseja realmente impedir esta OS?')) {
                            setIsLoading(true);
                            await onUpdateStatus(OrderStatus.BLOCKED, 'Impedimento registrado pelo técnico via App V2');
                            setIsLoading(false);
                            onClose();
                        }
                    }}
                    disabled={order.status === OrderStatus.COMPLETED || order.status === OrderStatus.BLOCKED}
                    className="flex-1 py-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400 font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all flex items-center justify-center gap-2 disabled:opacity-30"
                >
                    <Ban size={16} />
                    Impedir
                </button>
            </div>
        </div>
    );
};
