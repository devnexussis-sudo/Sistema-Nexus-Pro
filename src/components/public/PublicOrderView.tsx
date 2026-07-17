import {
  Box,
  Calendar,
  CheckCircle2,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight,
  ClipboardList,
  Clock,
  DollarSign,
  FileText,
  Globe,
  Hexagon,
  MapPin,
  Mail,
  Package,
  Phone,
  Play,
  Printer,
  ShieldAlert,
  Tag,
  User as UserIcon,
  Video,
  Wrench
} from 'lucide-react';
import React, { useState } from 'react';
import { supabase } from '../../lib/supabase';
import { DataService } from '../../services/dataService';
import { ServiceOrder, User } from '../../types';
import { NexusBranding } from '../ui/NexusBranding';

interface PublicOrderViewProps {
  order: ServiceOrder | null;
  techs: User[];
  isPrint?: boolean;
  tenantProp?: any;
}

const isVideoUrl = (url: string | null) => {
  if (!url) return false;
  const videoExtensions = ['.mp4', '.mov', '.avi', '.wmv', '.flv', '.webm', '.mkv', '.3gp'];
  return videoExtensions.some(ext => url.toLowerCase().includes(ext)) || url.toLowerCase().startsWith('data:video/');
};

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; color?: string }> = ({
  icon, title, color = 'text-[#1c2d4f]'
}) => (
  <div className="flex items-center gap-3 pb-4 border-b border-slate-100 mb-6 font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center bg-slate-100 ${color} shadow-sm border border-slate-200/50`}>
      {icon}
    </div>
    <h3 className={`text-sm uppercase tracking-[0.1em] ${color}`}>{title}</h3>
  </div>
);

const InfoPill: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex flex-col gap-1.5 font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
    <span className="text-xs text-slate-500 uppercase tracking-wide px-0.5">{label}</span>
    <div className="bg-slate-50/50 rounded-lg px-2 py-1.5 border border-slate-100/50">
       <span className={`text-sm text-slate-800 ${mono ? '' : 'uppercase'}`}>{value || '—'}</span>
    </div>
  </div>
);
// ─────────────────────────────────────────────────────────────────────────────
// Utilities de formatação segura de datas (BigTech timezone-safe)
//
// REGRA DE OURO:
//   • Datas puras (YYYY-MM-DD, ou T00:00:00) → extrair direto da string
//     para evitar que new Date('2026-05-04T00:00:00Z') vire 03/05 no UTC-3.
//   • Timestamps reais (com hora ≠ 00:00:00) → usar new Date() +
//     timeZone:'America/Sao_Paulo' para converter UTC → horário local correto.
// ─────────────────────────────────────────────────────────────────────────────
const BR_TZ = 'America/Sao_Paulo';

/** Detecta se a string é uma data sem hora significativa (date-only). */
const isDateOnly = (d: string): boolean => {
  // "2026-05-04" — sem T nem espaço
  if (!/[T\s]/.test(d)) return true;
  // "2026-05-04T00:00:00", "2026-05-04T00:00:00.000Z", "2026-05-04 00:00:00+00"
  return /[T\s]00:00:00/.test(d);
};

/**
 * Formata só a data (DD/MM/YYYY).
 * Date-only → extrai direto da string.
 * Timestamp real → converte com timezone de São Paulo.
 */
