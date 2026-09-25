import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
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
    } = payload;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    // 🔒 Supabase Admin
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
        console.error(
          '[Asaas] Erro ao buscar tenant_asaas_settings por tenant_id:',
          JSON.stringify(stErr),
        );
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

    // BUSCA CHAVE REAL NO COFRE
    if (tenantSettings?.tenant_id) {
      const { data: vault } = await supabase
        .from('tenant_secrets')
        .select('asaas_api_key')
        .eq('tenant_id', tenantSettings.tenant_id)
        .single();
      if (vault?.asaas_api_key) ASAAS_API_KEY = vault.asaas_api_key.trim();
    }

    if (!ASAAS_API_KEY) {
      ASAAS_API_KEY = (Deno.env.get('ASAAS_API_KEY') || Deno.env.get('ASAAS_ACCESS_TOKEN') || '')
        .trim();
    }

    if (!ASAAS_API_KEY) {
      throw new Error(
        'Configuração do Asaas não encontrada. Verifique se a API Key do Asaas foi cadastrada em Integrações -> Gateway de Pagamento.',
      );
    }

    const WALLET_ID = tenantSettings?.asaas_wallet_id;
    const isSandbox = tenantSettings?.is_sandbox !== false;
    const ASAAS_API_URL = isSandbox
      ? 'https://sandbox.asaas.com/api/v3'
      : 'https://api.asaas.com/v3';

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
        email: 'suporte@duno.com.br', // You can customize this
        apiVersion: 3,
        enabled: true,
        interrupted: false,
        events: [
          'PAYMENT_CREATED',
          'PAYMENT_UPDATED',
          'PAYMENT_CONFIRMED',
          'PAYMENT_RECEIVED',
          'PAYMENT_OVERDUE',
          'PAYMENT_DELETED',
          'PAYMENT_RESTORED',
          'PAYMENT_REFUNDED',
          'PAYMENT_CHARGEBACK_REQUESTED',
          'PAYMENT_CHARGEBACK_DISPUTE',
          'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
        ],
      };

      const webhookRes = await fetch(ASAAS_API_URL + '/webhook', {
        method: 'POST',
        headers,
        body: JSON.stringify(webhookPayload),
      });
      const webhookData = await webhookRes.json();

      // Configurar também o webhook de Notas Fiscais (ignora erros pois a conta pode não ter nfse ativa)
      const invoiceWebhookPayload = {
        url: webhookUrl,
        email: 'suporte@duno.com.br',
        apiVersion: 3,
        enabled: true,
        interrupted: false,
        events: [
          'INVOICE_CREATED',
          'INVOICE_UPDATED',
          'INVOICE_SYNCHRONIZED',
          'INVOICE_AUTHORIZED',
          'INVOICE_PROCESSING_CANCELLATION',
          'INVOICE_CANCELED',
          'INVOICE_CANCELLATION_DENIED',
          'INVOICE_ERROR',
        ],
      };

      try {
        await fetch(ASAAS_API_URL + '/webhook/invoice', {
          method: 'POST',
          headers,
          body: JSON.stringify(invoiceWebhookPayload),
        });
      } catch (err) {
        console.log('Aviso: Não foi possível configurar webhook de NFSe.', err);
      }

      if (webhookData.errors) {
        throw new Error(
          'Erro ao configurar webhook no Asaas: ' + webhookData.errors[0].description,
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Webhook configurado com sucesso no Asaas.' }),
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

      if (invoiceId) {
        invoiceIdToSync = invoiceId;
        currentItemType = 'INVOICE';
      } else if (orderId) {
        invoiceIdToSync = orderId;
        currentItemType = 'ORDER';
      } else if (quoteId) {
        invoiceIdToSync = quoteId;
        currentItemType = 'QUOTE';
      }

      // 1. Tentar resolver o registro no nosso banco de dados se tivermos um paymentId
      if (paymentId) {
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
          .test(paymentId);
        if (isUUID) {
          const [invRes, ordRes, quoRes] = await Promise.all([
            supabase.from('invoices').select('id, gateway_payment_id, payment_gateway_id').eq(
              'id',
              paymentId,
            ).maybeSingle(),
            supabase.from('orders').select('id, gateway_payment_id, payment_gateway_id').eq(
              'id',
              paymentId,
            ).maybeSingle(),
            supabase.from('quotes').select('id, gateway_payment_id, payment_gateway_id').eq(
              'id',
              paymentId,
            ).maybeSingle(),
          ]);
          if (invRes.data) {
            invoiceIdToSync = invRes.data.id;
            currentItemType = 'INVOICE';
            gatewayIdToSearch = invRes.data.gateway_payment_id || invRes.data.payment_gateway_id ||
              paymentId;
          } else if (ordRes.data) {
            invoiceIdToSync = ordRes.data.id;
            currentItemType = 'ORDER';
            gatewayIdToSearch = ordRes.data.gateway_payment_id || ordRes.data.payment_gateway_id ||
              paymentId;
          } else if (quoRes.data) {
            invoiceIdToSync = quoRes.data.id;
            currentItemType = 'QUOTE';
            gatewayIdToSearch = quoRes.data.gateway_payment_id || quoRes.data.payment_gateway_id ||
              paymentId;
          }
        } else {
          const [invRes, instRes, ordRes, quoRes] = await Promise.all([
            supabase.from('invoices').select('id, gateway_payment_id').or(
              `gateway_payment_id.eq.${paymentId},payment_gateway_id.eq.${paymentId}`,
            ).maybeSingle(),
            supabase.from('invoice_installments').select('invoice_id, gateway_payment_id').eq(
              'gateway_payment_id',
              paymentId,
            ).maybeSingle(),
            supabase.from('orders').select('id, gateway_payment_id').or(
              `gateway_payment_id.eq.${paymentId},payment_gateway_id.eq.${paymentId}`,
            ).maybeSingle(),
            supabase.from('quotes').select('id, gateway_payment_id').or(
              `gateway_payment_id.eq.${paymentId},payment_gateway_id.eq.${paymentId}`,
            ).maybeSingle(),
          ]);
          if (invRes.data) {
            invoiceIdToSync = invRes.data.id;
            currentItemType = 'INVOICE';
          } else if (instRes.data) {
            invoiceIdToSync = instRes.data.invoice_id;
            currentItemType = 'INVOICE';
          } else if (ordRes.data) {
            invoiceIdToSync = ordRes.data.id;
            currentItemType = 'ORDER';
          } else if (quoRes.data) {
            invoiceIdToSync = quoRes.data.id;
            currentItemType = 'QUOTE';
          }
        }
      }

      // 2. BUSCA EXAUSTIVA NO ASAAS
      let paymentsToSync: any[] = [];
      let debugAsaasResponse: any = null;

      // A) Se for pay_...
      if (gatewayIdToSearch.startsWith('pay_')) {
        const pRes = await fetch(ASAAS_API_URL + '/payments/' + gatewayIdToSearch, { headers });
        const pData = await pRes.json();
        debugAsaasResponse = pData;
        if (pData && !pData.errors && pData.id) {
          paymentsToSync = [pData];
          if (pData.installment) {
            const instRes = await fetch(
              ASAAS_API_URL + '/payments?installment=' + pData.installment + '&limit=100',
              { headers },
            );
            const instData = await instRes.json();
            if (instData.data && instData.data.length > 0) paymentsToSync = instData.data;
          }
        }
      }

      // A.1) Se for link_... (Payment Link)
      if (paymentsToSync.length === 0 && gatewayIdToSearch.startsWith('link_')) {
        const pLinkRes = await fetch(
          ASAAS_API_URL + '/payments?paymentLink=' + gatewayIdToSearch + '&limit=100',
          { headers },
        );
        const pLink = await pLinkRes.json();
        debugAsaasResponse = pLink;
        if (pLink && pLink.data && pLink.data.length > 0) {
          paymentsToSync = pLink.data;
        }
      }

      // B) Se for UUID (Legado: Checkout Session do Asaas)
      if (
        paymentsToSync.length === 0 && !gatewayIdToSearch.startsWith('pay_') &&
        gatewayIdToSearch.length > 20
      ) {
        // Asaas não possui GET /checkouts/{id}. Para registros legados (UUID),
        // o código cairá automaticamente nos blocos C e D para buscar pelo externalReference ou CPF.
      }

      // C) Busca por externalReference (ID da fatura no nosso banco)
      if (paymentsToSync.length === 0 && invoiceIdToSync) {
        const pRefRes = await fetch(
          ASAAS_API_URL + '/payments?externalReference=' + invoiceIdToSync + '&limit=100',
          { headers },
        );
        const pRef = await pRefRes.json();
        if (!debugAsaasResponse) debugAsaasResponse = pRef;

        if (pRef && pRef.data && pRef.data.length > 0) {
          paymentsToSync = pRef.data;
        }
      }

      // D) GARANTIA ABSOLUTA: Busca de pagamentos do Cliente por CPF/CNPJ no Asaas
      if (paymentsToSync.length === 0 && invoiceIdToSync) {
        try {
          let custId: string | null = null;
          if (currentItemType === 'ORDER') {
            const { data: o } = await supabase.from('orders').select('customer_id').eq(
              'id',
              invoiceIdToSync,
            ).maybeSingle();
            custId = o?.customer_id;
          } else if (currentItemType === 'QUOTE') {
            const { data: q } = await supabase.from('quotes').select('customer_id').eq(
              'id',
              invoiceIdToSync,
            ).maybeSingle();
            custId = q?.customer_id;
          } else {
            const { data: i } = await supabase.from('invoices').select('customer_id').eq(
              'id',
              invoiceIdToSync,
            ).maybeSingle();
            custId = i?.customer_id;
          }

          if (custId) {
            const { data: c } = await supabase.from('customers').select('document').eq('id', custId)
              .maybeSingle();
            const cleanDoc = c?.document?.replace(/\D/g, '');
            if (cleanDoc) {
              const asaasCustRes = await fetch(ASAAS_API_URL + '/customers?cpfCnpj=' + cleanDoc, {
                headers,
              });
              const asaasCustData = await asaasCustRes.json();
              if (asaasCustData?.data && asaasCustData.data.length > 0) {
                const asaasCustomerId = asaasCustData.data[0].id;
                const custPaymentsRes = await fetch(
                  ASAAS_API_URL + '/payments?customer=' + asaasCustomerId + '&limit=20',
                  { headers },
                );
                const custPaymentsData = await custPaymentsRes.json();
                if (custPaymentsData?.data && custPaymentsData.data.length > 0) {
                  const paidCustPayments = custPaymentsData.data.filter((p: any) =>
                    p.status === 'RECEIVED' || p.status === 'CONFIRMED' ||
                    p.status === 'RECEIVED_IN_CASH' || p.status === 'ANTICIPATED' ||
                    p.status === 'AUTHORIZED'
                  );
                  if (paidCustPayments.length > 0) {
                    paymentsToSync = paidCustPayments;
                  }
                }
              }
            }
          }
        } catch (cErr) {
          console.error('[Asaas Sync Customer Fallback Error]', cErr);
        }
      }

      // ORDENAR E FILTRAR: Priorizar cobranças mais recentes e ignorar canceladas se houver ativas
      if (paymentsToSync.length > 1) {
        paymentsToSync.sort((a, b) =>
          new Date(b.dateCreated).getTime() - new Date(a.dateCreated).getTime()
        );
        const activePayments = paymentsToSync.filter((p) =>
          p.status !== 'DELETED' && p.status !== 'CANCELED'
        );
        if (activePayments.length > 0) {
          paymentsToSync = activePayments;
        }
      }

      if (paymentsToSync.length === 0) {
        const errorMsg = debugAsaasResponse?.errors
          ? debugAsaasResponse.errors[0].description
          : 'Nenhum pagamento concluído encontrado para este link ainda.';
        return new Response(
          JSON.stringify({
            success: true,
            message: `Status atual: PENDENTE. (${errorMsg})`,
            newStatus: 'PENDING',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
        );
      }

      // 3. SE ENCONTROU PAGAMENTO NO ASAAS, ATUALIZA NOSSO BANCO DE DADOS
      // Atualiza o gateway_payment_id da fatura para o ID real pay_... se tiver trocado
      const realPayId = paymentsToSync[0]?.id;
      const invoiceNumber = paymentsToSync[0]?.invoiceNumber;
      if (realPayId && realPayId.startsWith('pay_')) {
        const payloadToUpdate: any = {
          gateway_payment_id: realPayId,
          payment_gateway_id: realPayId,
        };
        if (invoiceNumber) {
          payloadToUpdate.invoice_number = invoiceNumber;
        }
        if (currentItemType === 'ORDER') {
          await supabase.from('orders').update(payloadToUpdate).eq('id', invoiceIdToSync);
        } else if (currentItemType === 'QUOTE') {
          await supabase.from('quotes').update(payloadToUpdate).eq('id', invoiceIdToSync);
        } else {
          await supabase.from('invoices').update(payloadToUpdate).eq('id', invoiceIdToSync);
        }
      }

      // ESPELHAMENTO ESTRITO PARA O STATUS FINAL DA FATURA
      const hasPaid = paymentsToSync.some((p) =>
        p.status === 'RECEIVED' || p.status === 'CONFIRMED' || p.status === 'RECEIVED_IN_CASH' ||
        p.status === 'ANTICIPATED' || p.status === 'AUTHORIZED'
      );
      const allPaid = paymentsToSync.every((p) =>
        p.status === 'RECEIVED' || p.status === 'CONFIRMED' || p.status === 'RECEIVED_IN_CASH' ||
        p.status === 'ANTICIPATED' || p.status === 'AUTHORIZED'
      );
      const allCanceled = paymentsToSync.every((p) =>
        p.status === 'REFUNDED' || p.status === 'DELETED' || p.status === 'CANCELED'
      );
      const hasOverdue = paymentsToSync.some((p) => p.status === 'OVERDUE');

      let finalStatus = 'PENDING';
      if (allPaid) {
        finalStatus = 'PAID';
      } else if (hasPaid) {
        finalStatus = 'PARTIALLY_PAID';
      } else if (allCanceled) {
        finalStatus = 'CANCELED';
      } else if (hasOverdue) {
        finalStatus = 'OVERDUE';
      }

      const mainPaidDate = paymentsToSync.find((p) =>
        p.clientPaymentDate || p.paymentDate || p.confirmedDate
      )?.clientPaymentDate ||
        paymentsToSync.find((p) => p.paymentDate)?.paymentDate ||
        paymentsToSync.find((p) => p.confirmedDate)?.confirmedDate ||
        (finalStatus === 'PAID' ? new Date().toISOString() : null);

      if (currentItemType === 'ORDER') {
        await supabase.from('orders').update({ status: finalStatus, billing_status: finalStatus })
          .eq('id', invoiceIdToSync);
      } else if (currentItemType === 'QUOTE') {
        await supabase.from('quotes').update({
          status: finalStatus === 'PAID' ? 'APPROVED' : finalStatus,
          billing_status: finalStatus,
        }).eq('id', invoiceIdToSync);
      } else {
        await Promise.all(paymentsToSync.map(async (pay) => {
          let statusBR = 'PENDING';
          if (
            pay.status === 'RECEIVED' || pay.status === 'CONFIRMED' ||
            pay.status === 'RECEIVED_IN_CASH' || pay.status === 'ANTICIPATED' ||
            pay.status === 'AUTHORIZED'
          ) statusBR = 'PAID';
          if (pay.status === 'OVERDUE') statusBR = 'OVERDUE';
          if (pay.status === 'REFUNDED' || pay.status === 'DELETED' || pay.status === 'CANCELED') {
            statusBR = 'CANCELED';
          }

          const instNum = pay.installmentNumber || 1;
          const paidAtDate = pay.clientPaymentDate || pay.paymentDate || pay.confirmedDate ||
            pay.creditDate || (statusBR === 'PAID' ? new Date().toISOString() : null);

          await supabase.from('invoice_installments')
            .update({
              status: statusBR,
              paid_at: statusBR === 'PAID' ? paidAtDate : null,
              gateway_ticket_url: pay.invoiceUrl || pay.bankSlipUrl || pay.hostedCheckoutUrl,
              gateway_payment_id: pay.id || undefined,
              payment_method: pay.billingType === 'PIX'
                ? 'Pix'
                : (pay.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto'),
            })
            .eq('invoice_id', invoiceIdToSync)
            .eq('installment_number', instNum);

          if (statusBR === 'PAID') {
            const { data: existingCf } = await supabase.from('cash_flow').select('id').eq(
              'reference_id',
              invoiceIdToSync + '_' + instNum,
            ).maybeSingle();
            if (!existingCf) {
              await supabase.from('cash_flow').insert({
                tenant_id: tenantId,
                type: 'INCOME',
                category: 'Recebimento de Fatura (Parcela)',
                amount: pay.value,
                description: `Pagamento via Asaas (Sincronização) - Fatura ${
                  displayId || invoiceIdToSync.slice(0, 8)
                }`,
                reference_id: invoiceIdToSync + '_' + instNum,
                reference_type: 'INSTALLMENT',
                payment_method: pay.billingType === 'PIX'
                  ? 'Pix'
                  : (pay.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto'),
                entry_date: paidAtDate || new Date().toISOString(),
                created_by: 'sync-asaas',
              });
            }
          } else if (statusBR === 'PENDING' || statusBR === 'CANCELED') {
            await supabase.from('cash_flow').delete().eq(
              'reference_id',
              invoiceIdToSync + '_' + instNum,
            ).eq('created_by', 'sync-asaas');
          }
        }));

        await supabase.from('invoices').update({
          status: finalStatus,
          paid_at: finalStatus === 'PAID' ? mainPaidDate : null,
        }).eq('id', invoiceIdToSync);
      }

      const statusMsg = finalStatus === 'PAID'
        ? 'PAGO / LIQUIDADO'
        : (finalStatus === 'OVERDUE'
          ? 'VENCIDO / ATRASADO'
          : (finalStatus === 'CANCELED' ? 'CANCELADO' : 'PENDENTE'));
      return new Response(
        JSON.stringify({
          success: true,
          newStatus: finalStatus,
          realPaymentId: realPayId,
          message: `Status no Asaas: ${statusMsg}`,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // ==========================================
    // ROTA DE CRIAÇÃO (Gerar Cobrança)
    // ==========================================

    // CANCELAMENTO PRÉVIO: Se estamos refaturando, cancelar faturas antigas no Asaas
    try {
      if (itemId) {
        const existingRes = await fetch(
          ASAAS_API_URL + '/payments?externalReference=' + itemId + '&limit=50',
          { headers },
        );
        const existingData = await existingRes.json();
        if (existingData.data && existingData.data.length > 0) {
          for (const oldPay of existingData.data) {
            if (oldPay.status === 'PENDING' || oldPay.status === 'OVERDUE') {
              // Cancela cobrança antiga pendente/vencida para evitar links duplicados
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
    if (paymentMethodType === 'bank_slip' || paymentMethodType === 'boleto') {
      asaasBillingType = 'BOLETO';
    }
    if (paymentMethodType === 'pix') asaasBillingType = 'PIX';

    const safeAmount = Number((parseFloat(amount) || 0).toFixed(2));
    // PIX é estritamente à vista (1 parcela). Parcelamento apenas para Boleto (>1) e Cartão de Crédito.
    const safeInstallments = asaasBillingType === 'PIX' ? 1 : (parseInt(installments) || 1);
    let dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 3);
    const dueDateStr = dueDate.toISOString().split('T')[0];

    const typeLabel = itemType === 'INVOICE'
      ? 'Fatura'
      : (itemType === 'ORDER' ? 'OS' : (itemType === 'QUOTE' ? 'Orç.' : itemType));
    const shortId = displayId || (itemId ? itemId.substring(0, 8) : '');
    const descriptionText = `${typeLabel} #${shortId}`;
    const updateTable = itemType === 'ORDER'
      ? 'orders'
      : (itemType === 'QUOTE' ? 'quotes' : 'invoices');

    const payloadDoc = documentNumber || payload.customerDocument;
    let cleanDoc = payloadDoc?.replace(/\D/g, '');

    let realName = name || customerName || '';
    let realEmail = email || customerEmail || '';
    let realPhone = phone || customerPhone || '';
    let realAddress = address || '';
    let realAddressNumber = addressNumber || '';
    let realProvince = province || '';
    let realCity = '';
    let realState = '';
    let realZipCode = '';
    let realWhatsapp = '';

    if (customerId) {
      const { data: customerData } = await supabase.from('customers')
        .select(
          'name, email, phone, whatsapp, document, address, number, neighborhood, city, state, zip_code',
        )
        .eq('id', customerId)
        .maybeSingle();
      if (customerData) {
        if (!realName) realName = customerData.name || '';
        if (!realEmail) realEmail = customerData.email || '';
        if (!realPhone) realPhone = customerData.phone || customerData.whatsapp || '';
        if (!realAddress) realAddress = customerData.address || '';
        if (!realAddressNumber) realAddressNumber = customerData.number || '';
        if (!realProvince) realProvince = customerData.neighborhood || '';
        realCity = customerData.city || '';
        realState = customerData.state || '';
        realZipCode = customerData.zip_code?.replace(/\D/g, '') || '';
        realWhatsapp = customerData.whatsapp || '';
        if (!cleanDoc && customerData.document) cleanDoc = customerData.document.replace(/\D/g, '');
      }
    }

    // Fallback 2: se ainda não temos documento e temos itemId (INVOICE), busca direto na fatura
    if (!cleanDoc && itemType === 'INVOICE' && itemId) {
      const { data: invData } = await supabase
        .from('invoices')
        .select('customer_document, customer_id')
        .eq('id', itemId)
        .maybeSingle();
      if (invData?.customer_document) {
        cleanDoc = invData.customer_document.replace(/\D/g, '');
      }
      // Fallback 3: busca pelo customer_id da fatura se ainda não tem documento
      if (!cleanDoc && invData?.customer_id) {
        const { data: custFallback } = await supabase
          .from('customers')
          .select('document, name, email, phone, whatsapp, address, number, neighborhood, city, state, zip_code')
          .eq('id', invData.customer_id)
          .maybeSingle();
        if (custFallback) {
          if (custFallback.document) cleanDoc = custFallback.document.replace(/\D/g, '');
          if (!realName) realName = custFallback.name || '';
          if (!realEmail) realEmail = custFallback.email || '';
          if (!realPhone) realPhone = custFallback.phone || custFallback.whatsapp || '';
          if (!realAddress) realAddress = custFallback.address || '';
          if (!realAddressNumber) realAddressNumber = custFallback.number || '';
          if (!realProvince) realProvince = custFallback.neighborhood || '';
          if (!realZipCode) realZipCode = custFallback.zip_code?.replace(/\D/g, '') || '';
          if (!realWhatsapp) realWhatsapp = custFallback.whatsapp || '';
        }
      }
    }

    if (!realName) realName = 'Cliente Nexus';
    if (!realEmail) realEmail = 'cliente@nexussis.com';
    if (!realPhone && realWhatsapp) realPhone = realWhatsapp;
    if (!realPhone) realPhone = '00000000000';

    if (!cleanDoc) throw new Error('CPF/CNPJ do cliente é obrigatório para gerar faturas.');

    const asaasCustomerPayload: any = {
      name: realName,
      email: realEmail,
      phone: realPhone.replace(/\D/g, ''),
      mobilePhone: (realWhatsapp || realPhone).replace(/\D/g, ''),
      cpfCnpj: cleanDoc,
      postalCode: realZipCode || undefined,
      address: realAddress || undefined,
      addressNumber: realAddressNumber || undefined,
      province: realProvince || undefined,
      externalReference: customerId || undefined,
      notificationDisabled: true,
    };

    Object.keys(asaasCustomerPayload).forEach((key) =>
      asaasCustomerPayload[key] === undefined && delete asaasCustomerPayload[key]
    );

    let customerIdAsaas = '';
    const asaasCustRes = await fetch(ASAAS_API_URL + '/customers?cpfCnpj=' + cleanDoc, { headers });
    const asaasCustData = await asaasCustRes.json();

    if (asaasCustData.data && asaasCustData.data.length > 0) {
      customerIdAsaas = asaasCustData.data[0].id;
      const updatePayload = { ...asaasCustomerPayload };
      delete updatePayload.cpfCnpj;
      delete updatePayload.notificationDisabled;

      const updateRes = await fetch(ASAAS_API_URL + '/customers/' + customerIdAsaas, {
        method: 'PUT',
        headers,
        body: JSON.stringify(updatePayload),
      });
      const updateData = await updateRes.json();
      if (updateData.errors) {
        console.error('[Asaas Customer Update Error]', updateData.errors);
      }
    } else {
      const createCustRes = await fetch(ASAAS_API_URL + '/customers', {
        method: 'POST',
        headers,
        body: JSON.stringify(asaasCustomerPayload),
      });
      const createCustData = await createCustRes.json();
      if (createCustData.errors) {
        throw new Error(
          'Erro ao cadastrar cliente no Asaas: ' + createCustData.errors[0].description,
        );
      }
      customerIdAsaas = createCustData.id;
    }

    let paymentData: any = {};
    let hostedCheckoutUrl = '';

    // Se for Cartão de Crédito e parcelado, usamos o Checkout do Asaas
    // O Checkout permite fixar o cliente (para os dados irem preenchidos) e travar as parcelas.
    const useCheckout = asaasBillingType === 'CREDIT_CARD' && safeInstallments > 1;

    if (useCheckout) {
      const checkoutPayload: any = {
        customer: customerIdAsaas,
        billingTypes: ['CREDIT_CARD'],
        chargeTypes: ['DETACHED', 'INSTALLMENT'],
        installment: {
          maxInstallmentCount: safeInstallments,
        },
        minutesToExpire: 1440,
        externalReference: itemId,
        callback: {
          successUrl: 'https://nexussis.com',
          cancelUrl: 'https://nexussis.com',
          expiredUrl: 'https://nexussis.com',
          autoRedirect: false,
        },
        items: [
          {
            name: descriptionText.substring(0, 30),
            amount: 1,
            quantity: 1,
            value: safeAmount,
          },
        ],
      };

      const createCheckoutRes = await fetch(ASAAS_API_URL + '/checkouts', {
        method: 'POST',
        headers,
        body: JSON.stringify(checkoutPayload),
      });
      paymentData = await createCheckoutRes.json();
      if (paymentData.errors) {
        throw new Error('Erro ao gerar checkout Asaas: ' + paymentData.errors[0].description);
      }

      const baseUrl = isSandbox ? 'https://sandbox.asaas.com' : 'https://www.asaas.com';
      hostedCheckoutUrl = baseUrl + '/checkoutSession/show?id=' + paymentData.id;
      paymentData.dueDate = dueDateStr;
    } else {
      const paymentPayload: any = {
        customer: customerIdAsaas,
        billingType: asaasBillingType,
        dueDate: dueDateStr,
        description: descriptionText,
        externalReference: itemId,
        value: safeAmount,
      };

      if (safeInstallments > 1) {
        // Se for Boleto parcelado, cria um Carnê
        paymentPayload.totalValue = safeAmount;
        paymentPayload.installmentCount = safeInstallments;
        delete paymentPayload.value;
      }
      if (WALLET_ID) paymentPayload.split = [{ walletId: WALLET_ID, fixedValue: safeAmount }];

      const createPaymentRes = await fetch(ASAAS_API_URL + '/payments', {
        method: 'POST',
        headers,
        body: JSON.stringify(paymentPayload),
      });
      paymentData = await createPaymentRes.json();
      if (paymentData.errors) {
        throw new Error('Erro ao gerar cobrança Asaas: ' + paymentData.errors[0].description);
      }

      hostedCheckoutUrl = paymentData.invoiceUrl || paymentData.bankSlipUrl || '';
    }

    const responseData = {
      success: true,
      paymentId: typeof paymentData.installment === 'string'
        ? paymentData.installment
        : paymentData.id,
      singlePaymentId: paymentData.id,
      status: paymentData.status || 'PENDING',
      hostedCheckoutUrl: hostedCheckoutUrl,
      ticketUrl: paymentData.bankSlipUrl || paymentData.invoiceUrl || hostedCheckoutUrl,
      pixCopiaECola: '',
      qrCodeBase64: '',
      expiresAt: paymentData.dueDate || dueDateStr,
    };

    if (asaasBillingType === 'PIX') {
      const pixRes = await fetch(ASAAS_API_URL + '/payments/' + paymentData.id + '/pixQrCode', {
        headers,
      });
      const pixData = await pixRes.json();
      if (!pixData.errors) {
        responseData.pixCopiaECola = pixData.payload;
        responseData.qrCodeBase64 = pixData.encodedImage;
      }
    }

    const payloadToUpdate: any = {
      gateway_payment_id: paymentData.id,
      payment_gateway_id: paymentData.id,
      gateway_provider: 'asaas',
      gateway_status: paymentData.status,
      gateway_ticket_url: hostedCheckoutUrl,
      gateway_pix_code: responseData.pixCopiaECola,
    };
    if (paymentData.invoiceNumber) {
      payloadToUpdate.invoice_number = paymentData.invoiceNumber;
    }

    await supabase.from(updateTable).update(payloadToUpdate).eq('id', itemId);

    if (itemType === 'INVOICE') {
      await supabase.from('invoice_installments').delete().eq('invoice_id', itemId).eq(
        'status',
        'PENDING',
      );

      if (safeInstallments > 1 && paymentData.installment) {
        let instData: any = { data: [] };
        for (let i = 0; i < 3; i++) {
          const instRes = await fetch(
            ASAAS_API_URL + '/payments?installment=' + paymentData.installment + '&limit=100',
            { headers },
          );
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
