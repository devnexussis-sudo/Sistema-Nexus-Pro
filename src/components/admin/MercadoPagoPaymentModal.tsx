import React, { useState } from 'react';
import { PaymentService } from '../../services/paymentService';
import { supabase } from '../../lib/supabase';
import { 
  X, CreditCard, QrCode, Copy, CheckCircle2, 
  ExternalLink, Share2, Loader2, ShieldCheck, DollarSign, RefreshCw
} from 'lucide-react';

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
    gatewayPixCode?: string;
    gatewayTicketUrl?: string;
    gatewayStatus?: string;
  };
  onSuccess?: () => void;
}

export const MercadoPagoPaymentModal: React.FC<MercadoPagoPaymentModalProps> = ({
  isOpen, onClose, item, onSuccess
}) => {
  const [loading, setLoading] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    paymentId?: string;
    pixCopiaECola?: string;
    ticketUrl?: string;
    expiresAt?: string;
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
        setPaymentResult({
          paymentId: (item as any).gatewayPaymentId,
          pixCopiaECola: item.gatewayPixCode,
          ticketUrl: item.gatewayTicketUrl
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

  const baseValue = item?.value || 0;
  const finalAmount = Math.max(0, Math.round(baseValue * 100) / 100);

  if (!isOpen || !item) return null;

  const handleGenerateCharge = async (paymentMethodType: 'pix' | 'card_link' | 'boleto') => {
    if (finalAmount <= 0) {
      setError('Por favor informe um valor líquido superior a R$ 0,00 para gerar a cobrança.');
      return;
    }

    setLoading(true);
    setLoadingMethod(paymentMethodType);
    setError(null);
    try {
      const res = await PaymentService.createMercadoPagoCharge({
        itemType: item.type,
        itemId: item.id,
        displayId: item.displayId || undefined,
        title: item.title || (item.type === 'ORDER' ? 'Ordem de Serviço' : 'Orçamento'),
        amount: finalAmount,
        originalAmount: baseValue,
        discountAmount: 0,
        discountType: 'fixed',
        customerName: item.customerName,
        paymentMethodType,
        installments: paymentMethodType === 'card_link' ? 12 : undefined
      });

      if (res.success) {
        setPaymentResult({
          paymentId: res.paymentId,
          pixCopiaECola: res.pixCopiaECola,
          ticketUrl: res.ticketUrl,
          expiresAt: res.expiresAt
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
    if (paymentResult?.pixCopiaECola) {
      navigator.clipboard.writeText(paymentResult.pixCopiaECola);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSendWhatsApp = () => {
    const text = encodeURIComponent(
      `Olá ${item.customerName}! Segue o link de pagamento da ${item.type === 'ORDER' ? 'O.S.' : 'Orçamento'} #${item.displayId || item.id.slice(0, 8)} no valor de R$ ${finalAmount.toFixed(2)}:\n\n` +
      (paymentResult?.pixCopiaECola ? `*Pix Copia e Cola:*\n${paymentResult.pixCopiaECola}\n\n` : '') +
      `Link para pagamento: ${paymentResult?.ticketUrl || ''}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  return (
    <div className="fixed inset-0 z-[1300] bg-slate-950/70 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in font-poppins">
      <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl overflow-hidden border border-slate-200/80 flex flex-col transition-all">
        {/* Header Premium Big-Tech */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-[#004A75] text-white p-5 flex items-center justify-between relative overflow-hidden border-b border-sky-500/20">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/10 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-3.5 relative z-10">
            <div className="w-11 h-11 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shrink-0 text-[#009EE3]">
              <CreditCard size={22} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm text-white tracking-tight">Checkout Mercado Pago 2.0</h3>
                <span className="bg-sky-500/20 text-sky-300 text-[9px] font-bold px-2 py-0.5 rounded-full border border-sky-400/30 uppercase tracking-widest">
                  Live API
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                {item.customerName} • #{item.displayId || item.id.slice(0, 8)}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-white/10">
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[85vh] overflow-y-auto">
          {/* SE A TRANSAÇÃO JÁ ESTIVER LIQUIDADA/PAGA */}
          {(isPaidConfirmed || (item as any).billingStatus === 'PAID' || item.gatewayStatus === 'approved') ? (
            <div className="space-y-4">
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-5 shadow-lg border border-emerald-400/30 text-center space-y-3">
                <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center mx-auto text-white">
                  <CheckCircle2 size={28} />
                </div>
                <div>
                  <h4 className="font-bold text-sm uppercase tracking-wider">Transação Liquidada e Conciliada</h4>
                  <p className="text-xs text-emerald-100 mt-1 leading-relaxed">
                    Esta transação já foi <strong className="text-white">Faturada</strong> no caixa da empresa. Os botões de gerar nova cobrança estão inibidos para proteger a conta contra pagamentos duplicados.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleManualCheckStatus}
                  disabled={isVerifying}
                  className="w-full py-3 bg-slate-950 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 border border-white/20 active:scale-95 cursor-pointer"
                >
                  {isVerifying ? <Loader2 size={16} className="animate-spin text-emerald-400" /> : <RefreshCw size={16} className="text-emerald-400" />}
                  {isVerifying ? 'Consultando Mercado Pago...' : '⚡ Consultar Status em Tempo Real no Mercado Pago'}
                </button>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-2xl font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  {error}
                </div>
              )}
            </div>
          ) : !paymentResult ? (
            /* SE FOR PENDENTE E AINDA NÃO GEROU COBRANÇA */
            <div className="space-y-5">
              {/* Banner de Verificação Instantânea Mercado Pago */}
              <div className="bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-lg shadow-emerald-500/15 flex flex-col sm:flex-row items-center justify-between gap-3 font-poppins border border-emerald-400/30">
                <div className="flex items-center gap-3 text-left">
                  <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center shrink-0">
                    <RefreshCw size={20} className={isVerifying ? 'animate-spin' : ''} />
                  </div>
                  <div>
                    <h4 className="font-bold text-xs">Já efetuou o pagamento no Banco?</h4>
                    <p className="text-[10px] text-emerald-100">Consulte a conciliação do Mercado Pago em tempo real</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleManualCheckStatus}
                  disabled={isVerifying}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-950 hover:bg-slate-900 text-white rounded-xl font-bold text-xs transition-all shadow-md flex items-center justify-center gap-2 shrink-0 active:scale-95 border border-white/20"
                >
                  {isVerifying ? <Loader2 size={15} className="animate-spin text-emerald-400" /> : <RefreshCw size={15} className="text-emerald-400" />}
                  {isVerifying ? 'Consultando...' : '⚡ Verificar Agora'}
                </button>
              </div>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-2xl font-medium flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 shrink-0" />
                  {error}
                </div>
              )}

              {/* Exibição do Valor Total (Fixo) */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 uppercase tracking-wider block">Valor a Cobrar</span>
                  <span className="text-[10px] text-slate-500 font-medium">Descontos já aplicados na O.S.</span>
                </div>
                <span className="text-2xl font-black text-[#009EE3]">
                  R$ {finalAmount.toFixed(2)}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px] text-amber-700 bg-amber-50 border border-amber-200 p-2.5 rounded-xl font-medium">
                <span>⏱️ <strong>Validade do Link:</strong> Expira em 1 hora se não for pago.</span>
              </div>

              <p className="text-xs text-slate-500 font-medium">Selecione a forma de cobrança desejada:</p>
              
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => handleGenerateCharge('pix')}
                  disabled={loading}
                  className={`w-full p-3.5 rounded-2xl border-2 transition-all group text-left flex items-center gap-3.5 ${
                    loadingMethod === 'pix' ? 'border-[#009EE3] bg-sky-50' : 'border-slate-100 hover:border-[#009EE3] hover:bg-sky-50/50'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-teal-50 text-teal-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    {loadingMethod === 'pix' ? <Loader2 size={22} className="animate-spin text-[#009EE3]" /> : <QrCode size={22} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-xs text-slate-800 block">PIX Instantâneo</span>
                    <span className="text-[10px] text-slate-500">Gera QR Code + Copia e Cola com liquidação imediata.</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleGenerateCharge('card_link')}
                  disabled={loading}
                  className={`w-full p-3.5 rounded-2xl border-2 transition-all group text-left flex items-center gap-3.5 ${
                    loadingMethod === 'card_link' ? 'border-[#009EE3] bg-sky-50' : 'border-slate-100 hover:border-[#009EE3] hover:bg-sky-50/50'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-sky-50 text-[#009EE3] flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    {loadingMethod === 'card_link' ? <Loader2 size={22} className="animate-spin text-[#009EE3]" /> : <CreditCard size={22} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-xs text-slate-800 block">Link de Cartão de Crédito</span>
                    <span className="text-[10px] text-slate-500">Checkout transparente para parcelamento no cartão em até 12x.</span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleGenerateCharge('boleto')}
                  disabled={loading}
                  className={`w-full p-3.5 rounded-2xl border-2 transition-all group text-left flex items-center gap-3.5 ${
                    loadingMethod === 'boleto' ? 'border-[#009EE3] bg-sky-50' : 'border-slate-100 hover:border-[#009EE3] hover:bg-sky-50/50'
                  }`}
                >
                  <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                    {loadingMethod === 'boleto' ? <Loader2 size={22} className="animate-spin text-[#009EE3]" /> : <ExternalLink size={22} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="font-bold text-xs text-slate-800 block">Boleto Bancário</span>
                    <span className="text-[10px] text-slate-500">Gera boleto bancário oficial do Mercado Pago com linha digitável.</span>
                  </div>
                </button>
              </div>

              {loading && (
                <div className="flex items-center justify-center gap-2 text-xs font-bold text-[#009EE3] py-2 bg-sky-50 rounded-xl border border-sky-100">
                  <Loader2 size={16} className="animate-spin" /> Conectando ao Mercado Pago e gerando cobrança...
                </div>
              )}
            </div>
          ) : (
            /* SE A COBRANÇA JÁ FOI GERADA E ESTÁ AGUARDANDO PAGAMENTO */
            <div className="space-y-5 animate-fade-in text-center">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto ${
                isPaidConfirmed ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/30' : 'bg-emerald-100 text-emerald-600'
              }`}>
                <CheckCircle2 size={28} />
              </div>

              <div>
                <h4 className="font-bold text-slate-800 text-base">
                  {isPaidConfirmed ? '🟢 Pagamento Liquidado com Sucesso!' : 'Cobrança Emitida com Sucesso!'}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  {isPaidConfirmed 
                    ? 'A transação foi confirmada pelo Mercado Pago e reconciliada no sistema.'
                    : 'Envie o código Pix ou Link para o cliente efetuar o pagamento. O sistema atualizará sozinho assim que pago.'}
                </p>
              </div>

              {/* Botão de Verificação Manual Instantânea */}
              {!isPaidConfirmed && (
                <div className="bg-[#009EE3]/10 border border-[#009EE3]/30 rounded-2xl p-3.5 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 text-left">
                    <RefreshCw size={16} className="text-[#009EE3] shrink-0 animate-spin" />
                    <div>
                      <span className="text-[#009EE3] font-bold block text-xs">Verificação de Pagamento</span>
                      <span className="text-[10px] text-slate-500">Já efetuou o pagamento no app do banco?</span>
                    </div>
                  </div>
                  <button
                    onClick={handleManualCheckStatus}
                    disabled={isVerifying}
                    className="w-full sm:w-auto px-4 py-2 bg-[#009EE3] hover:bg-[#0089c7] text-white rounded-xl font-bold text-xs transition-all shadow-md shadow-[#009EE3]/20 flex items-center justify-center gap-2 shrink-0 active:scale-95"
                  >
                    {isVerifying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    {isVerifying ? 'Consultando Mercado Pago...' : '⚡ Verificar Pagamento Agora'}
                  </button>
                </div>
              )}

              {/* Box Pix Copia e Cola */}
              {paymentResult.pixCopiaECola && !isPaidConfirmed && (
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3 text-left space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block">Código PIX Copia e Cola</label>
                  <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
                    <code className="text-xs font-mono text-slate-700 truncate flex-1">{paymentResult.pixCopiaECola}</code>
                    <button
                      onClick={handleCopyPix}
                      className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-all shrink-0 flex items-center gap-1"
                    >
                      {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                      {copied ? 'Copiado!' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              {/* Botões de Ação */}
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  onClick={handleSendWhatsApp}
                  className="flex items-center justify-center gap-2 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-2xl transition-all shadow-md shadow-emerald-600/20"
                >
                  <Share2 size={16} /> WhatsApp
                </button>
                {paymentResult.ticketUrl && (
                  <button
                    onClick={() => window.open(paymentResult.ticketUrl, '_blank')}
                    className="flex items-center justify-center gap-2 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-2xl transition-all"
                  >
                    <ExternalLink size={16} /> Abrir Link
                  </button>
                )}
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => setPaymentResult(null)}
                  className="text-xs font-bold text-[#009EE3] hover:underline py-1 transition-all"
                >
                  🔁 Gerar Nova Cobrança ou Alterar Valor
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
