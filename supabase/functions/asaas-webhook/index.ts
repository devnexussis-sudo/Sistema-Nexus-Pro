import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const event = body.event;
    const payment = body.payment;
    const invoiceNfse = body.invoice;

    console.log(`[Asaas Webhook NASA-Log] 📥 Evento recebido: ${event}`);

    if (!event) {
      return new Response(JSON.stringify({ message: 'Payload inválido: evento ausente' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    // =========================================================================
    // 🚀 HANDLER 1: NFS-E WEBHOOK EVENTS FROM ASAAS (INVOICE_AUTHORIZED, etc.)
    // =========================================================================
    if (invoiceNfse || (event && event.startsWith('INVOICE_'))) {
      const nfObj = invoiceNfse || {};
      const asaasNfseId = nfObj.id;
      const externalReference = nfObj.externalReference;
      const nfStatus = nfObj.status || event.replace('INVOICE_', '');

      console.log(`[Asaas Webhook NFS-e] 🧾 Evento: ${event}, ID Asaas: ${asaasNfseId}, Status: ${nfStatus}, ExtRef: ${externalReference}`);

      let nfseRecord = null;
      if (asaasNfseId) {
        const { data: rec1 } = await supabase.from('invoice_nfse').select('*').eq('asaas_nfse_id', asaasNfseId).maybeSingle();
        if (rec1) nfseRecord = rec1;
      }
      if (!nfseRecord && externalReference) {
        const { data: rec2 } = await supabase.from('invoice_nfse').select('*').eq('invoice_id', externalReference).maybeSingle();
        if (rec2) nfseRecord = rec2;
      }

      if (nfseRecord) {
        const updateData: any = {
          status: nfStatus,
          updated_at: new Date().toISOString()
        };
        if (nfObj.number) updateData.nfse_number = nfObj.number;
        if (nfObj.pdfUrl) updateData.pdf_url = nfObj.pdfUrl;
        if (nfObj.xmlUrl) updateData.xml_url = nfObj.xmlUrl;
        if (nfObj.invoiceUrl) updateData.invoice_url = nfObj.invoiceUrl;
        if (nfObj.observations && (nfStatus === 'ERROR' || nfStatus === 'CANCELLATION_DENIED')) {
          updateData.error_message = nfObj.observations;
        }

        await supabase.from('invoice_nfse').update(updateData).eq('id', nfseRecord.id);

        // 🛰️ Broadcast Realtime Push
        if (nfseRecord.tenant_id) {
          const ch = supabase.channel(`nexus-realtime-${nfseRecord.tenant_id}`);
          ch.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              ch.send({
                type: 'broadcast',
                event: 'INVOICE_UPDATED',
                payload: { invoiceId: nfseRecord.invoice_id, type: 'NFSE', status: nfStatus }
              }).then(() => {
                supabase.removeChannel(ch);
              });
            }
          });
        }

        return new Response(JSON.stringify({ success: true, type: 'INVOICE_NFSE', id: nfseRecord.id, status: nfStatus }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
        });
      }

      return new Response(JSON.stringify({ success: true, message: 'NFS-e não encontrada no banco local' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
      });
    }

    // =========================================================================
    // 🚀 HANDLER 2: PAYMENT WEBHOOK EVENTS FROM ASAAS (PAYMENT_RECEIVED, etc.)
    // =========================================================================
    if (!payment) {
      return new Response(JSON.stringify({ message: 'Payload de pagamento ausente' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    if (event === 'PAYMENT_CREATED') {
      return new Response(JSON.stringify({ success: true, message: 'PAYMENT_CREATED ignorado' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    let newStatus = 'PENDING';
    if (event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED' || event === 'CHECKOUT_PAID' || event === 'PAYMENT_ANTICIPATED') {
      newStatus = 'PAID';
    } else if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_REFUNDED') {
      newStatus = 'CANCELED';
    } else if (event === 'PAYMENT_OVERDUE') {
      newStatus = 'OVERDUE';
    } else {
      return new Response(JSON.stringify({ message: 'Evento de pagamento ignorado.' }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 });
    }

    const payId = payment.id || '';
    const instId = payment.installment || '';
    const chkId = payment.checkout || '';
    const extRef = payment.externalReference || '';
    const paidAtDate = payment.clientPaymentDate || payment.paymentDate || payment.confirmedDate || payment.creditDate || (newStatus === 'PAID' ? new Date().toISOString() : null);

    console.log(`[Asaas Webhook Payment] 💳 Evento: ${event}, PayID: ${payId}, InstID: ${instId}, ChkID: ${chkId}, ExtRef: ${extRef}`);

    let processed = false;
    let targetTenantId: string | null = null;
    let targetInvoiceId: string | null = null;

    // -------------------------------------------------------------------------
    // STEP 0: Procurar em Invoice Installments (Busca Tolerante NASA)
    // -------------------------------------------------------------------------
    let installment: any = null;

    // A) Busca por gateway_payment_id ou payment_gateway_id
    const searchKeys = [payId, instId, chkId].filter(Boolean);
    for (const key of searchKeys) {
      if (!installment) {
        const { data: i1 } = await supabase.from('invoice_installments').select('*').or(`gateway_payment_id.eq.${key},payment_gateway_id.eq.${key}`).maybeSingle();
        if (i1) installment = i1;
      }
    }

    // B) Busca por externalReference (invoice_id)
    if (!installment && extRef) {
      const { data: i2 } = await supabase.from('invoice_installments').select('*').eq('invoice_id', extRef).eq('status', 'PENDING').limit(1).maybeSingle();
      if (i2) installment = i2;
    }

    if (installment) {
      await supabase.from('invoice_installments').update({
        status: newStatus,
        paid_at: newStatus === 'PAID' ? paidAtDate : null,
        payment_method: payment.billingType === 'PIX' ? 'Pix' : (payment.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto')
      }).eq('id', installment.id);

      targetTenantId = installment.tenant_id;
      targetInvoiceId = installment.invoice_id;

      if (newStatus === 'PAID') {
        const { data: existingCf } = await supabase.from('cash_flow').select('id').eq('reference_id', installment.id).maybeSingle();
        if (!existingCf) {
          const { data: invInfo } = await supabase.from('invoices').select('display_id, tenant_id').eq('id', installment.invoice_id).maybeSingle();
          const invoiceDisplayId = invInfo ? (invInfo.display_id || installment.invoice_id.slice(0, 8)) : installment.invoice_id.slice(0, 8);
          await supabase.from('cash_flow').insert({
            tenant_id: installment.tenant_id || (invInfo ? invInfo.tenant_id : null),
            type: 'INCOME',
            category: 'Recebimento de Fatura (Parcela)',
            amount: payment.value,
            description: `Pagamento de parcela ${installment.installment_number} via Asaas - Fatura ${invoiceDisplayId}`,
            reference_id: installment.id,
            reference_type: 'INSTALLMENT',
            payment_method: payment.billingType === 'PIX' ? 'Pix' : (payment.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto'),
            entry_date: paidAtDate || new Date().toISOString(),
            created_by: 'webhook-asaas'
          });
        }
      }

      processed = true;

      // Atualiza status global da Fatura pai com base em todas as parcelas
      const { data: allInsts } = await supabase.from('invoice_installments').select('status').eq('invoice_id', installment.invoice_id);
      const allResolved = allInsts && allInsts.length > 0 && allInsts.every((i: any) => i.status === 'PAID' || i.status === 'CANCELED');
      const allCanceled = allInsts && allInsts.length > 0 && allInsts.every((i: any) => i.status === 'CANCELED');
      const hasPaid = allInsts && allInsts.some((i: any) => i.status === 'PAID');
      const hasOverdue = allInsts && allInsts.some((i: any) => i.status === 'OVERDUE');

      let invoiceStatus = 'PENDING';
      if (allResolved && hasPaid) invoiceStatus = 'PAID';
      else if (hasPaid) invoiceStatus = 'PARTIALLY_PAID';
      else if (allCanceled) invoiceStatus = 'CANCELED';
      else if (hasOverdue) invoiceStatus = 'OVERDUE';

      await supabase.from('invoices').update({
        status: invoiceStatus,
        paid_at: invoiceStatus === 'PAID' ? paidAtDate : null
      }).eq('id', installment.invoice_id);
    }

    // -------------------------------------------------------------------------
    // STEP 1: Procurar em Invoices (Busca Multi-Critério Tolerante)
    // -------------------------------------------------------------------------
    if (!processed) {
      let invoice: any = null;

      // Search A: gateway_payment_id or payment_gateway_id
      for (const key of searchKeys) {
        if (!invoice) {
          const { data: inv1 } = await supabase.from('invoices').select('*').or(`gateway_payment_id.eq.${key},payment_gateway_id.eq.${key}`).maybeSingle();
          if (inv1) invoice = inv1;
        }
      }

      // Search B: externalReference = id (UUID)
      if (!invoice && extRef) {
        const { data: inv2 } = await supabase.from('invoices').select('*').eq('id', extRef).maybeSingle();
        if (inv2) invoice = inv2;
      }

      // Search C: externalReference = display_id (ex: FAT-00003 ou #FAT-00003)
      if (!invoice && extRef) {
        const cleanDisplayId = extRef.replace('#', '').trim();
        const { data: inv3 } = await supabase.from('invoices').select('*').eq('display_id', cleanDisplayId).maybeSingle();
        if (inv3) invoice = inv3;
      }

      if (invoice) {
        await supabase.from('invoices').update({
          gateway_status: event,
          status: newStatus,
          paid_at: newStatus === 'PAID' ? paidAtDate : null
        }).eq('id', invoice.id);

        targetTenantId = invoice.tenant_id;
        targetInvoiceId = invoice.id;

        if (newStatus === 'PAID') {
          const { data: existingCf } = await supabase.from('cash_flow').select('id').eq('reference_id', invoice.id).maybeSingle();
          if (!existingCf) {
            await supabase.from('cash_flow').insert({
              tenant_id: invoice.tenant_id,
              type: 'INCOME',
              category: 'Recebimento de Fatura',
              amount: payment.value,
              description: `Pagamento integral via Asaas - Fatura ${invoice.display_id || invoice.id.slice(0, 8)}`,
              reference_id: invoice.id,
              reference_type: 'INVOICE',
              payment_method: payment.billingType === 'PIX' ? 'Pix' : (payment.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto'),
              entry_date: paidAtDate || new Date().toISOString(),
              created_by: 'webhook-asaas'
            });
          }
        } else if (newStatus === 'CANCELED' || newStatus === 'PENDING') {
          await supabase.from('cash_flow').delete().eq('reference_id', invoice.id).eq('created_by', 'webhook-asaas');
        }

        processed = true;
      }
    }

    // -------------------------------------------------------------------------
    // STEP 2: Procurar em Orders e Quotes
    // -------------------------------------------------------------------------
    if (!processed) {
      for (const key of searchKeys) {
        if (!processed) {
          const { data: ord } = await supabase.from('orders').select('id, tenant_id').or(`gateway_payment_id.eq.${key},payment_gateway_id.eq.${key}`).maybeSingle();
          if (ord) {
            await supabase.from('orders').update({ gateway_status: event, billing_status: newStatus, status: newStatus }).eq('id', ord.id);
            targetTenantId = ord.tenant_id;
            processed = true;
          }
        }
      }
    }

    // 📡 Broadcast Realtime Push para qualquer fatura/parcela/OS atualizada
    if (targetTenantId) {
      console.log(`[Asaas Webhook] ⚡ Enviando Realtime Broadcast para Tenant: ${targetTenantId}`);
      const ch = supabase.channel(`nexus-realtime-${targetTenantId}`);
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          ch.send({
            type: 'broadcast',
            event: 'INVOICE_UPDATED',
            payload: { invoiceId: targetInvoiceId, status: newStatus }
          }).then(() => {
            supabase.removeChannel(ch);
          });
        }
      });
    }

    if (processed) {
      return new Response(JSON.stringify({ success: true, message: 'Processado com sucesso', invoiceId: targetInvoiceId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
      });
    }

    return new Response(JSON.stringify({ message: 'Pagamento não vinculado a nenhuma fatura local.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });

  } catch (error: any) {
    console.error('Asaas Webhook NASA Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
