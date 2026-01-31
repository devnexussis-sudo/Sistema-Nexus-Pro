import React from 'react';
import { ServiceOrder, User } from '../../types';
import { Calendar, MapPin, Printer, Hexagon, Box, User as UserIcon, Tag, CheckCircle2, FileText, ShieldAlert, Mail, Phone } from 'lucide-react';
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
  }, [order]);

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
    <div className={`${isPrint ? 'bg-white p-0' : 'bg-[#F5F7FA] pb-20'} font-sans selection:bg-indigo-100 selection:text-indigo-900`}>

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
                        <Phone size={10} className="text-indigo-500" /> {companyPhone}
                      </span>
                    )}
                    {companyEmail && (
                      <span className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                        <Mail size={10} className="text-indigo-500" /> {companyEmail}
                      </span>
                    )}
                  </div>
                  {companyAddress && (
                    <span className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest max-w-[600px] truncate">
                      <MapPin size={10} className="text-indigo-500" /> {companyAddress}
                    </span>
                  )}
                </div>
                <NexusBranding size="sm" className="opacity-40 ml-2 mt-1 md:hidden" />
              </div>
            </div>
            <button onClick={() => window.print()} className="flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 bg-indigo-600 text-white rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg active:scale-95">
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
        <div className={`${isPrint ? 'block' : 'hidden print:block'} bg-white text-[9px] leading-tight space-y-4`}>

          {/* 1. CABEÇALHO LIMPO */}
          <div className="flex justify-between items-start py-6 border-b-2 border-slate-900 px-2">
            <div className="flex gap-6 items-center">
              {companyLogo ? (
                <img src={companyLogo} alt="Logo" className="h-20 w-auto object-contain" />
              ) : (
                <div className="bg-slate-900 p-3 rounded-2xl flex items-center justify-center min-w-[70px] min-h-[70px]">
                  <Hexagon size={32} className="text-white fill-white/10" />
                </div>
              )}
              <div className="space-y-1 ml-4">
                <h1 className="text-2xl font-black text-slate-900 tracking-tighter uppercase leading-none italic">{companyName}</h1>
                <div className="text-[7.5px] font-bold text-slate-500 uppercase tracking-tight max-w-[350px]">
                  {companyAddress && <div>{companyAddress}</div>}
                  <div className="flex gap-2">
                    {companyPhone && <span>Tel: {companyPhone}</span>}
                    {companyEmail && <span>Email: {companyEmail}</span>}
                  </div>
                  {companyDoc && <div>CNPJ: {companyDoc}</div>}
                </div>
              </div>
            </div>

            <div className="text-right flex flex-col items-end gap-2">
              <div className="bg-indigo-600 text-white px-4 py-2 rounded-xl">
                <div className="text-[8px] font-black uppercase tracking-widest opacity-70">Protocolo da OS</div>
                <div className="text-lg font-black tracking-tighter">#{order.id.toUpperCase()}</div>
              </div>
              <div className="text-[7px] font-black text-slate-400 uppercase tracking-widest italic flex items-center gap-2">
                <NexusBranding size="sm" showText={true} />
              </div>
            </div>
          </div>
          <div className="text-center py-1">
            <p className="text-[7px] font-bold text-slate-300 uppercase tracking-[0.3em]">Documento de Uso Técnico • Gerado via Nexus Cloud em {new Date().toLocaleDateString()} {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
          </div>

          {/* 2. INFORMAÇÕES DO CLIENTE (BARRA SÓLIDA) */}
          <div className="space-y-0">
            <div className="bg-slate-900 text-white px-3 py-1 font-black text-[8px] uppercase tracking-wider">
              Informações do Cliente e Atendimento
            </div>
            <div className="grid grid-cols-2 border border-slate-200 divide-x divide-slate-200">
              <div className="p-2 space-y-1">
                <div>
                  <span className="text-[6px] font-black text-slate-400 uppercase block leading-none underline decoration-slate-200">Nome do Cliente</span>
                  <span className="text-xs font-black text-slate-900 uppercase">{order.customerName}</span>
                </div>
                <div>
                  <span className="text-[6px] font-black text-slate-400 uppercase block leading-none underline decoration-slate-200">Endereço da Atividade</span>
                  <span className="text-[9px] font-bold text-slate-600 uppercase leading-snug">{order.customerAddress}</span>
                </div>
              </div>
              <div className="p-2 grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[6px] font-black text-slate-400 uppercase block leading-none italic">Data de Abertura</span>
                  <span className="font-bold text-slate-900">{formatOSDate(order.createdAt)}</span>
                </div>
                <div>
                  <span className="text-[6px] font-black text-slate-400 uppercase block leading-none italic">Operação</span>
                  <span className="font-bold text-slate-900 uppercase">{order.operationType || 'Visita Técnica'}</span>
                </div>
                <div>
                  <span className="text-[6px] font-black text-slate-400 uppercase block leading-none italic">Status Atual</span>
                  <span className="font-black text-indigo-600 uppercase">{order.status}</span>
                </div>
                <div>
                  <span className="text-[6px] font-black text-slate-400 uppercase block leading-none italic">Prioridade</span>
                  <span className="font-black text-slate-900 uppercase">{order.priority}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 3. DADOS DO ATIVO / EQUIPAMENTO (BARRA SÓLIDA) */}
          <div className="space-y-0">
            <div className="bg-slate-800 text-white px-3 py-1 font-black text-[8px] uppercase tracking-wider">
              Veículo / Equipamento Vinculado
            </div>
            <div className="grid grid-cols-3 border border-slate-200 divide-x divide-slate-200 bg-slate-50/30">
              <div className="p-2 px-3">
                <span className="text-[6px] font-black text-slate-400 uppercase block leading-none mb-0.5">Descrição do Ativo</span>
                <span className="text-xs font-black text-slate-900 uppercase">{order.equipmentName}</span>
              </div>
              <div className="p-2 px-3">
                <span className="text-[6px] font-black text-slate-400 uppercase block leading-none mb-0.5">Modelo / Versão</span>
                <span className="text-[10px] font-bold text-slate-700 uppercase">{order.equipmentModel}</span>
              </div>
              <div className="p-2 px-3">
                <span className="text-[6px] font-black text-slate-400 uppercase block leading-none mb-0.5">Nº de Série / Identificação</span>
                <span className="text-[10px] font-black text-indigo-700 uppercase">{order.equipmentSerial}</span>
              </div>
            </div>
          </div>

          {/* 4. EXECUÇÃO TÉCNICA (BARRA SÓLIDA) */}
          <div className="space-y-0">
            <div className="bg-indigo-600 text-white px-3 py-1 font-black text-[8px] uppercase tracking-wider flex justify-between">
              <span>Relatório Técnico e Notas de Campo</span>
              <span className="italic opacity-70">Executado por: {tech?.name || 'Não Atribuído'}</span>
            </div>
            <div className="border border-slate-200 p-3 bg-slate-50/20">
              {/* Horários de Execução Integrados */}
              <div className="flex gap-6 mb-3 border-b border-slate-100 pb-2">
                <div>
                  <span className="text-[6px] font-black text-slate-400 block uppercase mb-0.5">Data Agendada</span>
                  <span className="font-bold text-slate-900">{formatOSDate(order.scheduledDate)} {order.scheduledTime}</span>
                </div>
                <div className="flex gap-4 border-l border-slate-200 pl-4 text-emerald-700">
                  <div>
                    <span className="text-[6px] font-black text-slate-400 block uppercase mb-0.5">Check-In Real</span>
                    <span className="font-black text-[9px]">
                      {order.startDate ? new Date(order.startDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--/--/---- --:--'}
                    </span>
                  </div>
                  <div>
                    <span className="text-[6px] font-black text-slate-400 block uppercase mb-0.5">Check-Out Real</span>
                    <span className="font-black text-[9px]">
                      {order.endDate ? new Date(order.endDate).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '--/--/---- --:--'}
                    </span>
                  </div>
                </div>
              </div>
              {/* Descrição em Bullets (se possível) ou Bloco Compacto */}
              <div className="space-y-2">
                <span className="text-[6px] font-black text-indigo-400 uppercase block leading-none italic">Diagnóstico / Atividades Realizadas:</span>
                <p className="text-[8.5px] font-medium text-slate-700 italic border-l-2 border-slate-200 pl-2 leading-tight">
                  {order.description}
                </p>
              </div>
            </div>
          </div>

          {/* 5. CHECKLIST E EVIDÊNCIAS (LAYOUT DE TABELA) */}
          {(order.formData && Object.keys(order.formData).length > 0) && (
            <div className="space-y-0">
              <div className="bg-emerald-600 text-white px-3 py-1 font-black text-[8px] uppercase tracking-wider">
                Auditoria de Conformidade e Evidências Fotográficas
              </div>
              <div className="border border-slate-200 bg-white">
                <div className="grid grid-cols-2 border-b border-slate-200">
                  {/* Column 1 of Checklist */}
                  <div className="divide-y divide-slate-100 border-r border-slate-200">
                    {Object.entries(order.formData).filter(([key, val]) => {
                      if (Array.isArray(val)) return false;
                      if (typeof val === 'string' && (val.startsWith('data:image') || val.startsWith('http'))) return false;
                      if (key.includes('Assinatura') || key.includes('CPF') || key.includes('Nascimento')) return false;
                      return true;
                    }).slice(0, Math.ceil(Object.keys(order.formData).length / 2)).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center px-3 py-1 bg-white hover:bg-slate-50 transition-colors">
                        <span className="text-[7.5px] font-black text-slate-500 uppercase italic leading-none">{!isNaN(Number(key)) ? `Item de Verificação nº ${key}` : key}</span>
                        <span className={`text-[8px] font-black flex items-center gap-1 ${String(val).toLowerCase().includes('sim') || String(val).toLowerCase().includes('ok') ? 'text-emerald-600' : 'text-slate-900 uppercase'}`}>
                          {String(val).toLowerCase().includes('sim') || String(val).toLowerCase().includes('ok') ? <CheckCircle2 size={8} /> : null}
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                  {/* Column 2 of Checklist */}
                  <div className="divide-y divide-slate-100">
                    {Object.entries(order.formData).filter(([key, val]) => {
                      if (Array.isArray(val)) return false;
                      if (typeof val === 'string' && (val.startsWith('data:image') || val.startsWith('http'))) return false;
                      if (key.includes('Assinatura') || key.includes('CPF') || key.includes('Nascimento')) return false;
                      return true;
                    }).slice(Math.ceil(Object.keys(order.formData).length / 2)).map(([key, val]) => (
                      <div key={key} className="flex justify-between items-center px-3 py-1 bg-white hover:bg-slate-50 transition-colors">
                        <span className="text-[7.5px] font-black text-slate-500 uppercase italic leading-none">{!isNaN(Number(key)) ? `Item de Verificação nº ${key}` : key}</span>
                        <span className={`text-[8px] font-black flex items-center gap-1 ${String(val).toLowerCase().includes('sim') || String(val).toLowerCase().includes('ok') ? 'text-emerald-600' : 'text-slate-900 uppercase'}`}>
                          {String(val).toLowerCase().includes('sim') || String(val).toLowerCase().includes('ok') ? <CheckCircle2 size={8} /> : null}
                          {String(val)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="p-3 space-y-4">
                  {Object.entries(order.formData).map(([key, val]) => {
                    if (key.includes('Assinatura')) return null;
                    let photos: string[] = [];
                    if (Array.isArray(val)) {
                      photos = val.filter(item => typeof item === 'string' && (item.startsWith('http') || item.startsWith('data:image')));
                    } else if (typeof val === 'string' && (val.startsWith('http') || val.startsWith('data:image'))) {
                      photos = [val];
                    }

                    if (photos.length === 0) return null;

                    return (
                      <div key={key} className="space-y-1.5">
                        <p className="text-[7px] font-black text-indigo-600 uppercase tracking-widest border-l-2 border-indigo-500 pl-2">{key}</p>
                        <div className="grid grid-cols-6 gap-2">
                          {photos.map((url, idx) => (
                            <div
                              key={idx}
                              className="relative aspect-square border border-slate-200 rounded-md overflow-hidden bg-slate-50 cursor-zoom-in group"
                              onClick={() => setFullscreenImage(url)}
                            >
                              <img src={url} className="w-full h-full object-cover" />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* 6. ASSINATURAS E AUTENTICAÇÃO */}
          <div className="pt-4 border-t border-slate-200 mt-6 break-inside-avoid">
            <div className="grid grid-cols-2 gap-20">
              <div className="text-center space-y-2">
                <div className="h-14 border-b-2 border-slate-900 flex flex-col items-center justify-end pb-1 overflow-hidden relative grayscale opacity-40">
                  <Hexagon size={40} className="absolute top-0 opacity-10 rotate-12" />
                  <span className="text-[6px] font-black text-slate-300 uppercase italic leading-none">Validado Digitalmente pela Nexus Cloud</span>
                </div>
                <div>
                  <div className="text-[9px] font-black text-slate-900 uppercase">{tech?.name || 'Responsável Técnico'}</div>
                  <div className="text-[6.5px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Assinatura do Prestador / Técnico</div>
                </div>
              </div>
              <div className="text-center space-y-2">
                <div className="h-14 border-b-2 border-slate-900 flex flex-col items-center justify-center pb-1 bg-white overflow-hidden px-2">
                  {(() => {
                    const signatureEntry = Object.entries(order.formData || {}).find(([k, v]) => {
                      const isImage = typeof v === 'string' && (v.startsWith('data:image') || v.startsWith('http'));
                      const isSignatureKey = k.toLowerCase() === 'assinatura do cliente' ||
                        (k.toLowerCase().includes('assinat') && !k.toLowerCase().includes('nome') && !k.toLowerCase().includes('cpf'));
                      return isImage && isSignatureKey;
                    });

                    return signatureEntry ? (
                      <img
                        src={signatureEntry[1]}
                        className="h-full w-full object-contain mix-blend-multiply"
                        alt="Assinatura do Cliente"
                      />
                    ) : (
                      <span className="text-[6px] font-black text-slate-300 uppercase italic leading-none">Inconsistência na Assinatura Digital</span>
                    );
                  })()}
                </div>
                <div>
                  <div className="text-[9px] font-black text-slate-900 uppercase">
                    {Object.entries(order.formData || {}).find(([k, v]) => {
                      const key = k.toLowerCase();
                      return key.includes('nome') || key.includes('responsável') || key.includes('responsavel');
                    })?.[1] || ''}
                  </div>
                  <div className="text-[6.5px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Assinatura do Cliente / Preposto</div>
                  {Object.entries(order.formData || {}).find(([k, v]) => k.toLowerCase().includes('cpf'))?.[1] && (
                    <div className="text-[6px] font-bold text-slate-400 uppercase mt-0.5">
                      CPF: {Object.entries(order.formData || {}).find(([k, v]) => k.toLowerCase().includes('cpf'))?.[1]}
                    </div>
                  )}
                </div>
              </div>
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
                <div className="flex items-center gap-2 text-indigo-600 pb-2 border-b border-slate-50">
                  <UserIcon size={16} /> <span className="text-[10px] font-black uppercase tracking-widest">Informações do Cliente</span>
                </div>
                <p className="text-sm font-black text-slate-900 uppercase">{order.customerName}</p>
              </div>
              <div className="bg-white rounded-2xl sm:rounded-3xl shadow-sm border border-slate-100 p-6 sm:p-8 space-y-4">
                <div className="flex items-center gap-2 text-indigo-600 pb-2 border-b border-slate-50">
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
                <div className="flex items-center gap-2 text-indigo-600 pb-2 border-b border-slate-50">
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
              <div className="flex items-center gap-2 text-indigo-600 pb-2 border-b border-slate-50">
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
              <div className="p-6 bg-indigo-50/30 rounded-2xl border border-indigo-100/50">
                <p className="text-[9px] font-black text-indigo-600 uppercase mb-3 tracking-widest flex items-center gap-2">
                  <CheckCircle2 size={12} /> Descrição Técnica das Atividades
                </p>
                <p className="text-sm font-bold text-slate-700 leading-relaxed uppercase italic">
                  {order.description || 'Nenhum detalhe técnico registrado.'}
                </p>
              </div>
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
                      {Object.entries(order.formData).map(([key, val]) => {
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
                            <h4 className="text-[10px] font-black text-indigo-600 uppercase tracking-wide flex items-center gap-2">
                              <div className="w-1 h-1 bg-indigo-400 rounded-full" />
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
                    if (data[targetToken]) return data[targetToken];
                    const foundKey = keys.find(k => normalize(k).includes(normalize(targetToken)));
                    return foundKey ? data[foundKey] : null;
                  };

                  let signature = data['Assinatura do Cliente'];
                  if (!signature) signature = findValue('assinaturadocliente');
                  if (!signature) signature = findValue('assinatura');
                  if (!signature) signature = findValue('signature');

                  let name = data['Assinatura do Cliente - Nome'];
                  if (!name) name = findValue('assinaturadoclientenome');
                  if (!name) name = findValue('responsavel');
                  if (!name) name = findValue('nome');

                  let cpf = data['Assinatura do Cliente - CPF'];
                  if (!cpf) cpf = findValue('assinaturadoclientecpf');
                  if (!cpf) cpf = findValue('cpf');

                  let birth = data['Assinatura do Cliente - Nascimento'];
                  if (!birth) birth = findValue('assinaturadoclientenascimento');

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
                          {cpf && <span>CPF: {cpf}</span>}
                          {birth && <span>• DN: {new Date(birth).toLocaleDateString()}</span>}
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
