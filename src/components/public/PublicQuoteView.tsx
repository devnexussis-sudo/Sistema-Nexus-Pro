
import React, { useState, useEffect, useRef } from 'react';
import {
    Hexagon, Calculator, CheckCircle, Clock, MapPin,
    User, FileText, AlertCircle, Share2, Printer,
    ArrowRight, Lock, Signature as SignatureIcon, Send,
    Calendar, ShieldCheck, DollarSign, XCircle, Mail, Phone
} from 'lucide-react';
import { DataService } from '../../services/dataService';
import { NexusBranding } from '../ui/NexusBranding';
import SignatureCanvas from 'react-signature-canvas';

// 🛡️ Nexus Logic: Proteção contra falha de import de componente CJS/ESM
let SignaturePad: any = null;
try {
    SignaturePad = (SignatureCanvas as any).default || SignatureCanvas;
} catch (e) {
    console.error("Nexus: Erro ao carregar biblioteca de assinatura.", e);
}

interface PublicQuoteViewProps {
    id: string;
}

export const PublicQuoteView: React.FC<PublicQuoteViewProps> = ({ id }) => {
    const [quote, setQuote] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isApproveMode, setIsApproveMode] = useState(false);
    const [isRejectMode, setIsRejectMode] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const [tenant, setTenant] = useState<any>(null);

    // Form States
    const [approverName, setApproverName] = useState('');
    const [document, setDocument] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');
    const [coords, setCoords] = useState<{ lat: number, lng: number } | null>(null);
    const sigCanvas = useRef<any>(null);

    // 🛰️ Inicia captura de GPS assim que entra no modo de validação (Aprovação ou Recusa)
    useEffect(() => {
        if ((isApproveMode || isRejectMode) && !coords) {
            navigator.geolocation.getCurrentPosition(
                (pos) => setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                (err) => console.warn("Nexus GPS: Acesso negado.", err),
                { enableHighAccuracy: true, timeout: 10000 }
            );
        }
    }, [isApproveMode, isRejectMode]);

    useEffect(() => {
        const fetchQuote = async () => {
            try {
                const data = await DataService.getPublicQuoteById(id);
                console.log('✍️ URL da assinatura:', data?.approvalSignature?.substring(0, 100));
                setQuote(data);

                // 🏢 Fetch Tenant Data
                if (data) {
                    const tenantId = data.tenant_id || data.tenantId;
                    const tenantData = await DataService.getTenantById(tenantId);
                    setTenant(tenantData);
                }
            } catch (err) {
                console.error(err);
                setError('Orçamento não localizado ou expirado.');
            } finally {
                setLoading(false);
            }
        };
        fetchQuote();
    }, [id]);

    const captureDeviceMetadata = () => {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            screenWidth: window.screen.width,
            screenHeight: window.screen.height,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            timestamp: new Date().toISOString(),
            cookiesEnabled: navigator.cookieEnabled,
            hardwareConcurrency: (navigator as any).hardwareConcurrency || 'N/D'
        };
    };

    const handleApprove = async () => {
        if (!approverName || !document || !birthDate || sigCanvas.current?.isEmpty()) {
            alert('Por favor, preencha todos os campos (Nome, CPF, Data de Nascimento) e assine o documento.');
            return;
        }

        try {
            setIsSubmitting(true);

            // 🛰️ Se ainda não pegou o GPS, tenta uma última vez rápida
            let finalLat = coords?.lat;
            let finalLng = coords?.lng;

            if (!finalLat) {
                try {
                    const pos = await new Promise<GeolocationPosition>((res, rej) => {
                        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 });
                    });
                    finalLat = pos.coords.latitude;
                    finalLng = pos.coords.longitude;
                } catch (e) { console.warn("Nexus GPS: Skip geoloc on submit."); }
            }

            const metadata = captureDeviceMetadata();
            // 🛡️ Fix para erro de 'trim-canvas' no Vite
            // Tentamos usar o trimmed, se falhar, usamos o canvas bruto para não travar a aprovação
            let signatureBase64 = '';
            try {
                signatureBase64 = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
            } catch (e) {
                console.warn("Nexus: Falha ao trimar assinatura, usando canvas base.", e);
                signatureBase64 = sigCanvas.current.getCanvas().toDataURL('image/png');
            }

            await DataService.approveQuote(id, {
                name: approverName,
                document,
                birthDate,
                signature: signatureBase64 || '',
                metadata: metadata, // 🛡️ Injeção de Auditoria Digital
                lat: finalLat, // Injeção GPS
                lng: finalLng  // Injeção GPS
            });

            setIsSuccess(true);
            setIsApproveMode(false);
        } catch (err: any) {
            console.error(err);
            alert(`Falha na aprovação: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmReject = async () => {
        if (!approverName || !document || !birthDate || !rejectionReason.trim() || sigCanvas.current?.isEmpty()) {
            alert('Por favor, preencha todos os campos (Nome, CPF, Data de Nascimento, Motivo) e assine para formalizar a recusa.');
            return;
        }

        try {
            setIsSubmitting(true);

            let finalLat = coords?.lat;
            let finalLng = coords?.lng;

            if (!finalLat) {
                try {
                    const pos = await new Promise<GeolocationPosition>((res, rej) => {
                        navigator.geolocation.getCurrentPosition(res, rej, { timeout: 3000 });
                    });
                    finalLat = pos.coords.latitude;
                    finalLng = pos.coords.longitude;
                } catch (e) { console.warn("Nexus GPS: Skip geoloc on reject."); }
            }

            const metadata = captureDeviceMetadata();
            let signatureBase64 = '';
            try {
                signatureBase64 = sigCanvas.current.getTrimmedCanvas().toDataURL('image/png');
            } catch (e) {
                signatureBase64 = sigCanvas.current.getCanvas().toDataURL('image/png');
            }

            await DataService.rejectQuote(id, {
                name: approverName,
                document,
                birthDate,
                reason: rejectionReason,
                signature: signatureBase64 || '',
                metadata: metadata,
                lat: finalLat,
                lng: finalLng
            });

            setIsRejected(true);
            setIsRejectMode(false);
        } catch (err) {
            console.error(err);
            alert('Falha ao processar recusa.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return (<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="flex flex-col items-center gap-4"><Hexagon size={48} className="animate-spin text-indigo-600" /><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carregando Proposta Nexus...</p></div></div>);

    if (error || !quote) return (<div className="min-h-screen bg-slate-50 flex items-center justify-center p-6"><div className="bg-white p-10 rounded-[3rem] shadow-xl text-center max-w-sm"><AlertCircle size={48} className="text-rose-500 mx-auto mb-4" /><h2 className="text-xl font-black text-slate-900 uppercase italic mb-2">Acesso Negado</h2><p className="text-xs text-slate-500 font-bold uppercase">{error || 'Esta proposta não está mais disponível.'}</p></div></div>);

    if (isSuccess || isRejected) return (
        <div className={`min-h-screen ${isSuccess ? 'bg-emerald-500' : 'bg-rose-500'} flex items-center justify-center p-4 sm:p-6 animate-fade-in`}>
            <div className="bg-white p-8 sm:p-12 rounded-[2rem] sm:rounded-[4rem] shadow-2xl text-center max-w-md border-[6px] sm:border-8 border-white/20">
                <div className={`w-16 h-16 sm:w-24 sm:h-24 ${isSuccess ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'} rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-6 sm:mb-8 shadow-xl`}>
                    {isSuccess ? <CheckCircle className="w-8 h-8 sm:w-12 sm:h-12" /> : <AlertCircle className="w-8 h-8 sm:w-12 sm:h-12" />}
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-slate-900 uppercase italic tracking-tighter mb-4">
                    {isSuccess ? 'Proposta Aprovada!' : 'Proposta Recusada'}
                </h2>
                <p className="text-xs sm:text-sm font-bold text-slate-500 uppercase leading-relaxed mb-8">
                    {isSuccess
                        ? `Obrigado, ${approverName.split(' ')[0]}! Recebemos sua assinatura digital. Nossa equipe técnica entrará em contato em breve.`
                        : `Obrigado pelo seu feedback. Registramos a recusa da proposta e notificamos nossa equipe comercial.`
                    }
                </p>
                <div className="p-4 sm:p-6 bg-slate-50 rounded-[1.5rem] sm:rounded-[2rem] border border-slate-100 mb-8">
                    <p className="text-[9px] font-black text-slate-400 uppercase mb-1">Código do Orçamento</p>
                    <p className="text-lg sm:text-xl font-black text-indigo-600 italic tracking-tighter">{quote.id}</p>
                </div>
                <div className="flex items-center justify-center gap-2 opacity-50">
                    <NexusBranding size="sm" />
                </div>
                <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mt-2">Protocolo Nexus Digital v2.0</p>
            </div>
        </div>
    );

    const companyName = tenant?.company_name || tenant?.name || tenant?.companyName || 'Nexus Pro';
    const companyLogo = tenant?.logo_url || tenant?.logoUrl;
    const companyAddress = tenant?.street ?
        `${tenant.street}${tenant.number ? ', ' + tenant.number : ''}${tenant.neighborhood ? ', ' + tenant.neighborhood : ''}${tenant.city ? ' - ' + tenant.city : ''}${tenant.state ? '/' + tenant.state : ''}` :
        (tenant?.address || '');
    const companyPhone = tenant?.phone || '';
    const companyEmail = tenant?.admin_email || tenant?.email || '';
    const companyDoc = tenant?.cnpj || tenant?.document || '';

    return (
        <div className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4 flex flex-col items-center selection:bg-indigo-100 font-sans">
            {/* Header Proposta */}
            <div className="w-full max-w-4xl mb-6 sm:mb-8 flex justify-between items-center px-2 sm:px-4">
                <div className="flex items-center gap-3">
                    {companyLogo ? (
                        <img src={companyLogo} alt="Logo" className="h-10 sm:h-14 w-auto object-contain" />
                    ) : (
                        <div className="p-2 sm:p-3 bg-slate-900 rounded-xl shadow-lg">
                            <Hexagon size={24} className="text-white fill-white/10" />
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
                                {companyDoc && (
                                    <span className="flex items-center gap-1.5 text-[8px] font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
                                        CNPJ: {companyDoc}
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
                <div className="flex items-center gap-2">
                    <button onClick={() => window.print()} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-400 rounded-xl text-[10px] font-black uppercase hover:text-indigo-600 transition-all shadow-sm">
                        <Printer size={16} /> <span className="hidden xs:inline">Imprimir PDF</span>
                    </button>
                </div>
            </div>

            <div className="w-full max-w-4xl bg-white rounded-[2rem] sm:rounded-[3.5rem] shadow-2xl shadow-slate-200/50 overflow-hidden border border-white">
                {/* Banner de Identificação Estilizado (Similar a OS) */}
                <div className="relative group">
                    <div className={`px-6 sm:px-10 py-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 ${quote.status === 'APROVADO' || quote.status === 'CONVERTIDO' ? 'bg-emerald-600' : 'bg-slate-900'}`}>
                        <div className="relative z-10 flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-white backdrop-blur-md border border-white/10">
                                <Calculator className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <p className="text-[10px] text-white/50 font-black uppercase tracking-widest leading-none mb-2">Proposta Comercial nº</p>
                                <h2 className="text-2xl sm:text-3xl font-black text-white uppercase italic tracking-tighter leading-none">{quote.id}</h2>
                            </div>
                        </div>

                        <div className="relative z-10 flex flex-col items-start sm:items-end">
                            <div className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest flex items-center gap-2 ${quote.status === 'APROVADO' ? 'bg-white text-emerald-600' : 'bg-white/10 text-white'}`}>
                                <div className={`w-2 h-2 rounded-full animate-pulse ${quote.status === 'APROVADO' ? 'bg-emerald-600' : 'bg-indigo-400'}`} />
                                Status: {quote.status}
                            </div>
                            <div className="mt-3 text-[9px] font-bold text-white/40 uppercase tracking-tight text-right hidden sm:block">
                                {companyEmail}
                            </div>
                        </div>
                    </div>
                </div>

                <div className="p-6 sm:p-10 space-y-8 sm:space-y-10">
                    {/* Infos Cliente */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Destinatário</h3>
                            <div>
                                <p className="text-lg font-black text-slate-900 uppercase italic leading-tight">{quote.customerName}</p>
                                <div className="flex items-center gap-2 mt-2 text-slate-500">
                                    <MapPin size={12} />
                                    <p className="text-[10px] font-bold uppercase">{quote.customerAddress}</p>
                                </div>
                            </div>
                        </div>
                        <div className="space-y-4">
                            <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100 pb-2">Detalhes Comerciais</h3>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase">Validade da Proposta</p>
                                    <p className="text-xs font-black text-indigo-600 italic">{quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'Não informada'}</p>
                                </div>
                                <div>
                                    <p className="text-[8px] font-black text-slate-400 uppercase">Data de Elaboração</p>
                                    <p className="text-xs font-black text-slate-700 italic">{new Date(quote.createdAt).toLocaleDateString()} às {new Date(quote.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Escopo */}
                    <div className="p-6 sm:p-8 bg-slate-50 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-100">
                        <div className="flex items-center gap-3 mb-4">
                            <FileText size={18} className="text-indigo-600" />
                            <h3 className="text-xs font-black text-slate-900 uppercase italic">Escopo Técnico / Objeto</h3>
                        </div>
                        <p className="text-[11px] font-bold text-slate-600 uppercase leading-relaxed">{quote.title}</p>
                        {quote.description && <p className="text-[10px] text-slate-400 mt-2 leading-relaxed italic">{quote.description}</p>}
                    </div>

                    {/* Tabela de Itens */}
                    <div className="space-y-4">
                        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
                            <DollarSign size={18} className="text-emerald-600" />
                            <h3 className="text-xs font-black text-slate-900 uppercase italic">Composição de Preços</h3>
                        </div>
                        <div className="space-y-3">
                            {quote.items.map((item: any, i: number) => (
                                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 sm:p-5 bg-white border border-slate-100 rounded-2xl sm:rounded-3xl group hover:border-indigo-100 transition-all gap-4 sm:gap-0">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 bg-slate-50 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 italic font-mono shrink-0">{String(i + 1).padStart(2, '0')}</div>
                                        <div>
                                            <p className="text-[11px] font-black text-slate-800 uppercase italic leading-none">{item.description}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Qtde: {item.quantity} un • R$ {item.unitPrice.toLocaleString('pt-BR')}</p>
                                        </div>
                                    </div>
                                    <p className="text-sm font-black text-slate-900 italic tracking-tighter text-right">R$ {item.total.toLocaleString('pt-BR')}</p>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Totalizador Minimalista e Discreto - Ajustado para valor à esquerda */}
                    <div className="bg-indigo-50/50 p-4 sm:p-5 rounded-2xl sm:rounded-3xl border border-indigo-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex flex-col items-center sm:items-start order-1 sm:order-1">
                            <p className="text-[7px] font-black text-indigo-400 uppercase tracking-widest mb-1">Investimento Total</p>
                            <h4 className="text-lg sm:text-xl font-black text-indigo-900 italic tracking-tighter leading-none font-mono">
                                R$ {quote.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </h4>
                        </div>
                        <div className="px-3 py-1.5 bg-white rounded-lg border border-indigo-100 flex items-center gap-2 shadow-sm order-2 sm:order-2">
                            <ShieldCheck className="text-emerald-500" size={12} />
                            <p className="text-[7px] font-bold text-indigo-900/40 uppercase italic tracking-tighter">Garantia Técnica Nexus</p>
                        </div>
                    </div>

                    {/* BOTÃO DE AÇÃO */}
                    {(quote.status === 'ABERTO' || quote.status === 'PENDENTE') && !isApproveMode && !isRejectMode && (
                        <div className="flex flex-col sm:flex-row gap-4">
                            <button
                                onClick={() => setIsApproveMode(true)}
                                className="flex-1 py-5 sm:py-6 bg-emerald-600 text-white rounded-[1.5rem] sm:rounded-[2rem] text-sm font-black uppercase italic shadow-2xl shadow-emerald-600/20 hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3 order-1 sm:order-2"
                            >
                                Aprovar Orçamento <ArrowRight size={20} />
                            </button>
                            <button
                                onClick={() => setIsRejectMode(true)}
                                className="flex-1 sm:flex-none sm:px-8 py-5 sm:py-6 bg-white border-2 border-slate-100 text-slate-400 rounded-[1.5rem] sm:rounded-[2rem] text-[10px] font-black uppercase hover:bg-rose-50 hover:text-rose-500 hover:border-rose-100 transition-all order-2 sm:order-1"
                            >
                                Recusar Proposta
                            </button>
                        </div>
                    )}

                    {/* AREA DE ASSINATURA */}
                    {isApproveMode && (
                        <div className="p-6 sm:p-10 border-4 border-dashed border-emerald-100 rounded-[2rem] sm:rounded-[3.5rem] bg-emerald-50/20 space-y-6 sm:space-y-8 animate-fade-in-up">
                            <div className="flex items-center gap-4 border-b border-emerald-100 pb-6">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-emerald-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><Lock size={20} /></div>
                                <div>
                                    <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase italic leading-none mb-1">Aprovação Segura</h3>
                                    <p className="text-[8px] sm:text-[9px] text-slate-400 font-black uppercase tracking-widest leading-none">Validação por assinatura digital Nexus.</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Nome Completo do Responsável</label>
                                    <input
                                        type="text"
                                        value={approverName}
                                        onChange={e => setApproverName(e.target.value)}
                                        placeholder="Nome impresso para auditoria"
                                        className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold uppercase outline-none focus:ring-4 focus:ring-emerald-100 transition-all"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Documento (CPF)</label>
                                        <input
                                            type="text"
                                            value={document}
                                            onChange={e => {
                                                const v = e.target.value.replace(/\D/g, "").substring(0, 11);
                                                let fmt = v;
                                                if (v.length > 9) fmt = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                                                else if (v.length > 6) fmt = v.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
                                                else if (v.length > 3) fmt = v.replace(/(\d{3})(\d{0,3})/, "$1.$2");
                                                setDocument(fmt);
                                            }}
                                            placeholder="000.000.000-00"
                                            className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold uppercase outline-none focus:ring-4 focus:ring-emerald-100 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Data de Nascimento</label>
                                        <input
                                            type="date"
                                            value={birthDate}
                                            onChange={e => setBirthDate(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold uppercase outline-none focus:ring-4 focus:ring-emerald-100 transition-all"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest flex items-center gap-2"><SignatureIcon size={12} /> Assine no espaço abaixo</label>
                                <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] overflow-hidden shadow-inner">
                                    {SignaturePad ? (
                                        <SignaturePad
                                            ref={sigCanvas}
                                            penColor="#0f172a"
                                            minWidth={1.5}
                                            maxWidth={3.5}
                                            velocityFilterWeight={0.7}
                                            throttle={8}
                                            canvasProps={{
                                                className: "w-full h-48 cursor-crosshair",
                                                style: { touchAction: 'none' }
                                            }}
                                        />
                                    ) : (
                                        <div className="h-48 flex items-center justify-center p-6 text-center">
                                            <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest">Falha ao carregar motor de assinatura. Por favor, recarregue a página.</p>
                                        </div>
                                    )}
                                </div>
                                <button onClick={() => sigCanvas.current?.clear()} className="text-[8px] font-black text-rose-400 uppercase hover:underline transition-all hover:text-rose-600">Limpar Assinatura</button>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button disabled={isSubmitting} onClick={() => setIsApproveMode(false)} className="flex-1 py-5 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest">Cancelar</button>
                                <button
                                    disabled={isSubmitting}
                                    onClick={handleApprove}
                                    className="flex-1 py-5 bg-emerald-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase italic shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all"
                                >
                                    {isSubmitting ? <span className="animate-spin"><LoaderCircle size={16} /></span> : <><Send size={16} /> Confirmar Aprovação</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* AREA DE RECUSA TEMÁTICA */}
                    {isRejectMode && (
                        <div className="p-6 sm:p-10 border-4 border-dashed border-rose-100 rounded-[2rem] sm:rounded-[3.5rem] bg-rose-50/20 space-y-6 sm:space-y-8 animate-fade-in-up">
                            <div className="flex items-center gap-4 border-b border-rose-100 pb-6">
                                <div className="w-10 h-10 sm:w-12 sm:h-12 bg-rose-600 text-white rounded-2xl flex items-center justify-center shadow-lg"><XCircle size={20} /></div>
                                <div>
                                    <h3 className="text-base sm:text-lg font-black text-slate-900 uppercase italic leading-none mb-1">Formalizar Recusa</h3>
                                    <p className="text-[8px] sm:text-[9px] text-slate-400 font-black uppercase tracking-widest leading-none">Para fins de auditoria, solicitamos a formalização do declínio.</p>
                                </div>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Motivo da Recusa (Obrigatório)</label>
                                    <textarea
                                        value={rejectionReason}
                                        onChange={e => setRejectionReason(e.target.value)}
                                        placeholder="Por que esta proposta está sendo recusada?"
                                        className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold uppercase outline-none focus:ring-4 focus:ring-rose-100 transition-all min-h-[100px]"
                                    />
                                </div>

                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Nome do Responsável pela Recusa</label>
                                    <input
                                        type="text"
                                        value={approverName}
                                        onChange={e => setApproverName(e.target.value)}
                                        placeholder="Nome completo para registro"
                                        className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold uppercase outline-none focus:ring-4 focus:ring-rose-100 transition-all"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Documento (CPF)</label>
                                        <input
                                            type="text"
                                            value={document}
                                            onChange={e => {
                                                const v = e.target.value.replace(/\D/g, "").substring(0, 11);
                                                let fmt = v;
                                                if (v.length > 9) fmt = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
                                                else if (v.length > 6) fmt = v.replace(/(\d{3})(\d{3})(\d{0,3})/, "$1.$2.$3");
                                                else if (v.length > 3) fmt = v.replace(/(\d{3})(\d{0,3})/, "$1.$2");
                                                setDocument(fmt);
                                            }}
                                            placeholder="000.000.000-00"
                                            className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold uppercase outline-none focus:ring-4 focus:ring-rose-100 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Data de Nascimento</label>
                                        <input
                                            type="date"
                                            value={birthDate}
                                            onChange={e => setBirthDate(e.target.value)}
                                            className="w-full bg-white border border-slate-200 rounded-2xl px-6 py-4 text-sm font-bold uppercase outline-none focus:ring-4 focus:ring-rose-100 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest flex items-center gap-2"><SignatureIcon size={12} /> Assine para validar o declínio</label>
                                    <div className="bg-white border-2 border-slate-100 rounded-[2.5rem] overflow-hidden shadow-inner">
                                        {SignaturePad ? (
                                            <SignaturePad
                                                ref={sigCanvas}
                                                penColor="#991b1b"
                                                minWidth={1.5}
                                                maxWidth={3.5}
                                                velocityFilterWeight={0.7}
                                                throttle={8}
                                                canvasProps={{
                                                    className: "w-full h-48 cursor-crosshair",
                                                    style: { touchAction: 'none' }
                                                }}
                                            />
                                        ) : (
                                            <div className="h-48 flex items-center justify-center p-6 text-center text-rose-500">
                                                Falha no motor de assinatura. Recarregue.
                                            </div>
                                        )}
                                    </div>
                                    <button onClick={() => sigCanvas.current?.clear()} className="text-[8px] font-black text-rose-400 uppercase hover:underline transition-all hover:text-rose-600">Limpar Assinatura</button>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row gap-4 pt-4">
                                <button disabled={isSubmitting} onClick={() => setIsRejectMode(false)} className="py-4 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest order-2 sm:order-1">Voltar</button>
                                <button
                                    disabled={isSubmitting}
                                    onClick={handleConfirmReject}
                                    className="flex-1 py-5 bg-rose-600 text-white rounded-[1.5rem] text-[10px] font-black uppercase italic shadow-xl shadow-rose-600/20 flex items-center justify-center gap-2 hover:bg-rose-700 transition-all order-1 sm:order-2"
                                >
                                    {isSubmitting ? <span className="animate-spin"><LoaderCircle size={16} /></span> : <><Send size={16} /> Confirmar Recusa</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Exibição do Motivo da Recusa (Se já rejeitado) */}
                    {quote.status === 'REJEITADO' && (
                        <div className="p-8 border-2 border-rose-50 rounded-[2.5rem] bg-rose-50/20 space-y-4">
                            <div className="flex items-center gap-3">
                                <XCircle size={18} className="text-rose-600" />
                                <h3 className="text-[10px] font-black text-rose-600 uppercase tracking-widest">Esta proposta foi formalmente recusada</h3>
                            </div>
                            <div className="p-6 bg-white rounded-2xl border border-rose-100">
                                <p className="text-[9px] font-black text-slate-400 uppercase mb-2">Motivo Registrado</p>
                                <p className="text-xs font-black text-slate-700 italic uppercase">
                                    {quote.notes?.replace('MOTIVO DA RECUSA: ', '') || 'Nenhum motivo específico informado.'}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Visualização de Assinatura (Se já aprovado) */}
                    {(quote.status === 'APROVADO' || quote.status === 'CONVERTIDO') && (
                        <div className="p-6 sm:p-8 border-2 border-indigo-50 rounded-[2.5rem] bg-indigo-50/20 space-y-4">
                            <h3 className="text-[10px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-2"><CheckCircle size={14} /> Documento assinado digitalmente</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 sm:gap-8 items-center">
                                <div className="space-y-4">
                                    <div><p className="text-[8px] font-black text-slate-400 uppercase">Assinado por</p><p className="text-xs font-black text-slate-700 italic">{quote.approvedByName || 'Aprovador Online'}</p></div>
                                    <div><p className="text-[8px] font-black text-slate-400 uppercase">Documento / Data</p><p className="text-xs font-black text-slate-700 italic">{quote.approvalDocument} • {quote.approvedAt ? new Date(quote.approvedAt).toLocaleString() : 'Data não disponível'}</p></div>
                                    {/* Debug Info - Remove depois */}
                                    <div className="p-2 bg-yellow-50 rounded text-[8px] font-mono">
                                        <p><strong>Debug:</strong></p>
                                        <p>Signature exists: {quote.approvalSignature ? 'YES' : 'NO'}</p>
                                        {quote.approvalSignature && (
                                            <>
                                                <p>Type: {quote.approvalSignature.startsWith('data:') ? 'BASE64' : 'URL'}</p>
                                                <p className="truncate">Value: {quote.approvalSignature.substring(0, 80)}...</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-white p-4 sm:p-6 rounded-2xl border-2 border-indigo-200 shadow-md flex flex-col items-center justify-center min-h-[120px] gap-2">
                                    {quote.approvalSignature ? (
                                        <>
                                            <img
                                                src={quote.approvalSignature}
                                                alt="Assinatura"
                                                className="max-h-24 sm:max-h-28 w-auto object-contain mix-blend-multiply"
                                                onLoad={() => console.log('✅ Assinatura carregada com sucesso!')}
                                                onError={(e) => {
                                                    console.error('❌ Erro ao carregar assinatura:', quote.approvalSignature);
                                                    console.error('Erro completo:', e);
                                                }}
                                            />
                                            <p className="text-[7px] text-slate-400 font-mono truncate max-w-full">{quote.approvalSignature.substring(0, 50)}...</p>
                                        </>
                                    ) : (
                                        <p className="text-[9px] font-black text-slate-400 uppercase italic">Assinatura não disponível</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer Auditoria */}
                <div className="bg-slate-50 px-10 py-6 text-center border-t border-slate-100">
                    <div className="flex items-center justify-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity mb-2">
                        <NexusBranding size="sm" />
                    </div>
                    <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Nexus Pro Commercial Intelligence • Documento codificado e protegido digitalmente</p>
                </div>
            </div>
        </div>
    );
};

// Componente auxiliar local para Loader que não existia no Lucide import base
const LoaderCircle = ({ size }: { size: number }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="animate-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
);
