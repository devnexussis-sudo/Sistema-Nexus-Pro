import React from 'react';
import {
  AlertTriangle, Ban, CheckCircle2, Clock, ClipboardList,
  Loader2, Play, ShieldCheck, Video
} from 'lucide-react';

// ── Helpers ──────────────────────────────────────────────────────
const isVideoUrl = (url: string | null) => {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.includes('.mp4') || lower.includes('.mov') || lower.includes('.webm') ||
    lower.includes('video') || lower.startsWith('data:video');
};

const SYSTEM_KEYS = new Set([
  'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
  'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
  'impediment_reason', 'impediment_photos', 'totalValue', 'price',
  'finishedAt', 'completedAt', 'technical_report', 'parts_used',
  'technicalReport', 'partsUsed', 'blockReason', 'clientDoc',
  'clientName', 'customerName', 'customerAddress', 'tenantId',
  'assignedTo', 'formId', 'billingStatus', 'paymentMethod',
  'extra_photos', 'photos', 'equipment_ids', 'impediment_history',
  'impedimento_tipo', 'impedimento_motivo', 'impedimento_fotos',
  'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo',
  'impediment_at', 'videoUrl', 'video_url',
  'blockedAt', 'blocked_at', 'blockPhotoUrl', 'block_photo_url',
  'impedimentCategory', 'impediment_category',
  'reason', 'block_reason', 'photo', 'photo_url', 'photoUrl', 'attachment', 'attachments',
  'block_date', 'blockDate', 'block_time', 'blockTime', 'impedimentDate', 'impedimentTime',
  'data_hora_impedimento', 'data_impedimento', 'hora_impedimento', 'blocked_date', 'blockedDate',
  'blockPhotoUrls', 'block_photo_urls', 'impedimentResponsible', 'impediment_responsible'
]);
const isSignatureKey = (k: string) =>
  k.toLowerCase().includes('assinatura') || k.toLowerCase().includes('signature') ||
  k.toLowerCase().includes('cpf') || k.toLowerCase().includes('nascimento');

const isMediaValue = (v: any) => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:image') || v.startsWith('data:video'));
const isMediaArray = (v: any) => Array.isArray(v) && v.length > 0 && v.every((i: any) => typeof i === 'string' && (i.startsWith('http') || i.startsWith('data:image') || i.startsWith('data:video')));

