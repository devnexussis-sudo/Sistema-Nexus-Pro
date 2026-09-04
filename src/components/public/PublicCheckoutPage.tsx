import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { DataService } from '../../services/dataService';
import { PaymentService, getMercadoPagoErrorMessage } from '../../services/paymentService';
import { 
  Building2, ShieldCheck, QrCode, CreditCard, ExternalLink, 
  Copy, CheckCircle2, RefreshCw, Loader2, AlertCircle, Phone, Mail, MapPin, Share2, DollarSign, Hexagon, Globe, Clock
} from 'lucide-react';
import { NexusBranding } from '../ui/NexusBranding';
import { initMercadoPago, Payment } from '@mercadopago/sdk-react';
import { supabase, publicSupabase } from '../../lib/supabase';

interface PublicCheckoutPageProps {
  typeProp?: 'order' | 'quote';
  idProp?: string;
}

// Componente isolado com React.memo para evitar remontagem do Brick durante re-renders do pai
const StablePaymentBrick = React.memo(({
  mpPublicKey: _mpPublicKey,
  amount,
  payerEmail,
  forcedInstallments,
  onSubmit,
  onError,
}: {
  mpPublicKey: string;
  amount: number;
  payerEmail: string;
  forcedInstallments?: number;
  onSubmit: (method: 'card_link', formData: any) => Promise<void>;
  onError: (e: any) => void;
}) => {
  const installments = forcedInstallments && forcedInstallments > 0 ? forcedInstallments : undefined;
  const validAmount = Math.max(0.5, Number(Number(amount || 0).toFixed(2)));
  const validEmail = payerEmail && payerEmail.includes('@') ? payerEmail : 'cliente@dunoup.com.br';

  return (
    <Payment
      initialization={{
        amount: validAmount,
        payer: { email: validEmail },
      }}
      customization={{
        paymentMethods: {
          creditCard: 'all',
          maxInstallments: installments || 12,
          minInstallments: 1,
        },
        visual: {
          defaultPaymentOption: {
            creditCardForm: true,
          },
        },
      }}
      onSubmit={async (formData) => {
        await onSubmit('card_link', formData);
      }}
      onError={(error) => {
        console.error('[MercadoPago Brick Error]', error);
        onError(error);
      }}
      onReady={() => {
        console.log('[MercadoPago Brick Ready] amount:', validAmount, 'installments:', installments);
      }}
    />
  );
});

