import React, { useState } from 'react';
import { ServiceOrder, User } from '../../types';
import {
  Calendar, MapPin, Printer, Hexagon, Box, User as UserIcon, Tag,
  CheckCircle2, FileText, ShieldAlert, Mail, Phone, DollarSign,
  ChevronDown, ChevronUp, Clock, Wrench, Package, ClipboardList, Image as ImageIcon
} from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { DataService } from '../../services/dataService';
import { NexusBranding } from '../ui/NexusBranding';

interface PublicOrderViewProps {
  order: ServiceOrder | null;
  techs: User[];
  isPrint?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ icon: React.ReactNode; title: string; color?: string }> = ({
  icon, title, color = 'text-[#1c2d4f]'
}) => (
  <div className={`flex items-center gap-3 pb-4 border-b border-slate-100 mb-6`}>
    <div className={`w-8 h-8 rounded-xl flex items-center justify-center bg-slate-100 ${color}`}>
      {icon}
    </div>
    <h3 className={`text-[11px] font-black uppercase tracking-[0.2em] ${color}`}>{title}</h3>
  </div>
);

const InfoPill: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{label}</span>
    <span className={`text-sm font-bold text-slate-800 ${mono ? 'font-mono' : 'uppercase'}`}>{value || '—'}</span>
  </div>
);

