import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PaymentService } from '../../services/paymentService';
import { supabase } from '../../lib/supabase';
import { 
  X, CreditCard, QrCode, Copy, CheckCircle2, 
  ExternalLink, Share2, Loader2, ShieldCheck, DollarSign, RefreshCw,
  Building2, Sparkles, AlertCircle, ArrowRight
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
    billingStatus?: string;
  };
  onSuccess?: () => void;
}

export const MercadoPagoPaymentModal: React.FC<MercadoPagoPaymentModalProps> = ({
  isOpen, onClose, item, onSuccess
}) => {
  const { data: tenant } = useTenant();
  const companyName = tenant?.trading_name || tenant?.company_name || tenant?.name || 'NEXUS PRO';
  const tenantLogo = (tenant as any)?.logo_url || (tenant as any)?.logoUrl || (tenant as any)?.logo;

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

  // Estados de Desconto / Ajuste de Valor antes de Faturar
  const [customAmount, setCustomAmount] = useState<string>(item?.value ? String(item.value) : '0');

  // Carrega cobrança existente (caso já tenha sido gerada anteriormente)
  useEffect(() => {
    if (item) {
      setCustomAmount(String(item.value || 0));
      setError(null);

      if (item.gatewayPixCode || item.gatewayTicketUrl) {
        const method = (item as any).gatewayPaymentMethod || (item.gatewayPixCode ? 'pix' : 'card_link');
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
  useEffect(() => {
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
  }, [paymentResult?.paymentId, isPaidConfirmed, item.id, item.type, onSuccess]);

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
        setError('O pagamento ainda consta como pendente no gateway. Se você já fez o Pix, aguarde alguns instantes e tente novamente.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao verificar status do pagamento.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Parse numérico robusto
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
      setError('Por favor informe um valor superior a R$ 0,00 para gerar a cobrança.');
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
        setError(res.message || 'Erro ao gerar cobrança. Verifique as configurações de integração.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de comunicação ao gerar cobrança.');
    } finally {
      setLoading(false);
      setLoadingMethod(null);
    }
  };

  const handleCopyPix = () => {
    const systemCheckoutUrl = `${window.location.origin}/#/checkout/${item.type.toLowerCase()}/${item.id}`;
    const textToCopy = paymentResult?.pixCopiaECola || systemCheckoutUrl;
    if (textToCopy) {
      navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSendWhatsApp = () => {
    const methodLabel = paymentResult?.methodType === 'pix' ? 'PIX Instantâneo' : (paymentResult?.methodType === 'boleto' ? 'Boleto' : 'Cartão de Crédito');
    const systemCheckoutUrl = `${window.location.origin}/#/checkout/${item.type.toLowerCase()}/${item.id}`;

    const text = encodeURIComponent(
      `🏢 *${companyName}*\n` +
      `📌 *Pagamento de ${item.type === 'ORDER' ? 'Ordem de Serviço' : 'Orçamento'} #${item.displayId || item.id.slice(0, 8)}*\n\n` +
      `Olá, *${item.customerName}*!\n` +
      `Segue o link oficial para efetuar o pagamento com total segurança no valor de *R$ ${finalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}*:\n\n` +
      `🔗 *Link do Checkout Transparente:*\n${systemCheckoutUrl}\n\n` +
      (paymentResult?.pixCopiaECola ? `⚡ *PIX Copia e Cola Direto:*\n\`${paymentResult.pixCopiaECola}\`\n\n` : '') +
      `Qualquer dúvida, estamos à disposição!\n\n` +
      `_Agradecemos a preferência!_ 🙏`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in font-poppins overflow-hidden">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200/90 flex flex-col my-auto transition-all animate-scale-up">
        
        {/* ── HEADER PREMIUM COM BRANDING DA EMPRESA ── */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white px-5 py-4 flex items-center justify-between relative overflow-hidden border-b border-slate-800 shrink-0">
          <div className="absolute top-0 right-0 w-44 h-44 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="flex items-center gap-3.5 relative z-10 min-w-0">
            {/* Logo do Tenant / Empresa ou Fallback do Sistema */}
            {tenantLogo ? (
              <div className="w-10 h-10 rounded-2xl bg-white p-1 flex items-center justify-center border border-white/20 shadow-md shrink-0 overflow-hidden">
                <img src={tenantLogo} alt={companyName} className="w-full h-full object-contain" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 p-0.5 shadow-lg shadow-emerald-500/20 shrink-0 flex items-center justify-center text-slate-950 font-black text-sm">
                <Building2 size={20} className="text-slate-950" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm sm:text-base text-white tracking-tight truncate">
                  {companyName}
                </h3>
                <span className="bg-emerald-500/20 text-emerald-400 text-[9px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-500/30 uppercase tracking-widest flex items-center gap-1 shrink-0">
                  <ShieldCheck size={10} /> Checkout Nativo
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {item.type === 'ORDER' ? 'Ordem de Serviço' : 'Orçamento'} #{item.displayId || item.id.slice(0, 8)} • {item.customerName}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-white/10 shrink-0 ml-2"
            title="Fechar Checkout"
          >
            <X size={18} />
          </button>
        </div>

        {/* ── CORPO DO CHECKOUT ── */}
        <div className="p-5 sm:p-6 space-y-4 bg-slate-50/60 max-h-[82vh] overflow-y-auto custom-scrollbar">
          
          {/* 1. SE A TRANSAÇÃO JÁ ESTIVER LIQUIDADA/PAGA */}
          {(isPaidConfirmed || (item as any).billingStatus === 'PAID' || item.gatewayStatus === 'approved') ? (
            <div className="space-y-4 text-center py-2">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl p-6 shadow-xl border border-emerald-400/30 space-y-3 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-xl pointer-events-none" />
                <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mx-auto text-white shadow-inner">
                  <CheckCircle2 size={32} />
                </div>
                <div>
                  <h4 className="font-extrabold text-base uppercase tracking-wider text-white">Pagamento Confirmado!</h4>
                  <p className="text-xs text-emerald-100 mt-1 leading-relaxed max-w-sm mx-auto">
                    Esta transação já foi baixada e conciliada com sucesso no sistema da empresa.
                  </p>
                </div>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={handleManualCheckStatus}
                    disabled={isVerifying}
                    className="w-full py-3 bg-slate-950 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition-all shadow-lg flex items-center justify-center gap-2 active:scale-[0.98] border border-white/20 cursor-pointer"
                  >
                    {isVerifying ? <Loader2 size={16} className="animate-spin text-emerald-400" /> : <RefreshCw size={16} className="text-emerald-400" />}
                    {isVerifying ? 'Verificando...' : 'Re-conferir Status com o Gateway'}
                  </button>
                </div>
              </div>
            </div>
          ) : !paymentResult ? (
            /* 2. SE FOR PENDENTE E AINDA NÃO GEROU A COBRANÇA */
            <div className="space-y-4">
              
              {/* Banner de Verificação Rápida */}
              <div className="bg-slate-900 text-white rounded-2xl p-3.5 shadow-md flex items-center justify-between gap-3 border border-slate-800">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                    <RefreshCw size={17} className={isVerifying ? 'animate-spin' : ''} />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-bold text-xs truncate text-white">Já efetuou o pagamento no Banco?</h4>
                    <p className="text-[10px] text-slate-400 truncate">Clique para consultar a liquidação em tempo real</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleManualCheckStatus}
                  disabled={isVerifying}
                  className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-1.5 shrink-0 active:scale-95 border border-emerald-400/30 cursor-pointer"
                >
                  {isVerifying ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                  {isVerifying ? 'Checando...' : 'Verificar'}
                </button>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-2xl font-medium flex items-center gap-2.5 animate-shake">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span className="flex-1">{error}</span>
                </div>
              )}

              {/* Card Resumo do Valor */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Total do Pagamento</span>
                  <span className="text-xs text-slate-500 font-medium truncate block max-w-[200px]">
                    Cliente: {item.customerName}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-slate-900 tracking-tight">
                    R$ {finalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                  <span className="text-[9px] text-emerald-600 font-bold block">🔒 Processamento Seguro</span>
                </div>
              </div>

              {/* Seleção do Método de Pagamento Transparente */}
              <div className="space-y-2.5 pt-1">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                  Escolha como deseja pagar:
                </label>

                {/* Opção 1: PIX Instantâneo */}
                <button
                  type="button"
                  onClick={() => handleGenerateCharge('pix')}
                  disabled={loading}
                  className={`w-full p-4 rounded-2xl border-2 transition-all group text-left flex items-center gap-3.5 relative overflow-hidden ${
                    loadingMethod === 'pix' 
                      ? 'border-emerald-500 bg-emerald-50/60 shadow-md' 
                      : 'border-slate-200/90 bg-white hover:border-emerald-500 hover:bg-emerald-50/30 shadow-xs'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                    {loadingMethod === 'pix' ? <Loader2 size={22} className="animate-spin text-emerald-600" /> : <QrCode size={22} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900 block leading-tight">PIX Instantâneo</span>
                      <span className="bg-emerald-100 text-emerald-700 font-bold text-[9px] px-2 py-0.5 rounded-full border border-emerald-200 uppercase tracking-wider">
                        ⚡ Liberação Imediata
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 leading-tight block mt-1">
                      QR Code + Copia e Cola. Pagamento aprovado na hora.
                    </span>
                  </div>
                  <ArrowRight size={18} className="text-slate-300 group-hover:text-emerald-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>

                {/* Opção 2: Cartão de Crédito */}
                <button
                  type="button"
                  onClick={() => handleGenerateCharge('card_link')}
                  disabled={loading}
                  className={`w-full p-4 rounded-2xl border-2 transition-all group text-left flex items-center gap-3.5 relative overflow-hidden ${
                    loadingMethod === 'card_link' 
                      ? 'border-sky-500 bg-sky-50/60 shadow-md' 
                      : 'border-slate-200/90 bg-white hover:border-sky-500 hover:bg-sky-50/30 shadow-xs'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                    {loadingMethod === 'card_link' ? <Loader2 size={22} className="animate-spin text-sky-600" /> : <CreditCard size={22} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-extrabold text-sm text-slate-900 block leading-tight">Cartão de Crédito</span>
                      <span className="bg-sky-100 text-sky-700 font-bold text-[9px] px-2 py-0.5 rounded-full border border-sky-200 uppercase tracking-wider">
                        Até 12x
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-500 leading-tight block mt-1">
                      Checkout no cartão com bandeiras Visa, Master, Elo e Amex.
                    </span>
                  </div>
                  <ArrowRight size={18} className="text-slate-300 group-hover:text-sky-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>

                {/* Opção 3: Boleto Bancário */}
                <button
                  type="button"
                  onClick={() => handleGenerateCharge('boleto')}
                  disabled={loading}
                  className={`w-full p-4 rounded-2xl border-2 transition-all group text-left flex items-center gap-3.5 relative overflow-hidden ${
                    loadingMethod === 'boleto' 
                      ? 'border-amber-500 bg-amber-50/60 shadow-md' 
                      : 'border-slate-200/90 bg-white hover:border-amber-500 hover:bg-amber-50/30 shadow-xs'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform shadow-xs">
                    {loadingMethod === 'boleto' ? <Loader2 size={22} className="animate-spin text-amber-600" /> : <ExternalLink size={22} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-extrabold text-sm text-slate-900 block leading-tight">Boleto Bancário</span>
                    <span className="text-[11px] text-slate-500 leading-tight block mt-1">
                      Gerar boleto registrado oficial para pagamento em qualquer banco.
                    </span>
                  </div>
                  <ArrowRight size={18} className="text-slate-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                </button>
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-2.5 text-xs font-extrabold text-slate-800 py-3 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse">
                  <Loader2 size={16} className="animate-spin text-emerald-600" /> 
                  Gerando a cobrança nativa... Por favor aguarde.
                </div>
              )}
            </div>
          ) : (
            /* 3. SE A COBRANÇA FOI GERADA E ESTÁ AGUARDANDO PAGAMENTO */
            <div className="space-y-4 animate-fade-in text-center">
              
              {/* Card de Alerta de Status */}
              <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-left ${
                isPaidConfirmed ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-slate-900 text-white border-slate-800'
              }`}>
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
                    {isPaidConfirmed ? <CheckCircle2 size={18} className="text-white" /> : <RefreshCw size={18} className="animate-spin text-emerald-400" />}
                  </div>
                  <div className="min-w-0">
                    <span className="font-bold text-xs block leading-tight">
                      {isPaidConfirmed ? '🟢 Pagamento Aprovado!' : '⚡ Aguardando Pagamento...'}
                    </span>
                    <span className="text-[10px] text-slate-300 block truncate">
                      {isPaidConfirmed ? 'O valor foi conciliado com sucesso.' : 'O sistema verifica automaticamente a cada 4 segundos.'}
                    </span>
                  </div>
                </div>

                {!isPaidConfirmed && (
                  <button
                    onClick={handleManualCheckStatus}
                    disabled={isVerifying}
                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-[11px] transition-all shrink-0 active:scale-95"
                  >
                    {isVerifying ? 'Checando...' : 'Verificar Agora'}
                  </button>
                )}
              </div>

              {/* ⚡ TELA DEDICADA DE PIX INSTANTÂNEO */}
              {!isPaidConfirmed && (paymentResult.methodType === 'pix' || paymentResult.pixCopiaECola || paymentResult.qrCodeBase64) && (
                <div className="space-y-3.5">
                  
                  {/* Container do QR Code */}
                  <div className="bg-white p-4 rounded-3xl border border-slate-200/90 shadow-md inline-block mx-auto relative group">
                    <img 
                      src={
                        paymentResult.qrCodeBase64 
                          ? `data:image/png;base64,${paymentResult.qrCodeBase64}` 
                          : `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(paymentResult.pixCopiaECola || paymentResult.ticketUrl || 'https://mercadopago.com.br')}`
                      } 
                      alt="QR Code Pix" 
                      className="w-52 h-52 sm:w-56 sm:h-56 object-contain mx-auto rounded-xl"
                    />
                    <div className="mt-2 text-center">
                      <span className="text-[11px] font-extrabold text-slate-700 block">
                        Abra o app do seu Banco e escaneie o QR Code
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium block">
                        Valor: R$ {finalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  {/* Campo PIX Copia e Cola */}
                  <div className="bg-white border border-slate-200/90 rounded-2xl p-3 text-left space-y-2 shadow-xs">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block">
                        Código PIX Copia e Cola
                      </label>
                      <span className="text-[9px] text-emerald-700 font-extrabold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        ⚡ PIX Nativo
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                      <input
                        readOnly
                        value={paymentResult.pixCopiaECola || ''}
                        className="text-xs font-mono text-slate-800 bg-transparent flex-1 outline-none truncate"
                      />
                      <button
                        onClick={handleCopyPix}
                        className="px-3.5 py-1.5 bg-slate-950 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition-all shrink-0 flex items-center gap-1.5 active:scale-95 shadow-sm"
                      >
                        {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        {copied ? 'Copiado!' : 'Copiar PIX'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 💳 TELA DE CARTÃO DE CRÉDITO */}
              {!isPaidConfirmed && paymentResult.methodType === 'card_link' && !paymentResult.pixCopiaECola && (
                <div className="bg-white border border-sky-200/90 rounded-3xl p-5 text-center space-y-3 shadow-md">
                  <div className="w-12 h-12 rounded-2xl bg-sky-500/10 text-sky-600 flex items-center justify-center mx-auto">
                    <CreditCard size={26} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">Link para Pagamento no Cartão</h4>
                    <p className="text-xs text-slate-500 mt-1">O cliente poderá parcelar em até 12x no cartão de crédito.</p>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                    <input 
                      readOnly 
                      value={`${window.location.origin}/#/checkout/${item.type.toLowerCase()}/${item.id}`} 
                      className="text-xs font-mono text-slate-800 bg-transparent flex-1 outline-none truncate"
                    />
                    <button
                      onClick={handleCopyPix}
                      className="px-3.5 py-1.5 bg-sky-600 text-white rounded-xl text-xs font-bold hover:bg-sky-500 transition-all shrink-0 flex items-center gap-1.5 active:scale-95 shadow-sm"
                    >
                      {copied ? <CheckCircle2 size={14} className="text-white" /> : <Copy size={14} />}
                      {copied ? 'Copiado!' : 'Copiar Link'}
                    </button>
                  </div>
                </div>
              )}

              {/* 📄 TELA DE BOLETO */}
              {!isPaidConfirmed && paymentResult.methodType === 'boleto' && !paymentResult.pixCopiaECola && (
                <div className="bg-white border border-amber-200/90 rounded-3xl p-5 text-center space-y-3 shadow-md">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                    <ExternalLink size={26} />
                  </div>
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-sm">Boleto Bancário Gerado</h4>
                    <p className="text-xs text-slate-500 mt-1">Imprima ou envie a linha digitável para o cliente.</p>
                  </div>
                  {paymentResult.ticketUrl && (
                    <button
                      onClick={() => window.open(paymentResult.ticketUrl, '_blank')}
                      className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-95"
                    >
                      <ExternalLink size={16} /> Abrir e Imprimir Boleto Bancário
                    </button>
                  )}
                </div>
              )}

              {/* Botões de Ação Final (Compartilhar WhatsApp e Voltar) */}
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  onClick={handleSendWhatsApp}
                  className="flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-2xl transition-all shadow-md active:scale-95"
                >
                  <Share2 size={15} /> Enviar via WhatsApp
                </button>
                <button
                  onClick={() => setPaymentResult(null)}
                  className="flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition-all active:scale-95"
                >
                  <RefreshCw size={15} /> Alterar Cobrança
                </button>
              </div>

            </div>
          )}

        </div>
        
        {/* Rodapé Fixo */}
        <div className="px-5 py-3 bg-slate-100/80 border-t border-slate-200/80 text-center text-[10px] text-slate-400 font-medium">
          Sistema {companyName} • Checkout Seguro com Criptografia SSL
        </div>

      </div>
    </div>,
    document.body
  );
};
