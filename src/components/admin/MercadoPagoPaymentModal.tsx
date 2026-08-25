import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { PaymentService } from '../../services/paymentService';
import { supabase } from '../../lib/supabase';
import { 
  X, CreditCard, QrCode, Copy, CheckCircle2, 
  ExternalLink, Share2, Loader2, ShieldCheck, DollarSign, RefreshCw
} from 'lucide-react';
import { useTenant } from '../../hooks/nexusHooks';

interface MercadoPagoPaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: {
    type: 'ORDER' | 'QUOTE';
    id: string;
    displayId?: string;
    title: string;
    value: number;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    customerDocument?: string;
    gatewayPixCode?: string;
    gatewayTicketUrl?: string;
    gatewayStatus?: string;
  };
  onSuccess?: () => void;
}

export const MercadoPagoPaymentModal: React.FC<MercadoPagoPaymentModalProps> = ({
  isOpen, onClose, item, onSuccess
}) => {
  const { data: tenant } = useTenant();
  const companyName = tenant?.name || 'NEXUS';
  const [loading, setLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    paymentId?: string;
    pixCopiaECola?: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    expiresAt?: string;
    methodType?: 'pix' | 'card_link' | 'boleto';
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPaidConfirmed, setIsPaidConfirmed] = useState(false);
  const [loadingMethod, setLoadingMethod] = useState<'pix' | 'card_link' | 'boleto' | null>(null);

  // Carrega cobrança existente (caso já tenha sido gerada anteriormente)
  React.useEffect(() => {
    if (item) {
      setCustomAmount(String(item.value || 0));
      setDiscountValue('0');
      setError(null);

      if (item.gatewayPixCode || item.gatewayTicketUrl) {
        const method = (item as any).gatewayPaymentMethod || ((item as any).gatewayPixCode ? 'pix' : 'card_link');
        setPaymentResult({
          paymentId: (item as any).gatewayPaymentId,
          pixCopiaECola: item.gatewayPixCode?.startsWith('000201') ? item.gatewayPixCode : undefined,
          ticketUrl: item.gatewayTicketUrl,
          methodType: method
        });
        if (item.billingStatus === 'PAID' || item.gatewayStatus === 'approved') {
          setIsPaidConfirmed(true);
        }
      } else {
        setPaymentResult(null);
        setIsPaidConfirmed(false);
      }
    }
  }, [item?.id, item?.value, item?.gatewayPixCode, item?.gatewayTicketUrl, item?.billingStatus]);

  // Polling Automático a cada 4 segundos se houver cobrança pendente
  React.useEffect(() => {
    if (!paymentResult?.paymentId || isPaidConfirmed) return;

    const interval = setInterval(async () => {
      const res = await PaymentService.checkPaymentStatus({
        itemType: item.type,
        itemId: item.id,
        gatewayPaymentId: paymentResult.paymentId!
      });

      if (res.isPaid) {
        setIsPaidConfirmed(true);
        if (onSuccess) onSuccess();
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [paymentResult?.paymentId, isPaidConfirmed, item.id, item.type]);

  const handleManualCheckStatus = async () => {
    setIsVerifying(true);
    setError(null);
    try {
      if (item.billingStatus === 'PAID' || isPaidConfirmed) {
        setIsPaidConfirmed(true);
        if (onSuccess) onSuccess();
        setIsVerifying(false);
        return;
      }

      let targetPaymentId = paymentResult?.paymentId || (item as any).gatewayPaymentId;

      if (!targetPaymentId) {
        const table = item.type === 'ORDER' ? 'orders' : 'quotes';
        const { data } = await supabase.from(table).select('gateway_payment_id, billing_status').eq('id', item.id).maybeSingle();
        targetPaymentId = data?.gateway_payment_id;
        if (data?.billing_status === 'PAID') {
          setIsPaidConfirmed(true);
          if (onSuccess) onSuccess();
          setIsVerifying(false);
          return;
        }
      }

      const res = await PaymentService.checkPaymentStatus({
        itemType: item.type,
        itemId: item.id,
        gatewayPaymentId: targetPaymentId
      });

      if (res.isPaid) {
        setIsPaidConfirmed(true);
        if (onSuccess) onSuccess();
      } else {
        setError('O pagamento ainda consta como pendente no Mercado Pago. Se você já fez o Pix, aguarde alguns instantes e tente novamente.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao verificar status com Mercado Pago.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Estados de Desconto / Ajuste de Valor antes de Faturar
  const [customAmount, setCustomAmount] = useState<string>(item?.value ? String(item.value) : '0');
  const [discountValue, setDiscountValue] = useState<string>('0');
  const [discountType, setDiscountType] = useState<'FIXED' | 'PERCENT'>('FIXED');

  // Estado do Parcelamento do Cartão (1x até 12x)
  const [installments, setInstallments] = useState<number>(1);

  // Função robusta de parse de números (suporta 150,00 e 150.00)
  const parseNumber = (val: string | number): number => {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const str = String(val).trim();
    if (str.includes(',')) {
      const normalized = str.replace(/\./g, '').replace(',', '.');
      return parseFloat(normalized) || 0;
    }
    return parseFloat(str) || 0;
  };

  const baseValue = parseNumber(customAmount) || item?.value || 0;
  const finalAmount = Math.max(0, Math.round(baseValue * 100) / 100);

  if (!isOpen || !item) return null;
  if (typeof document === 'undefined') return null;

  const handleGenerateCharge = async (paymentMethodType: 'pix' | 'card_link' | 'boleto') => {
    if (finalAmount <= 0) {
      setError('Por favor informe um valor líquido superior a R$ 0,00 para gerar a cobrança.');
      return;
    }

    setLoading(true);
    setLoadingMethod(paymentMethodType);
    setError(null);
    try {
      const itemTenantId = (item as any)?.tenantId || (item as any)?.tenant_id || (item as any)?.original?.tenantId || (item as any)?.original?.tenant_id;
      const res = await PaymentService.createMercadoPagoCharge({
        itemType: item.type,
        itemId: item.id,
        displayId: item.displayId || undefined,
        title: item.title || (item.type === 'ORDER' ? 'Ordem de Serviço' : 'Orçamento'),
        amount: finalAmount,
        customerName: item.customerName,
        customerEmail: item.customerEmail,
        customerDocument: item.customerDocument,
        paymentMethodType,
        installments: paymentMethodType === 'card_link' ? 12 : undefined,
        tenantId: itemTenantId
      });

      if (res.success) {
        setPaymentResult({
          paymentId: res.paymentId,
          pixCopiaECola: res.pixCopiaECola,
          qrCodeBase64: res.qrCodeBase64,
          ticketUrl: res.ticketUrl,
          expiresAt: res.expiresAt,
          methodType: paymentMethodType
        });
        if (onSuccess) onSuccess();
      } else {
        setError(res.message || 'Erro ao gerar cobrança no Mercado Pago. Verifique sua conexão nas Integrações.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de comunicação ao gerar cobrança.');
    } finally {
      setLoading(false);
      setLoadingMethod(null);
    }
  };

  const handleCopyPix = () => {
    const textToCopy = paymentResult?.pixCopiaECola || paymentResult?.ticketUrl || '';
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSendWhatsApp = () => {
    const methodLabel = paymentResult?.methodType === 'pix' ? 'Pix' : (paymentResult?.methodType === 'boleto' ? 'Boleto' : 'Cartão');
    const logoUrl = (tenant as any)?.logo_url || (tenant as any)?.logoUrl;
    const headerPrefix = logoUrl ? `${logoUrl}\n\n` : '';

    const text = encodeURIComponent(
      `${headerPrefix}🏢 *${companyName}*\n\n` +
      `Olá, *${item.customerName}*! Tudo bem?\n\n` +
      `Segue a cobrança referente à ${item.type === 'ORDER' ? 'O.S.' : 'Orçamento'} *#${item.displayId || item.id.slice(0, 8)}* no valor de *R$ ${finalAmount.toFixed(2)}*:\n\n` +
      (paymentResult?.pixCopiaECola ? `*Pix Copia e Cola:*\n${paymentResult.pixCopiaECola}\n\n` : '') +
      (paymentResult?.ticketUrl ? `*Link de Pagamento (${methodLabel}):*\n${paymentResult.ticketUrl}\n\n` : '') +
      `Agradecemos a preferência! 🙏`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in font-poppins overflow-hidden">
      <div className="bg-white rounded-2xl sm:rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200/80 flex flex-col my-auto transition-all animate-scale-up">
        {/* Header Premium Big-Tech */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-[#004A75] text-white px-4 py-3 flex items-center justify-between relative overflow-hidden border-b border-sky-500/20 shrink-0">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-2.5 relative z-10">
            <div className="w-8 h-8 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 text-[#009EE3]">
              <CreditCard size={17} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-bold text-xs sm:text-sm text-white tracking-tight">Checkout Mercado Pago 2.0</h3>
                <span className="bg-sky-500/20 text-sky-300 text-[8px] font-bold px-1.5 py-0.2 rounded-full border border-sky-400/30 uppercase tracking-widest">
                  Live API
                </span>
              </div>
              <p className="text-[10px] text-slate-300 truncate max-w-[240px]">
                {item.customerName} • #{item.displayId || item.id.slice(0, 8)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/10">
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-5 space-y-3 bg-slate-50/20 max-h-[85vh] overflow-y-auto custom-scrollbar">
          {/* SE A TRANSAÇÃO JÁ ESTIVER LIQUIDADA/PAGA */}
          {(isPaidConfirmed || (item as any).billingStatus === 'PAID' || item.gatewayStatus === 'approved') ? (
            <div className="space-y-3">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl p-4 shadow-md border border-emerald-400/30 text-center space-y-2.5">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center mx-auto text-white">
                  <CheckCircle2 size={24} />
                </div>
                <div>
                  <h4 className="font-bold text-xs uppercase tracking-wider">Transação Liquidada e Conciliada</h4>
                  <p className="text-[11px] text-emerald-100 mt-0.5 leading-relaxed">
                    Esta transação já foi <strong className="text-white">Faturada</strong> no caixa da empresa. Os botões de gerar nova cobrança estão inibidos.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleManualCheckStatus}
                  disabled={isVerifying}
                  className="w-full py-2 bg-slate-950 hover:bg-slate-900 text-white rounded-lg font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 border border-white/20 active:scale-95 cursor-pointer"
                >
                  {isVerifying ? <Loader2 size={14} className="animate-spin text-emerald-400" /> : <RefreshCw size={14} className="text-emerald-400" />}
                  {isVerifying ? 'Consultando...' : '⚡ Consultar Status no Mercado Pago'}
                </button>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[11px] p-2.5 rounded-xl font-medium flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          ) : !paymentResult ? (
            /* SE FOR PENDENTE E AINDA NÃO GEROU COBRANÇA */
            <div className="space-y-3">
              {/* Banner de Verificação Instantânea Mercado Pago */}
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-xl p-3 shadow-md shadow-emerald-500/10 flex items-center justify-between gap-2 font-poppins border border-emerald-400/30">
                <div className="flex items-center gap-2 text-left min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                    <RefreshCw size={16} className={isVerifying ? 'animate-spin' : ''} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-[11px] truncate">Já pagou no Banco?</h4>
                    <p className="text-[9px] text-emerald-100 truncate">Verifique em tempo real</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleManualCheckStatus}
                  disabled={isVerifying}
                  className="px-3 py-1.5 bg-slate-950 hover:bg-slate-900 text-white rounded-lg font-bold text-[11px] transition-all shadow-md flex items-center justify-center gap-1.5 shrink-0 active:scale-95 border border-white/20"
                >
                  {isVerifying ? <Loader2 size={13} className="animate-spin text-emerald-400" /> : <RefreshCw size={13} className="text-emerald-400" />}
                  {isVerifying ? 'Consultando...' : '⚡ Verificar'}
                </button>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-[11px] p-2.5 rounded-xl font-medium flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" />
                  {error}
                </div>
              )}

              {/* Exibição do Valor Total (Fixo) */}
              <div className="bg-white border border-slate-200/80 rounded-xl p-3 shadow-xs flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-800 uppercase tracking-wider block">Valor a Cobrar</span>
                  <span className="text-[9px] text-slate-400 font-medium">Líquido da O.S.</span>
                </div>
                <span className="text-xl font-black text-[#009EE3]">
                  R$ {finalAmount.toFixed(2)}
                </span>
              </div>

              <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200/80 px-2.5 py-1.5 rounded-lg font-medium text-center">
                ⏱️ <strong>Validade:</strong> Expira em 1 hora se não for pago.
              </div>

              <p className="text-[11px] text-slate-500 font-medium pt-0.5">Selecione a forma de cobrança:</p>
              
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleGenerateCharge('pix')}
                  disabled={loading}
                  className={`w-full p-2.5 rounded-xl border transition-all group text-left flex items-center gap-3 ${
                    loadingMethod === 'pix' ? 'border-[#009EE3] bg-sky-50' : 'border-slate-200/80 bg-white hover:border-[#009EE3] hover:bg-sky-50/50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    {loadingMethod === 'pix' ? <Loader2 size={16} className="animate-spin text-[#009EE3]" /> : <QrCode size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-xs text-slate-800 block leading-tight">PIX Instantâneo</span>
                    <span className="text-[9px] text-slate-400 leading-tight block">QR Code + Copia e Cola com liquidação imediata.</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleGenerateCharge('card_link')}
                  disabled={loading}
                  className={`w-full p-2.5 rounded-xl border transition-all group text-left flex items-center gap-3 ${
                    loadingMethod === 'card_link' ? 'border-[#009EE3] bg-sky-50' : 'border-slate-200/80 bg-white hover:border-[#009EE3] hover:bg-sky-50/50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-sky-50 text-[#009EE3] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    {loadingMethod === 'card_link' ? <Loader2 size={16} className="animate-spin text-[#009EE3]" /> : <CreditCard size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-xs text-slate-800 block leading-tight">Link de Cartão de Crédito</span>
                    <span className="text-[9px] text-slate-400 leading-tight block">Checkout transparente em até 12x.</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleGenerateCharge('boleto')}
                  disabled={loading}
                  className={`w-full p-2.5 rounded-xl border transition-all group text-left flex items-center gap-3 ${
                    loadingMethod === 'boleto' ? 'border-[#009EE3] bg-sky-50' : 'border-slate-200/80 bg-white hover:border-[#009EE3] hover:bg-sky-50/50'
                  }`}
                >
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                    {loadingMethod === 'boleto' ? <Loader2 size={16} className="animate-spin text-[#009EE3]" /> : <ExternalLink size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-xs text-slate-800 block leading-tight">Boleto Bancário</span>
                    <span className="text-[9px] text-slate-400 leading-tight block">Boleto bancário oficial Mercado Pago.</span>
                  </div>
                </button>
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#009EE3] py-2 bg-sky-50 rounded-xl border border-sky-100">
                  <Loader2 size={14} className="animate-spin" /> Conectando ao Mercado Pago...
                </div>
              )}
            </div>
          ) : (
            /* SE A COBRANÇA JÁ FOI GERADA E ESTÁ AGUARDANDO PAGAMENTO */
            <div className="space-y-3 animate-fade-in text-center">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center mx-auto ${
                isPaidConfirmed ? 'bg-emerald-500 text-white shadow-md shadow-emerald-500/30' : 'bg-emerald-100 text-emerald-600'
              }`}>
                <CheckCircle2 size={22} />
              </div>

              <div>
                <h4 className="font-bold text-slate-800 text-sm">
                  {isPaidConfirmed ? '🟢 Pagamento Liquidado com Sucesso!' : 'Cobrança Gerada com Sucesso!'}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {isPaidConfirmed 
                    ? 'A transação foi confirmada pelo Mercado Pago e reconciliada no sistema.'
                    : 'Escaneie o QR Code ou compartilhe o código/link com o cliente.'}
                </p>
              </div>

              {/* Botão de Verificação Manual Instantânea */}
              {!isPaidConfirmed && (
                <div className="bg-[#009EE3]/10 border border-[#009EE3]/30 rounded-xl p-2.5 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 text-left min-w-0">
                    <RefreshCw size={14} className="text-[#009EE3] shrink-0 animate-spin" />
                    <div className="min-w-0">
                      <span className="text-[#009EE3] font-bold block text-[11px] truncate">Verificação de Pagamento</span>
                      <span className="text-[9px] text-slate-500 truncate block">Já efetuou o pagamento no app?</span>
                    </div>
                  </div>
                  <button
                    onClick={handleManualCheckStatus}
                    disabled={isVerifying}
                    className="px-3 py-1.5 bg-[#009EE3] hover:bg-[#0089c7] text-white rounded-lg font-bold text-[11px] transition-all shadow-sm flex items-center justify-center gap-1.5 shrink-0 active:scale-95"
                  >
                    {isVerifying ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                    {isVerifying ? 'Consultando...' : '⚡ Verificar Agora'}
                  </button>
                </div>
              )}

              {/* 🟢 BLOCOS DEDICADOS POR TIPO DE PAGAMENTO */}
              {!isPaidConfirmed && (
                <>
                  {/* SE FOR PIX OU TIVER CÓDIGO PIX */}
                  {(paymentResult.methodType === 'pix' || paymentResult.pixCopiaECola || paymentResult.qrCodeBase64) && (
                    <div className="space-y-3">
                      {/* Imagem do QR Code Pix */}
                      <div className="bg-white p-3 rounded-2xl border border-slate-200/90 shadow-sm inline-block mx-auto">
                        <img 
                          src={
                            paymentResult.qrCodeBase64 
                              ? `data:image/png;base64,${paymentResult.qrCodeBase64}` 
                              : `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(paymentResult.pixCopiaECola || paymentResult.ticketUrl || 'https://mercadopago.com.br')}`
                          } 
                          alt="QR Code Pix" 
                          className="w-48 h-48 sm:w-52 sm:h-52 object-contain mx-auto rounded-lg"
                        />
                        <span className="text-[10px] text-slate-400 font-medium block mt-1">
                          Escaneie com o app do seu Banco
                        </span>
                      </div>

                      {/* Box Pix Copia e Cola Principal (NATIVO - INTACTO) */}
                      <div className="bg-white border border-slate-200/80 rounded-xl p-2.5 text-left space-y-1.5 shadow-xs">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block">
                            Código PIX Copia e Cola
                          </label>
                          <span className="text-[9px] text-teal-600 font-bold bg-teal-50 px-2 py-0.5 rounded-full border border-teal-200">
                            ⚡ Liquidação Instantânea
                          </span>
                        </div>
                        <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                          <input
                            readOnly
                            value={paymentResult.pixCopiaECola || ''}
                            className="text-[11px] font-mono text-slate-700 bg-transparent flex-1 outline-none truncate"
                          />
                          <button
                            onClick={handleCopyPix}
                            className="px-2.5 py-1 bg-slate-900 text-white rounded-md text-[11px] font-semibold hover:bg-slate-800 transition-all shrink-0 flex items-center gap-1 active:scale-95"
                          >
                            {copied ? <CheckCircle2 size={12} className="text-emerald-400" /> : <Copy size={12} />}
                            {copied ? 'Copiado!' : 'Copiar'}
                          </button>
                        </div>
                      </div>

                      {/* ADICIONAL: Link / QR Code Externo (Para copiar ou abrir em outra aba) */}
                      {paymentResult.ticketUrl && (
                        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5 text-left space-y-1.5 shadow-xs">
                          <div className="flex items-center justify-between">
                            <label className="text-[9px] font-bold text-slate-500 uppercase tracking-widest block flex items-center gap-1">
                              <ExternalLink size={10} className="text-[#009EE3]" /> Link / QR Code Externo
                            </label>
                            <span className="text-[9px] text-sky-700 font-semibold bg-sky-50 px-2 py-0.5 rounded-full border border-sky-200">
                              Opcional
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 bg-white p-1.5 rounded-lg border border-slate-200">
                            <input
                              readOnly
                              value={paymentResult.ticketUrl}
                              className="text-[10px] font-mono text-slate-600 bg-transparent flex-1 outline-none truncate"
                            />
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(paymentResult.ticketUrl || '');
                                showAlert('Link externo do Pix copiado com sucesso!', 'success');
                              }}
                              className="px-2 py-1 bg-slate-800 text-white rounded-md text-[10px] font-semibold hover:bg-slate-700 transition-all shrink-0 flex items-center gap-1 active:scale-95"
                            >
                              <Copy size={10} /> Copiar
                            </button>
                            <button
                              onClick={() => window.open(paymentResult.ticketUrl, '_blank')}
                              className="px-2 py-1 bg-[#009EE3] text-white rounded-md text-[10px] font-semibold hover:bg-[#0089c7] transition-all shrink-0 flex items-center gap-1 active:scale-95"
                            >
                              <ExternalLink size={10} /> Abrir
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* SE FOR BOLETO */}
                  {paymentResult.methodType === 'boleto' && !paymentResult.pixCopiaECola && (
                    <div className="bg-amber-50/60 border border-amber-200/80 rounded-2xl p-4 text-center space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                        <ExternalLink size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Boleto Bancário Gerado</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Abra direto no navegador para visualizar e imprimir o boleto.</p>
                      </div>
                      <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-amber-200">
                        <input 
                          readOnly 
                          value={paymentResult.ticketUrl || ''} 
                          className="text-xs font-mono text-slate-800 bg-transparent flex-1 outline-none truncate"
                        />
                        <button
                          onClick={handleCopyPix}
                          className="px-3 py-1.5 bg-slate-950 text-white rounded-lg text-xs font-bold hover:bg-slate-800 transition-all shrink-0 flex items-center gap-1.5 active:scale-95"
                        >
                          {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          {copied ? 'Copiado!' : 'Copiar Link'}
                        </button>
                      </div>
                      {paymentResult.ticketUrl && (
                        <button
                          onClick={() => window.open(paymentResult.ticketUrl, '_blank')}
                          className="w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-amber-600/20 flex items-center justify-center gap-2 active:scale-95"
                        >
                          <ExternalLink size={15} /> 📄 Abrir e Imprimir Boleto Direto no Navegador
                        </button>
                      )}
                    </div>
                  )}

                  {/* SE FOR CARTÃO DE CRÉDITO */}
                  {paymentResult.methodType === 'card_link' && !paymentResult.pixCopiaECola && (
                    <div className="bg-sky-50/60 border border-sky-200/80 rounded-2xl p-4 text-center space-y-3">
                      <div className="w-12 h-12 rounded-xl bg-[#009EE3]/10 text-[#009EE3] flex items-center justify-center mx-auto">
                        <CreditCard size={24} />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-800 text-sm">Link de Cartão de Crédito (até 12x)</h4>
                        <p className="text-xs text-slate-500 mt-0.5">Envie este link para o cliente realizar o pagamento parcelado no cartão.</p>
                      </div>
                      <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-sky-200">
                        <input 
                          readOnly 
                          value={paymentResult.ticketUrl || ''} 
                          className="text-xs font-mono text-slate-800 bg-transparent flex-1 outline-none truncate"
                        />
                        <button
                          onClick={handleCopyPix}
                          className="px-3 py-1.5 bg-[#009EE3] text-white rounded-lg text-xs font-bold hover:bg-[#0089c7] transition-all shrink-0 flex items-center gap-1.5 active:scale-95 shadow-sm"
                        >
                          {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                          {copied ? 'Copiado!' : 'Copiar Link'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Botões de Ação */}
              <div className="grid grid-cols-2 gap-2 pt-0.5">
                <button
                  onClick={handleSendWhatsApp}
                  className="flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-emerald-600/20 active:scale-95"
                >
                  <Share2 size={14} /> WhatsApp
                </button>
                {paymentResult.ticketUrl && (
                  <button
                    onClick={() => window.open(paymentResult.ticketUrl, '_blank')}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all active:scale-95"
                  >
                    <ExternalLink size={14} /> Abrir Link
                  </button>
                )}
              </div>

              {/* Rodapé Interno Formatado */}
              <div className="pt-2 border-t border-slate-200/80 flex items-center justify-center">
                <button
                  onClick={() => setPaymentResult(null)}
                  className="inline-flex items-center justify-center gap-1 text-[11px] font-bold text-[#009EE3] hover:text-[#0082bc] transition-colors py-1"
                >
                  <RefreshCw size={12} /> Gerar Nova Cobrança ou Alterar Valor
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};
