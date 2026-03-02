
import React, { useState, useEffect, useRef } from 'react';
import {
    Hexagon, Calculator, CheckCircle, Clock, MapPin,
    User, FileText, AlertCircle, Share2, Printer,
    ArrowRight, Lock, Signature as SignatureIcon, Send,
    Calendar, ShieldCheck, DollarSign, XCircle, Mail, Phone,
    X, Loader2
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
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
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
        let isMounted = true;
        const fetchQuote = async () => {
            try {
                // 1. Fetch Rápido do Orçamento
                const data = await DataService.getPublicQuoteById(id);
                if (!isMounted) return;

                if (data) {
                    console.log('✍️ URL da assinatura:', data.approvalSignature?.substring(0, 100));
                    setQuote(data);
                    setLoading(false); // Libera IMEDIATAMENTE a UI principal

                    // 2. Fetch Assíncrono do Tenant (Background)
                    const tenantId = data.tenant_id || data.tenantId;
                    if (tenantId) {
                        try {
                            const tenantData = await DataService.getTenantById(tenantId);
                            if (isMounted) setTenant(tenantData);
                        } catch (tenantErr) {
                            console.warn("Erro ao buscar dados da empresa em background", tenantErr);
                        }
                    }
                } else {
                    setError('Orçamento não localizado ou expirado.');
                    setLoading(false);
                }
            } catch (err) {
                console.error(err);
                console.error('Nexus: Erro ao buscar orçamento público:', err);
                if (isMounted) {
                    setError('Orçamento não localizado ou expirado.');
                    setLoading(false);
                }
            }
        };
        fetchQuote();
        return () => { isMounted = false; };
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

            console.log('✅ [Nexus] Orçamento aprovado com sucesso!');

            // Recarrega os dados do orçamento para mostrar o novo status
            try {
                const updatedQuote = await DataService.getPublicQuoteById(id);
                console.log('🔄 [Nexus] Orçamento recarregado:', updatedQuote);
                setQuote(updatedQuote);
            } catch (reloadError) {
                console.warn('⚠️ [Nexus] Erro ao recarregar, mas aprovação foi bem-sucedida:', reloadError);
            }

            setIsSuccess(true);
            setIsApproveMode(false);
        } catch (err: any) {
            console.error('❌ [Nexus] Erro na aprovação:', err);
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

            console.log('✅ [Nexus] Orçamento recusado com sucesso!');

            // Recarrega os dados
            try {
                const updatedQuote = await DataService.getPublicQuoteById(id);
                setQuote(updatedQuote);
            } catch (reloadError) {
                console.warn('⚠️ [Nexus] Erro ao recarregar após recusa:', reloadError);
            }

            setIsRejected(true);
            setIsRejectMode(false);
        } catch (err) {
            console.error('❌ [Nexus] Erro na recusa:', err);
            alert('Falha ao processar recusa.');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (loading) return (<div className="min-h-screen bg-slate-50 flex items-center justify-center"><div className="flex flex-col items-center gap-4"><Hexagon size={48} className="animate-spin text-primary-600" /><p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Carregando Proposta Nexus...</p></div></div>);

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
                    <p className="text-lg sm:text-xl font-black text-primary-600 italic tracking-tighter">{quote.displayId || quote.id}</p>
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

    // ── PRINT LAYOUT COMPONENT ──
    // ── PRINT LAYOUT COMPONENT ──
    const PrintLayout = () => (
        <div className="bg-white text-[12px] leading-relaxed font-sans p-8 print:break-inside-avoid min-h-[297mm] w-[210mm] mx-auto border sm:border-0" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact' }}>
            {/* Header: Company & Quote Info */}
            <div className="flex justify-between items-start pb-6 border-b-4 border-[#1c2d4f] mb-6">
                <div className="flex gap-6 items-center">
                    {companyLogo
                        ? <img src={companyLogo} alt="Logo" className="max-h-24 w-auto object-contain" />
                        : <div className="bg-[#1c2d4f] p-4 rounded-xl flex items-center justify-center min-w-[80px] min-h-[80px]"><Hexagon size={40} className="text-white fill-white/10" /></div>
                    }
                    <div className="space-y-1">
                        <h1 className="text-2xl font-black text-[#1c2d4f] uppercase tracking-tighter">{companyName}</h1>
                        <div className="text-[10px] text-slate-600 max-w-[300px] font-medium uppercase leading-snug">
                            {companyAddress && <div>{companyAddress}</div>}
                            <div className="mt-1">
                                {companyPhone && <span>TEL: {companyPhone}</span>}
                                {companyPhone && companyEmail && <span className="mx-2">•</span>}
                                {companyEmail && <span>{companyEmail}</span>}
                            </div>
                            {companyDoc && <div className="mt-1">CNPJ: {companyDoc}</div>}
                        </div>
                    </div>
                </div>
                <div className="text-right flex flex-col items-end">
                    <div className="bg-slate-50 border-2 border-slate-200 px-6 py-3 rounded-xl min-w-[200px] text-center">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Orçamento N°</div>
                        <div className="text-3xl font-black text-[#1c2d4f] tracking-tighter leading-none">
                            {quote.displayId || quote.id.slice(0, 8).toUpperCase()}
                        </div>
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 mt-3 uppercase">
                        Emitido em: {new Date(quote.createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-[10px] font-bold text-slate-500 uppercase mt-1">
                        Validade: {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'A combinar'}
                    </div>
                </div>
            </div>

            {/* Customer Information */}
            <div className="border border-slate-300 rounded-xl overflow-hidden mb-6 break-inside-avoid shadow-sm">
                <div className="bg-slate-100 px-4 py-2 border-b border-slate-300">
                    <h3 className="font-black text-[11px] uppercase tracking-widest text-slate-700">Dados do Cliente / Solicitante</h3>
                </div>
                <div className="p-4 grid grid-cols-2 gap-4 bg-white">
                    <div>
                        <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Identificação do Cliente</span>
                        <span className="font-bold text-slate-900 text-sm uppercase">{quote.customerName}</span>
                    </div>
                    <div>
                        <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">Local de Execução / Faturamento</span>
                        <span className="font-medium text-slate-700 text-xs uppercase">{quote.customerAddress || 'Não Informado'}</span>
                    </div>
                </div>
            </div>

            {/* Object/Description */}
            {quote.description && (
                <div className="border border-slate-300 rounded-xl overflow-hidden mb-6 break-inside-avoid">
                    <div className="bg-slate-100 px-4 py-2 border-b border-slate-300">
                        <h3 className="font-black text-[11px] uppercase tracking-widest text-slate-700">Objeto e Escopo Técnico</h3>
                    </div>
                    <div className="p-4 bg-white text-xs text-slate-800 font-medium whitespace-pre-wrap leading-relaxed italic">
                        {quote.description}
                    </div>
                </div>
            )}

            {/* Items Table */}
            {quote.items && quote.items.length > 0 && (
                <div className="border border-slate-300 rounded-xl overflow-hidden mb-8 break-inside-avoid shadow-sm">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-[#1c2d4f] text-[10px] font-black text-white uppercase tracking-wider">
                                <th className="px-4 py-3 w-12 text-center border-r border-white/20">Item</th>
                                <th className="px-4 py-3 border-r border-white/20">Descrição dos Serviços / Peças</th>
                                <th className="px-4 py-3 text-center w-20 border-r border-white/20">Qtd</th>
                                <th className="px-4 py-3 text-right w-32 border-r border-white/20">V. Unitárió</th>
                                <th className="px-4 py-3 text-right w-32">Total Item</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200 bg-white">
                            {quote.items.map((it: any, i: number) => (
                                <tr key={i}>
                                    <td className="px-4 py-3 text-center font-bold text-slate-400 text-[10px] border-r border-slate-200 bg-slate-50/30">{String(i + 1).padStart(2, '0')}</td>
                                    <td className="px-4 py-3 text-xs uppercase font-bold text-slate-800 border-r border-slate-200 leading-snug">{it.description || it.title}</td>
                                    <td className="px-4 py-3 text-xs text-center font-bold text-slate-600 border-r border-slate-200">{it.quantity}</td>
                                    <td className="px-4 py-3 text-xs text-right text-slate-600 font-mono border-r border-slate-200">
                                        R$ {(it.unitPrice || it.unit_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-right font-black text-[#1c2d4f] font-mono bg-slate-50/50">
                                        R$ {(it.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    <div className="flex bg-[#1c2d4f] text-white">
                        <div className="flex-1 p-4 border-r border-white/20 flex flex-col justify-center">
                            <span className="text-[10px] font-bold text-white/70 uppercase mb-1">Notas sobre Condições Financeiras:</span>
                            <span className="text-[9px] font-medium text-white/90 uppercase tracking-tighter italic">Valores expressos em Reais (BRL). O aceite eletrônico via portal possui validade jurídica para processamento de faturamento e ordens de serviço.</span>
                        </div>
                        <div className="w-64 p-4 flex flex-col justify-center items-end bg-[#132039]">
                            <span className="text-[10px] uppercase font-black tracking-widest text-[#a8b8d8] mb-1">Investimento Total</span>
                            <span className="text-2xl font-black tracking-tighter">
                                R$ {(quote.totalValue || quote.total_value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>
            )}

            {/* Approval / Signature Area */}
            {quote.status === 'APROVADO' ? (
                <div className="border-2 border-emerald-500 rounded-xl overflow-hidden break-inside-avoid mb-6 bg-emerald-50/20">
                    <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-200 flex items-center gap-2">
                        <CheckCircle size={16} className="text-emerald-600" />
                        <span className="font-black text-[11px] uppercase tracking-widest text-emerald-800">Protocolo de Aceite Digital Validado</span>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-6 bg-white">
                        <div className="flex flex-col gap-2">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Responsável pela Aprovação</span>
                            <span className="text-sm font-black text-slate-900 uppercase">{quote.approvedByName}</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Documento: {quote.approvalDocument}</span>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">Timestamp: {new Date(quote.approvedAt).toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="border border-slate-200 rounded-lg h-24 flex items-center justify-center relative bg-slate-50/50">
                            {quote.approvalSignature ? (
                                <img src={quote.approvalSignature} className="max-h-full max-w-full object-contain mix-blend-multiply" alt="Assinatura" />
                            ) : (
                                <span className="text-slate-300 italic text-[10px] font-bold uppercase">Token de Assinatura Certificada</span>
                            )}
                            <div className="absolute bottom-1 right-2 text-[6px] text-slate-400 uppercase tracking-widest">Nexus Pro Secure Approval</div>
                        </div>
                    </div>
                </div>
            ) : quote.status === 'REJEITADO' ? (
                <div className="border-2 border-rose-500 rounded-xl overflow-hidden break-inside-avoid mb-6 bg-rose-50/20">
                    <div className="bg-rose-50 px-4 py-2 border-b border-rose-200 flex items-center gap-2">
                        <XCircle size={16} className="text-rose-600" />
                        <span className="font-black text-[11px] uppercase tracking-widest text-rose-800">Recusa do Orçamento Formalizada</span>
                    </div>
                    <div className="p-6 bg-white text-rose-900 font-bold italic text-sm uppercase tracking-tight">
                        Motivo Registrado: {quote.rejectionReason || 'Recusa efetuada via link público pelo cliente.'}
                    </div>
                </div>
            ) : (
                <div className="mt-12 pt-12 border-t-2 border-dashed border-slate-300 grid grid-cols-2 gap-12 break-inside-avoid">
                    <div className="flex flex-col items-center">
                        <div className="w-full border-b border-slate-800 mb-2"></div>
                        <span className="text-[11px] font-black text-slate-800 uppercase text-center truncate w-full">{companyName}</span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">Autorizante / Comercial</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="w-full border-b border-slate-800 mb-2"></div>
                        <span className="text-[11px] font-black text-slate-800 uppercase text-center truncate w-full">{quote.customerName}</span>
                        <span className="text-[9px] font-bold text-slate-500 uppercase mt-0.5">De Acordo / Carimbo e Assinatura</span>
                    </div>
                </div>
            )}

            {/* Print Footer */}
            <div className="mt-12 pt-4 border-t-2 border-[#1c2d4f] flex justify-between items-start opacity-70">
                <div className="flex flex-col gap-1">
                    <NexusBranding size="lg" className="scale-75 origin-left -translate-y-2" />
                    <p className="text-[7px] font-black text-slate-500 uppercase leading-none">Intelligence for Service Flow Systems</p>
                </div>
                <div className="text-right">
                    <p className="text-[9px] font-black uppercase tracking-widest text-[#1c2d4f] mb-0.5">Escritura Digital Nexus v5.2</p>
                    <p className="text-[7px] uppercase tracking-tight font-medium text-slate-500 max-w-xs ml-auto leading-tight italic">
                        Documento gerado eletronicamente através de provisionamento seguro em nuvem. A assinatura digital contida neste documento ou o registro de aceite no servidor central constituem prova formal de concordância comercial.
                    </p>
                </div>
            </div>
        </div>
    );

    return (
        <>
            <div className="hidden print:!block">
                <PrintLayout />
            </div>

            <div className="min-h-screen bg-[#F0F2F5] font-sans selection:bg-[#1c2d4f]/10 print:hidden">
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
                                </div>
                                <div className="mt-1 flex sm:hidden">
                                    <NexusBranding size="sm" className="opacity-40" />
                                </div>
                            </div>
                        </div>

                        {/* Print button */}
                        <button
                            onClick={() => {
                                const originalTitle = window.document.title;
                                window.document.title = `Proposta-${quote.displayId || quote.id.slice(0, 8).toUpperCase()}`;
                                window.print();
                                window.document.title = originalTitle;
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-[#1c2d4f] text-white rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[#2a457a] transition-all shadow-md active:scale-95 shrink-0"
                        >
                            <Printer size={14} />
                            <span className="hidden sm:inline">Imprimir PDF</span>
                        </button>
                    </div>
                </header>

                {/* ── QUOTE HERO BANNER ── */}
                <div className={`${quote.status === 'APROVADO' || quote.status === 'CONVERTIDO' ? 'bg-emerald-700' : 'bg-[#1c2d4f]'} transition-colors`}>
                    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                        {/* Quote identity */}
                        <div className="flex items-center gap-5">
                            <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center border border-white/10 shrink-0">
                                <Calculator size={26} className="text-white" />
                            </div>
                            <div>
                                <p className="text-[9px] font-black text-white/40 uppercase tracking-[0.3em] leading-none mb-1.5">Proposta Comercial</p>
                                <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tighter leading-none">
                                    #{quote.displayId || `ORC-${quote.id.slice(0, 8).toUpperCase()}`}
                                </h2>
                                {quote.title && <p className="text-[10px] font-bold text-white/50 uppercase tracking-wide mt-1.5">{quote.title}</p>}
                            </div>
                        </div>

                        {/* Status + priority */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <div className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest border flex items-center gap-2 ${{
                                'PENDENTE': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
                                'ABERTO': 'bg-sky-500/20 text-sky-300 border-sky-500/30',
                                'APROVADO': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                                'CONVERTIDO': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                                'REJEITADO': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
                                'VENCIDO': 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }[quote.status] || 'bg-white/10 text-white/70 border-white/10'
                                }`}>
                                <span className={`w-1.5 h-1.5 rounded-full animate-pulse-subtle ${{
                                    'PENDENTE': 'bg-slate-400',
                                    'ABERTO': 'bg-sky-400',
                                    'APROVADO': 'bg-emerald-400',
                                    'CONVERTIDO': 'bg-emerald-400',
                                    'REJEITADO': 'bg-rose-400',
                                    'VENCIDO': 'bg-amber-400'
                                }[quote.status] || 'bg-white/50'
                                    }`} />
                                {quote.status}
                            </div>
                            <div className="px-3 py-1.5 bg-white/10 rounded-full text-[9px] font-black text-white/70 uppercase tracking-widest border border-white/10 flex items-center gap-1.5">
                                <Calendar size={11} /> Emissão: {new Date(quote.createdAt).toLocaleDateString()}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ── MAIN CONTENT ── */}
                <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 space-y-6">

                    {/* ── ROW 1: Cliente + Comercial ── */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8">
                            <SectionHeader icon={<User size={15} />} title="Dados do Cliente" />
                            <div className="space-y-3">
                                <p className="text-lg font-black text-slate-900 uppercase leading-tight">{quote.customerName}</p>
                                {quote.customerAddress ? (
                                    <div className="flex items-start gap-2 pt-2 border-t border-slate-50">
                                        <MapPin size={12} className="text-slate-400 mt-0.5 shrink-0" />
                                        <p className="text-sm text-slate-500 leading-snug">{quote.customerAddress}</p>
                                    </div>
                                ) : (
                                    <p className="text-[10px] text-slate-300 uppercase tracking-widest italic pt-2 border-t border-slate-50">Endereço não informado</p>
                                )}
                            </div>
                        </div>

                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 sm:p-8 flex flex-col justify-center">
                            <SectionHeader icon={<FileText size={15} />} title="Resumo Comercial" />
                            <div className="grid grid-cols-2 gap-y-4 gap-x-6">
                                <InfoPill
                                    label="Validade da Proposta"
                                    value={quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'Não informada'}
                                />
                                <InfoPill
                                    label="Data de Elaboração"
                                    value={new Date(quote.createdAt).toLocaleDateString()}
                                />
                                {quote.description && (
                                    <div className="col-span-2 pt-3 border-t border-slate-50">
                                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Objeto / Escopo Técnico</p>
                                        <p className="text-xs text-slate-600 font-medium italic">{quote.description}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── ROW 2: Tabela de Itens ── */}
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                        <div className="p-6 sm:p-8 pb-4">
                            <SectionHeader icon={<DollarSign size={15} />} title="Composição de Preços e Serviços" color="text-emerald-600" />
                        </div>

                        <div className="px-6 sm:px-8 pb-8 space-y-3">
                            {quote.items.map((item: any, i: number) => (
                                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-xl group hover:border-slate-300 transition-all gap-4 sm:gap-0">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-[10px] font-black text-slate-400 italic font-mono shrink-0">
                                            {String(i + 1).padStart(2, '0')}
                                        </div>
                                        <div>
                                            <p className="text-[11px] font-black text-slate-800 uppercase leading-none">{item.description}</p>
                                            <p className="text-[9px] font-bold text-slate-400 uppercase mt-1">Qtde: {item.quantity} un • Valor Unit: R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                    <div className="text-right pl-12 sm:pl-0 border-t sm:border-0 border-slate-100 pt-3 sm:pt-0">
                                        <p className="text-[9px] font-black text-slate-400 uppercase sm:hidden mb-0.5">Subtotal</p>
                                        <p className="text-sm font-black text-slate-900 tracking-tighter">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-emerald-50/50 p-6 sm:p-8 border-t border-emerald-100/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div className="flex items-center gap-3 order-2 sm:order-1">
                                <ShieldCheck className="text-emerald-500" size={16} />
                                <p className="text-[8px] font-bold text-emerald-800/60 uppercase tracking-widest max-w-[200px] leading-tight flex-1">
                                    Condições Comerciais Regidas pela Nexus Commercial Intelligence
                                </p>
                            </div>
                            <div className="flex flex-col items-center sm:items-end order-1 sm:order-2">
                                <p className="text-[9px] font-black text-emerald-600/70 uppercase tracking-widest mb-1">Investimento Total</p>
                                <h4 className="text-2xl font-black text-emerald-700 tracking-tighter leading-none font-mono">
                                    R$ {quote.totalValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </h4>
                            </div>
                        </div>
                    </div>

                    {/* ── ACTIONS / STATUS VIEW ── */}

                    {quote.status === 'REJEITADO' && (
                        <div className="bg-rose-50 border border-rose-100 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col items-center justify-center text-center">
                            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center mb-4"><XCircle size={20} /></div>
                            <h3 className="text-sm font-black text-rose-800 uppercase tracking-widest mb-2">Proposta Formalmente Recusada</h3>
                            <p className="text-xs font-bold text-rose-600/70 italic uppercase max-w-lg mb-4">
                                {quote.notes?.replace('MOTIVO DA RECUSA: ', '') || 'Nenhum motivo específico informado.'}
                            </p>
                        </div>
                    )}

                    {(quote.status === 'APROVADO' || quote.status === 'CONVERTIDO') && (
                        <div className="bg-white rounded-2xl border border-emerald-100 shadow-sm p-6 sm:p-8 overflow-hidden relative">
                            {/* Background hint */}
                            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                                <CheckCircle size={120} className="text-emerald-600" />
                            </div>

                            <SectionHeader icon={<ShieldCheck size={15} />} title="Assinatura e Auditoria Digital" color="text-emerald-700" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
                                <div className="space-y-5">
                                    <InfoPill label="Assinado por" value={quote.approvedByName || 'Aprovador Online'} />
                                    <InfoPill label="Documento Verificado" value={quote.approvalDocument || 'N/D'} mono />
                                    <InfoPill label="Log de Data e Hora (Timestamp)" value={quote.approvedAt ? new Date(quote.approvedAt).toLocaleString() : 'N/D'} mono />
                                </div>
                                <div className="border border-emerald-100 bg-emerald-50/30 rounded-xl p-4 flex flex-col items-center justify-center min-h-[140px]">
                                    {quote.approvalSignature ? (
                                        <>
                                            <img
                                                src={quote.approvalSignature}
                                                alt="Assinatura"
                                                className="max-h-24 w-auto object-contain mix-blend-multiply cursor-zoom-in"
                                                onClick={() => setFullscreenImage(quote.approvalSignature)}
                                            />
                                            <p className="text-[7px] text-emerald-600/50 font-mono tracking-widest uppercase mt-2">Visto Eletrônico Válido</p>
                                        </>
                                    ) : (
                                        <p className="text-[9px] font-black text-slate-400 uppercase italic">Assinatura não disponível</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* AREA DE RECUSA TEMÁTICA - Form */}
                    {isRejectMode && (
                        <div className="bg-white border-2 border-rose-100 rounded-2xl shadow-xl shadow-rose-100/20 p-6 sm:p-8 animate-fade-in-up print:hidden">
                            <SectionHeader icon={<XCircle size={15} />} title="Formalizar Recusa da Proposta" color="text-rose-600" />

                            <div className="space-y-6">
                                <div>
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Motivo da Recusa (Obrigatório)</label>
                                    <textarea
                                        value={rejectionReason}
                                        onChange={e => setRejectionReason(e.target.value)}
                                        placeholder="Por que esta proposta está sendo recusada?"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-rose-200 transition-all min-h-[80px]"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Nome do Responsável</label>
                                        <input
                                            type="text"
                                            value={approverName}
                                            onChange={e => setApproverName(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-rose-200 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">CPF / Documento</label>
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
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-rose-200 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Data Nasc.</label>
                                        <input
                                            type="date"
                                            value={birthDate}
                                            onChange={e => setBirthDate(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-rose-200 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest flex items-center gap-2"><SignatureIcon size={12} /> Assine para validar o declínio</label>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-inner">
                                        {SignaturePad ? (
                                            <SignaturePad
                                                ref={sigCanvas}
                                                penColor="#e11d48"
                                                minWidth={1.5}
                                                maxWidth={3.5}
                                                canvasProps={{ className: "w-full h-32 sm:h-40 cursor-crosshair", style: { touchAction: 'none' } }}
                                            />
                                        ) : (
                                            <div className="h-32 flex flex-col items-center justify-center p-4">
                                                <p className="text-[10px] font-black text-rose-500 uppercase tracking-widest text-center">Desculpe, a assinatura falhou. Recarregue a página.</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-end">
                                        <button onClick={() => sigCanvas.current?.clear()} className="text-[10px] font-black text-slate-400 uppercase hover:text-slate-600 transition-colors">Limpar Apontamento</button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-6 mt-6 border-t border-slate-100">
                                <button disabled={isSubmitting} onClick={() => setIsRejectMode(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100">Cancelar</button>
                                <button
                                    disabled={isSubmitting}
                                    onClick={handleConfirmReject}
                                    className="flex-[2] py-4 bg-rose-600 text-white rounded-xl text-[10px] sm:text-xs font-black uppercase shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 hover:bg-rose-700 transition-all hover:-translate-y-0.5"
                                >
                                    {isSubmitting ? <span className="animate-spin"><Loader2 size={16} /></span> : <><Send size={16} /> Enviar Recusa Oficial</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* AREA DE APROVAÇÃO - Form */}
                    {isApproveMode && (
                        <div className="bg-white border-2 border-emerald-100 rounded-2xl shadow-xl shadow-emerald-100/20 p-6 sm:p-8 animate-fade-in-up print:hidden">
                            <SectionHeader icon={<ShieldCheck size={15} />} title="Aprovação Segura de Proposta Comercial" color="text-emerald-600" />

                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Nome do Responsável</label>
                                        <input
                                            type="text"
                                            value={approverName}
                                            onChange={e => setApproverName(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-emerald-200 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">CPF / Documento</label>
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
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-emerald-200 transition-all"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest">Data Nasc.</label>
                                        <input
                                            type="date"
                                            value={birthDate}
                                            onChange={e => setBirthDate(e.target.value)}
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-bold uppercase outline-none focus:ring-2 focus:ring-emerald-200 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-[9px] font-black text-slate-400 uppercase mb-2 block tracking-widest flex items-center gap-2"><SignatureIcon size={12} /> Assine para validar aprovação</label>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-inner">
                                        {SignaturePad ? (
                                            <SignaturePad
                                                ref={sigCanvas}
                                                penColor="#0f172a"
                                                minWidth={1.5}
                                                maxWidth={3.5}
                                                canvasProps={{ className: "w-full h-32 sm:h-40 cursor-crosshair", style: { touchAction: 'none' } }}
                                            />
                                        ) : (
                                            <div className="h-32 flex flex-col items-center justify-center p-4">
                                                <p className="text-[10px] font-black text-emerald-600 uppercase tracking-widest text-center">Desculpe, a assinatura falhou. Recarregue a página.</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-end">
                                        <button onClick={() => sigCanvas.current?.clear()} className="text-[10px] font-black text-slate-400 uppercase hover:text-slate-600 transition-colors">Limpar Apontamento</button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-6 mt-6 border-t border-slate-100">
                                <button disabled={isSubmitting} onClick={() => setIsApproveMode(false)} className="flex-1 py-4 text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100">Cancelar</button>
                                <button
                                    disabled={isSubmitting}
                                    onClick={handleApprove}
                                    className="flex-[2] py-4 bg-emerald-600 text-white rounded-xl text-[10px] sm:text-xs font-black uppercase shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all hover:-translate-y-0.5"
                                >
                                    {isSubmitting ? <span className="animate-spin"><Loader2 size={16} /></span> : <><Send size={16} /> Assinar e Aprovar Online</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* BOTÕES INICIAIS DE AÇÃO */}
                    {(quote.status === 'ABERTO' || quote.status === 'PENDENTE') && !isApproveMode && !isRejectMode && (
                        <div className="flex flex-col sm:flex-row gap-4 print:hidden">
                            <button
                                onClick={() => setIsApproveMode(true)}
                                className="flex-[2] py-5 bg-emerald-600 text-white rounded-2xl text-[11px] font-black uppercase shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-3 order-1 sm:order-2"
                            >
                                Aprovar Proposta Comercial <ArrowRight size={16} />
                            </button>
                            <button
                                onClick={() => setIsRejectMode(true)}
                                className="flex-1 py-5 bg-white border border-slate-200 text-slate-500 rounded-2xl text-[10px] font-black uppercase hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all order-2 sm:order-1"
                            >
                                Avaliar Recusa
                            </button>
                        </div>
                    )}

                </main>

                {/* ── FOOTER NEXUS ── */}
                <footer className="mt-8 sm:mt-12 lg:mt-auto border-t border-slate-200 bg-white w-full print:hidden">
                    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <NexusBranding size="lg" className="opacity-80 transform scale-[0.6] sm:scale-[0.85] origin-left -my-2 sm:-my-1" />
                        </div>
                        <div className="text-center sm:text-right space-y-0.5 sm:space-y-1 mt-[-10px] sm:mt-0">
                            <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Uma Solução Nexus Line</p>
                            <p className="text-[7px] sm:text-[8px] text-slate-300 uppercase tracking-widest">
                                Ambientes Seguros · Documento emitido eletronicamente
                            </p>
                        </div>
                    </div>
                </footer>

                {/* ── LIGHTBOX (Opcional para Assinatura) ── */}
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
                            <X size={22} />
                        </button>
                    </div>
                )}
            </div>
        </>
    );
};

export default PublicQuoteView;
