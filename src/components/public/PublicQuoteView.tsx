
import React, { useState, useEffect, useRef } from 'react';
import {
    Hexagon, Calculator, CheckCircle, Clock, MapPin,
    User, FileText, AlertCircle, Share2, Printer,
    ArrowRight, Lock, Signature as SignatureIcon, Send,
    Calendar, ShieldCheck, DollarSign, XCircle, Mail, Phone,
    X, Loader2, Globe
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
    tenantProp?: any;
}

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

export const PublicQuoteView: React.FC<PublicQuoteViewProps> = ({ id, tenantProp }) => {
    const [quote, setQuote] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isApproveMode, setIsApproveMode] = useState(false);
    const [isRejectMode, setIsRejectMode] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [isRejected, setIsRejected] = useState(false);
    const [tenant, setTenant] = useState<any>(tenantProp || null);

    // Form States
    const [approverName, setApproverName] = useState('');
    const [document, setDocument] = useState('');
    const [birthDate, setBirthDate] = useState('');
    const [rejectionReason, setRejectionReason] = useState('');
    const [coords, setCoords] = useState<{ lat: number, lng: number } | null>(null);
    const [fullscreenImage, setFullscreenImage] = useState<string | null>(null);
    const sigCanvas = useRef<any>(null);
    const companyName = tenant?.company_name || tenant?.name || tenant?.companyName || 'Nexus Pro';
    const companyLogo = tenant?.logo_url || tenant?.logoUrl;
    const companyAddress = React.useMemo(() => {
        if (!tenant) return '';
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

    const [freshCustomerAddress, setFreshCustomerAddress] = useState<string | null>(null);
    const [freshCustomerPhone, setFreshCustomerPhone] = useState<string | null>(null);
    const [freshCustomerEmail, setFreshCustomerEmail] = useState<string | null>(null);

    useEffect(() => {
        const fetchCustomerAddress = async () => {
            if (!quote?.customerName) return;
            try {
                const tenantId = (quote as any).tenant_id || quote?.tenantId;
                if (!tenantId) return;
                const { data } = await import('../../lib/supabase').then(m => m.supabase
                    .from('customers')
                    .select('address, number, complement, neighborhood, city, state, phone, whatsapp, email')
                    .eq('tenant_id', tenantId)
                    .ilike('name', quote.customerName.trim())
                    .limit(1)
                    .single()
                );
                if (data) {
                    const clean = (v: any) => v && String(v).toLowerCase() !== 'null' && String(v).trim() !== '';
                    const street = [data.address, data.number].filter(clean).join(', ');
                    const neighborhood = clean(data.neighborhood) ? data.neighborhood : '';
                    const city = clean(data.city) ? data.city : '';
                    const state = clean(data.state) ? data.state : '';
                    const cityState = [city, state].filter(Boolean).join('/');
                    const addr = [street, neighborhood, cityState].filter(Boolean).join(' - ');
                    if (addr.trim()) setFreshCustomerAddress(addr);
                    
                    if (clean(data.whatsapp)) setFreshCustomerPhone(data.whatsapp);
                    else if (clean(data.phone)) setFreshCustomerPhone(data.phone);
                    
                    if (clean(data.email)) setFreshCustomerEmail(data.email);
                }
            } catch {
            }
        };
        fetchCustomerAddress();
    }, [quote?.customerName, quote?.id]);

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

                    // 2. Fetch Assíncrono do Tenant (Background) - Somente se não veio via prop
                    if (tenantProp) {
                        setTenant(tenantProp);
                    } else {
                        const tenantId = data.tenant_id || data.tenantId;
                        if (tenantId) {
                            try {
                                const tenantData = await DataService.getTenantById(tenantId);
                                if (isMounted) setTenant(tenantData);
                            } catch (tenantErr) {
                                console.warn("Erro ao buscar dados da empresa em background", tenantErr);
                            }
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

    const enterSignatureMode = async (mode: 'approve' | 'reject') => {
        if (window.innerWidth <= 768) {
            try {
                if (document.documentElement.requestFullscreen) {
                    await document.documentElement.requestFullscreen();
                }
                if (screen.orientation && screen.orientation.lock) {
                    await screen.orientation.lock('landscape');
                }
            } catch (e) {
                console.warn('Nexus: Falha ao forçar landscape mode', e);
            }
        }
        if (mode === 'approve') setIsApproveMode(true);
        if (mode === 'reject') setIsRejectMode(true);
    };

    const exitSignatureMode = async (mode: 'approve' | 'reject') => {
        try {
            if (document.fullscreenElement && document.exitFullscreen) {
                await document.exitFullscreen();
            }
            if (screen.orientation && screen.orientation.unlock) {
                screen.orientation.unlock();
            }
        } catch (e) {
            console.warn('Nexus: Falha ao sair do landscape mode', e);
        }
        if (mode === 'approve') setIsApproveMode(false);
        if (mode === 'reject') setIsRejectMode(false);
    };

    const handleApprove = async () => {
        if (!approverName || sigCanvas.current?.isEmpty()) {
            alert('Por favor, preencha seu nome e assine o documento.');
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
                document: '',
                birthDate: '',
                signature: signatureBase64 || '',
                metadata: metadata,
                lat: finalLat,
                lng: finalLng
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
            exitSignatureMode('approve');
        } catch (err: any) {
            console.error('❌ [Nexus] Erro na aprovação:', err);
            alert(`Falha na aprovação: ${err.message}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleConfirmReject = async () => {
        if (!approverName || !rejectionReason.trim() || sigCanvas.current?.isEmpty()) {
            alert('Por favor, preencha seu nome, o motivo da recusa e assine para formalizar.');
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
                document: '',
                birthDate: '',
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
            exitSignatureMode('reject');
        } catch (err) {
            console.error('❌ [Nexus] Erro na recusa:', err);
            alert('Falha ao processar recusa.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const fontStyle = (
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
    );

    if (loading) return (
        <div className="public-view-wrapper font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {fontStyle}
            <div className="min-h-screen bg-white flex items-center justify-center">
                <img src="/duno-icon.png" alt="Duno" className="h-20 w-auto object-contain animate-pulse" />
            </div>
        </div>
    );

    if (error || !quote) return (
        <div className="public-view-wrapper font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {fontStyle}
            <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
                <div className="bg-white p-10 rounded-[3rem] shadow-xl text-center max-w-sm">
                    <AlertCircle size={48} className="text-rose-500 mx-auto mb-4" />
                    <h2 className="text-xl font-bold text-slate-900 uppercase italic mb-2">Acesso Negado</h2>
                    <p className="text-sm text-slate-500 font-bold uppercase">{error || 'Esta proposta não está mais disponível.'}</p>
                </div>
            </div>
        </div>
    );

    if (isSuccess || isRejected) return (
        <div className="public-view-wrapper font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {fontStyle}
            <div className={`min-h-screen ${isSuccess ? 'bg-emerald-600' : 'bg-rose-600'} flex items-center justify-center p-4 py-8 animate-fade-in`}>
                <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-2xl text-center w-full max-w-md border-4 border-white/30 my-auto">
                    <div className={`w-16 h-16 ${isSuccess ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'} rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg`}>
                        {isSuccess ? <CheckCircle className="w-9 h-9" /> : <AlertCircle className="w-9 h-9" />}
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 uppercase italic tracking-tight mb-2">
                        {isSuccess ? 'Proposta Aprovada!' : 'Proposta Recusada'}
                    </h2>
                    <p className="text-xs sm:text-sm font-semibold text-slate-500 uppercase leading-relaxed mb-6 px-2">
                        {isSuccess
                            ? `Obrigado, ${approverName.split(' ')[0]}! Recebemos sua assinatura digital. Nossa equipe técnica entrará em contato em breve.`
                            : `Obrigado pelo seu feedback. Registramos a recusa da proposta e notificamos nossa equipe comercial.`
                        }
                    </p>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 mb-6 grid grid-cols-2 gap-3 text-left shadow-inner">
                        <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Código do Orçamento</p>
                            <p className="text-xs sm:text-sm font-bold text-[#1c2d4f] italic tracking-tight break-all">{quote.displayId || quote.id.split('-')[0].toUpperCase()}</p>
                        </div>
                        <div className="border-l border-slate-200 pl-3 flex flex-col justify-center">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">{isSuccess ? 'Data da Aprovação' : 'Data da Recusa'}</p>
                            <p className="text-xs sm:text-sm font-bold text-slate-800 tracking-tight">
                                {quote?.updatedAt ? new Date(quote.updatedAt).toLocaleString('pt-BR') : new Date().toLocaleString('pt-BR')}
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center justify-center gap-2 opacity-60">
                        <NexusBranding size="sm" />
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Protocolo Digital Duno</p>
                </div>
            </div>
        </div>
    );



    // ── PRINT LAYOUT COMPONENT ──
    // ── PRINT LAYOUT COMPONENT ──
    const PrintLayout = () => (
        <>
        <style type="text/css" media="print">
            {`@page { size: A4 portrait; margin: 10mm 4mm 10mm 4mm; }`}
        </style>
        <div className="bg-white text-xs leading-relaxed font-poppins p-4 sm:p-6 min-h-[297mm] w-full max-w-full mx-auto border sm:border-0" style={{ WebkitPrintColorAdjust: 'exact', printColorAdjust: 'exact', boxSizing: 'border-box' }}>
            {/* Header: Company & Quote Info */}
            <div className="flex justify-between items-start pb-4 border-b-2 border-slate-800 mb-4">
                <div className="flex gap-4 items-center">
                    {companyLogo
                        ? <img src={companyLogo} alt="Logo" className="h-16 w-auto object-contain" />
                        : <div className="bg-slate-900 p-2 rounded-lg flex items-center justify-center min-w-[60px] min-h-[60px] text-white"><Hexagon size={32} className="text-white fill-white/10" /></div>
                    }
                    <div className="space-y-1">
                        <h1 className="text-xl font-bold text-slate-900 uppercase tracking-tight">{companyName}</h1>
                        <div className="text-xs text-slate-600 max-w-[400px]">
                            {companyAddress && <div>{companyAddress}</div>}
                            <div className="flex gap-3 mt-0.5">
                                {companyPhone && <span className="font-semibold">Tel: {companyPhone}</span>}
                                {companyEmail && <span>Email: {companyEmail}</span>}
                            </div>
                            {companyDoc && <div className="mt-0.5">CNPJ: {companyDoc}</div>}
                        </div>
                    </div>
                </div>
                <div className="text-right shrink-0 min-w-fit">
                    <div className="border-2 border-slate-800 px-4 py-2 rounded-lg bg-slate-50">
                        <div className="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-1">Orçamento N°</div>
                        <div className="text-sm font-bold text-slate-900 tracking-tighter leading-none whitespace-nowrap">
                            #{quote.displayId || quote.id.slice(0, 8).toUpperCase()}
                        </div>
                    </div>
                    <div className="text-xs font-bold text-slate-400 mt-2 uppercase tracking-wide">
                        Emissão: {new Date(quote.createdAt).toLocaleDateString()}
                    </div>
                    <div className="text-xs font-bold text-slate-400 uppercase mt-0.5">
                        Validade: {quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : 'A combinar'}
                    </div>
                </div>
            </div>

            {/* Customer Information */}
            <div className="border border-slate-300 rounded-xl overflow-hidden mb-3 break-inside-avoid shadow-sm">
                <div className="bg-slate-100 px-4 py-2 border-b border-slate-300">
                    <h3 className="font-bold text-xs uppercase tracking-widest text-slate-700">Dados do Cliente / Solicitante</h3>
                </div>
                <div className="p-4 grid grid-cols-2 gap-4 bg-white">
                    <div>
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Identificação do Cliente</span>
                        <span className="font-bold text-slate-900 text-sm uppercase">{quote.customerName}</span>
                    </div>
                    <div>
                        <span className="block text-xs font-bold text-slate-400 uppercase tracking-widest">Local de Execução / Faturamento</span>
                        <span className="font-medium text-slate-700 text-sm uppercase">{freshCustomerAddress || quote.customerAddress || 'Não Informado'}</span>
                    </div>
                    {(freshCustomerPhone || freshCustomerEmail) && (
                        <div className="col-span-2 pt-2 border-t border-slate-100 flex flex-col gap-0.5">
                            <span className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest">Contato</span>
                            <span className="font-medium text-slate-700 text-xs uppercase">
                                {freshCustomerPhone && <span>{freshCustomerPhone}</span>}
                                {freshCustomerPhone && freshCustomerEmail && <span className="mx-2">•</span>}
                                {freshCustomerEmail && <span className="lowercase">{freshCustomerEmail}</span>}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Object/Description */}
            {quote.description && (
                <div className="border border-slate-300 rounded-xl overflow-hidden mb-3 break-inside-avoid">
                    <div className="bg-slate-100 px-4 py-2 border-b border-slate-300">
                        <h3 className="font-bold text-xs uppercase tracking-widest text-slate-700">Objeto e Escopo Técnico</h3>
                    </div>
                    <div className="p-4 bg-white text-sm text-slate-800 font-medium whitespace-pre-wrap leading-relaxed italic">
                        {quote.description}
                    </div>
                </div>
            )}

            {/* Items Section */}
            {quote.items && quote.items.length > 0 && (() => {
                const subtotal = quote.items.reduce((a: number, i: any) => a + (i.total || 0), 0);
                const disc = Number(quote.discount) || 0;
                const type = quote.discountType || 'fixed';
                let dv = type === 'percent' ? (subtotal * disc / 100) : disc;
                if (dv <= 0 && subtotal > (quote.totalValue || subtotal)) {
                    dv = subtotal - (quote.totalValue || subtotal);
                }
                const totalFinal = quote.totalValue || subtotal;

                return (
                    <div className="mb-4 break-inside-avoid">
                        {/* ── MOBILE CARDS (hidden on print/md+) ── */}
                        <div className="md:hidden print:hidden space-y-2">
                            <div className="bg-[#1c2d4f] px-3 py-2 rounded-t-xl">
                                <span className="text-[9px] font-bold text-white/80 uppercase tracking-widest">Itens e Serviços</span>
                            </div>
                            {quote.items.map((it: any, i: number) => (
                                <div key={i} className="border border-slate-200 rounded-lg bg-white p-3">
                                    <div className="flex justify-between items-start mb-1">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase">Item {String(i + 1).padStart(2, '0')}</span>
                                            {(it.stockCode || it.stock_code) && (
                                                <span className="text-[8px] font-bold text-[#3e5b99] bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 font-mono tracking-wider uppercase">
                                                    {it.stockCode || it.stock_code}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-xs font-black text-[#1c2d4f]">
                                            R$ {(it.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </div>
                                    <p className="text-xs font-bold text-slate-800 uppercase leading-tight mb-2">{it.description || it.title}</p>
                                    <div className="flex gap-4 text-[10px] text-slate-500">
                                        <span><span className="font-bold text-slate-400 uppercase">Qtd:</span> {it.quantity}</span>
                                        <span><span className="font-bold text-slate-400 uppercase">Unit:</span> R$ {(it.unitPrice || it.unit_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* ── DESKTOP TABLE & FOOTER (hidden on mobile, shown on print/md+) ── */}
                        <div className="hidden md:block print:block" style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: '12px', overflow: 'hidden' }}>
                            <table style={{ width: '100%', tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                                <colgroup>
                                    <col style={{ width: '5%' }} />
                                    <col style={{ width: '13%' }} />
                                    <col style={{ width: '30%' }} />
                                    <col style={{ width: '7%' }} />
                                    <col style={{ width: '19%' }} />
                                    <col style={{ width: '26%' }} />
                                </colgroup>
                                <thead>
                                    <tr style={{ backgroundColor: '#1c2d4f', color: 'white', fontSize: '8px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                        <th style={{ padding: '8px 5px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)', borderRadius: '11px 0 0 0' }}>#</th>
                                        <th style={{ padding: '8px 5px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Código</th>
                                        <th style={{ padding: '8px 5px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Descrição</th>
                                        <th style={{ padding: '8px 5px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)' }}>Qtd</th>
                                        <th style={{ padding: '8px 5px', textAlign: 'left', borderRight: '1px solid rgba(255,255,255,0.2)' }}>V. Unit.</th>
                                        <th style={{ padding: '8px 5px', textAlign: 'left', borderRadius: '0 11px 0 0' }}>Total</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {quote.items.map((it: any, i: number) => (
                                        <tr key={i} style={{ borderBottom: '1px solid #e2e8f0', backgroundColor: i % 2 === 0 ? '#fff' : '#f8fafc' }}>
                                            <td style={{ padding: '8px 5px', textAlign: 'left', fontWeight: 700, color: '#94a3b8', fontSize: '9px', borderRight: '1px solid #e2e8f0' }}>{String(i + 1).padStart(2, '0')}</td>
                                            <td style={{ padding: '8px 5px', textAlign: 'left', fontSize: '9px', fontWeight: 700, color: '#3e5b99', fontFamily: 'monospace', letterSpacing: '0.05em', borderRight: '1px solid #e2e8f0', wordBreak: 'break-all' }}>
                                                {it.stockCode || it.stock_code || <span style={{ color: '#cbd5e1', fontStyle: 'italic', fontWeight: 400 }}>—</span>}
                                            </td>
                                            <td style={{ padding: '8px 5px', fontSize: '9px', fontWeight: 700, color: '#1e293b', textTransform: 'uppercase', borderRight: '1px solid #e2e8f0', wordBreak: 'break-word', overflowWrap: 'break-word' }}>{it.description || it.title}</td>
                                            <td style={{ padding: '8px 5px', textAlign: 'left', fontWeight: 700, fontSize: '9px', color: '#475569', borderRight: '1px solid #e2e8f0' }}>{it.quantity}</td>
                                            <td style={{ padding: '8px 5px', textAlign: 'left', fontSize: '9px', color: '#475569', borderRight: '1px solid #e2e8f0', wordBreak: 'break-all' }}>
                                                R$ {(it.unitPrice || it.unit_price || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                            <td style={{ padding: '8px 5px', textAlign: 'left', fontWeight: 700, fontSize: '9px', color: '#1c2d4f', wordBreak: 'break-all' }}>
                                                R$ {(it.total || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* ── TOTAL FOOTER (always visible inside desktop/print) ── */}
                            <div className="flex flex-col md:flex-row print:flex-row bg-[#1c2d4f] text-white">
                            <div className="flex-1 p-3 md:p-4 print:p-4 border-b md:border-b-0 print:border-b-0 md:border-r print:border-r border-white/20 flex flex-col justify-center">
                                <span className="text-[9px] sm:text-xs font-bold text-white/70 uppercase mb-1">Notas sobre Condições Financeiras:</span>
                                <span className="text-[9px] sm:text-xs font-medium text-white/90 uppercase tracking-tighter italic">Valores expressos em Reais (BRL). O aceite eletrônico via portal possui validade jurídica.</span>
                            </div>
                            <div className="w-full md:w-auto print:w-auto min-w-[200px] md:min-w-[250px] print:min-w-[250px] p-3 md:p-4 print:p-4 flex flex-col justify-center items-end bg-[#132039]">
                                {dv > 0 && (
                                    <>
                                        <span className="text-[9px] sm:text-xs uppercase font-bold tracking-widest text-[#a8b8d8]/70 mb-0.5">Subtotal</span>
                                        <span className="text-xs sm:text-sm font-bold tracking-tighter text-white/60 line-through">
                                            R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                        <span className="text-[9px] sm:text-xs uppercase font-bold tracking-widest text-rose-300 mt-1">
                                            Desconto {type === 'percent' ? `(${disc}%)` : ''}
                                        </span>
                                        <span className="text-xs sm:text-sm font-bold text-rose-300">- R$ {dv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                                        <div className="w-full border-t border-white/20 mt-2 pt-2 text-right">
                                            <span className="text-[8px] uppercase font-bold tracking-widest text-[#a8b8d8] mb-1 block">Investimento Total</span>
                                            <span className="text-sm font-bold tracking-tighter">
                                                R$ {totalFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                            </span>
                                        </div>
                                    </>
                                )}
                                {dv <= 0 && (
                                    <>
                                        <span className="text-[8px] uppercase font-bold tracking-widest text-[#a8b8d8] mb-1">Investimento Total</span>
                                        <span className="text-sm font-black tracking-tighter">
                                            R$ {totalFinal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                        </span>
                                    </>
                                )}
                                </div>
                        </div>
                    </div>
                    </div>
                );
            })()}

            {/* Approval / Signature Area */}
            {(quote.status === 'APROVADO' || quote.status === 'CONVERTIDO') ? (
                <div className="border-2 border-emerald-500 rounded-xl overflow-hidden break-inside-avoid mb-3 bg-emerald-50/20">
                    <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-200 flex items-center gap-2">
                        <CheckCircle size={16} className="text-emerald-600" />
                        <span className="font-bold text-xs uppercase tracking-widest text-emerald-800">Protocolo de Aceite Digital Validado</span>
                    </div>
                    <div className="p-6 grid grid-cols-2 gap-6 bg-white">
                        <div className="flex flex-col gap-2">
                            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Responsável pela Aprovação</span>
                            <span className="text-sm font-bold text-slate-900 uppercase">{quote.approvedByName}</span>
                            <span className="text-xs font-bold text-slate-500 uppercase">Data e hora da assinatura: {new Date(quote.approvedAt).toLocaleString('pt-BR')}</span>
                        </div>
                        <div className="border border-slate-200 rounded-lg h-24 flex flex-col items-center justify-center relative bg-slate-50/50">
                            {quote.approvalSignature ? (
                                <>
                                    <img src={quote.approvalSignature} className="max-h-16 max-w-full object-contain mix-blend-multiply" alt="Assinatura" />
                                    <p className="text-xs font-bold text-slate-900 uppercase mt-1">Assinado por {quote.approvedByName || 'Cliente'}</p>
                                </>
                            ) : (
                                <span className="text-slate-300 italic text-xs font-bold uppercase">Token de Assinatura Certificada</span>
                            )}
                        </div>
                    </div>
                </div>
            ) : quote.status === 'REJEITADO' ? (
                <div className="border-2 border-rose-500 rounded-xl overflow-hidden break-inside-avoid mb-6 bg-rose-50/20">
                    <div className="bg-rose-50 px-4 py-2 border-b border-rose-200 flex items-center gap-2">
                        <XCircle size={16} className="text-rose-600" />
                        <span className="font-bold text-xs uppercase tracking-widest text-rose-800">Recusa do Orçamento Formalizada</span>
                    </div>
                    <div className="p-6 bg-white flex flex-col gap-4">
                        <div className="text-rose-900 font-bold italic text-sm uppercase tracking-tight">
                            Motivo Registrado: {quote.rejectionReason || 'Recusa efetuada via link público pelo cliente.'}
                        </div>
                        <div className="grid grid-cols-2 gap-6 border-t border-rose-100 pt-4">
                            <div className="flex flex-col gap-2">
                                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Recusado por</span>
                                <span className="text-sm font-bold text-slate-900 uppercase">{quote.approvedByName || 'Cliente'}</span>
                                <span className="text-xs font-bold text-slate-500 uppercase">Data e hora: {quote.approvedAt ? new Date(quote.approvedAt).toLocaleString('pt-BR') : 'N/D'}</span>
                            </div>
                            <div className="border border-rose-100 rounded-lg h-24 flex flex-col items-center justify-center relative bg-rose-50/30">
                                {quote.approvalSignature ? (
                                    <>
                                        <img src={quote.approvalSignature} className="max-h-16 max-w-full object-contain mix-blend-multiply" alt="Assinatura" />
                                    </>
                                ) : (
                                    <span className="text-slate-300 italic text-xs font-bold uppercase">Registro de Recusa Auditado</span>
                                )}
                                <div className="absolute bottom-1 right-2 text-xs text-rose-400 uppercase tracking-widest"></div>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="mt-12 pt-12 border-t-2 border-dashed border-slate-300 grid grid-cols-2 gap-12 break-inside-avoid">
                    <div className="flex flex-col items-center">
                        <div className="w-full border-b border-slate-800 mb-2"></div>
                        <span className="text-xs font-bold text-slate-800 uppercase text-center truncate w-full">{companyName}</span>
                        <span className="text-xs font-bold text-slate-500 uppercase mt-0.5">Autorizante / Comercial</span>
                    </div>
                    <div className="flex flex-col items-center">
                        <div className="w-full border-b border-slate-800 mb-2"></div>
                        <span className="text-xs font-bold text-slate-800 uppercase text-center truncate w-full">{quote.customerName}</span>
                        <span className="text-xs font-bold text-slate-500 uppercase mt-0.5">De Acordo / Carimbo e Assinatura</span>
                    </div>
                </div>
            )}

            {/* Print Footer */}
            <div className="mt-12 pt-4 border-t-2 border-[#1c2d4f] flex justify-between items-start opacity-70">
                <div className="flex flex-col gap-1">
                    <NexusBranding size="lg" className="scale-75 origin-left -translate-y-2" />
                    <p className="text-xs font-bold text-slate-500 uppercase leading-none">Uma solução Duno.</p>
                </div>
                <div className="text-right">
                    <p className="text-xs font-bold uppercase tracking-widest text-[#1c2d4f] mb-0.5">Documento digital Duno</p>
                    <p className="text-xs uppercase tracking-tight font-medium text-slate-500 max-w-xs ml-auto leading-tight italic">
                        A assinatura ou o aceite eletrônico constituem prova de concordância comercial.
                    </p>
                </div>
            </div>
        </div>
        </>
    );

    return (
        <div className="public-view-wrapper font-poppins" style={{ fontFamily: "'Poppins', sans-serif" }}>
            {fontStyle}
            
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
                            <div className="min-w-0 flex-1">
                                <h1 className="text-sm font-bold text-slate-900 uppercase tracking-tight sm:truncate leading-none mb-1.5">{companyName}</h1>
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
                                const originalTitle = window.document.title;
                                window.document.title = `Proposta-${quote.displayId || quote.id.slice(0, 8).toUpperCase()}`;
                                window.print();
                                window.document.title = originalTitle;
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 bg-[#1c2d4f] text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-[#2a457a] transition-all shadow-md active:scale-95 shrink-0"
                        >
                            <Printer size={14} />
                            <span className="hidden sm:inline">Imprimir PDF</span>
                        </button>
                    </div>
                </header>

                {/* ── QUOTE HERO BANNER ── */}
                <div className={`${quote.status === 'APROVADO' || quote.status === 'CONVERTIDO' ? 'bg-emerald-700' : 'bg-[#1c2d4f]'} transition-colors print:hidden`}>
                    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-5 sm:py-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                        {/* Quote identity */}
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center border border-white/10 shrink-0">
                                <Calculator size={22} className="text-white" />
                            </div>
                            <div>
                                <p className="text-xs font-bold text-white/40 uppercase tracking-[0.3em] leading-none mb-1">Proposta Comercial</p>
                                <h2 className="text-xl sm:text-2xl font-bold text-white uppercase tracking-tighter leading-none">
                                    #{quote.displayId || `ORC-${quote.id.slice(0, 8).toUpperCase()}`}
                                </h2>
                                {quote.title && <p className="text-xs font-semibold text-white/50 uppercase tracking-wide mt-1">{quote.title}</p>}
                            </div>
                        </div>

                        {/* Status + priority */}
                        <div className="flex items-center gap-2.5 flex-wrap">
                            <div className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-widest border flex items-center gap-1.5 ${{
                                'PENDENTE': 'bg-slate-500/20 text-slate-300 border-slate-500/30',
                                'ABERTO': 'bg-sky-500/20 text-sky-300 border-sky-500/30',
                                'APROVADO': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                                'CONVERTIDO': 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
                                'REJEITADO': 'bg-rose-500/20 text-rose-300 border-rose-500/30',
                                'VENCIDO': 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                            }[quote.status] || 'bg-white/10 text-white/70 border-white/10'
                                }`}>
                                <span className={`w-1 h-1 rounded-full animate-pulse-subtle ${{
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
                        </div>
                    </div>
                </div>

                {/* ── MAIN CONTENT ── */}
                <main className="max-w-6xl mx-auto px-4 sm:px-8 py-8 sm:py-12 flex flex-col gap-10 print:hidden">

                    {/* ── ROW 1: Cliente + Comercial ── */}
                    <div className="flex flex-col gap-4 lg:gap-6">
                        <div className="bg-slate-200/50 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/30 p-4 sm:p-5">
                            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                                <div className="flex items-center gap-4">
                                    <div className="w-10 h-10 bg-[#1c2d4f]/10 rounded-xl flex items-center justify-center shrink-0">
                                        <User size={18} className="text-[#1c2d4f]" />
                                    </div>
                                    <div>
                                        <p className="text-xl font-bold text-slate-900 uppercase tracking-tight leading-none">{quote.customerName}</p>
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1.5">Identificação do Cliente</p>
                                    </div>
                                </div>

                                <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
                                    {(freshCustomerPhone || freshCustomerEmail) && (
                                        <div className="flex flex-col gap-1.5">
                                            {freshCustomerPhone && (
                                                <div className="flex items-center gap-2.5">
                                                    <Phone size={14} className="text-[#1c2d4f] shrink-0" />
                                                    <p className="text-xs font-bold text-slate-700 uppercase tracking-wide">{freshCustomerPhone}</p>
                                                </div>
                                            )}
                                            {freshCustomerEmail && (
                                                <div className="flex items-center gap-2.5">
                                                    <Mail size={14} className="text-[#1c2d4f] shrink-0" />
                                                    <p className="text-xs font-medium text-slate-600 truncate max-w-[200px]">{freshCustomerEmail}</p>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {(freshCustomerAddress || quote.customerAddress) && (
                                        <div className="flex items-start gap-2.5 max-w-[300px]">
                                            <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0" />
                                            <p className="text-xs text-slate-500 leading-snug font-medium uppercase">{freshCustomerAddress || quote.customerAddress}</p>
                                        </div>
                                    )}

                                    <div className="flex gap-6 border-l border-slate-300/50 pl-6">
                                        <div className="flex flex-col">
                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.1em] mb-0.5 text-right">Validade</span>
                                            <span className="text-xs font-bold text-slate-800">{quote.validUntil ? new Date(quote.validUntil).toLocaleDateString() : '—'}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-white rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/30 p-3.5 sm:p-4 flex flex-col justify-center">
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
                                    <div className="col-span-2 pt-3 border-t border-slate-200">
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Objeto / Escopo Técnico</p>
                                        <p className="text-sm text-slate-600 font-medium italic">{quote.description}</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* ── ROW 2: Tabela de Itens ── */}
                    <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/40 overflow-hidden">
                        <div className="p-8 sm:p-10 pb-6">
                            <SectionHeader icon={<DollarSign size={15} />} title="Composição de Preços e Serviços" color="text-emerald-600" />
                        </div>

                        <div className="px-8 sm:px-10 pb-10 space-y-4">
                            {quote.items.map((item: any, i: number) => (
                                <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50/50 border border-slate-100 rounded-xl group hover:border-slate-300 transition-all gap-4 sm:gap-0">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center text-xs font-bold text-slate-400 italic  shrink-0">
                                            {String(i + 1).padStart(2, '0')}
                                        </div>
                                        <div>
                                            <p className="text-xs font-bold text-slate-800 uppercase leading-none">{item.description}</p>
                                            <p className="text-xs font-bold text-slate-400 uppercase mt-1">Qtde: {item.quantity} un • Valor Unit: R$ {item.unitPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                        </div>
                                    </div>
                                    <div className="text-right pl-12 sm:pl-0 border-t sm:border-0 border-slate-100 pt-3 sm:pt-0">
                                        <p className="text-xs font-bold text-slate-400 uppercase sm:hidden mb-0.5">Subtotal</p>
                                        <p className="text-sm font-bold text-slate-900 tracking-tighter">R$ {item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="bg-emerald-50/50 p-8 sm:p-10 border-t border-emerald-100/50 flex flex-col sm:flex-row items-center justify-between gap-6">
                            <div className="flex items-center gap-4 order-2 sm:order-1">
                                <ShieldCheck className="text-emerald-500" size={16} />
                                <p className="text-xs font-bold text-emerald-800/60 uppercase tracking-widest max-w-[200px] leading-tight flex-1">
                                    Condições comerciai regidas pela emissora do documento
                                </p>
                            </div>
                            <div className="flex flex-col items-center sm:items-end order-1 sm:order-2 gap-1 w-full sm:w-auto">
                                {(() => {
                                    const subtotal = quote.items.reduce((a: number, i: any) => a + (i.total || 0), 0);
                                    const disc = Number(quote.discount) || 0;
                                    const type = quote.discountType || 'fixed';
                                    let dv = type === 'percent' ? (subtotal * disc / 100) : disc;
                                    if (dv <= 0 && subtotal > (quote.totalValue || subtotal)) {
                                        dv = subtotal - (quote.totalValue || subtotal);
                                    }

                                    return (
                                        <>
                                            <div className="flex justify-between items-center py-1 w-full sm:w-64">
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Subtotal</p>
                                                <p className="text-sm font-bold text-slate-600">R$ {subtotal.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                            </div>
                                            {dv > 0 && (
                                                <div className="flex justify-between items-center py-1 w-full sm:w-64">
                                                    <p className="text-xs font-bold text-rose-500 uppercase tracking-widest">Desconto Aplicado {type === 'percent' ? `(${disc}%)` : ''}</p>
                                                    <p className="text-sm font-bold text-rose-500 tracking-tight">- R$ {dv.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                                </div>
                                            )}
                                            <div className="flex justify-between items-center pt-3 mt-1 border-t border-slate-200 w-full sm:w-64">
                                                <p className="text-xs font-bold text-emerald-600/70 uppercase tracking-widest">Investimento Total</p>
                                                <p className="text-xl font-bold text-emerald-700 tracking-tighter italic">R$ {(quote.totalValue || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</p>
                                            </div>
                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    </div>

                    {/* ── ACTIONS / STATUS VIEW ── */}

                    {quote.status === 'REJEITADO' && (
                        <div className="bg-white rounded-3xl border border-rose-100 shadow-2xl shadow-rose-100/30 p-8 sm:p-10 overflow-hidden relative">
                            {/* Background hint */}
                            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                                <XCircle size={120} className="text-rose-600" />
                            </div>

                            <SectionHeader icon={<ShieldCheck size={15} />} title="Registro de Recusa" color="text-rose-700" />
                            
                            <div className="mb-8 p-4 bg-rose-50 border border-rose-100 rounded-2xl relative z-10">
                                <p className="text-xs font-bold text-rose-800 tracking-widest uppercase mb-1">Motivo da Recusa</p>
                                <p className="text-sm font-bold text-rose-600/80 italic uppercase">
                                    {quote.rejectionReason || rejectionReason || 'Nenhum motivo específico informado.'}
                                </p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
                                <div className="space-y-5">
                                    <InfoPill label="Recusado por" value={quote.approvedByName || 'Cliente'} />
                                    <InfoPill label="Data e hora da recusa" value={quote.approvedAt ? new Date(quote.approvedAt).toLocaleString() : 'N/D'} mono />
                                </div>
                                <div className="border border-rose-100 bg-rose-50/30 rounded-xl p-4 flex flex-col items-center justify-center min-h-[140px]">
                                    {quote.approvalSignature ? (
                                        <>
                                            <img
                                                src={quote.approvalSignature}
                                                alt="Assinatura"
                                                className="max-h-24 w-auto object-contain mix-blend-multiply cursor-zoom-in"
                                                onClick={() => setFullscreenImage(quote.approvalSignature)}
                                            />
                                            <p className="text-xs text-rose-600/50  tracking-widest uppercase mt-1">Registro Auditado</p>
                                            <p className="text-xs font-bold text-rose-800 uppercase text-center mt-1">Assinado por {quote.approvedByName || 'Cliente'}</p>
                                        </>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-400 uppercase italic">Assinatura não disponível</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {(quote.status === 'APROVADO' || quote.status === 'CONVERTIDO') && (
                        <div className="bg-white rounded-3xl border border-emerald-100 shadow-2xl shadow-emerald-100/30 p-8 sm:p-10 overflow-hidden relative">
                            {/* Background hint */}
                            <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                                <CheckCircle size={120} className="text-emerald-600" />
                            </div>

                            <SectionHeader icon={<ShieldCheck size={15} />} title="Assinatura e Auditoria Digital" color="text-emerald-700" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 relative z-10">
                                <div className="space-y-5">
                                    <InfoPill label="Assinado por" value={quote.approvedByName || 'Alex Cruz'} />
                                    <InfoPill label="Data e hora da assinatura" value={quote.approvedAt ? new Date(quote.approvedAt).toLocaleString() : 'N/D'} mono />
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
                                            <p className="text-xs text-emerald-600/50  tracking-widest uppercase mt-1">Visto Eletrônico Válido</p>
                                            <p className="text-xs font-bold text-emerald-800 uppercase text-center mt-1">Assinado por {quote.approvedByName || 'Alex Cruz'}</p>
                                        </>
                                    ) : (
                                        <p className="text-xs font-bold text-slate-400 uppercase italic">Assinatura não disponível</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* AREA DE RECUSA TEMÁTICA - Form */}
                    {isRejectMode && (
                        <div className="bg-white border-2 border-rose-100 rounded-3xl shadow-2xl shadow-rose-100/30 p-8 sm:p-10 animate-fade-in-up print:hidden">
                            <SectionHeader icon={<XCircle size={15} />} title="Formalizar Recusa da Proposta" color="text-rose-600" />

                            <div className="space-y-6">
                                <div>
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-widest">Motivo da Recusa (Obrigatório)</label>
                                    <textarea
                                        value={rejectionReason}
                                        onChange={e => setRejectionReason(e.target.value)}
                                        placeholder="Por que esta proposta está sendo recusada?"
                                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-rose-200 transition-all min-h-[80px]"
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-widest">Nome do Responsável</label>
                                        <input
                                            type="text"
                                            value={approverName}
                                            onChange={e => setApproverName(e.target.value)}
                                            placeholder="Nome completo"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-rose-200 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-widest flex items-center gap-2"><SignatureIcon size={12} /> Assine para validar o declínio</label>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-inner">
                                        {SignaturePad ? (
                                            <SignaturePad
                                                ref={sigCanvas}
                                                penColor="#e11d48"
                                                minWidth={0.5}
                                                maxWidth={1.5}
                                                canvasProps={{ className: "w-full h-32 sm:h-40 cursor-crosshair", style: { touchAction: 'none' } }}
                                            />
                                        ) : (
                                            <div className="h-32 flex flex-col items-center justify-center p-4">
                                                <p className="text-xs font-bold text-rose-500 uppercase tracking-widest text-center">Desculpe, a assinatura falhou. Recarregue a página.</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-end">
                                        <button onClick={() => sigCanvas.current?.clear()} className="text-xs font-bold text-slate-400 uppercase hover:text-slate-600 transition-colors">Limpar Apontamento</button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-6 mt-6 border-t border-slate-200">
                                <button disabled={isSubmitting} onClick={() => exitSignatureMode('reject')} className="flex-1 py-4 text-xs font-bold uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100">Cancelar</button>
                                <button
                                    disabled={isSubmitting}
                                    onClick={handleConfirmReject}
                                    className="flex-[2] py-4 bg-rose-600 text-white rounded-xl text-xs sm:text-sm font-bold uppercase shadow-lg shadow-rose-600/20 flex items-center justify-center gap-2 hover:bg-rose-700 transition-all hover:-translate-y-0.5"
                                >
                                    {isSubmitting ? <span className="animate-spin"><Loader2 size={16} /></span> : <><Send size={16} /> Enviar Recusa Oficial</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* AREA DE APROVAÇÃO - Form */}
                    {isApproveMode && (
                        <div className="bg-white border-2 border-emerald-100 rounded-3xl shadow-2xl shadow-emerald-100/30 p-8 sm:p-10 animate-fade-in-up print:hidden">
                            <SectionHeader icon={<ShieldCheck size={15} />} title="Aprovação Segura de Proposta Comercial" color="text-emerald-600" />

                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-1 gap-4">
                                    <div>
                                        <label className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-widest">Nome do Responsável</label>
                                        <input
                                            type="text"
                                            value={approverName}
                                            onChange={e => setApproverName(e.target.value)}
                                            placeholder="Nome completo"
                                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold uppercase outline-none focus:ring-2 focus:ring-emerald-200 transition-all"
                                        />
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <label className="text-xs font-bold text-slate-400 uppercase mb-2 block tracking-widest flex items-center gap-2"><SignatureIcon size={12} /> Assine para validar aprovação</label>
                                    <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-inner">
                                        {SignaturePad ? (
                                            <SignaturePad
                                                ref={sigCanvas}
                                                penColor="#0f172a"
                                                minWidth={0.5}
                                                maxWidth={1.5}
                                                canvasProps={{ className: "w-full h-32 sm:h-40 cursor-crosshair", style: { touchAction: 'none' } }}
                                            />
                                        ) : (
                                            <div className="h-32 flex flex-col items-center justify-center p-4">
                                                <p className="text-xs font-bold text-emerald-600 uppercase tracking-widest text-center">Desculpe, a assinatura falhou. Recarregue a página.</p>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex justify-end">
                                        <button onClick={() => sigCanvas.current?.clear()} className="text-xs font-bold text-slate-400 uppercase hover:text-slate-600 transition-colors">Limpar Apontamento</button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-4 pt-6 mt-6 border-t border-slate-200">
                                <button disabled={isSubmitting} onClick={() => exitSignatureMode('approve')} className="flex-1 py-4 text-xs font-bold uppercase text-slate-400 hover:text-slate-600 transition-all tracking-widest bg-slate-50 rounded-xl border border-slate-200 hover:bg-slate-100">Cancelar</button>
                                <button
                                    disabled={isSubmitting}
                                    onClick={handleApprove}
                                    className="flex-[2] py-4 bg-emerald-600 text-white rounded-xl text-xs sm:text-sm font-bold uppercase shadow-lg shadow-emerald-600/20 flex items-center justify-center gap-2 hover:bg-emerald-700 transition-all hover:-translate-y-0.5"
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
                                onClick={() => enterSignatureMode('approve')}
                                className="flex-[2] py-5 bg-emerald-600 text-white rounded-2xl text-xs font-bold uppercase shadow-lg shadow-emerald-600/20 hover:bg-emerald-700 active:scale-95 transition-all flex items-center justify-center gap-3 order-1 sm:order-2"
                            >
                                Aprovar Proposta Comercial <ArrowRight size={16} />
                            </button>
                            <button
                                onClick={() => enterSignatureMode('reject')}
                                className="flex-1 py-5 bg-white border border-slate-200 text-slate-500 rounded-2xl text-xs font-bold uppercase hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-all order-2 sm:order-1"
                            >
                                Avaliar Recusa
                            </button>
                        </div>
                    )}

                </main>

                {/* ── FOOTER NEXUS ── */}
                <footer className="mt-8 sm:mt-12 lg:mt-auto border-t border-slate-200 bg-white w-full print:hidden">
                    <div className="max-w-6xl mx-auto px-4 sm:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <NexusBranding size="lg" className="opacity-80 transform scale-[0.55] sm:scale-[0.7] origin-left" />
                        </div>
                        <div className="text-center sm:text-right space-y-0.5">
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em]">Uma solução DUNO</p>
                            <p className="text-xs text-slate-300 uppercase tracking-widest">
                                Ambientes Seguros · Documento emitido eletronicamente
                            </p>
                        </div>
                    </div>
                </footer>

                {fullscreenImage && (
                    <div
                        className="fixed inset-0 z-[9999] bg-white/95 backdrop-blur-xl flex items-center justify-center p-4 sm:p-10 animate-fade-in cursor-zoom-out"
                        onClick={() => setFullscreenImage(null)}
                    >
                        <img
                            src={fullscreenImage}
                            className="max-w-full max-h-full object-contain rounded-3xl shadow-2xl"
                            alt="Visualização"
                        />
                        <button
                            className="absolute top-6 right-6 p-3 bg-slate-100 hover:bg-slate-200 rounded-full text-slate-800 transition-colors shadow-sm"
                            onClick={() => setFullscreenImage(null)}
                        >
                            <X size={22} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default PublicQuoteView;
