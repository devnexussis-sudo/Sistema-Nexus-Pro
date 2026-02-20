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
    Ban,
    MapPin,
    Calendar,
    ChevronDown,
    Camera,
    FileText,
    ArrowLeft
} from 'lucide-react';
import { ChecklistRenderer } from '../components/ChecklistRenderer';
import { SignatureCanvas } from '../components/ui/SignatureCanvas';
import { DataService } from '../../../../services/dataService';
import { OrderService } from '../../../../services/orderService';
import { getStatusBadge, getStatusLabel } from '../../../../lib/statusColors';
import { GeoService } from '../../../../lib/geo'; // 📍 Geolocalização
import { OrderTimeline } from '../../../../components/shared/OrderTimeline';

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

    // 📍 FLUXO DE ATENDIMENTO
    const handleFlowAction = async (action: 'START_TRAVEL' | 'ARRIVE' | 'START_SERVICE' | 'PAUSE' | 'RESUME' | 'FINISH') => {
        setIsLoading(true);
        try {
            const now = new Date().toISOString();
            let newStatus = order.status;
            let updates: any = {};
            let timeline = { ...(order.timeline || {}) };

            // 1. Captura Geolocalização (se necessário)
            let location = null;
            if (['START_TRAVEL', 'ARRIVE', 'FINISH'].includes(action)) {
                try {
                    location = await GeoService.getCurrentPosition();
                } catch (e) {
                    console.warn("⚠️ Sem GPS:", e);
                    // Continua mesmo sem GPS (apenas loga warning)
                }
            }

            switch (action) {
                case 'START_TRAVEL':
                    newStatus = OrderStatus.TRAVELING;
                    timeline.travelStartAt = now;
                    updates.checkinLocation = location; // Salva local de partida
                    break;

                case 'ARRIVE':
                    newStatus = OrderStatus.ARRIVED;
                    timeline.arrivedAt = now;
                    updates.checkinLocation = location; // Salva local de chegada (overwrite ou secundário?)
                    // Nota: Geralmente checkin é chegada. Vamos considerar ARRIVE como o Check-in oficial.
                    break;

                case 'START_SERVICE':
                    newStatus = OrderStatus.IN_PROGRESS;
                    timeline.serviceStartAt = now;
                    setActiveSection('checklist');
                    break;

                case 'PAUSE':
                    newStatus = OrderStatus.PAUSED;
                    timeline.pausedAt = now;
                    updates.pauseReason = blockReason || 'Pausa solicitada pelo técnico';
                    // Atualiza visitas pendentes/em andamento antes de onUpdateStatus
                    if (order.assignedTo) {
                        try {
                            await OrderService.pauseActiveVisit(order.id, order.assignedTo, updates.pauseReason);
                        } catch (err) {
                            console.warn("Nenhuma visita anterior atualizada (Migration), ou outro erro:", err);
                        }
                    }
                    break;

                case 'RESUME':
                    newStatus = OrderStatus.IN_PROGRESS;
                    timeline.resumedAt = now;
                    // Calcula tempo pausado se necessário (complexo, ignorar por agora)
                    break;
            }

            // Merge timeline
            updates.timeline = timeline;

            // Envia atualização
            await onUpdateStatus(newStatus, undefined, updates);

        } catch (e) {
            console.error(e);
            alert("Erro ao atualizar status. Tente novamente.");
        } finally {
            setIsLoading(false);
            setShowBlockModal(false); // Fecha modal se estiver aberto (caso de pausa com motivo)
        }
    };


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

    // 🔄 Load Logic (Template)
    useEffect(() => {
        const loadTemplate = async () => {
            console.log('[OrderDetails] 🔄 Loading checklist...', { type: order.operationType });
            setIsLoading(true);
            if (!template) {
                try {
                    const [rules, templates, equipments] = await Promise.all([
                        DataService.getActivationRules(),
                        DataService.getFormTemplates(),
                        DataService.getEquipments()
                    ]);

                    let equipmentFamily = '';
                    const equipment = equipments.find((e: any) =>
                        (order.equipmentSerial && e.serialNumber === order.equipmentSerial) ||
                        (order.equipmentName && e.model === order.equipmentName)
                    );

                    if (equipment) equipmentFamily = equipment.familyName;

                    const matchingRule = rules.find((r: any) =>
                        r.serviceType === order.operationType &&
                        (!r.equipmentFamily || r.equipmentFamily === equipmentFamily)
                    );

                    if (matchingRule && matchingRule.formTemplateId) {
                        const foundTemplate = templates.find((t: any) => t.id === matchingRule.formTemplateId);
                        if (foundTemplate) {
                            setTemplate(foundTemplate);
                            return;
                        }
                    }

                    const fallbackTemplate = templates.find((t: any) =>
                        t.serviceTypes?.some((st: string) => st.toLowerCase() === (order.operationType || '').toLowerCase()) ||
                        t.title?.toLowerCase().includes((order.operationType || '').toLowerCase())
                    );

                    if (fallbackTemplate) {
                        setTemplate(fallbackTemplate);
                        return;
                    }

                    let finalFallback = templates.find((t: any) => t.id.startsWith('mock-'));
                    if (!finalFallback) {
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
                    setTemplate(finalFallback);

                } catch (e) {
                    console.error("[OrderDetails] Error loading checklist:", e);
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

    // 🚀 Auto-Switch to Checklist
    useEffect(() => {
        if (order.status === OrderStatus.IN_PROGRESS && activeSection === 'info') {
            setActiveSection('checklist');
        }
    }, [order.status]);

    // Pausa com Motivo
    const handlePauseOrder = async () => {
        if (!blockReason.trim()) return;
        await handleFlowAction('PAUSE');
    };

    const handleSaveChecklist = async () => {
        setIsLoading(true);
        try {
            await onUpdateStatus(order.status, undefined, answers);
            // Feedback visual sutil seria ideal aqui
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





    // Helper p/ renderizar botões de ação do fluxo
    const renderActionButtons = () => {
        const s = order.status;

        // 1. Iniciar Deslocamento (Pending/Assigned)
        if (s === OrderStatus.PENDING || s === OrderStatus.ASSIGNED) {
            return (
                <button
                    onClick={() => handleFlowAction('START_TRAVEL')}
                    className="w-full h-14 bg-indigo-600 text-white rounded-lg font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                >
                    {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <MapPin size={20} />}
                    Iniciar Deslocamento
                </button>
            );
        }

        // 2. Reportar Chegada (Traveling)
        if (s === OrderStatus.TRAVELING) {
            return (
                <button
                    onClick={() => handleFlowAction('ARRIVE')}
                    className="w-full h-14 bg-purple-600 text-white rounded-lg font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-purple-700 shadow-lg shadow-purple-200"
                >
                    {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <MapPin size={20} />}
                    <div className="flex flex-col items-start leading-none gap-1">
                        <span>Cheguei no Local</span>
                        <span className="text-[9px] font-medium opacity-70 normal-case tracking-normal">Registrar Check-in</span>
                    </div>
                </button>
            );
        }

        // 3. Iniciar Serviço (Arrived)
        if (s === OrderStatus.ARRIVED) {
            return (
                <button
                    onClick={() => handleFlowAction('START_SERVICE')}
                    className="w-full h-14 bg-primary-600 text-white rounded-lg font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-primary-700 shadow-lg shadow-primary-200 ml-0"
                >
                    {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Play size={20} fill="currentColor" />}
                    Iniciar Execução
                </button>
            );
        }

        // 4. Em Andamento (Pausar ou Finalizar)
        if (s === OrderStatus.IN_PROGRESS) {
            if (activeSection === 'info') {
                return (
                    <div className="flex gap-2 w-full">
                        <button
                            onClick={() => { setBlockReason(''); setShowBlockModal(true); }}
                            className="w-16 h-14 bg-orange-50 text-orange-600 border border-orange-200 rounded-lg flex flex-col items-center justify-center gap-1 active:scale-95 transition-all"
                        >
                            <span className="font-black text-[18px]">||</span>
                            <span className="text-[8px] font-bold uppercase">Pausar</span>
                        </button>
                        <button
                            onClick={() => setActiveSection('checklist')}
                            className="flex-1 h-14 bg-primary-500 text-white rounded-lg font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-primary-200"
                        >
                            Ir para Checklist <ChevronDown className="rotate-[-90deg]" size={18} />
                        </button>
                    </div>
                );
            }
            if (activeSection === 'checklist') {
                return (
                    <button
                        onClick={() => setActiveSection('finish')}
                        className="w-full h-14 bg-slate-900 text-white rounded-lg font-black uppercase text-xs tracking-widest shadow-none flex items-center justify-center gap-2 active:scale-95 transition-all"
                    >
                        Ir para Finalização <ChevronDown className="rotate-[-90deg]" size={18} />
                    </button>
                );
            }
            // Finalizar
            return (
                <button
                    onClick={handleFinish}
                    disabled={isLoading || !signature || !signerName}
                    className={`w-full h-14 rounded-lg font-black uppercase text-xs tracking-widest shadow-lg flex items-center justify-center gap-3 active:scale-95 transition-all ${signature && signerName ? 'bg-success-600 text-white hover:bg-success-500 shadow-success-200' : 'bg-slate-200 text-slate-400 cursor-not-allowed shadow-none'}`}
                >
                    {isLoading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <CheckCircle2 size={20} />}
                    Finalizar Atendimento
                </button>
            );
        }

        // 5. Pausado (Retomar)
        if (s === OrderStatus.PAUSED) {
            return (
                <button
                    onClick={() => handleFlowAction('RESUME')}
                    className="w-full h-14 bg-orange-500 text-white rounded-lg font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-orange-600 shadow-lg shadow-orange-200"
                >
                    {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Play size={20} fill="currentColor" />}
                    Retomar Serviço
                </button>
            );
        }

        return (
            <button
                onClick={onClose}
                className="w-full h-14 bg-slate-100 text-slate-600 rounded-lg font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all hover:bg-slate-200"
            >
                Fechar Detalhes
            </button>
        );
    };

    return (
        <div className="fixed inset-0 z-[100] bg-slate-50 flex flex-col animate-in slide-in-from-bottom-4 duration-300 font-sans text-slate-900">
            {/* Header Clean */}
            <div className="bg-white px-4 py-3 flex justify-between items-center sticky top-0 z-20 shadow-sm border-b border-slate-200">
                <button
                    onClick={onClose}
                    className="p-2 -ml-2 rounded-full active:bg-slate-100 transition-colors text-slate-500 hover:text-slate-800"
                >
                    <ArrowLeft size={22} />
                </button>

                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-0.5">Ordem de Serviço</span>
                    <h2 className="text-sm font-bold text-slate-900 leading-none">#{order.id.slice(0, 8)}</h2>
                </div>

                <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide border ${getStatusBadge(order.status)}`}>
                    {getStatusLabel(order.status)}
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto bg-slate-50 relative pb-40">
                {/* Tabs Stick - Abaixo do Header */}
                <div className="flex px-2 pt-2 pb-0 bg-slate-50 sticky top-0 z-10 gap-2 overflow-x-auto scrollbar-hide">
                    <button
                        onClick={() => setActiveSection('info')}
                        className={`flex-1 py-2.5 rounded-t-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeSection === 'info' ? 'bg-white text-primary-500 shadow-none border-t border-x border-slate-200 relative z-10 translate-y-px pb-3' : 'bg-slate-100 text-slate-400 border border-transparent'}`}
                    >
                        Detalhes
                    </button>
                    <button
                        onClick={() => order.status !== OrderStatus.PENDING && setActiveSection('checklist')}
                        disabled={order.status === OrderStatus.PENDING}
                        className={`flex-1 py-2.5 rounded-t-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeSection === 'checklist' ? 'bg-white text-primary-500 shadow-none border-t border-x border-slate-200 relative z-10 translate-y-px pb-3' : 'bg-slate-100 text-slate-400 border border-transparent'} ${order.status === OrderStatus.PENDING ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                        Checklist
                    </button>
                    <button
                        onClick={() => setActiveSection('finish')}
                        className={`flex-1 py-2.5 rounded-t-lg text-[10px] font-black uppercase tracking-widest transition-all ${activeSection === 'finish' ? 'bg-white text-primary-500 shadow-none border-t border-x border-slate-200 relative z-10 translate-y-px pb-3' : 'bg-slate-100 text-slate-400 border border-transparent'}`}
                    >
                        Finalizar
                    </button>
                </div>

                {/* Content Wrapper com fundo branco para simular tab content unificado */}
                <div className="bg-white min-h-full rounded-t-none border-t border-slate-200 shadow-sm px-5 py-6 space-y-6">

                    {/* Hero Info (Sempre visível no topo da tab Info, ou adaptado nas outras) */}
                    {activeSection === 'info' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
                            {/* Cliente Card */}
                            <div className="flex items-start justify-between">
                                <div>
                                    <h1 className="text-xl font-bold text-slate-900 leading-tight mb-2">{order.customerName}</h1>
                                    <div className="flex items-start gap-2 text-slate-500">
                                        <MapPin size={16} className="text-primary-500 shrink-0 mt-0.5" />
                                        <p className="text-sm font-medium leading-snug">{order.customerAddress || 'Endereço não informado'}</p>
                                    </div>
                                </div>
                                <button
                                    onClick={() => order.customerAddress && window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.customerAddress)}`, '_blank')}
                                    className="w-12 h-12 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center text-primary-600 active:scale-95 transition-transform"
                                >
                                    <Navigation size={22} />
                                </button>
                            </div>

                            <hr className="border-slate-100" />

                            {/* Informações Técnicas Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Agendamento</span>
                                    <div className="flex items-center gap-2 text-slate-800">
                                        <Calendar size={16} className="text-primary-500" />
                                        <span className="text-sm font-bold">
                                            {new Date(order.scheduledDate || order.createdAt).toLocaleDateString()}
                                        </span>
                                    </div>
                                </div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Horário</span>
                                    <div className="flex items-center gap-2 text-slate-800">
                                        <div className="w-4 h-4 rounded-full border-2 border-slate-300 flex items-center justify-center">
                                            <div className="w-2 h-0.5 bg-slate-300 transform rotate-45"></div>
                                        </div>
                                        <span className="text-sm font-bold">
                                            {new Date(order.scheduledDate || order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 space-y-4">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Equipamento</span>
                                    <div className="flex items-start gap-2 text-slate-800">
                                        <Info size={16} className="text-primary-500 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="text-sm font-bold leading-tight">{order.equipmentName || 'Não identificado'}</p>
                                            <p className="text-xs text-slate-400 font-medium mt-0.5">S/N: {order.equipmentSerial || '---'}</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="w-full h-px bg-slate-200"></div>
                                <div className="space-y-1">
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Descrição do Problema</span>
                                    <p className="text-sm text-slate-600 font-medium leading-relaxed">
                                        "{order.description || 'Sem descrição detalhada fornecida pelo solicitante.'}"
                                    </p>
                                </div>
                                <div className="w-full h-px bg-slate-200"></div>

                                {/* SECTION: Histórico / Visitas (Encapsulamento de Protocolo) */}
                                <div className="space-y-4 pt-4 border-t border-slate-100">
                                    <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest flex items-center gap-2">
                                        <Clock size={16} className="text-primary-500" /> Histórico do Protocolo
                                    </h3>
                                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                                        <OrderTimeline orderId={order.id} />
                                    </div>
                                </div>

                            </div>
                        </div>
                    )}

                    {/* SECTION: CHECKLIST */}
                    {activeSection === 'checklist' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
                            {template ? (
                                <>
                                    {order.status !== OrderStatus.COMPLETED && (
                                        <div className="bg-primary-50 rounded-lg p-4 border border-primary-100 flex items-start gap-3">
                                            <Info size={20} className="text-primary-600 mt-0.5 shrink-0" />
                                            <p className="text-xs text-primary-800 font-medium leading-relaxed">
                                                Preencha todos os itens obrigatórios para finalizar o serviço. As alterações são salvas automaticamente no dispositivo.
                                            </p>
                                        </div>
                                    )}

                                    <div className="space-y-6">
                                        <ChecklistRenderer
                                            fields={template.fields}
                                            answers={answers}
                                            onAnswerChange={handleAnswerChange}
                                            readOnly={order.status === OrderStatus.COMPLETED}
                                        />
                                    </div>

                                    <div className="h-12"></div> {/* Spacer */}
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                                    <div className="w-10 h-10 border-2 border-slate-200 border-t-primary-500 rounded-full animate-spin mb-4"></div>
                                    <p className="text-xs font-bold uppercase tracking-widest">Carregando Checklist...</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* SECTION: FINISH */}
                    {activeSection === 'finish' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 space-y-6">
                            {order.status === OrderStatus.COMPLETED ? (
                                <div className="bg-success-50 p-8 rounded-lg border border-success-100 text-center space-y-4">
                                    <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto text-success-500 shadow-none border border-success-100">
                                        <CheckCircle2 size={40} />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-success-900 mb-1 italic uppercase tracking-tighter">Serviço Concluído!</h3>
                                        <p className="text-sm text-success-700 font-medium opacity-80">Esta ordem de serviço já foi finalizada.</p>
                                    </div>
                                    <div className="bg-white p-4 rounded-xl border border-emerald-100 text-left">
                                        <p className="text-[10px] font-black uppercase text-emerald-400 tracking-widest mb-1">Assinado por</p>
                                        <p className="text-sm font-bold text-slate-800">{order.signatureName}</p>
                                        {/* TODO: Mostrar data de conclusão se disponível */}
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-100 space-y-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-600">
                                                <User size={16} />
                                            </div>
                                            <h3 className="text-sm font-black text-slate-900 uppercase italic">Quem está recebendo o serviço?</h3>
                                        </div>
                                        <input
                                            type="text"
                                            placeholder="Nome do Responsável / Cliente"
                                            value={signerName}
                                            onChange={e => setSignerName(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-lg px-4 py-3.5 text-sm font-bold text-slate-900 outline-none focus:border-primary-500 focus:ring-4 focus:ring-primary-100 transition-all placeholder:text-slate-300"
                                        />
                                    </div>

                                    <div className="bg-slate-50 p-6 rounded-lg border border-slate-100 space-y-4">
                                        <div className="flex items-center gap-3 mb-2">
                                            <div className="w-8 h-8 rounded-full bg-primary-50 flex items-center justify-center text-primary-600">
                                                <FileText size={16} />
                                            </div>
                                            <h3 className="text-sm font-black text-slate-900 uppercase italic">Assinatura Digital</h3>
                                        </div>
                                        <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-none">
                                            <SignatureCanvas
                                                onEnd={setSignature}
                                                onClear={() => setSignature(null)}
                                            />
                                        </div>
                                        <p className="text-[10px] text-slate-400 text-center font-bold uppercase italic">
                                            Ao assinar, o cliente concorda com a execução do serviço descrito.
                                        </p>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ACTION BAR FIXA NO RODAPÉ */}
            <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 p-4 pb-8 z-50 shadow-[0_-5px_30px_-5px_rgba(0,0,0,0.1)]">
                <div className="max-w-md mx-auto flex gap-3">
                    {/* Botão de Impedimento sempre visível se não concluído */}
                    {order.status !== OrderStatus.COMPLETED && order.status !== OrderStatus.CANCELED && (
                        <button
                            onClick={() => { setBlockReason(''); setShowBlockModal(true); }}
                            className="h-14 w-14 rounded-lg bg-rose-50 border border-rose-100 text-rose-500 flex flex-col items-center justify-center gap-1 active:scale-95 transition-all shrink-0"
                            title="Reportar Impedimento / Pausa"
                        >
                            <Ban size={20} />
                        </button>
                    )}

                    {/* Botões Dinâmicos de Ação */}
                    <div className="flex-1">
                        {renderActionButtons()}
                    </div>
                </div>
            </div>

            {/* BLOCK MODAL */}
            {
                showBlockModal && (
                    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                        <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-2xl space-y-5 animate-in zoom-in-95">
                            <div className="text-center">
                                <div className="w-14 h-14 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-500 mb-4 border border-rose-100">
                                    <Ban size={28} />
                                </div>
                                <h3 className="text-lg font-black text-slate-900 uppercase italic">Impedir Atendimento</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-tight max-w-[200px] mx-auto mt-1">
                                    O serviço não deve ou não pode continuar?
                                </p>
                            </div>

                            <div className="bg-slate-50 p-2 rounded-lg border border-slate-100">
                                <textarea
                                    className="w-full h-24 bg-transparent p-2 text-sm font-bold text-slate-700 outline-none resize-none placeholder:text-slate-300"
                                    placeholder="Descreva o motivo (ex: Aguardando peças, Cliente ausente...)"
                                    value={blockReason}
                                    onChange={e => setBlockReason(e.target.value)}
                                    autoFocus
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <button
                                    onClick={() => { setShowBlockModal(false); setBlockReason(''); }}
                                    className="py-3.5 rounded-lg border border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-wider hover:bg-slate-50 transition-colors"
                                >
                                    Voltar
                                </button>
                                {order.status === OrderStatus.IN_PROGRESS ? (
                                    <button
                                        onClick={handlePauseOrder}
                                        disabled={!blockReason.trim() || isLoading}
                                        className="py-3.5 rounded-lg bg-orange-500 text-white font-black text-[10px] uppercase tracking-wider shadow-none active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        Confirmar Pausa
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleBlockOrder}
                                        disabled={!blockReason.trim() || isLoading}
                                        className="py-3.5 rounded-lg bg-rose-500 text-white font-black text-[10px] uppercase tracking-wider shadow-none active:scale-95 transition-all disabled:opacity-50"
                                    >
                                        Bloquear / Impedir
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