const fmtDT = (d?: string) => {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return d; }
};

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string; icon: any }> = {
  completed: { label: 'Concluída', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', icon: CheckCircle2 },
  blocked:   { label: 'Impedida',  color: 'text-rose-700',    bg: 'bg-rose-50',    border: 'border-rose-200',    icon: Ban },
  ongoing:   { label: 'Em Andamento', color: 'text-blue-700', bg: 'bg-blue-50',    border: 'border-blue-200',    icon: Clock },
  paused:    { label: 'Pausada',   color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-200',   icon: Clock },
  pending:   { label: 'Agendada',  color: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200',   icon: Clock },
};

// ── Props ────────────────────────────────────────────────────────
interface VisitFormsTabProps {
  orderVisits: any[];
  selectedOrder: any;
  techs: any[];
  formsTabLoading: boolean;
  formTemplatesAll: any[];
  onImageClick: (url: string) => void;
}

// ── Componente Principal ─────────────────────────────────────────
export const VisitFormsTab: React.FC<VisitFormsTabProps> = ({
  orderVisits, selectedOrder, techs, formsTabLoading, formTemplatesAll, onImageClick,
}) => {

  if (formsTabLoading) {
    return (
      <div className="flex items-center justify-center py-16 gap-3">
        <Loader2 size={22} className="animate-spin text-primary-400" />
        <span className="text-xs font-bold uppercase tracking-widest text-slate-400">Carregando formulários...</span>
      </div>
    );
  }

  // Filtra visitas com atividade (não pendentes sem dados)
  const activeVisits = [...orderVisits]
    .filter(v => ['ongoing', 'completed', 'blocked', 'paused'].includes(v.status) || (v.formData && Object.keys(v.formData).length > 0))
    .sort((a, b) => (a.visitNumber || 0) - (b.visitNumber || 0));

  // Fallback: se não há visitas ativas mas a OS tem formData, mostra direto da OS
  if (activeVisits.length === 0) {
    const osFormData = selectedOrder.formData || {};
    const entries = Object.entries(osFormData)
      .filter(([k]) => !SYSTEM_KEYS.has(k) && !isSignatureKey(k))
      .filter(([, v]) => v !== null && v !== undefined && v !== '' && (Array.isArray(v) ? v.length > 0 : true));

    const isFinishedOrBlocked = selectedOrder.status === 'CONCLUÍDO' || selectedOrder.status === 'IMPEDIDO';
    const hasSystemData = Object.keys(osFormData).some(k => SYSTEM_KEYS.has(k) || isSignatureKey(k));

    if (entries.length === 0 && !isFinishedOrBlocked && !hasSystemData) {
      return (
        <div className="p-20 text-center bg-white border border-slate-200 rounded-lg shadow-sm">
          <ClipboardList className="w-12 h-12 text-slate-100 mx-auto mb-4" />
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Nenhum formulário preenchido</p>
          <p className="text-[11px] text-slate-300 mt-1 font-medium">Aguardando execução das visitas pelo técnico</p>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto">
        <VisitContainer
          visitNumber={1}
          status={selectedOrder.status === 'CONCLUÍDO' ? 'completed' : selectedOrder.status === 'IMPEDIDO' ? 'blocked' : 'ongoing'}
          techName={techs.find(t => t.id === selectedOrder.assignedTo)?.name || 'N/A'}
          arrivalTime={selectedOrder.startDate}
          departureTime={selectedOrder.endDate}
          formData={osFormData}
          formTemplates={formTemplatesAll}
          onImageClick={onImageClick}
        />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Linha do tempo visual */}
      <div className="flex items-center gap-2 px-1 mb-2">
        <ClipboardList size={14} className="text-slate-400" />
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
          {activeVisits.length} visita{activeVisits.length !== 1 ? 's' : ''} com formulário
        </span>
        <div className="flex-1 h-px bg-slate-200" />
      </div>

      {activeVisits.map((visit, idx) => (
        <VisitContainer
          key={visit.id || idx}
          visitNumber={visit.visitNumber || idx + 1}
          status={visit.status}
          techName={techs.find(t => t.id === visit.technicianId)?.name || visit.technicianName || 'N/A'}
          arrivalTime={visit.arrivalTime}
          departureTime={visit.departureTime}
          scheduledDate={visit.scheduledDate}
          scheduledTime={visit.scheduledTime}
          impedimentReason={visit.impedimentReason || visit.pauseReason}
          formData={visit.formData || {}}
          formTemplates={formTemplatesAll}
          onImageClick={onImageClick}
          notes={visit.notes}
        />
      ))}
    </div>
  );
};

// ── Container Individual de Visita ───────────────────────────────
const VisitContainer: React.FC<{
  visitNumber: number;
  status: string;
  techName: string;
  arrivalTime?: string;
  departureTime?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  impedimentReason?: string;
  formData: Record<string, any>;
  formTemplates: any[];
  onImageClick: (url: string) => void;
  notes?: string;
}> = ({ visitNumber, status, techName, arrivalTime, departureTime, scheduledDate, scheduledTime, impedimentReason, formData, formTemplates, onImageClick, notes }) => {

  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const StatusIcon = cfg.icon;

  // Tenta resolver label do template
  const templateLabels: Record<string, string> = {};
  formTemplates.forEach(t => {
    if (t.fields) t.fields.forEach((f: any) => { templateLabels[f.id] = f.label; });
  });

  const resolveLabel = (key: string) => {
    if (templateLabels[key]) return templateLabels[key];
    if (!isNaN(Number(key))) return `Pergunta ${Number(key) + 1}`;
    
    const lowerKey = key.toLowerCase();
    if (lowerKey === 'reason' || lowerKey === 'block_reason' || lowerKey === 'blockreason' || lowerKey === 'impediment_reason') return 'Motivo do Impedimento';
    if (lowerKey === 'photo' || lowerKey === 'photo_url' || lowerKey === 'photourl' || lowerKey === 'block_photo' || lowerKey === 'block_photo_url' || lowerKey === 'blockphotourls' || lowerKey === 'block_photo_urls' || lowerKey === 'attachment' || lowerKey === 'attachments') return 'Anexos';
    if (lowerKey === 'notes' || lowerKey === 'observacao') return 'Observações';
    if (lowerKey.includes('date') && lowerKey.includes('block')) return 'Data do Bloqueio';
    if (lowerKey.includes('time') && lowerKey.includes('block')) return 'Hora do Bloqueio';

    return key.replace(/^(\[.*?\]\s*-\s*)/, '').replace(/_/g, ' ');
  };

  let dynamicImpDate: any = null;
  let dynamicImpReason: any = null;
  let dynamicImpPhotosRaw: any = null;

  // Extrai form entries filtrando system keys
  const entriesRaw = Object.entries(formData)
    .filter(([k]) => !SYSTEM_KEYS.has(k) && !isSignatureKey(k))
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && (Array.isArray(v) ? v.length > 0 : true));

  const entries = entriesRaw.filter(([k, v]) => {
    const label = resolveLabel(k).toLowerCase();
    
    // Remove "Data/Hora do Impedimento" para não repetir no formulário
    const isBlockDate = (label.includes('data') || label.includes('hora')) && 
                        (label.includes('impedimento') || label.includes('block') || label.includes('bloqueio'));
    if (isBlockDate) {
      if (!dynamicImpDate) dynamicImpDate = v;
      return false;
    }

    // Move "Motivo" para o card de impedimento
    const isReason = label === 'reason' || label === 'motivo' || 
                     (label.includes('motivo') && (label.includes('impedimento') || label.includes('bloqueio')));
    if (isReason && status === 'blocked') {
      if (!dynamicImpReason) dynamicImpReason = v;
      return false;
    }

    // Move "Fotos/Anexos" para o card de impedimento
    const isPhoto = label === 'photo' || label === 'anexo' || label === 'evidência' || label === 'foto' || 
                    ((label.includes('foto') || label.includes('anexo') || label.includes('evidência')) && 
                     (label.includes('impedimento') || label.includes('bloqueio')));
    if (isPhoto && status === 'blocked') {
      if (!dynamicImpPhotosRaw || (Array.isArray(dynamicImpPhotosRaw) && dynamicImpPhotosRaw.length === 0)) dynamicImpPhotosRaw = v;
      return false;
    }

    return true;
  });

  // Dados especiais
  const techReport = formData.technicalReport || formData.technical_report;
  const partsUsed = formData.partsUsed || formData.parts_used;
  const clientName = formData.clientName;
  const clientDoc = formData.clientDoc;
  const signatureUrl = formData.signature;
  const extraPhotos = (() => {
    const raw = formData.extra_photos || formData.extraPhotos || formData.photos || [];
    const arr = Array.isArray(raw) ? raw : (typeof raw === 'string' ? [raw] : []);
    return arr.filter((p: string) => typeof p === 'string' && (p.startsWith('http') || p.startsWith('data:image')));
  })();
  const videoUrl = formData.videoUrl || formData.video_url;

  // Impediment data
  const impType = formData.impedimento_tipo;
  const impReason = impedimentReason || formData.impedimento_motivo || formData.impediment_reason || formData.blockReason || formData.block_reason || formData.reason || dynamicImpReason;
  const impPhotosRaw = formData.impedimento_fotos || formData.impediment_photos || formData.blockPhotoUrl || formData.block_photo_url || formData.blockPhotoUrls || formData.block_photo_urls || formData.photo_url || formData.photoUrl || formData.photo || formData.attachment || formData.attachments || dynamicImpPhotosRaw || [];
  const impPhotos = Array.isArray(impPhotosRaw) ? impPhotosRaw : (typeof impPhotosRaw === 'string' && impPhotosRaw.startsWith('http') ? [impPhotosRaw] : []);
  const impDate = formData.impediment_at || formData.blockedAt || formData.blocked_at || formData.blockDate || formData.block_date || formData.data_hora_impedimento || formData.data_impedimento || dynamicImpDate;
  const impParts = formData.impedimento_peca_nome ? {
    nome: formData.impedimento_peca_nome,
    modelo: formData.impedimento_peca_modelo,
    codigo: formData.impedimento_peca_codigo,
  } : null;

  return (
    <div className={`bg-white border ${cfg.border} rounded-xl shadow-lg shadow-slate-100/80 overflow-hidden transition-all`}>
      {/* ── Header da Visita ── */}
      <div className={`flex items-center gap-3 px-5 py-3.5 border-b ${cfg.border} ${cfg.bg}`}>
        {/* Número da visita */}
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-sm border ${cfg.border} bg-white ${cfg.color}`}>
          {visitNumber}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-xs font-black text-slate-800 uppercase tracking-wider">Visita nº {visitNumber}</p>
            <span className={`text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-md border ${cfg.bg} ${cfg.color} ${cfg.border} flex items-center gap-1`}>
              <StatusIcon size={10} />
              {cfg.label}
            </span>
          </div>
          <p className="text-[10px] text-slate-400 font-semibold mt-0.5">
            Técnico: <span className="text-slate-600">{techName}</span>
            {scheduledDate && <> · Agendada: {fmtDT(scheduledDate + (scheduledTime ? `T${scheduledTime}` : ''))}</>}
          </p>
        </div>

        {/* Timestamps */}
        <div className="flex gap-4 shrink-0">
          {arrivalTime && (
            <div className="text-right">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Check-in</p>
              <p className="text-[11px] font-bold text-slate-700">{fmtDT(arrivalTime)}</p>
            </div>
          )}
          {departureTime && (
            <div className="text-right">
              <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">
                {status === 'blocked' ? 'Bloqueio' : 'Conclusão'}
              </p>
              <p className="text-[11px] font-bold text-slate-700">{fmtDT(departureTime)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Corpo: Respostas do Formulário ── */}
      <div className="divide-y divide-slate-50">
        {entries.length === 0 && !techReport && status === 'blocked' && !arrivalTime ? (
          /* Impedimento PRÉ-EXECUÇÃO: técnico bloqueou antes de iniciar o serviço */
          <div className="px-6 py-8 text-center">
            <Ban size={20} className="mx-auto text-rose-300 mb-2" />
            <p className="text-[11px] text-slate-500 font-semibold">Impedimento registrado antes do início do atendimento</p>
            <p className="text-[10px] text-slate-400 mt-0.5">Nenhum formulário foi preenchido nesta visita</p>
          </div>
        ) : entries.length === 0 && !techReport ? (
          <div className="px-6 py-10 text-center">
            <p className="text-[11px] text-slate-400 font-medium">Nenhuma resposta registrada nesta visita</p>
          </div>
        ) : (
          <>
            {/* Respostas do checklist */}
            {entries.map(([key, val]) => (
              <div key={key} className="px-5 py-3 flex justify-between gap-4 items-center hover:bg-slate-50/50 transition-colors">
                <p className="text-[13px] font-medium text-slate-700 flex-1">{resolveLabel(key)}</p>
                <FormValueDisplay value={val} onImageClick={onImageClick} />
              </div>
            ))}

            {/* Relatório Técnico */}
            {techReport && (
              <div className="px-5 py-4">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Relatório Técnico</p>
                <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap bg-indigo-50/50 p-3 rounded-md border border-indigo-100">{techReport}</p>
              </div>
            )}

            {/* Peças Utilizadas */}
            {partsUsed && (
              <div className="px-5 py-4">
                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Peças Utilizadas</p>
                <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap bg-indigo-50/50 p-3 rounded-md border border-indigo-100">{partsUsed}</p>
              </div>
            )}

            {/* Observações */}
            {notes && (
              <div className="px-5 py-4">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Observações do Técnico</p>
                <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap bg-slate-50 p-3 rounded-md border border-slate-100">{notes}</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Bloco de Impedimento (se blocked) ── */}
      {status === 'blocked' && (
        <div className="border-t border-rose-200 bg-gradient-to-r from-rose-50 to-orange-50">
          <div className="px-5 py-3 flex items-center gap-2 border-b border-rose-100">
            <AlertTriangle size={13} className="text-rose-500" />
            <span className="text-[10px] font-black text-rose-700 uppercase tracking-widest">Dados do Impedimento</span>
            {impDate && (
              <span className="ml-auto text-[9px] font-bold text-rose-500 bg-white border border-rose-200 rounded-md px-2 py-0.5">
                {fmtDT(impDate)}
              </span>
            )}
          </div>
          <div className="px-5 py-4 space-y-3">
            {impType && (
              <div className="flex items-center gap-3">
                <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest min-w-[100px]">Tipo de Impedimento</span>
                <span className="text-sm font-bold text-slate-800">{impType}</span>
              </div>
            )}
            {impReason && (
              <div>
                <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Motivo</span>
                <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap bg-white p-3 rounded-md border border-rose-100 mt-1">{impReason}</p>
              </div>
            )}
            {!impReason && !impType && (
              <p className="text-[11px] text-rose-500 font-medium italic">Impedimento registrado sem motivo detalhado</p>
            )}
            {impParts && (
              <div>
                <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Peça Solicitada</span>
                <div className="bg-white p-3 rounded-md border border-rose-100 grid grid-cols-3 gap-3 mt-1">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Nome</p>
                    <p className="text-sm font-bold text-slate-800">{impParts.nome}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Modelo</p>
                    <p className="text-sm font-bold text-slate-800">{impParts.modelo || '—'}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase">Código</p>
                    <p className="text-sm font-bold text-slate-800">{impParts.codigo || '—'}</p>
                  </div>
                </div>
              </div>
            )}
            {impPhotos.length > 0 && (
              <div>
                <span className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Evidências Fotográficas</span>
                <div className="flex flex-wrap gap-3 mt-2">
                  {impPhotos.map((url: string, i: number) => (
                    <div key={i} className="w-20 h-20 rounded-lg overflow-hidden border border-rose-100 cursor-zoom-in hover:shadow-md transition-all" onClick={() => onImageClick(url)}>
                      <img src={url} alt={`Evidência ${i + 1}`} className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Bloco de Assinatura e Anexos (se concluída) ── */}
      {(signatureUrl || clientName || extraPhotos.length > 0 || videoUrl) && (
        <div className="border-t border-indigo-100 bg-gradient-to-r from-indigo-50/50 to-violet-50/50">
          <div className="px-5 py-3 flex items-center gap-2 border-b border-indigo-100">
            <ShieldCheck size={13} className="text-indigo-500" />
            <span className="text-[10px] font-black text-indigo-700 uppercase tracking-widest">Dados de Conclusão</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            {/* Nome e Documento do cliente */}
            {(clientName || clientDoc) && (
              <div className="flex gap-8">
                {clientName && (
                  <div>
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Responsável</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{clientName}</p>
                  </div>
                )}
                {clientDoc && (
                  <div>
                    <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest">Documento</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5 font-mono">{clientDoc}</p>
                  </div>
                )}
              </div>
            )}

            {/* Assinatura */}
            {signatureUrl && (
              <div>
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-1">Assinatura Coletada</p>
                <div
                  className="h-14 w-36 bg-white border border-indigo-100 rounded-lg flex items-center justify-center p-1.5 cursor-zoom-in hover:shadow-lg transition-all"
                  onClick={() => onImageClick(signatureUrl)}
                >
                  <img src={signatureUrl} className="max-h-full max-w-full object-contain mix-blend-multiply" alt="Assinatura" />
                </div>
              </div>
            )}

            {/* Vídeo */}
            {videoUrl && (
              <div>
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2 flex items-center gap-1"><Video size={10} /> Vídeo de Evidência</p>
                <div
                  className="w-24 h-24 rounded-lg overflow-hidden border border-indigo-100 bg-black cursor-zoom-in hover:shadow-md transition-all relative"
                  onClick={() => onImageClick(videoUrl)}
                >
                  <video src={videoUrl} className="w-full h-full object-cover opacity-60" preload="metadata" />
                  <div className="absolute inset-0 flex items-center justify-center"><Play size={16} className="text-white fill-white" /></div>
                </div>
              </div>
            )}

            {/* Fotos extras */}
            {extraPhotos.length > 0 && (
              <div>
                <p className="text-[9px] font-black text-indigo-400 uppercase tracking-widest mb-2">Anexos de Conclusão</p>
                <div className="flex flex-wrap gap-3">
                  {extraPhotos.map((url: string, i: number) => (
                    <div key={i} className="w-20 h-20 rounded-lg overflow-hidden border border-indigo-100 bg-white cursor-zoom-in hover:shadow-md transition-all" onClick={() => onImageClick(url)}>
                      <img src={url} className="w-full h-full object-cover" alt={`Anexo ${i + 1}`} />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Renderizador Inteligente de Valores ───────────────────────────
const FormValueDisplay: React.FC<{ value: any; onImageClick: (url: string) => void }> = ({ value, onImageClick }) => {
  const isOk = typeof value === 'string' && (value.toLowerCase() === 'ok' || value.toLowerCase() === 'sim');

  if (isMediaValue(value)) {
    return (
      <div className="relative group cursor-zoom-in" onClick={() => onImageClick(value)}>
        {isVideoUrl(value) ? (
          <div className="w-12 h-12 rounded-md bg-black flex items-center justify-center border border-slate-200 overflow-hidden relative">
            <video src={value} className="w-full h-full object-cover opacity-50" />
            <Play size={10} className="text-white fill-white absolute" />
            <div className="absolute bottom-0 right-0 bg-black/60 px-0.5 rounded-tl text-[6px] text-white font-bold">MP4</div>
          </div>
        ) : (
          <img src={value} className="w-12 h-12 rounded-md object-cover border border-slate-200" alt="foto" />
        )}
      </div>
    );
  }

  if (isMediaArray(value)) {
    return (
      <div className="flex gap-2">
        {(value as string[]).map((media, i) => (
          <div key={i} className="relative group cursor-zoom-in" onClick={() => onImageClick(media)}>
            {isVideoUrl(media) ? (
              <div className="w-12 h-12 rounded-md bg-black flex items-center justify-center border border-slate-200 overflow-hidden relative">
                <video src={media} className="w-full h-full object-cover opacity-50" />
                <Play size={10} className="text-white fill-white absolute" />
              </div>
            ) : (
              <img src={media} className="w-12 h-12 rounded-md object-cover border border-slate-200" alt="foto" />
            )}
          </div>
        ))}
      </div>
    );
  }

  // Valor de texto
  const displayValue = Array.isArray(value) ? String(value).replace(/,/g, ', ') : String(value);
  return (
    <div className={`text-[11px] font-bold uppercase px-2.5 py-1 rounded-md border min-w-[60px] text-center ${isOk ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
      {displayValue}
    </div>
  );
};
