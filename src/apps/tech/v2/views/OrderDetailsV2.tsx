import React, { useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, OrderPriority, FormTemplate, VisitStatusEnum } from '../../../../types';
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
    ArrowLeft,
    History,
    Clock
} from 'lucide-react';
import { ChecklistRenderer } from '../components/ChecklistRenderer';
import { SignatureCanvas } from '../components/ui/SignatureCanvas';
import { DataService } from '../../../../services/dataService';
import { OrderService } from '../../../../services/orderService';
import { VisitService } from '../../../../services/visitService';
import { VisitHistoryTab } from '../../../../components/admin/VisitHistoryTab';
import { getStatusBadge, getStatusLabel } from '../../../../lib/statusColors';
import { GeoService } from '../../../../lib/geo';
import { OrderTimeline } from '../../../../components/shared/OrderTimeline';

interface OrderDetailsV2Props {
    order: ServiceOrder;
    onClose: () => void;
    onUpdateStatus: (status: OrderStatus, notes?: string, formData?: any) => Promise<void>;
}

export const OrderDetailsV2: React.FC<OrderDetailsV2Props> = ({ order, onClose, onUpdateStatus }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [activeSection, setActiveSection] = useState<'info' | 'checklist' | 'finish' | 'visits'>('info');
    const [visitCount, setVisitCount] = useState<number>(0);
    const [isOsLocked, setIsOsLocked] = useState(false);

    // Checklist State
    const [template, setTemplate] = useState<FormTemplate | null>(null);
    const [answers, setAnswers] = useState<Record<string, any>>(order.formData || {});

    // Finish/Signature State
    const [signature, setSignature] = useState<string | null>(order.signature || null);
    const [signerName, setSignerName] = useState(order.signatureName || '');
    const [signerDoc, setSignerDoc] = useState(order.signatureDoc || '');

    // Block State & Start Prompt
    const [showStartPrompt, setShowStartPrompt] = useState(false);
    const [pendingFlowAction, setPendingFlowAction] = useState<'START_WORK' | 'ARRIVE_START' | null>(null);

    const [showBlockModal, setShowBlockModal] = useState(false);
    const [impedimentType, setImpedimentType] = useState<'absence' | 'parts' | 'other' | ''>('');
    const [blockReason, setBlockReason] = useState('');
    const [impedimentParts, setImpedimentParts] = useState({ name: '', model: '', code: '' });
    const [impedimentPhotos, setImpedimentPhotos] = useState<string[]>([]);

    // 📍 FLUXO DE ATENDIMENTO (FSM v2 — 7 estados)
    const handleFlowAction = async (action: 'START_TRAVEL' | 'START_WORK' | 'ARRIVE_START' | 'FINISH') => {
        setIsLoading(true);
        try {
            const now = new Date().toISOString();
            let newStatus = order.status;
            let updates: any = {};
            let timeline = { ...(order.timeline || {}) };

            // 1. Captura Geolocalização (se necessário)
            let location = null;
            if (['START_TRAVEL', 'ARRIVE_START', 'FINISH'].includes(action)) {
                try {
                    location = await GeoService.getCurrentPosition();
                } catch (e) {
                    console.warn("⚠️ Sem GPS:", e);
                }
            }

            switch (action) {
                case 'START_TRAVEL':
                    // ATRIBUÍDO → EM DESLOCAMENTO
                    newStatus = OrderStatus.TRAVELING;
                    timeline.travelStartAt = now;
                    updates.checkinLocation = location;
                    break;

                case 'START_WORK':
                    // ATRIBUÍDO → EM ANDAMENTO (já está no cliente)
                    newStatus = OrderStatus.IN_PROGRESS;
                    timeline.arrivedAt = now;
                    timeline.serviceStartAt = now;
                    updates.checkinLocation = location;
                    setActiveSection('checklist');
                    break;

                case 'ARRIVE_START':
                    // EM DESLOCAMENTO → EM ANDAMENTO (chegou no cliente)
                    newStatus = OrderStatus.IN_PROGRESS;
                    timeline.arrivedAt = now;
                    timeline.serviceStartAt = now;
                    updates.checkinLocation = location;
                    setActiveSection('checklist');
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
            setShowBlockModal(false);
        }
    };


    const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        setIsLoading(true);
        try {
            const compressImage = (file: File): Promise<string> => {
                return new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.readAsDataURL(file);
                    reader.onload = (event) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            const MAX_WIDTH = 1000;
                            const scaleSize = MAX_WIDTH / img.width;
                            const width = (img.width > MAX_WIDTH) ? MAX_WIDTH : img.width;
                            const height = (img.width > MAX_WIDTH) ? img.height * scaleSize : img.height;
                            canvas.width = width;
                            canvas.height = height;
                            const ctx = canvas.getContext('2d');
                            ctx?.drawImage(img, 0, 0, width, height);
                            resolve(canvas.toDataURL('image/jpeg', 0.7));
                        };
                        img.onerror = () => reject('err');
                        img.src = event.target?.result as string;
                    };
                    reader.onerror = () => reject('err');
                });
            };

            const newPhotos = [];
            for (let i = 0; i < files.length; i++) {
                const b64 = await compressImage(files[i]);
                newPhotos.push(b64);
            }
            setImpedimentPhotos(prev => [...prev, ...newPhotos]);
        } catch (err) {
            alert('Erro ao processar imagem.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleBlockOrder = async () => {
        if (!impedimentType) {
            alert('Selecione um motivo de impedimento.');
            return;
        }
        if (impedimentType === 'other' && !blockReason.trim()) {
            alert('Descreva o motivo.');
            return;
        }
        if (impedimentType === 'parts' && (!impedimentParts.name || !impedimentParts.model)) {
            alert('Preencha os dados da peça obrigatórios (Nome e Modelo).');
            return;
        }
        
        setIsLoading(true);
        try {
            const typeLabel = impedimentType === 'absence' ? 'Cliente Ausente' : 
                              impedimentType === 'parts' ? 'Necessidade de Peças' : 'Outros';
                              
            const finalReason = impedimentType === 'other' ? blockReason : typeLabel;
                                
            const impedimentData = {
                impedimento_tipo: typeLabel,
                impedimento_motivo: blockReason,
                impedimento_peca_nome: impedimentParts.name,
                impedimento_peca_modelo: impedimentParts.model,
                impedimento_peca_codigo: impedimentParts.code,
                impedimento_fotos: impedimentPhotos, // Base64 arrays (converted in updateStatus pipeline)
                impediment_reason: finalReason, 
                impediment_at: new Date().toISOString()
            };

            await onUpdateStatus(OrderStatus.BLOCKED, `IMPEDIMENTO: ${blockReason || typeLabel}`, impedimentData);
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
            console.log('[OrderDetails Mobile] 🔄 Loading checklist...', { type: order.operationType });
            setIsLoading(true);
            if (!template) {
                try {
                    const [rules, templates, equipments, serviceTypes] = await Promise.all([
                        DataService.getActivationRules(),
                        DataService.getFormTemplates(),
                        DataService.getEquipments(),
                        DataService.getServiceTypes()
                    ]);

                    console.log('[OrderDetails Mobile] 📦 Dados carregados:', {
                        rules: rules.length,
                        templates: templates.length,
                        equipments: equipments.length,
                        serviceTypes: serviceTypes.length
                    });

                    // 1. Mapeia UUID do service type para o nome (Crucial para o match)
                    const serviceTypeMap: Record<string, string> = {};
                    serviceTypes.forEach((st: any) => {
                        serviceTypeMap[st.id] = (st.name || st.title || '').trim().toLowerCase();
                    });

                    let equipmentFamily = '';
                    const equipment = equipments.find((e: any) =>
                        (order.equipmentSerial && e.serialNumber === order.equipmentSerial) ||
                        (order.equipmentName && e.model === order.equipmentName)
                    );

                    if (equipment) equipmentFamily = equipment.familyName;

                    const orderTypeLower = (order.operationType || '').trim().toLowerCase();
                    console.log('[OrderDetails Mobile] 🔍 Buscando regra para:', { orderTypeLower, equipmentFamily });

                    // 2. Regra de ativação: resolve o nome do tipo pelo UUID antes de comparar
                    const matchingRule = rules.find((r: any) => {
                        const ruleServiceTypeName = serviceTypeMap[r.serviceTypeId] || '';
                        const ruleEquipFamily = (r.equipmentFamily || '').trim().toLowerCase();
                        const orderEquipFamily = equipmentFamily.trim().toLowerCase();

                        console.log('[OrderDetails Mobile] ↳ Avaliando regra:', {
                            ruleServiceTypeId: r.serviceTypeId,
                            resolvedName: ruleServiceTypeName,
                            ruleFormId: r.formId,
                            matches: ruleServiceTypeName === orderTypeLower
                        });

                        return ruleServiceTypeName === orderTypeLower &&
                            (!ruleEquipFamily || ruleEquipFamily === 'todos' || ruleEquipFamily === orderEquipFamily);
                    });

                    if (matchingRule) {
                        const formIdToFind = matchingRule.formId || matchingRule.formTemplateId || matchingRule.form_template_id;
                        console.log('[OrderDetails Mobile] ✅ Regra encontrada! Buscando template:', formIdToFind);

                        const foundTemplate = templates.find((t: any) => t.id === formIdToFind);
                        if (foundTemplate) {
                            console.log('[OrderDetails Mobile] ✅ Template carregado:', foundTemplate.title);
                            setTemplate(foundTemplate);
                            return;
                        } else {
                            console.warn('[OrderDetails Mobile] ⚠️ Template não encontrado:', formIdToFind);
                        }
                    } else {
                        console.warn('[OrderDetails Mobile] ⚠️ Nenhuma regra de ativação encontrada para:', orderTypeLower);
                    }

                    // 3. Fallback: tenta match por título ou serviceTypes direto no template
                    const fallbackTemplate = templates.find((t: any) =>
                        t.serviceTypes?.some((st: string) => st.toLowerCase() === orderTypeLower) ||
                        t.title?.toLowerCase().includes(orderTypeLower)
                    );

                    if (fallbackTemplate) {
                        console.log('[OrderDetails Mobile] 🔄 Usando fallback por nome:', fallbackTemplate.title);
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
                    console.warn('[OrderDetails Mobile] ⚠️ Usando fallback básico');
                    setTemplate(finalFallback);

                } catch (e) {
                    console.error("[OrderDetails Mobile] Error loading checklist:", e);
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

    // Carregar metadados das visitas (contagem + lock status)
    useEffect(() => {
        VisitService.getVisitsByOrderId(order.id).then(visits => {
            setVisitCount(visits.length);
            const lastVisit = visits[visits.length - 1];
            if (lastVisit) {
                setIsOsLocked(lastVisit.isLocked ?? false);
            }
        }).catch(() => {
            // Silencioso — não impede o fluxo principal
        });
    }, [order.id]);

    // Pausa com Motivo
    // Removido: handlePauseOrder (PAUSED não existe mais na FSM)

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
        // 🧪 Validação do Checklist antes de finalizar (Mobile)
        if (template && template.fields) {
            for (const field of template.fields) {
                // 1. Verifica visibilidade (usando lógica normalizada)
                let isVisible = true;
                if (field.condition && field.condition.fieldId) {
                    const dependentValue = answers[field.condition.fieldId];
                    const operator = (field.condition.operator || 'equals') as string;
                    const normalizedDependent = (dependentValue ?? '').toString().trim().toLowerCase();
                    const normalizedExpected = (field.condition.value ?? '').toString().trim().toLowerCase();

                    if (operator === 'equals' || operator === 'equal') {
                        if (normalizedDependent !== normalizedExpected) isVisible = false;
                    } else if (operator === 'not_equals') {
                        if (normalizedDependent === normalizedExpected) isVisible = false;
                    }
                }
                
                // 2. Se visível e obrigatório, valida resposta
                if (isVisible && field.required) {
                    const val = answers[field.id];
                    if (val === undefined || val === null || val === '') {
                        alert(`O campo "${field.label}" é obrigatório.`);
                        setActiveSection('checklist');
                        return;
                    }
                }
            }
        }

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





    // Helper p/ renderizar botões de ação do fluxo (FSM v2)
    const renderActionButtons = () => {
        const s = order.status;

        // 1. ATRIBUÍDO → Alert: Deslocamento ou Já no Cliente
        if (s === OrderStatus.PENDING || s === OrderStatus.ASSIGNED) {
            return (
                <button
                    onClick={() => {
                        if (confirm('Você já está no cliente?\n\nSIM = Iniciar Serviço\nNÃO/Cancelar = Iniciar Deslocamento')) {
                            setPendingFlowAction('START_WORK');
                            setShowStartPrompt(true);
                        } else {
                            handleFlowAction('START_TRAVEL');
                        }
                    }}
                    className="w-full h-14 bg-indigo-600 text-white rounded-lg font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-indigo-700 shadow-lg shadow-indigo-200"
                >
                    {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <Play size={20} fill="currentColor" />}
                    Executar OS
                </button>
            );
        }

        // 2. EM DESLOCAMENTO → Cheguei no Cliente → EM ANDAMENTO
        if (s === OrderStatus.TRAVELING) {
            return (
                <button
                    onClick={() => {
                        setPendingFlowAction('ARRIVE_START');
                        setShowStartPrompt(true);
                    }}
                    className="w-full h-14 bg-purple-600 text-white rounded-lg font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-purple-700 shadow-lg shadow-purple-200"
                >
                    {isLoading ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" /> : <MapPin size={20} />}
                    <div className="flex flex-col items-start leading-none gap-1">
                        <span>Cheguei no Cliente</span>
                        <span className="text-[9px] font-medium opacity-70 normal-case tracking-normal">Iniciar atendimento</span>
                    </div>
                </button>
            );
        }

        // 3. EM ANDAMENTO (Checklist / Finalizar)
        if (s === OrderStatus.IN_PROGRESS) {
            if (activeSection === 'info') {
                return (
                    <button
                        onClick={() => setActiveSection('checklist')}
                        className="w-full h-14 bg-primary-500 text-white rounded-lg font-black uppercase text-xs tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all shadow-md shadow-primary-200"
                    >
                        Ir para Checklist <ChevronDown className="rotate-[-90deg]" size={18} />
                    </button>
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
                    <h2 className="text-sm font-bold text-slate-900 leading-none">
                        {order.displayId || `#${order.id.slice(0, 8)}`}
                    </h2>
                    {/* Badge de visita */}
                    {visitCount > 0 && (
                        <span className="mt-0.5 text-[9px] font-black text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded-full">
                            Visita {visitCount}
                        </span>
                    )}
                </div>

                <div className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wide border ${getStatusBadge(order.status)}`}>
                    {getStatusLabel(order.status)}
                </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto bg-slate-50 relative pb-40">
                {/* Tabs Stick - Abaixo do Header */}
                <div className="flex px-2 pt-2 pb-0 bg-slate-50 sticky top-0 z-10 gap-1 overflow-x-auto scrollbar-hide">
                    {[
                        { id: 'info', label: 'Detalhes' },
                        { id: 'checklist', label: 'Checklist', disabled: order.status === OrderStatus.PENDING },
                        { id: 'finish', label: 'Finalizar' },
                        { id: 'visits', label: `Visitas${visitCount > 0 ? ` (${visitCount})` : ''}` },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => !tab.disabled && setActiveSection(tab.id as any)}
                            disabled={tab.disabled}
                            className={`flex-1 py-2.5 rounded-t-lg text-[10px] font-black uppercase tracking-widest transition-all
                                ${activeSection === tab.id
                                    ? 'bg-white text-primary-500 shadow-none border-t border-x border-slate-200 relative z-10 translate-y-px pb-3'
                                    : 'bg-slate-100 text-slate-400 border border-transparent'}
                                ${tab.disabled ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                        >
                            {tab.label}
                        </button>
                    ))}
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
                            {/* Aviso de OS bloqueada (somente leitura) */}
                            {isOsLocked && (
                                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 flex items-start gap-3">
                                    <Ban size={18} className="text-slate-400 shrink-0 mt-0.5" />
                                    <p className="text-xs text-slate-500 font-medium">
                                        Esta OS foi concluída. O formulário está em modo somente leitura.
                                    </p>
                                </div>
                            )}
                            {template ? (
                                <>
                                    {order.status !== OrderStatus.COMPLETED && !isOsLocked && (
                                        <div className="bg-primary-50 rounded-lg p-4 border border-primary-100 flex items-start gap-3">
                                            <Info size={20} className="text-primary-600 mt-0.5 shrink-0" />
                                            <p className="text-xs text-primary-800 font-medium leading-relaxed">
                                                Preencha todos os itens obrigatórios para finalizar o serviço.
                                            </p>
                                        </div>
                                    )}
                                    <div className="space-y-6">
                                        <ChecklistRenderer
                                            fields={template.fields}
                                            answers={answers}
                                            onAnswerChange={handleAnswerChange}
                                            readOnly={order.status === OrderStatus.COMPLETED || isOsLocked}
                                        />
                                    </div>
                                    <div className="h-12"></div>
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
                    {/* SECTION: VISITAS */}
                    {activeSection === 'visits' && (
                        <div className="animate-in fade-in slide-in-from-bottom-4 -mx-5 -my-6">
                            <VisitHistoryTab
                                orderId={order.id}
                                isActive={activeSection === 'visits'}
                            />
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
                            onClick={() => { 
                                setBlockReason(''); 
                                setImpedimentType(''); 
                                setImpedimentPhotos([]); 
                                setImpedimentParts({name:'', model:'', code:''}); 
                                setShowBlockModal(true); 
                            }}
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

            {/* START PROMPT MODAL */}
            {
                showStartPrompt && (
                    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 animate-in fade-in duration-200">
                        <div className="bg-white rounded-lg p-6 w-full max-w-sm shadow-2xl space-y-5 animate-in zoom-in-95">
                            <div className="text-center space-y-2">
                                <div className="w-14 h-14 bg-indigo-50 rounded-full flex items-center justify-center mx-auto text-indigo-500 mb-2 border border-indigo-100">
                                    <Play size={28} className="ml-1" fill="currentColor" />
                                </div>
                                <h3 className="text-lg font-black text-slate-900 uppercase italic">Execução da OS</h3>
                                <p className="text-xs text-slate-500 font-bold uppercase tracking-tight max-w-[200px] mx-auto">
                                    A OS será executada ou deverá ser impedida?
                                </p>
                            </div>
                            <div className="space-y-3 pt-2">
                                <button
                                    onClick={() => {
                                        setShowStartPrompt(false);
                                        if (pendingFlowAction) handleFlowAction(pendingFlowAction);
                                    }}
                                    className="w-full py-4 rounded-lg bg-indigo-600 text-white font-black uppercase tracking-wider active:scale-95 transition-all shadow-md shadow-indigo-200"
                                >
                                    Executar Normalmente
                                </button>
                                <button
                                    onClick={() => {
                                        setShowStartPrompt(false);
                                        setBlockReason('');
                                        setImpedimentType('');
                                        setImpedimentParts({name: '', model: '', code: ''});
                                        setImpedimentPhotos([]);
                                        setShowBlockModal(true);
                                    }}
                                    className="w-full py-4 rounded-lg bg-rose-50 text-rose-600 font-black uppercase tracking-wider active:scale-95 transition-all shadow-none border border-rose-200"
                                >
                                    Impedir / Não Executar
                                </button>
                                <button
                                    onClick={() => setShowStartPrompt(false)}
                                    className="w-full py-3 rounded-lg text-slate-400 hover:text-slate-600 font-bold uppercase text-[10px] active:scale-95 transition-all"
                                >
                                    Voltar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* BLOCK MODAL COM FORMULÁRIO COMPLETO */}
            {
                showBlockModal && (
                    <div className="fixed inset-0 z-[200] bg-slate-900/60 backdrop-blur-sm flex items-start justify-center p-4 pt-10 overflow-y-auto animate-in fade-in duration-200">
                        <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-2xl space-y-5 animate-in slide-in-from-bottom-8 mb-10">
                            <div className="text-center border-b border-slate-100 pb-4">
                                <div className="w-12 h-12 bg-rose-50 rounded-full flex items-center justify-center mx-auto text-rose-500 mb-3 border border-rose-100">
                                    <Ban size={24} />
                                </div>
                                <h3 className="text-lg font-black text-slate-900 uppercase italic">Impedir OS</h3>
                                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight mt-1">
                                    Preencha os dados de impedimento
                                </p>
                            </div>

                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Motivo do Impedimento *</label>
                                    <div className="grid grid-cols-1 gap-2">
                                        {[
                                            { id: 'absence', label: 'Cliente Ausente' },
                                            { id: 'parts', label: 'Necessidade de Peças' },
                                            { id: 'other', label: 'Outros' }
                                        ].map(opt => (
                                            <button
                                                key={opt.id}
                                                // eslint-disable-next-line
                                                onClick={() => setImpedimentType(opt.id as any)}
                                                className={`py-3 px-4 rounded-lg border text-sm font-bold text-left transition-all ${
                                                    impedimentType === opt.id 
                                                        ? 'bg-rose-50 border-rose-500 text-rose-700' 
                                                        : 'bg-white border-slate-200 text-slate-600'
                                                }`}
                                            >
                                                {opt.label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {impedimentType === 'parts' && (
                                    <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Dados da Peça</label>
                                        <input 
                                            placeholder="Nome da Peça *" 
                                            value={impedimentParts.name} 
                                            onChange={e => setImpedimentParts(p => ({...p, name: e.target.value}))}
                                            className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-bold outline-none focus:border-rose-300" 
                                        />
                                        <input 
                                            placeholder="Modelo *" 
                                            value={impedimentParts.model} 
                                            onChange={e => setImpedimentParts(p => ({...p, model: e.target.value}))}
                                            className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-bold outline-none focus:border-rose-300" 
                                        />
                                        <input 
                                            placeholder="Código (Opcional)" 
                                            value={impedimentParts.code} 
                                            onChange={e => setImpedimentParts(p => ({...p, code: e.target.value}))}
                                            className="w-full bg-white border border-slate-200 rounded-lg p-3 text-sm font-bold outline-none focus:border-rose-300" 
                                        />
                                    </div>
                                )}

                                {impedimentType === 'other' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Descreva o Motivo *</label>
                                        <textarea
                                            className="w-full h-24 bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm font-bold text-slate-700 outline-none resize-none focus:border-rose-300 placeholder:text-slate-300"
                                            placeholder="Escreva aqui..."
                                            value={blockReason}
                                            onChange={e => setBlockReason(e.target.value)}
                                        />
                                    </div>
                                )}

                                {impedimentType && impedimentType !== 'other' && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">Detalhes extras (Opcional)</label>
                                        <textarea
                                            className="w-full h-16 bg-white border border-slate-200 rounded-lg p-3 text-sm font-bold text-slate-700 outline-none resize-none focus:border-rose-300 placeholder:text-slate-300"
                                            placeholder="Alguma observação adicional?"
                                            value={blockReason}
                                            onChange={e => setBlockReason(e.target.value)}
                                        />
                                    </div>
                                )}

                                {/* Fotos de Evidência */}
                                {impedimentType && (
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 flex justify-between">
                                            <span>Evidências (Opcional)</span>
                                            <span className="text-primary-500 font-bold">{impedimentPhotos.length} fotos</span>
                                        </label>
                                        <div className="grid grid-cols-4 gap-2">
                                            {impedimentPhotos.map((photo, idx) => (
                                                <div key={idx} className="relative aspect-square rounded-lg border border-slate-200 overflow-hidden group">
                                                    <img src={photo} alt="Evidência" className="w-full h-full object-cover" />
                                                    <button 
                                                        onClick={() => setImpedimentPhotos(p => p.filter((_, i) => i !== idx))}
                                                        className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-100 transition-opacity flex items-center justify-center p-0.5"
                                                    >
                                                        <X size={12} />
                                                    </button>
                                                </div>
                                            ))}
                                            <label className="aspect-square rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 flex items-center justify-center text-slate-400 hover:text-primary-500 hover:border-primary-300 cursor-pointer transition-colors">
                                                <input type="file" multiple accept="image/*" className="hidden" onChange={handlePhotoUpload} />
                                                <Camera size={20} />
                                            </label>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    onClick={() => setShowBlockModal(false)}
                                    className="flex-1 py-3.5 rounded-lg border border-slate-200 text-slate-500 font-black text-[10px] uppercase tracking-wider hover:bg-slate-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleBlockOrder}
                                    disabled={!impedimentType || isLoading}
                                    className="flex-[2] py-3.5 rounded-lg bg-rose-500 text-white font-black text-[10px] uppercase tracking-wider shadow-none active:scale-95 transition-all disabled:opacity-50"
                                >
                                    Confirmar Impedimento
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
        </div >
    );
};
