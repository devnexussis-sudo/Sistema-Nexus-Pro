
import React, { useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, FormTemplate, FormFieldType } from '../types';
import { X, MapPin, CheckCircle, CheckCircle2, CalendarDays, Camera, FileText, Navigation2, Play, AlertCircle, Loader2, Ban, Box, DollarSign, Plus, Trash2, Search, ShoppingCart, Eye, EyeOff, Edit3 } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { TextArea, Input } from '../components/ui/Input';
import { PriorityBadge, StatusBadge } from '../components/ui/StatusBadge';
import { SignaturePad } from '../components/ui/SignaturePad';
import { DataService } from '../services/dataService';

interface OrderDetailsModalProps {
  order: ServiceOrder;
  onClose: () => void;
  onUpdateStatus: (orderId: string, status: OrderStatus, notes?: string, formData?: any, items?: any[]) => Promise<void>;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, onClose, onUpdateStatus }) => {
  // 🔊 NEXUS DIAGNOSTIC SYSTEM (Mobile Debugging)
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      console.error("[🔴 Global Error]", event.error);
      // Opcional: alert(`[Erro do Sistema] ${event.message}`);
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      console.error("[🔴 Unhandled Rejection]", event.reason);
      if (typeof event.reason === 'string' && event.reason.includes('TENANT_MISSING')) {
        alert("🚨 Sessão expirada ou inválida. Por favor, saia e logue novamente.");
      }
    };
    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [notes, setNotes] = useState(order.notes || '');
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [linkedForm, setLinkedForm] = useState<FormTemplate | null>(null);
  const [localStatus, setLocalStatus] = useState<OrderStatus>(order.status);
  const [uploadingFields, setUploadingFields] = useState<Record<string, boolean>>({});
  const [isImpedimentMode, setIsImpedimentMode] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
  const [linkedEquipment, setLinkedEquipment] = useState<any>(null);
  const cameraInputRef = React.useRef<HTMLInputElement>(null);
  const [activePhotoField, setActivePhotoField] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>(() => {
    // Marca items existentes (do admin) como readonly
    return (order.items || []).map(item => ({ ...item, readonly: true }));
  });
  const [stock, setStock] = useState<any[]>([]);
  const [stockSearch, setStockSearch] = useState('');
  const [isStockListOpen, setIsStockListOpen] = useState(false);

  // 🛡️ Nexus Semantic Recovery: Reconstrói o formulário a partir do formData semântico (labels)
  useEffect(() => {
    if (order.formData && Object.keys(order.formData).length > 0) {
      setAnswers(order.formData);
    }
  }, [order.id, order.formData]);

  /**
   * 🛰️ RECUPERAÇÃO DA REGRA DE NEGÓCIO (VERSÃO CLOUD):
   * Esta função cruza os dados da OS com a configuração global na nuvem.
   */
  const loadChecklistByBusinessRules = async () => {
    try {
      // 🛡️ Sincronia Direta com a Central de Processos Cloud e Inventário
      const [rules, templates, serviceTypes, equipments] = await Promise.all([
        DataService.getActivationRules(),
        DataService.getFormTemplates(),
        DataService.getServiceTypes(),
        DataService.getEquipments()
      ]);

      // 2. Localiza o Tipo de Serviço baseado no nome gravado na OS
      const currentServiceType = serviceTypes.find((t: any) => t.name === order.operationType);

      // 3. Tenta identificar a Família Real do Equipamento
      let targetFamily = '';

      // A. Busca exata pelo Serial (Mais preciso)
      const linkedEquip = equipments.find((e: any) =>
        (order.equipmentSerial && e.serialNumber === order.equipmentSerial) ||
        (order.equipmentName && e.model === order.equipmentName)
      );

      if (linkedEquip) {
        targetFamily = linkedEquip.familyName;
        console.log(`🎯 Equipamento identificado: ${linkedEquip.model} (Família: ${targetFamily})`);
      } else {
        // B. Fallback: Tenta inferir pelo texto se não achar o equipamento
        console.warn("⚠️ Equipamento não vinculado, tentando inferência por texto...");
      }

      // 4. Busca a Regra de Ativação (Tipo + Família)
      const rule = rules.find((r: any) => {
        const matchesType = r.serviceTypeId === currentServiceType?.id;

        let matchesFamily = false;
        if (targetFamily) {
          // Se identificamos a família real, usamos match exato ou parcial na família
          matchesFamily = targetFamily.toLowerCase() === r.equipmentFamily.toLowerCase() ||
            targetFamily.toLowerCase().includes(r.equipmentFamily.toLowerCase());
        } else {
          // Lógica legada de fallback (match no título)
          matchesFamily = order.title.toLowerCase().includes((r.equipmentFamily || '').toLowerCase()) ||
            (order.equipmentName || '').toLowerCase().includes((r.equipmentFamily || '').toLowerCase());
        }

        return matchesType && matchesFamily;
      });

      let targetForm = null;
      if (rule) {
        console.log("✅ Regra de processo encontrada:", rule);
        targetForm = templates.find((t: any) => t.id === rule.formId);
      } else {
        console.log("ℹ️ Nenhuma regra específica, usando padrão.");
        const fallbackId = order.formId || 'f-padrao';
        targetForm = templates.find((t: any) => t.id === fallbackId) || templates[0];
      }

      if (targetForm) {
        setLinkedForm(targetForm);
      }
    } catch (error) {
      console.error("Erro ao cruzar regras de checklist cloud:", error);
    }
  };

  useEffect(() => {
    const init = async () => {
      // Carrega dados do equipamento vinculado
      try {
        const [equipments, loadedStock] = await Promise.all([
          DataService.getEquipments(),
          DataService.getStockItems()
        ]);
        const equip = equipments.find((e: any) =>
          (order.equipmentSerial && e.serialNumber === order.equipmentSerial) ||
          (order.equipmentName && e.model === order.equipmentName)
        );
        if (equip) setLinkedEquipment(equip);
        setStock(loadedStock);
      } catch (err) {
        console.error("Erro ao carregar dados auxiliares:", err);
      }

      if (localStatus === OrderStatus.IN_PROGRESS || localStatus === OrderStatus.COMPLETED) {
        loadChecklistByBusinessRules();
      }
    };
    init();
  }, [order.id, localStatus]);

  const handleStartService = async () => {
    setLoading(true);
    try {
      // 1. Atualiza status no banco e no estado local para renderização imediata
      await onUpdateStatus(order.id, OrderStatus.IN_PROGRESS);
      setLocalStatus(OrderStatus.IN_PROGRESS);

      // 2. Força o carregamento do formulário vinculado às regras
      await loadChecklistByBusinessRules();

      setShowConfirm(false);
    } catch (e) {
      alert("Erro ao iniciar atendimento.");
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizeService = async () => {
    // 🛡️ Nexus Sync Guard: Verifica se ainda há uploads em processamento
    const isUploading = Object.values(uploadingFields).some(v => v === true);
    if (isUploading) {
      alert("Aguarde a conclusão do envio das fotos antes de finalizar o atendimento.");
      return;
    }

    if (linkedForm) {
      const missing = linkedForm.fields.find(f => {
        // 🧠 Lógica de Visibilidade: Só exige se estiver visível
        if (f.condition && f.condition.fieldId) {
          const parentField = linkedForm.fields.find(p => p.id === f.condition?.fieldId);
          const parentAnswer = answers[f.condition.fieldId] || (parentField ? answers[parentField.label] : null);
          const isVisible = f.condition.operator === 'not_equals'
            ? parentAnswer !== f.condition.value
            : parentAnswer === f.condition.value;
          if (!isVisible) return false;
        }
        return f.required && !answers[f.id];
      });
      if (missing) {
        alert(`O preenchimento do campo "${missing.label}" é obrigatório.`);
        return;
      }
    }

    // Validação da Assinatura Fixa
    if (!answers['Assinatura do Cliente']) {
      alert("A assinatura do cliente é obrigatória para encerrar o atendimento.");
      return;
    }
    if (!answers['Assinatura do Cliente - Nome']) {
      alert("O nome do responsável pela assinatura é obrigatório.");
      return;
    }

    // Captura automática de data e hora da assinatura
    const now = new Date();
    const signatureDate = now.toLocaleDateString('pt-BR');
    const signatureTime = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    answers['Assinatura do Cliente - Data'] = signatureDate;
    answers['Assinatura do Cliente - Hora'] = signatureTime;

    setLoading(true);
    try {
      // 🛡️ Nexus Semantic Mapping: Converte IDs para Labels para visibilidade total no Portal Público
      const semanticAnswers: Record<string, any> = {};
      if (linkedForm) {
        linkedForm.fields.forEach(field => {
          // 🛡️ Filtro de Visibilidade: Não envia dados de campos ocultos por lógica
          let isVisible = true;
          if (field.condition && field.condition.fieldId) {
            const parentField = linkedForm.fields.find(p => p.id === field.condition?.fieldId);
            const parentAnswer = answers[field.condition.fieldId] || (parentField ? answers[parentField.label] : null);
            isVisible = field.condition.operator === 'not_equals'
              ? parentAnswer !== field.condition.value
              : parentAnswer === field.condition.value;
          }

          if (isVisible && answers[field.id] !== undefined) {
            // Salvamos o Label para que o Portal Público não exiba números
            semanticAnswers[field.label] = answers[field.id];

            // 🛡️ Nexus Semantic Anchor: Injeta os metadados de acompanhante se for assinatura
            if (field.type === FormFieldType.SIGNATURE) {
              if (answers[`${field.id}_name`]) semanticAnswers[`${field.label} - Nome`] = answers[`${field.id}_name`];
              if (answers[`${field.id}_date`]) semanticAnswers[`${field.label} - Data`] = answers[`${field.id}_date`];
              if (answers[`${field.id}_time`]) semanticAnswers[`${field.label} - Hora`] = answers[`${field.id}_time`];
            }
          }
        });
      }

      // 🛡️ Nexus Semantic Injection: Garante que os campos fixos de assinatura sejam salvos
      if (answers['Assinatura do Cliente']) semanticAnswers['Assinatura do Cliente'] = answers['Assinatura do Cliente'];
      if (answers['Assinatura do Cliente - Nome']) semanticAnswers['Assinatura do Cliente - Nome'] = answers['Assinatura do Cliente - Nome'];
      if (answers['Assinatura do Cliente - Data']) semanticAnswers['Assinatura do Cliente - Data'] = answers['Assinatura do Cliente - Data'];
      if (answers['Assinatura do Cliente - Hora']) semanticAnswers['Assinatura do Cliente - Hora'] = answers['Assinatura do Cliente - Hora'];

      // Se o mapeamento semântico gerou dados, usamos ele; caso contrário, fallback para answers original
      const finalFormData = Object.keys(semanticAnswers).length > 0 ? semanticAnswers : answers;

      setLoading(true);

      // 🛡️ Nexus Safety Timeout: 180s (3 min) para casos extremos de conectividade
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo limite excedido (180s). Verifique sua conexão.')), 180000));

      await Promise.race([
        onUpdateStatus(order.id, OrderStatus.COMPLETED, notes, finalFormData, items),
        timeoutPromise
      ]);

      setLocalStatus(OrderStatus.COMPLETED);
      onClose();
    } catch (e: any) {
      console.error("ERROR FAIL SAVE:", e);
      // 🚨 DEBUG MODE: Mostra o erro exato para o usuário tirar print
      const errorMsg = e.code ?
        `ALERTA TÉCNICO (TIRE PRINT):\n\nCODE: ${e.code}\nMSG: ${e.pg_message}\nDETAILS: ${e.details || 'N/A'}` :
        `ERRO: ${e.message || 'Desconhecido'}`;

      alert(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const validateBlockService = () => {
    // Validação Impedimento
    if (!answers['impediment_reason']) {
      alert("Descreva o motivo do impedimento.");
      return;
    }
    setShowBlockConfirm(true);
  };

  const executeBlockService = async () => {
    setLoading(true);
    try {
      const impedimentData = {
        impediment_reason: answers['impediment_reason'],
        impediment_photos: answers['impediment_photos'] || [],
      };

      await onUpdateStatus(order.id, OrderStatus.BLOCKED, `IMPEDIMENTO: ${answers['impediment_reason']}`, impedimentData);
      setLocalStatus(OrderStatus.BLOCKED);
      onClose();
    } catch (e) {
      alert("Erro ao registrar impedimento.");
    } finally {
      setLoading(false);
      setShowBlockConfirm(false);
    }
  };

  // 🛡️ NEXUS PHOTO PROCESSOR: Função unificada para processar fotos (API nativa ou file input)
  const processPhotoFile = async (file: File, fieldId: string) => {
    console.log('[PhotoUpload] ===== INÍCIO DO PROCESSO =====');
    console.log('[PhotoUpload] Field:', fieldId);
    console.log('[PhotoUpload] File:', { name: file.name, size: file.size, type: file.type });
    console.log('[PhotoUpload] Device:', { userAgent: navigator.userAgent });

    setUploadingFields(prev => ({ ...prev, [fieldId]: true }));

    // 🛡️ ABORT CONTROLLER: Permite cancelar o upload se travar
    const abortController = new AbortController();
    let guardianTriggered = false;

    try {
      if (file.type.startsWith('video/')) {
        alert('Apenas fotos são permitidas neste campo.');
        setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
        return;
      }

      // Verifica limite de fotos ANTES de processar
      const currentVal = answers[fieldId];
      let currentPhotos = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
      if (currentPhotos.length >= 3) {
        alert("Limite máximo de 3 fotos atingido para este campo.");
        setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
        return;
      }

      console.log('[PhotoUpload] Iniciando processamento completo...');

      // 🛡️ GUARDIAN: Aborta ativamente após 90s (compressão + upload)
      const guardian = setTimeout(() => {
        console.error('[PhotoUpload] ⏰ GUARDIAN ATIVADO: Processo travado há 90s');
        guardianTriggered = true;
        abortController.abort();
        setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
        alert('⏰ Upload cancelado: tempo excedido (90s). Verifique sua conexão de internet.');
      }, 90000);

      try {
        console.log('[PhotoUpload] Iniciando compressão + upload...');
        const startTime = Date.now();

        const publicUrl = await DataService.uploadServiceOrderEvidence(file, order.id, abortController.signal);

        const elapsed = Date.now() - startTime;
        console.log(`[PhotoUpload] ✅ Processo concluído em ${elapsed}ms`);
        console.log('[PhotoUpload] URL:', publicUrl);

        clearTimeout(guardian);

        // ✅ Só atualiza UI se não foi abortado E se teve sucesso
        if (!guardianTriggered) {
          console.log('[PhotoUpload] 🎯 Adicionando imagem comprimida à UI...');
          setAnswers(prev => {
            const currentVal = prev[fieldId];
            let currentPhotos = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);
            const newState = { ...prev, [fieldId]: [...currentPhotos, publicUrl] };
            console.log('[PhotoUpload] ✅ Novo estado de respostas:', newState[fieldId]);
            return newState;
          });
          console.log('[PhotoUpload] 🏁 Processo finalizado com sucesso.');
        }

      } catch (err: any) {
        clearTimeout(guardian);

        if (guardianTriggered) {
          console.log('[PhotoUpload] Erro ignorado pois Guardian já tratou.');
          return;
        }

        console.error("[PhotoUpload] ❌ ERRO NO PROCESSO:", {
          message: err.message,
          name: err.name,
          stack: err.stack
        });

        const errorMsg = err.message === 'COMPRESSION_TIMEOUT' || err.message === 'IMG_LOAD_TIMEOUT'
          ? 'Tempo esgotado ao processar imagem. Sua foto pode ser muito grande para a memória do celular.'
          : err.message === 'NETWORK_TIMEOUT_45S' || err.message === 'NETWORK_TIMEOUT'
            ? 'A internet falhou ao enviar. Tente novamente em um local com sinal melhor.'
            : err.message === 'AUTH_TENANT_MISSING'
              ? 'Falha de autenticação (Tenant ID). Por favor, relogue no app.'
              : err.name === 'AbortError'
                ? 'Upload cancelado pelo sistema (Guardian).'
                : `Erro no upload: ${err.message || 'Falha de comunicação'}`;

        alert(`❌ Erro no Processo: ${errorMsg}`);
      } finally {
        if (!guardianTriggered) {
          setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
        }
      }
    } catch (err) {
      console.error("[PhotoUpload] ❌ ERRO CRÍTICO:", err);
      setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
    }
  };

  const handlePhotoUpload = async (fieldId: string) => {
    if (localStatus === OrderStatus.COMPLETED) return;
    setActivePhotoField(fieldId);

    // 🎯 SOLUÇÃO DEFINITIVA: Usa o input file que respeita melhor o hardware
    // A camera nativa do browser força ultra-wide em muitos dispositivos
    // O input file com capture="environment" deixa o SO escolher a câmera padrão
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
      cameraInputRef.current.click();
    }
  };


  const onCameraChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fieldId = activePhotoField;
    if (!fieldId || !e.target.files?.[0]) return;

    await processPhotoFile(e.target.files[0], fieldId);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-md">
      {showConfirm && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl animate-bounce-in text-center space-y-6 border border-white/20">
            <div className="w-20 h-20 bg-primary-50 text-primary-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner border border-primary-100">
              <Play size={40} fill="currentColor" />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 uppercase italic leading-tight">Confirmar Execução?</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed px-4">
                Deseja iniciar agora? O checklist vinculado para <strong>{order.operationType}</strong> será carregado.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button onClick={handleStartService} isLoading={loading} className="w-full py-5 rounded-2xl font-black text-sm uppercase italic">
                Sim, Iniciar Agora
              </Button>
              <button disabled={loading} onClick={() => setShowConfirm(false)} className="text-slate-400 font-black text-[10px] uppercase tracking-widest py-2">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
      {showBlockConfirm && (
        <div className="absolute inset-0 z-[110] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl animate-bounce-in text-center space-y-6 border border-white/20">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner border border-red-100">
              <Ban size={40} />
            </div>
            <div className="space-y-2">
              <h3 className="text-xl font-black text-slate-900 uppercase italic leading-tight text-red-600">Confirmar Impedimento?</h3>
              <p className="text-xs text-slate-500 font-medium leading-relaxed px-4">
                Esta ação registrará o impedimento oficial desta O.S. e não poderá ser desfeita pelo técnico.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <Button variant="danger" onClick={executeBlockService} isLoading={loading} className="w-full py-5 rounded-2xl font-black text-sm uppercase italic">
                Confirmar Registro
              </Button>
              <button disabled={loading} onClick={() => setShowBlockConfirm(false)} className="text-slate-400 font-black text-[10px] uppercase tracking-widest py-2">
                Voltar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-t-[2.5rem] sm:rounded-[2.5rem] w-full max-w-2xl h-[92vh] sm:h-auto sm:max-h-[90vh] flex flex-col overflow-hidden animate-fade-in-up relative">
        <div className="p-3 px-6 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-white z-10">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-black text-primary-600 bg-primary-50 px-1.5 py-0.5 rounded-md border border-primary-100 uppercase">OS #{order.id}</span>
              <PriorityBadge priority={order.priority} />
            </div>
            <h2 className="text-lg font-black text-gray-900 leading-tight uppercase italic">{order.title}</h2>
          </div>
          <button onClick={onClose} className="p-2 bg-gray-50 text-gray-400 rounded-xl"><X size={20} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-32 custom-scrollbar">
          {/* SEÇÃO DO EQUIPAMENTO - PREPARAÇÃO DO TÉCNICO */}
          <div className="bg-slate-50 border border-slate-200 p-4 rounded-3xl space-y-3">
            <div className="flex items-center gap-2 text-slate-900 mb-1">
              <div className="p-1.5 bg-primary-600 rounded-lg text-white shadow-md"><Box size={16} /></div>
              <div>
                <h3 className="text-xs font-black uppercase italic tracking-tight">Ativo do Cliente</h3>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Modelo / Nome</p>
                <p className="text-[10px] font-black text-slate-900 uppercase italic truncate">{order.equipmentName || 'Não especidificado'}</p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
                <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Nº de Série</p>
                <p className="text-[10px] font-black text-slate-900 uppercase italic truncate">{order.equipmentSerial || 'S/N'}</p>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-sm col-span-2">
                <p className="text-[7px] font-black text-slate-400 uppercase mb-0.5">Família / Categoria Técnica</p>
                <p className="text-[10px] font-black text-primary-600 uppercase italic">{linkedEquipment?.familyName || 'Padrão'}</p>
              </div>
            </div>

            {linkedEquipment?.description && (
              <div className="bg-white/50 p-2.5 rounded-xl border border-slate-100">
                <p className="text-[10px] text-slate-600 font-medium leading-tight italic">{linkedEquipment.description}</p>
              </div>
            )}
          </div>

          <div className="bg-red-50 border border-red-100 p-4 rounded-2xl space-y-1">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle size={14} />
              <p className="text-[9px] font-black uppercase tracking-widest">Defeito Reportado</p>
            </div>
            <p className="text-xs font-medium text-red-900 italic leading-relaxed">"{order.description}"</p>
          </div>

          <div className="bg-slate-900 p-4 rounded-3xl text-white flex flex-col gap-3 shadow-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/10 rounded-xl"><CalendarDays size={20} /></div>
                <div>
                  <p className="text-[7px] font-black text-white/40 uppercase tracking-widest">Data Programada</p>
                  <p className="text-base font-black">{new Date(order.scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              <StatusBadge status={localStatus} />
            </div>

            {(order.startDate || order.endDate) && (
              <div className="flex gap-4 pt-3 border-t border-white/5">
                {order.startDate && (
                  <div>
                    <p className="text-[6px] font-black text-emerald-400 uppercase tracking-widest">Check-In</p>
                    <p className="text-[10px] font-black">{new Date(order.startDate).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                )}
                {order.endDate && (
                  <div>
                    <p className="text-[6px] font-black text-primary-400 uppercase tracking-widest">Check-Out</p>
                    <p className="text-[10px] font-black">{new Date(order.endDate).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {isImpedimentMode ? (
            <div className="space-y-6 pt-4 animate-fade-in mb-20">
              <div className="bg-red-50 border border-red-100 rounded-[2rem] p-6 space-y-4">
                <div className="flex items-center gap-3 text-red-600 mb-2">
                  <div className="p-2 bg-red-100 rounded-xl"><Ban size={24} /></div>
                  <div>
                    <h3 className="text-sm font-black uppercase">Impedimento de Atendimento</h3>
                    <p className="text-[10px] uppercase opacity-70">Preenchimento obrigatório</p>
                  </div>
                </div>

                <TextArea
                  placeholder="Descreva o motivo que impediu a realização do serviço..."
                  value={answers['impediment_reason'] || ''}
                  onChange={(e: any) => setAnswers(prev => ({ ...prev, impediment_reason: e.target.value }))}
                  className="bg-white border-red-100 placeholder:text-red-200 text-red-800 font-medium"
                />

                <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm">
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-3 tracking-widest">Evidência Fotográfica (Opcional)</p>
                  <div className="grid grid-cols-2 gap-3">
                    {(answers['impediment_photos'] || []).map((p: string, i: number) => (
                      <div key={i} className="relative group">
                        <img
                          src={p}
                          className="h-28 w-full rounded-xl object-cover bg-slate-100 cursor-zoom-in"
                          alt="Evidência"
                          onClick={() => setFullscreenImage(p)}
                        />
                        <button onClick={() => setAnswers(prev => ({ ...prev, impediment_photos: prev['impediment_photos'].filter((_: any, idx: number) => idx !== i) }))} className="absolute top-1 right-1 bg-red-500/80 text-white p-1.5 rounded-lg shadow-lg backdrop-blur-sm"><X size={12} /></button>
                      </div>
                    ))}
                    {(!answers['impediment_photos'] || answers['impediment_photos'].length < 3) && (
                      <button
                        onClick={() => handlePhotoUpload('impediment_photos')}
                        className="h-28 border-2 border-dashed border-red-100 rounded-xl flex flex-col items-center justify-center text-red-300 gap-2 hover:bg-red-50 transition-colors"
                        disabled={uploadingFields['impediment_photos']}
                      >
                        {uploadingFields['impediment_photos'] ? (
                          <Loader2 className="animate-spin text-red-400" />
                        ) : (
                          <>
                            <div className="p-2 bg-red-50 rounded-full"><Camera size={20} /></div>
                            <span className="text-[8px] font-bold uppercase tracking-wide">Adicionar</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : localStatus === OrderStatus.BLOCKED ? (
            <div className="p-10 border-2 border-dashed border-red-100 bg-red-50/50 rounded-[2.5rem] text-center space-y-4 mb-20 animate-fade-in">
              <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Ban size={32} className="text-red-500" />
              </div>
              <h3 className="text-sm font-black text-red-800 uppercase tracking-wide">Atendimento Impedido</h3>
              <div className="bg-white p-4 rounded-xl border border-red-100 text-left">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Motivo Registrado:</p>
                <p className="text-xs text-slate-700 font-bold italic leading-relaxed italic">"{order.notes?.replace('IMPEDIMENTO: ', '') || 'Motivo não especificado'}"</p>
              </div>

              {answers['impediment_photos'] && Array.isArray(answers['impediment_photos']) && answers['impediment_photos'].length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-[9px] font-black text-slate-400 uppercase text-left ml-1">Evidências Anexadas:</p>
                  <div className="grid grid-cols-3 gap-2">
                    {answers['impediment_photos'].map((url, idx) => (
                      <img
                        key={idx}
                        src={url}
                        className="w-full h-20 object-cover rounded-xl border border-red-100 cursor-zoom-in"
                        alt="Evidência"
                        onClick={() => setFullscreenImage(url)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (localStatus === OrderStatus.IN_PROGRESS || localStatus === OrderStatus.COMPLETED) ? (
            linkedForm ? (
              <section className="space-y-6 pt-4 animate-fade-in">
                <div className={`p-5 rounded-[2rem] border flex items-center gap-4 mb-4 ${localStatus === OrderStatus.COMPLETED ? 'bg-primary-50 border-primary-100' : 'bg-emerald-50 border-emerald-100'}`}>
                  <div className="p-3 bg-white rounded-xl shadow-sm text-primary-600"><FileText size={20} /></div>
                  <div>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${localStatus === OrderStatus.COMPLETED ? 'text-primary-600' : 'text-emerald-600'}`}>
                      Checklist Vinculado (Regra de Processo)
                    </h4>
                    <p className="text-sm font-black text-slate-900">{linkedForm.title}</p>
                  </div>
                </div>

                <div className={`space-y-8 ${localStatus === OrderStatus.COMPLETED ? 'opacity-90' : ''}`}>
                  {linkedForm.fields.map(field => {
                    // 🧠 Lógica de Visibilidade Condicional (Google Forms Style)
                    if (field.condition && field.condition.fieldId) {
                      const parentField = linkedForm.fields.find(f => f.id === field.condition?.fieldId);
                      const parentAnswer = answers[field.condition.fieldId] || (parentField ? answers[parentField.label] : null);

                      const isVisible = field.condition.operator === 'not_equals'
                        ? parentAnswer !== field.condition.value
                        : parentAnswer === field.condition.value;

                      if (!isVisible) return null;
                    }

                    return (
                      <div key={field.id} className="space-y-3">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest px-2 flex justify-between items-center">
                          {field.label}
                          {field.required && localStatus !== OrderStatus.COMPLETED && <span className="text-[8px] bg-red-100 text-red-500 px-2 py-0.5 rounded-full uppercase">Obrigatório</span>}
                        </label>

                        {field.type === FormFieldType.SELECT ? (
                          <div className="grid grid-cols-1 gap-2">
                            {(() => {
                              const selectedVal = answers[field.id] || answers[field.label];
                              return field.options?.map(opt => (
                                <button
                                  key={opt}
                                  disabled={localStatus === OrderStatus.COMPLETED}
                                  onClick={() => setAnswers(prev => ({ ...prev, [field.id]: opt }))}
                                  className={`w-full py-5 px-6 rounded-2xl text-xs font-black text-left transition-all border-2 ${selectedVal === opt ? 'bg-primary-600 border-primary-700 text-white shadow-xl' : 'bg-gray-50 border-gray-100 text-gray-400'
                                    }`}
                                >
                                  {opt}
                                </button>
                              ));
                            })()}
                          </div>
                        ) : field.type === FormFieldType.PHOTO ? (
                          <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-[2rem] p-4 text-center">
                            {(() => {
                              // Tenta buscar pelo ID (formulário ativo) ou pelo Label (histórico semântico)
                              const val = answers[field.id] || answers[field.label];
                              const photos = Array.isArray(val) ? val : (val ? [val] : []);

                              return (
                                <div className="space-y-4">
                                  {photos.length > 0 && (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                      {photos.map((photo: string, idx: number) => (
                                        <div key={idx} className="relative group">
                                          <img
                                            src={photo}
                                            className="w-full h-32 object-cover rounded-2xl shadow-sm border border-slate-100 cursor-zoom-in"
                                            alt={`Evidência ${idx + 1}`}
                                            onClick={() => setFullscreenImage(photo)}
                                          />
                                          {localStatus !== OrderStatus.COMPLETED && (
                                            <button
                                              onClick={() => {
                                                const newPhotos = photos.filter((_: any, i: number) => i !== idx);
                                                setAnswers(prev => ({ ...prev, [field.id]: newPhotos.length ? newPhotos : null }));
                                              }}
                                              className="absolute -top-2 -right-2 p-2 bg-red-500 text-white rounded-xl shadow-lg hover:bg-red-600 transition-colors"
                                            >
                                              <X size={14} />
                                            </button>
                                          )}
                                          <span className="absolute bottom-2 left-2 bg-black/50 text-white text-[8px] font-bold px-2 py-1 rounded-lg backdrop-blur-sm">
                                            #{idx + 1}
                                          </span>
                                        </div>
                                      ))}

                                      {/* Botão de Adicionar Mais (se < 3) */}
                                      {photos.length < 3 && localStatus !== OrderStatus.COMPLETED && (
                                        <button
                                          key={`btn-add-${field.id}`}
                                          disabled={uploadingFields[field.id]}
                                          onClick={() => handlePhotoUpload(field.id)}
                                          className="h-32 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-primary-600 hover:border-primary-300 hover:bg-primary-50 transition-all"
                                        >
                                          {uploadingFields[field.id] ? (
                                            <div key="loader-seq" className="flex flex-col items-center gap-1">
                                              <Loader2 size={24} className="animate-spin text-primary-600" />
                                              <span className="text-[8px] font-black uppercase tracking-widest text-primary-600 animate-pulse">Enviando...</span>
                                            </div>
                                          ) : (
                                            <div key="add-seq" className="flex flex-col items-center gap-1">
                                              <Camera size={24} />
                                              <span className="text-[8px] font-black uppercase tracking-widest">Adicionar</span>
                                            </div>
                                          )}
                                        </button>
                                      )}
                                    </div>
                                  )}

                                  {/* Estado Vazio (Nenhuma foto) */}
                                  {photos.length === 0 && (
                                    <button
                                      disabled={localStatus === OrderStatus.COMPLETED || uploadingFields[field.id]}
                                      onClick={() => handlePhotoUpload(field.id)}
                                      className="w-full py-8 flex flex-col items-center gap-3 text-slate-400 hover:text-primary-600 transition-colors"
                                    >
                                      {uploadingFields[field.id] ? (
                                        <div className="flex flex-col items-center gap-2">
                                          <div className="p-4 bg-primary-50 rounded-full shadow-inner">
                                            <Loader2 size={32} className="animate-spin text-primary-600" />
                                          </div>
                                          <span className="text-[10px] font-black uppercase tracking-widest text-primary-600 animate-pulse">Processando Imagem...</span>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="p-4 bg-white rounded-full shadow-sm">
                                            <Camera size={32} />
                                          </div>
                                          <div className="space-y-1">
                                            <span className="text-[10px] font-black uppercase tracking-widest block text-slate-600">{field.label}</span>
                                            <span className="text-[8px] font-bold uppercase tracking-wide text-slate-400">(Toque para fotografar)</span>
                                          </div>
                                        </>
                                      )}
                                    </button>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        ) : (
                          <Input
                            readOnly={localStatus === OrderStatus.COMPLETED}
                            placeholder={localStatus === OrderStatus.COMPLETED ? "Não preenchido" : "Toque para digitar..."}
                            className={`rounded-2xl py-5 px-6 font-bold ${localStatus === OrderStatus.COMPLETED ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-gray-50 border-gray-100'}`}
                            value={answers[field.id] || answers[field.label] || ''}
                            onChange={e => setAnswers(prev => ({ ...prev, [field.id]: e.target.value }))}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              <div className="py-20 flex flex-col items-center justify-center gap-4 text-primary-600 animate-pulse">
                <Loader2 size={40} className="animate-spin" />
                <p className="text-[10px] font-black uppercase tracking-widest italic">Sincronizando com a Matriz de Processos...</p>
              </div>
            )
          ) : localStatus === OrderStatus.CANCELED ? (
            <div className="p-10 bg-red-50 border border-red-100 rounded-[2.5rem] text-center">
              <X size={40} className="mx-auto text-red-500 mb-4" />
              <p className="text-[10px] font-black text-red-600 uppercase tracking-widest">Atendimento Cancelado</p>
            </div>
          ) : (
            <div className="p-10 border-2 border-dashed border-gray-100 rounded-[2.5rem] text-center space-y-4">
              <Play size={32} className="mx-auto text-gray-200" />
              <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">O checklist aparecerá após o início</p>
            </div>
          )}

          {/* SEÇÃO DE CUSTOS E PEÇAS (EXCLUSIVO TECH) */}
          {(localStatus === OrderStatus.IN_PROGRESS || localStatus === OrderStatus.COMPLETED) && (
            <section className="space-y-4 pt-6 border-t border-gray-50">
              <div className="flex justify-between items-center px-1">
                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Peças e Materiais</h3>
                  <p className="text-[8px] font-bold text-slate-300 uppercase">Items aplicados nesta OS</p>
                </div>
                {localStatus !== OrderStatus.COMPLETED && (
                  <button
                    onClick={() => setIsStockListOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg text-[9px] font-black uppercase italic shadow-lg shadow-primary-600/20 active:scale-95 transition-all"
                  >
                    <Plus size={12} /> Adicionar Item
                  </button>
                )}
              </div>

              {/* LISTA DE ITENS SELECIONADOS */}
              <div className="space-y-2">
                {items.length > 0 ? (
                  items.map((item, idx) => (
                    <div key={item.id || idx} className={`border rounded-2xl p-3 flex justify-between items-center shadow-sm ${item.readonly ? 'bg-slate-50 border-slate-200' : 'bg-white border-slate-100'}`}>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <p className="text-[10px] font-black text-slate-900 uppercase italic leading-none">{item.description}</p>
                          {item.readonly && (
                            <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[7px] font-black uppercase rounded-md border border-amber-200">
                              Admin
                            </span>
                          )}
                        </div>
                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">
                          {item.quantity}un x R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] font-black text-primary-600 font-mono">
                          R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                        {localStatus !== OrderStatus.COMPLETED && !item.readonly && (
                          <button
                            onClick={() => setItems(prev => prev.filter((_, i) => i !== idx))}
                            className="p-1.5 bg-red-50 text-red-400 rounded-lg"
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="py-8 bg-slate-50 border-2 border-dashed border-slate-100 rounded-2xl text-center">
                    <p className="text-[9px] font-black text-slate-300 uppercase italic">Nenhum item adicionado ainda</p>
                  </div>
                )}
              </div>

              {/* TOTAL PARCIAL */}
              <div className="bg-primary-50 border border-primary-100/50 p-4 rounded-2xl flex justify-between items-center">
                <span className="text-[10px] font-black text-primary-400 uppercase italic">Valor Realizado</span>
                <span className="text-xl font-black text-primary-700 italic tracking-tighter">
                  R$ {items.reduce((acc, i) => acc + i.total, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </section>
          )}

          {/* MODAL DE SELEÇÃO DE ESTOQUE (PWA STYLE) */}
          {isStockListOpen && (
            <div className="fixed inset-0 z-[120] bg-white flex flex-col animate-fade-in-up">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <button onClick={() => setIsStockListOpen(false)} className="p-2 text-slate-400"><X size={24} /></button>
                <h3 className="text-sm font-black uppercase italic">Adicionar Item de Estoque</h3>
                <div className="w-8" />
              </div>

              <div className="p-4 space-y-4 flex-1 overflow-y-auto">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                  <Input
                    placeholder="Buscar por nome ou código..."
                    value={stockSearch}
                    onChange={e => setStockSearch(e.target.value)}
                    className="pl-12 py-4 rounded-xl"
                  />
                </div>

                <div className="space-y-2">
                  <button
                    onClick={() => {
                      const desc = prompt("Descrição do serviço/peça manual:");
                      if (!desc) return;
                      const qty = Number(prompt("Quantidade:", "1"));
                      const price = Number(prompt("Valor Unitário (ex: 50.00):", "0.00").replace(',', '.'));
                      if (isNaN(qty) || isNaN(price)) return;

                      setItems(prev => [...prev, {
                        id: Math.random().toString(36).substr(2, 9),
                        description: desc,
                        quantity: qty,
                        unitPrice: price,
                        total: qty * price,
                        fromStock: false
                      }]);
                      setIsStockListOpen(false);
                    }}
                    className="w-full p-4 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <Edit3 size={18} />
                      <span className="text-xs font-black uppercase italic">Inserção Manual</span>
                    </div>
                    <Plus size={16} />
                  </button>

                  <div className="pt-2">
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1 italic">Resultado do Estoque</p>
                    {stock.filter(s =>
                      s.description.toLowerCase().includes(stockSearch.toLowerCase()) ||
                      s.code.toLowerCase().includes(stockSearch.toLowerCase())
                    ).map(item => (
                      <button
                        key={item.id}
                        onClick={() => {
                          const qty = Number(prompt(`Quantidade para "${item.description}":`, "1"));
                          if (!qty || isNaN(qty)) return;

                          setItems(prev => [...prev, {
                            id: Math.random().toString(36).substr(2, 9),
                            description: item.description,
                            quantity: qty,
                            unitPrice: item.sellPrice,
                            total: qty * item.sellPrice,
                            fromStock: true,
                            stockItemId: item.id
                          }]);
                          setIsStockListOpen(false);
                          setStockSearch('');
                        }}
                        className="w-full p-4 bg-white border border-slate-100 rounded-2xl flex items-center justify-between mb-2 active:bg-slate-50"
                      >
                        <div className="text-left">
                          <p className="text-[10px] font-black text-slate-900 uppercase italic">{item.description}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase">Estoque: {item.currentStock}un • R$ {item.sellPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                        </div>
                        <Plus size={16} className="text-primary-600" />
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {(localStatus === OrderStatus.IN_PROGRESS || localStatus === OrderStatus.COMPLETED) && (
            <section className="space-y-3 pt-6 border-t border-gray-50">
              <h3 className="text-[10px] font-black text-gray-400 uppercase tracking-widest px-1">Relato do Técnico</h3>
              <TextArea
                readOnly={localStatus === OrderStatus.COMPLETED}
                enableVoice={localStatus !== OrderStatus.COMPLETED}
                placeholder={localStatus === OrderStatus.COMPLETED ? "Sem observações registradas" : "Descreva detalhes técnicos aqui..."}
                rows={4}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`rounded-[2rem] text-sm p-6 italic transition-all ${localStatus === OrderStatus.COMPLETED ? 'bg-gray-100 border-gray-200 text-gray-500' : 'bg-white border-gray-200'}`}
              />
            </section>
          )}

          {/* SEÇÃO DE ASSINATURA FIXA E OBRIGATÓRIA */}
          {(localStatus === OrderStatus.IN_PROGRESS || localStatus === OrderStatus.COMPLETED) && (
            <section className="space-y-6 pt-6 border-t border-gray-50 pb-20">
              <div className="bg-primary-50/50 rounded-[2.5rem] p-6 border border-primary-100 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-primary-100/50 rounded-xl text-primary-600">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-primary-900 uppercase italic">Validação do Cliente</h3>
                    <p className="text-[9px] font-black text-primary-400 uppercase tracking-widest">Obrigatório para encerramento</p>
                  </div>
                </div>

                {localStatus === OrderStatus.COMPLETED ? (
                  // VISUALIZAÇÃO APÓS CONCLUÍDO (LEITURA)
                  <div className="bg-white p-8 rounded-[2.5rem] border border-gray-100 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-[8px] font-black text-gray-400 uppercase">Assinatura Digital</p>
                        <p className="text-[11px] font-bold text-slate-900 uppercase italic leading-none mt-1">
                          {answers['Assinatura do Cliente - Nome'] || 'Cliente'}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-[8px] font-black text-gray-400 uppercase">Data/Hora</p>
                        <p className="text-[11px] font-bold text-slate-900 leading-none mt-1">
                          {answers['Assinatura do Cliente - Data'] || 'N/D'} às {answers['Assinatura do Cliente - Hora'] || 'N/D'}
                        </p>
                      </div>
                    </div>
                    {answers['Assinatura do Cliente'] && (
                      <div className="pt-4 border-t border-gray-50">
                        <img
                          src={answers['Assinatura do Cliente']}
                          className="h-32 w-full object-contain mix-blend-multiply cursor-zoom-in"
                          alt="Assinatura"
                          onClick={() => setFullscreenImage(answers['Assinatura do Cliente'])}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  // FORMULÁRIO DE ASSINATURA (EDIÇÃO)
                  <div className="space-y-6">
                    <div className="space-y-5 bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm transition-all">
                      <Input
                        label="Nome do Acompanhante / Responsável *"
                        placeholder="NOME COMPLETO DO RECEPTOR..."
                        className="rounded-2xl py-5 font-black uppercase bg-gray-50 border-gray-100 text-slate-800"
                        value={answers['Assinatura do Cliente - Nome'] || ''}
                        onChange={e => setAnswers(prev => ({ ...prev, 'Assinatura do Cliente - Nome': e.target.value.toUpperCase() }))}
                      />

                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Data da Assinatura"
                          placeholder="DD/MM/AAAA"
                          disabled
                          className="rounded-2xl py-5 font-black bg-gray-100 border-gray-200 text-slate-500"
                          value={answers['Assinatura do Cliente - Data'] || new Date().toLocaleDateString('pt-BR')}
                        />
                        <Input
                          label="Hora da Assinatura"
                          placeholder="HH:MM"
                          disabled
                          className="rounded-2xl py-5 font-black bg-gray-100 border-gray-200 text-slate-500"
                          value={answers['Assinatura do Cliente - Hora'] || new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        />
                      </div>
                    </div>

                    <div className="bg-white p-1 rounded-[2.5rem] border-2 border-dashed border-primary-200">
                      {answers['Assinatura do Cliente'] ? (
                        <div className="relative group">
                          <img
                            src={answers['Assinatura do Cliente']}
                            className="h-40 w-full object-contain cursor-zoom-in"
                            alt="Assinatura Coletada"
                            onClick={() => setFullscreenImage(answers['Assinatura do Cliente'])}
                          />
                          <button
                            onClick={() => setAnswers(prev => {
                              const newState = { ...prev };
                              delete newState['Assinatura do Cliente'];
                              return newState;
                            })}
                            className="absolute top-2 right-2 p-2 bg-red-100 text-red-600 rounded-lg text-[10px] font-black uppercase tracking-wider shadow-sm hover:bg-red-200"
                          >
                            Refazer Assinatura
                          </button>
                        </div>
                      ) : (
                        <SignaturePad
                          onSave={(val) => setAnswers(prev => ({ ...prev, 'Assinatura do Cliente': val }))}
                          label="Coletar Assinatura na Tela"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}
        </div>

        <div className="p-4 px-6 border-t border-gray-100 bg-white sticky bottom-0 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
          {isImpedimentMode ? (
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1 py-4 rounded-xl font-black text-xs uppercase text-slate-500" onClick={() => setIsImpedimentMode(false)}>
                Cancelar
              </Button>
              <Button variant="danger" className="flex-[2] py-4 rounded-xl font-black text-xs uppercase italic shadow-lg flex items-center justify-center gap-2" onClick={validateBlockService} isLoading={loading}>
                <Ban size={18} /> Confirmar Impedimento
              </Button>
            </div>
          ) : localStatus !== OrderStatus.COMPLETED && localStatus !== OrderStatus.BLOCKED && localStatus !== OrderStatus.CANCELED ? (
            localStatus === OrderStatus.IN_PROGRESS ? (
              <div className="space-y-3">
                <Button variant="tech-primary" className="w-full py-4 rounded-xl font-black text-xs uppercase italic shadow-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98]" onClick={handleFinalizeService} isLoading={loading}>
                  <CheckCircle size={20} /> Finalizar e Sincronizar
                </Button>
                <div className="text-center">
                  <span className="text-[8px] font-black text-primary-400 uppercase tracking-[0.2em]">Os dados serão propagados para a central</span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr,auto] gap-3">
                <Button variant="primary" className="w-full py-4 rounded-xl font-black text-xs uppercase italic shadow-lg flex items-center justify-center gap-3 transition-all active:scale-[0.98]" onClick={() => setShowConfirm(true)}>
                  <Play size={20} fill="currentColor" /> Abrir Atendimento
                </Button>
                <Button
                  variant="ghost"
                  className="px-5 rounded-xl border-2 border-red-50 text-red-400 hover:bg-red-50"
                  onClick={() => setIsImpedimentMode(true)}
                  title="Registrar Impedimento"
                >
                  <Ban size={20} />
                </Button>
              </div>
            )
          ) : (
            <Button variant="secondary" className="w-full py-4 rounded-xl font-black text-xs uppercase text-slate-400" onClick={onClose}>
              Fechar Visualização
            </Button>
          )}
        </div>
      </div>

      {/* 🚀 NEXUS IMMERSIVE LIGHTBOX VIEWER */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[1000] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-4 sm:p-10 animate-fade-in cursor-zoom-out"
          onClick={() => setFullscreenImage(null)}
        >
          <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
            <img
              src={fullscreenImage}
              className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-scale-up"
              alt="Imersão Nexus"
            />
            <div className="absolute top-0 right-0 p-4">
              <div className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
                <X size={24} strokeWidth={3} />
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 📹 NEXUS NATIVE CAMERA BRIDGE - Stable Input */}
      <input
        type="file"
        ref={cameraInputRef}
        onChange={onCameraChange}
        accept="image/*"
        capture="environment"
        className="hidden"
        style={{ display: 'none', position: 'absolute', width: 0, height: 0 }}
      />
    </div>
  );
};