export const safeFormatDate = (d?: string) => {
  if (!d) return '—';
  if (isDateOnly(d)) {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const obj = new Date(d);
  if (!isNaN(obj.getTime())) return obj.toLocaleDateString('pt-BR', { timeZone: BR_TZ });
  return d;
};

/**
 * Formata data + hora (DD/MM/YYYY HH:mm).
 * Date-only → retorna só a data extraída da string.
 * Timestamp real → converte com timezone de São Paulo.
 */
const safeFmtDT = (d?: string) => {
  if (!d) return '—';
  if (isDateOnly(d)) {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  }
  const obj = new Date(d);
  if (!isNaN(obj.getTime())) {
    return obj.toLocaleString('pt-BR', {
      timeZone: BR_TZ,
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
  return d;
};

/**
 * Formata só a hora (HH:mm).
 * Sempre converte com timezone de São Paulo (timestamps de check-in/out são reais).
 */
const safeFmtTime = (d?: string) => {
  if (!d) return '—';
  const obj = new Date(d);
  if (!isNaN(obj.getTime())) {
    return obj.toLocaleTimeString('pt-BR', { timeZone: BR_TZ, hour: '2-digit', minute: '2-digit' });
  }
  return '—';
};

const VisitCard: React.FC<{
  visit: any;
  idx: number;
  order: ServiceOrder;
  linkedEquipments: any[];
  formTemplates: Record<string, string[]>;
  showPrices: boolean;
  onImageClick: (url: string, contextUrls?: string[]) => void;
}> = ({ visit, idx, order, linkedEquipments, formTemplates, showPrices, onImageClick }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  
  const visitData = typeof visit.form_data === 'string' ? JSON.parse(visit.form_data) : (visit.form_data || {});
  const visitorName = visit.technician_name || 'Técnico';
  const isCompleted = visit.status === 'completed';

  const extractVisitPhotos = (fd: any) => {
    const extras = fd.extra_photos || fd.extraPhotos || fd.photos || [];
    const photosArr = Array.isArray(extras) ? extras : (typeof extras === 'string' ? [extras] : []);
    return photosArr.filter((p: any) => typeof p === 'string' && (p.startsWith('http') || p.startsWith('data:image')));
  };
  const visitPhotos = extractVisitPhotos(visitData);

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/40 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 sm:px-8 py-5 flex items-center justify-between bg-slate-50/50 border-b border-slate-100 hover:bg-slate-100/50 transition-colors group"
      >
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            visit.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : 
            visit.status === 'blocked' ? 'bg-rose-50 text-rose-600' :
            'bg-amber-50 text-amber-600'
          }`}>
            {visit.status === 'blocked' ? <ShieldAlert size={18} /> : <Calendar size={18} />}
          </div>
          <div className="text-left">
            <p className="text-xs text-slate-400 uppercase tracking-widest">Visita #{idx + 1}</p>
            <p className="text-sm text-slate-900 uppercase">
              {safeFormatDate(visit.scheduled_date || visit.created_at)}
              {visit.scheduled_time && ` às ${visit.scheduled_time.slice(0, 5)}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`px-3 py-1 rounded-full text-[10px] uppercase tracking-widest border ${
            visit.status === 'completed' ? 'bg-emerald-100/50 text-emerald-700 border-emerald-200' : 
            visit.status === 'blocked' ? 'bg-red-100/50 text-red-700 border-red-200' :
            visit.status === 'paused' ? 'bg-amber-100/50 text-amber-700 border-amber-200' :
            visit.status === 'pending' ? 'bg-slate-100/50 text-slate-700 border-slate-200' :
            'bg-blue-100/50 text-blue-700 border-blue-200'
          }`}>
            {visit.status === 'completed' ? 'Concluído' : 
             visit.status === 'blocked' ? ((visit.arrival_time || visitData?.checkinLocation?.timestamp) ? 'Impedido Após Atendimento' : 'Impedido Antes do Início') : 
             visit.status === 'paused' ? 'Pausado' : 
             visit.status === 'pending' ? 'Agendada' :
             'Em Andamento'}
          </div>
          <div className="text-slate-400 group-hover:text-[#1c2d4f] transition-all">
            {isOpen ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="p-6 sm:p-8 space-y-6 animate-in zoom-in-95 duration-200">
          {/* Dados do técnico e horários */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {(() => {
              const effArrival = visit.arrival_time || visitData?.checkinLocation?.timestamp || (idx === 0 ? order.startDate : null);
              const effDeparture = visit.departure_time || visitData?.checkoutLocation?.timestamp || (idx === 0 ? order.endDate : null);
              return (
                <>
                  <InfoPill label="Técnico" value={visitorName} />
                  <InfoPill label="Check-in" value={effArrival ? safeFmtTime(effArrival) : '—'} />
                  <InfoPill label="Check-out" value={effDeparture ? safeFmtTime(effDeparture) : '—'} />
                  {effDeparture && effArrival && (() => {
                    const totalMins = Math.max(0, Math.floor((new Date(effDeparture).getTime() - new Date(effArrival).getTime()) / 60000));
                    let durationStr = `${totalMins} min`;
                    if (totalMins > 59) {
                      const hrs = Math.floor(totalMins / 60);
                      const mins = totalMins % 60;
                      durationStr = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
                    }
                    return <InfoPill label="Duração" value={durationStr} />;
                  })()}
                </>
              );
            })()}
          </div>

          {/* O Relatório Técnico e as Peças foram movidos para baixo dos formulários (Agrupamento por Equipamento) */}

          {/* Agrupamento por Equipamento dentro desta Visita */}
          {(() => {
            const groups: Record<string, Record<string, any>> = {};
            const internalSystemKeys = new Set([
              'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
              'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
              'impediment_reason', 'impediment_photos', 'impedimento_tipo', 'impedimento_motivo', 'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo', 'impedimento_fotos', 'impediment_at', 'totalValue', 'price', 'execution_forms',
              'finishedAt', 'completedAt', 'technical_report', 'parts_used',
              'technicalReport', 'partsUsed', 'blockReason', 'clientDoc',
              'clientName', 'customerName', 'customerAddress', 'tenantId',
              'assignedTo', 'formId', 'billingStatus', 'paymentMethod',
              'extra_photos', 'photos', 'equipment_ids', 'videoUrl', 'video_url'
            ]);

            Object.entries(visitData).forEach(([key, val]) => {
              if (internalSystemKeys.has(key) || key.toLowerCase().includes('assinatura')) return;
              const match = key.match(/^\[(.*?)\]\s*(?:-|$)/);
              const groupName = match ? match[1] : 'Relatório de Atendimento';
              if (!groups[groupName]) groups[groupName] = {};
              groups[groupName][key] = val;
            });

            // Sort: Financeiro sempre primeiro, Técnico segundo, Relatório de Atendimento por último
            const groupSortPriority = (name: string): number => {
              const n = name.toLowerCase();
              if (n.endsWith('financeiro') || n.includes('- financeiro')) return 0;
              if (n.endsWith('técnico') || n.includes('- técnico') || n.endsWith('tecnico') || n.includes('- tecnico')) return 1;
              if (n === 'relatório de atendimento') return 99;
              return 50;
            };
            return Object.entries(groups).sort((a, b) => {
              const pa = groupSortPriority(a[0]);
              const pb = groupSortPriority(b[0]);
              if (pa !== pb) return pa - pb;
              return a[0].localeCompare(b[0]);
            }).map(([groupName, groupData]) => {
              const eq = linkedEquipments.find(e => {
                const eName = (e.equipment_name || e.equipmentName || '').toLowerCase();
                const gn = groupName.toLowerCase();
                return gn.includes(eName) || eName.includes(gn);
              });

              const isFinanceiro = groupName.toLowerCase().includes('financeiro');
              const isTecnico = groupName.toLowerCase().includes('técnico') || groupName.toLowerCase().includes('tecnico');
              const eqDisplayName = eq ? (eq.equipment_name || eq.equipmentName) : groupName.replace(/\s*-\s*(Financeiro|Técnico|Tecnico)\s*$/i, '').replace(/^.*?\]\s*-?\s*/, '');
              let displayTitle = isFinanceiro ? 'Financeiro Geral' : eqDisplayName;

              const formTypeBadge = isFinanceiro
                ? <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200 ml-1.5">Financeiro</span>
                : isTecnico
                ? <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase tracking-widest px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200 ml-1.5">Técnico</span>
                : null;

              return (
                <div key={groupName} className="mt-4 first:mt-0">
                  <CollapsibleFormSection
                    formData={groupData}
                    order={{ ...order, templateFields: formTemplates[eq?.form_id || visit.form_id || order.formId] || [] } as any}
                    onImageClick={onImageClick}
                    title={displayTitle}
                    titleBadge={formTypeBadge}
                    subtitle={(eq && !isFinanceiro) ? `S/N: ${eq.equipment_serial || eq.equipmentSerial}` : `Registros da Visita #${idx + 1}`}
                    icon={<Package size={16} />}
                    showPrices={showPrices}
                  />
                </div>
              );
            });
          })()}

          {/* Assinatura do responsável pelo impedimento */}
          {visit.status === 'blocked' && (visitData.impediment_responsible || visitData.impediment_signature) && (
            <div className="mt-6 border border-red-100 bg-red-50/40 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-red-100/60 px-4 py-3 border-b border-red-100">
                <p className="text-xs text-red-700 uppercase tracking-widest">Cliente / Responsável por acompanhar o atendimento</p>
              </div>
              <div className="p-4 sm:p-5 flex flex-col items-start gap-3">
                {visitData.impediment_responsible && (
                  <p className="text-sm text-slate-800 uppercase">{visitData.impediment_responsible}</p>
                )}
                {visitData.impediment_signature && (
                  <div
                    className="w-full sm:w-64 h-28 bg-white rounded-xl border border-red-200 flex items-center justify-center p-2 cursor-zoom-in hover:border-red-400/40 transition-colors"
                    onClick={() => onImageClick(visitData.impediment_signature)}
                  >
                    <img
                      src={visitData.impediment_signature}
                      className="max-h-full max-w-full object-contain mix-blend-multiply"
                      alt="Assinatura do responsável"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Relatório Técnico, Peças e Evidências da Visita */}
          {(visitData.technical_report || visitData.technicalReport || visit.notes || visitData.parts_used || visitData.partsUsed || visitPhotos.length > 0 || visitData.videoUrl || visitData.video_url) && (
            <div className="mt-6 border border-slate-200 bg-slate-50/50 rounded-2xl overflow-hidden shadow-sm">
              <div className="bg-slate-100 px-4 py-3 border-b border-slate-200">
                <p className="text-xs text-slate-600 uppercase tracking-widest">Relatório de Atendimento da Visita</p>
              </div>
              <div className="p-4 sm:p-5 space-y-5">
                
                {/* Relato do Técnico */}
                {(visitData.technical_report || visitData.technicalReport || visit.notes) && (
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-1.5">Relato do Técnico</p>
                    <div className="p-3 bg-white rounded-xl border border-slate-200">
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {visitData.technical_report || visitData.technicalReport || visit.notes}
                      </p>
                    </div>
                  </div>
                )}

                {/* Peças Utilizadas */}
                {(visitData.parts_used || visitData.partsUsed) && (
                  <div>
                    <p className="text-[10px] text-amber-600/70 uppercase tracking-widest mb-1.5">Peças e Materiais Utilizados</p>
                    <div className="p-3 bg-amber-50/50 rounded-xl border border-amber-100">
                      <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {visitData.parts_used || visitData.partsUsed}
                      </p>
                    </div>
                  </div>
                )}

                {/* Fotos e Vídeos */}
                {(visitPhotos.length > 0 || visitData.videoUrl || visitData.video_url) && (() => {
                  const rawVid = visitData.videoUrl || visitData.video_url || '';
                  const vidArr = typeof rawVid === 'string' ? rawVid.split(',').map(u => u.trim()).filter(Boolean) : [];
                  const allMedia = [
                    ...vidArr,
                    ...visitPhotos
                  ];
                  return (
                    <div className={(visitData.technical_report || visitData.technicalReport || visit.notes || visitData.parts_used || visitData.partsUsed) ? "pt-2 border-t border-slate-200 mt-2" : ""}>
                      <p className="text-[10px] text-slate-400 uppercase tracking-widest mb-3">Anexos e Evidências</p>
                      <div className="flex flex-wrap gap-3">
                        {vidArr.map((vUrl: string, vI: number) => (
                          <div
                            key={`vid-${vI}`}
                            className="w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] shrink-0 rounded-xl overflow-hidden border border-slate-200 bg-black cursor-zoom-in group hover:shadow-md transition-all active:scale-95 relative"
                            onClick={() => onImageClick(vUrl, allMedia)}
                          >
                            <video src={`${vUrl}#t=0.1`} preload="metadata" className="w-full h-full object-cover opacity-60" />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Play size={16} className="text-white fill-white group-hover:scale-110 transition-transform" />
                            </div>
                          </div>
                        ))}
                        {visitPhotos.map((url: string, pIdx: number) => (
                          <div
                            key={pIdx}
                            className="w-[80px] h-[80px] sm:w-[100px] sm:h-[100px] shrink-0 rounded-xl overflow-hidden border border-slate-200 bg-white cursor-zoom-in hover:shadow-md transition-all active:scale-95 relative"
                            onClick={() => onImageClick(url, allMedia)}
                          >
                            {isVideoUrl(url) ? (
                              <div className="w-full h-full bg-black relative flex items-center justify-center">
                                <video src={`${url}#t=0.1`} preload="metadata" className="w-full h-full object-cover opacity-60" />
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <Play size={16} className="text-white fill-white group-hover:scale-110 transition-transform" />
                                </div>
                              </div>
                            ) : (
                              <img src={url} className="w-full h-full object-cover group-hover:scale-105 transition-transform" alt={`Anexo ${pIdx + 1}`} />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          )}

          {/* Assinatura Digital da Visita */}
          {(() => {
            const sigKey = Object.keys(visitData).find(k => k.toLowerCase().includes('assinatura') && typeof visitData[k] === 'string' && visitData[k].startsWith('http'));
            const sigNameKey = Object.keys(visitData).find(k => k.toLowerCase().includes('assinatura') && k.toLowerCase().includes('nome'));
            const sigDocKey = Object.keys(visitData).find(k => k.toLowerCase().includes('assinatura') && (k.toLowerCase().includes('documento') || k.toLowerCase().includes('cpf')));
            
            const sigUrl = sigKey ? visitData[sigKey] : null;
            const sigName = sigNameKey ? visitData[sigNameKey] : (visitData.signatureName || '');
            const sigDoc = sigDocKey ? visitData[sigDocKey] : (visitData.signatureDoc || '');

            if (!sigUrl) return null;

            return (
              <div className="pt-4 border-t border-slate-100 mt-4">
                <p className="text-[10px] text-slate-400 uppercase tracking-[0.2em] mb-3">Auditoria Digital da Visita</p>
                <div className="flex flex-col items-center gap-4 bg-slate-50/50 p-4 rounded-2xl border border-slate-100">
                  <div className="text-center w-full">
                    <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Responsável pela Validação</p>
                    <p className="text-sm text-slate-900 uppercase">{sigName || 'NOME NÃO INFORMADO'}</p>
                    {sigDoc && <p className="text-[10px] text-slate-400 mt-1">DOC: {sigDoc}</p>}
                  </div>
                  <div 
                    className="w-full sm:w-64 h-28 bg-white rounded-xl border border-slate-200 flex items-center justify-center p-2 cursor-zoom-in group mt-1"
                    onClick={() => onImageClick(sigUrl)}
                  >
                    <img src={sigUrl} className="max-h-full max-w-full object-contain mix-blend-multiply group-hover:scale-105 transition-transform" alt="Assinatura da Visita" />
                  </div>
                  <div className="mt-1 text-[9px] text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md inline-block uppercase tracking-wider">
                    Autenticado via Nexus Mobile
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
};

const formatPublicValue = (val: string) => {
  if (typeof val !== 'string') return val;
  // Detecta timestamps ISO completos e formata com timezone seguro
  const isoDateRegex = /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/;
  if (isoDateRegex.test(val)) {
    return safeFmtDT(val);
  }
  return val;
};

const resolvePublicLabel = (key: string) => {
  let cleanKey = key.replace(/^\[.*?\]\s*-\s*/, '');
  
  const prefixMatch = cleanKey.match(/^(\d{3})#(.*)/);
  if (prefixMatch) {
    cleanKey = `#${prefixMatch[1]} - ${prefixMatch[2].trim()}`;
  }

  if (!isNaN(Number(cleanKey)) && cleanKey.trim() !== '') return `Pergunta nº ${cleanKey}`;
  
  const lowerKey = cleanKey.toLowerCase();
  if (lowerKey === 'blockedat' || lowerKey === 'blocked_at') return 'Data/Hora do Impedimento';
  if (lowerKey === 'blockphotourls' || lowerKey === 'block_photo_urls' || lowerKey === 'block_photo' || lowerKey === 'blockphotourl' || lowerKey === 'block_photo_url') return 'Fotos do Impedimento';
  if (lowerKey === 'blockreason' || lowerKey === 'block_reason' || lowerKey === 'reason' || lowerKey === 'impediment_reason') return 'Motivo do Impedimento';
  if (lowerKey === 'impedimentresponsible' || lowerKey === 'impediment_responsible') return 'Cliente / responsável por acompanhar o atendimento';
  if (lowerKey === 'impedimentcategory' || lowerKey === 'impediment_category') return 'Categoria do Impedimento';
  if (lowerKey === 'impediment_signature' || lowerKey === 'impedimentsignature' || lowerKey === 'signature' || lowerKey === 'client_signature' || lowerKey === 'signature_url') return 'Assinatura do cliente ou responsável';
  if (lowerKey === 'notes' || lowerKey === 'observacao') return 'Observações';
  if (lowerKey === 'photo' || lowerKey === 'photo_url' || lowerKey === 'photourl' || lowerKey === 'attachment' || lowerKey === 'attachments') return 'Anexos';
  
  return cleanKey;
};

const CollapsibleFormSection: React.FC<{
  formData: Record<string, any>;
  order: ServiceOrder;
  onImageClick: (url: string, contextUrls?: string[]) => void;
  title?: string;
  titleBadge?: React.ReactNode;
  subtitle?: string;
  icon?: React.ReactNode;
  parts?: any[];
  showPrices?: boolean;
}> = ({ formData, order, onImageClick, title = "Formulário Técnico", titleBadge, subtitle, icon, parts, showPrices }) => {
  const [isOpen, setIsOpen] = useState(false);

  const SYSTEM_KEYS = new Set([
    'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
    'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
    'impediment_reason', 'impediment_photos', 'impedimento_tipo', 'impedimento_motivo', 'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo', 'impedimento_fotos', 'impediment_at', 'totalValue', 'price', 'execution_forms',
    'finishedAt', 'completedAt', 'technical_report', 'parts_used',
    'technicalReport', 'partsUsed', 'blockReason', 'clientDoc',
    'clientName', 'customerName', 'customerAddress', 'tenantId',
    'assignedTo', 'formId', 'billingStatus', 'paymentMethod',
    'extra_photos', 'photos', 'equipment_ids'
  ]);

  const isSignatureKey = (k: string) =>
    k.toLowerCase().includes('assinatura') ||
    k.toLowerCase().includes('signature') ||
    k.toLowerCase().includes('cpf') ||
    k.toLowerCase().includes('nascimento');

  const isImageVal = (v: any) =>
    typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('data:video') || v.startsWith('http'));

  // Monta lista de itens do formulário: cada item pode ter texto e/ou fotos
  // Preserva a ORDEM original das perguntas via template (se disponível)
  const templateFields = (order as any).templateFields as string[] || [];
  
  let formItems = Object.entries(formData)
    .filter(([key]) => !SYSTEM_KEYS.has(key) && !isSignatureKey(key))
    .map(([key, val]) => {
      let text: string | null = null;
      let photos: string[] = [];

      if (Array.isArray(val)) {
        // Arrays podem ter mix de strings e fotos
        const textParts = val.filter((v: any) => typeof v === 'string' && !isImageVal(v));
        photos = val.filter((v: any) => isImageVal(v));
        if (textParts.length > 0) text = textParts.join(', ');
      } else if (isImageVal(val)) {
        photos = [val as string];
      } else if (val !== null && val !== undefined && val !== '') {
        text = String(val);
      }

      return { key, text, photos };
    })
    .filter(({ text, photos }) => text !== null || photos.length > 0);

  // 🎯 ORDENAÇÃO CIRÚRGICA: Tenta via #001 primeiro, depois usa templateFields
  const normalize = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^[\d\s.]*/, '').replace(/[^a-z0-9]/g, '');
  const normalizedTemplate = (templateFields || []).map(normalize);
  
  // Garante estabilidade anotando índice original
  formItems.forEach((item, idx) => { (item as any).originalIdx = idx; });

  formItems.sort((a, b) => {
    const matchA = a.key.replace(/^\[.*?\]\s*-\s*/, '').match(/(?:#\s*(\d+)|^(\d+)\s*#)/);
    const matchB = b.key.replace(/^\[.*?\]\s*-\s*/, '').match(/(?:#\s*(\d+)|^(\d+)\s*#)/);
    if (matchA && matchB) {
      return parseInt(matchA[1] || matchA[2], 10) - parseInt(matchB[1] || matchB[2], 10);
    }

    const cleanA = normalize(a.key.replace(/^\[.*?\]\s*-\s*/, ''));
    const cleanB = normalize(b.key.replace(/^\[.*?\]\s*-\s*/, ''));
    
    let idxA = normalizedTemplate.indexOf(cleanA);
    let idxB = normalizedTemplate.indexOf(cleanB);
    
    // Fallback para "starts with" caso o label tenha mudado levemente
    if (idxA === -1) idxA = normalizedTemplate.findIndex(t => cleanA.startsWith(t) || t.startsWith(cleanA));
    if (idxB === -1) idxB = normalizedTemplate.findIndex(t => cleanB.startsWith(t) || t.startsWith(cleanB));
    
    if (idxA !== -1 && idxB !== -1) return idxA - idxB;
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    
    return ((a as any).originalIdx || 0) - ((b as any).originalIdx || 0);
  });

  if (formItems.length === 0) return null;

  const photoCount = formItems.reduce((acc, i) => acc + i.photos.length, 0);
  const textCount = formItems.filter(i => i.text !== null).length;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 overflow-hidden">
      {/* Collapsible Toggle */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 sm:px-8 py-4 sm:py-5 hover:bg-slate-50 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            {icon || <ClipboardList size={16} />}
          </div>
          <div className="text-left">
            <div className="flex items-center gap-1">
              <p className="text-sm text-slate-900 uppercase tracking-wide">{title}</p>
              {titleBadge}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              {subtitle || `${textCount} ${textCount === 1 ? 'resposta' : 'respostas'}${photoCount > 0 ? ` · ${photoCount} foto${photoCount > 1 ? 's' : ''}` : ''}`}
              {parts && parts.length > 0 && showPrices && ` · R$ ${parts.reduce((acc, it) => acc + (it.total || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-[#1c2d4f] uppercase tracking-widest group-hover:gap-3 transition-all">
          <span>{isOpen ? 'Fechar' : 'Ver mais'}</span>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded content — cada item do formulário com texto + fotos juntos */}
      {isOpen && (
        <div className="border-t border-slate-200 px-3 sm:px-8 py-5 sm:py-6 space-y-6 sm:space-y-8 animate-fade-in">
          {(() => {
            const groupedItems = formItems.reduce((acc, item) => {
              const match = item.key.match(/^\[(.*?)\]\s*(?:-|$)/);
              const groupName = match ? match[1] : 'Ficha Técnica';
              if (!acc[groupName]) acc[groupName] = [];
              acc[groupName].push({
                ...item,
                cleanKey: item.key.replace(/^\[.*?\]\s*-\s*/, '')
              });
              return acc;
            }, {} as Record<string, (typeof formItems[0] & { cleanKey?: string })[]>);

            const groupOrder = Array.from(new Set(formItems.map(item => {
              const match = item.key.match(/^\[(.*?)\]\s*(?:-|$)/);
              return match ? match[1] : 'Ficha Técnica';
            })));

            const matchedParts = new Set<string>();
            const groupPartsMap: Record<string, any[]> = {};
            
            groupOrder.forEach(group => {
              groupPartsMap[group] = [];
              if (group === 'Ficha Técnica') return;
              const gLower = group.toLowerCase();
              (parts || []).forEach(it => {
                const itEqName = (it.equipmentName || '').toLowerCase();
                if (!itEqName) return;
                if (itEqName === gLower || gLower.includes(itEqName) || itEqName.includes(gLower)) {
                  groupPartsMap[group].push(it);
                  matchedParts.add(it.id || it.description);
                }
              });
            });

            const unlinkedParts = (parts || []).filter(it => !matchedParts.has(it.id || it.description));

            return (
              <>
                {groupOrder.map(group => {
                  const items = groupedItems[group];
                  const eqParts = groupPartsMap[group] || [];

                  return (
                    <div key={group} className="space-y-4">
                      {group !== 'Ficha Técnica' && Object.keys(groupedItems).length > 1 && (
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center border border-emerald-100">
                            <CheckCircle2 size={12} className="text-emerald-600" />
                          </div>
                          <h4 className="text-xs uppercase tracking-widest text-[#1c2d4f]">{group}</h4>
                        </div>
                      )}
                      <div className="flex flex-col gap-3">
                        {items.map(({ key, cleanKey, text, photos }) => (
                          <div key={key} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                            <div className="grid grid-cols-2 divide-x divide-slate-200">
                              {/* Pergunta */}
                              <div className="p-3 sm:p-4 bg-slate-50/50 flex items-center">
                                <p className="text-xs text-slate-800 uppercase tracking-wide">
                                  {resolvePublicLabel(key)}
                                </p>
                              </div>
                              {/* Resposta */}
                              <div className="p-3 sm:p-4 flex flex-col justify-center">
                                {text !== null && (
                                  <p className={`text-sm leading-snug flex items-center gap-1.5 ${text.toLowerCase() === 'sim' || text.toLowerCase() === 'ok'
                                    ? 'text-emerald-600'
                                    : 'text-slate-500'
                                    }`}>
                                    {(text.toLowerCase() === 'sim' || text.toLowerCase() === 'ok') && <CheckCircle2 size={13} />}
                                    {formatPublicValue(text)}
                                  </p>
                                )}
                                {text === null && photos.length > 0 && (
                                  <p className="text-xs text-slate-400 italic">Evidência fotográfica anexada</p>
                                )}
                                {photos.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-3">
                                    {photos.map((url, i) => (
                                      <div
                                        key={i}
                                        className="w-[60px] h-[60px] sm:w-[80px] sm:h-[80px] rounded-lg overflow-hidden bg-slate-200 border border-slate-200 cursor-zoom-in group hover:shadow-md transition-all shrink-0"
                                        onClick={() => onImageClick(url, photos)}
                                      >
                                        {isVideoUrl(url) ? (
                                          <div className="w-full h-full relative flex items-center justify-center bg-black">
                                            <video src={url} className="w-full h-full object-cover opacity-60" />
                                            <div className="absolute inset-0 flex items-center justify-center shadow-inner">
                                              <div className="w-6 h-6 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 group-hover:bg-white/30 transition-all">
                                                <Play size={10} className="text-white fill-white ml-0.5" />
                                              </div>
                                            </div>
                                          </div>
                                        ) : (
                                          <img
                                            src={url}
                                            className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                                            alt={key}
                                          />
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {eqParts.length > 0 && (
                        <div className="mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                          <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 flex items-center gap-2">
                            <Package size={14} className="text-slate-500" />
                            <span className="text-[10px] uppercase tracking-widest text-slate-600">Peças Utilizadas neste Equipamento</span>
                          </div>
                          <table className="w-full text-left text-xs">
                            <tbody className="divide-y divide-slate-100">
                              {eqParts.map((pIt, pIdx) => (
                                <tr key={pIdx} className="hover:bg-slate-50/50">
                                  <td className="px-4 py-3 text-slate-700 uppercase">
                                    <span className="text-blue-600 mr-1">{pIt.quantity || 1}x</span> {pIt.description}
                                  </td>
                                  <td className="px-4 py-3 text-center text-slate-900 w-16">{pIt.quantity || 1}</td>
                                  {showPrices && <td className="px-4 py-3 text-right text-slate-900">R$ {(pIt.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* ── PEÇAS VINCULADAS AO EQUIPAMENTO (GERAL / NÃO VINCULADAS) ── */}
                {unlinkedParts.length > 0 && (
                  <div className="mt-8 pt-6 border-t border-slate-200 animate-in fade-in slide-in-from-top-4 duration-700">
                    <div className="flex items-center gap-2 mb-4">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                        <Package size={16} />
                      </div>
                      <h4 className="text-xs uppercase tracking-widest text-slate-700">Outras Peças & Insumos Utilizados</h4>
                    </div>
                    
                    <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/30">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-100/50 text-slate-500 uppercase tracking-tighter">
                            <th className="px-4 py-3">Descrição do Item</th>
                            <th className="px-4 py-3 text-center">Qtd</th>
                            {showPrices && <th className="px-4 py-3 text-right">Unitário</th>}
                            {showPrices && <th className="px-4 py-3 text-right">Total</th>}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {unlinkedParts.map((it, idx) => (
                            <tr key={it.id || idx} className="hover:bg-white/50 transition-colors">
                              <td className="px-4 py-3 text-slate-700 uppercase">
                                <span className="text-blue-600 mr-1">{it.quantity || 1}x</span> {it.description}
                              </td>
                              <td className="px-4 py-3 text-center text-slate-900">{it.quantity}</td>
                              {showPrices && <td className="px-4 py-3 text-right text-slate-500">R$ {it.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                              {showPrices && <td className="px-4 py-3 text-right text-slate-900">R$ {it.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                            </tr>
                          ))}
                        </tbody>
                        {showPrices && (
                          <tfoot className="bg-slate-100/30 border-t border-slate-100">
                            <tr>
                              <td colSpan={3} className="px-4 py-3 text-right text-[10px] text-slate-400 uppercase tracking-widest">Subtotal Peças Diversas</td>
                              <td className="px-4 py-3 text-right text-[#1c2d4f]">
                                R$ {unlinkedParts.reduce((acc, it) => acc + (it.total || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const PublicOrderView: React.FC<PublicOrderViewProps> = ({ order, techs, isPrint = false, tenantProp }) => {
  const [tenant, setTenant] = React.useState<any>(tenantProp || null);
  const showPrices = (tenant?.metadata?.showItemPricesInPublicView !== false) && (order?.showValueToClient === true);
  // Se false: exibe apenas a visita de conclusão (a última com status 'completed')
  const showAllVisitsInPublicLink = tenant?.metadata?.showVisitHistoryInPublicLink !== false;
  const showVisitHistory = tenant?.metadata?.showVisitHistory !== false;
  const [lightboxState, setLightboxState] = React.useState<{ images: string[], currentIndex: number } | null>(null);
  
  const openLightbox = (url: string, contextUrls?: string[]) => {
    let images = contextUrls && contextUrls.length > 0 ? contextUrls : [url];
    if (!images.includes(url)) images = [url, ...images];
    const startIndex = images.indexOf(url);
    setLightboxState({ images, currentIndex: startIndex >= 0 ? startIndex : 0 });
  };
  const [linkedEquipments, setLinkedEquipments] = React.useState<any[]>([]);
  // Endereço fresco do cadastro do cliente (pode ter sido atualizado após a OS)
  const [freshCustomerAddress, setFreshCustomerAddress] = React.useState<string | null>(null);
  const [formTemplates, setFormTemplates] = React.useState<Record<string, any>>({});
  const [orderVisits, setOrderVisits] = React.useState<any[]>([]);

  // 📝 1. Consolidação de Dados (Merge OS + Visitas) - Senior Pattern
  const formDataPrint = React.useMemo(() => {
    if (!order) return {};
    
    const getFormData = (fd: any) => {
      if (!fd) return {};
      return typeof fd === 'string' ? (() => { try { return JSON.parse(fd); } catch { return {}; } })() : fd;
    };

    const base = getFormData(order.formData);
    const merged = { ...base };

    // Mescla dados estruturados de todas as visitas (prioridade para a mais recente)
    orderVisits.forEach(v => {
      const vFd = getFormData(v.formData);
      Object.assign(merged, vFd);
    });

    return merged;
  }, [order?.formData, orderVisits]);

  const findNormalizedField = (token: string, data: Record<string, any>) => {
    const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const searchToken = normalize(token);
    
    if (data[token] !== undefined) return data[token];
    const found = Object.entries(data).find(([k]) => normalize(k).includes(searchToken));
    return found ? found[1] : null;
  };

  // 🖊️ Extração de Identidade (Assinaturas) - UNIFICADO (Web + Print)
  const signatureInfo = React.useMemo(() => {
    if (!order) return { signature: null, name: null, doc: null };

    // 🎯 PRIORIDADE: order.signature (nível raiz) ou mapeamentos diretos no formData
    const signature = (order as any).signature || 
      (order as any).client_signature_url || 
      formDataPrint.signature || 
      findNormalizedField('assinaturadocliente', formDataPrint) || 
      findNormalizedField('assinatura', formDataPrint);

    // 🎯 Nome: Prio no digitado no app, depois mapeamentos directos e normalizados
    const name = (order as any).signatureName || 
      (order as any).client_signature_name || 
      formDataPrint.signatureName || 
      formDataPrint.clientName || 
      findNormalizedField('assinaturadoclientenome', formDataPrint) || 
      findNormalizedField('responsavelpelorecebi', formDataPrint) || 
      findNormalizedField('responsavel', formDataPrint) ||
      findNormalizedField('nome', formDataPrint);

    const doc = (order as any).signatureDoc || 
      (order as any).signature_doc || 
      formDataPrint.signatureDoc || 
      formDataPrint.clientDoc ||
      findNormalizedField('assinaturadoclientecpf', formDataPrint) || 
      findNormalizedField('cpf', formDataPrint);

    return { signature, name, doc };
  }, [order, formDataPrint]);

  // Busca templates de formulários para garantir a ORDEM das perguntas
  React.useEffect(() => {
    const fetchTemplates = async () => {
      const ids = new Set<string>();
      if (order?.formId) ids.add(order.formId);
      linkedEquipments.forEach(eq => {
        if (eq.form_id) ids.add(eq.form_id);
      });

      if (ids.size === 0) return;

      try {
        const { data } = await supabase
          .from('form_templates')
          .select('id, schema')
          .in('id', Array.from(ids));
        
        if (data) {
          const map: Record<string, string[]> = {};
          data.forEach(t => {
            const fields = (t.schema as any)?.fields || [];
            map[t.id] = fields.map((f: any) => f.label || f.title || '');
          });
          setFormTemplates(map);
        }
      } catch (err) {
        console.error('Erro ao buscar templates:', err);
      }
    };
    fetchTemplates();
  }, [order?.formId, linkedEquipments.length]); // Somente re-executa se o ID do formulário ou qtd de equipamentos mudar
  React.useEffect(() => {
    const fetchTenantData = async () => {
      if (tenantProp) {
        setTenant(tenantProp);
        return;
      }
      if (order) {
        try {
          const tenantId = (order as any).tenant_id || order?.tenantId;
          const data = await DataService.getTenantById(tenantId);
          setTenant(data);
        } catch (error) {
          console.error('Erro ao buscar dados da empresa:', error);
        }
      }
    };
    fetchTenantData();
  }, [order?.id, tenantProp]);

  // Carrega todos os equipamentos vinculados via RPC (bypassa RLS)
  React.useEffect(() => {
    if (!order?.id) return;
    const fetchEquips = async () => {
      try {
        const { data } = await supabase.rpc('nexus_get_order_equipments', { p_order_id: order.id });
        const rows: any[] = Array.isArray(data) ? data : (data ? [data] : []);
        setLinkedEquipments(rows);
      } catch (err) {
        setLinkedEquipments([]);
      }
    };
    fetchEquips();
  }, [order?.id]);
  
  // 🛰️ Busca visitas via RPC (bypassa RLS para visualização pública via Token)
  React.useEffect(() => {
    if (!order?.id || !order?.publicToken) return;
    const fetchVisits = async () => {
      try {
        const { data, error } = await supabase.rpc('get_public_order_visits', { search_term: order.publicToken || order.id });
        if (error) throw error;
        setOrderVisits(data || []);
      } catch (err) {
        console.error('Erro ao buscar visitas:', err);
        setOrderVisits([]);
      }
    };
    fetchVisits();
  }, [order?.id, order?.publicToken]);

  // Handle auto-print when opening from Admin with ?print=true
  // Waits for ALL images to finish loading before calling print (bigtech pattern)
  const triggerSmartPrint = React.useCallback((closeAfter = false) => {
    const setTitle = () => {
      const cleanCustomer = (order?.customerName || 'Cliente').substring(0, 30).replace(/[^a-zA-Z0-9 ]/g, '').trim();
      document.title = `OS_${order?.displayId || order?.serviceOrderNumber || order?.id?.substring(0, 8)}_${cleanCustomer}`;
    };

    const doPrint = () => {
      const originalTitle = document.title;
      setTitle();
      window.print();
      document.title = originalTitle;
      // Removido auto window.close() porque em browsers non-blocking (Safari/Mobile)
      // isso fecha a janela antes de terminar o spool da impressão, gerando PDF em branco
      // ou cancelando a ação. O usuário pode fechar a aba manualmente.
    };

    // Collect all images that are not yet complete
    const imgs = Array.from(document.querySelectorAll('img')) as HTMLImageElement[];
    const pending = imgs.filter(img => !img.complete || img.naturalWidth === 0);

    if (pending.length === 0) {
      doPrint();
      return;
    }

    // Show a small loading overlay while images load
    const overlay = document.createElement('div');
    overlay.id = '__print-loading-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(255,255,255,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;font-family:system-ui,sans-serif';
    overlay.innerHTML = `
      <div style="width:48px;height:48px;border:3px solid #e2e8f0;border-top-color:#1c2d4f;border-radius:50%;animation:__spin 0.8s linear infinite"></div>
      <p style="font-size:13px;color:#475569;letter-spacing:0.05em;text-transform:uppercase">Carregando imagens para impressão…</p>
      <style>@keyframes __spin{to{transform:rotate(360deg)}}</style>
    `;
    document.body.appendChild(overlay);

    let loaded = 0;
    const total = pending.length;
    const onLoad = () => {
      loaded++;
      if (loaded >= total) {
        overlay.remove();
        // Small extra delay for browser paint
        setTimeout(doPrint, 300);
      }
    };

    pending.forEach(img => {
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onLoad, { once: true }); // count errors too so we never hang
    });

    // Absolute safety timeout: 20s max regardless of load state
    setTimeout(() => {
      overlay.remove();
      doPrint();
    }, 20000);
  }, [order]);

  React.useEffect(() => {
    // Wait for all data to be fully loaded: order, visits, AND tenant (company info)
    if (typeof window !== 'undefined' && window.location.href.includes('print=true') && order && orderVisits !== undefined && tenantProp) {
      // Wait a bit longer (1000ms instead of 500ms) to ensure CSS/Tailwind rules are fully painted
      const timer = setTimeout(() => triggerSmartPrint(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [order, orderVisits, tenantProp, triggerSmartPrint]);

  // Busca endereço atualizado do cliente na tabela customers
  const [freshCustomerPhone, setFreshCustomerPhone] = React.useState<string | null>(null);
  const [freshCustomerEmail, setFreshCustomerEmail] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchCustomerAddress = async () => {
      if (!order?.customerName) return;
      try {
        const tenantId = (order as any).tenant_id || order?.tenantId;
        if (!tenantId) return;
        const { data } = await import('../../lib/supabase').then(m => m.supabase
          .from('customers')
          .select('address, number, complement, neighborhood, city, state, phone, whatsapp, email')
          .eq('tenant_id', tenantId)
          .ilike('name', order.customerName.trim())
          .limit(1)
          .single()
        );
        if (data) {
          // Filtra campos válidos: exclui null, undefined, string vazia e literal 'null'
          const clean = (v: any) => v && String(v).toLowerCase() !== 'null' && String(v).trim() !== '';
          const street = [data.address, data.number].filter(clean).join(', ') + (clean(data.neighborhood) ? ` - ${data.neighborhood}` : '');
          const complement = clean(data.complement) ? `Complemento: ${data.complement}` : '';
          const city = clean(data.city) ? data.city : '';
          const state = clean(data.state) ? data.state : '';
          const cityState = [city, state].filter(Boolean).join(' - ');
          
          const addr = [street, complement, cityState].filter(Boolean).join('\n');
          if (addr.trim()) setFreshCustomerAddress(addr);
          
          if (clean(data.whatsapp)) setFreshCustomerPhone(data.whatsapp);
          else if (clean(data.phone)) setFreshCustomerPhone(data.phone);
          
          if (clean(data.email)) setFreshCustomerEmail(data.email);
        }
      } catch {
        // Se não encontrar, usa o endereço da OS
      }
    };
    fetchCustomerAddress();
  }, [order?.customerName, order?.id]);

  if (!order) return (
    <div className="public-view-wrapper font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap');
        .public-view-wrapper, .public-view-wrapper * {
            font-family: 'Poppins', sans-serif !important;
        }
      `}</style>
      <div className="min-h-screen bg-white flex items-center justify-center p-12">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <NexusBranding size="lg" />
          <p className="text-xs uppercase text-slate-300 tracking-widest">Carregando Detalhes da OS...</p>
        </div>
      </div>
    </div>
  );

  const tech = techs.find(t => t.id === order.assignedTo);
  const companyName = tenant?.company_name || tenant?.name || tenant?.companyName || 'Nexus Pro';
  const companyLogo = tenant?.logo_url || tenant?.logoUrl;
  const companyAddress = React.useMemo(() => {
    if (!tenant) return '';
    // Prioritiza campos individuais, fallbacks para 'address'
    const street = tenant.street || tenant.address || '';
    if (!street) return '';
    
    const parts = [street];
    if (tenant.number) parts.push(`, ${tenant.number}`);
    if (tenant.complement) parts.push(` - ${tenant.complement}`);
    if (tenant.neighborhood) parts.push(` - ${tenant.neighborhood}`);
    if (tenant.city) parts.push(`, ${tenant.city}`);
    if (tenant.state) parts.push(`/${tenant.state}`);
    
    return parts.join('');
  }, [tenant]);
  const companyPhone = tenant?.phone || '';
  const companyEmail = tenant?.admin_email || tenant?.email || '';
  const companyDoc = tenant?.cnpj || tenant?.document || '';
  const companyWebsite = tenant?.website || '';

  const fmt = (d?: string) => safeFormatDate(d);
  const fmtDT = (d?: string) => safeFmtDT(d);

  const enrichedItems = React.useMemo(() => {
    if (!order?.items) return [];
    return order.items.map((it: any) => {
      let eqName = it.equipmentName;
      if (!eqName && it.equipmentId) {
        const eq = linkedEquipments.find(e => e.id === it.equipmentId || e.equipment_id === it.equipmentId);
        if (eq) {
          eqName = eq.equipment_name || eq.equipmentName;
        }
      }
      return { ...it, equipmentName: eqName };
    });
  }, [order?.items, linkedEquipments]);

  const totalItems = enrichedItems.reduce((acc: any, i: any) => acc + (i.total || 0), 0);
  // Endereço exibido: fresco do cadastro ou gravado na OS
  // Guard contra literal 'null' que pode vir do banco
  const sanitize = (v?: string | null) => v && String(v).toLowerCase() !== 'null' && v.trim() !== '' ? v.trim() : null;
  const displayAddress = sanitize(freshCustomerAddress) || sanitize(order.customerAddress);
  
  // 🎯 Dados de assinatura unificados para o Print
  const clientSigPrint = signatureInfo.signature;
  const clientNamePrint = signatureInfo.name;
  const clientDocPrint = signatureInfo.doc;

  // ── PRINT LAYOUT PREPARATION ──
  const formItemsPrint: Array<{ key: string, text: string | null, photos: string[] }> = [];
  
  const SYSTEM_KEYS = new Set([
    'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
    'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
    'impediment_reason', 'impediment_photos', 'impedimento_tipo', 'impedimento_motivo', 'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo', 'impedimento_fotos', 'impediment_at', 'totalValue', 'price', 'execution_forms',
    'finishedAt', 'completedAt', 'technical_report', 'parts_used',
    'technicalReport', 'partsUsed', 'blockReason', 'clientDoc',
    'clientName', 'customerName', 'customerAddress', 'tenantId',
    'assignedTo', 'formId', 'billingStatus', 'paymentMethod',
    'extra_photos', 'photos', 'equipment_ids'
  ]);

  const isSignatureKey = (k: string) => {
    const lower = k.toLowerCase();
    return lower.includes('assinatura') || lower.includes('signature') || lower.includes('cpf') || lower.includes('nascimento');
  };

  const isImageVal = (v: any) => typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('data:video') || v.startsWith('http'));

  Object.entries(formDataPrint)
    .filter(([key]) => !SYSTEM_KEYS.has(key) && !isSignatureKey(key))
    .forEach(([key, val]) => {
      let text: string | null = null;
      let photos: string[] = [];
      if (Array.isArray(val)) {
        const textParts = val.filter((v: any) => typeof v === 'string' && !isImageVal(v));
        photos = val.filter((v: any) => isImageVal(v));
        if (textParts.length > 0) text = textParts.join(', ');
      } else if (isImageVal(val)) {
        photos = [val as string];
      } else if (val !== null && val !== undefined && val !== '') {
        text = String(val);
      }
      if (text !== null || photos.length > 0) formItemsPrint.push({ key, text, photos });
    });

  // ── PRINT LAYOUT COMPONENT ──
  const PrintLayout = () => (
    <div className="bg-white text-[10px] leading-tight font-poppins" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', padding: '0' }}>
      {/* Print Header */}
      <div className="flex justify-between items-start pb-2 border-b-2 border-slate-800 mb-2">
        <div className="flex gap-3 items-center">
          {companyLogo
            ? <img src={companyLogo} alt="Logo" className="h-12 w-auto object-contain" />
            : <div className="bg-slate-900 p-1.5 rounded-lg flex items-center justify-center min-w-[50px] min-h-[50px] text-white"><Hexagon size={24} className="text-white fill-white/10" /></div>
          }
          <div className="space-y-0.5">
            <h1 className="text-lg text-slate-900 uppercase tracking-tight">{companyName}</h1>
            <div className="text-[9px] text-slate-600 max-w-[400px]">
              {companyAddress && <div className="leading-tight">{companyAddress}</div>}
              <div className="flex gap-2 mt-0.5">
                {companyPhone && <span className="">Tel: {companyPhone}</span>}
                {companyEmail && <span>Email: {companyEmail}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="border-2 border-slate-800 px-3 py-1 rounded-lg bg-slate-50">
            <div className="text-[8px] text-slate-500 uppercase tracking-wider">Ordem de Serviço</div>
            <div className="text-xl text-slate-900 tracking-tighter">#{order.displayId || order.id.slice(0, 8).toUpperCase()}</div>
          </div>
          <p className="text-[8px] text-slate-400 mt-1 uppercase tracking-wide">
            Emissão: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {/* Dados do Atendimento — print-no-break: card compacto, nunca cortar */}
        <div className="border border-slate-300 rounded-lg overflow-hidden print-no-break">
          <div className="grid grid-cols-12 divide-x divide-slate-200">
            <div className="col-span-12 bg-slate-100 px-3 py-1 border-b border-slate-300 text-[9px] uppercase tracking-wider text-slate-700">Dados do Atendimento e Cliente</div>
            <div className="col-span-7 p-2 grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="col-span-2"><label className="block text-[8px] text-slate-400 uppercase">Cliente</label><div className="text-slate-900 text-xs uppercase">{order.customerName}</div></div>
              <div className="col-span-2 flex flex-col gap-1">
                <div><label className="block text-[8px] text-slate-400 uppercase">Endereço</label><div className="text-slate-700 text-xs uppercase leading-tight whitespace-pre-line">{displayAddress || 'N/A'}</div></div>
                {(freshCustomerPhone || freshCustomerEmail) && (
                  <div>
                    <label className="block text-[8px] text-slate-400 uppercase">Contato</label>
                    <div className="text-slate-700 text-[10px] uppercase leading-tight mt-0.5">
                      {freshCustomerPhone && <span>{freshCustomerPhone}</span>}
                      {freshCustomerPhone && freshCustomerEmail && <span className="mx-1.5">•</span>}
                      {freshCustomerEmail && <span className="lowercase">{freshCustomerEmail}</span>}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="col-span-5 p-2 grid grid-cols-2 gap-2 bg-slate-50/50">
              <div><label className="block text-[8px] text-slate-400 uppercase">Abertura</label><div className="">{fmt(order.createdAt)}</div></div>
              <div><label className="block text-[8px] text-slate-400 uppercase">Tipo</label><div className="uppercase text-[9px]">{order.operationType || 'Manutenção'}</div></div>
              <div><label className="block text-[8px] text-slate-400 uppercase">Check-In</label><div className="">{fmtDT(orderVisits.find((v: any) => v.arrival_time)?.arrival_time || order.startDate)}</div></div>
              <div><label className="block text-[8px] text-slate-400 uppercase">Conclusão</label><div className="">{fmtDT(order.endDate || [...orderVisits].reverse().find((v: any) => v.departure_time)?.departure_time)}</div></div>
              <div><label className="block text-[8px] text-slate-400 uppercase">Técnico</label><div className="uppercase text-[9px] truncate">{tech?.name || 'N/A'}</div></div>
              <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-200/50">
                 <label className="text-[8px] text-slate-400 uppercase">Status Final</label>
                 <div className="text-[8px] border border-slate-300 px-1.5 py-0.5 rounded bg-white uppercase">{order.status}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Equipamentos Vinculados (print) */}
        {linkedEquipments.length > 0 ? (
          <div className="border border-slate-300 rounded-lg overflow-hidden print-no-break">
            <div className="bg-sky-50 text-sky-900 px-3 py-2 border-b border-sky-100 text-sm uppercase tracking-wider print-section-header">
              Equipamentos Vinculados ({linkedEquipments.length})
            </div>
            <div className="w-full"><table className="w-full text-left break-words table-fixed">
              <thead>
                <tr className="bg-slate-50 text-xs text-slate-500 uppercase border-b border-slate-200">
                  <th className="px-3 py-1.5">#</th>
                  <th className="px-3 py-1.5">Equipamento</th>
                  <th className="px-3 py-1.5">Modelo</th>
                  <th className="px-3 py-1.5">Nº Série</th>
                  <th className="px-3 py-1.5">Família</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {linkedEquipments.map((eq: any, i: number) => (
                  <tr key={eq.id || i}>
                    <td className="px-3 py-1.5 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-800 uppercase">{eq.equipment_name || eq.equipmentName || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600 uppercase">{eq.equipment_model || eq.equipmentModel || '—'}</td>
                    <td className="px-3 py-1.5 text-xs font-mono text-[#1c2d4f]">{eq.equipment_serial || eq.equipmentSerial || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600 uppercase">{eq.equipment_family || eq.equipmentFamily || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        ) : (order.equipmentName || order.equipmentModel || order.equipmentSerial) && (
          <div className="border border-slate-200 rounded-lg overflow-hidden print-no-break shadow-sm">
            <div className="bg-sky-50 text-sky-900 px-3 py-2 border-b border-sky-100 text-sm uppercase tracking-wider">Dados do Equipamento</div>
            <div className="p-3 bg-white grid grid-cols-3 gap-4">
              <div className="col-span-1"><label className="block text-[10px] text-slate-400 uppercase tracking-widest">Equipamento</label><div className="text-slate-800 text-sm uppercase">{order.equipmentName || '—'}</div></div>
              <div className="col-span-1"><label className="block text-[10px] text-slate-400 uppercase tracking-widest">Modelo</label><div className="text-slate-700 text-sm uppercase">{order.equipmentModel || '—'}</div></div>
              <div className="col-span-1"><label className="block text-[10px] text-slate-400 uppercase tracking-widest">Nº Sér / ID</label><div className="font-mono text-[#1c2d4f] text-sm uppercase ">{order.equipmentSerial || '—'}</div></div>
            </div>
          </div>
        )}

        {order.description && (
          <div className="border border-slate-300 rounded-lg overflow-hidden print-section">
            <div className="bg-slate-100 px-3 py-1 border-b border-slate-300 text-[9px] uppercase tracking-wider text-slate-700 print-section-header">Descrição do problema</div>
            <div className="p-2 bg-white text-[9px] text-slate-800 whitespace-pre-wrap leading-tight">
              {order.description}
            </div>
          </div>
        )}

        {(order.status === 'IMPEDIDO' || formDataPrint.impediment_reason || (order.notes && order.notes.includes('IMPEDIMENTO'))) && (
          <div className="border border-red-300 rounded-lg overflow-hidden print-no-break shadow-sm text-red-900">
            <div className="bg-red-100 px-3 py-1 border-b border-red-300 text-[9px] uppercase tracking-wider text-red-700 print-section-header">Aviso de Impedimento / Pendência</div>
            <div className="p-2 bg-red-50 text-[9px] whitespace-pre-wrap italic leading-tight">
              {formDataPrint.impediment_reason || (order.notes ? order.notes.replace('IMPEDIMENTO: ', '') : 'Motivo não mapeado detalhadamente.')}
            </div>
          </div>
        )}


        {/* Formulários agrupados por equipamento (print) */}
        {orderVisits.length === 0 && (() => {
          const getFD = (fd: any) => {
            if (!fd) return {};
            if (typeof fd === 'string') { try { return JSON.parse(fd); } catch { return {}; } }
            return fd;
          };

          const allFD: Record<string, any> = { ...getFD(order.formData) };
          linkedEquipments.forEach(eq => Object.assign(allFD, getFD(eq.form_data)));

          const grps: Record<string, any[]> = {};
          const SYS_KEYS = new Set([
            'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
            'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
            'impediment_reason', 'impediment_photos', 'impedimento_tipo', 'impedimento_motivo', 'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo', 'impedimento_fotos', 'impediment_at', 'totalValue', 'price', 'execution_forms',
            'finishedAt', 'completedAt', 'technical_report', 'parts_used',
            'technicalReport', 'partsUsed', 'blockReason', 'clientDoc',
            'clientName', 'customerName', 'customerAddress', 'tenantId',
            'assignedTo', 'formId', 'billingStatus', 'paymentMethod',
            'extra_photos', 'photos', 'equipment_ids', 'videoUrl', 'video_url'
          ]);

          Object.entries(allFD).forEach(([key, val]) => {
            if (SYS_KEYS.has(key) || key.toLowerCase().includes('assinatura')) return;
            const match = key.match(/^\[(.*?)\]\s*(?:-|$)/);
            const gName = match ? match[1] : 'Relatório Geral';
            if (!grps[gName]) grps[gName] = [];
            
            let text: string | null = null;
            let photos: string[] = [];
            const isImg = (v: any) => typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http'));

            if (Array.isArray(val)) {
              text = val.filter(v => typeof v === 'string' && !isImg(v)).join(', ');
              photos = val.filter(v => isImg(v));
            } else if (isImg(val)) {
              photos = [val as string];
            } else if (val !== null && val !== undefined && val !== '') {
              text = String(val);
            }
            if (text || photos.length > 0) grps[gName].push({ key, text, photos });
          });

          // 2. Ordena os itens dentro de cada grupo conforme o template do formulário
          const normalizeForSort = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^[\d\s.]*/, '').replace(/[^a-z0-9]/g, '');

          Object.keys(grps).forEach(gName => {
            const currentFormId = order.formId;
            const templateOrder = currentFormId ? (formTemplates[currentFormId] || []) : [];
            
            const eqMatch = linkedEquipments.find(e => {
               const eN = (e.equipment_name || e.equipmentName || '').toLowerCase();
               return gName.toLowerCase().includes(eN) || eN.includes(gName.toLowerCase());
            });
            const specificOrder = eqMatch?.form_id ? (formTemplates[eqMatch.form_id] || []) : [];
            const combinedOrder = Array.from(new Set([...templateOrder, ...specificOrder]));

            const normalizedOrder = combinedOrder.map(normalizeForSort);
            
            // Garante estabilidade usando índice original
            grps[gName].forEach((item: any, idx: number) => item.originalIdx = idx);
            
            grps[gName].sort((a, b) => {
              const matchA = a.key.replace(/^\[.*?\]\s*-\s*/, '').match(/(?:#\s*(\d+)|^(\d+)\s*#)/);
              const matchB = b.key.replace(/^\[.*?\]\s*-\s*/, '').match(/(?:#\s*(\d+)|^(\d+)\s*#)/);
              if (matchA && matchB) {
                return parseInt(matchA[1] || matchA[2], 10) - parseInt(matchB[1] || matchB[2], 10);
              }

              const cleanA = normalizeForSort(a.key.replace(/^\[.*?\]\s*-\s*/, ''));
              const cleanB = normalizeForSort(b.key.replace(/^\[.*?\]\s*-\s*/, ''));
              
              let idxA = normalizedOrder.indexOf(cleanA);
              let idxB = normalizedOrder.indexOf(cleanB);
              
              if (idxA === -1) idxA = normalizedOrder.findIndex(label => cleanA === label || cleanA.startsWith(label));
              if (idxB === -1) idxB = normalizedOrder.findIndex(label => cleanB === label || cleanB.startsWith(label));
              
              if (idxA !== -1 && idxB !== -1) return idxA - idxB;
              if (idxA !== -1) return -1;
              if (idxB !== -1) return 1;
              
              return (a.originalIdx || 0) - (b.originalIdx || 0);
            });
          });

          const grpEntries = Object.entries(grps);
          if (grpEntries.length === 0) return null;

          // Financeiro primeiro, Técnico segundo, Relatório Geral por último
          const grpSortPriority = (name: string): number => {
            const n = name.toLowerCase();
            if (n.endsWith('financeiro') || n.includes('- financeiro')) return 0;
            if (n.endsWith('técnico') || n.includes('- técnico') || n.endsWith('tecnico') || n.includes('- tecnico')) return 1;
            if (n === 'relatório geral' || n === 'relatorio geral') return 99;
            return 50;
          };
          const sortedGrpEntries = [...grpEntries].sort((a, b) => {
            const pa = grpSortPriority(a[0]);
            const pb = grpSortPriority(b[0]);
            if (pa !== pb) return pa - pb;
            return a[0].localeCompare(b[0]);
          });

          return sortedGrpEntries.map(([gName, items], gIdx) => {
            const eq = linkedEquipments.find(e => {
              const eN = (e.equipment_name || e.equipmentName || '').toLowerCase();
              return gName.toLowerCase().includes(eN) || eN.includes(gName.toLowerCase());
            });
            const isGrpFinanceiro = gName.toLowerCase().includes('financeiro');
            const isGrpTecnico = gName.toLowerCase().includes('técnico') || gName.toLowerCase().includes('tecnico');
            const grpEqName = eq ? (eq.equipment_name || eq.equipmentName) : gName.replace(/\s*-\s*(Financeiro|Técnico|Tecnico)\s*$/i, '').replace(/^.*?\]\s*-?\s*/, '');

            return (
              // print-section: permite que o conteúdo do grupo flua entre páginas
              <div key={gIdx} className="border border-slate-300 rounded-lg overflow-hidden mt-2 print-section">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 text-[10px] uppercase tracking-wider text-slate-700 flex justify-between items-center print-section-header">
                  <div className="flex items-center gap-1.5">
                    <span>Checklist — {grpEqName}</span>
                    {isGrpFinanceiro && <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Financeiro</span>}
                    {isGrpTecnico && <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Técnico</span>}
                  </div>
                  {eq && (eq.equipment_serial || eq.equipmentSerial) && (
                    <span className="text-[9px] text-slate-500">S/N: {eq.equipment_serial || eq.equipmentSerial}</span>
                  )}
                </div>
                <div className="flex flex-col gap-2 bg-white p-2">
                  {items.map((item, iIdx) => (
                    // print-checklist-row: cada pergunta+resposta fica junta mas permite fluxo entre elas
                    <div key={iIdx} className="print-checklist-row border border-slate-200 rounded overflow-hidden">
                      <div className="grid grid-cols-2 divide-x divide-slate-200">
                        <div className="p-2 bg-slate-50/50 flex items-center">
                           <p className="text-[9px] uppercase tracking-tight text-slate-600">
                             {resolvePublicLabel(item.key)}

                           </p>
                        </div>
                        <div className="p-2 flex flex-col justify-center">
                           {item.text && (
                             <p className={`text-[10px] uppercase ${item.text.toLowerCase() === 'sim' || item.text.toLowerCase() === 'ok' ? 'text-emerald-700' : 'text-slate-900'}`}>
                               {formatPublicValue(item.text)}
                             </p>
                           )}
                           {item.photos.length > 0 && (
                             <div className="flex flex-wrap gap-2 mt-2">
                               {item.photos.map((p: string, pIdx: number) => (
                                 <div key={pIdx} className="w-[140px] h-[140px] border border-slate-200 rounded-lg overflow-hidden flex items-center justify-center bg-slate-50 shadow-sm">
                                   {isVideoUrl(p) ? (
                                     <div className="w-full h-full relative flex items-center justify-center bg-black">
                                       <video src={`${p}#t=0.1`} preload="metadata" className="w-full h-full object-cover opacity-60" />
                                       <div className="absolute inset-0 flex items-center justify-center">
                                         <Play size={10} className="text-white opacity-80" />
                                       </div>
                                       <span className="absolute bottom-1 bg-black/60 text-white text-[6px] px-1 py-0.5 rounded uppercase leading-none z-10">Vídeo</span>
                                     </div>
                                   ) : (
                                     <img src={p} className="w-full h-full object-contain" />
                                   )}
                                 </div>
                               ))}
                             </div>
                           )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Peças vinculadas ao TODO o checklist do equipamento (NO FINAL) */}
                {(() => {
                  const eqParts = enrichedItems.filter(it => {
                    const itEqName = (it.equipmentName || '').toLowerCase();
                    const gLower = gName.toLowerCase();

                    if (eq) {
                      const itEqId = it.equipmentId;
                      const eName = (eq.equipment_name || eq.equipmentName || '').toLowerCase();
                      const eId = eq.id || eq.equipmentId;
                      if ((itEqId && (itEqId === eId || itEqId === eq.equipment_id)) || 
                          (itEqName && (itEqName === eName || eName.includes(itEqName) || itEqName.includes(eName)))) {
                        return true;
                      }
                    }

                    return itEqName && (itEqName === gLower || gLower.includes(itEqName) || itEqName.includes(gLower));
                  });
                  
                  if (eqParts.length === 0) return null;

                  return (
                    <div className="p-3 border-t border-slate-200 bg-slate-50/50 print-no-break">
                      <div className="bg-slate-50 rounded-md border border-slate-300 overflow-hidden">
                        <table className="w-full text-left break-words">
                          <thead>
                            <tr className="bg-slate-200/50 text-[8px] text-slate-600 uppercase border-b border-slate-300">
                              <th className="px-3 py-1.5">Peças Utilizadas neste Equipamento</th>
                              <th className="px-3 py-1.5 text-center whitespace-nowrap">Qtd</th>
                              {showPrices && <th className="px-3 py-1.5 text-right whitespace-nowrap">Total</th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {eqParts.map((pIt, pIdx) => (
                              <tr key={pIdx}>
                                <td className="px-3 py-1.5 text-[9px] text-slate-700 uppercase break-words whitespace-normal">
                                  <span className="text-slate-900 mr-1">{pIt.quantity || 1}x</span> {pIt.description}
                                </td>
                                <td className="px-3 py-1.5 text-[9px] text-center text-slate-900 whitespace-nowrap">{pIt.quantity || 1}</td>
                                {showPrices && <td className="px-3 py-1.5 text-[9px] text-right text-slate-900 whitespace-nowrap">R$ {(pIt.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}

              </div>
            );
          });
        })()}

        {/* ── Evidências Fotográficas Adicionais (print) ── */}
        {orderVisits.length === 0 && (() => {
          const extractExtras = (fData: any) => {
            const extras = fData.extra_photos || fData.extraPhotos || fData.photos || [];
            const photosArr = Array.isArray(extras) ? extras : (typeof extras === 'string' ? [extras] : []);
            return photosArr.filter((p: any) => typeof p === 'string' && (p.startsWith('http') || p.startsWith('data:image')));
          };
          
          let allValidExtrasPrint: string[] = extractExtras(formDataPrint);
          linkedEquipments.forEach(eq => {
              let eqFd: any = typeof eq.form_data === 'string' ? (() => { try { return JSON.parse(eq.form_data); } catch { return {}; } })() : (eq.form_data || {});
              allValidExtrasPrint.push(...extractExtras(eqFd));
          });
          allValidExtrasPrint = Array.from(new Set(allValidExtrasPrint));

          if (!order.videoUrl && !formDataPrint.videoUrl && !formDataPrint.video_url && allValidExtrasPrint.length === 0) return null;

          return (
            <div className="border border-slate-300 rounded-lg overflow-hidden mt-4 print-no-break">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 text-xs uppercase tracking-wider text-slate-700">Evidências Fotográficas e de Conclusão</div>
              <div className="p-3 bg-white flex flex-wrap gap-3">
                {(() => {
                  const rawVid = order.videoUrl || formDataPrint.videoUrl || formDataPrint.video_url || '';
                  const vidArr = typeof rawVid === 'string' ? rawVid.split(',').map(u => u.trim()).filter(Boolean) : [];
                  return vidArr.map((vUrl: string, vI: number) => (
                    <div key={`pvid-${vI}`} className="border border-slate-200 rounded-lg p-1.5 w-[220px] h-[160px] overflow-hidden flex items-center justify-center bg-black break-inside-avoid shadow-inner relative">
                      <video src={`${vUrl}#t=0.1`} preload="metadata" className="w-full h-full object-cover opacity-60" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Play size={16} className="text-white opacity-80" />
                      </div>
                      <span className="absolute bottom-1 bg-black/60 text-white text-[8px] px-1.5 py-0.5 rounded uppercase leading-none">Vídeo</span>
                    </div>
                  ));
                })()}
                {allValidExtrasPrint.map((url: string, i: number) => (
                  <div key={i} className="border border-slate-200 rounded-lg p-1.5 w-[220px] h-[160px] overflow-hidden flex items-center justify-center bg-slate-50 break-inside-avoid shadow-sm">
                    <img src={url} className="w-full h-full object-contain" alt={`Evidência Adicional ${i + 1}`} />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* ── Histórico de Visitas (print) ── */}
        {orderVisits.length > 0 && (() => {
          // Na impressão, usa a configuração geral de histórico de visitas (pois é um documento consolidado)
          const visibleVisitsPrint = showVisitHistory
            ? orderVisits
            : (() => {
                const last = [...orderVisits].reverse().find(v => v.status === 'completed') || orderVisits[orderVisits.length - 1];
                return last ? [last] : [];
              })();
          if (visibleVisitsPrint.length === 0) return null;
          return (
          <div className="space-y-4 mt-4">
            {visibleVisitsPrint.map((v, i) => {
              const vFd = typeof v.form_data === 'string' ? JSON.parse(v.form_data) : (v.form_data || {});
              
              // Extract forms
              const grps: Record<string, any> = {};
              const internalKeys = new Set([
                'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
                'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
                'impediment_reason', 'impediment_photos', 'impedimento_tipo', 'impedimento_motivo', 'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo', 'impedimento_fotos', 'impediment_at', 'totalValue', 'price', 'execution_forms',
                'finishedAt', 'completedAt', 'technical_report', 'parts_used',
                'technicalReport', 'partsUsed', 'blockReason', 'clientDoc',
                'clientName', 'customerName', 'customerAddress', 'tenantId',
                'assignedTo', 'formId', 'billingStatus', 'paymentMethod',
                'extra_photos', 'photos', 'equipment_ids', 'videoUrl', 'video_url'
              ]);
              Object.entries(vFd).forEach(([key, val]) => {
                if (internalKeys.has(key) || key.toLowerCase().includes('assinatura')) return;
                const match = key.match(/^\[(.*?)\]\s*(?:-|$)/);
                const gName = match ? match[1] : 'Relatório de Atendimento';
                if (!grps[gName]) grps[gName] = {};
                grps[gName][key] = val;
              });

              // Extract photos
              const extras = vFd.extra_photos || vFd.extraPhotos || vFd.photos || [];
              const photosArr = Array.isArray(extras) ? extras : (typeof extras === 'string' ? [extras] : []);
              const visitPhotos = photosArr.filter((p: any) => typeof p === 'string' && (p.startsWith('http') || p.startsWith('data:image')));

              return (
                // print-section: a visita toda pode fluir, mas o cabeçalho não fica órfão
                <div key={v.id} className="border border-slate-200 rounded-lg overflow-hidden print-section mt-4 shadow-sm">
                  {(() => {
                    let statusLabel = '';
                    let statusColor = 'bg-sky-50 text-sky-900 border-sky-100';
                    let badgeColor = 'bg-white/60';
                    if (v.status === 'completed') {
                      statusLabel = '(Concluído)';
                      statusColor = 'bg-emerald-50 text-emerald-900 border-emerald-200';
                      badgeColor = 'bg-emerald-200/50 text-emerald-900';
                    } else if (v.status === 'blocked') {
                      const hasCheckin = v.arrival_time || vFd?.checkinLocation?.timestamp;
                      statusLabel = hasCheckin ? '(Impedido Após Atendimento)' : '(Impedido Antes do Início)';
                      statusColor = 'bg-red-50 text-red-900 border-red-200';
                      badgeColor = 'bg-red-200/50 text-red-900';
                    } else if (v.status === 'paused') {
                      statusLabel = '(Pausado)';
                      statusColor = 'bg-amber-50 text-amber-900 border-amber-200';
                      badgeColor = 'bg-amber-200/50 text-amber-900';
                    } else if (v.status === 'ongoing') {
                      statusLabel = '(Em Andamento)';
                      statusColor = 'bg-blue-50 text-blue-900 border-blue-200';
                      badgeColor = 'bg-blue-200/50 text-blue-900';
                    } else if (v.status === 'pending') {
                      statusLabel = '(Agendada)';
                      statusColor = 'bg-slate-50 text-slate-700 border-slate-200';
                      badgeColor = 'bg-slate-200/50 text-slate-700';
                    }
                    
                    return (
                      <div className={`${statusColor} px-3 py-2 border-b text-sm uppercase tracking-wider flex justify-between items-center print-section-header`}>
                        <div className="flex items-center gap-2">
                          <span>Visita #{i + 1} — {safeFormatDate(v.scheduled_date || v.created_at)}</span>
                          {statusLabel && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-md shadow-sm whitespace-nowrap ${badgeColor}`}>
                              {statusLabel}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] opacity-80 ">
                          {(() => {
                            const effArr = v.arrival_time || vFd?.checkinLocation?.timestamp || (i === 0 ? order.startDate : null);
                            const effDep = v.departure_time || vFd?.checkoutLocation?.timestamp || (i === 0 ? order.endDate : null);
                            return (
                              <>
                                {effArr ? `Entrada: ${safeFmtTime(effArr)}` : ''} 
                                {effDep ? ` · Saída: ${safeFmtTime(effDep)}` : ''}
                              </>
                            );
                          })()}
                        </span>
                      </div>
                    );
                  })()}
                  
                  <div className="p-3 bg-white space-y-3">
                    {/* O relatório de técnico e as peças foram removidos daqui e movidos para o final (abaixo dos formulários) */}

                    {/* Formulários (Checklists) */}
                    {Object.keys(grps).length > 0 && (
                      <div className="space-y-2 mt-2">
                        {Object.entries(grps).sort((a, b) => {
                          // Financeiro primeiro, Técnico segundo, Relatório por último
                          const printGroupPriority = (name: string): number => {
                            const n = name.toLowerCase();
                            if (n.endsWith('financeiro') || n.includes('- financeiro')) return 0;
                            if (n.endsWith('técnico') || n.includes('- técnico') || n.endsWith('tecnico') || n.includes('- tecnico')) return 1;
                            if (n === 'relatório de atendimento') return 99;
                            return 50;
                          };
                          const pa = printGroupPriority(a[0]);
                          const pb = printGroupPriority(b[0]);
                          if (pa !== pb) return pa - pb;
                          return a[0].localeCompare(b[0]);
                        }).map(([gName, gData]) => {
                          const eq = linkedEquipments.find(e => {
                            const eN = (e.equipment_name || e.equipmentName || '').toLowerCase();
                            return gName.toLowerCase().includes(eN) || eN.includes(gName.toLowerCase());
                          });
                          const isPrintFinanceiro = gName.toLowerCase().includes('financeiro');
                          const isPrintTecnico = gName.toLowerCase().includes('técnico') || gName.toLowerCase().includes('tecnico');
                          const printEqDisplayName = eq ? (eq.equipment_name || eq.equipmentName) : gName.replace(/\s*-\s*(Financeiro|Técnico|Tecnico)\s*$/i, '').replace(/^.*?\]\s*-?\s*/, '');
                          return (
                            <div key={gName} className="border border-slate-200 rounded">
                              <div className="bg-slate-50 border-b border-slate-200 px-3 py-1.5 flex flex-col items-center justify-center text-center">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs uppercase tracking-wider text-slate-700">
                                    {gName === 'Relatório de Atendimento'
                                      ? gName
                                      : `Equipamento: ${printEqDisplayName}`}
                                  </span>
                                  {isPrintFinanceiro && <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-200">Financeiro</span>}
                                  {isPrintTecnico && <span className="text-[8px] font-semibold uppercase px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 border border-blue-200">Técnico</span>}
                                </div>
                                {eq && (eq.equipment_serial || eq.equipmentSerial) && (
                                  <span className="text-[9px] text-slate-500 mt-0.5">S/N: {eq.equipment_serial || eq.equipmentSerial}</span>
                                )}
                              </div>
                              <div className="flex flex-col gap-1.5 p-2 bg-white">
                                {Object.entries(gData).sort((a, b) => {
                                  const matchA = a[0].replace(/^\[.*?\]\s*-\s*/, '').match(/(?:#\s*(\d+)|^(\d+)\s*#)/);
                                  const matchB = b[0].replace(/^\[.*?\]\s*-\s*/, '').match(/(?:#\s*(\d+)|^(\d+)\s*#)/);
                                  if (matchA && matchB) return parseInt(matchA[1] || matchA[2], 10) - parseInt(matchB[1] || matchB[2], 10);
                                  return 0;
                                }).map(([key, val], idx) => {
                                  let text: string | null = null;
                                  let photos: string[] = [];
                                  const isImg = (x: any) => typeof x === 'string' && (x.startsWith('data:image') || x.startsWith('http'));
                                  
                                  if (Array.isArray(val)) {
                                    text = val.filter(x => typeof x === 'string' && !isImg(x)).join(', ');
                                    photos = val.filter(x => isImg(x));
                                  } else if (isImg(val)) {
                                    photos = [val as string];
                                  } else if (val !== null && val !== undefined && val !== '') {
                                    text = String(val);
                                  }
                                  
                                  if (!text && photos.length === 0) return null;
                                  
                                  return (
                                    // print-checklist-row: cada pergunta+resposta fica junta
                                    <div key={idx} className="print-checklist-row border border-slate-200 rounded overflow-hidden bg-white">
                                      <div className="grid grid-cols-2 divide-x divide-slate-200">
                                        <div className="p-1.5 bg-slate-50/50 flex items-center">
                                          <div className="text-[8px] uppercase tracking-tight text-slate-800">{resolvePublicLabel(key)}</div>
                                        </div>
                                        <div className="p-1.5 flex flex-col justify-center">
                                          {text && (
                                            <div className={`text-[9px] uppercase leading-tight ${text.toLowerCase() === 'sim' || text.toLowerCase() === 'ok' ? 'text-emerald-600' : 'text-slate-500'}`}>
                                              {formatPublicValue(text)}
                                            </div>
                                          )}
                                          {photos.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                              {photos.map((p, pIdx) => (
                                                <div key={pIdx} className="w-[140px] h-[140px] border border-slate-200 rounded overflow-hidden flex items-center justify-center bg-white shadow-sm">
                                                  {isVideoUrl(p) ? (
                                                    <a href={p} target="_blank" rel="noopener noreferrer" className="w-full h-full relative flex items-center justify-center bg-black cursor-pointer">
                                                      <video src={`${p}#t=0.1`} preload="metadata" className="w-full h-full object-cover opacity-60" />
                                                      <div className="absolute inset-0 flex items-center justify-center">
                                                        <Play size={10} className="text-white opacity-80" />
                                                      </div>
                                                      <span className="absolute bottom-1 bg-black/60 text-white text-[6px] px-1 py-0.5 rounded uppercase leading-none z-10">Vídeo</span>
                                                    </a>
                                                  ) : (
                                                    <a href={p} target="_blank" rel="noopener noreferrer" className="w-full h-full block cursor-pointer">
                                                      <img src={p} className="w-full h-full object-contain" />
                                                    </a>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>

                              {(() => {
                                const eqParts = enrichedItems.filter(it => {
                                  const itEqName = (it.equipmentName || '').toLowerCase();
                                  const gLower = gName.toLowerCase();

                                  if (eq) {
                                    const itEqId = it.equipmentId;
                                    const eName = (eq.equipment_name || eq.equipmentName || '').toLowerCase();
                                    const eId = eq.id || eq.equipmentId;
                                    if ((itEqId && (itEqId === eId || itEqId === eq.equipment_id)) || 
                                        (itEqName && (itEqName === eName || eName.includes(itEqName) || itEqName.includes(eName)))) {
                                      return true;
                                    }
                                  }

                                  return itEqName && (itEqName === gLower || gLower.includes(itEqName) || itEqName.includes(gLower));
                                });
                                
                                if (eqParts.length === 0) return null;

                                return (
                                  <div className="p-2 border-t border-slate-200 bg-slate-50/50 print-no-break">
                                    <div className="bg-slate-50 rounded-md border border-slate-300 overflow-hidden">
                                      <table className="w-full text-left break-words">
                                        <thead>
                                          <tr className="bg-slate-200/50 text-[8px] text-slate-600 uppercase border-b border-slate-300">
                                            <th className="px-3 py-1">Peças Utilizadas neste Equipamento</th>
                                            <th className="px-3 py-1 text-center whitespace-nowrap">Qtd</th>
                                            {showPrices && <th className="px-3 py-1 text-right whitespace-nowrap">Total</th>}
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200">
                                          {eqParts.map((pIt, pIdx) => (
                                            <tr key={pIdx}>
                                              <td className="px-3 py-1 text-[8px] text-slate-700 uppercase break-words whitespace-normal">
                                                <span className="text-slate-900 mr-1">{pIt.quantity || 1}x</span> {pIt.description}
                                              </td>
                                              <td className="px-3 py-1 text-[8px] text-center text-slate-900 whitespace-nowrap">{pIt.quantity || 1}</td>
                                              {showPrices && <td className="px-3 py-1 text-[8px] text-right text-slate-900 whitespace-nowrap">R$ {(pIt.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })()}

                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Relatório de Atendimento e Evidências (Movido para baixo dos formulários) */}
                    {(vFd.technical_report || vFd.technicalReport || v.notes || vFd.parts_used || vFd.partsUsed || visitPhotos.length > 0 || vFd.videoUrl || vFd.video_url) && (
                      <div className="mt-4 border border-slate-200 rounded-lg bg-slate-50 overflow-hidden print-no-break shadow-sm">
                        <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-200 text-[10px] uppercase tracking-wider text-slate-700">
                          Relatório de Atendimento da Visita
                        </div>
                        <div className="p-3 bg-white flex flex-col gap-3">
                          {/* Relato do Técnico */}
                          {(vFd.technical_report || vFd.technicalReport || v.notes) && (
                            <div className="text-[10px] text-slate-800 leading-tight whitespace-pre-wrap">
                              <span className="uppercase text-slate-400 block mb-0.5 text-[9px]">Relato do Técnico:</span> 
                              {vFd.technical_report || vFd.technicalReport || v.notes}
                            </div>
                          )}

                          {/* Peças da Visita */}
                          {(vFd.parts_used || vFd.partsUsed) && (
                            <div className="text-[9px] text-slate-700 leading-tight">
                              <span className="uppercase text-slate-400 block mb-0.5 text-[9px]">Peças Utilizadas (Relato):</span> 
                              {vFd.parts_used || vFd.partsUsed}
                            </div>
                          )}

                          {/* Fotos */}
                          {(visitPhotos.length > 0 || vFd.videoUrl || vFd.video_url) && (
                            <div className={`mt-1 ${vFd.technical_report || vFd.technicalReport || v.notes || vFd.parts_used || vFd.partsUsed ? 'border-t border-slate-100 pt-2' : ''}`}>
                              <span className="uppercase text-[9px] text-slate-400 block mb-1.5">Evidências e Anexos:</span>
                              <div className="flex flex-wrap gap-2">
                                {(() => {
                                  const rawVid = vFd.videoUrl || vFd.video_url || '';
                                  const vidArr = typeof rawVid === 'string' ? rawVid.split(',').map((u: string) => u.trim()).filter(Boolean) : [];
                                  return vidArr.map((vUrl: string, vI: number) => (
                                    <div key={`vid-${vI}`} className="border border-slate-200 rounded p-1 w-[140px] h-[105px] overflow-hidden flex items-center justify-center bg-black relative shadow-sm">
                                      <a href={vUrl} target="_blank" rel="noopener noreferrer" className="w-full h-full relative flex items-center justify-center cursor-pointer">
                                        <video src={`${vUrl}#t=0.1`} preload="metadata" className="w-full h-full object-cover opacity-60" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <Play size={10} className="text-white opacity-80" />
                                        </div>
                                        <span className="absolute bottom-1 bg-black/60 text-white text-[7px] px-1 py-0.5 rounded uppercase leading-none z-10">Vídeo</span>
                                      </a>
                                    </div>
                                  ));
                                })()}
                                {visitPhotos.map((url: string, pIdx: number) => (
                                  <div key={pIdx} className="border border-slate-200 rounded p-1 w-[140px] h-[105px] overflow-hidden flex items-center justify-center bg-slate-50 shadow-sm">
                                    {isVideoUrl(url) ? (
                                      <a href={url} target="_blank" rel="noopener noreferrer" className="w-full h-full relative flex items-center justify-center bg-black cursor-pointer">
                                        <video src={`${url}#t=0.1`} preload="metadata" className="w-full h-full object-cover opacity-60" />
                                        <div className="absolute inset-0 flex items-center justify-center">
                                          <Play size={10} className="text-white opacity-80" />
                                        </div>
                                        <span className="absolute bottom-1 bg-black/60 text-white text-[7px] px-1 py-0.5 rounded uppercase leading-none z-10">Vídeo</span>
                                      </a>
                                    ) : (
                                      <a href={url} target="_blank" rel="noopener noreferrer" className="w-full h-full block cursor-pointer">
                                        <img src={url} className="w-full h-full object-contain" alt={`Foto ${pIdx + 1}`} />
                                      </a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Assinatura da Visita */}
                    {(() => {
                      const sigKey = Object.keys(vFd).find(k => k.toLowerCase().includes('assinatura') && typeof vFd[k] === 'string' && vFd[k].startsWith('http'));
                      const sigNameKey = Object.keys(vFd).find(k => k.toLowerCase().includes('assinatura') && k.toLowerCase().includes('nome'));
                      const sigDocKey = Object.keys(vFd).find(k => k.toLowerCase().includes('assinatura') && (k.toLowerCase().includes('documento') || k.toLowerCase().includes('cpf')));
                      
                      const sigUrl = sigKey ? vFd[sigKey] : null;
                      if (!sigUrl) return null;
                      
                      return (
                        <div className="mt-3 pt-2 border-t border-slate-200 flex flex-col items-start gap-1 break-inside-avoid">
                          <span className="uppercase text-[8px] text-slate-400 block mb-0.5">Assinatura da Visita</span>
                          <div>
                            <p className="text-[9px] uppercase text-slate-800">{vFd[sigNameKey as string] || 'Cliente'}</p>
                            {sigDocKey && vFd[sigDocKey] && <p className="text-[8px] text-slate-500">{vFd[sigDocKey]}</p>}
                          </div>
                          <div className="h-[40px] w-[100px] border border-slate-200 rounded bg-slate-50 flex items-center justify-center p-1 mt-1">
                            <img src={sigUrl} className="max-h-full max-w-full object-contain mix-blend-multiply" />
                          </div>
                        </div>
                      );
                    })()}

                    {/* Assinatura do responsável pelo impedimento (print) */}
                    {v.status === 'blocked' && (vFd.impediment_responsible || vFd.impediment_signature) && (
                      <div className="mt-3 pt-2 border-t border-red-200 flex flex-col items-start gap-1 break-inside-avoid">
                        <span className="uppercase text-[8px] text-red-500 block mb-0.5">Cliente / Responsável por acompanhar o atendimento</span>
                        {vFd.impediment_responsible && (
                          <p className="text-[9px] uppercase text-slate-800">{vFd.impediment_responsible}</p>
                        )}
                        {vFd.impediment_signature && (
                          <div className="h-[50px] w-[130px] border border-red-200 rounded bg-white flex items-center justify-center p-1 mt-1">
                            <img src={vFd.impediment_signature} className="max-h-full max-w-full object-contain mix-blend-multiply" alt="Assinatura responsável" />
                          </div>
                        )}
                      </div>
                    )}

                  </div>
                </div>
              );
            })}
          </div>
          );
        })()}

        {/* ── PEÇAS E MATERIAIS (sempre visível quando há itens) ── */}
        {enrichedItems.length > 0 && (
          <div className="border border-slate-300 rounded-lg overflow-hidden print-no-break mt-4">
            <div className="bg-slate-100 px-3 py-1 border-b border-slate-300 text-[9px] uppercase tracking-wider text-slate-700">{showPrices ? 'Composição Financeira' : 'Peças e Materiais Aplicados'}</div>
            <div className="w-full"><table className="w-full text-left break-words">
              <thead>
                <tr className="bg-slate-50 text-[8px] text-slate-500 uppercase border-b border-slate-200">
                  <th className="px-3 py-1">Item</th>
                  <th className="px-3 py-1 text-center whitespace-nowrap">Qtd</th>
                  {showPrices && <th className="px-3 py-1 text-right whitespace-nowrap">Unit.</th>}
                  {showPrices && <th className="px-3 py-1 text-right whitespace-nowrap">Total</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {enrichedItems.map((it: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-1 text-[9px] uppercase text-slate-800 break-words whitespace-normal">
                      <span className="text-slate-900 mr-1">{it.quantity || 1}x</span> {it.description}
                      {it.equipmentName && <span className="block text-[7px] text-slate-400 font-normal mt-0.5">Ref: {it.equipmentName}</span>}
                    </td>
                    <td className="px-3 py-1 text-[9px] text-center text-slate-900 whitespace-nowrap">{it.quantity || 1}</td>
                    {showPrices && <td className="px-3 py-1 text-[9px] text-right text-slate-600 whitespace-nowrap">R$ {(it.unitPrice || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                    {showPrices && <td className="px-3 py-1 text-[9px] text-right text-slate-900 whitespace-nowrap">R$ {(it.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                  </tr>
                ))}
              </tbody>
            </table></div>
            {showPrices && (
              <div className="bg-slate-800 text-white px-3 py-1.5 flex justify-end gap-6 items-center border-t border-slate-800">
                <span className="text-[8px] uppercase tracking-widest text-slate-300">Total Geral</span>
                <span className="text-[11px] tracking-tighter">R$ {totalItems.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        )}

        {/* Assinatura e Validação */}
        <div className="border border-slate-300 rounded-lg overflow-hidden print-no-break mt-4">
          <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 text-xs uppercase tracking-wider text-slate-700">Validação e Assinaturas (Auditoria Digital)</div>
          <div className="grid grid-cols-2 divide-x divide-slate-300 bg-white text-center">
            <div className="p-4 flex flex-col items-center justify-center gap-3">
              <p className="text-xs text-slate-400 uppercase tracking-widest">Responsável Técnico</p>
              <div className="h-[60px] flex items-center justify-center overflow-hidden">
                {tech?.avatar ? (
                  <img src={tech.avatar} alt="Avatar" className="max-h-full max-w-full object-contain mix-blend-multiply rounded-md" />
                ) : (
                  <span className="text-slate-200 italic text-xs uppercase">Validação Eletrônica no Sistema</span>
                )}
              </div>
              <div className="w-full border-t border-slate-300 pt-2">
                <p className="text-xs text-slate-900 uppercase">{tech?.name || 'Não Atribuído'}</p>
              </div>
            </div>
            <div className="p-4 flex flex-col items-center justify-center gap-3">
              <p className="text-xs text-slate-400 uppercase tracking-widest">Responsável pela Conformidade (Cliente)</p>
              <div className="h-[80px] flex items-center justify-center">
                {clientSigPrint ? (
                  <img src={clientSigPrint} className="max-h-full max-w-full object-contain mix-blend-multiply" alt="Assinatura" />
                ) : (
                  <span className="text-slate-300 italic text-xs uppercase">Sem assinatura física registrada</span>
                )}
              </div>
              <div className="w-full border-t border-slate-300 pt-2">
                <p className="text-[8px] text-slate-400 uppercase tracking-widest mb-0.5">Assinado por:</p>
                <p className="text-xs text-slate-900 uppercase">{clientNamePrint || 'Não Informado'}</p>
                {clientDocPrint && <p className="text-[9px] text-slate-500 uppercase tracking-widest leading-none mt-0.5">{clientDocPrint}</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 pt-4 border-t-2 border-slate-800 flex justify-between items-center text-slate-500">
        <div className="flex items-center gap-2">
          <NexusBranding size="lg" className="opacity-80 origin-left scale-75" />
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-[#1c2d4f]">Uma solução DUNO</p>
          <p className="text-xs uppercase tracking-tight mt-0.5">Documento emitido eletronicamente. Auditável na plataforma central.</p>
        </div>
      </div>
    </div>
  );

  if (isPrint) return (
    <div className="public-view-wrapper font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap');
        .public-view-wrapper, .public-view-wrapper * {
            font-family: 'Poppins', sans-serif !important;
        }
        @media print {
          @page {
            margin: 10mm 4mm 10mm 4mm;
            size: A4 portrait;
          }
          html, body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          /* Permite que o conteúdo flua entre páginas naturalmente */
          .print-section {
            break-inside: auto;
            orphans: 3;
            widows: 3;
          }
          /* O cabeçalho de cada bloco/grupo não pode ficar órfão */
          .print-section-header {
            break-after: avoid;
            break-inside: avoid;
          }
          /* Bloco de item de checklist: permite quebra, mas o par pergunta+resposta fica junto */
          .print-checklist-row {
            break-inside: avoid;
            orphans: 2;
            widows: 2;
          }
          /* Blocos que NUNCA devem ser cortados (assinatura, total, peças) */
          .print-no-break {
            break-inside: avoid;
          }
          /* Evita página em branco no final */
          .print-last-section {
            break-after: auto;
          }
        }
      `}</style>
      <PrintLayout />
    </div>
  );

  // ── WEB LAYOUT ─────────────────────────────────────────────────────────────
  return (
    <div className="public-view-wrapper font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap');
        
        /* 🛡️ Nexus Fix: Força a rolagem no Link Público */
        html, body {
            overflow: auto !important;
            height: auto !important;
            min-height: 100vh !important;
        }

        .public-view-wrapper, .public-view-wrapper * {
            font-family: 'Poppins', sans-serif !important;
        }
      `}</style>
      <div className="hidden print:!block">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap');
          @media print {
            @page {
              margin: 10mm 4mm 10mm 4mm;
              size: A4 portrait;
            }
            html, body {
              margin: 0 !important;
              padding: 0 !important;
              background: white !important;
            }
            .print-section {
              break-inside: auto;
              orphans: 3;
              widows: 3;
            }
            .print-section-header {
              break-after: avoid;
              break-inside: avoid;
            }
            .print-checklist-row {
              break-inside: avoid;
              orphans: 2;
              widows: 2;
            }
            .print-no-break {
              break-inside: avoid;
            }
          }
        `}</style>
        <PrintLayout />
      </div>
      <div className="min-h-screen bg-slate-50 font-poppins selection:bg-[#1c2d4f]/10 print:hidden">
        {/* ── TOP ACCENT BAR ── */}
        <div className="h-1 w-full bg-gradient-to-r from-[#1c2d4f] via-[#3e5b99] to-[#1c2d4f]" />

        {/* ── STICKY HEADER ── */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm print:hidden">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-4">
            {/* Company identity */}
            <div className="flex items-center gap-4 min-w-0">
              {companyLogo
                ? <img src={companyLogo} alt={companyName} className="h-10 sm:h-12 w-auto object-contain shrink-0" />
                : (
                  <div className="w-10 h-10 bg-[#1c2d4f] rounded-xl flex items-center justify-center shrink-0">
                    <Hexagon size={20} className="text-white fill-white/10" />
                  </div>
                )
              }
              <div className="flex-1 min-w-0">
                <h1 className="text-sm sm:text-base text-slate-900 uppercase tracking-tight sm:truncate leading-none mb-1">{companyName}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {companyDoc && (
                    <span className="text-xs text-slate-500 uppercase tracking-widest whitespace-nowrap flex items-center gap-1">
                      CNPJ: {companyDoc}
                    </span>
                  )}
                  {companyPhone && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 uppercase tracking-widest whitespace-nowrap text-opacity-80">
                      <Phone size={9} className="text-[#3e5b99]" /> {companyPhone}
                    </span>
                  )}
                  {companyWebsite && (
                    <span className="flex items-center gap-1 text-xs text-slate-500 uppercase tracking-widest whitespace-nowrap text-opacity-80">
                      <Globe size={9} className="text-[#3e5b99]" /> {companyWebsite.replace(/^https?:\/\//, '')}
                    </span>
                  )}
                  {companyAddress && (
                    <span className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 uppercase tracking-widest leading-tight">
                      <MapPin size={10} className="text-[#3e5b99] shrink-0" /> <span className="flex-1">{companyAddress}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Print button */}
            <button
              onClick={() => triggerSmartPrint(false)}
              className="flex items-center justify-center h-10 w-10 sm:w-auto sm:px-4 sm:py-2.5 bg-[#1c2d4f] text-white rounded-xl text-xs uppercase tracking-widest hover:bg-[#2a457a] transition-all shadow-md active:scale-95 shrink-0"
            >
              <Printer size={16} />
              <span className="hidden sm:inline ml-2">Imprimir</span>
            </button>
          </div>
        </header>

        {/* ── OS HERO BANNER ── */}
        <div className="bg-[#1c2d4f] print:hidden">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-5 sm:py-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            {/* OS identity */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 shrink-0">
                <Wrench size={22} className="text-white" />
              </div>
              <div>
                <p className="text-xs text-white/40 uppercase tracking-[0.3em] leading-none mb-1">Ordem de Serviço</p>
                <h2 className="text-xl sm:text-2xl text-white uppercase tracking-tighter leading-none">
                  #{order.displayId || order.id.slice(0, 8).toUpperCase()}
                </h2>
                <p className="text-xs text-white/50 uppercase tracking-wide mt-1">{order.title}</p>
              </div>
            </div>

            {/* Status + priority */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className={`px-2.5 py-1 rounded-full text-xs uppercase tracking-widest border flex items-center gap-1.5 ${{
                'PENDENTE': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
                'ATRIBUÍDO': 'bg-sky-500/20 text-sky-300 border-sky-500/30',
                'EM DESLOCAMENTO': 'bg-fuchsia-500/20 text-fuchsia-300 border-fuchsia-500/30',
                'EM ANDAMENTO': 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
                'CONCLUÍDO': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                'CANCELADO': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
                'IMPEDIDO': 'bg-red-500/20 text-red-300 border-red-500/30'
              }[order.status] || 'bg-white/10 text-white/70 border-white/10'
                }`}>
                <span className={`w-1 h-1 rounded-full animate-pulse-subtle ${{
                  'PENDENTE': 'bg-slate-400',
                  'ATRIBUÍDO': 'bg-sky-400',
                  'EM DESLOCAMENTO': 'bg-fuchsia-400',
                  'EM ANDAMENTO': 'bg-indigo-400',
                  'CONCLUÍDO': 'bg-emerald-400',
                  'CANCELADO': 'bg-rose-400',
                  'IMPEDIDO': 'bg-red-400'
                }[order.status] || 'bg-white/50'
                  }`} />
                {order.status}
              </div>
              <div className="px-2.5 py-1 bg-white/10 rounded-full text-xs text-white/70 uppercase tracking-widest border border-white/10">
                {order.priority}
              </div>
              <div className="px-2.5 py-1 bg-white/10 rounded-full text-xs text-white/70 uppercase tracking-widest border border-white/10 flex items-center gap-1.5">
                <Calendar size={10} /> {fmt(order.createdAt)}
              </div>
            </div>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <main className="max-w-6xl mx-auto px-2 sm:px-8 py-6 sm:py-12 flex flex-col gap-6 sm:gap-10 print:hidden">

          {/* ── ROW 1: Cliente + Localização ── */}
          <div className="flex flex-col gap-4 lg:gap-6">
            <div className="bg-slate-200/50 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/30 p-4 sm:p-5">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-[#3e5b99]/10 rounded-xl flex items-center justify-center shrink-0">
                    <UserIcon size={18} className="text-[#3e5b99]" />
                  </div>
                  <div>
                    <p className="text-xl text-slate-900 uppercase tracking-tight leading-none">{order.customerName}</p>
                    {order.operationType && (
                      <span className="text-[10px] text-[#3e5b99] uppercase tracking-widest bg-[#3e5b99]/10 px-2 py-0.5 rounded-full mt-1.5 inline-block">{order.operationType}</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                  {(freshCustomerPhone || freshCustomerEmail) && (
                    <div className="flex flex-col gap-1.5">
                      {freshCustomerPhone && (
                        <div className="flex items-center gap-2.5">
                          <Phone size={14} className="text-[#3e5b99] shrink-0" />
                          <p className="text-xs text-slate-700 uppercase tracking-wide">{freshCustomerPhone}</p>
                        </div>
                      )}
                      {freshCustomerEmail && (
                        <div className="flex items-center gap-2.5">
                          <Mail size={14} className="text-[#3e5b99] shrink-0" />
                          <p className="text-xs text-slate-600 truncate max-w-[200px]">{freshCustomerEmail}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {displayAddress && (
                    <div className="flex items-start gap-2.5 max-w-[300px]">
                      <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-500 leading-snug uppercase whitespace-pre-line">{displayAddress}</p>
                    </div>
                  )}

                  <div className="flex gap-6 border-l border-slate-300/50 pl-6">
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 uppercase tracking-[0.1em] mb-0.5">Abertura</span>
                      <span className="text-xs text-slate-800">{fmt(order.createdAt)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] text-slate-400 uppercase tracking-[0.1em] mb-0.5">Agendado</span>
                      <span className="text-xs text-slate-800">{order.scheduledDate ? fmt(order.scheduledDate) : '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/30 p-3.5 sm:p-4">
              <SectionHeader icon={<Box size={15} />} title={`Equipamento${linkedEquipments.length > 1 ? 's' : ''} Vinculado${linkedEquipments.length > 1 ? 's' : ''}`} />
              {linkedEquipments.length > 0 ? (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="overflow-x-auto w-full"><table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-widest border-b border-slate-200">
                        <th className="px-4 py-2.5">Equipamento</th>
                        <th className="px-4 py-2.5">Modelo</th>
                        <th className="px-4 py-2.5">Nº Série</th>
                        <th className="px-4 py-2.5">Família</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {linkedEquipments.map((eq: any, i: number) => (
                        <tr key={eq.id || i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 text-xs text-slate-900 uppercase">{eq.equipment_name || eq.equipmentName || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-600 uppercase">{eq.equipment_model || eq.equipmentModel || '—'}</td>
                          <td className="px-4 py-2.5 text-xs text-slate-500 ">{eq.equipment_serial || eq.equipmentSerial || '—'}</td>
                          <td className="px-4 py-2.5">
                            {(eq.equipment_family || eq.equipmentFamily) ? (
                              <span className="text-xs text-[#3e5b99] uppercase bg-[#3e5b99]/10 px-2 py-0.5 rounded-full">{eq.equipment_family || eq.equipmentFamily}</span>
                            ) : <span className="text-xs text-slate-300">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>
              ) : (order.equipmentName || order.equipmentModel || order.equipmentSerial) ? (
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 shrink-0">
                    <Box size={18} className="text-slate-300" />
                  </div>
                  <div className="space-y-0.5">
                    <p className="text-sm text-slate-900 uppercase leading-snug">{order.equipmentName || '—'}</p>
                    <p className="text-xs text-slate-500 uppercase">
                      {[order.equipmentModel && `Modelo: ${order.equipmentModel}`, order.equipmentSerial && `Série: ${order.equipmentSerial}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400 uppercase tracking-widest">Equipamento não especificado</p>
              )}
            </div>
          </div>

          {/* ── ROW 2: Relatório Técnico ── */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 p-8 sm:p-10">
            <SectionHeader icon={<FileText size={15} />} title="Relatório Técnico de Execução" />

            {/* Timeline bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                <div className="w-8 h-8 bg-[#1c2d4f]/10 rounded-xl flex items-center justify-center shrink-0 overflow-hidden">
                  {tech?.avatar ? (
                    <img 
                      src={tech.avatar} 
                      alt={tech.name} 
                      className="w-full h-full object-cover" 
                    />
                  ) : (
                    <UserIcon size={14} className="text-[#1c2d4f]" />
                  )}
                </div>
                <div>
                  <p className="text-xs text-slate-400 uppercase tracking-widest">Técnico</p>
                  <p className="text-xs text-slate-800 uppercase">{tech?.name || 'Não Atribuído'}</p>
                </div>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                  <Clock size={14} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-emerald-400 uppercase tracking-widest">Check-In</p>
                  <p className="text-xs text-emerald-800">{fmtDT(orderVisits.find((v: any) => v.arrival_time)?.arrival_time || order.startDate)}</p>
                </div>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-emerald-400 uppercase tracking-widest">Concluído</p>
                  <p className="text-xs text-emerald-800">{fmtDT(order.endDate || [...orderVisits].reverse().find((v: any) => v.departure_time)?.departure_time)}</p>
                </div>
              </div>
            </div>

            {/* Service description */}
            {order.description && (
              <div className="p-5 bg-[#1c2d4f]/5 rounded-xl border border-[#1c2d4f]/10">
                <p className="text-xs text-[#1c2d4f] uppercase tracking-widest mb-2">Descrição do problema</p>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{order.description}</p>
              </div>
            )}
          </div>

          {/* ── IMPEDIMENTO (if any) ── */}
          {(order.status === 'IMPEDIDO' || (order.formData as any)?.impediment_reason || (order.formData as any)?.blockReason) && (() => {
            const fd = (order.formData as any) || {};
            const reason = fd.impediment_reason || fd.blockReason || order.notes?.replace('IMPEDIMENTO: ', '') || 'Sem motivo detalhado.';
            const blockPhoto = fd.blockPhotoUrl;
            return (
              <div className="bg-red-50 rounded-3xl border border-red-100 shadow-md shadow-red-100/50 p-8 sm:p-10">
                <SectionHeader icon={<ShieldAlert size={15} />} title="Aviso de Impedimento" color="text-red-600" />
                <p className="text-sm text-red-800 italic mb-4">"{reason}"</p>
                {blockPhoto && (
                  (blockPhoto.startsWith('http://') || blockPhoto.startsWith('https://')) ? (
                    <a href={blockPhoto} target="_blank" rel="noreferrer" className="block">
                      <img src={blockPhoto} alt="Foto do impedimento" className="w-full max-w-sm rounded-xl border border-red-200 object-cover cursor-zoom-in hover:opacity-90 transition-all" style={{maxHeight: 240}} />
                      <span className="text-xs text-red-400 uppercase tracking-widest mt-2 block">Foto do Impedimento (clique para ampliar)</span>
                    </a>
                  ) : (
                    <div className="flex items-center gap-2 p-3 bg-red-100/60 border border-red-200 rounded-xl">
                      <span className="text-red-400" style={{fontSize: 16}}>&#128247;</span>
                      <span className="text-xs text-red-500 ">Foto registrada pelo técnico (disponível apenas no app mobile)</span>
                    </div>
                  )
                )}
              </div>
            );
          })()}


          {/* ── SEÇÃO CONSOLIDADA REMOVIDA ── */}
          {false && (() => {
            const getFormData = (fd: any) => {
               if (!fd) return {};
               if (typeof fd === 'string') {
                 try { return JSON.parse(fd); } catch { return {}; }
               }
               return fd;
            };

            // 1. Coleta todos os dados de formulário (OS + Equipamentos)
            const allData: Record<string, any> = { ...getFormData(order.formData) };
            linkedEquipments.forEach(eq => {
              const eqFd = getFormData(eq.form_data);
              Object.assign(allData, eqFd);
            });

            // 2. Agrupa itens pelo prefixo [Grupo]
            const groups: Record<string, Record<string, any>> = {};
            Object.entries(allData).forEach(([key, val]) => {
               // Remove chaves de sistema antes de agrupar para evitar cards vazios
               const SYSTEM_KEYS = new Set([
                'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
                'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
                'impediment_reason', 'impediment_photos', 'impedimento_tipo', 'impedimento_motivo', 'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo', 'impedimento_fotos', 'impediment_at', 'totalValue', 'price', 'execution_forms',
                'finishedAt', 'completedAt', 'technical_report', 'parts_used',
                'technicalReport', 'partsUsed', 'blockReason', 'clientDoc',
                'clientName', 'customerName', 'customerAddress', 'tenantId',
                'assignedTo', 'formId', 'billingStatus', 'paymentMethod',
                'extra_photos', 'photos', 'equipment_ids', 'videoUrl', 'video_url'
               ]);
               if (SYSTEM_KEYS.has(key)) return;
               if (key.toLowerCase().includes('assinatura') || key.toLowerCase().includes('signature')) return;

               const match = key.match(/^\[(.*?)\]\s*(?:-|$)/);
               const groupName = match ? match[1] : 'Relatório Geral';
               if (!groups[groupName]) groups[groupName] = {};
               groups[groupName][key] = val;
            });

            // 3. Ordena os grupos e as perguntas dentro dos grupos
            const normalizeForSort = (s: string) => s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/^[\d\s.]*/, '').replace(/[^a-z0-9]/g, '');

            const sortedGroups = Object.entries(groups).map(([groupName, groupData]) => {
               const currentFormId = order.formId;
               const templateOrder = currentFormId ? (formTemplates[currentFormId] || []) : [];
               
               const eqMatch = linkedEquipments.find(e => {
                  const eName = (e.equipment_name || e.equipmentName || '').toLowerCase();
                  const gn = groupName.toLowerCase();
                  return gn.includes(eName) || eName.includes(gn);
               });
               const specificOrder = eqMatch?.form_id ? (formTemplates[eqMatch.form_id] || []) : [];
               
               // Coleta ordem combinada dos templates envolvidos (Geral + Específico)
               const combinedOrder = Array.from(new Set([...templateOrder, ...specificOrder]));

               // Converte para entradas anexando índice original para garantir estabilidade
               const entries = Object.entries(groupData).map((e, i) => ({ 
                 key: e[0], 
                 val: e[1], 
                 originalIdx: i 
               }));
               const normalizedOrder = combinedOrder.map(normalizeForSort);

               entries.sort((a, b) => {
                 const matchA = a.key.replace(/^\[.*?\]\s*-\s*/, '').match(/(?:#\s*(\d+)|^(\d+)\s*#)/);
                 const matchB = b.key.replace(/^\[.*?\]\s*-\s*/, '').match(/(?:#\s*(\d+)|^(\d+)\s*#)/);
                 if (matchA && matchB) {
                   return parseInt(matchA[1] || matchA[2], 10) - parseInt(matchB[1] || matchB[2], 10);
                 }

                 const cleanA = normalizeForSort(a.key.replace(/^\[.*?\]\s*-\s*/, ''));
                 const cleanB = normalizeForSort(b.key.replace(/^\[.*?\]\s*-\s*/, ''));
                 
                 // 🏃‍♂️ Nexus Engine: Prioridade para match exato
                   let idxA = normalizedOrder.indexOf(cleanA);
                   let idxB = normalizedOrder.indexOf(cleanB);
                   
                   // Fallback para similaridade controlada
                   if (idxA === -1) idxA = normalizedOrder.findIndex(label => cleanA === label || cleanA.startsWith(label));
                   if (idxB === -1) idxB = normalizedOrder.findIndex(label => cleanB === label || cleanB.startsWith(label));
                   
                   // Decisão de posicionamento
                   if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                   if (idxA !== -1) return -1;
                   if (idxB !== -1) return 1;
                   
                   // Nexus Stability: Mantém a ordem de criação/gravação para campos extras
                   return a.originalIdx - b.originalIdx;
                 });
               
               // Reconstrói o groupData garantindo interatividade no mobile
               const orderedEntries = entries.map(e => [e.key, e.val]);
               return { groupName, groupData: Object.fromEntries(orderedEntries) };
            });

            if (sortedGroups.length === 0) return null;

            return (
              <div className="space-y-8">
                {sortedGroups.map(({ groupName, groupData }) => {
                  // Tenta encontrar metadados do equipamento correspondente
                  const eq = linkedEquipments.find(e => {
                    const eName = (e.equipment_name || e.equipmentName || '').toLowerCase();
                    const gn = groupName.toLowerCase();
                    return gn.includes(eName) || eName.includes(gn);
                  });

                  const title = eq ? (eq.equipment_name || eq.equipmentName) : groupName;
                  const serial = eq ? (eq.equipment_serial || eq.equipmentSerial) : null;
                  const fam = eq ? (eq.equipment_family || eq.equipmentFamily) : null;
                  
                  // Busca peças vinculadas a este equipamento específico
                  const eqParts = enrichedItems.filter(it => {
                    if (!eq) return false;
                    const itEqId = it.equipmentId;
                    const itEqName = (it.equipmentName || '').toLowerCase();
                    const eName = (eq.equipment_name || eq.equipmentName || '').toLowerCase();
                    const eId = eq.id || eq.equipmentId;
                    
                    return (itEqId && (itEqId === eId || itEqId === eq.equipment_id)) || 
                           (itEqName && (itEqName === eName || eName.includes(itEqName)));
                  });

                  const currentFormId = eq?.form_id || order.formId;
                  const tplFields = currentFormId ? (formTemplates[currentFormId] || []) : [];

                  return (
                    <CollapsibleFormSection
                      key={groupName}
                      formData={groupData}
                      order={{ ...order, templateFields: tplFields } as any}
                      onImageClick={openLightbox}
                      title={title}
                      icon={<Box size={16} />}
                      subtitle={`${fam ? fam + ' · ' : ''}${serial ? 'S/N: ' + serial : 'Checklist do Atendimento'}`}
                      parts={eqParts}
                      showPrices={showPrices}
                    />
                  );
                })}
              </div>
            );
          })()}

          {/* ── CARDS DE VISITAS (SEPARADOS COMO NO APP) ── */}
          {orderVisits.length > 0 && (() => {
            // Se showAllVisitsInPublicLink=false, exibe apenas a última visita concluída
            const visibleVisits = showAllVisitsInPublicLink
              ? orderVisits
              : (() => {
                  const last = [...orderVisits].reverse().find(v => v.status === 'completed') || orderVisits[orderVisits.length - 1];
                  return last ? [last] : [];
                })();
            if (visibleVisits.length === 0) return null;
            return (
            <div className="space-y-6">
              <SectionHeader icon={<Calendar size={15} />} title={showAllVisitsInPublicLink ? 'Histórico de Visitas' : 'Relatório de Atendimento'} />
              {visibleVisits.map((visit, idx) => (
                <VisitCard 
                  key={visit.id} 
                  visit={visit} 
                  idx={idx} 
                  order={order} 
                  linkedEquipments={linkedEquipments}
                  formTemplates={formTemplates}
                  showPrices={showPrices}
                  onImageClick={openLightbox}
                />
              ))}
            </div>
            );
          })()}


          {/* ── PEÇAS E MATERIAIS (sempre visível quando há itens) ── */}
          {enrichedItems.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 overflow-hidden">
              <div className="p-6 sm:p-8">
                <SectionHeader icon={<Package size={15} />} title="Peças e Materiais Aplicados" />
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="overflow-x-auto w-full"><table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-xs text-slate-400 uppercase tracking-widest border-b border-slate-200">
                        <th className="px-5 py-3">Descrição</th>
                        <th className="px-5 py-3 text-center w-20">Qtd</th>
                        {showPrices && <th className="px-5 py-3 text-right w-28">Unitário</th>}
                        {showPrices && <th className="px-5 py-3 text-right w-28">Total</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {enrichedItems.map((item, i) => (
                        <tr key={item.id || i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="text-xs text-slate-800 uppercase">
                              <span className="text-[#1c2d4f] mr-1">{item.quantity || 1}x</span> {item.description}
                            </span>
                            {item.equipmentName && (
                              <div className="flex items-center gap-1 text-xs text-slate-400 uppercase mt-1">
                                <Box size={10} className="text-slate-300" /> {item.equipmentName}
                              </div>
                            )}
                            {item.fromStock && <span className="text-xs text-emerald-600 uppercase mt-1 block">✦ Estoque Técnico</span>}
                          </td>
                          <td className="px-5 py-3.5 text-center text-xs text-slate-500 ">{item.quantity}</td>
                          {showPrices && <td className="px-5 py-3.5 text-right text-xs  text-slate-500">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                          {showPrices && <td className="px-5 py-3.5 text-right text-xs text-slate-900 ">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>

                {/* Total bar — somente se valores estiverem habilitados */}
                {showPrices && (
                  <div className="mt-4 flex items-center justify-between bg-[#1c2d4f] text-white px-6 py-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <DollarSign size={18} className="opacity-60" />
                      <span className="text-xs uppercase tracking-widest opacity-70">Total do Atendimento</span>
                    </div>
                    <span className="text-xl tracking-tighter">
                      R$ {totalItems.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}


          {/* ── CARD DE CONCLUSÃO GLOBAL REMOVIDO (DADOS AGORA ESTÃO DENTRO DAS VISITAS) ── */}


          {/* ── ASSINATURAS (sempre visível no final) ── */}
          {(() => {
            const fd: Record<string, any> = typeof order.formData === 'string'
              ? (() => { try { return JSON.parse(order.formData); } catch { return {}; } })()
              : (order.formData || {});

            // 🎯 Usar os dados já extraídos e unificados no topo do componente
            const clientSig = signatureInfo.signature;
            const clientName = signatureInfo.name;
            const clientDoc = signatureInfo.doc;

            return (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 p-8 sm:p-10">
                <SectionHeader icon={<CheckCircle2 size={15} />} title="Validação e Assinaturas" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                  {/* Técnico */}
                  <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-xl border border-slate-100 gap-4">
                    <div className="w-14 h-14 bg-[#1c2d4f]/10 rounded-2xl flex items-center justify-center overflow-hidden border border-slate-200/50 shadow-sm">
                      {tech?.avatar ? (
                        <img 
                          src={tech.avatar} 
                          alt={tech.name} 
                          className="w-full h-full object-cover" 
                        />
                      ) : (
                        <UserIcon size={24} className="text-[#1c2d4f]" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Técnico Responsável</p>
                      <p className="text-sm text-slate-900 uppercase">{tech?.name || 'Não Atribuído'}</p>
                      {tech?.email && <p className="text-xs text-slate-400 mt-0.5">{tech.email}</p>}
                    </div>
                    <div className="w-full border-t-2 border-dashed border-slate-200 pt-3">
                      <p className="text-xs text-slate-300 uppercase tracking-widest">Assinatura do Prestador</p>
                    </div>
                  </div>

                  {/* Cliente / Responsável que assinou */}
                  <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-xl border border-slate-100 gap-4">
                    {/* Nome de quem assinou (digitado no app) */}
                    <div>
                      <p className="text-xs text-slate-400 uppercase tracking-widest mb-1">Responsável pela Assinatura</p>
                      {clientName ? (
                        <p className="text-sm text-slate-900 uppercase">{clientName}</p>
                      ) : (
                        <p className="text-xs text-slate-300 uppercase italic">Nome não informado</p>
                      )}
                      {clientDoc && <p className="text-xs text-slate-400  mt-0.5">Doc: {clientDoc}</p>}
                    </div>

                    {/* Assinatura digital */}
                    {clientSig ? (
                      <div
                        className="w-full h-28 flex items-center justify-center bg-white rounded-xl border border-slate-200 cursor-zoom-in hover:border-[#3e5b99]/30 transition-colors"
                        onClick={() => openLightbox(clientSig)}
                      >
                        <img
                          src={clientSig}
                          className="max-h-24 max-w-full object-contain mix-blend-multiply"
                          alt="Assinatura"
                        />
                      </div>
                    ) : (
                      <div className="w-full h-28 flex flex-col items-center justify-center bg-white rounded-xl border-2 border-dashed border-slate-200 gap-2">
                        <div className="w-8 h-8 rounded-full bg-slate-100" />
                        <p className="text-xs text-slate-300 uppercase tracking-widest">Sem assinatura registrada</p>
                      </div>
                    )}

                    <div className="w-full border-t-2 border-dashed border-slate-200 pt-3">
                      <p className="text-xs text-slate-300 uppercase tracking-widest">Assinatura do Cliente</p>
                    </div>
                  </div>

                </div>
              </div>
            );
          })()}

        </main>

        {/* ── FOOTER NEXUS ── */}
        <footer className="mt-8 sm:mt-12 lg:mt-auto border-t border-slate-200 bg-white print:hidden">
          <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <NexusBranding size="lg" className="opacity-80 transform scale-[0.55] sm:scale-[0.7] origin-left" />
            </div>
            <div className="text-center sm:text-right space-y-0.5">
              <p className="text-xs text-slate-400 uppercase tracking-[0.2em]">Uma solução DUNO</p>
              <p className="text-xs text-slate-300 uppercase tracking-widest">
                Documento emitido eletronicamente · Autenticidade garantida pela plataforma
              </p>
            </div>
          </div>
        </footer>

        {/* ── LIGHTBOX CAROUSEL ── */}
        {lightboxState && (
          <div
            className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 sm:p-10 animate-fade-in"
          >
            <div className="absolute inset-0 cursor-zoom-out" onClick={() => setLightboxState(null)} />
            
            <div className="relative z-10 w-full h-full flex items-center justify-center pointer-events-none">
              {isVideoUrl(lightboxState.images[lightboxState.currentIndex]) ? (
                <video
                  key={lightboxState.images[lightboxState.currentIndex]}
                  src={lightboxState.images[lightboxState.currentIndex]}
                  controls
                  autoPlay
                  className="max-w-full max-h-full rounded-3xl shadow-2xl pointer-events-auto"
                />
              ) : (
                <img
                  key={lightboxState.images[lightboxState.currentIndex]}
                  src={lightboxState.images[lightboxState.currentIndex]}
                  className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl pointer-events-auto"
                  alt="Visualização"
                />
              )}
            </div>

            {lightboxState.images.length > 1 && (
              <>
                <button
                  className="absolute left-4 sm:left-10 top-1/2 -translate-y-1/2 p-3 sm:p-4 bg-white/10 hover:bg-white/20 rounded-full text-white shadow-xl transition-all active:scale-95 z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxState(prev => prev ? { ...prev, currentIndex: (prev.currentIndex - 1 + prev.images.length) % prev.images.length } : null);
                  }}
                >
                  <ChevronLeft size={28} />
                </button>
                <button
                  className="absolute right-4 sm:right-10 top-1/2 -translate-y-1/2 p-3 sm:p-4 bg-white/10 hover:bg-white/20 rounded-full text-white shadow-xl transition-all active:scale-95 z-20"
                  onClick={(e) => {
                    e.stopPropagation();
                    setLightboxState(prev => prev ? { ...prev, currentIndex: (prev.currentIndex + 1) % prev.images.length } : null);
                  }}
                >
                  <ChevronRight size={28} />
                </button>
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 bg-white/10 backdrop-blur-md rounded-full text-white text-xs font-medium tracking-widest uppercase z-20">
                  {lightboxState.currentIndex + 1} / {lightboxState.images.length}
                </div>
              </>
            )}

            <button
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors shadow-sm z-20"
              onClick={() => setLightboxState(null)}
            >
              <XIcon size={22} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

const XIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