export const PublicCheckoutPage: React.FC<PublicCheckoutPageProps> = ({ typeProp, idProp }) => {
  const params = useParams<{ type?: string; id?: string }>();
  
  // Suporte a HashRouter: busca no hash ou no pathname
  const fullPath = (typeof window !== 'undefined' ? (window.location.hash || window.location.pathname) : '').toLowerCase();
  
  const rawType = (typeProp || (params.id ? params.type : '') || '').toLowerCase();
  let itemType = 'ORDER';
  if (rawType === 'quote' || rawType === 'orcamento' || fullPath.includes('/quote/') || fullPath.includes('/view-quote/')) {
    itemType = 'QUOTE';
  } else if (rawType === 'invoice' || rawType === 'fatura' || fullPath.includes('/invoice/')) {
    itemType = 'INVOICE';
  } else if (rawType === 'order' || rawType === 'os' || fullPath.includes('/order/')) {
    itemType = 'ORDER';
  }

  const itemId = idProp || params.id || params.type || '';

  const [item, setItem] = useState<any>(null);
  const [tenant, setTenant] = useState<any>(null);
  const [mpPublicKey, setMpPublicKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Estados de Pagamento
  const [selectedMethod, setSelectedMethod] = useState<'pix' | 'card_link' | 'boleto' | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [paymentResult, setPaymentResult] = useState<{
    paymentId?: string;
    pixCopiaECola?: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    expiresAt?: string;
    methodType?: 'pix' | 'card_link' | 'boleto';
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isPaidConfirmed, setIsPaidConfirmed] = useState(false);

  let totalAmount = 0;
  let forcedMethod: 'pix' | 'card_link' | 'boleto' | null = null;
  let forcedInstallments: number | undefined = undefined;
  let forcedDueDate: string | undefined = undefined;

  if (item) {
    if (item.netTotal !== undefined && item.netTotal !== null && Number(item.netTotal) > 0) {
      totalAmount = Number(item.netTotal);
    } else {
      const itemsTotal = (item.items || []).reduce((acc: number, curr: any) => acc + (Number(curr.total) || (Number(curr.unitPrice || 0) * curr.quantity) || 0), 0);
      const fallbackTotal = Number(item.totalValue || item.total_value || item.value || (item.formData as any)?.totalValue || (item.formData as any)?.price || 0);
      let subtotal = itemsTotal > 0 ? itemsTotal : fallbackTotal;

      const fd = item.formData || item.form_data || {};
      const am = item.approvalMetadata || item.approval_metadata || {};

      const rawDiscount = Number(item.discount || item.discount_amount || item.discountAmount || fd.billingDiscount || am.billingDiscount || 0);
      const discType = item.discountType || fd.billingDiscountType || am.billingDiscountType || 'fixed';
      const discountVal = discType === 'percent' ? (subtotal * rawDiscount / 100) : rawDiscount;

      const shippingVal = Number(item.shipping || item.shipping_amount || item.shippingAmount || fd.billingShipping || am.billingShipping || 0);
      const additionsVal = Number(item.otherAdditions || item.other_additions_amount || item.otherAdditionsAmount || fd.billingOtherAdditions || am.billingOtherAdditions || 0);

      totalAmount = Math.max(0, subtotal - discountVal + shippingVal + additionsVal);
      if (totalAmount === 0 && fallbackTotal > 0) totalAmount = fallbackTotal;
    }

    const backendMethod = (item.paymentMethod || item.payment_method || '').toLowerCase();
    if (backendMethod.includes('pix')) forcedMethod = 'pix';
    else if (backendMethod.includes('boleto')) forcedMethod = 'boleto';
    else if (backendMethod.includes('cartão') || backendMethod.includes('cartao') || backendMethod.includes('credit') || backendMethod.includes('card')) forcedMethod = 'card_link';

    // Helper para extrair a quantidade máxima de parcelas permitidas
    const parseInstVal = (source: any): number | undefined => {
      if (!source) return undefined;
      let obj = source;
      if (typeof source === 'string') {
        try { obj = JSON.parse(source); } catch (e) { return undefined; }
      }
      if (!obj || typeof obj !== 'object') return undefined;
      const v = obj.mpInstallments || obj.installments || obj.max_installments || obj.maxInstallments;
      if (v && !isNaN(Number(v)) && Number(v) > 0) return Number(v);
      return undefined;
    };

    forcedInstallments = 
      parseInstVal(item.formData) || 
      parseInstVal(item.form_data) || 
      parseInstVal(item.approvalMetadata) || 
      parseInstVal(item.approval_metadata) || 
      parseInstVal(item.notes) ||
      (item.installments ? Number(item.installments) : undefined) ||
      (item.mpInstallments ? Number(item.mpInstallments) : undefined) ||
      (item.max_installments ? Number(item.max_installments) : undefined);

    const fd = item.formData || item.form_data || {};
    if (fd.mpDueDate) forcedDueDate = fd.mpDueDate;
    if (!forcedDueDate) {
      const am = item.approvalMetadata || item.approval_metadata;
      if (am?.mpDueDate) forcedDueDate = am.mpDueDate;
    }

    console.log('[Checkout Debug] Trava de Parcelamento (maxInstallments):', {
      forcedInstallments,
      itemTitle: item.displayId || item.id
    });
  }

  // 1. Carrega dados da O.S. / Orçamento e do Tenant
  useEffect(() => {
    let isMounted = true;
    const fetchOrderData = async () => {
      try {
        setLoading(true);
        setError(null);
        let fetchedData: any = null;

        if (!itemId) {
          throw new Error('Identificador do documento não fornecido na URL.');
        }

        // Busca no tipo primário detectado
        if (itemType === 'ORDER') {
          fetchedData = await DataService.getPublicOrderById(itemId);
        } else if (itemType === 'QUOTE') {
          fetchedData = await DataService.getPublicQuoteById(itemId);
        }

        // Fallback 1: Tenta Orçamento se não encontrou
        if (!fetchedData) {
          try {
            fetchedData = await DataService.getPublicQuoteById(itemId);
          } catch (e) {}
        }

        // Fallback 2: Tenta Ordem de Serviço se não encontrou
        if (!fetchedData) {
          try {
            fetchedData = await DataService.getPublicOrderById(itemId);
          } catch (e) {}
        }

        // Se achou uma OS ou Orçamento, verifica se ela possui uma Fatura (FAT) gerada com ajustes de valor (Desconto/Frete/Acréscimos)
        if (fetchedData && fetchedData.id) {
          try {
            const refType = itemType === 'QUOTE' ? 'QUOTE' : 'ORDER';
            const { data: invLink } = await publicSupabase
              .from('invoice_items')
              .select('invoice_id, invoices(*)')
              .eq('reference_type', refType)
              .eq('reference_id', fetchedData.id)
              .maybeSingle();

            if (invLink && invLink.invoices) {
              const inv = invLink.invoices as any;
              let parsedNotes: any = {};
              try { parsedNotes = JSON.parse(inv.notes || '{}'); } catch (e) {}

              const baseAmt = Number(inv.total_amount || 0);
              const discAmt = Number(inv.discount_amount || 0);
              const shipAmt = Number(inv.shipping_amount || 0);
              const addAmt = Number(inv.other_additions_amount || 0);
              const invNet = Math.max(0, baseAmt - discAmt + shipAmt + addAmt);

              fetchedData = {
                ...fetchedData,
                invoiceId: inv.id,
                displayId: inv.display_id || fetchedData.displayId,
                netTotal: invNet > 0 ? invNet : baseAmt,
                totalValue: invNet > 0 ? invNet : baseAmt,
                total_amount: baseAmt,
                discount_amount: discAmt,
                shipping_amount: shipAmt,
                other_additions_amount: addAmt,
                gatewayPaymentId: inv.gateway_payment_id || inv.payment_gateway_id || fetchedData.gatewayPaymentId,
                gatewayPixCode: inv.gateway_pix_code || parsedNotes.gateway_pix_code || fetchedData.gatewayPixCode,
                gatewayTicketUrl: inv.gateway_ticket_url || parsedNotes.gateway_ticket_url || fetchedData.gatewayTicketUrl,
                gatewayStatus: inv.gateway_status || fetchedData.gatewayStatus,
                paymentMethod: inv.payment_method || inv.paymentMethod || fetchedData.paymentMethod
              };
            }
          } catch (e) {
            console.warn('[PublicCheckoutPage] Erro ao buscar vínculo de fatura:', e);
          }
        }

        // Fallback 3: Tenta INVOICES diretamente (Faturas consolidadas)
        if (!fetchedData) {
          let invData: any = null;
          try {
            const res = await publicSupabase.from('invoices').select('*').or(`id.eq.${itemId},display_id.eq.${itemId}`).maybeSingle();
            invData = res.data;
          } catch (e) {}

          if (!invData) {
            try {
              const res = await supabase.from('invoices').select('*').or(`id.eq.${itemId},display_id.eq.${itemId}`).maybeSingle();
              invData = res.data;
            } catch (e) {}
          }

          if (invData) {
            let parsedNotes: any = {};
            try { parsedNotes = JSON.parse(invData.notes || '{}'); } catch (e) {}

            let refItems: any[] = [];
            try {
              const { data: invItems } = await publicSupabase.from('invoice_items').select('*').eq('invoice_id', invData.id);
              if (invItems && invItems.length > 0) {
                const orderIds = invItems.filter((i: any) => i.reference_type === 'ORDER').map((i: any) => i.reference_id);
                const quoteIds = invItems.filter((i: any) => i.reference_type === 'QUOTE').map((i: any) => i.reference_id);
                
                if (orderIds.length > 0) {
                  const { data: orders } = await publicSupabase.from('orders').select('*').in('id', orderIds);
                  if (orders) refItems = [...refItems, ...orders];
                }
                if (quoteIds.length > 0) {
                  const { data: quotes } = await publicSupabase.from('quotes').select('*').in('id', quoteIds);
                  if (quotes) refItems = [...refItems, ...quotes];
                }
              }
            } catch (e) {}

            let invInst = parsedNotes.mpInstallments || parsedNotes.installments || parsedNotes.max_installments || 0;
            if (!invInst && refItems.length > 0) {
              const firstWithInst = refItems.find(r => r.form_data?.installments || r.form_data?.mpInstallments || r.approval_metadata?.installments || r.approval_metadata?.mpInstallments);
              if (firstWithInst) {
                invInst = Number(firstWithInst.form_data?.installments || firstWithInst.form_data?.mpInstallments || firstWithInst.approval_metadata?.installments || firstWithInst.approval_metadata?.mpInstallments || 0);
              }
            }

            const baseAmt = Number(invData.total_amount || 0);
            const discAmt = Number(invData.discount_amount || 0);
            const shipAmt = Number(invData.shipping_amount || 0);
            const addAmt = Number(invData.other_additions_amount || 0);
            const invNet = Math.max(0, baseAmt - discAmt + shipAmt + addAmt);

            fetchedData = {
              id: invData.id,
              type: 'INVOICE',
              displayId: invData.display_id || invData.invoice_number || `FAT-${invData.id.slice(0, 6)}`,
              tenantId: invData.tenant_id,
              customerName: invData.customer_name || 'Cliente',
              customerDocument: invData.customer_document,
              customerEmail: invData.customer_email,
              netTotal: invNet > 0 ? invNet : baseAmt,
              totalValue: invNet > 0 ? invNet : baseAmt,
              total_amount: baseAmt,
              discount_amount: discAmt,
              shipping_amount: shipAmt,
              other_additions_amount: addAmt,
              billingStatus: invData.status === 'PAID' ? 'PAID' : 'PENDING',
              gatewayPaymentId: invData.gateway_payment_id || invData.payment_gateway_id,
              gatewayPixCode: invData.gateway_pix_code || parsedNotes.gateway_pix_code,
              gatewayTicketUrl: invData.gateway_ticket_url || parsedNotes.gateway_ticket_url,
              gatewayStatus: invData.gateway_status,
              paymentMethod: invData.payment_method || invData.paymentMethod,
              notes: invData.notes,
              formData: invData.form_data || { installments: invInst > 0 ? invInst : undefined, mpInstallments: invInst > 0 ? invInst : undefined }
            };
          }
        }

        if (!fetchedData) {
          throw new Error('Documento não encontrado ou link expirado.');
        }

        if (isMounted) {
          setItem(fetchedData);
          
          // Detecta o método de pagamento configurado no documento
          const fetchedBackendMethod = (fetchedData.paymentMethod || fetchedData.payment_method || '').toLowerCase();
          const isCardMethod = fetchedBackendMethod.includes('cartão') || fetchedBackendMethod.includes('cartao') || fetchedBackendMethod.includes('credit') || fetchedBackendMethod.includes('card');

          if (fetchedData.gatewayStatus === 'approved') {
            // Pagamento já aprovado — restaura normalmente
            setIsPaidConfirmed(true);
            if (fetchedData.gatewayPaymentId) {
              setPaymentResult({
                paymentId: fetchedData.gatewayPaymentId,
                pixCopiaECola: fetchedData.gatewayPixCode,
                ticketUrl: fetchedData.gatewayTicketUrl,
                methodType: isCardMethod ? 'card_link' : (fetchedData.gatewayPixCode ? 'pix' : 'boleto')
              });
            }
          } else if (isCardMethod) {
            // Cartão de Crédito pendente — SEMPRE mostra o Brick inline, ignora URLs antigas de redirect
            setSelectedMethod('card_link');
            // NÃO setamos paymentResult aqui para cartão, senão a UI acha que já foi pago e exibe a tela de "Aguardando Banco"
          } else if (fetchedData.gatewayPixCode || fetchedData.gatewayTicketUrl) {
            // Pix ou Boleto pendente — restaura dados existentes
            const hasPix = !!fetchedData.gatewayPixCode;
            setPaymentResult({
              paymentId: fetchedData.gatewayPaymentId,
              pixCopiaECola: fetchedData.gatewayPixCode,
              ticketUrl: fetchedData.gatewayTicketUrl,
              methodType: hasPix ? 'pix' : 'boleto'
            });
            setSelectedMethod(hasPix ? 'pix' : 'boleto');
          } else if (fetchedData.billingStatus === 'PAID') {
            setIsPaidConfirmed(true);
          }

          // Carrega dados do Tenant
          const tenantId = fetchedData.tenantId || fetchedData.tenant_id;
          if (tenantId) {
            const tenantData = await DataService.getTenantById(tenantId);
            if (isMounted) setTenant(tenantData);

            // Carrega a Public Key do MP para o Brick através da Edge Function segura
            const publicKey = await PaymentService.getMercadoPagoPublicKey(tenantId);
            if (publicKey && isMounted) {
              setMpPublicKey(publicKey);
              initMercadoPago(publicKey, { locale: 'pt-BR' });
            }
          }
        }

      } catch (err: any) {
        if (isMounted) {
          setError(err.message || 'Erro ao carregar dados para pagamento.');
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    if (itemId) fetchOrderData();

    return () => { isMounted = false; };
  }, [itemId, itemType]);

  // 2. Auto-geração do PIX ou Boleto assim que carrega se ainda não houver cobrança gerada
  useEffect(() => {
    if (item && !paymentResult && !isPaidConfirmed && !generating && !selectedMethod) {
      if (forcedMethod) {
        if (forcedMethod === 'card_link') {
          // Para cartão, apenas setamos o método para renderizar o formulário do Brick
          setSelectedMethod('card_link');
        } else {
          handleGenerateCharge(forcedMethod);
        }
      } else {
        handleGenerateCharge('pix');
      }
    }
  }, [item?.id, forcedMethod, paymentResult, isPaidConfirmed, generating, selectedMethod]);

  // 3. Listener Realtime (Event-driven): Substitui o antigo polling.
  // Fica aguardando silenciosamente o Webhook do servidor atualizar o banco de dados.
  useEffect(() => {
    if (selectedMethod === 'card_link' && !paymentResult?.paymentId) return;
    if (!paymentResult?.paymentId || isPaidConfirmed || !item) return;

    const table = itemType === 'ORDER' ? 'orders' : itemType === 'QUOTE' ? 'quotes' : 'invoices';
    
    const handleApproved = () => {
      setIsPaidConfirmed(true);
      try {
        const bc = new BroadcastChannel('nexus_payment_sync');
        bc.postMessage({ type: 'PAYMENT_APPROVED', itemId: item.id });
        bc.close();
      } catch (e) {}
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
      .channel(`public_checkout_status_${item.id}`)
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
  }, [paymentResult?.paymentId, isPaidConfirmed, item?.id, itemType]);

  const handleGenerateCharge = useCallback(async (method: 'pix' | 'card_link' | 'boleto', brickFormData?: any) => {
    if (!item) return;
    setGenerating(true);
    setError(null);
    if (!brickFormData) setSelectedMethod(method);

    try {
      const tenantId = item.tenantId || item.tenant_id;
      
      const actualBrickData = brickFormData?.formData || brickFormData;

      const res = await PaymentService.createMercadoPagoCharge({
        itemType,
        itemId: item.id,
        displayId: item.displayId || undefined,
        title: item.title || (itemType === 'ORDER' ? 'Ordem de Serviço' : 'Orçamento'),
        amount: totalAmount,
        customerName: item.customerName || item.customer_name || 'Cliente',
        customerEmail: actualBrickData?.payer?.email || item.customerEmail || item.customer_email,
        customerDocument: actualBrickData?.payer?.identification?.number || item.customerDocument || item.customer_document,
        paymentMethodType: (actualBrickData && actualBrickData.token) ? 'credit_card' : method,
        installments: actualBrickData?.installments || forcedInstallments,
        expiresAt: method === 'pix' ? new Date(Date.now() + 24*60*60*1000).toISOString() : forcedDueDate,
        tenantId,
        cardToken: actualBrickData?.token,
        issuerId: actualBrickData?.issuer_id,
        paymentMethodId: actualBrickData?.payment_method_id,
        payer: actualBrickData?.payer
      } as any);

      if (res.success) {
        const isApproved = res.status === 'approved' || res.status === 'PAID' || res.status === 'accredited';
        const isRejected = res.status === 'rejected';

        if (isApproved) {
          setIsPaidConfirmed(true);
        } else if (isRejected) {
          const friendlyMessage = getMercadoPagoErrorMessage(res.statusDetail || res.message || 'cc_rejected_other_reason');
          setError(friendlyMessage);
          setGenerating(false);
          return;
        }

        setPaymentResult({
          paymentId: res.paymentId,
          pixCopiaECola: res.pixCopiaECola,
          qrCodeBase64: res.qrCodeBase64,
          ticketUrl: res.ticketUrl,
          expiresAt: res.expiresAt,
          currentStatus: res.status,
          methodType: method
        });
      } else {
        const friendlyMessage = getMercadoPagoErrorMessage(res.message || (res as any).error);
        setError(friendlyMessage);
      }
    } catch (err: any) {
      console.error('[PublicCheckoutPage] Error generating charge:', err);
      const friendlyMessage = getMercadoPagoErrorMessage(err.message);
      setError(friendlyMessage);
    } finally {
      setGenerating(false);
    }
  }, [item, itemType, totalAmount, forcedInstallments, forcedDueDate]);

  // Callback estável para erros do Brick (não pode ser inline ou quebra React.memo)
  const handleBrickError = useCallback((_e: any) => {
    setError('Ocorreu um erro interno no formulário de pagamento. Recarregue a página.');
  }, []);

  const handleManualCheckStatus = async () => {
    if (!item) return;
    setIsVerifying(true);
    setError(null);
    try {
      const res = await PaymentService.checkPaymentStatus({
        itemType,
        itemId: item.id,
        gatewayPaymentId: paymentResult?.paymentId
      });

      if (res.isPaid || res.status === 'approved') {
        setIsPaidConfirmed(true);
      } else if (res.status === 'rejected') {
        setPaymentResult(null);
        const friendlyMessage = getMercadoPagoErrorMessage(res.statusDetail || 'cc_rejected_other_reason');
        setError(friendlyMessage);
      } else {
        setError('O pagamento ainda consta em análise pelo banco emissor. Caso a transação já tenha sido liberada no app do banco, aguarde alguns instantes e clique em verificar novamente.');
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao verificar o status do pagamento.');
    } finally {
      setIsVerifying(false);
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

  const companyName = tenant?.trading_name || tenant?.company_name || tenant?.name || 'DUNO';
  const tenantLogo = (tenant as any)?.logo_url || (tenant as any)?.logoUrl || (tenant as any)?.logo;
  const companyPhone = tenant?.phone || '';
  const companyEmail = tenant?.admin_email || tenant?.email || '';
  const companyDoc = tenant?.cnpj || tenant?.document || '';
  const companyWebsite = tenant?.website || '';
  
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

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f2f5f9] flex flex-col items-center justify-center text-slate-900 font-poppins p-4">
        <div className="w-16 h-16 rounded-2xl bg-white flex items-center justify-center shadow-md mb-4 border border-slate-200">
          <Loader2 size={32} className="animate-spin text-[#1c2d4f]" />
        </div>
        <p className="text-sm font-bold uppercase tracking-wider text-slate-500">Carregando Checkout Seguro...</p>
      </div>
    );
  }

  if (error && !item) {
    return (
      <div className="min-h-screen bg-[#f2f5f9] flex flex-col items-center justify-center text-slate-900 font-poppins p-4">
        <div className="bg-white border border-slate-200 p-8 rounded-3xl max-w-md w-full text-center space-y-4 shadow-xl">
          <AlertCircle size={48} className="text-rose-500 mx-auto" />
          <h2 className="text-xl font-bold text-slate-900 uppercase tracking-wide">Página Indisponível</h2>
          <p className="text-xs text-slate-500 leading-relaxed">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f2f5f9] font-poppins text-slate-900 flex flex-col selection:bg-[#1c2d4f] selection:text-white">
      
      {/* ── TOP ACCENT BAR ── */}
      <div className="h-1 w-full bg-gradient-to-r from-[#1c2d4f] via-[#3e5b99] to-[#1c2d4f]" />

      {/* ── STICKY HEADER ── */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-sm">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            {tenantLogo ? (
              <img src={tenantLogo} alt={companyName} className="h-10 sm:h-12 w-auto object-contain shrink-0" />
            ) : (
              <div className="w-10 h-10 bg-[#1c2d4f] rounded-xl flex items-center justify-center shrink-0">
                <Hexagon size={20} className="text-white fill-white/10" />
              </div>
            )}
            <div className="flex-1 min-w-0">
              <h1 className="text-sm sm:text-base font-bold text-slate-800 uppercase tracking-tight sm:truncate leading-none mb-1">{companyName}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                {companyDoc && (
                  <span className="text-xs text-slate-500 uppercase tracking-widest whitespace-nowrap flex items-center gap-1">
                    CNPJ: {companyDoc}
                  </span>
                )}
                {companyPhone && (
                  <span className="flex items-center gap-1 text-xs text-slate-500 uppercase tracking-widest whitespace-nowrap text-opacity-80">
                    <Phone size={9} className="text-[#3e5b99]" /> {companyPhone}
                  </span>
                )}
                {companyWebsite && (
                  <span className="flex items-center gap-1 text-xs text-slate-500 uppercase tracking-widest whitespace-nowrap text-opacity-80">
                    <Globe size={9} className="text-[#3e5b99]" /> {companyWebsite.replace(/^https?:\/\//, '')}
                  </span>
                )}
                {companyAddress && (
                  <span className="flex items-center gap-1 text-[10px] sm:text-xs text-slate-500 uppercase tracking-widest leading-tight">
                    <MapPin size={10} className="text-[#3e5b99] shrink-0" /> <span className="flex-1">{companyAddress}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            <span className="hidden sm:inline-flex bg-[#1c2d4f]/5 text-[#1c2d4f] text-[10px] font-extrabold px-3 py-1 rounded-full border border-[#1c2d4f]/10 uppercase tracking-widest">
              Área de Pagamento
            </span>
          </div>
        </div>
      </header>

      {/* ── CORPO PRINCIPAL DO CHECKOUT SISTEMA ── */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        
        {/* Banner do Documento e Cliente */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-[#1c2d4f]/5 rounded-full blur-3xl pointer-events-none" />
          
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 relative z-10">
            <div className="flex-1 space-y-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="bg-[#1c2d4f] text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    {itemType === 'ORDER' ? 'Ordem de Serviço' : 'Orçamento'} #{item.displayId || item.id.slice(0, 8)}
                  </span>
                  {isPaidConfirmed && (
                    <span className="bg-emerald-100 text-emerald-700 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border border-emerald-200 uppercase tracking-wider flex items-center gap-1">
                      <CheckCircle2 size={11} /> Pago
                    </span>
                  )}
                </div>
                
                <div className="space-y-1">
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-800 tracking-tight leading-none">
                    {item.customerName || item.customer_name || 'Cliente'}
                  </h2>
                  <p className="text-xs text-slate-500 font-medium">
                    {item.customerDocument || item.customer_document ? `Doc: ${item.customerDocument || item.customer_document}` : ''}
                  </p>
                </div>
              </div>

              {/* Informações detalhadas do pagador */}
              <div className="pt-3 border-t border-slate-100">
                <div>
                  <h4 className="text-[10px] text-slate-400 uppercase tracking-widest font-bold mb-1">Dados do Pagador</h4>
                  <div className="text-xs text-slate-600 space-y-0.5">
                    {item.customerEmail || item.customer_email ? <p className="truncate">Email: {item.customerEmail || item.customer_email}</p> : null}
                    {item.customerPhone || item.customer_phone ? <p>Tel: {item.customerPhone || item.customer_phone}</p> : null}
                    {item.customerAddress || item.customer_address ? (
                      <p className="line-clamp-2 text-[11px] mt-1 leading-tight text-slate-500">
                        End: {item.customerAddress || item.customer_address}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 text-left sm:text-right shrink-0 min-w-[200px]">
              <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block">
                Valor Total a Pagar
              </span>
              <span className="text-xl sm:text-2xl font-bold text-[#1c2d4f] tracking-tight block mt-1">
                R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>

        {/* ── CARD PRINCIPAL DE PAGAMENTO TRANSPARENTE ── */}
        <div className="bg-white text-slate-900 rounded-3xl p-5 sm:p-8 shadow-xl border border-slate-200 space-y-6 relative overflow-hidden">
          
          {/* Header Indicativo de Área de Pagamento */}
          <div className="flex items-center gap-2 pb-4 border-b border-slate-100 mb-6">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <DollarSign size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-800 uppercase tracking-tight">Área de Pagamento</h3>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Ambiente Seguro e Criptografado</p>
            </div>
          </div>
          
          {/* SE O PAGAMENTO JÁ FOI LIQUIDADO */}
          {isPaidConfirmed ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-20 h-20 bg-emerald-100 text-emerald-600 rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/20 animate-bounce-short">
                <CheckCircle2 size={48} />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-slate-800 tracking-tight">Pagamento Aprovado com Sucesso!</h3>
                <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto leading-relaxed">
                  A transação foi confirmada e conciliada no sistema da empresa. Agradecemos a preferência!
                </p>
              </div>

              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl max-w-md mx-auto text-left space-y-1 text-xs text-emerald-900">
                <div className="flex justify-between font-bold">
                  <span>Status:</span>
                  <span className="text-emerald-700">🟢 Liquidado</span>
                </div>
                <div className="flex justify-between">
                  <span>Documento:</span>
                  <span>#{item.displayId || item.id.slice(0, 8)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Valor:</span>
                  <span>R$ {totalAmount.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
            </div>
          ) : (
            /* SE O PAGAMENTO ESTÁ PENDENTE */
            <div className="space-y-6">
              
              {/* Seleção do Meio de Pagamento (Removido por ser automático via backend) */}

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs p-3.5 rounded-2xl font-medium flex items-center gap-2.5">
                  <AlertCircle size={16} className="text-rose-600 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {generating ? (
                <div className="p-8 text-center space-y-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <Loader2 size={32} className="animate-spin text-emerald-600 mx-auto" />
                  <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">Gerando chave de pagamento nativa...</p>
                </div>
              ) : (paymentResult || selectedMethod === 'card_link') ? (
                <div className="space-y-6">
                  
                  {/* ── Descrição da Cobrança (Movida) ── */}
                  <div className="bg-slate-50 border border-slate-200 rounded-3xl p-5 sm:p-6 w-full text-left space-y-4 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#1c2d4f]/5 rounded-full blur-2xl pointer-events-none" />
                    
                    <h4 className="text-[10px] text-slate-400 uppercase tracking-widest font-bold">Descrição da Cobrança</h4>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-slate-800 uppercase text-sm sm:text-base tracking-tight">
                          #{item.displayId || item.id.slice(0, 8)}
                        </p>
                      </div>
                      {itemType !== 'INVOICE' && (
                        <a 
                          href={`#/${itemType === 'ORDER' ? 'order/view' : 'view-quote'}/${item.id}`} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center shrink-0 gap-2 text-[10px] font-bold uppercase tracking-widest text-[#1c2d4f] bg-white hover:bg-slate-100 px-4 py-2.5 rounded-xl border border-slate-200 shadow-sm transition-colors active:scale-95"
                        >
                          <ExternalLink size={14} />
                          Acessar Documento
                        </a>
                      )}
                    </div>
                  </div>
                  
                  {/* ⚡ VISUALIZAÇÃO DO PIX INSTANTÂNEO */}
                  {selectedMethod === 'pix' && paymentResult && (paymentResult.pixCopiaECola || paymentResult.qrCodeBase64) && (
                    <div className="space-y-5 text-center">
                      
                      {/* Box QR Code */}
                      <div className="bg-slate-50 p-6 rounded-3xl border border-slate-200 inline-block shadow-inner">
                        <img 
                          src={
                            paymentResult.qrCodeBase64 
                              ? `data:image/png;base64,${paymentResult.qrCodeBase64}` 
                              : `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(paymentResult.pixCopiaECola || paymentResult.ticketUrl || 'https://mercadopago.com.br')}`
                          } 
                          alt="QR Code Pix" 
                          className="w-56 h-56 sm:w-64 sm:h-64 object-contain mx-auto rounded-2xl shadow-md border border-white"
                        />
                        <span className="text-xs font-bold text-slate-700 block mt-3">
                          Abra o app do seu banco e escolha "Pagar com QR Code"
                        </span>
                      </div>

                      {/* Box PIX Copia e Cola */}
                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2 max-w-lg mx-auto">
                        <div className="flex items-center justify-between">
                          <label className="text-[10px] font-extrabold text-slate-500 uppercase tracking-widest block">
                            Ou Copie a Chave PIX:
                          </label>
                          <span className="text-[9px] text-emerald-700 font-extrabold bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                            ⚡ Liquidação Instantânea
                          </span>
                        </div>

                        <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200">
                          <input
                            readOnly
                            value={paymentResult?.pixCopiaECola || ''}
                            className="text-xs font-mono text-slate-800 bg-transparent flex-1 outline-none truncate"
                          />
                          <button
                            onClick={handleCopyPix}
                            className="px-4 py-2 bg-slate-950 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 active:scale-95 shadow-sm cursor-pointer"
                          >
                            {copied ? <CheckCircle2 size={14} className="text-emerald-400" /> : <Copy size={14} />}
                            {copied ? 'Copiado!' : 'Copiar Chave'}
                          </button>
                        </div>
                      </div>

                      {/* Bar de polling removida (Verificação totalmente silenciosa no background) */}

                    </div>
                  )}

                  {/* 💳 VISUALIZAÇÃO DE CARTÃO TRANSPARENTE (BRICK) */}
                  {selectedMethod === 'card_link' && (
                    <div className="bg-white border border-slate-200 rounded-3xl p-2 sm:p-4 space-y-4 max-w-lg mx-auto shadow-sm relative min-h-[350px]">
                      {(!mpPublicKey || generating || isVerifying) && (
                        <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-10 flex flex-col items-center justify-center rounded-3xl p-4 text-center space-y-2">
                          <Loader2 size={32} className="animate-spin text-sky-600 mx-auto" />
                          <span className="text-xs font-bold text-sky-900">
                            {generating ? 'Processando autorização com a operadora do cartão...' : 
                             isVerifying ? 'Verificando status do pagamento com o banco...' :
                             'Carregando ambiente seguro de pagamento...'}
                          </span>
                        </div>
                      )}
                      
                      {/* CARD INTERATIVO DE STATUS EM ANÁLISE (SE RETORNADO PELO MP) */}
                      {paymentResult?.currentStatus === 'in_process' && (
                        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-left space-y-3 shadow-sm">
                          <div className="flex items-center gap-2">
                            <Clock size={18} className="text-amber-600 shrink-0 animate-pulse" />
                            <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wide">
                              Pagamento em Análise de Segurança
                            </h4>
                          </div>
                          <p className="text-xs text-amber-800 leading-relaxed">
                            O Mercado Pago e o banco emissor estão validando o pagamento. Isso costuma levar apenas alguns instantes. Assim que aprovado, seu comprovante será exibido aqui.
                          </p>
                          <div className="pt-2 flex flex-col sm:flex-row items-center gap-2">
                            <button
                              onClick={handleManualCheckStatus}
                              disabled={isVerifying}
                              className="w-full sm:w-auto px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 active:scale-95 shadow-sm cursor-pointer"
                            >
                              {isVerifying ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                              Verificar Status Novamente
                            </button>
                            <button
                              onClick={() => { setPaymentResult(null); setError(null); }}
                              className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all text-center cursor-pointer"
                            >
                              Tentar Outro Cartão / Meio
                            </button>
                          </div>
                        </div>
                      )}

                      {mpPublicKey && totalAmount > 0 && (!paymentResult || paymentResult?.currentStatus !== 'in_process') && (
                        <StablePaymentBrick
                          mpPublicKey={mpPublicKey}
                          amount={totalAmount}
                          payerEmail={item.customerEmail || item.customer_email || ''}
                          forcedInstallments={forcedInstallments}
                          onSubmit={handleGenerateCharge}
                          onError={handleBrickError}
                        />
                      )}
                    </div>
                  )}

                  {/* 📄 VISUALIZAÇÃO DE BOLETO */}
                  {selectedMethod === 'boleto' && paymentResult && (
                    <div className="bg-amber-50 border border-amber-200 rounded-3xl p-6 text-center space-y-4 max-w-lg mx-auto">
                      <div className="w-14 h-14 rounded-2xl bg-amber-500/10 text-amber-600 flex items-center justify-center mx-auto">
                        <ExternalLink size={32} />
                      </div>
                      <div>
                        <h4 className="font-extrabold text-slate-900 text-base">Boleto Bancário Registrado</h4>
                        <p className="text-xs text-slate-600 mt-1">Clique para abrir ou imprimir seu boleto oficial.</p>
                      </div>

                      {paymentResult?.ticketUrl && (
                        <button
                          onClick={() => window.open(paymentResult.ticketUrl, '_blank')}
                          className="w-full py-3.5 bg-amber-600 hover:bg-amber-500 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 active:scale-95"
                        >
                          <ExternalLink size={18} /> Visualizar e Imprimir Boleto Bancário
                        </button>
                      )}
                    </div>
                  )}

                </div>
              ) : null}

            </div>
          )}

        </div>

      </main>

      {/* ── FOOTER NEXUS (DISCRETO) ── */}
      <footer className="mt-8 border-t border-slate-200 bg-[#f2f5f9] mt-auto">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-8 py-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <NexusBranding size="lg" variant="dark" className="opacity-80 transform scale-[0.55] sm:scale-[0.7] origin-left" />
          </div>
          <div className="text-center sm:text-right space-y-0.5">
            <p className="text-xs text-slate-400 uppercase tracking-[0.2em] font-semibold">Uma solução DUNO</p>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-medium">
              Autenticidade garantida pela plataforma
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
};
