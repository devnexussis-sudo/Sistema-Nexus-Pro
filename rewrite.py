import sys

content = """import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const payload = await req.json();
    const { action } = payload;

    const tenantId = payload.tenantId;
    if (!tenantId) {
      throw new Error('O parâmetro tenantId é obrigatório.');
    }

    // 1. Obter configurações do Asaas do Tenant
    const { data: asaasSettings, error: settingsError } = await supabase
      .from('tenant_asaas_settings')
      .select('*')
      .eq('tenant_id', tenantId)
      .single();

    if (settingsError || !asaasSettings?.asaas_api_key) {
      throw new Error('Integração Asaas não configurada para esta empresa.');
    }

    const ASAAS_API_URL = asaasSettings.is_sandbox !== false 
      ? 'https://sandbox.asaas.com/api/v3' 
      : 'https://api.asaas.com/v3';
    
    const ASAAS_API_KEY = asaasSettings.asaas_api_key;
    const WALLET_ID = asaasSettings.asaas_wallet_id;

    const headers = {
      'Content-Type': 'application/json',
      'access_token': ASAAS_API_KEY,
    };

    // CANCELAR PAGAMENTO
    if (action === 'cancel_payment') {
      const { paymentId } = payload;
      if (!paymentId) throw new Error('Missing paymentId to cancel');

      const delRes = await fetch(ASAAS_API_URL + '/payments/' + paymentId, {
        method: 'DELETE',
        headers
      });
      const delData = await delRes.json();
      
      if (delData.errors) {
        throw new Error('Erro ao cancelar no Asaas: ' + delData.errors[0].description);
      }

      const { data: updatedInstallment } = await supabase.from('invoice_installments').update({
        status: 'CANCELED'
      }).eq('gateway_payment_id', paymentId).select('invoice_id').maybeSingle();

      if (updatedInstallment) {
        const { data: allInst } = await supabase.from('invoice_installments').select('status').eq('invoice_id', updatedInstallment.invoice_id);
        const allCanceled = allInst?.every(i => i.status === 'CANCELED');
        if (allCanceled) {
          await supabase.from('invoices').update({ status: 'CANCELED' }).eq('id', updatedInstallment.invoice_id);
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Pagamento cancelado com sucesso.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // SINCRONIZAR STATUS MANUALMENTE
    if (action === 'sync_payment') {
      const { paymentId } = payload;
      if (!paymentId) throw new Error('Missing paymentId to sync');

      const pRes = await fetch(ASAAS_API_URL + '/payments/' + paymentId, { headers });
      const pData = await pRes.json();
      if (pData.errors) {
        throw new Error('Erro ao buscar pagamento no Asaas: ' + pData.errors[0].description);
      }

      const asaasStatus = pData.status;
      let newStatus = 'PENDING';
      if (asaasStatus === 'CONFIRMED' || asaasStatus === 'RECEIVED' || asaasStatus === 'RECEIVED_IN_CASH') {
        newStatus = 'PAID';
      } else if (asaasStatus === 'OVERDUE') {
        newStatus = 'OVERDUE';
      } else if (asaasStatus === 'REFUNDED') {
        newStatus = 'REFUNDED';
      } else if (asaasStatus === 'CANCELED') {
        newStatus = 'CANCELED';
      }

      const { data: updatedInst } = await supabase.from('invoice_installments').update({
        status: newStatus
      }).eq('gateway_payment_id', paymentId).select('invoice_id, amount').maybeSingle();

      if (updatedInst) {
        const invoiceId = updatedInst.invoice_id;
        const { data: allInst } = await supabase.from('invoice_installments').select('status').eq('invoice_id', invoiceId);
        
        let invoiceStatus = 'PENDING';
        if (allInst && allInst.length > 0) {
          const allPaid = allInst.every(i => i.status === 'PAID');
          const allCanceled = allInst.every(i => i.status === 'CANCELED');
          if (allPaid) invoiceStatus = 'PAID';
          else if (allCanceled) invoiceStatus = 'CANCELED';
          else if (allInst.some(i => i.status === 'OVERDUE')) invoiceStatus = 'OVERDUE';
          else if (allInst.some(i => i.status === 'PAID')) invoiceStatus = 'PARTIALLY_PAID';
        }
        
        await supabase.from('invoices').update({ status: invoiceStatus }).eq('id', invoiceId);

        if (newStatus === 'PAID') {
          const { data: invoice } = await supabase.from('invoices').select('*').eq('id', invoiceId).single();
          if (invoice) {
            const asaasPayment = pData;
            await supabase.from('cash_flow').insert({
              tenant_id: tenantId,
              type: 'INCOME',
              category: 'Recebimento de Fatura',
              amount: asaasPayment.value,
              description: 'Pagamento integral via Asaas - Fatura ' + (invoice.display_id || invoice.id.slice(0,8)),
              reference_id: invoice.id,
              reference_type: 'INVOICE',
              payment_method: asaasPayment.billingType === 'PIX' ? 'Pix' : (asaasPayment.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto'),
              entry_date: new Date().toISOString(),
              created_by: 'webhook-asaas'
            });
          }
        }
      }

      return new Response(
        JSON.stringify({ success: true, message: 'Status sincronizado com sucesso.', newStatus }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    // CRIAR COBRANÇA
    const {
      itemType, itemId, displayId, title,
      customerName, customerEmail, customerDocument,
      paymentMethodType, expiresAt, cardData, remoteIp
    } = payload;

    if (!itemId || !customerDocument) {
      throw new Error('Faltam parâmetros obrigatórios: itemId ou customerDocument.');
    }

    let updateTable = '';
    if (itemType === 'ORDER') updateTable = 'orders';
    else if (itemType === 'QUOTE') updateTable = 'quotes';
    else if (itemType === 'INVOICE') updateTable = 'invoices';
    
    if (!updateTable) throw new Error('Tipo de item inválido');

    // 1. BUSCA OS DADOS DE FORMA SEGURA (Backend Authority)
    const { data: dbItem, error: dbItemError } = await supabase
      .from(updateTable)
      .select('*')
      .eq('id', itemId)
      .single();

    if (dbItemError || !dbItem) {
      throw new Error('Item não encontrado: ' + itemId);
    }

    let safeAmount = 0;
    let safeInstallments = 1;
    let dbCustomerId = dbItem.customer_id || dbItem.customerId; // O ORM pode ter nomes camelCase dependendo

    if (itemType === 'INVOICE') {
      safeAmount = Math.max(0, (dbItem.total_amount || 0) - (dbItem.discount_amount || 0) + (dbItem.shipping_amount || 0) + (dbItem.other_additions_amount || 0));
      
      if (dbItem.payment_method) {
        const match = dbItem.payment_method.match(/(\d+)x/i);
        if (match) {
          safeInstallments = parseInt(match[1], 10);
        }
      }
    } else {
      safeAmount = Math.max(0, (dbItem.total_amount || 0) - (dbItem.discount_amount || 0) + (dbItem.shipping_amount || 0) + (dbItem.other_additions_amount || 0));
    }

    if (safeAmount <= 0) {
      throw new Error('Valor da cobrança não pode ser zero ou negativo.');
    }

    // Busca dados complementares do cliente (telefone e endereço reais) para evitar recusa no Anti-Fraude do Asaas
    let dbCustomer: any = null;
    if (dbCustomerId) {
      const { data: cust } = await supabase.from('customers').select('*').eq('id', dbCustomerId).single();
      dbCustomer = cust;
    }

    const cleanDoc = customerDocument.replace(/\D/g, '');

    let customerId = '';
    const asaasCustRes = await fetch(ASAAS_API_URL + '/customers?cpfCnpj=' + cleanDoc, { headers });
    const asaasCustData = await asaasCustRes.json();

    if (asaasCustData.data && asaasCustData.data.length > 0) {
      customerId = asaasCustData.data[0].id;
    } else {
      const createCustRes = await fetch(ASAAS_API_URL + '/customers', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          name: customerName || 'Cliente Duno',
          cpfCnpj: cleanDoc,
          email: customerEmail || undefined,
          notificationDisabled: true, 
        })
      });
      const createCustData = await createCustRes.json();
      if (createCustData.errors) {
        throw new Error('Erro ao criar cliente no Asaas: ' + createCustData.errors[0].description);
      }
      customerId = createCustData.id;
    }

    const dueDate = expiresAt || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    let asaasBillingType = 'BOLETO';
    if (paymentMethodType === 'pix') asaasBillingType = 'PIX';
    else if (paymentMethodType === 'credit_card') asaasBillingType = 'CREDIT_CARD';
    
    let description = title || 'Pagamento de ' + itemType + ' #' + (displayId || itemId);

    const paymentPayload: any = {
      customer: customerId,
      billingType: asaasBillingType,
      dueDate: dueDate,
      description: description,
      externalReference: itemId,
    };

    if (safeInstallments && safeInstallments > 1) {
      paymentPayload.installmentCount = safeInstallments;
      paymentPayload.installmentValue = Number((safeAmount / safeInstallments).toFixed(2));
    } else {
      paymentPayload.value = safeAmount;
    }

    if (WALLET_ID) {
      paymentPayload.split = [{
        walletId: WALLET_ID,
        fixedValue: safeAmount,
      }];
    }

    if (asaasBillingType === 'CREDIT_CARD' && cardData) {
      paymentPayload.creditCard = {
        holderName: cardData.holderName,
        number: cardData.number,
        expiryMonth: cardData.expiryMonth,
        expiryYear: cardData.expiryYear,
        ccv: cardData.ccv
      };
      
      const realPhone = dbCustomer?.phone ? dbCustomer.phone.replace(/\D/g, '') : null;
      const realZip = dbCustomer?.zip_code ? dbCustomer.zip_code.replace(/\D/g, '') : null;
      
      paymentPayload.creditCardHolderInfo = {
        name: cardData.holderName,
        email: customerEmail || dbCustomer?.email || 'email@example.com',
        cpfCnpj: cleanDoc,
        postalCode: realZip && realZip.length === 8 ? realZip : (cardData.zipCode || '01001000'),
        addressNumber: dbCustomer?.address_number || cardData.addressNumber || '1',
        addressComplement: dbCustomer?.address_complement || cardData.addressComplement || null,
        phone: realPhone && (realPhone.length === 10 || realPhone.length === 11) ? realPhone : (cardData.phone || '11999999999')
      };
      
      paymentPayload.remoteIp = req.headers.get('x-forwarded-for')?.split(',')[0] || remoteIp || '127.0.0.1';
    }

    const createPaymentRes = await fetch(ASAAS_API_URL + '/payments', {
      method: 'POST',
      headers,
      body: JSON.stringify(paymentPayload)
    });
    
    const paymentData = await createPaymentRes.json();
    
    if (paymentData.errors) {
      throw new Error('Erro ao gerar pagamento: ' + paymentData.errors[0].description);
    }

    const responseData = {
      success: true,
      paymentId: paymentData.installment || paymentData.id,
      status: paymentData.status,
      ticketUrl: paymentData.bankSlipUrl || paymentData.invoiceUrl,
      pixCopiaECola: '',
      qrCodeBase64: '',
      expiresAt: paymentData.dueDate,
    };

    if (asaasBillingType === 'PIX') {
      const pixRes = await fetch(ASAAS_API_URL + '/payments/' + paymentData.id + '/pixQrCode', { headers });
      const pixData = await pixRes.json();
      if (!pixData.errors) {
        responseData.pixCopiaECola = pixData.payload;
        responseData.qrCodeBase64 = pixData.encodedImage;
      }
    }

    if (updateTable) {
      await supabase.from(updateTable).update({
        gateway_payment_id: paymentData.id,
        gateway_provider: 'asaas',
        gateway_status: paymentData.status,
        gateway_ticket_url: responseData.ticketUrl,
        gateway_pix_code: responseData.pixCopiaECola,
      }).eq('id', itemId);
    }

    if (itemType === 'INVOICE') {
      if (safeInstallments && safeInstallments > 1 && paymentData.installment) {
        let instData: any = { data: [] };
        
        // Tenta buscar até 3 vezes com 1s de intervalo, pois o Asaas gera assincronamente
        for (let i = 0; i < 3; i++) {
          const instRes = await fetch(ASAAS_API_URL + '/payments?installment=' + paymentData.installment + '&limit=100', { headers });
          instData = await instRes.json();
          if (instData.data && instData.data.length > 0) break;
          await new Promise(r => setTimeout(r, 1000));
        }

        // Remove cobranças antigas PENDENTES para não duplicar visualmente no painel
        await supabase.from('invoice_installments')
          .delete()
          .eq('invoice_id', itemId)
          .eq('status', 'PENDING');

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
              gateway_ticket_url: p.bankSlipUrl || p.invoiceUrl || responseData.ticketUrl,
              tenant_id: tenantId
          }));
          await supabase.from('invoice_installments').insert(insertPayload);
        }
      } else {
        // Remove cobranças antigas PENDENTES para não duplicar visualmente no painel
        await supabase.from('invoice_installments')
          .delete()
          .eq('invoice_id', itemId)
          .eq('status', 'PENDING');

        await supabase.from('invoice_installments').insert([{
            invoice_id: itemId,
            installment_number: 1,
            total_installments: 1,
            amount: paymentData.value,
            due_date: paymentData.dueDate,
            status: 'PENDING',
            payment_method: paymentMethodType,
            gateway_payment_id: paymentData.id,
            gateway_ticket_url: paymentData.bankSlipUrl || paymentData.invoiceUrl || responseData.ticketUrl,
            tenant_id: tenantId
        }]);
      }
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error: any) {
    console.error('Asaas Edge Function Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );
  }
});
"""

with open("/Users/alexcruz/Documents/Duno Project 2026 - full/Project Nexus Full/supabase/functions/asaas-create-charge/index.ts", "w") as f:
    f.write(content)

with open("/Users/alexcruz/.gemini/antigravity-ide/brain/dd02b240-e556-4e72-a7ca-640cb9b5bd51/edge_functions_code.md", "w") as f:
    f.write("```typescript\n" + content + "\n```")