const CollapsibleFormSection: React.FC<{
  formData: Record<string, any>;
  order: ServiceOrder;
  onImageClick: (url: string) => void;
}> = ({ formData, order, onImageClick }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Filtra apenas campos de texto (perguntas/respostas do formulário)
  // Exclui imagens, assinaturas e metadados internos
  const SKIP_KEYS = ['signature', 'signatureName', 'signatureDoc', 'signatureBirth',
    'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
    'impediment_reason', 'impediment_photos', 'totalValue', 'price'];

  const textEntries = Object.entries(formData).filter(([key, val]) => {
    if (SKIP_KEYS.includes(key)) return false;
    if (Array.isArray(val)) return false;
    if (typeof val === 'string' && (val.startsWith('data:image') || val.startsWith('http'))) return false;
    // Campos de assinatura/CPF/nascimento são mostrados no bloco de assinaturas
    if (
      key.toLowerCase().includes('assinatura') ||
      key.toLowerCase().includes('cpf') ||
      key.toLowerCase().includes('nascimento') ||
      key.toLowerCase().includes('signature')
    ) return false;
    return true;
  });

  const photoGroups: { key: string; urls: string[] }[] = Object.entries(formData)
    .filter(([key]) => !key.toLowerCase().includes('assinatura') && !key.toLowerCase().includes('signature'))
    .flatMap(([key, val]) => {
      let photos: string[] = [];
      if (Array.isArray(val)) photos = val.filter(v => typeof v === 'string' && (v.startsWith('http') || v.startsWith('data:image')));
      else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) photos = [val];
      return photos.length > 0 ? [{ key, urls: photos }] : [];
    });

  if (textEntries.length === 0 && photoGroups.length === 0) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      {/* Collapsible Toggle */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 sm:px-8 py-5 hover:bg-slate-50 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <ClipboardList size={16} />
          </div>
          <div className="text-left">
            <p className="text-[11px] font-black text-slate-900 uppercase tracking-widest">Formulário Técnico</p>
            <p className="text-[9px] text-slate-400 font-medium mt-0.5">
              {textEntries.length} campos · {photoGroups.reduce((a, g) => a + g.urls.length, 0)} fotos
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px] font-black text-[#1c2d4f] uppercase tracking-widest group-hover:gap-3 transition-all">
          <span>{isOpen ? 'Fechar' : 'Ver mais'}</span>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded content */}
      {isOpen && (
        <div className="border-t border-slate-100 px-6 sm:px-8 py-6 space-y-8 animate-fade-in">

          {/* Text fields — two columns */}
          {textEntries.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {textEntries.map(([key, val]) => (
                <div key={key} className="flex flex-col gap-1.5 p-4 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{!isNaN(Number(key)) ? `Pergunta nº ${key}` : key}</span>
                  <span className={`text-sm font-bold leading-snug ${String(val).toLowerCase() === 'sim' || String(val).toLowerCase() === 'ok'
                    ? 'text-emerald-600 flex items-center gap-1'
                    : 'text-slate-800 uppercase'
                    }`}>
                    {(String(val).toLowerCase() === 'sim' || String(val).toLowerCase() === 'ok') && <CheckCircle2 size={13} />}
                    {String(val)}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Photos grouped by field */}
          {photoGroups.length > 0 && (
            <div className="space-y-6">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] flex items-center gap-2">
                <ImageIcon size={12} /> Evidências Fotográficas
              </p>
              {photoGroups.map(({ key, urls }) => (
                <div key={key} className="space-y-3">
                  <p className="text-[10px] font-black text-[#1c2d4f] uppercase tracking-wide flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#2a457a] rounded-full inline-block" />
                    {key}
                  </p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                    {urls.map((url, i) => (
                      <div
                        key={i}
                        className="aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 cursor-zoom-in group shadow-sm hover:shadow-md transition-all"
                        onClick={() => onImageClick(url)}
                      >
                        <img src={url} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" alt={key} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export const PublicOrderView: React.FC<PublicOrderViewProps> = ({ order, techs, isPrint = false }) => {
  const [tenant, setTenant] = React.useState<any>(null);
  const [fullscreenImage, setFullscreenImage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchTenantData = async () => {
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
  }, [order?.id]);

  if (!order) return null;

  const tech = techs.find(t => t.id === order.assignedTo);
  const companyName = tenant?.company_name || tenant?.name || tenant?.companyName || 'Nexus Pro';
  const companyLogo = tenant?.logo_url || tenant?.logoUrl;
  const companyAddress = tenant?.street
    ? `${tenant.street}${tenant.number ? ', ' + tenant.number : ''}${tenant.neighborhood ? ' - ' + tenant.neighborhood : ''}${tenant.city ? ', ' + tenant.city : ''}${tenant.state ? '/' + tenant.state : ''}`
    : (tenant?.address || '');
  const companyPhone = tenant?.phone || '';
  const companyEmail = tenant?.admin_email || tenant?.email || '';
  const companyDoc = tenant?.cnpj || tenant?.document || '';

  const fmt = (d?: string) => {
    if (!d) return '—';
    const date = d.includes('T') ? new Date(d) : new Date(d + 'T12:00:00');
    return date.toLocaleDateString('pt-BR');
  };
  const fmtDT = (d?: string) => {
    if (!d) return '—';
    return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const totalItems = order.items?.reduce((acc, i) => acc + i.total, 0) || 0;
  const hasForm = order.formData && Object.keys(order.formData).length > 0;

  // ── PRINT LAYOUT (unchanged, clean) ────────────────────────────────────────
  if (isPrint) {
    return (
      <div className="bg-white text-[10px] leading-tight font-sans p-6">
        {/* Print Header */}
        <div className="flex justify-between items-start pb-4 border-b-2 border-slate-800 mb-4">
          <div className="flex gap-4 items-center">
            {companyLogo
              ? <img src={companyLogo} alt="Logo" className="h-16 w-auto object-contain" />
              : <div className="bg-slate-900 p-2 rounded-lg flex items-center justify-center min-w-[60px] min-h-[60px]"><Hexagon size={32} className="text-white fill-white/10" /></div>
            }
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">{companyName}</h1>
              <div className="text-[9px] text-slate-600 max-w-[400px]">
                {companyAddress && <div>{companyAddress}</div>}
                <div className="flex gap-3 mt-0.5">
                  {companyPhone && <span className="font-semibold">Tel: {companyPhone}</span>}
                  {companyEmail && <span>Email: {companyEmail}</span>}
                </div>
                {companyDoc && <div className="mt-0.5">CNPJ: {companyDoc}</div>}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="border-2 border-slate-800 px-4 py-2 rounded-lg bg-slate-50">
              <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Ordem de Serviço</div>
              <div className="text-2xl font-black text-slate-900 tracking-tighter">#{order.displayId || order.id.slice(0, 8).toUpperCase()}</div>
            </div>
            <div className="text-[8px] font-bold text-slate-400 mt-2 uppercase tracking-wide">
              Emissão: {new Date().toLocaleDateString()} às {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </div>
          </div>
        </div>

        {/* Print body */}
        <div className="mb-3 border border-slate-300 rounded-lg overflow-hidden">
          <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Dados do chamado</div>
          <div className="grid grid-cols-12 divide-x divide-slate-200">
            <div className="col-span-7 p-2.5 space-y-2">
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Cliente</label><div className="font-bold text-slate-900 text-sm uppercase">{order.customerName}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Endereço</label><div className="font-medium text-slate-700 text-xs uppercase">{order.customerAddress}</div></div>
            </div>
            <div className="col-span-5 p-2.5 grid grid-cols-2 gap-3 bg-slate-50/30">
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Abertura</label><div className="font-bold">{fmt(order.createdAt)}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Tipo</label><div className="font-bold uppercase">{order.operationType || 'Manutenção'}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Status</label><div className="font-bold text-[9px] border border-slate-200 px-1.5 py-0.5 rounded inline-block bg-white uppercase">{order.status}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Técnico</label><div className="font-bold uppercase">{tech?.name || 'N/A'}</div></div>
            </div>
          </div>
        </div>

        {/* Print footer */}
        <div className="mt-8 pt-4 border-t border-slate-300 text-center">
          <p className="text-[7px] text-slate-400 uppercase tracking-widest">Documento emitido eletronicamente · Nexus Pro System</p>
        </div>
      </div>
    );
  }

  // ── WEB LAYOUT ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#F0F2F5] font-sans selection:bg-[#1c2d4f]/10">

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
            <div className="min-w-0">
              <h1 className="text-sm font-black text-slate-900 uppercase tracking-tight truncate leading-none">{companyName}</h1>
              <div className="hidden sm:flex flex-wrap items-center gap-x-4 gap-y-0.5 mt-1.5">
                {companyPhone && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                    <Phone size={9} className="text-[#3e5b99]" /> {companyPhone}
                  </span>
                )}
                {companyEmail && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                    <Mail size={9} className="text-[#3e5b99]" /> {companyEmail}
                  </span>
                )}
                {companyDoc && (
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                    CNPJ: {companyDoc}
                  </span>
                )}
                {companyAddress && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-xs">
                    <MapPin size={9} className="text-[#3e5b99] shrink-0" /> {companyAddress}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Print button */}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#1c2d4f] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#2a457a] transition-all shadow-md active:scale-95 shrink-0"
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Imprimir PDF</span>
          </button>
        </div>
      </header>

      {/* ── OS HERO BANNER ── */}
      <div className="bg-[#1c2d4f] print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          {/* OS identity */}
          <div className="flex items-center gap-5">
            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10 shrink-0">
              <Wrench size={26} className="text-white" />
            </div>
            <div>
              <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] leading-none mb-1.5">Ordem de Serviço</p>
              <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter leading-none">
                #{order.displayId || order.id.slice(0, 8).toUpperCase()}
              </h2>
              <p className="text-[10px] font-bold text-white/50 uppercase tracking-wide mt-1.5">{order.title}</p>
            </div>
          </div>

          {/* Status + priority */}
          <div className="flex items-center gap-3">
            <StatusBadge status={order.status} />
            <div className="px-3 py-1.5 bg-white/10 rounded-full text-[9px] font-black text-white/70 uppercase tracking-widest border border-white/10">
              {order.priority}
            </div>
            <div className="px-3 py-1.5 bg-white/10 rounded-full text-[9px] font-black text-white/70 uppercase tracking-widest border border-white/10 flex items-center gap-1.5">
              <Calendar size={11} /> {fmt(order.createdAt)}
            </div>
          </div>
        </div>
      </div>

      {/* ── MAIN CONTENT ── */}
      <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6 print:hidden">

        {/* ── ROW 1: Cliente + Localização ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
            <SectionHeader icon={<UserIcon size={15} />} title="Dados do Cliente" />
            <div className="space-y-4">
              <p className="text-lg font-black text-slate-900 uppercase leading-tight">{order.customerName}</p>
              <p className="text-sm font-medium text-slate-600 uppercase leading-relaxed">{order.customerAddress}</p>
              {order.operationType && (
                <div className="flex items-center gap-2 mt-1">
                  <Tag size={12} className="text-[#3e5b99]" />
                  <span className="text-[10px] font-bold text-[#3e5b99] uppercase tracking-widest bg-[#3e5b99]/10 px-2 py-0.5 rounded-full">{order.operationType}</span>
                </div>
              )}
              <div className="pt-3 border-t border-slate-100 grid grid-cols-2 gap-4">
                <InfoPill label="Abertura" value={fmt(order.createdAt)} />
                <InfoPill label="Agendado" value={order.scheduledDate ? `${fmt(order.scheduledDate)}${order.scheduledTime ? ' · ' + order.scheduledTime : ''}` : '—'} />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
            <SectionHeader icon={<Box size={15} />} title="Dados do Equipamento" />
            {(order.equipmentName || order.equipmentModel || order.equipmentSerial) ? (
              <div className="space-y-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center border border-slate-100 shrink-0">
                    <Box size={20} className="text-slate-300" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-base font-black text-slate-900 uppercase leading-snug">{order.equipmentName || '—'}</p>
                    {order.equipmentModel && <p className="text-[10px] font-bold text-slate-500 uppercase">Modelo: {order.equipmentModel}</p>}
                    {order.equipmentSerial && <p className="text-[10px] font-bold text-slate-400 font-mono">N° Série: {order.equipmentSerial}</p>}
                  </div>
                </div>
                <div className="pt-3 border-t border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Local do Atendimento</p>
                  <p className="text-sm font-medium text-slate-600 uppercase">{order.customerAddress}</p>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Equipamento não especificado</p>
                <div className="pt-2 border-t border-slate-100">
                  <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Local do Atendimento</p>
                  <p className="text-sm font-medium text-slate-700 uppercase">{order.customerAddress}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── ROW 2: Relatório Técnico ── */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
          <SectionHeader icon={<FileText size={15} />} title="Relatório Técnico de Execução" />

          {/* Timeline bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-[#1c2d4f]/10 rounded-xl flex items-center justify-center shrink-0">
                <UserIcon size={14} className="text-[#1c2d4f]" />
              </div>
              <div>
                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Técnico</p>
                <p className="text-[11px] font-black text-slate-800 uppercase">{tech?.name || 'Não Atribuído'}</p>
              </div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                <Clock size={14} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Check-In</p>
                <p className="text-[11px] font-black text-emerald-800">{fmtDT(order.startDate)}</p>
              </div>
            </div>
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                <CheckCircle2 size={14} className="text-emerald-600" />
              </div>
              <div>
                <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Concluído</p>
                <p className="text-[11px] font-black text-emerald-800">{fmtDT(order.endDate)}</p>
              </div>
            </div>
          </div>

          {/* Service description */}
          {order.description && (
            <div className="p-5 bg-[#1c2d4f]/5 rounded-xl border border-[#1c2d4f]/10">
              <p className="text-[9px] font-black text-[#1c2d4f] uppercase tracking-widest mb-2">Descrição do Serviço Executado</p>
              <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{order.description}</p>
            </div>
          )}
        </div>

        {/* ── IMPEDIMENTO (if any) ── */}
        {(order.status === 'IMPEDIDO' || (order.formData as any)?.impediment_reason) && (
          <div className="bg-red-50 rounded-2xl border border-red-100 shadow-sm p-6 sm:p-8">
            <SectionHeader icon={<ShieldAlert size={15} />} title="Aviso de Impedimento" color="text-red-600" />
            <p className="text-sm font-bold text-red-800 italic">
              "{(order.formData as any)?.impediment_reason || order.notes?.replace('IMPEDIMENTO: ', '') || 'Sem motivo detalhado.'}"
            </p>
          </div>
        )}

        {/* ── PEÇAS E VALORES ── */}
        {order.showValueToClient && order.items && order.items.length > 0 && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="p-6 sm:p-8">
              <SectionHeader icon={<Package size={15} />} title="Peças e Materiais Aplicados" />
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50 text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                      <th className="px-5 py-3">Descrição</th>
                      <th className="px-5 py-3 text-center w-20">Qtd</th>
                      <th className="px-5 py-3 text-right w-28">Unitário</th>
                      <th className="px-5 py-3 text-right w-28">Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {order.items.map((item, i) => (
                      <tr key={item.id || i} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-3.5">
                          <span className="text-[11px] font-bold text-slate-800 uppercase">{item.description}</span>
                          {item.fromStock && <span className="ml-2 text-[8px] font-bold text-emerald-600 uppercase">✦ Estoque</span>}
                        </td>
                        <td className="px-5 py-3.5 text-center text-[11px] text-slate-500 font-bold">{item.quantity}</td>
                        <td className="px-5 py-3.5 text-right text-[11px] font-mono text-slate-500">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                        <td className="px-5 py-3.5 text-right text-[11px] font-black text-slate-900 font-mono">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Total bar */}
              <div className="mt-4 flex items-center justify-between bg-[#1c2d4f] text-white px-6 py-4 rounded-xl">
                <div className="flex items-center gap-3">
                  <DollarSign size={18} className="opacity-60" />
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-70">Total do Atendimento</span>
                </div>
                <span className="text-xl font-black font-mono tracking-tighter">
                  R$ {totalItems.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── FORMULÁRIO COLAPSÁVEL ── */}
        {hasForm && (
          <CollapsibleFormSection
            formData={order.formData as Record<string, any>}
            order={order}
            onImageClick={setFullscreenImage}
          />
        )}

        {/* ── ASSINATURAS (sempre visível no final) ── */}
        {(() => {
          const fd: Record<string, any> = typeof order.formData === 'string'
            ? (() => { try { return JSON.parse(order.formData); } catch { return {}; } })()
            : (order.formData || {});

          const normalize = (s: string) =>
            s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

          const findFd = (token: string) => {
            if (fd[token] !== undefined) return fd[token];
            const found = Object.entries(fd).find(([k]) => normalize(k).includes(normalize(token)));
            return found ? found[1] : null;
          };

          const clientSig = fd.signature || findFd('assinaturadocliente') || findFd('assinatura');
          const clientName = fd.signatureName || findFd('assinaturadoclientenome') || findFd('responsavel') || findFd('nome') || order.customerName;
          const clientDoc = fd.signatureDoc || findFd('assinaturadoclientecpf') || findFd('cpf');

          return (
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
              <SectionHeader icon={<CheckCircle2 size={15} />} title="Validação e Assinaturas" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                {/* Técnico */}
                <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-xl border border-slate-100 gap-4">
                  <div className="w-14 h-14 bg-[#1c2d4f]/10 rounded-2xl flex items-center justify-center">
                    <UserIcon size={24} className="text-[#1c2d4f]" />
                  </div>
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Técnico Responsável</p>
                    <p className="text-sm font-black text-slate-900 uppercase">{tech?.name || 'Não Atribuído'}</p>
                    {tech?.email && <p className="text-[9px] text-slate-400 mt-0.5">{tech.email}</p>}
                  </div>
                  <div className="w-full border-t-2 border-dashed border-slate-200 pt-3">
                    <p className="text-[8px] text-slate-300 uppercase tracking-widest">Assinatura do Prestador</p>
                  </div>
                </div>

                {/* Cliente */}
                <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-xl border border-slate-100 gap-4">
                  {clientSig ? (
                    <div
                      className="w-full h-24 flex items-center justify-center bg-white rounded-xl border border-slate-200 cursor-zoom-in"
                      onClick={() => setFullscreenImage(clientSig)}
                    >
                      <img
                        src={clientSig}
                        className="max-h-20 max-w-full object-contain mix-blend-multiply"
                        alt="Assinatura do cliente"
                      />
                    </div>
                  ) : (
                    <div className="w-full h-24 flex items-center justify-center bg-white rounded-xl border-2 border-dashed border-slate-200">
                      <p className="text-[9px] font-bold text-slate-300 uppercase tracking-widest">Sem assinatura registrada</p>
                    </div>
                  )}
                  <div>
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Cliente / Responsável</p>
                    <p className="text-sm font-black text-slate-900 uppercase">{clientName}</p>
                    {clientDoc && <p className="text-[9px] text-slate-400 font-mono mt-0.5">Doc: {clientDoc}</p>}
                  </div>
                  <div className="w-full border-t-2 border-dashed border-slate-200 pt-3">
                    <p className="text-[8px] text-slate-300 uppercase tracking-widest">Assinatura do Cliente</p>
                  </div>
                </div>

              </div>
            </div>
          );
        })()}

      </main>

      {/* ── FOOTER NEXUS ── */}
      <footer className="mt-12 border-t border-slate-200 bg-white print:hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <NexusBranding size="sm" className="opacity-70" />
          </div>
          <div className="text-center sm:text-right space-y-1">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Uma solução Nexus Pro</p>
            <p className="text-[8px] text-slate-300 uppercase tracking-widest">
              Documento emitido eletronicamente · Autenticidade garantida pela plataforma
            </p>
          </div>
        </div>
      </footer>

      {/* ── LIGHTBOX ── */}
      {fullscreenImage && (
        <div
          className="fixed inset-0 z-[9999] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-4 sm:p-10 animate-fade-in cursor-zoom-out"
          onClick={() => setFullscreenImage(null)}
        >
          <img
            src={fullscreenImage}
            className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl"
            alt="Visualização"
          />
          <button
            className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
            onClick={() => setFullscreenImage(null)}
          >
            <XIcon size={22} />
          </button>
        </div>
      )}
    </div>
  );
};

const XIcon = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);
