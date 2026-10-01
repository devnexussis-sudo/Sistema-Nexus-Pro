import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PUT',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json().catch(() => ({}));
    const {
      action,
      itemId,
      itemType,
      paymentMethodType,
      amount,
      installments,
      customerId,
      tenantId,
      displayId,
      externalReference,
      paymentId,
      documentNumber,
      name,
      email,
      phone,
      address,
      addressNumber,
      province,
      customerName,
      customerEmail,
      customerPhone,
      customerZip,
      postalCode,
      zipCode,
      zip_code,
      cep,
    } = payload;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    // 🔒 Supabase Admin Client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Tentar buscar por tenant_id específico
    let tenantSettings = null;
    if (tenantId) {
      const { data: stData, error: stErr } = await supabase
        .from('tenant_asaas_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (stErr) {
        console.error('[Asaas] Erro ao buscar tenant_asaas_settings por tenant_id:', JSON.stringify(stErr));
      }
      if (stData) tenantSettings = stData;
    }

    // 2. Fallback: Se não encontrou por tenant_id, busca a primeira configuração ativa no banco
    if (!tenantSettings) {
      const { data: globalSettings } = await supabase
        .from('tenant_asaas_settings')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (globalSettings) tenantSettings = globalSettings;
    }

    // 3. Fallback: Tenta qualquer registro existente na tabela tenant_asaas_settings
    if (!tenantSettings) {
      const { data: anySettings } = await supabase
        .from('tenant_asaas_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (anySettings) tenantSettings = anySettings;
    }

    let ASAAS_API_KEY = tenantSettings?.asaas_api_key?.trim();

    // BUSCA CHAVE REAL NO COFRE (Vault)
    if (tenantSettings?.tenant_id) {
      const { data: vault } = await supabase
        .from('tenant_secrets')
        .select('asaas_api_key')
        .eq('tenant_id', tenantSettings.tenant_id)
        .single();
      if (vault?.asaas_api_key) ASAAS_API_KEY = vault.asaas_api_key.trim();
    }

    if (!ASAAS_API_KEY) {
      ASAAS_API_KEY = (Deno.env.get('ASAAS_API_KEY') || Deno.env.get('ASAAS_ACCESS_TOKEN') || '').trim();
    }

    if (!ASAAS_API_KEY) {
      throw new Error('Configuração do Asaas não encontrada. Verifique se a API Key do Asaas foi cadastrada em Integrações -> Gateway de Pagamento.');
    }

    const isSandbox = tenantSettings?.is_sandbox !== false;
    const ASAAS_API_URL = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';

    const headers = {
      'Content-Type': 'application/json',
      'access_token': ASAAS_API_KEY,
    };

    // ==========================================
    // ROTA DE CONFIGURAÇÃO DE WEBHOOK
    // ==========================================
    if (action === 'setup_webhook') {
      const { webhookUrl } = payload;
      if (!webhookUrl) throw new Error('webhookUrl é obrigatório para configurar o webhook.');

      const webhookPayload = {
        url: webhookUrl,
        email: 'suporte@duno.com.br',
        apiVersion: 3,
        enabled: true,
        interrupted: false,
        events: [
          'PAYMENT_CREATED', 'PAYMENT_UPDATED', 'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED',
          'PAYMENT_OVERDUE', 'PAYMENT_DELETED', 'PAYMENT_RESTORED', 'PAYMENT_REFUNDED',
          'PAYMENT_CHARGEBACK_REQUESTED', 'PAYMENT_CHARGEBACK_DISPUTE', 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
        ],
      };

      const webhookRes = await fetch(ASAAS_API_URL + '/webhook', { method: 'POST', headers, body: JSON.stringify(webhookPayload) });
      const webhookData = await webhookRes.json();

      const invoiceWebhookPayload = {
        url: webhookUrl,
        email: 'suporte@duno.com.br',
        apiVersion: 3,
        enabled: true,
        interrupted: false,
        events: ['INVOICE_CREATED', 'INVOICE_UPDATED', 'INVOICE_SYNCHRONIZED', 'INVOICE_AUTHORIZED', 'INVOICE_PROCESSING_CANCELLATION', 'INVOICE_CANCELED', 'INVOICE_CANCELLATION_DENIED', 'INVOICE_ERROR'],
      };

      try {
        await fetch(ASAAS_API_URL + '/webhook/invoice', { method: 'POST', headers, body: JSON.stringify(invoiceWebhookPayload) });
      } catch (err) {
        console.log('Aviso: Não foi possível configurar webhook de NFSe.', err);
      }

      if (webhookData.errors) {
        throw new Error('Erro ao configurar webhook no Asaas: ' + webhookData.errors[0].description);
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Webhook configurado com sucesso no Asaas.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // ==========================================
    // ROTA DE CANCELAMENTO
    // ==========================================
    if (action === 'cancel_payment') {
      if (!paymentId) throw new Error('paymentId é obrigatório para cancelamento.');

      const deleteRes = await fetch(ASAAS_API_URL + '/payments/' + paymentId, { method: 'DELETE', headers });
      const deleteData = await deleteRes.json().catch(() => ({}));

      if (deleteData.errors && !deleteData.deleted) {
        console.warn('[Asaas] Aviso ao cancelar no Asaas:', deleteData.errors);
      }

      await Promise.all([
        supabase.from('invoices').update({ status: 'CANCELED', gateway_status: 'CANCELED' }).or(`gateway_payment_id.eq.${paymentId},payment_gateway_id.eq.${paymentId}`),
        supabase.from('invoice_installments').update({ status: 'CANCELED' }).or(`gateway_payment_id.eq.${paymentId},payment_gateway_id.eq.${paymentId}`),
        supabase.from('orders').update({ billing_status: 'CANCELED', status: 'CANCELED' }).or(`gateway_payment_id.eq.${paymentId},payment_gateway_id.eq.${paymentId}`),
        supabase.from('quotes').update({ billing_status: 'CANCELED' }).or(`gateway_payment_id.eq.${paymentId},payment_gateway_id.eq.${paymentId}`),
        supabase.from('cash_flow').delete().or(`reference_id.eq.${paymentId}`).eq('created_by', 'sync-asaas'),
      ]);

      return new Response(
        JSON.stringify({ success: true, message: 'Cobrança cancelada com sucesso no Asaas e no sistema.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // ==========================================
    // ROTA DE SINCRONIZAÇÃO MANUAL
    // ==========================================
    if (action === 'sync_payment') {
      const { invoiceId, orderId, quoteId } = payload;

      if (!paymentId && !invoiceId && !orderId && !quoteId) {
        throw new Error('paymentId ou invoiceId é obrigatório para sync.');
      }

      let invoiceIdToSync = paymentId;
      let currentItemType = 'INVOICE';
      let gatewayIdToSearch = paymentId;

      if (invoiceId) { invoiceIdToSync = invoiceId; currentItemType = 'INVOICE'; }
      else if (orderId) { invoiceIdToSync = orderId; currentItemType = 'ORDER'; }
      else if (quoteId) { invoiceIdToSync = quoteId; currentItemType = 'QUOTE'; }

      if (paymentId) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(paymentId);
        if (isUUID) {
          const [invRes, ordRes, quoRes] = await Promise.all([
            supabase.from('invoices').select('id, gateway_payment_id, payment_gateway_id').eq('id', paymentId).maybeSingle(),
            supabase.from('orders').select('id, gateway_payment_id, payment_gateway_id').eq('id', paymentId).maybeSingle(),
            supabase.from('quotes').select('id, gateway_payment_id, payment_gateway_id').eq('id', paymentId).maybeSingle(),
          ]);
          if (invRes.data) { invoiceIdToSync = invRes.data.id; currentItemType = 'INVOICE'; gatewayIdToSearch = invRes.data.gateway_payment_id || invRes.data.payment_gateway_id || paymentId; }
          else if (ordRes.data) { invoiceIdToSync = ordRes.data.id; currentItemType = 'ORDER'; gatewayIdToSearch = ordRes.data.gateway_payment_id || ordRes.data.payment_gateway_id || paymentId; }
          else if (quoRes.data) { invoiceIdToSync = quoRes.data.id; currentItemType = 'QUOTE'; gatewayIdToSearch = quoRes.data.gateway_payment_id || quoRes.data.payment_gateway_id || paymentId; }
        } else {
          const [invRes, instRes, ordRes, quoRes] = await Promise.all([
            supabase.from('invoices').select('id, gateway_payment_id').or(`gateway_payment_id.eq.${paymentId},payment_gateway_id.eq.${paymentId}`).maybeSingle(),
            supabase.from('invoice_installments').select('invoice_id, gateway_payment_id').eq('gateway_payment_id', paymentId).maybeSingle(),
            supabase.from('orders').select('id, gateway_payment_id').or(`gateway_payment_id.eq.${paymentId},payment_gateway_id.eq.${paymentId}`).maybeSingle(),
            supabase.from('quotes').select('id, gateway_payment_id').or(`gateway_payment_id.eq.${paymentId},payment_gateway_id.eq.${paymentId}`).maybeSingle(),
          ]);
          if (invRes.data) { invoiceIdToSync = invRes.data.id; currentItemType = 'INVOICE'; }
          else if (instRes.data) { invoiceIdToSync = instRes.data.invoice_id; currentItemType = 'INVOICE'; }
          else if (ordRes.data) { invoiceIdToSync = ordRes.data.id; currentItemType = 'ORDER'; }
          else if (quoRes.data) { invoiceIdToSync = quoRes.data.id; currentItemType = 'QUOTE'; }
        }
      }

      let paymentsToSync: any[] = [];
      let debugAsaasResponse: any = null;

      if (gatewayIdToSearch && gatewayIdToSearch.startsWith('pay_')) {
        const pRes = await fetch(ASAAS_API_URL + '/payments/' + gatewayIdToSearch, { headers });
        const pData = await pRes.json();
        debugAsaasResponse = pData;
        if (pData && !pData.errors && pData.id) {
          paymentsToSync = [pData];
          if (pData.installment) {
            const instRes = await fetch(ASAAS_API_URL + '/payments?installment=' + pData.installment + '&limit=100', { headers });
            const instData = await instRes.json();
            if (instData.data && instData.data.length > 0) paymentsToSync = instData.data;
          }
        }
      }

      if (paymentsToSync.length === 0 && gatewayIdToSearch && gatewayIdToSearch.startsWith('inst_')) {
        const instRes = await fetch(ASAAS_API_URL + '/payments?installment=' + gatewayIdToSearch + '&limit=100', { headers });
        const instData = await instRes.json();
        debugAsaasResponse = instData;
        if (instData && instData.data && instData.data.length > 0) paymentsToSync = instData.data;
      }

      if (paymentsToSync.length === 0 && gatewayIdToSearch && gatewayIdToSearch.startsWith('link_')) {
        const pLinkRes = await fetch(ASAAS_API_URL + '/payments?limit=100', { headers }); // Asaas does not filter by paymentLink reliably
        const pLink = await pLinkRes.json();
        debugAsaasResponse = pLink;
        if (pLink && pLink.data && pLink.data.length > 0) {
          // Filtramos localmente pois a API ignora o parametro paymentLink
          const exactMatches = pLink.data.filter((p: any) => p.paymentLink === gatewayIdToSearch);
          if (exactMatches.length > 0) paymentsToSync = exactMatches;
        }
      }

      // FALLBACK: Para checkout (chk_) ou IDs desconhecidos, buscar pay_ real das installments no DB
      if (paymentsToSync.length === 0 && invoiceIdToSync && currentItemType === 'INVOICE') {
        const { data: dbInstRows } = await supabase.from('invoice_installments')
          .select('gateway_payment_id')
          .eq('invoice_id', invoiceIdToSync)
          .not('gateway_payment_id', 'is', null)
          .limit(1);
        if (dbInstRows && dbInstRows.length > 0 && dbInstRows[0].gateway_payment_id) {
          const realGwId = dbInstRows[0].gateway_payment_id;
          if (realGwId.startsWith('pay_')) {
            const pRes2 = await fetch(ASAAS_API_URL + '/payments/' + realGwId, { headers });
            const pData2 = await pRes2.json();
            debugAsaasResponse = pData2;
            if (pData2 && !pData2.errors && pData2.id) {
              paymentsToSync = [pData2];
              if (pData2.installment) {
                const instRes2 = await fetch(ASAAS_API_URL + '/payments?installment=' + pData2.installment + '&limit=100', { headers });
                const instData2 = await instRes2.json();
                if (instData2.data && instData2.data.length > 0) paymentsToSync = instData2.data;
              }
            }
          }
        }
      }

      if (paymentsToSync.length === 0 && invoiceIdToSync) {
        const pRefRes = await fetch(ASAAS_API_URL + '/payments?externalReference=' + invoiceIdToSync + '&limit=100', { headers });
        const pRef = await pRefRes.json();
        if (!debugAsaasResponse) debugAsaasResponse = pRef;
        if (pRef && pRef.data && pRef.data.length > 0) paymentsToSync = pRef.data;
      }

      // 🔥 FALLBACK DEFINITIVO: Buscar pagamentos pelo CLIENTE no Asaas (para checkouts e IDs não-padrão)
      if (paymentsToSync.length === 0 && invoiceIdToSync && currentItemType === 'INVOICE') {
        try {
          const { data: invForCust } = await supabase.from('invoices')
            .select('customer_document, gateway_payment_id, payment_gateway_id, total_amount, amount')
            .eq('id', invoiceIdToSync)
            .maybeSingle();

          if (invForCust) {
            const checkoutGwId = invForCust.gateway_payment_id || invForCust.payment_gateway_id;
            const custDoc = invForCust.customer_document?.replace(/\D/g, '');

            if (custDoc) {
              const custSearchRes = await fetch(ASAAS_API_URL + '/customers?cpfCnpj=' + custDoc + '&limit=1', { headers });
              const custSearchData = await custSearchRes.json();

              if (custSearchData.data && custSearchData.data.length > 0) {
                const asaasCustId = custSearchData.data[0].id;
                const recentPayRes = await fetch(ASAAS_API_URL + '/payments?customer=' + asaasCustId + '&limit=50', { headers });
                const recentPayData = await recentPayRes.json();

                if (recentPayData.data && recentPayData.data.length > 0) {
                  // Prioridade 0: Filtrar pelo link de pagamento (match exato)
                  if (gatewayIdToSearch && gatewayIdToSearch.startsWith('link_')) {
                    const byLink = recentPayData.data.filter((p: any) => p.paymentLink === gatewayIdToSearch);
                    if (byLink.length > 0) paymentsToSync = byLink;
                  }
                  // Prioridade 1: Filtrar pelo checkout UUID (match exato)
                  if (paymentsToSync.length === 0 && checkoutGwId) {
                    const byCheckout = recentPayData.data.filter((p: any) => p.checkout === checkoutGwId);
                    if (byCheckout.length > 0) paymentsToSync = byCheckout;
                  }
                  // Prioridade 2: Filtrar pelo externalReference (UUID da fatura)
                  if (paymentsToSync.length === 0) {
                    const byRef = recentPayData.data.filter((p: any) => p.externalReference === invoiceIdToSync);
                    if (byRef.length > 0) paymentsToSync = byRef;
                  }
                  // Prioridade 3: Filtrar pelo valor exato + data recente (últimos 30 dias)
                  if (paymentsToSync.length === 0) {
                    const invAmount = parseFloat(invForCust.total_amount || invForCust.amount || '0');
                    const thirtyDaysAgo = new Date();
                    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
                    const byValue = recentPayData.data.filter((p: any) => {
                      const isRecentEnough = new Date(p.dateCreated) >= thirtyDaysAgo;
                      const isValueMatch = Math.abs(p.value - invAmount) < 0.01 || (p.installment && Math.abs(p.netValue - invAmount) < 0.01);
                      return isRecentEnough && isValueMatch && p.status !== 'DELETED' && p.status !== 'CANCELED';
                    });
                    if (byValue.length > 0) paymentsToSync = byValue;
                  }

                  if (!debugAsaasResponse) debugAsaasResponse = recentPayData;
                }
              }
            }
          }
        } catch (custFallbackErr) {
          console.error('[Asaas Sync] Erro no fallback por cliente:', custFallbackErr);
        }
      }

      if (paymentsToSync.length > 1) {
        paymentsToSync.sort((a, b) => new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime());
        const activePayments = paymentsToSync.filter((p) => p.status !== 'DELETED' && p.status !== 'CANCELED');
        if (activePayments.length > 0) paymentsToSync = activePayments;
      }

      if (paymentsToSync.length === 0) {
        const errorMsg = debugAsaasResponse?.errors ? debugAsaasResponse.errors[0].description : 'Nenhum pagamento concluído encontrado no Asaas ainda.';
        return new Response(
          JSON.stringify({ success: true, message: `Status atual: PENDENTE. (${errorMsg})`, newStatus: 'PENDING' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        );
      }

      const realPayId = paymentsToSync[0]?.id;
      const invoiceNumber = paymentsToSync[0]?.invoiceNumber || paymentsToSync.find((p) => p.invoiceNumber)?.invoiceNumber;
      
      const payloadToUpdate: any = {};
      if (realPayId) {
        payloadToUpdate.gateway_payment_id = realPayId;
        payloadToUpdate.payment_gateway_id = realPayId;
      }
      if (invoiceNumber) {
        payloadToUpdate.invoice_number = invoiceNumber;
      }

      if (Object.keys(payloadToUpdate).length > 0 && invoiceIdToSync) {
        if (currentItemType === 'ORDER') await supabase.from('orders').update(payloadToUpdate).eq('id', invoiceIdToSync);
        else if (currentItemType === 'QUOTE') await supabase.from('quotes').update(payloadToUpdate).eq('id', invoiceIdToSync);
        else await supabase.from('invoices').update(payloadToUpdate).eq('id', invoiceIdToSync);
      }

      const hasPaid = paymentsToSync.some((p) => p.status === 'RECEIVED' || p.status === 'CONFIRMED' || p.status === 'RECEIVED_IN_CASH' || p.status === 'ANTICIPATED' || p.status === 'AUTHORIZED');
      const allPaid = paymentsToSync.every((p) => p.status === 'RECEIVED' || p.status === 'CONFIRMED' || p.status === 'RECEIVED_IN_CASH' || p.status === 'ANTICIPATED' || p.status === 'AUTHORIZED');
      const allCanceled = paymentsToSync.every((p) => p.status === 'REFUNDED' || p.status === 'DELETED' || p.status === 'CANCELED');
      const hasOverdue = paymentsToSync.some((p) => p.status === 'OVERDUE');

      const isCreditCard = paymentsToSync.some((p) => p.billingType === 'CREDIT_CARD');

      let finalStatus = 'PENDING';
      if (allPaid || (isCreditCard && hasPaid)) finalStatus = 'PAID';
      else if (hasPaid) finalStatus = 'PARTIALLY_PAID';
      else if (allCanceled) finalStatus = 'CANCELED';
      else if (hasOverdue) finalStatus = 'OVERDUE';

      const mainPaidDate = paymentsToSync.find((p) => p.clientPaymentDate || p.paymentDate || p.confirmedDate)?.clientPaymentDate ||
        paymentsToSync.find((p) => p.paymentDate)?.paymentDate ||
        paymentsToSync.find((p) => p.confirmedDate)?.confirmedDate ||
        (finalStatus === 'PAID' ? new Date().toISOString() : null);

      if (currentItemType === 'ORDER') {
        await supabase.from('orders').update({ status: finalStatus, billing_status: finalStatus }).eq('id', invoiceIdToSync);
      } else if (currentItemType === 'QUOTE') {
        await supabase.from('quotes').update({ status: finalStatus === 'PAID' ? 'APPROVED' : finalStatus, billing_status: finalStatus }).eq('id', invoiceIdToSync);
      } else {
        await Promise.all(paymentsToSync.map(async (pay) => {
          let statusBR = 'PENDING';
          if (pay.status === 'RECEIVED' || pay.status === 'CONFIRMED' || pay.status === 'RECEIVED_IN_CASH' || pay.status === 'ANTICIPATED' || pay.status === 'AUTHORIZED') statusBR = 'PAID';
          if (pay.status === 'OVERDUE') statusBR = 'OVERDUE';
          if (pay.status === 'REFUNDED' || pay.status === 'DELETED' || pay.status === 'CANCELED') statusBR = 'CANCELED';

          const instNum = pay.installmentNumber || 1;
          const paidAtDate = pay.clientPaymentDate || pay.paymentDate || pay.confirmedDate || pay.creditDate || (statusBR === 'PAID' ? new Date().toISOString() : null);

          await supabase.from('invoice_installments').update({
            status: statusBR,
            paid_at: statusBR === 'PAID' ? paidAtDate : null,
            gateway_ticket_url: pay.invoiceUrl || pay.bankSlipUrl || pay.hostedCheckoutUrl,
            gateway_payment_id: pay.id || undefined,
            payment_method: pay.billingType === 'PIX' ? 'Pix' : (pay.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto'),
          }).eq('invoice_id', invoiceIdToSync).eq('installment_number', instNum);

          if (statusBR === 'PAID') {
            const { data: existingCf } = await supabase.from('cash_flow').select('id').eq('reference_id', invoiceIdToSync + '_' + instNum).maybeSingle();
            if (!existingCf) {
              await supabase.from('cash_flow').insert({
                tenant_id: tenantId,
                type: 'INCOME',
                category: 'Recebimento de Fatura (Parcela)',
                amount: pay.value,
                description: `Pagamento via Asaas (Sincronização) - Fatura ${displayId || invoiceIdToSync.slice(0, 8)}`,
                reference_id: invoiceIdToSync + '_' + instNum,
                reference_type: 'INSTALLMENT',
                payment_method: pay.billingType === 'PIX' ? 'Pix' : (pay.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto'),
                entry_date: paidAtDate || new Date().toISOString(),
                created_by: 'sync-asaas',
              });
            }
          } else if (statusBR === 'PENDING' || statusBR === 'CANCELED') {
            await supabase.from('cash_flow').delete().eq('reference_id', invoiceIdToSync + '_' + instNum).eq('created_by', 'sync-asaas');
          }
        }));

        await supabase.from('invoices').update({
          status: finalStatus,
          paid_at: finalStatus === 'PAID' ? mainPaidDate : null,
        }).eq('id', invoiceIdToSync);
      }

      const statusMsg = finalStatus === 'PAID' ? 'PAGO / LIQUIDADO' : (finalStatus === 'OVERDUE' ? 'VENCIDO / ATRASADO' : (finalStatus === 'CANCELED' ? 'CANCELADO' : 'PENDENTE'));
      return new Response(
        JSON.stringify({ success: true, newStatus: finalStatus, realPaymentId: realPayId, invoiceNumber: invoiceNumber || null, message: `Status no Asaas: ${statusMsg}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // ==========================================
    // ROTA DE CRIAÇÃO (Gerar Cobrança)
    // ==========================================

    // CANCELAMENTO PRÉVIO: Se estamos refaturando, cancelar faturas antigas no Asaas
    try {
      if (itemId) {
        const existingRes = await fetch(ASAAS_API_URL + '/payments?externalReference=' + itemId + '&limit=50', { headers });
        const existingData = await existingRes.json();
        if (existingData.data && existingData.data.length > 0) {
          for (const oldPay of existingData.data) {
            if (oldPay.status === 'PENDING' || oldPay.status === 'OVERDUE') {
              await fetch(ASAAS_API_URL + '/payments/' + oldPay.id, { method: 'DELETE', headers });
            }
          }
        }
      }
    } catch (e) {
      console.error('[Asaas] Erro ao tentar cancelar faturas antigas:', e);
    }

    let asaasBillingType = 'UNDEFINED';
    if (paymentMethodType === 'credit_card') asaasBillingType = 'CREDIT_CARD';
    if (paymentMethodType === 'bank_slip' || paymentMethodType === 'boleto') asaasBillingType = 'BOLETO';
    if (paymentMethodType === 'pix') asaasBillingType = 'PIX';

    const safeAmount = Number((parseFloat(amount) || 0).toFixed(2));
    const safeInstallments = asaasBillingType === 'PIX' ? 1 : (parseInt(installments) || 1);
    let dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const rawDisplay = displayId ? String(displayId).trim() : (itemId ? itemId.substring(0, 8) : '');
    const formattedFatId = rawDisplay.toUpperCase().startsWith('FAT') ? rawDisplay.toUpperCase() : `FAT-${rawDisplay}`;
    const descriptionText = itemType === 'INVOICE' ? formattedFatId : `${itemType === 'ORDER' ? 'OS' : 'Orç.'} #${rawDisplay}`;
    const updateTable = itemType === 'ORDER' ? 'orders' : (itemType === 'QUOTE' ? 'quotes' : 'invoices');

    const payloadDoc = documentNumber || payload.customerDocument;
    let cleanDoc = payloadDoc?.replace(/\D/g, '');

    const payloadZip = customerZip || postalCode || zipCode || zip_code || cep;
    let realZipCode = payloadZip?.replace(/\D/g, '') || '';
    let realName = name || customerName || '';
    let realEmail = email || customerEmail || '';
    let realPhone = phone || customerPhone || '';
    let realAddress = address || '';
    let realAddressNumber = addressNumber || '';
    let realProvince = province || '';
    let realCity = '';
    let realState = '';
    let realWhatsapp = '';

    // Fallback 1: busca pelo customerId enviado pelo frontend
    if (customerId) {
      const { data: customerData } = await supabase.from('customers')
        .select('*')
        .eq('id', customerId)
        .maybeSingle();
      if (customerData) {
        if (!realName) realName = customerData.name || '';
        if (!realEmail) realEmail = customerData.email || '';
        if (!realPhone) realPhone = customerData.phone || customerData.whatsapp || '';
        if (!realAddress) realAddress = customerData.address || customerData.street || customerData.logradouro || '';
        if (!realAddressNumber) realAddressNumber = customerData.number || customerData.address_number || '';
        if (!realProvince) realProvince = customerData.neighborhood || customerData.bairro || '';
        if (!realZipCode) realZipCode = (customerData.zip_code || customerData.cep || customerData.postal_code || customerData.zip || '')?.replace(/\D/g, '');
        realCity = customerData.city || customerData.cidade || '';
        realState = customerData.state || customerData.uf || '';
        realWhatsapp = customerData.whatsapp || '';
        if (!cleanDoc && customerData.document) cleanDoc = customerData.document.replace(/\D/g, '');
      }
    }

    // Fallback 2: Busca por CPF/CNPJ se faltar o ID ou dados do cliente
    if (cleanDoc && (!realAddress || !realName || realName === 'Cliente Nexus' || !realZipCode)) {
      const { data: customerData } = await supabase.from('customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .or(`document.ilike.%${cleanDoc}%,cpf.ilike.%${cleanDoc}%,cnpj.ilike.%${cleanDoc}%`)
        .maybeSingle();

      if (customerData) {
        if (!realName || realName === 'Cliente Nexus') realName = customerData.name || '';
        if (!realEmail) realEmail = customerData.email || '';
        if (!realPhone) realPhone = customerData.phone || customerData.whatsapp || '';
        if (!realAddress) realAddress = customerData.address || customerData.street || customerData.logradouro || '';
        if (!realAddressNumber) realAddressNumber = customerData.number || customerData.address_number || '';
        if (!realProvince) realProvince = customerData.neighborhood || customerData.bairro || '';
        if (!realZipCode) realZipCode = (customerData.zip_code || customerData.cep || customerData.postal_code || customerData.zip || '')?.replace(/\D/g, '');
        realCity = customerData.city || customerData.cidade || '';
        realState = customerData.state || customerData.uf || '';
        realWhatsapp = customerData.whatsapp || '';
      }
    }

    // Fallback 3: busca direto na fatura pelo itemId
    if (!cleanDoc && itemType === 'INVOICE' && itemId) {
      const { data: invData } = await supabase
        .from('invoices')
        .select('customer_document, customer_id')
        .eq('id', itemId)
        .maybeSingle();
      if (invData?.customer_document) {
        cleanDoc = invData.customer_document.replace(/\D/g, '');
      }
      if (!cleanDoc && invData?.customer_id) {
        const { data: custFallback } = await supabase
          .from('customers')
          .select('*')
          .eq('id', invData.customer_id)
          .maybeSingle();
        if (custFallback) {
          if (custFallback.document) cleanDoc = custFallback.document.replace(/\D/g, '');
          if (!realName) realName = custFallback.name || '';
          if (!realEmail) realEmail = custFallback.email || '';
          if (!realPhone) realPhone = custFallback.phone || custFallback.whatsapp || '';
          if (!realAddress) realAddress = custFallback.address || custFallback.street || '';
          if (!realAddressNumber) realAddressNumber = custFallback.number || '';
          if (!realProvince) realProvince = custFallback.neighborhood || custFallback.bairro || '';
          if (!realZipCode) realZipCode = (custFallback.zip_code || custFallback.cep || custFallback.postal_code || custFallback.zip || '')?.replace(/\D/g, '');
          if (!realWhatsapp) realWhatsapp = custFallback.whatsapp || '';
        }
      }
    }

    if (!realName) realName = 'Cliente Nexus';
    if (!realEmail) realEmail = 'cliente@nexussis.com';
    if (!realPhone && realWhatsapp) realPhone = realWhatsapp;
    if (!realPhone) realPhone = '00000000000';

    if (!cleanDoc) throw new Error('CPF/CNPJ do cliente é obrigatório para gerar faturas.');

    // Sanitização de endereço para Asaas
    const cleanAddress = realAddress?.trim();
    const cleanZip = realZipCode?.replace(/\D/g, '');
    const cleanNumber = realAddressNumber?.trim();
    const cleanProvince = realProvince?.trim();

    const asaasCustomerPayload: any = {
      name: realName.trim(),
      email: realEmail.trim(),
      phone: realPhone.replace(/\D/g, ''),
      mobilePhone: (realWhatsapp || realPhone).replace(/\D/g, ''),
      cpfCnpj: cleanDoc,
      notificationDisabled: true,
    };

    if (cleanZip) {
      asaasCustomerPayload.postalCode = cleanZip;
    }

    if (cleanAddress) {
      if (cleanZip) {
        asaasCustomerPayload.address = cleanAddress;
        if (cleanNumber) asaasCustomerPayload.addressNumber = cleanNumber;
        if (cleanProvince) asaasCustomerPayload.province = cleanProvince;
      } else {
        // Regra Asaas: Se postalCode não estiver presente, enviar endereço causa o erro "O campo postalCode deve existir para o customer informado"
        console.warn('[Asaas] Aviso: Endereço informado sem postalCode (CEP). Omitindo campos de endereço para evitar rejeição do Asaas.');
      }
    }

    if (customerId) {
      asaasCustomerPayload.externalReference = customerId;
    }

    let customerIdAsaas = '';
    const asaasCustRes = await fetch(ASAAS_API_URL + '/customers?cpfCnpj=' + cleanDoc, { headers });
    const asaasCustData = await asaasCustRes.json();

    if (asaasCustData.data && asaasCustData.data.length > 0) {
      customerIdAsaas = asaasCustData.data[0].id;
      const updatePayload = { ...asaasCustomerPayload };
      delete updatePayload.cpfCnpj;
      delete updatePayload.notificationDisabled;
      const updateRes = await fetch(ASAAS_API_URL + '/customers/' + customerIdAsaas, { method: 'PUT', headers, body: JSON.stringify(updatePayload) });
      const updateData = await updateRes.json();
      if (updateData.errors) console.error('[Asaas Customer Update Error]', updateData.errors);
    } else {
      const createCustRes = await fetch(ASAAS_API_URL + '/customers', { method: 'POST', headers, body: JSON.stringify(asaasCustomerPayload) });
      const createCustData = await createCustRes.json();
      if (createCustData.errors) throw new Error('Erro ao cadastrar cliente no Asaas: ' + createCustData.errors[0].description);
      customerIdAsaas = createCustData.id;
    }

    let paymentData: any = {};
    let hostedCheckoutUrl = '';

    const useCheckout = asaasBillingType === 'CREDIT_CARD' && safeInstallments > 1;

    if (useCheckout) {
      // Usa Link de Pagamento (Opção 2) a pedido do usuário, pois a integração é nativa e 100% à prova de falhas.
      const checkoutPayload: any = {
        billingType: 'CREDIT_CARD',
        chargeType: 'INSTALLMENT',
        name: descriptionText.substring(0, 50),
        description: descriptionText,
        value: safeAmount,
        maxInstallmentCount: safeInstallments,
        dueDateLimitDays: 3,
        notificationEnabled: false,
      };

      const createCheckoutRes = await fetch(ASAAS_API_URL + '/paymentLinks', { method: 'POST', headers, body: JSON.stringify(checkoutPayload) });
      paymentData = await createCheckoutRes.json();
      if (paymentData.errors) throw new Error('Erro ao gerar link de pagamento Asaas: ' + (paymentData.errors[0]?.description || JSON.stringify(paymentData.errors)));

      hostedCheckoutUrl = paymentData.url;
      paymentData.dueDate = dueDateStr;
      
    } else {
      // Cartão à vista, PIX e Boleto: usa /payments
      const paymentPayload: any = {
        customer: customerIdAsaas,
        billingType: asaasBillingType,
        dueDate: dueDateStr,
        description: descriptionText,
        externalReference: itemId,
      };

      if (safeInstallments > 1 && asaasBillingType === 'BOLETO') {
        paymentPayload.totalValue = safeAmount;
        paymentPayload.installmentCount = safeInstallments;
      } else {
        paymentPayload.value = safeAmount;
      }

      const createPaymentRes = await fetch(ASAAS_API_URL + '/payments', { method: 'POST', headers, body: JSON.stringify(paymentPayload) });
      paymentData = await createPaymentRes.json();
      if (paymentData.errors) throw new Error('Erro ao gerar cobrança Asaas: ' + (paymentData.errors[0]?.description || JSON.stringify(paymentData.errors)));

      hostedCheckoutUrl = paymentData.invoiceUrl || paymentData.bankSlipUrl || '';
    }

    const responseData = {
      success: true,
      paymentId: typeof paymentData.installment === 'string' ? paymentData.installment : paymentData.id,
      singlePaymentId: paymentData.id,
      invoiceNumber: paymentData.invoiceNumber || null,
      status: paymentData.status || 'PENDING',
      hostedCheckoutUrl: hostedCheckoutUrl,
      ticketUrl: paymentData.bankSlipUrl || paymentData.invoiceUrl || hostedCheckoutUrl,
      pixCopiaECola: '',
      qrCodeBase64: '',
      expiresAt: paymentData.dueDate || dueDateStr,
    };

    if (asaasBillingType === 'PIX') {
      const pixRes = await fetch(ASAAS_API_URL + '/payments/' + paymentData.id + '/pixQrCode', { headers });
      const pixData = await pixRes.json();
      if (!pixData.errors) {
        responseData.pixCopiaECola = pixData.payload || '';
        responseData.qrCodeBase64 = pixData.encodedImage || '';
      }
    }

    const payloadToUpdate: any = {
      gateway_payment_id: paymentData.id,
      payment_gateway_id: paymentData.id,
      gateway_provider: 'asaas',
      gateway_status: paymentData.status || 'PENDING',
      gateway_ticket_url: hostedCheckoutUrl,
      gateway_pix_code: responseData.pixCopiaECola,
    };
    if (paymentData.invoiceNumber) payloadToUpdate.invoice_number = paymentData.invoiceNumber;

    if (itemId) {
      await supabase.from(updateTable).update(payloadToUpdate).eq('id', itemId);
    }

    if (itemType === 'INVOICE' && itemId) {
      await supabase.from('invoice_installments').delete().eq('invoice_id', itemId).eq('status', 'PENDING');

      if (safeInstallments > 1 && paymentData.installment) {
        let instData: any = { data: [] };
        for (let i = 0; i < 3; i++) {
          const instRes = await fetch(ASAAS_API_URL + '/payments?installment=' + paymentData.installment + '&limit=100', { headers });
          instData = await instRes.json();
          if (instData.data && instData.data.length > 0) break;
          await new Promise((r) => setTimeout(r, 1000));
        }

        if (instData.data && instData.data.length > 0) {
          const insertPayload = instData.data.map((p: any) => ({
            invoice_id: itemId,
            installment_number: p.installmentNumber,
            total_installments: safeInstallments,
            amount: p.value,
            due_date: p.dueDate,
            status: 'PENDING',
            payment_method: paymentMethodType,
            gateway_payment_id: p.id,
            gateway_ticket_url: p.invoiceUrl || p.bankSlipUrl || hostedCheckoutUrl,
            tenant_id: tenantId,
          }));
          await supabase.from('invoice_installments').insert(insertPayload);
        }
      } else {
        await supabase.from('invoice_installments').insert([{
          invoice_id: itemId,
          installment_number: 1,
          total_installments: 1,
          amount: safeAmount,
          due_date: dueDateStr,
          status: 'PENDING',
          payment_method: paymentMethodType,
          gateway_payment_id: paymentData.id,
          gateway_ticket_url: hostedCheckoutUrl,
          tenant_id: tenantId,
        }]);
      }
    }

    return new Response(JSON.stringify(responseData), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error: any) {
    console.error('Asaas Edge Function Error:', error.message);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  }
});
