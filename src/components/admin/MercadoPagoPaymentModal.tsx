import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PaymentService } from '../../services/paymentService';
import { supabase } from '../../lib/supabase';
import { 
  X, CreditCard, QrCode, Copy, CheckCircle2, 
  ExternalLink, Share2, Loader2, ShieldCheck, RefreshCw,
  Building2, AlertCircle, ArrowRight, ChevronDown
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
  const [loadingMethod, setLoadingMethod] = useState<'pix' | 'card_link' | 'boleto' | null>(null);
  const [selectedMethod, setSelectedMethod] = useState<'pix' | 'card_link' | 'boleto' | null>(null);

  // Estado para limite máximo de parcelamento no Cartão
  const [cardInstallments, setCardInstallments] = useState<number>(12);
  const [showCardOptions, setShowCardOptions] = useState<boolean>(false);
  
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

  const finalAmount = Math.max(0, Number(item?.value || 0));

  // Carrega cobrança existente se já houver
  useEffect(() => {
    if (item) {
      setError(null);
      setLoading(false);
      setShowCardOptions(false);

      if (item.gatewayPixCode || item.gatewayTicketUrl) {
        const method: 'pix' | 'card_link' | 'boleto' = item.gatewayPixCode ? 'pix' : 'card_link';
        setSelectedMethod(method);
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
        setSelectedMethod(null);
        setIsPaidConfirmed(false);
      }
    }
  }, [item?.id, item?.value, item?.gatewayPixCode, item?.gatewayTicketUrl, item?.billingStatus]);

  // Listener Realtime (Event-driven): Substitui o antigo polling.
  useEffect(() => {
    if (!isOpen || !item?.id || isPaidConfirmed || !paymentResult?.paymentId) return;

    const table = item.type === 'ORDER' ? 'orders' : item.type === 'QUOTE' ? 'quotes' : 'invoices';

    const handleApproved = () => {
      setIsPaidConfirmed(true);
      if (onSuccess) onSuccess();
    };

    const channel1 = supabase
      .channel(`checkout_status_${item.id}`)
      .on('postgres_changes', { 
        event: 'UPDATE', 
        schema: 'public', 
        table: table,
        filter: `id=eq.${item.id}`
      }, (payload) => {
        const newData = payload.new as any;
        if (newData.billing_status === 'PAID' || newData.status === 'PAID' || newData.gateway_status === 'approved') {
          handleApproved();
        }
      })
      .on('broadcast', { event: 'PAYMENT_APPROVED' }, (payload) => {
        if (payload.payload?.status === 'PAID') {
          handleApproved();
        }
      })
      .subscribe();

    const channel2 = supabase
      .channel(`modal_checkout_status_${item.id}`)
      .on('broadcast', { event: 'PAYMENT_APPROVED' }, (payload) => {
        if (payload.payload?.status === 'PAID') {
          handleApproved();
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel1);
      supabase.removeChannel(channel2);
    };
  }, [isOpen, item?.id, item?.type, paymentResult?.paymentId, isPaidConfirmed, onSuccess]);

  // Gera a cobrança no Mercado Pago para o tipo selecionado
  const handleSelectAndGenerateCharge = async (method: 'pix' | 'card_link' | 'boleto', installmentsCount?: number) => {
    if (finalAmount <= 0) {
      setError('Por favor informe um valor válido maior que R$ 0,00.');
      return;
    }

    setLoading(true);
    setLoadingMethod(method);
    setSelectedMethod(method);
    setError(null);

    try {
      const itemTenantId = (item as any)?.tenantId || (item as any)?.tenant_id || (item as any)?.original?.tenantId || (item as any)?.original?.tenant_id;
      const chosenInstallments = method === 'card_link' ? (installmentsCount || cardInstallments || 12) : undefined;

      const res = await PaymentService.createMercadoPagoCharge({
        itemType: item.type,
        itemId: item.id,
        displayId: item.displayId || undefined,
        title: item.title || (item.type === 'ORDER' ? 'Ordem de Serviço' : 'Orçamento'),
        amount: finalAmount,
        customerName: item.customerName,
        customerEmail: item.customerEmail,
        customerDocument: item.customerDocument,
        paymentMethodType: method,
        installments: chosenInstallments,
        tenantId: itemTenantId
      });

      if (res.success) {
        setPaymentResult({
          paymentId: res.paymentId,
          pixCopiaECola: res.pixCopiaECola,
          qrCodeBase64: res.qrCodeBase64,
          ticketUrl: res.ticketUrl,
          expiresAt: res.expiresAt,
          methodType: method
        });
        if (onSuccess) onSuccess();
      } else {
        setError(res.message || 'Erro ao gerar cobrança para este tipo de pagamento.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro de comunicação ao gerar cobrança.');
    } finally {
      setLoading(false);
      setLoadingMethod(null);
    }
  };

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
        setError('O pagamento ainda consta como pendente no gateway. Assim que o pagamento for realizado, o sistema baixará automaticamente.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao verificar status do pagamento.');
    } finally {
      setIsVerifying(false);
    }
  };

  const systemCheckoutUrl = `${window.location.origin}/#/checkout/${item?.type?.toLowerCase() || 'order'}/${item?.id}`;

  const handleCopyCheckoutLink = () => {
    const textToCopy = paymentResult?.pixCopiaECola || systemCheckoutUrl;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const handleOpenCheckout = () => {
    window.open(systemCheckoutUrl, '_blank');
  };

  const handleSendWhatsApp = () => {
    const rawPhone = (item as any)?.customerPhone || (item as any)?.customer_phone || (item.original as any)?.customerPhone || (item.original as any)?.customer_phone || (item.original as any)?.phone || '';
    const cleanPhone = String(rawPhone).replace(/\D/g, '');
    const phoneParam = cleanPhone.length >= 10 ? (cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`) : '';
    
    const formattedAmount = finalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const methodDescription = selectedMethod === 'pix' ? 'Pix Instantâneo' : selectedMethod === 'boleto' ? 'Boleto Bancário' : `Cartão de Crédito (em até ${cardInstallments}x)`;

    const text = encodeURIComponent(
      `🏢 *${companyName.toUpperCase()}*\n` +
      `📌 *Cobrança Oficial • ${item.type === 'ORDER' ? 'Ordem de Serviço' : (item.type === 'INVOICE' ? 'Fatura' : 'Orçamento')} #${item.displayId || item.id.slice(0, 8)}*\n\n` +
      `Olá, *${item.customerName}*!\n\n` +
      `Segue o link oficial para efetuar o pagamento via *${methodDescription}* no valor de *R$ ${formattedAmount}*:\n\n` +
      `🔗 *Link do Checkout Seguro:*\n${systemCheckoutUrl}\n\n` +
      (paymentResult?.pixCopiaECola ? `⚡ *Chave PIX Copia e Cola:*\n\`${paymentResult.pixCopiaECola}\`\n\n` : '') +
      `🔒 _Pagamento processado com segurança por ${companyName}_\n` +
      `Qualquer dúvida, estamos à inteira disposição!`
    );

    const waUrl = phoneParam ? `https://wa.me/${phoneParam}?text=${text}` : `https://wa.me/?text=${text}`;
    window.open(waUrl, '_blank');
  };

  if (!isOpen || !item) return null;
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-fade-in font-poppins overflow-hidden">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden border border-slate-200/90 flex flex-col my-auto transition-all animate-scale-up">
        
        {/* HEADER */}
        <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 text-white px-5 py-4 flex items-center justify-between relative overflow-hidden border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3.5 relative z-10 min-w-0">
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
                <h3 className="font-bold text-sm text-white tracking-tight truncate">
                  {companyName}
                </h3>
                <span className="bg-emerald-500/20 text-emerald-400 text-[9px] font-extrabold px-2 py-0.5 rounded-full border border-emerald-500/30 uppercase tracking-widest flex items-center gap-1 shrink-0">
                  <ShieldCheck size={10} /> Faturamento Nativo
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate mt-0.5">
                {item.type === 'ORDER' ? 'O.S.' : 'Orçamento'} #{item.displayId || item.id.slice(0, 8)} • {item.customerName}
              </p>
            </div>
          </div>

          <button 
            onClick={onClose} 
            className="p-2 text-slate-400 hover:text-white transition-colors rounded-xl hover:bg-white/10 shrink-0 ml-2"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>

        {/* BODY */}
        <div className="p-5 space-y-4 bg-slate-50/60 max-h-[82vh] overflow-y-auto custom-scrollbar">
          
          {/* SE PAGO */}
          {(isPaidConfirmed || (item as any).billingStatus === 'PAID' || item.gatewayStatus === 'approved') ? (
            <div className="bg-gradient-to-br from-emerald-500 to-teal-600 text-white rounded-3xl p-6 shadow-xl border border-emerald-400/30 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center mx-auto text-white shadow-inner">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <h4 className="font-extrabold text-base uppercase tracking-wider text-white">Pagamento Confirmado!</h4>
                <p className="text-xs text-emerald-100 mt-1 leading-relaxed">
                  Esta cobrança já foi devidamente paga e conciliada no sistema.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-4">

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3 rounded-2xl font-medium flex items-center gap-2.5">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span className="flex-1">{error}</span>
                </div>
              )}

              {/* CARD RESUMO DO VALOR */}
              <div className="bg-white border border-slate-200/90 rounded-2xl p-4 shadow-sm flex items-center justify-between gap-4">
                <div>
                  <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Total a Faturar</span>
                  <span className="text-xs text-slate-500 font-semibold truncate block">
                    Cliente: {item.customerName}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-2xl font-black text-slate-900 tracking-tight">
                    R$ {finalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>

              {/* ETAPA 1: SELECIONAR FORMA DE PAGAMENTO SE AINDA NÃO GEROU */}
              {!paymentResult ? (
                <div className="space-y-2.5 pt-1">
                  <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Selecione o Tipo de Pagamento para Faturar:
                  </label>

                  {/* Opção 1: PIX Instantâneo */}
                  <button
                    type="button"
                    onClick={() => handleSelectAndGenerateCharge('pix')}
                    disabled={loading}
                    className="w-full p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-emerald-500 hover:bg-emerald-50/30 transition-all group text-left flex items-center gap-3.5 relative overflow-hidden shadow-xs cursor-pointer active:scale-98"
                  >
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      {loadingMethod === 'pix' ? <Loader2 size={22} className="animate-spin text-emerald-600" /> : <QrCode size={22} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm text-slate-900 block leading-tight">PIX Instantâneo</span>
                        <span className="bg-emerald-100 text-emerald-700 font-bold text-[9px] px-2 py-0.5 rounded-full border border-emerald-200 uppercase tracking-wider">
                          ⚡ Implicado na Hora
                        </span>
                      </div>
                      <span className="text-[11px] text-slate-500 leading-tight block mt-1">
                        Gera QR Code + Copia e Cola imediato no checkout
                      </span>
                    </div>
                    <ArrowRight size={18} className="text-slate-300 group-hover:text-emerald-600 transition-all shrink-0" />
                  </button>

                  {/* Opção 2: Cartão de Crédito com Seletor de Limite de Parcelas */}
                  <div className="bg-white rounded-2xl border-2 border-slate-200 overflow-hidden transition-all shadow-xs">
                    <button
                      type="button"
                      onClick={() => setShowCardOptions(!showCardOptions)}
                      disabled={loading}
                      className="w-full p-4 group text-left flex items-center gap-3.5 relative hover:bg-sky-50/30 transition-colors cursor-pointer"
                    >
                      <div className="w-11 h-11 rounded-xl bg-sky-500/10 text-sky-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        {loadingMethod === 'card_link' ? <Loader2 size={22} className="animate-spin text-sky-600" /> : <CreditCard size={22} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-extrabold text-sm text-slate-900 block leading-tight">Cartão de Crédito</span>
                          <span className="bg-sky-100 text-sky-700 font-bold text-[9px] px-2 py-0.5 rounded-full border border-sky-200 uppercase tracking-wider">
                            Até {cardInstallments}x
                          </span>
                        </div>
                        <span className="text-[11px] text-slate-500 leading-tight block mt-1">
                          Definir limite máximo de parcelas (1x a 12x)
                        </span>
                      </div>
                      <ChevronDown size={18} className={`text-slate-400 transition-transform ${showCardOptions ? 'rotate-180 text-sky-600' : ''}`} />
                    </button>

                    {/* Expansor de Seleção de Limite de Parcelamento */}
                    {showCardOptions && (
                      <div className="p-4 bg-sky-50/60 border-t border-slate-200/80 space-y-3 animate-fade-in">
                        <div>
                          <label className="text-[10px] font-extrabold uppercase text-slate-600 block mb-1">
                            Limite Máximo de Parcelas (Trava no Mercado Pago):
                          </label>
                          <select
                            value={cardInstallments}
                            onChange={e => setCardInstallments(Number(e.target.value))}
                            className="w-full px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-900 outline-none focus:border-sky-500 shadow-sm"
                          >
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => (
                              <option key={n} value={n}>
                                {n}x {n === 1 ? '(À vista)' : `de R$ ${(finalAmount / n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`} {n === 12 ? '(Máximo)' : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleSelectAndGenerateCharge('card_link', cardInstallments)}
                          disabled={loading}
                          className="w-full py-3 bg-sky-600 hover:bg-sky-500 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                        >
                          {loadingMethod === 'card_link' ? <Loader2 size={16} className="animate-spin" /> : <CreditCard size={16} />}
                          {loadingMethod === 'card_link' ? 'Gerando Cobrança...' : `Gerar Cobrança de Cartão (Até ${cardInstallments}x)`}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Opção 3: Boleto Bancário */}
                  <button
                    type="button"
                    onClick={() => handleSelectAndGenerateCharge('boleto')}
                    disabled={loading}
                    className="w-full p-4 rounded-2xl border-2 border-slate-200 bg-white hover:border-amber-500 hover:bg-amber-50/30 transition-all group text-left flex items-center gap-3.5 relative overflow-hidden shadow-xs cursor-pointer active:scale-98"
                  >
                    <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                      {loadingMethod === 'boleto' ? <Loader2 size={22} className="animate-spin text-amber-600" /> : <ExternalLink size={22} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-extrabold text-sm text-slate-900 block leading-tight">Boleto Bancário</span>
                      <span className="text-[11px] text-slate-500 leading-tight block mt-1">
                        Boleto registrado oficial com linha digitável
                      </span>
                    </div>
                    <ArrowRight size={18} className="text-slate-300 group-hover:text-amber-600 transition-all shrink-0" />
                  </button>

                  {loading && (
                    <div className="flex items-center justify-center gap-2.5 text-xs font-extrabold text-slate-800 py-3 bg-white rounded-2xl border border-slate-200 shadow-sm animate-pulse mt-2">
                      <Loader2 size={16} className="animate-spin text-emerald-600" /> 
                      Gerando cobrança para {selectedMethod === 'pix' ? 'PIX' : selectedMethod === 'boleto' ? 'Boleto' : `Cartão (${cardInstallments}x)`}...
                    </div>
                  )}
                </div>
              ) : (
                /* ETAPA 2: COBRANÇA GERADA — APRESENTA APENAS AS AÇÕES OFICIAIS DO CHECKOUT DO SISTEMA */
                <div className="space-y-4 animate-fade-in">
                  
                  {/* Banner da Forma Selecionada */}
                  <div className="flex items-center justify-between bg-slate-900 text-white p-3 rounded-2xl">
                    <div className="flex items-center gap-2 text-xs font-bold">
                      {selectedMethod === 'pix' && <><QrCode size={16} className="text-emerald-400" /> Cobrança em PIX Instantâneo</>}
                      {selectedMethod === 'card_link' && <><CreditCard size={16} className="text-sky-400" /> Cobrança em Cartão de Crédito (Até {cardInstallments}x)</>}
                      {selectedMethod === 'boleto' && <><ExternalLink size={16} className="text-amber-400" /> Cobrança em Boleto Bancário</>}
                    </div>
                    <button
                      type="button"
                      onClick={() => setPaymentResult(null)}
                      className="text-[10px] text-slate-300 hover:text-white underline font-semibold cursor-pointer"
                    >
                      Alterar Método
                    </button>
                  </div>

                  {/* As 3 Ações Diretas do Checkout */}
                  <div className="space-y-2.5">
                    {/* Botão 1: Copiar Link do Checkout */}
                    <button
                      type="button"
                      onClick={handleCopyCheckoutLink}
                      className="w-full p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-slate-400 transition-all flex items-center gap-3 shadow-xs cursor-pointer active:scale-98"
                    >
                      <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                        {copied ? <CheckCircle2 size={20} className="text-emerald-600" /> : <Copy size={20} />}
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <span className="font-extrabold text-xs text-slate-900 block leading-tight">
                          {copied ? 'Link Copiado com Sucesso!' : 'Copiar Link do Checkout'}
                        </span>
                        <span className="text-[10px] text-slate-400 truncate block mt-0.5 font-mono">
                          {paymentResult.pixCopiaECola ? 'Chave PIX Copia e Cola / URL' : systemCheckoutUrl}
                        </span>
                      </div>
                    </button>

                    {/* Botão 2: Abrir Checkout Padrão no Navegador */}
                    <button
                      type="button"
                      onClick={handleOpenCheckout}
                      className="w-full p-3.5 rounded-2xl border border-sky-200 bg-sky-50/50 hover:bg-sky-50 hover:border-sky-400 transition-all flex items-center gap-3 shadow-xs cursor-pointer active:scale-98"
                    >
                      <div className="w-10 h-10 rounded-xl bg-sky-600 text-white flex items-center justify-center shrink-0">
                        <ExternalLink size={20} />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <span className="font-extrabold text-xs text-sky-950 block leading-tight">
                          Abrir Checkout Padrão do Sistema
                        </span>
                        <span className="text-[10px] text-sky-700 block mt-0.5">
                          Visualizar tela oficial com {selectedMethod === 'pix' ? 'QR Code Pix' : selectedMethod === 'boleto' ? 'Boleto' : `Cartão em até ${cardInstallments}x`}
                        </span>
                      </div>
                    </button>

                    {/* Botão 3: Enviar via WhatsApp */}
                    <button
                      type="button"
                      onClick={handleSendWhatsApp}
                      className="w-full p-3.5 rounded-2xl border border-emerald-200 bg-emerald-50/50 hover:bg-emerald-50 hover:border-emerald-400 transition-all flex items-center gap-3 shadow-xs cursor-pointer active:scale-98"
                    >
                      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                        <Share2 size={20} />
                      </div>
                      <div className="flex-1 text-left min-w-0">
                        <span className="font-extrabold text-xs text-emerald-950 block leading-tight">
                          Enviar Cobrança via WhatsApp
                        </span>
                        <span className="text-[10px] text-emerald-700 block mt-0.5">
                          Envia mensagem formatada com a URL do checkout
                        </span>
                      </div>
                    </button>
                  </div>

                  {/* QR Code Pix Exibido na Tela se for PIX */}
                  {selectedMethod === 'pix' && paymentResult.pixCopiaECola && (
                    <div className="bg-white p-4 rounded-2xl border border-slate-200 space-y-2 text-center mt-3">
                      <span className="text-[10px] font-extrabold uppercase text-slate-400 tracking-wider block">
                        QR Code PIX Nativo
                      </span>
                      <img 
                        src={
                          paymentResult.qrCodeBase64 
                            ? `data:image/png;base64,${paymentResult.qrCodeBase64}` 
                            : `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(paymentResult.pixCopiaECola)}`
                        } 
                        alt="QR Code Pix" 
                        className="w-44 h-44 object-contain mx-auto rounded-xl border border-slate-100 shadow-sm"
                      />
                    </div>
                  )}

                  {/* Checar Liquidação */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={handleManualCheckStatus}
                      disabled={isVerifying}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs transition-all shadow-sm flex items-center justify-center gap-2 cursor-pointer active:scale-98"
                    >
                      {isVerifying ? <Loader2 size={15} className="animate-spin text-emerald-400" /> : <RefreshCw size={15} className="text-emerald-400" />}
                      {isVerifying ? 'Verificando Liquidação...' : 'Checar Status do Pagamento (Tempo Real)'}
                    </button>
                  </div>

                </div>
              )}

            </div>
          )}

        </div>

        {/* FOOTER */}
        <div className="px-5 py-3 bg-slate-100/80 border-t border-slate-200/80 text-center text-[10px] text-slate-400 font-medium">
          Sistema {companyName} • Checkout Seguro com Criptografia SSL
        </div>

      </div>
    </div>,
    document.body
  );
};
