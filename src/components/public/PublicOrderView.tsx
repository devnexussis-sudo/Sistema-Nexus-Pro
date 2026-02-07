import React from 'react';
import { ServiceOrder, User } from '../../types';
import { Calendar, MapPin, Printer, Hexagon, Box, User as UserIcon, Tag, CheckCircle2, FileText, ShieldAlert, Mail, Phone, DollarSign, Package, ShoppingCart } from 'lucide-react';
import { StatusBadge } from '../ui/StatusBadge';
import { DataService } from '../../services/dataService';
import { NexusBranding } from '../ui/NexusBranding';

interface PublicOrderViewProps {
  order: ServiceOrder | null;
  techs: User[];
  isPrint?: boolean;
}

export const PublicOrderView: React.FC<PublicOrderViewProps> = ({ order, techs, isPrint = false }) => {
  const [tenant, setTenant] = React.useState<any>(null);
  const [fullscreenImage, setFullscreenImage] = React.useState<string | null>(null);

  React.useEffect(() => {
    const fetchTenantData = async () => {
      if (order) {
        try {
          const tenantId = (order as any).tenant_id || order?.tenantId;
          // Agora passamos o tenantId (pode ser null) e o DataService fará o fallback para a primeira empresa
          const data = await DataService.getTenantById(tenantId);
          setTenant(data);
        } catch (error) {
          console.error("Erro ao buscar dados da empresa:", error);
        }
      }
    };

    fetchTenantData();
  }, [order?.id, (order as any)?.tenant_id, order?.tenantId]);

  if (!order) return null;

  const tech = techs.find(t => t.id === order.assignedTo);
  const companyName = tenant?.company_name || tenant?.name || tenant?.companyName || 'Nexus Pro';
  const companyLogo = tenant?.logo_url || tenant?.logoUrl;
  const companyAddress = tenant?.street ?
    `${tenant.street}${tenant.number ? ', ' + tenant.number : ''}${tenant.neighborhood ? ', ' + tenant.neighborhood : ''}${tenant.city ? ' - ' + tenant.city : ''}${tenant.state ? '/' + tenant.state : ''}` :
    (tenant?.address || '');
  const companyPhone = tenant?.phone || '';
  const companyEmail = tenant?.admin_email || tenant?.email || '';
  const companyDoc = tenant?.cnpj || tenant?.document || '';

  // 🛡️ Nexus Integrity: Formatadores de Data/Hora Fidedignos
  const formatOSDate = (dateStr?: string) => {
    if (!dateStr) return '---';
    // Se for apenas data YYYY-MM-DD, injeta 12h para evitar drift de fuso
    const date = dateStr.includes('T') ? new Date(dateStr) : new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('pt-BR');
  };

  const formatOSTime = (dateStr?: string) => {
    if (!dateStr) return '--:--';
    const date = new Date(dateStr);
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className={`${isPrint ? 'bg-white p-0' : 'bg-[#F5F7FA] pb-20'} font-sans selection:bg-primary-100 selection:text-primary-900`}>

      {/* NAVEGAÇÃO WEB - Somente Tela */}
      {!isPrint && (
        <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm print:hidden">
          <div className="max-w-[1000px] mx-auto px-4 sm:px-6 py-3 sm:py-4 flex flex-row justify-between items-center">
            <div className="flex items-center gap-3">
              {companyLogo ? (
                <img src={companyLogo} alt="Logo" className="h-10 sm:h-14 w-auto object-contain transition-all" />
              ) : (
                <div className="p-2 bg-slate-900 rounded-lg shadow-md">
                  <Hexagon size={18} className="text-white fill-white/10" />
                </div>
              )}
              <div className="flex flex-col">
                <h1 className="text-xs sm:text-sm font-black text-slate-900 tracking-tight uppercase truncate max-w-[200px] sm:max-w-none ml-2 leading-none">{companyName}</h1>
                <div className="hidden md:flex flex-col ml-2 mt-1 gap-1">
                  <div className="flex flex-wrap items-center gap-x-4">
                    {companyPhone && (
                      <span className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                        <Phone size={10} className="text-primary-500" /> {companyPhone}
                      </span>
                    )}
                    {companyEmail && (
                      <span className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                        <Mail size={10} className="text-primary-500" /> {companyEmail}
                      </span>
                    )}
                  </div>
                  {companyAddress && (
                    <span className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest max-w-[600px] truncate">
                      <MapPin size={10} className="text-primary-500" /> {companyAddress}
                    </span>
                  )}
                </div>
                <NexusBranding size="sm" className="opacity-40 ml-2 mt-1 md:hidden" />
              </div>
            </div>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-primary-600 text-white rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-primary-700 transition-all shadow-lg active:scale-95">
              <Printer className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> <span className="hidden xs:inline">Imprimir</span>
            </button>
          </div>
        </header>
      )}

      {/* ÁREA PRINCIPAL */}
      <main className={`${isPrint ? 'max-w-full m-0 p-0 transform scale-[0.98] origin-top' : 'max-w-[1000px] mx-auto mt-8 px-6 print:m-0 print:p-0'}`}>

        {/* ============================================================
             LAYOUT DE IMPRESSÃO (INSPIRADO NO MODELO PROLOG)
             ============================================================ */}
        {/* ============================================================
             LAYOUT DE IMPRESSÃO - PADRÃO OS (Clean & Professional)
             ============================================================ */}
        <div className={`${isPrint ? 'block' : 'hidden print:block'} bg-white text-[10px] leading-tight font-sans`}>

          {/* 1. CABEÇALHO PADRÃO */}
          <div className="flex justify-between items-start pb-4 border-b-2 border-slate-800 mb-4">
            <div className="flex gap-4 items-center">
              {companyLogo ? (
                <img src={companyLogo} alt="Logo" className="h-16 w-auto object-contain" />
              ) : (
                <div className="bg-slate-900 p-2 rounded-lg flex items-center justify-center min-w-[60px] min-h-[60px]">
                  <Hexagon size={32} className="text-white fill-white/10" />
                </div>
              )}
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

            <div className="text-right flex flex-col items-end justify-center">
              <div className="border-2 border-slate-800 px-4 py-2 rounded-lg bg-slate-50">
                <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Nº da Ordem de Serviço</div>
                <div className="text-2xl font-black text-slate-900 tracking-tighter">#{order.id.toUpperCase()}</div>
              </div>
              <div className="text-[8px] font-bold text-slate-400 mt-2 uppercase tracking-wide">
                Emissão: {new Date().toLocaleDateString()} às {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
          </div>

          {/* 2. DADOS DO CLIENTE E DO CHAMADO (GRID) */}
          <div className="mb-4 border border-slate-300 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <UserIcon size={10} /> Dados do Cliente e Chamado
            </div>
            <div className="grid grid-cols-12 divide-x divide-slate-200">
              {/* Coluna 1: Cliente (Maior) - Span 7 */}
              <div className="col-span-12 sm:col-span-7 p-2.5 space-y-2">
                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Cliente / Solicitante</label>
                  <div className="font-bold text-slate-900 text-sm uppercase">{order.customerName}</div>
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Endereço do Serviço</label>
                  <div className="font-medium text-slate-700 text-xs uppercase">{order.customerAddress}</div>
                </div>
              </div>

              {/* Coluna 2: Detalhes do Chamado - Span 5 */}
              <div className="col-span-12 sm:col-span-5 p-2.5 grid grid-cols-2 gap-y-3 gap-x-2 bg-slate-50/30">
                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Data Abertura</label>
                  <div className="font-bold text-slate-800">{formatOSDate(order.createdAt)}</div>
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Tipo de Serviço</label>
                  <div className="font-bold text-slate-800 uppercase">{order.operationType || 'Manutenção'}</div>
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Status Atual</label>
                  <div className="font-bold text-slate-800 uppercase border border-slate-200 px-1.5 py-0.5 rounded inline-block bg-white text-[9px]">{order.status}</div>
                </div>
                <div>
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Prioridade</label>
                  <div className="font-bold text-slate-800 uppercase text-[9px]">{order.priority}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. EQUIPAMENTO / ATIVO (SE HOUVER) */}
          {(order.equipmentName || order.equipmentSerial) && (
            <div className="mb-4 border border-slate-300 rounded-lg overflow-hidden">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <Box size={10} /> Equipamento Vinculado
              </div>
              <div className="grid grid-cols-3 divide-x divide-slate-200 bg-white">
                <div className="p-2.5">
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Equipamento / Ativo</label>
                  <div className="font-bold text-slate-900 uppercase text-xs">{order.equipmentName || 'Não Informado'}</div>
                </div>
                <div className="p-2.5">
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Modelo / Versão</label>
                  <div className="font-medium text-slate-700 uppercase">{order.equipmentModel || '-'}</div>
                </div>
                <div className="p-2.5">
                  <label className="block text-[8px] font-bold text-slate-400 uppercase">Nº de Série / Identificação</label>
                  <div className="font-bold text-slate-800 uppercase font-mono">{order.equipmentSerial || '-'}</div>
                </div>
              </div>
            </div>
          )}

          {/* 4. EXECUÇÃO TÉCNICA E CUSTOS (LADO A LADO SE POSSÍVEL, MAS EM FLUXO NORMAL AQUI) */}
          <div className="mb-4 border border-slate-300 rounded-lg overflow-hidden">
            <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 flex justify-between items-center">
              <span className="font-bold text-[9px] uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <FileText size={10} /> Relatório Técnico
              </span>
              <span className="text-[8px] font-semibold text-slate-500 uppercase">
                Técnico Responsável: <span className="text-slate-900 font-bold">{tech?.name || 'Não Atribuído'}</span>
              </span>
            </div>

            <div className="p-0">
              {/* Linha de Tempos */}
              <div className="grid grid-cols-3 border-b border-slate-200 bg-slate-50/30 divide-x divide-slate-200">
                <div className="p-2 text-center">
                  <span className="block text-[8px] text-slate-400 font-bold uppercase">Agendado Para</span>
                  <span className="font-bold text-slate-700">{formatOSDate(order.scheduledDate)} {order.scheduledTime}</span>
                </div>
                <div className="p-2 text-center">
                  <span className="block text-[8px] text-slate-400 font-bold uppercase">Início (Check-in)</span>
                  <span className="font-bold text-emerald-700">
                    {order.startDate ? new Date(order.startDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--/-- --:--'}
                  </span>
                </div>
                <div className="p-2 text-center">
                  <span className="block text-[8px] text-slate-400 font-bold uppercase">Fim (Check-out)</span>
                  <span className="font-bold text-emerald-700">
                    {order.endDate ? new Date(order.endDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--/-- --:--'}
                  </span>
                </div>
              </div>

              {/* Descrição do Serviço */}
              <div className="p-3 bg-white min-h-[80px]">
                <label className="block text-[8px] font-bold text-slate-400 uppercase mb-1">Diagnóstico / Atividades Realizadas</label>
                <div className="text-[10px] text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">
                  {order.description || "Nenhuma descrição técnica registrada."}
                </div>
              </div>
            </div>
          </div>

          {/* 5. PEÇAS E VALORES (TABELA CLÁSSICA) */}
          {order.showValueToClient && order.items && order.items.length > 0 && (
            <div className="mb-4 border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <DollarSign size={10} /> Peças e Serviços
              </div>
              <table className="w-full text-left collapse">
                <thead>
                  <tr className="bg-slate-50 text-[8px] font-bold text-slate-500 uppercase border-b border-slate-200">
                    <th className="px-3 py-2 w-[50%]">Descrição</th>
                    <th className="px-3 py-2 text-center w-[15%]">Qtd</th>
                    <th className="px-3 py-2 text-right w-[15%]">Unitário</th>
                    <th className="px-3 py-2 text-right w-[20%]">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {order.items.map((item, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'}>
                      <td className="px-3 py-1.5 text-[9px] font-medium text-slate-700">{item.description}</td>
                      <td className="px-3 py-1.5 text-center text-[9px] text-slate-600">{item.quantity}</td>
                      <td className="px-3 py-1.5 text-right text-[9px] text-slate-600 font-mono">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                      <td className="px-3 py-1.5 text-right text-[9px] font-bold text-slate-800 font-mono">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t border-slate-200 bg-slate-50">
                  <tr>
                    <td colSpan={3} className="px-3 py-2 text-right text-[9px] font-bold uppercase text-slate-500">Total Geral:</td>
                    <td className="px-3 py-2 text-right text-[11px] font-black text-slate-900 font-mono bg-slate-100">
                      R$ {order.items.reduce((acc, i) => acc + i.total, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* 6. CHECKLIST E EVIDÊNCIAS (TABELA STANDARD) */}
          {(order.formData && Object.keys(order.formData).length > 0) && (
            <div className="mb-4 border border-slate-300 rounded-lg overflow-hidden break-inside-avoid">
              <div className="bg-slate-100 px-3 py-1.5 border-b border-slate-300 font-bold text-[9px] uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <CheckCircle2 size={10} /> Auditoria e Verificações
              </div>

              {/* Tabela de Itens de Checklist */}
              <div className="grid grid-cols-2 divide-x divide-slate-200 border-b border-slate-200">
                {/* Coluna Esquerda */}
                <div className="divide-y divide-slate-100">
                  {Object.entries(order.formData).filter(([key, val]) => {
                    if (Array.isArray(val)) return false;
                    if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:'))) return false;
                    if (key.includes('Assinatura') || key.includes('CPF') || key.includes('Nascimento')) return false;
                    return true;
                  }).slice(0, Math.ceil(Object.entries(order.formData).filter(([k, v]) => typeof v !== 'object').length / 2) + 1).map(([key, val]) => (
                    <div key={key} className="flex justify-between px-3 py-1 items-center bg-white">
                      <span className="text-[9px] text-slate-600 font-medium truncate pr-2 max-w-[200px]">{key}</span>
                      <span className="text-[9px] font-bold text-slate-900 uppercase">{String(val)}</span>
                    </div>
                  ))}
                </div>
                {/* Coluna Direita */}
                <div className="divide-y divide-slate-100">
                  {Object.entries(order.formData).filter(([key, val]) => {
                    if (Array.isArray(val)) return false;
                    if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:'))) return false;
                    if (key.includes('Assinatura') || key.includes('CPF') || key.includes('Nascimento')) return false;
                    return true;
                  }).slice(Math.ceil(Object.entries(order.formData).filter(([k, v]) => typeof v !== 'object').length / 2) + 1).map(([key, val]) => (
                    <div key={key} className="flex justify-between px-3 py-1 items-center bg-white">
                      <span className="text-[9px] text-slate-600 font-medium truncate pr-2 max-w-[200px]">{key}</span>
                      <span className="text-[9px] font-bold text-slate-900 uppercase">{String(val)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evidências Fotográficas (Grid Compacto) */}
              <div className="p-3 bg-white">
                <div className="text-[8px] font-bold text-slate-400 uppercase mb-2 border-b border-slate-100 pb-1">Evidências Fotográficas</div>
                <div className="grid grid-cols-5 gap-2">
                  {Object.entries(order.formData).map(([key, val]) => {
                    if (key.includes('Assinatura')) return null;
                    let photos: string[] = [];
                    if (Array.isArray(val)) photos = val.filter(item => typeof item === 'string' && (item.startsWith('http') || item.startsWith('data:')));
                    else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:'))) photos = [val];

                    if (photos.length === 0) return null;

                    return photos.map((url, i) => (
                      <div key={`${key}-${i}`} className="space-y-1 break-inside-avoid text-center">
                        <div className="aspect-[4/3] border border-slate-200 bg-slate-50 overflow-hidden rounded-sm mx-auto w-full max-w-[120px]">
                          <img src={url} className="w-full h-full object-cover grayscale brightness-110 contrast-125" alt={key} />
                        </div>
                        <p className="text-[7px] text-slate-500 font-medium truncate px-1">{key}</p>
                      </div>
                    ));
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 7. ÁREA DE ASSINATURAS (FOOTER SÓLIDO) */}
          <div className="mt-8 pt-4 border-t-2 border-slate-800 break-inside-avoid">
            <div className="grid grid-cols-2 gap-10">
              {/* Assinatura Técnico */}
              <div className="text-center">
                <div className="h-16 flex items-end justify-center pb-1">
                  {/* Espaço para assinatura digital se houvesse, ou apenas linha */}
                  <div className="w-2/3 border-b border-slate-400"></div>
                </div>
                <div className="mt-1">
                  <div className="text-[9px] font-bold text-slate-900 uppercase">{tech?.name || 'Técnico Responsável'}</div>
                  <div className="text-[7px] font-medium text-slate-500 uppercase">Assinatura do Prestador</div>
                </div>
              </div>

              {/* Assinatura Cliente */}
              <div className="text-center">
                <div className="h-16 flex items-end justify-center pb-1 relative">
                  {(() => {
                    const signatureEntry = Object.entries(order.formData || {}).find(([k, v]) => {
                      const isImage = typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http'));
                      const isSignatureKey = k.toLowerCase().includes('assinatura') && (k.toLowerCase().includes('cliente') || k.toLowerCase().includes('responsavel'));
                      return isImage && isSignatureKey;
                    });

                    if (signatureEntry) {
                      return <img src={signatureEntry[1]} className="absolute bottom-0 h-14 object-contain mix-blend-multiply opacity-90" />;
                    }
                    return <div className="w-2/3 border-b border-slate-400"></div>;
                  })()}
                </div>
                <div className="mt-1">
                  <div className="text-[9px] font-bold text-slate-900 uppercase">
                    {Object.entries(order.formData || {}).find(([k, v]) => k.toLowerCase().includes('nome') && (k.toLowerCase().includes('assinatura') || k.toLowerCase().includes('responsavel')))?.[1] || order.customerName}
                  </div>
                  <div className="text-[7px] font-medium text-slate-500 uppercase">Assinatura do Cliente / Responsável</div>
                  {/* Data e Hora da Assinatura */}
                  <div className="text-[7px] text-slate-400 mt-0.5 font-mono">
                    Doc: {Object.entries(order.formData || {}).find(([k, v]) => k.toLowerCase().includes('cpf') || k.toLowerCase().includes('doc'))?.[1] || 'N/A'}
                  </div>
                </div>
              </div>
            </div>

            {/* Rodapé Legal */}
            <div className="mt-6 text-center border-t border-slate-200 pt-2">
              <p className="text-[7px] text-slate-400 uppercase tracking-widest font-medium">
                Este documento comprova a execução dos serviços descritos acima. Gerado eletronicamente via Nexus System.
              </p>
            </div>
          </div>
        </div>

        {/* ============================================================
             LAYOUT WEB (MODERN CARD VIEW) - Oculto na Impressão
             ============================================================ */}
        {!isPrint && (
          <div className="print:hidden space-y-6">
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
              <div className="space-y-2 w-full">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-100 text-slate-500 rounded-lg">
                  <span className="text-[10px] font-black uppercase tracking-wider">Protocolo:</span>
                  <span className="text-xs font-black text-slate-900">#{order.id.toUpperCase()}</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase tracking-tighter leading-tight italic">{order.title}</h2>
                <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  <span className="flex items-center gap-1.5"><Calendar size={12} /> Aberta em: {new Date(order.createdAt).toLocaleDateString('pt-BR')}</span>
                  <span className="flex items-center gap-1.5"><Tag size={12} className="rotate-90" /> {order.operationType || 'Visita Técnica'}</span>
                </div>
              </div>
              <div className="flex flex-row md:flex-col items-center md:items-end justify-between w-full md:w-auto gap-3 border-t md:border-t-0 pt-4 md:pt-0">
                <StatusBadge status={order.status} />
                <div className="text-[10px] font-black text-slate-400 uppercase bg-slate-50 px-3 py-1 rounded-full border border-slate-100">Prioridade: {order.priority}</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-2 text-primary-600 pb-2 border-b border-slate-50">
                  <UserIcon size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Informações do Cliente</span>
                </div>
                <p className="text-sm font-black text-slate-900 uppercase">{order.customerName}</p>
              </div>
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-2 text-primary-600 pb-2 border-b border-slate-50">
                  <MapPin size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Localização da Atividade</span>
                </div>
                <p className="text-[11px] font-bold text-slate-900 uppercase">{order.customerAddress}</p>
              </div>
            </div>

            {/* REGISTRO DE IMPEDIMENTO (SE EXISTIR) */}
            {(order.status === 'IMPEDIDO' || order.formData?.impediment_reason) && (
              <div className="bg-red-50 rounded-2xl sm:rounded-3xl border border-red-100 p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-2 text-red-600 pb-2 border-b border-red-200/50">
                  <ShieldAlert size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Aviso de Impedimento</span>
                </div>
                <div className="space-y-4">
                  <div>
                    <p className="text-[8px] font-black text-red-400 uppercase mb-1">Motivo do Bloqueio</p>
                    <p className="text-sm font-bold text-red-900 leading-relaxed italic uppercase">
                      "{order.formData?.impediment_reason || order.notes?.replace('IMPEDIMENTO: ', '') || 'Nenhum motivo detalhado.'}"
                    </p>
                  </div>
                  {order.formData?.impediment_photos && Array.isArray(order.formData.impediment_photos) && order.formData.impediment_photos.length > 0 && (
                    <div>
                      <p className="text-[8px] font-black text-red-400 uppercase mb-2">Evidências do Impedimento</p>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {order.formData.impediment_photos.map((url: string, idx: number) => (
                          <div
                            key={idx}
                            className="relative aspect-square rounded-xl overflow-hidden border border-red-200 shadow-sm cursor-zoom-in group"
                            onClick={() => setFullscreenImage(url)}
                          >
                            <img src={url} className="w-full h-full object-cover transition-transform group-hover:scale-110" alt="Evidência impedimento" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="p-6 sm:p-8 space-y-6">
                <div className="flex items-center gap-2 text-primary-600 pb-2 border-b border-slate-50">
                  <Box size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Ativo / Equipamento Vinculado</span>
                </div>
                <div className="flex items-center gap-4 sm:gap-5">
                  <div className="w-12 h-12 sm:w-16 sm:h-16 bg-slate-50 rounded-xl sm:rounded-2xl flex items-center justify-center text-slate-300 border border-slate-100 shrink-0"><Box className="w-6 h-6 sm:w-8 sm:h-8" /></div>
                  <div className="min-w-0">
                    <h4 className="text-base sm:text-lg font-black text-slate-900 uppercase truncate">{order.equipmentName || 'Não Especificado'}</h4>
                    <div className="flex flex-col xs:flex-row gap-2 xs:gap-4 mt-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Modelo: <span className="text-slate-600">{order.equipmentModel || '-'}</span></p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Série: <span className="text-slate-600">{order.equipmentSerial || '-'}</span></p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* RELATÓRIO TÉCNICO E EXECUÇÃO (WEB) */}
            <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 space-y-6">
              <div className="flex items-center gap-2 text-primary-600 pb-2 border-b border-slate-50">
                <FileText size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Relatório Técnico de Execução</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Responsável</p>
                  <p className="text-xs font-black text-slate-900 uppercase">{tech?.name || 'Não Atribuído'}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Check-In</p>
                  <p className="text-xs font-black text-slate-900">{order.startDate ? new Date(order.startDate).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '--:--'}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <p className="text-[8px] font-black text-slate-400 uppercase mb-1">Check-Out</p>
                  <p className="text-xs font-black text-slate-900">{order.endDate ? new Date(order.endDate).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' }) : '--:--'}</p>
                </div>
              </div>
              <div className="p-6 bg-primary-50/30 rounded-2xl border border-primary-100/50">
                <p className="text-[9px] font-black text-primary-600 uppercase mb-3 tracking-widest flex items-center gap-2">
                  <CheckCircle2 size={12} /> Descrição Técnica das Atividades
                </p>
                <p className="text-sm font-bold text-slate-700 leading-relaxed uppercase italic">
                  {order.description || 'Nenhum detalhe técnico registrado.'}
                </p>
              </div>

              {/* Valores e Peças (Modo Web) */}
              {order.showValueToClient && order.items && order.items.length > 0 && (
                <div className="space-y-4 pt-4 border-t border-slate-100">
                  <p className="text-[10px] font-black text-primary-600 uppercase tracking-widest flex items-center gap-2">
                    <DollarSign size={16} /> Composição de Valores e Materiais
                  </p>

                  <div className="bg-slate-50/50 rounded-2xl border border-slate-100 overflow-hidden">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="bg-white text-[8px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
                          <th className="px-6 py-3">Descrição do Item</th>
                          <th className="px-6 py-3 w-20 text-center">Qtd</th>
                          <th className="px-6 py-3 w-32 text-right">Unitário</th>
                          <th className="px-6 py-3 w-32 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {order.items.map(item => (
                          <tr key={item.id}>
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-700 uppercase">{item.description}</span>
                                {item.fromStock && <span className="text-[8px] font-bold text-emerald-600 uppercase italic">Original em Estoque</span>}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-center text-[10px] font-bold text-slate-500">{item.quantity}</td>
                            <td className="px-6 py-4 text-right text-[10px] font-mono text-slate-600">R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                            <td className="px-6 py-4 text-right text-[10px] font-black text-slate-900 font-mono">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-primary-600 p-6 rounded-2xl flex justify-between items-center text-white shadow-lg shadow-primary-600/20">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white/10 rounded-xl"><DollarSign size={20} /></div>
                      <div>
                        <p className="text-[8px] font-black uppercase tracking-widest opacity-70">Total do Atendimento</p>
                        <p className="text-[10px] font-bold uppercase italic">Pague via faturamento ou direto ao técnico</p>
                      </div>
                    </div>
                    <div className="text-2xl font-black italic tracking-tighter">
                      R$ {order.items.reduce((acc, i) => acc + i.total, 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* CHECKLIST E EVIDÊNCIAS (WEB) */}
            {(order.formData && Object.keys(order.formData).length > 0) && (
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                <div className="p-6 sm:p-8 space-y-6">
                  <div className="flex items-center gap-2 text-emerald-600 pb-2 border-b border-slate-50">
                    <CheckCircle2 size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Auditoria de Conformidade</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                    {Object.entries(order.formData).filter(([key, val]) => {
                      // 1. Filtro Robusto: Remove qualquer coisa que pareça imagem
                      if (Array.isArray(val)) return false; // Arrays são fotos agora
                      if (typeof val !== 'string') return true; // Se não é string nem array, deve ser número/bool

                      const isBase64 = val.startsWith('data:image');
                      const isUrl = val.startsWith('http');
                      // Filtra metadados de assinatura para não duplicar informação
                      const isSignatureRel = key.includes('Assinatura') || key.includes('CPF') || key.includes('Nascimento');

                      return !isBase64 && !isUrl && !isSignatureRel;
                    }).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <span className="text-[10px] font-black text-slate-500 uppercase italic leading-none max-w-[60%]">
                          {!isNaN(Number(key)) ? `Pergunta nº ${key}` : key}
                        </span>
                        <span className={`text-[11px] font-black flex items-center gap-2 ${String(val).toLowerCase().includes('sim') || String(val).toLowerCase().includes('ok') ? 'text-emerald-600' : 'text-slate-900 uppercase'}`}>
                          {String(val).toLowerCase().includes('sim') || String(val).toLowerCase().includes('ok') ? <CheckCircle2 size={12} /> : null}
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Evidências Fotográficas (Agrupadas por Pergunta) */}
                  <div className="space-y-6 pt-6">
                    <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Evidências Fotográficas do Atendimento</p>
                    {/* Debug temporário */}
                    {console.log('📦 FormData Debug:', order.formData)}

                    <div className="space-y-8">
                      {Object.entries(order.formData || {}).map(([key, val]) => {
                        // Ignora campos de assinatura
                        if (key.includes('Assinatura')) return null;

                        let photos: string[] = [];
                        if (Array.isArray(val)) {
                          photos = val.filter(item => typeof item === 'string' && (item.startsWith('http') || item.startsWith('data:image')));
                        } else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) {
                          photos = [val];
                        }

                        if (photos.length === 0) return null;

                        return (
                          <div key={key} className="space-y-3">
                            <h4 className="text-[10px] font-black text-primary-600 uppercase tracking-wide flex items-center gap-2">
                              <div className="w-1 h-1 bg-primary-400 rounded-full" />
                              {key}
                            </h4>
                            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
                              {photos.map((url, idx) => (
                                <div
                                  key={`${key}-${idx}`}
                                  className="relative aspect-square rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 group shadow-sm hover:shadow-md transition-all cursor-zoom-in"
                                  onClick={() => setFullscreenImage(url)}
                                >
                                  <img src={url} className="w-full h-full object-cover transition-all duration-500" alt={key} />
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}



            {/* ASSINATURAS (WEB) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">

              {/* Card Validação Técnica */}
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 text-center space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Validação Técnica</p>
                <div
                  className="h-20 flex items-center justify-center grayscale opacity-60 cursor-zoom-in"
                  onClick={() => {
                    const sig = Object.entries(order.formData || {}).find(([k, v]) => k.toLowerCase().includes('assinat') && typeof v === 'string')?.[1];
                    if (sig) setFullscreenImage(sig);
                  }}
                >
                  <Hexagon size={48} className="text-slate-200" />
                </div>
                <div>
                  <p className="text-xs font-black text-slate-900 uppercase italic">{tech?.name || 'Responsável Técnico'}</p>
                </div>
              </div>

              {/* Card Ciência do Cliente */}
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 text-center space-y-4">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ciência do Cliente</p>

                {(() => {
                  let data = order.formData || {};
                  // Parse seguro caso venha string
                  if (typeof data === 'string') {
                    try { data = JSON.parse(data); } catch { data = {}; }
                  }

                  const normalize = (str: string) => str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
                  const keys = Object.keys(data);
                  const findValue = (targetToken: string) => {
                    const exact = data[targetToken];
                    if (exact) return exact;

                    // Busca por chave exata no App V2
                    if (targetToken === 'signature' && data.signature) return data.signature;
                    if (targetToken === 'signatureName' && data.signatureName) return data.signatureName;
                    if (targetToken === 'signatureDoc' && data.signatureDoc) return data.signatureDoc;

                    const foundKey = keys.find(k => normalize(k).includes(normalize(targetToken)));
                    return foundKey ? data[foundKey] : null;
                  };

                  let signature = data.signature || findValue('Assinatura do Cliente') || findValue('assinaturadocliente') || findValue('assinatura');

                  let name = data.signatureName || findValue('Assinatura do Cliente - Nome') || findValue('assinaturadoclientenome') || findValue('responsavel') || findValue('nome');

                  let cpf = data.signatureDoc || findValue('Assinatura do Cliente - CPF') || findValue('assinaturadoclientecpf') || findValue('cpf');

                  let birth = findValue('Assinatura do Cliente - Nascimento') || findValue('assinaturadoclientenascimento');

                  return (
                    <>
                      <div
                        className="h-28 sm:h-32 flex flex-col items-center justify-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-100 relative group cursor-zoom-in overflow-hidden px-4 py-3"
                        onClick={() => signature && setFullscreenImage(signature)}
                      >
                        {signature ? (
                          <img
                            src={signature}
                            className="h-full w-full object-contain mix-blend-multiply transition-transform group-hover:scale-105"
                            alt="Assinatura Cliente"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-2 opacity-50">
                            <div className="w-8 h-8 rounded-full bg-slate-200" />
                            <span className="text-[9px] font-black text-slate-300 uppercase italic">Adesão via Protocolo Digital</span>
                          </div>
                        )}
                      </div>

                      <div>
                        {name && <p className="text-xs font-black text-slate-900 uppercase italic">{name}</p>}
                        <p className="text-[8px] font-bold text-slate-400 uppercase mt-1 flex justify-center gap-3">
                          {cpf && <span>DOC: {cpf}</span>}
                          {birth && <span>• Nascimento: {birth}</span>}
                        </p>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* RODAPÉ INTEGRADO */}
      <footer className={`${isPrint ? 'opacity-100 mt-4' : 'opacity-40 hover:opacity-100'} max-w-[1000px] mx-auto mb-8 px-6 text-center space-y-2 transition-opacity`}>
        <div className="flex items-center justify-center gap-4">
          <NexusBranding size="sm" className="opacity-50" />
        </div>
        <p className="text-[7px] font-bold text-slate-400 uppercase tracking-[0.2em]">Documento emitido eletronicamente pela Plataforma Nexus Pro. Verifique a autenticidade via QR-Code se disponível.</p>
      </footer >

      {/* NEXUS LIGHTBOX IMMERSIVE VIEWER */}
      {
        fullscreenImage && (
          <div
            className="fixed inset-0 z-[1000] bg-slate-900/95 backdrop-blur-xl flex items-center justify-center p-4 sm:p-10 animate-fade-in cursor-zoom-out"
            onClick={() => setFullscreenImage(null)}
          >
            <div className="relative max-w-5xl w-full h-full flex items-center justify-center">
              <img
                src={fullscreenImage}
                className="max-w-full max-h-full object-contain rounded-2xl shadow-2xl animate-scale-up"
                alt="Fullscreen"
              />
              <div className="absolute top-0 right-0 p-4">
                <div className="p-3 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors">
                  <X size={24} />
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

const X = ({ size, className }: { size: number, className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
