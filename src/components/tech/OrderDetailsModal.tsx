
import React, { useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, FormTemplate, FormFieldType } from '../../types';
import { X, MapPin, CheckCircle, CheckCircle2, CalendarDays, Camera, FileText, Navigation2, Play, AlertCircle, Loader2, Ban, Box } from 'lucide-react';
import { Button } from '../ui/Button';
import { TextArea, Input } from '../ui/Input';
import { PriorityBadge, StatusBadge } from '../ui/StatusBadge';
import { SignaturePad } from '../ui/SignaturePad';
import { DataService } from '../../services/dataService';

interface OrderDetailsModalProps {
  order: ServiceOrder;
  onClose: () => void;
  onUpdateStatus: (orderId: string, status: OrderStatus, notes?: string, formData?: any) => Promise<void>;
}

export const OrderDetailsModal: React.FC<OrderDetailsModalProps> = ({ order, onClose, onUpdateStatus }) => {
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
  const [showCameraModal, setShowCameraModal] = useState(false);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);

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
        const equipments = await DataService.getEquipments();
        const equip = equipments.find((e: any) =>
          (order.equipmentSerial && e.serialNumber === order.equipmentSerial) ||
          (order.equipmentName && e.model === order.equipmentName)
        );
        if (equip) setLinkedEquipment(equip);
      } catch (err) {
        console.error("Erro ao carregar equipamento:", err);
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
    if (!answers['Assinatura do Cliente - CPF']) {
      alert("O CPF do responsável pela assinatura é obrigatório.");
      return;
    }

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
              if (answers[`${field.id}_cpf`]) semanticAnswers[`${field.label} - CPF`] = answers[`${field.id}_cpf`];
              if (answers[`${field.id}_birth`]) semanticAnswers[`${field.label} - Nascimento`] = answers[`${field.id}_birth`];
            }
          }
        });
      }

      // 🛡️ Nexus Semantic Injection: Garante que os campos fixos de assinatura sejam salvos
      if (answers['Assinatura do Cliente']) semanticAnswers['Assinatura do Cliente'] = answers['Assinatura do Cliente'];
      if (answers['Assinatura do Cliente - Nome']) semanticAnswers['Assinatura do Cliente - Nome'] = answers['Assinatura do Cliente - Nome'];
      if (answers['Assinatura do Cliente - CPF']) semanticAnswers['Assinatura do Cliente - CPF'] = answers['Assinatura do Cliente - CPF'];
      if (answers['Assinatura do Cliente - Nascimento']) semanticAnswers['Assinatura do Cliente - Nascimento'] = answers['Assinatura do Cliente - Nascimento'];

      // Se o mapeamento semântico gerou dados, usamos ele; caso contrário, fallback para answers original
      const finalFormData = Object.keys(semanticAnswers).length > 0 ? semanticAnswers : answers;

      setLoading(true);

      // 🛡️ Nexus Safety Timeout: 180s (3 min) para casos extremos de conectividade
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Tempo limite excedido (180s). Verifique sua conexão.')), 180000));

      await Promise.race([
        onUpdateStatus(order.id, OrderStatus.COMPLETED, notes, finalFormData),
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
    setUploadingFields(prev => ({ ...prev, [fieldId]: true }));

    try {
      // Validação extra de segurança
      if (file.type.startsWith('video/')) {
        alert('Apenas fotos são permitidas neste campo.');
        setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
        return;
      }

      let processedFile = file;

      // 🛡️ Nexus HEIC Intelligence
      const isHeic = file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif') || file.type === 'image/heic' || file.type === 'image/heif';
      if (isHeic) {
        try {
          const heic2any = (await import('heic2any')).default;
          const convertedBlob = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.8
          });
          const simpleBlob = Array.isArray(convertedBlob) ? convertedBlob[0] : convertedBlob;
          processedFile = new File([simpleBlob], file.name.split('.')[0] + '.jpg', { type: 'image/jpeg' });
        } catch (err) {
          console.error("Falha na transcodificação HEIC Nexus:", err);
        }
      }

      const reader = new FileReader();
      reader.onload = async (re) => {
        const rawBase64 = re.target?.result as string;

        try {
          // 1. Compressão Local
          const compressedBase64 = await DataService.compressImage(rawBase64);

          // 2. Upload Imediato (Background)
          const publicUrl = await DataService.uploadFile(compressedBase64, `orders/${order.id}/evidence`);

          // 3. Salva a URL
          setAnswers(prev => {
            const currentVal = prev[fieldId];
            let currentPhotos = Array.isArray(currentVal) ? currentVal : (currentVal ? [currentVal] : []);

            if (currentPhotos.length >= 3) {
              alert("Limite máximo de 3 fotos atingido para este campo.");
              return prev;
            }

            return { ...prev, [fieldId]: [...currentPhotos, publicUrl] };
          });

        } catch (err) {
          console.error("Erro no upload imediato:", err);
          alert("Erro ao enviar foto. Verifique sua conexão e tente novamente.");
        } finally {
          setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
        }
      };
      reader.readAsDataURL(processedFile);
    } catch (err) {
      console.error("Erro no processamento da câmera:", err);
      setUploadingFields(prev => ({ ...prev, [fieldId]: false }));
    }
  };

  const handlePhotoUpload = async (fieldId: string) => {
    if (localStatus === OrderStatus.COMPLETED) return;
    setActivePhotoField(fieldId);

    // 🎯 NEXUS NATIVE CAMERA: Tenta usar a API nativa primeiro (força câmera traseira)
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' }, // Força câmera traseira
            width: { ideal: 1920 },
            height: { ideal: 1080 }
          },
          audio: false
        });

        streamRef.current = stream;
        setShowCameraModal(true);

        // Aguarda o modal renderizar
        await new Promise(resolve => setTimeout(resolve, 100));

        // Conecta o stream ao vídeo
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }

        return; // Sucesso, não precisa do fallback
      } catch (err) {
        console.warn('📸 Camera API não disponível, usando fallback:', err);
        // Continua para o fallback abaixo
      }
    }

    // FALLBACK: Usa o input file tradicional
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
      cameraInputRef.current.click();
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !activePhotoField) return;

    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx?.drawImage(videoRef.current, 0, 0);

    // Para o stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    setShowCameraModal(false);

    // Converte para blob e processa
    canvas.toBlob(async (blob) => {
      if (blob) {
        const file = new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' });
        await processPhotoFile(file, activePhotoField);
      }
    }, 'image/jpeg', 0.9);
  };

  const closeCameraModal = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCameraModal(false);
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
            <div className="w-20 h-20 bg-indigo-50 text-indigo-600 rounded-3xl flex items-center justify-center mx-auto shadow-inner border border-indigo-100">
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
        <div className="p-6 border-b border-gray-100 flex justify-between items-start sticky top-0 bg-white z-10">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100 uppercase">OS #{order.id}</span>
              <PriorityBadge priority={order.priority} />
            </div>
            <h2 className="text-xl font-black text-gray-900 leading-tight uppercase italic">{order.title}</h2>
          </div>
          <button onClick={onClose} className="p-3 bg-gray-50 text-gray-400 rounded-2xl"><X size={24} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32 custom-scrollbar">
          {/* SEÇÃO DO EQUIPAMENTO - PREPARAÇÃO DO TÉCNICO */}
          <div className="bg-slate-50 border border-slate-200 p-6 rounded-[2.5rem] space-y-4">
            <div className="flex items-center gap-3 text-slate-900 mb-2">
              <div className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg"><Box size={20} /></div>
              <div>
                <h3 className="text-sm font-black uppercase italic tracking-tight">Ativo do Cliente</h3>
                <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest leading-none mt-1">Dados para Preparação</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Modelo / Nome</p>
                <p className="text-[11px] font-black text-slate-900 uppercase italic truncate">{order.equipmentName || 'Não especidificado'}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Nº de Série</p>
                <p className="text-[11px] font-black text-slate-900 uppercase italic truncate">{order.equipmentSerial || 'S/N'}</p>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm col-span-2">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Família / Categoria Técnica</p>
                <p className="text-[11px] font-black text-indigo-600 uppercase italic">{linkedEquipment?.familyName || 'Padrão'}</p>
              </div>
            </div>

            {linkedEquipment?.description && (
              <div className="bg-white/50 p-4 rounded-2xl border border-slate-100">
                <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Observações do Produto</p>
                <p className="text-[10px] text-slate-600 font-medium leading-relaxed italic">{linkedEquipment.description}</p>
              </div>
            )}
          </div>

          <div className="bg-red-50 border border-red-100 p-6 rounded-[2rem] space-y-2">
            <div className="flex items-center gap-2 text-red-600">
              <AlertCircle size={18} />
              <p className="text-[10px] font-black uppercase tracking-widest">Defeito Reportado</p>
            </div>
            <p className="text-sm font-medium text-red-900 italic leading-relaxed">"{order.description}"</p>
          </div>

          <div className="bg-slate-900 p-6 rounded-[2.5rem] text-white flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-white/10 rounded-2xl"><CalendarDays size={24} /></div>
                <div>
                  <p className="text-[8px] font-black text-white/40 uppercase tracking-widest">Data Programada</p>
                  <p className="text-lg font-black">{new Date(order.scheduledDate + 'T12:00:00').toLocaleDateString('pt-BR')}</p>
                </div>
              </div>
              <StatusBadge status={localStatus} />
            </div>

            {(order.startDate || order.endDate) && (
              <div className="flex gap-6 pt-4 border-t border-white/5">
                {order.startDate && (
                  <div>
                    <p className="text-[7px] font-black text-emerald-400 uppercase tracking-widest">Início (Check-In)</p>
                    <p className="text-xs font-black">{new Date(order.startDate).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</p>
                  </div>
                )}
                {order.endDate && (
                  <div>
                    <p className="text-[7px] font-black text-indigo-400 uppercase tracking-widest">Fim (Check-Out)</p>
                    <p className="text-xs font-black">{new Date(order.endDate).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}</p>
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
                <div className={`p-5 rounded-[2rem] border flex items-center gap-4 mb-4 ${localStatus === OrderStatus.COMPLETED ? 'bg-indigo-50 border-indigo-100' : 'bg-emerald-50 border-emerald-100'}`}>
                  <div className="p-3 bg-white rounded-xl shadow-sm text-indigo-600"><FileText size={20} /></div>
                  <div>
                    <h4 className={`text-[9px] font-black uppercase tracking-widest ${localStatus === OrderStatus.COMPLETED ? 'text-indigo-600' : 'text-emerald-600'}`}>
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
                                  className={`w-full py-5 px-6 rounded-2xl text-xs font-black text-left transition-all border-2 ${selectedVal === opt ? 'bg-indigo-600 border-indigo-700 text-white shadow-xl' : 'bg-gray-50 border-gray-100 text-gray-400'
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
                                          disabled={uploadingFields[field.id]}
                                          onClick={() => handlePhotoUpload(field.id)}
                                          className="h-32 rounded-2xl border-2 border-dashed border-slate-300 flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50 transition-all"
                                        >
                                          {uploadingFields[field.id] ? (
                                            <>
                                              <Loader2 size={24} className="animate-spin text-indigo-600" />
                                              <span className="text-[8px] font-black uppercase tracking-widest text-indigo-600 animate-pulse">Carregando...</span>
                                            </>
                                          ) : (
                                            <>
                                              <Camera size={24} />
                                              <span className="text-[8px] font-black uppercase tracking-widest">Adicionar</span>
                                            </>
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
                                      className="w-full py-8 flex flex-col items-center gap-3 text-slate-400 hover:text-indigo-600 transition-colors"
                                    >
                                      {uploadingFields[field.id] ? (
                                        <div className="flex flex-col items-center gap-2">
                                          <div className="p-4 bg-indigo-50 rounded-full shadow-inner">
                                            <Loader2 size={32} className="animate-spin text-indigo-600" />
                                          </div>
                                          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 animate-pulse">Processando Imagem...</span>
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
              <div className="py-20 flex flex-col items-center justify-center gap-4 text-indigo-600 animate-pulse">
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
              <div className="bg-indigo-50/50 rounded-[2.5rem] p-6 border border-indigo-100 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-indigo-100/50 rounded-xl text-indigo-600">
                    <CheckCircle2 size={20} />
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-indigo-900 uppercase italic">Validação do Cliente</h3>
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Obrigatório para encerramento</p>
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
                        <p className="text-[8px] font-black text-gray-400 uppercase">Documento</p>
                        <p className="text-[11px] font-bold text-slate-900 leading-none mt-1">
                          {answers['Assinatura do Cliente - CPF'] || 'N/D'}
                        </p>
                      </div>
                    </div>
                    {answers['Assinatura do Cliente - Nascimento'] && (
                      <div className="pt-4 border-t border-gray-50">
                        <p className="text-[8px] font-black text-gray-400 uppercase text-center">Data de Nascimento</p>
                        <p className="text-[10px] font-bold text-slate-900 text-center mt-1">{answers['Assinatura do Cliente - Nascimento']}</p>
                      </div>
                    )}
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

                      <div className="space-y-5">
                        <Input
                          label="Documento (CPF) *"
                          placeholder="000.000.000-00"
                          inputMode="numeric"
                          className="rounded-2xl py-5 font-black bg-gray-50 border-gray-100 text-slate-800"
                          value={answers['Assinatura do Cliente - CPF'] || ''}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, "").substring(0, 11);
                            let fmt = v;
                            // 🛡️ Máscara CPF Resiliente
                            if (v.length > 9) fmt = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                            else if (v.length > 6) fmt = v.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
                            else if (v.length > 3) fmt = v.replace(/(\d{3})(\d{0,3})/, "$1.$2");
                            setAnswers(prev => ({ ...prev, 'Assinatura do Cliente - CPF': fmt }));
                          }}
                        />
                        <Input
                          label="Data de Nascimento (Opcional)"
                          placeholder="DD/MM/AAAA"
                          inputMode="numeric"
                          className="rounded-2xl py-5 font-black bg-gray-50 border-gray-100 text-slate-800"
                          value={answers['Assinatura do Cliente - Nascimento'] || ''}
                          onChange={e => {
                            const v = e.target.value.replace(/\D/g, "").substring(0, 8);
                            let fmt = v;
                            // 🛡️ Máscara Data Resiliente
                            if (v.length > 4) fmt = v.replace(/(\d{2})(\d{2})(\d{0,4})/, "$1/$2/$3");
                            else if (v.length > 2) fmt = v.replace(/(\d{2})(\d{0,2})/, "$1/$2");
                            setAnswers(prev => ({ ...prev, 'Assinatura do Cliente - Nascimento': fmt }));
                          }}
                        />
                      </div>
                    </div>

                    <div className="bg-white p-1 rounded-[2.5rem] border-2 border-dashed border-indigo-200">
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

        <div className="p-6 border-t border-gray-100 bg-white sticky bottom-0 z-20 shadow-[0_-10px_30px_rgba(0,0,0,0.05)]">
          {isImpedimentMode ? (
            <div className="flex gap-3">
              <Button variant="ghost" className="flex-1 py-6 rounded-2xl font-black text-sm uppercase text-slate-500" onClick={() => setIsImpedimentMode(false)}>
                Cancelar
              </Button>
              <Button variant="danger" className="flex-[2] py-6 rounded-2xl font-black text-sm uppercase italic shadow-xl flex items-center justify-center gap-2" onClick={validateBlockService} isLoading={loading}>
                <Ban size={20} /> Confirmar Impedimento
              </Button>
            </div>
          ) : localStatus !== OrderStatus.COMPLETED && localStatus !== OrderStatus.BLOCKED && localStatus !== OrderStatus.CANCELED ? (
            localStatus === OrderStatus.IN_PROGRESS ? (
              <Button variant="tech-primary" className="w-full py-6 rounded-2xl font-black text-sm uppercase italic shadow-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98]" onClick={handleFinalizeService} isLoading={loading}>
                <CheckCircle size={22} /> Finalizar e Sincronizar
              </Button>
            ) : (
              <div className="grid grid-cols-[1fr,auto] gap-3">
                <Button variant="primary" className="w-full py-6 rounded-2xl font-black text-sm uppercase italic shadow-xl flex items-center justify-center gap-3 transition-all active:scale-[0.98]" onClick={() => setShowConfirm(true)}>
                  <Play size={22} fill="currentColor" /> Abrir Atendimento
                </Button>
                <Button
                  variant="ghost"
                  className="px-6 rounded-2xl border-2 border-red-100 text-red-500 hover:bg-red-50 hover:border-red-200"
                  onClick={() => setIsImpedimentMode(true)}
                  title="Registrar Impedimento"
                >
                  <Ban size={24} />
                </Button>
              </div>
            )
          ) : (
            <Button variant="secondary" className="w-full py-6 rounded-2xl font-black text-sm uppercase text-slate-400" onClick={onClose}>
              Fechar Visualização
            </Button>
          )}
          <div className="w-full py-5 bg-indigo-50 border border-indigo-100 rounded-2xl text-center">
            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest">Dados Sincronizados com a Central</span>
          </div>
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

      {/* 📸 NEXUS CAMERA MODAL - Preview com Botão de Captura */}
      {showCameraModal && (
        <div className="fixed inset-0 z-[200] bg-black flex flex-col">
          {/* Preview de Vídeo */}
          <div className="flex-1 relative overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="absolute inset-0 w-full h-full object-cover"
            />

            {/* Overlay com Grid de Enquadramento */}
            <div className="absolute inset-0 pointer-events-none">
              <div className="w-full h-full grid grid-cols-3 grid-rows-3 opacity-30">
                {[...Array(9)].map((_, i) => (
                  <div key={i} className="border border-white/30" />
                ))}
              </div>
            </div>
          </div>

          {/* Controles */}
          <div className="bg-black/90 backdrop-blur-xl p-6 flex items-center justify-between border-t border-white/10">
            <button
              onClick={closeCameraModal}
              className="p-4 bg-white/10 text-white rounded-full hover:bg-white/20 transition-colors"
            >
              <X size={24} />
            </button>

            <button
              onClick={capturePhoto}
              className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-2xl active:scale-95 transition-transform border-4 border-white/30"
            >
              <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center">
                <Camera size={32} className="text-white" />
              </div>
            </button>

            <div className="w-16" /> {/* Spacer para centralizar o botão */}
          </div>
        </div>
      )}
    </div>
  );
};
