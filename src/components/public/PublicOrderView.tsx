import {
  Box,
  Calendar,
  CheckCircle2,
  ChevronDown, ChevronUp,
  ClipboardList,
  Clock,
  DollarSign,
  FileText,
  Globe,
  Hexagon,
  MapPin,
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
    <h3 className={`text-sm font-bold uppercase tracking-[0.1em] ${color}`}>{title}</h3>
  </div>
);

const InfoPill: React.FC<{ label: string; value: string; mono?: boolean }> = ({ label, value, mono }) => (
  <div className="flex flex-col gap-1.5 font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-0.5">{label}</span>
    <div className="bg-slate-50/50 rounded-lg px-2 py-1.5 border border-slate-100/50">
       <span className={`text-sm font-bold text-slate-800 ${mono ? '' : 'uppercase'}`}>{value || '—'}</span>
    </div>
  </div>
);

const CollapsibleFormSection: React.FC<{
  formData: Record<string, any>;
  order: ServiceOrder;
  onImageClick: (url: string) => void;
  title?: string;
  subtitle?: string;
  icon?: React.ReactNode;
  parts?: any[];
  showPrices?: boolean;
}> = ({ formData, order, onImageClick, title = "Formulário Técnico", subtitle, icon, parts, showPrices }) => {
  const [isOpen, setIsOpen] = useState(false);

  const SYSTEM_KEYS = new Set([
    'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
    'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
    'impediment_reason', 'impediment_photos', 'impedimento_tipo', 'impedimento_motivo', 'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo', 'impedimento_fotos', 'impediment_at', 'totalValue', 'price',
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
  // Preserva a ORDEM original das perguntas
  const formItems = Object.entries(formData)
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

  if (formItems.length === 0) return null;

  const photoCount = formItems.reduce((acc, i) => acc + i.photos.length, 0);
  const textCount = formItems.filter(i => i.text !== null).length;

  return (
    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 overflow-hidden">
      {/* Collapsible Toggle */}
      <button
        onClick={() => setIsOpen(v => !v)}
        className="w-full flex items-center justify-between px-6 sm:px-8 py-5 hover:bg-slate-50 transition-all group"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            {icon || <ClipboardList size={16} />}
          </div>
          <div className="text-left">
            <p className="text-sm font-bold text-slate-900 uppercase tracking-wide">{title}</p>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              {subtitle || `${textCount} ${textCount === 1 ? 'resposta' : 'respostas'}${photoCount > 0 ? ` · ${photoCount} foto${photoCount > 1 ? 's' : ''}` : ''}`}
              {parts && parts.length > 0 && showPrices && ` · R$ ${parts.reduce((acc, it) => acc + (it.total || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-bold text-[#1c2d4f] uppercase tracking-widest group-hover:gap-3 transition-all">
          <span>{isOpen ? 'Fechar' : 'Ver mais'}</span>
          {isOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </div>
      </button>

      {/* Expanded content — cada item do formulário com texto + fotos juntos */}
      {isOpen && (
        <div className="border-t border-slate-200 px-6 sm:px-8 py-6 space-y-8 animate-fade-in">
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

            return Object.entries(groupedItems).map(([group, items]) => (
              <div key={group} className="space-y-4">
                {group !== 'Ficha Técnica' && Object.keys(groupedItems).length > 1 && (
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-emerald-50 flex items-center justify-center border border-emerald-100">
                      <CheckCircle2 size={12} className="text-emerald-600" />
                    </div>
                    <h4 className="text-xs font-bold uppercase tracking-widest text-[#1c2d4f]">{group}</h4>
                  </div>
                )}
                <div className="grid gap-4">
                  {items.map(({ key, cleanKey, text, photos }) => (
                    <div key={key} className="bg-slate-50 rounded-xl border border-slate-100 overflow-hidden">
                      {/* Pergunta + Resposta */}
                      <div className="px-4 pt-4 pb-3">
                        <div className="bg-slate-200/40 rounded px-2.5 py-1.5 mb-2.5 border border-slate-200/50 inline-block">
                          <p className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                            {!isNaN(Number(cleanKey)) ? `Pergunta nº ${cleanKey}` : cleanKey}
                          </p>
                        </div>
                        {text !== null && (
                          <p className={`text-sm font-bold leading-snug flex items-center gap-1.5 ${text.toLowerCase() === 'sim' || text.toLowerCase() === 'ok'
                            ? 'text-emerald-600'
                            : 'text-slate-800'
                            }`}>
                            {(text.toLowerCase() === 'sim' || text.toLowerCase() === 'ok') && <CheckCircle2 size={13} />}
                            {text}
                          </p>
                        )}
                        {text === null && photos.length > 0 && (
                          <p className="text-xs font-bold text-slate-400 italic">Evidência fotográfica</p>
                        )}
                      </div>

                      {/* Fotos da mesma pergunta */}
                      {photos.length > 0 && (
                        <div className="flex flex-wrap gap-3 px-3 pb-3 mt-2">
                          {photos.map((url, i) => (
                            <div
                              key={i}
                              className="w-[80px] h-[80px] sm:w-[96px] sm:h-[96px] rounded-lg overflow-hidden bg-slate-200 border border-slate-200 cursor-zoom-in group hover:shadow-md transition-all shrink-0"
                              onClick={() => onImageClick(url)}
                            >
                              {isVideoUrl(url) ? (
                                <div className="w-full h-full relative flex items-center justify-center bg-black">
                                  <video src={url} className="w-full h-full object-cover opacity-60" />
                                  <div className="absolute inset-0 flex items-center justify-center shadow-inner">
                                    <div className="w-8 h-8 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center border border-white/30 group-hover:bg-white/30 transition-all">
                                      <Play size={14} className="text-white fill-white ml-0.5" />
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
                  ))}
                </div>
              </div>
            ));
          })()}

          {/* ── PEÇAS VINCULADAS AO EQUIPAMENTO ── */}
          {parts && parts.length > 0 && (
            <div className="mt-8 pt-6 border-t border-slate-200 animate-in fade-in slide-in-from-top-4 duration-700">
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Package size={16} />
                </div>
                <h4 className="text-xs font-bold uppercase tracking-widest text-slate-700">Peças & Insumos Utilizados</h4>
              </div>
              
              <div className="overflow-hidden rounded-2xl border border-slate-100 bg-slate-50/30">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100/50 text-slate-500 font-bold uppercase tracking-tighter">
                      <th className="px-4 py-3">Descrição do Item</th>
                      <th className="px-4 py-3 text-center">Qtd</th>
                      {showPrices && <th className="px-4 py-3 text-right">Unitário</th>}
                      {showPrices && <th className="px-4 py-3 text-right">Total</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parts.map((it, idx) => (
                      <tr key={it.id || idx} className="hover:bg-white/50 transition-colors">
                        <td className="px-4 py-3 font-bold text-slate-700 uppercase">{it.description}</td>
                        <td className="px-4 py-3 text-center font-bold text-slate-900">{it.quantity}</td>
                        {showPrices && <td className="px-4 py-3 text-right text-slate-500">R$ {it.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                        {showPrices && <td className="px-4 py-3 text-right font-bold text-slate-900">R$ {it.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                      </tr>
                    ))}
                  </tbody>
                  {showPrices && (
                    <tfoot className="bg-slate-100/30 border-t border-slate-100">
                      <tr>
                        <td colSpan={3} className="px-4 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Subtotal Peças</td>
                        <td className="px-4 py-3 text-right font-bold text-[#1c2d4f]">
                          R$ {parts.reduce((acc, it) => acc + (it.total || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
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

export const PublicOrderView: React.FC<PublicOrderViewProps> = ({ order, techs, isPrint = false, tenantProp }) => {
  const [tenant, setTenant] = React.useState<any>(tenantProp || null);
  const showPrices = tenant?.metadata?.showItemPricesInPublicView !== false;
  const [fullscreenImage, setFullscreenImage] = React.useState<string | null>(null);
  const [linkedEquipments, setLinkedEquipments] = React.useState<any[]>([]);
  // Endereço fresco do cadastro do cliente (pode ter sido atualizado após a OS)
  const [freshCustomerAddress, setFreshCustomerAddress] = React.useState<string | null>(null);

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

  // Busca endereço atualizado do cliente na tabela customers
  React.useEffect(() => {
    const fetchCustomerAddress = async () => {
      if (!order?.customerName) return;
      try {
        const tenantId = (order as any).tenant_id || order?.tenantId;
        if (!tenantId) return;
        const { data } = await import('../../lib/supabase').then(m => m.supabase
          .from('customers')
          .select('address, number, complement, neighborhood, city, state')
          .eq('tenant_id', tenantId)
          .ilike('name', order.customerName.trim())
          .limit(1)
          .single()
        );
        if (data) {
          // Filtra campos válidos: exclui null, undefined, string vazia e literal 'null'
          const clean = (v: any) => v && String(v).toLowerCase() !== 'null' && String(v).trim() !== '';
          const street = [data.address, data.number].filter(clean).join(', ');
          const neighborhood = clean(data.neighborhood) ? data.neighborhood : '';
          const city = clean(data.city) ? data.city : '';
          const state = clean(data.state) ? data.state : '';
          const cityState = [city, state].filter(Boolean).join('/');
          const addr = [street, neighborhood, cityState].filter(Boolean).join(' - ');
          if (addr.trim()) setFreshCustomerAddress(addr);
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
          <p className="text-xs font-bold uppercase text-slate-300 tracking-widest">Carregando Detalhes da OS...</p>
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
  // Endereço exibido: fresco do cadastro ou gravado na OS
  // Guard contra literal 'null' que pode vir do banco
  const sanitize = (v?: string | null) => v && String(v).toLowerCase() !== 'null' && v.trim() !== '' ? v.trim() : null;
  const displayAddress = sanitize(freshCustomerAddress) || sanitize(order.customerAddress);

  // ── PRINT LAYOUT ─────────────────────────────────────────────────────────────
  const formItemsPrint: Array<{ key: string, text: string | null, photos: string[] }> = [];
  let formDataPrint: Record<string, any> = {};
  if (hasForm) {
    formDataPrint = typeof order.formData === 'string'
      ? (() => { try { return JSON.parse(order.formData); } catch { return {}; } })()
      : (order.formData || {});

    const SYSTEM_KEYS = new Set([
      'signature', 'signatureName', 'signatureDoc', 'signatureBirth',
      'timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason',
      'impediment_reason', 'impediment_photos', 'impedimento_tipo', 'impedimento_motivo', 'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo', 'impedimento_fotos', 'impediment_at', 'totalValue', 'price',
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
  }

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
  const findFd = (token: string) => {
    if (formDataPrint[token] !== undefined) return formDataPrint[token];
    const found = Object.entries(formDataPrint).find(([k]) => normalize(k).includes(normalize(token)));
    return found ? found[1] : null;
  };

  const clientSigPrint = (order as any).signature || formDataPrint.signature || findFd('assinaturadocliente') || findFd('assinatura');
  const clientNamePrint = (order as any).signatureName || formDataPrint.signatureName || findFd('assinaturadoclientenome') || findFd('responsavelpelorecebi') || findFd('responsavel');
  const clientDocPrint = (order as any).signatureDoc || formDataPrint.signatureDoc || findFd('assinaturadoclientecpf') || findFd('cpf');

  // ── PRINT LAYOUT COMPONENT ──
  const PrintLayout = () => (
    <div className="bg-white text-[10px] leading-tight font-poppins p-4 print:p-2 print:break-inside-avoid" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
      {/* Print Header */}
      <div className="flex justify-between items-start pb-2 border-b-2 border-slate-800 mb-2">
        <div className="flex gap-3 items-center">
          {companyLogo
            ? <img src={companyLogo} alt="Logo" className="h-12 w-auto object-contain" />
            : <div className="bg-slate-900 p-1.5 rounded-lg flex items-center justify-center min-w-[50px] min-h-[50px] text-white"><Hexagon size={24} className="text-white fill-white/10" /></div>
          }
          <div className="space-y-0.5">
            <h1 className="text-lg font-bold text-slate-900 uppercase tracking-tight">{companyName}</h1>
            <div className="text-[9px] text-slate-600 max-w-[400px]">
              {companyAddress && <div className="leading-tight">{companyAddress}</div>}
              <div className="flex gap-2 mt-0.5">
                {companyPhone && <span className="font-semibold">Tel: {companyPhone}</span>}
                {companyEmail && <span>Email: {companyEmail}</span>}
              </div>
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="border-2 border-slate-800 px-3 py-1 rounded-lg bg-slate-50">
            <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider">Ordem de Serviço</div>
            <div className="text-xl font-bold text-slate-900 tracking-tighter">#{order.displayId || order.id.slice(0, 8).toUpperCase()}</div>
          </div>
          <p className="text-[8px] font-bold text-slate-400 mt-1 uppercase tracking-wide">
            Emissão: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
          <div className="grid grid-cols-12 divide-x divide-slate-200">
            <div className="col-span-12 bg-slate-100 px-3 py-1 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Dados do Atendimento e Cliente</div>
            <div className="col-span-7 p-2 grid grid-cols-2 gap-x-4 gap-y-2">
              <div className="col-span-2"><label className="block text-[8px] font-bold text-slate-400 uppercase">Cliente</label><div className="font-bold text-slate-900 text-xs uppercase">{order.customerName}</div></div>
              <div className="col-span-2"><label className="block text-[8px] font-bold text-slate-400 uppercase">Endereço de Execução</label><div className="font-medium text-slate-700 text-xs uppercase leading-tight">{displayAddress || 'N/A'}</div></div>
            </div>
            <div className="col-span-5 p-2 grid grid-cols-2 gap-2 bg-slate-50/50">
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Abertura</label><div className="font-bold">{fmt(order.createdAt)}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Tipo</label><div className="font-bold uppercase text-[9px]">{order.operationType || 'Manutenção'}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Conclusão</label><div className="font-bold">{fmtDT(order.endDate)}</div></div>
              <div><label className="block text-[8px] font-bold text-slate-400 uppercase">Técnico</label><div className="font-bold uppercase text-[9px] truncate">{tech?.name || 'N/A'}</div></div>
              <div className="col-span-2 flex items-center justify-between pt-1 border-t border-slate-200/50">
                 <label className="text-[8px] font-bold text-slate-400 uppercase">Status Final</label>
                 <div className="font-black text-[8px] border border-slate-300 px-1.5 py-0.5 rounded bg-white uppercase">{order.status}</div>
              </div>
            </div>
          </div>
        </div>

        {/* Equipamentos Vinculados (print) */}
        {linkedEquipments.length > 0 ? (
          <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-xs uppercase tracking-wider text-slate-700">
              Equipamentos Vinculados ({linkedEquipments.length})
            </div>
            <div className="overflow-x-auto w-full"><table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-xs font-bold text-slate-500 uppercase border-b border-slate-200">
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
                    <td className="px-3 py-1.5 text-xs font-bold text-slate-400">{i + 1}</td>
                    <td className="px-3 py-1.5 text-xs font-bold text-slate-900 uppercase">{eq.equipment_name || eq.equipmentName || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600 uppercase">{eq.equipment_model || eq.equipmentModel || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600 ">{eq.equipment_serial || eq.equipmentSerial || '—'}</td>
                    <td className="px-3 py-1.5 text-xs text-slate-600 uppercase">{eq.equipment_family || eq.equipmentFamily || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </div>
        ) : (order.equipmentName || order.equipmentModel || order.equipmentSerial) && (
          <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-xs uppercase tracking-wider text-slate-700">Dados do Equipamento</div>
            <div className="p-3 bg-white grid grid-cols-3 gap-4">
              <div className="col-span-1"><label className="block text-xs font-bold text-slate-400 uppercase">Equipamento</label><div className="font-bold text-slate-900 text-sm uppercase">{order.equipmentName || '—'}</div></div>
              <div className="col-span-1"><label className="block text-xs font-bold text-slate-400 uppercase">Modelo</label><div className="font-bold text-slate-900 text-sm uppercase">{order.equipmentModel || '—'}</div></div>
              <div className="col-span-1"><label className="block text-xs font-bold text-slate-400 uppercase">Nº Sér / ID</label><div className="font-bold text-slate-900 text-sm uppercase ">{order.equipmentSerial || '—'}</div></div>
            </div>
          </div>
        )}

        {order.description && (
          <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
            <div className="bg-slate-100 px-3 py-1 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Relatório / Descrição do Serviço</div>
            <div className="p-2 bg-white text-[9px] text-slate-800 font-medium whitespace-pre-wrap leading-tight">
              {order.description}
            </div>
          </div>
        )}

        {(order.status === 'IMPEDIDO' || formDataPrint.impediment_reason || (order.notes && order.notes.includes('IMPEDIMENTO'))) && (
          <div className="border border-red-300 rounded-lg overflow-hidden break-inside-avoid shadow-sm text-red-900">
            <div className="bg-red-100 px-3 py-1 border-b border-red-300 font-bold text-[9px] uppercase tracking-wider text-red-700">Aviso de Impedimento / Pendência</div>
            <div className="p-2 bg-red-50 text-[9px] font-medium whitespace-pre-wrap italic leading-tight">
              {formDataPrint.impediment_reason || (order.notes ? order.notes.replace('IMPEDIMENTO: ', '') : 'Motivo não mapeado detalhadamente.')}
            </div>
          </div>
        )}

        {showPrices && order.showValueToClient && order.items && order.items.length > 0 && (
          <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
            <div className="bg-slate-100 px-3 py-1 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700">Composição Financeira</div>
            <div className="overflow-x-auto w-full"><table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50 text-[8px] font-bold text-slate-500 uppercase border-b border-slate-200">
                  <th className="px-3 py-1">Item</th>
                  <th className="px-3 py-1 text-center w-12">Qtd</th>
                  <th className="px-3 py-1 text-right w-20">Unit.</th>
                  <th className="px-3 py-1 text-right w-20">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {order.items.map((it: any, i: number) => (
                  <tr key={i}>
                    <td className="px-3 py-1 text-[9px] uppercase font-bold text-slate-800">{it.description}</td>
                    <td className="px-3 py-1 text-[9px] text-center font-bold text-slate-600">{it.quantity}</td>
                    <td className="px-3 py-1 text-[9px] text-right text-slate-600">R$ {it.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    <td className="px-3 py-1 text-[9px] text-right font-bold text-slate-900">R$ {it.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
            <div className="bg-slate-800 text-white px-3 py-1.5 flex justify-end gap-6 items-center border-t border-slate-800">
              <span className="text-[8px] uppercase font-bold tracking-widest text-slate-300">Total Geral</span>
              <span className="text-[11px] font-bold tracking-tighter">R$ {totalItems.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>
        )}

        {/* Formulários agrupados por equipamento (print) */}
        {(() => {
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
            'impediment_reason', 'impediment_photos', 'impedimento_tipo', 'impedimento_motivo', 'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo', 'impedimento_fotos', 'impediment_at', 'totalValue', 'price',
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

          const grpEntries = Object.entries(grps);
          if (grpEntries.length === 0) return null;

          return grpEntries.map(([gName, items], gIdx) => {
            const eq = linkedEquipments.find(e => {
              const eN = (e.equipment_name || e.equipmentName || '').toLowerCase();
              return gName.toLowerCase().includes(eN) || eN.includes(gName.toLowerCase());
            });

            return (
              <div key={gIdx} className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid mt-2">
                <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[10px] uppercase tracking-wider text-slate-700 flex justify-between items-center">
                  <span>Checklist — {eq ? (eq.equipment_name || eq.equipmentName) : gName}</span>
                  {eq && (eq.equipment_serial || eq.equipmentSerial) && (
                    <span className="text-[9px] text-slate-500">S/N: {eq.equipment_serial || eq.equipmentSerial}</span>
                  )}
                </div>
                <div className="divide-y divide-slate-100 bg-white">
                  {items.map((item, iIdx) => (
                    <div key={iIdx} className="p-2 break-inside-avoid">
                      <div className="flex gap-4">
                        <div className="flex-1">
                           <div className="bg-slate-50 rounded px-1.5 py-0.5 mb-1 inline-block border border-slate-200">
                             <p className="text-[9px] font-bold uppercase tracking-tight text-slate-600">
                               {item.key.replace(/^\[.*?\]\s*-\s*/, '')}
                             </p>
                           </div>
                           {item.text && (
                             <p className={`text-[10px] font-bold uppercase ${item.text.toLowerCase() === 'sim' || item.text.toLowerCase() === 'ok' ? 'text-emerald-700' : 'text-slate-900'}`}>
                               {item.text}
                             </p>
                           )}
                        </div>
                        {item.photos.length > 0 && (
                          <div className="grid grid-cols-3 gap-1.5 w-[280px] shrink-0">
                            {item.photos.slice(0, 3).map((p, pIdx) => (
                              <div key={pIdx} className="border border-slate-200 rounded p-0.5 h-[60px] overflow-hidden flex items-center justify-center bg-slate-50">
                                {isVideoUrl(p) ? <Video size={12} className="text-slate-300" /> : <img src={p} className="w-full h-full object-cover" />}
                              </div>
                            ))}
                            {item.photos.length > 3 && (
                               <div className="col-span-3 text-[8px] text-slate-400 text-right italic">+ {item.photos.length - 3} fotos no link digital</div>
                            )}
                          </div>
                        )}
                      </div>
                      {/* Se houver muitas fotos (>3), ou fotos grandes, podemos querer um grid completo abaixo em vez de lateral */}
                      {item.photos.length > 3 && false && ( /* Desativado por enquanto para manter compacto */
                        <div className="grid grid-cols-4 gap-1 mt-2">
                           {item.photos.map((p, pIdx) => (
                              <div key={pIdx} className="border border-slate-200 rounded p-0.5 h-[80px] overflow-hidden flex items-center justify-center bg-slate-50">
                                <img src={p} className="w-full h-full object-cover text-[8px]" />
                              </div>
                           ))}
                        </div>
                      )}
                      {/* Peças vinculadas ao item no print */}
                      {(() => {
                        const eqParts = (order.items || []).filter(it => {
                          if (!eq) return false;
                          const itEqId = it.equipmentId;
                          const itEqName = (it.equipmentName || '').toLowerCase();
                          const eName = (eq.equipment_name || eq.equipmentName || '').toLowerCase();
                          const eId = eq.id || eq.equipmentId;
                          return (itEqId && (itEqId === eId || itEqId === eq.equipment_id)) || 
                                 (itEqName && (itEqName === eName || eName.includes(itEqName)));
                        });
                        
                        if (eqParts.length === 0) return null;

                        return (
                          <div className="mt-3 bg-slate-50 rounded-md border border-slate-200 overflow-hidden break-inside-avoid">
                            <table className="w-full text-left">
                              <thead>
                                <tr className="bg-slate-100 text-[8px] font-bold text-slate-500 uppercase border-b border-slate-200">
                                  <th className="px-2 py-1">Peças Utilizadas neste Equipamento</th>
                                  <th className="px-2 py-1 text-center w-10">Qtd</th>
                                  {showPrices && <th className="px-2 py-1 text-right w-20">Total</th>}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {eqParts.map((pIt, pIdx) => (
                                  <tr key={pIdx}>
                                    <td className="px-2 py-1 text-[9px] font-bold text-slate-700 uppercase">{pIt.description}</td>
                                    <td className="px-2 py-1 text-[9px] text-center font-bold text-slate-900">{pIt.quantity}</td>
                                    {showPrices && <td className="px-2 py-1 text-[9px] text-right font-bold text-slate-900">R$ {pIt.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>
            );
          });
        })()}

        {/* ── Evidências Fotográficas Adicionais (print) ── */}
        {(() => {
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
            <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid mt-4">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-xs uppercase tracking-wider text-slate-700">Evidências Fotográficas e de Conclusão</div>
              <div className="p-3 bg-white flex flex-wrap gap-3">
                {(order.videoUrl || formDataPrint.videoUrl || formDataPrint.video_url) && (
                  <div className="border border-slate-200 rounded p-1 w-[200px] h-[150px] overflow-hidden flex items-center justify-center bg-slate-50 break-inside-avoid shadow-inner relative">
                    <Video size={18} className="absolute text-slate-400 opacity-50 z-10" />
                    <video src={order.videoUrl || formDataPrint.videoUrl || formDataPrint.video_url} className="w-full h-full object-cover opacity-60 mix-blend-multiply" />
                    <span className="absolute bottom-1 bg-black/60 text-white text-xs font-bold px-1.5 py-0.5 rounded uppercase">Vídeo anexado</span>
                  </div>
                )}
                {allValidExtrasPrint.map((url: string, i: number) => (
                  <div key={i} className="border border-slate-200 rounded p-1 w-[200px] h-[150px] overflow-hidden flex items-center justify-center bg-slate-50 break-inside-avoid">
                    <img src={url} className="w-full h-full object-contain" alt={`Evidência Adicional ${i + 1}`} />
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        <div className="border border-slate-300 rounded-lg overflow-hidden break-inside-avoid mt-4">
          <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-xs uppercase tracking-wider text-slate-700">Validação e Assinaturas (Auditoria Digital)</div>
          <div className="grid grid-cols-2 divide-x divide-slate-300 bg-white text-center">
            <div className="p-4 flex flex-col items-center justify-center gap-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Responsável Técnico</p>
              <div className="h-[60px] flex items-center justify-center text-slate-200 italic text-xs font-bold uppercase">
                Validação Eletrônica no Sistema
              </div>
              <div className="w-full border-t border-slate-300 pt-2">
                <p className="text-xs font-bold text-slate-900 uppercase">{tech?.name || 'Não Atribuído'}</p>
              </div>
            </div>
            <div className="p-4 flex flex-col items-center justify-center gap-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Responsável pela Conformidade (Cliente)</p>
              <div className="h-[80px] flex items-center justify-center">
                {clientSigPrint ? (
                  <img src={clientSigPrint} className="max-h-full max-w-full object-contain mix-blend-multiply" alt="Assinatura" />
                ) : (
                  <span className="text-slate-300 italic text-xs font-bold uppercase">Sem assinatura física registrada</span>
                )}
              </div>
              <div className="w-full border-t border-slate-300 pt-2">
                <p className="text-xs font-bold text-slate-900 uppercase">{clientNamePrint || 'Não Informado'}</p>
                {clientDocPrint && <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">{clientDocPrint}</p>}
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
          <p className="text-xs font-bold uppercase tracking-widest text-[#1c2d4f]">Uma solução DUNO</p>
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
      `}</style>
      <PrintLayout />
    </div>
  );

  // ── WEB LAYOUT ─────────────────────────────────────────────────────────────
  return (
    <div className="public-view-wrapper font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900&display=swap');
        .public-view-wrapper, .public-view-wrapper * {
            font-family: 'Poppins', sans-serif !important;
        }
      `}</style>
      <div className="hidden print:!block">
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
                <h1 className="text-sm sm:text-base font-bold text-slate-900 uppercase tracking-tight sm:truncate leading-none mb-1">{companyName}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                  {companyDoc && (
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap flex items-center gap-1">
                      CNPJ: {companyDoc}
                    </span>
                  )}
                  {companyPhone && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap text-opacity-80">
                      <Phone size={9} className="text-[#3e5b99]" /> {companyPhone}
                    </span>
                  )}
                  {companyWebsite && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-slate-500 uppercase tracking-widest whitespace-nowrap text-opacity-80">
                      <Globe size={9} className="text-[#3e5b99]" /> {companyWebsite.replace(/^https?:\/\//, '')}
                    </span>
                  )}
                  {companyAddress && (
                    <span className="flex items-center gap-1 text-[10px] sm:text-xs font-semibold text-slate-500 uppercase tracking-widest leading-tight">
                      <MapPin size={10} className="text-[#3e5b99] shrink-0" /> <span className="flex-1">{companyAddress}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Print button */}
            <button
              onClick={() => {
                const originalTitle = document.title;
                document.title = `OS-${order.displayId || order.id.slice(0, 8).toUpperCase()}`;
                window.print();
                document.title = originalTitle;
              }}
              className="flex items-center justify-center h-10 w-10 sm:w-auto sm:px-4 sm:py-2.5 bg-[#1c2d4f] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#2a457a] transition-all shadow-md active:scale-95 shrink-0"
            >
              <Printer size={16} />
              <span className="hidden sm:inline ml-2">Imprimir PDF</span>
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
                <p className="text-xs font-bold text-white/40 uppercase tracking-[0.3em] leading-none mb-1">Ordem de Serviço</p>
                <h2 className="text-xl sm:text-2xl font-bold text-white uppercase tracking-tighter leading-none">
                  #{order.displayId || order.id.slice(0, 8).toUpperCase()}
                </h2>
                <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mt-1">{order.title}</p>
              </div>
            </div>

            {/* Status + priority */}
            <div className="flex items-center gap-2.5 flex-wrap">
              <div className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border flex items-center gap-1.5 ${{
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
              <div className="px-2.5 py-1 bg-white/10 rounded-full text-xs font-bold text-white/70 uppercase tracking-widest border border-white/10">
                {order.priority}
              </div>
              <div className="px-2.5 py-1 bg-white/10 rounded-full text-xs font-bold text-white/70 uppercase tracking-widest border border-white/10 flex items-center gap-1.5">
                <Calendar size={10} /> {fmt(order.createdAt)}
              </div>
            </div>
          </div>
        </div>

        {/* ── MAIN CONTENT ── */}
        <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12 flex flex-col gap-10 print:hidden">

          {/* ── ROW 1: Cliente + Localização ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 p-8 sm:p-10">
              <SectionHeader icon={<UserIcon size={15} />} title="Dados do Cliente" />
              <div className="space-y-3">
                {/* Nome do cliente */}
                <p className="text-lg font-bold text-slate-900 uppercase leading-tight">{order.customerName}</p>

                {/* Endereço — abaixo do nome, atualizado do cadastro do cliente */}
                {displayAddress ? (
                  <div className="flex items-start gap-2">
                    <MapPin size={12} className="text-slate-400 mt-0.5 shrink-0" />
                    <p className="text-sm text-slate-500 leading-snug">{displayAddress}</p>
                  </div>
                ) : (
                  <p className="text-xs text-slate-300 uppercase tracking-widest italic">Endereço não informado</p>
                )}

                {/* Tipo de atendimento */}
                {order.operationType && (
                  <div className="flex items-center gap-2">
                    <Tag size={11} className="text-[#3e5b99]" />
                    <span className="text-xs font-bold text-[#3e5b99] uppercase tracking-widest bg-[#3e5b99]/10 px-2 py-0.5 rounded-full">{order.operationType}</span>
                  </div>
                )}

                {/* Datas */}
                <div className="pt-3 border-t border-slate-200 grid grid-cols-2 gap-4">
                  <InfoPill label="Abertura" value={fmt(order.createdAt)} />
                  <InfoPill label="Agendado" value={order.scheduledDate ? `${fmt(order.scheduledDate)}${order.scheduledTime ? ' · ' + order.scheduledTime : ''}` : '—'} />
                </div>
              </div>
            </div>

            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 p-8 sm:p-10">
              <SectionHeader icon={<Box size={15} />} title={`Equipamento${linkedEquipments.length > 1 ? 's' : ''} Vinculado${linkedEquipments.length > 1 ? 's' : ''}`} />
              {linkedEquipments.length > 0 ? (
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="overflow-x-auto w-full"><table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">
                        <th className="px-4 py-2.5">Equipamento</th>
                        <th className="px-4 py-2.5">Modelo</th>
                        <th className="px-4 py-2.5">Nº Série</th>
                        <th className="px-4 py-2.5">Família</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {linkedEquipments.map((eq: any, i: number) => (
                        <tr key={eq.id || i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-900 uppercase">{eq.equipment_name || eq.equipmentName || '—'}</td>
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-600 uppercase">{eq.equipment_model || eq.equipmentModel || '—'}</td>
                          <td className="px-4 py-2.5 text-xs font-bold text-slate-500 ">{eq.equipment_serial || eq.equipmentSerial || '—'}</td>
                          <td className="px-4 py-2.5">
                            {(eq.equipment_family || eq.equipmentFamily) ? (
                              <span className="text-xs font-bold text-[#3e5b99] uppercase bg-[#3e5b99]/10 px-2 py-0.5 rounded-full">{eq.equipment_family || eq.equipmentFamily}</span>
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
                    <p className="text-sm font-bold text-slate-900 uppercase leading-snug">{order.equipmentName || '—'}</p>
                    <p className="text-xs font-bold text-slate-500 uppercase">
                      {[order.equipmentModel && `Modelo: ${order.equipmentModel}`, order.equipmentSerial && `Série: ${order.equipmentSerial}`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Equipamento não especificado</p>
              )}
            </div>
          </div>

          {/* ── ROW 2: Relatório Técnico ── */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 p-8 sm:p-10">
            <SectionHeader icon={<FileText size={15} />} title="Relatório Técnico de Execução" />

            {/* Timeline bar */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                <div className="w-8 h-8 bg-[#1c2d4f]/10 rounded-xl flex items-center justify-center shrink-0">
                  <UserIcon size={14} className="text-[#1c2d4f]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Técnico</p>
                  <p className="text-xs font-bold text-slate-800 uppercase">{tech?.name || 'Não Atribuído'}</p>
                </div>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                  <Clock size={14} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Check-In</p>
                  <p className="text-xs font-bold text-emerald-800">{fmtDT(order.startDate)}</p>
                </div>
              </div>
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-3">
                <div className="w-8 h-8 bg-emerald-100 rounded-xl flex items-center justify-center shrink-0">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest">Concluído</p>
                  <p className="text-xs font-bold text-emerald-800">{fmtDT(order.endDate)}</p>
                </div>
              </div>
            </div>

            {/* Service description */}
            {order.description && (
              <div className="p-5 bg-[#1c2d4f]/5 rounded-xl border border-[#1c2d4f]/10">
                <p className="text-xs font-bold text-[#1c2d4f] uppercase tracking-widest mb-2">Descrição do Serviço Executado</p>
                <p className="text-sm font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">{order.description}</p>
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
                <p className="text-sm font-bold text-red-800 italic mb-4">"{reason}"</p>
                {blockPhoto && (
                  <a href={blockPhoto} target="_blank" rel="noreferrer" className="block">
                    <img src={blockPhoto} alt="Foto do impedimento" className="w-full max-w-sm rounded-xl border border-red-200 object-cover cursor-zoom-in hover:opacity-90 transition-all" style={{maxHeight: 240}} />
                    <span className="text-xs text-red-400 font-bold uppercase tracking-widest mt-2 block">Foto do Impedimento (clique para ampliar)</span>
                  </a>
                )}
              </div>
            );
          })()}


          {/* ── PEÇAS E VALORES ── */}
          {order.showValueToClient && order.items && order.items.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 overflow-hidden">
              <div className="p-6 sm:p-8">
                <SectionHeader icon={<Package size={15} />} title="Peças e Materiais Aplicados" />
                <div className="rounded-xl border border-slate-100 overflow-hidden">
                  <div className="overflow-x-auto w-full"><table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50 text-xs font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">
                        <th className="px-5 py-3">Descrição</th>
                        <th className="px-5 py-3 text-center w-20">Qtd</th>
                        {showPrices && <th className="px-5 py-3 text-right w-28">Unitário</th>}
                        {showPrices && <th className="px-5 py-3 text-right w-28">Total</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {order.items.map((item, i) => (
                        <tr key={item.id || i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-5 py-3.5">
                            <span className="text-xs font-bold text-slate-800 uppercase">{item.description}</span>
                            {item.equipmentName && (
                              <div className="flex items-center gap-1 text-xs text-slate-400 font-bold uppercase mt-1">
                                <Box size={10} className="text-slate-300" /> {item.equipmentName}
                              </div>
                            )}
                            {item.fromStock && <span className="text-xs font-bold text-emerald-600 uppercase mt-1 block">✦ Estoque Técnico</span>}
                          </td>
                          <td className="px-5 py-3.5 text-center text-xs text-slate-500 font-bold">{item.quantity}</td>
                          {showPrices && <td className="px-5 py-3.5 text-right text-xs  text-slate-500">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                          {showPrices && <td className="px-5 py-3.5 text-right text-xs font-bold text-slate-900 ">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table></div>
                </div>

                {/* Total bar */}
                {showPrices && (
                  <div className="mt-4 flex items-center justify-between bg-[#1c2d4f] text-white px-6 py-4 rounded-xl">
                    <div className="flex items-center gap-3">
                      <DollarSign size={18} className="opacity-60" />
                      <span className="text-xs font-bold uppercase tracking-widest opacity-70">Total do Atendimento</span>
                    </div>
                    <span className="text-xl font-bold  tracking-tighter">
                      R$ {totalItems.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}


          {/* ── FORMULÁRIOS AGRUPADOS POR EQUIPAMENTO/GRUPO ── */}
          {(() => {
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
                'impediment_reason', 'impediment_photos', 'impedimento_tipo', 'impedimento_motivo', 'impedimento_peca_nome', 'impedimento_peca_modelo', 'impedimento_peca_codigo', 'impedimento_fotos', 'impediment_at', 'totalValue', 'price',
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

            const groupEntries = Object.entries(groups);
            if (groupEntries.length === 0) return null;

            return (
              <div className="space-y-8">
                {groupEntries.map(([groupName, groupData]) => {
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
                  const eqParts = (order.items || []).filter(it => {
                    if (!eq) return false;
                    const itEqId = it.equipmentId;
                    const itEqName = (it.equipmentName || '').toLowerCase();
                    const eName = (eq.equipment_name || eq.equipmentName || '').toLowerCase();
                    const eId = eq.id || eq.equipmentId;
                    
                    return (itEqId && (itEqId === eId || itEqId === eq.equipment_id)) || 
                           (itEqName && (itEqName === eName || eName.includes(itEqName)));
                  });

                  return (
                    <CollapsibleFormSection
                      key={groupName}
                      formData={groupData}
                      order={order}
                      onImageClick={setFullscreenImage}
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

          {/* ── CARD DE CONCLUSÃO ── */}
          {(() => {
            const fd: Record<string, any> = typeof order.formData === 'string'
              ? (() => { try { return JSON.parse(order.formData); } catch { return {}; } })()
              : (order.formData || {});
            const techReport = fd.technicalReport || fd.technical_report || '';
            const partsUsed = fd.partsUsed || fd.parts_used || '';
            const cName = fd.clientName || '';
            const cDoc = fd.clientDoc || '';
            const completedAt = fd.completedAt || order.endDate || '';
            
            const extractExtras = (fData: any) => {
              const extras = fData.extra_photos || fData.extraPhotos || fData.photos || [];
              const photosArr = Array.isArray(extras) ? extras : (typeof extras === 'string' ? [extras] : []);
              return photosArr.filter((p: any) => typeof p === 'string' && (p.startsWith('http') || p.startsWith('data:image')));
            };

            let allValidPhotos: string[] = extractExtras(fd);
            linkedEquipments.forEach((eq: any) => {
                let eqFd: any = typeof eq.form_data === 'string' ? (() => { try { return JSON.parse(eq.form_data); } catch { return {}; } })() : (eq.form_data || {});
                allValidPhotos.push(...extractExtras(eqFd));
            });
            allValidPhotos = Array.from(new Set(allValidPhotos));

            if (!techReport && !partsUsed && !cName && !completedAt && !order.videoUrl && !fd.videoUrl && !fd.video_url && allValidPhotos.length === 0) return null;
            return (
              <div className="bg-white rounded-3xl border border-indigo-200 shadow-2xl shadow-slate-200/40 overflow-hidden">
                <div className="flex items-center justify-between px-6 sm:px-8 py-5 bg-gradient-to-r from-indigo-50 to-violet-50 border-b border-indigo-100">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                      <CheckCircle2 size={16} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-indigo-800 uppercase tracking-widest">Dados de Conclusão</p>
                      <p className="text-xs text-indigo-400 font-medium mt-0.5">Informações registradas na finalização</p>
                    </div>
                  </div>
                  {completedAt && (
                    <span className="text-xs font-bold text-indigo-500 uppercase tracking-wide px-2.5 py-1 rounded-full border bg-white border-indigo-200 flex items-center gap-1.5">
                      <Clock size={10} /> {new Date(completedAt).toLocaleString()}
                    </span>
                  )}
                </div>
                <div className="px-6 sm:px-8 py-6 space-y-5">
                  {techReport && (
                    <div>
                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Relatório Técnico</p>
                      <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">{techReport}</p>
                    </div>
                  )}
                  {partsUsed && (
                    <div>
                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Peças Utilizadas</p>
                      <p className="text-sm text-slate-700 font-medium leading-relaxed whitespace-pre-wrap bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">{partsUsed}</p>
                    </div>
                  )}
                  {(cName || cDoc || fd.signature) && (
                    <div className="flex flex-col sm:flex-row gap-6 pt-4 border-t border-indigo-100">
                      <div className="flex gap-8 flex-1">
                        {cName && <InfoPill label="Responsável" value={cName} />}
                        {cDoc && <InfoPill label="CPF" value={cDoc} mono />}
                      </div>
                      {fd.signature && (
                        <div className="flex flex-col gap-1.5 shrink-0">
                          <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Assinatura Digital</span>
                          <div
                            className="h-10 w-28 bg-white border border-indigo-100 rounded-lg flex items-center justify-center p-1 cursor-zoom-in hover:border-indigo-300 transition-all"
                            onClick={() => setFullscreenImage(fd.signature)}
                          >
                            <img src={fd.signature} className="max-h-full max-w-full object-contain mix-blend-multiply" alt="Assinatura" />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {(order.videoUrl || fd.videoUrl || fd.video_url || allValidPhotos.length > 0) && (
                    <div className="pt-4 border-t border-indigo-100">
                      <p className="text-xs font-bold text-indigo-400 uppercase tracking-widest mb-3">Evidências de Conclusão</p>
                      <div className="flex flex-wrap gap-3 mt-1">
                        {(order.videoUrl || fd.videoUrl || fd.video_url) && (
                          <div
                            className="w-[80px] h-[80px] sm:w-[96px] sm:h-[96px] shrink-0 rounded-xl overflow-hidden border border-indigo-100 bg-black cursor-zoom-in hover:shadow-md transition-all active:scale-95 relative group"
                            onClick={() => setFullscreenImage(order.videoUrl || fd.videoUrl || fd.video_url)}
                          >
                            <video 
                              src={order.videoUrl || fd.videoUrl || fd.video_url} 
                              className="w-full h-full object-cover opacity-60" 
                              preload="metadata"
                            />
                            <div className="absolute inset-0 flex items-center justify-center">
                              <Play size={16} className="text-white fill-white group-hover:scale-110 transition-transform" />
                            </div>
                          </div>
                        )}
                        {allValidPhotos.map((url: string, i: number) => (
                          <div
                            key={i}
                            className="w-[80px] h-[80px] sm:w-[96px] sm:h-[96px] shrink-0 rounded-xl overflow-hidden border border-indigo-100 bg-white cursor-zoom-in hover:shadow-md transition-all active:scale-95"
                            onClick={() => setFullscreenImage(url)}
                          >
                            <img src={url} className="w-full h-full object-cover" alt={`Anexo ${i + 1}`} />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })()}

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

            // 🎯 PRIORIDADE: order.signature (nível raiz) é o campo correto pós-finalização
            // O técnico coleta: nome do responsável + assinatura no app antes de encerrar
            const clientSig = (order as any).signature ||
              fd.signature ||
              findFd('assinaturadocliente') ||
              findFd('assinatura');

            // 🎯 Nome: SEMPRE o que o responsável digitou no app antes de assinar
            // Nunca usar customerName como fallback (seria o nome cadastrado, não quem assinou)
            const clientName = (order as any).signatureName ||
              fd.signatureName ||
              fd.clientName ||
              findFd('assinaturadoclientenome') ||
              findFd('responsavelpelorecebi') ||
              findFd('responsavel');

            const clientDoc = (order as any).signatureDoc ||
              fd.signatureDoc ||
              fd.clientDoc ||
              findFd('assinaturadoclientecpf') ||
              findFd('cpf');

            return (
              <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 p-8 sm:p-10">
                <SectionHeader icon={<CheckCircle2 size={15} />} title="Validação e Assinaturas" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

                  {/* Técnico */}
                  <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-xl border border-slate-100 gap-4">
                    <div className="w-14 h-14 bg-[#1c2d4f]/10 rounded-2xl flex items-center justify-center">
                      <UserIcon size={24} className="text-[#1c2d4f]" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Técnico Responsável</p>
                      <p className="text-sm font-bold text-slate-900 uppercase">{tech?.name || 'Não Atribuído'}</p>
                      {tech?.email && <p className="text-xs text-slate-400 mt-0.5">{tech.email}</p>}
                    </div>
                    <div className="w-full border-t-2 border-dashed border-slate-200 pt-3">
                      <p className="text-xs text-slate-300 uppercase tracking-widest">Assinatura do Prestador</p>
                    </div>
                  </div>

                  {/* Cliente / Responsável que assinou */}
                  <div className="flex flex-col items-center text-center p-6 bg-slate-50 rounded-xl border border-slate-100 gap-4">
                    {/* Assinatura digital */}
                    {clientSig ? (
                      <div
                        className="w-full h-28 flex items-center justify-center bg-white rounded-xl border border-slate-200 cursor-zoom-in hover:border-[#3e5b99]/30 transition-colors"
                        onClick={() => setFullscreenImage(clientSig)}
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
                        <p className="text-xs font-bold text-slate-300 uppercase tracking-widest">Sem assinatura registrada</p>
                      </div>
                    )}

                    {/* Nome de quem assinou (digitado no app) */}
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Responsável pela Assinatura</p>
                      {clientName ? (
                        <p className="text-sm font-bold text-slate-900 uppercase">{clientName}</p>
                      ) : (
                        <p className="text-xs font-bold text-slate-300 uppercase italic">Nome não informado</p>
                      )}
                      {clientDoc && <p className="text-xs text-slate-400  mt-0.5">Doc: {clientDoc}</p>}
                    </div>

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
              <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Uma solução DUNO</p>
              <p className="text-xs text-slate-300 uppercase tracking-widest">
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
            {isVideoUrl(fullscreenImage) ? (
              <video
                src={fullscreenImage}
                controls
                autoPlay
                className="max-w-full max-h-full rounded-3xl shadow-2xl"
              />
            ) : (
              <img
                src={fullscreenImage}
                className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl"
                alt="Visualização"
              />
            )}
            <button
              className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
              onClick={() => setFullscreenImage(null)}
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
