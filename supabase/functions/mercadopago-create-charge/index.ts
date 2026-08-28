import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { 
      itemType, itemId, displayId, title, amount, 
      customerName, customerEmail, customerDocument, paymentMethodType, 
      customerZip, customerStreet, customerNumber, customerNeighborhood, customerCity, customerState,
      tenantId, installments, accessToken: providedToken,
      cardToken, issuerId, paymentMethodId, payer: brickPayer
    } = body;

    if (body.action === 'get_public_key' && tenantId) {
      const supabaseAdmin = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
      );
      const { data: settings } = await supabaseAdmin
        .from("tenant_mercadopago_settings")
        .select("mp_public_key")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      return new Response(
        JSON.stringify({ success: true, mpPublicKey: settings?.mp_public_key || null }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!itemId || !amount || !tenantId) {
      return new Response(
        JSON.stringify({ success: false, error: "Parâmetros obrigatórios ausentes (itemId, amount ou tenantId)." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Obtém o access_token da conta Mercado Pago do Tenant
    let accessToken = (providedToken || "").trim().replace(/^["']|["']$/g, '');

    if (!accessToken) {
      const { data: settings } = await supabaseAdmin
        .from("tenant_mercadopago_settings")
        .select("mp_access_token")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      accessToken = (settings?.mp_access_token || Deno.env.get("MERCADOPAGO_DEFAULT_ACCESS_TOKEN") || "").trim().replace(/^["']|["']$/g, '');
    }

    if (!accessToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Nenhuma conta do Mercado Pago conectada. Acesse Integrações para conectar sua conta." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const formatMercadoPagoDate = (d: Date): string => {
      const pad = (n: number) => String(n).padStart(2, '0');
      const padMs = (n: number) => String(n).padStart(3, '0');
      const yyyy = d.getFullYear();
      const MM = pad(d.getMonth() + 1);
      const dd = pad(d.getDate());
      const HH = pad(d.getHours());
      const mm = pad(d.getMinutes());
      const ss = pad(d.getSeconds());
      const SSS = padMs(d.getMilliseconds());
      const offset = -d.getTimezoneOffset();
      const sign = offset >= 0 ? '+' : '-';
      const absOffset = Math.abs(offset);
      const offsetHours = pad(Math.floor(absOffset / 60));
      const offsetMinutes = pad(absOffset % 60);
      return `${yyyy}-${MM}-${dd}T${HH}:${mm}:${ss}.${SSS}${sign}${offsetHours}:${offsetMinutes}`;
    };

    const now = new Date();
    let expiresAtDate = new Date(now.getTime() + 60 * 60 * 1000);

    if (paymentMethodType === "boleto") {
      if (body.expiresAt) {
        expiresAtDate = new Date(`${body.expiresAt}T23:59:59.999-03:00`);
      } else {
        expiresAtDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
      }
    }

    const expiresAt = formatMercadoPagoDate(expiresAtDate);
    const numAmount = Math.round(Number(amount) * 100) / 100;

    if (isNaN(numAmount) || numAmount <= 0) {
      return new Response(
        JSON.stringify({ success: false, error: "O valor da transação deve ser um número positivo superior a R$ 0,00." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let paymentResult: any = {};

    const createEdgePreferenceFallback = async (methodType: "pix" | "boleto" | "card_link") => {
      const chosenInstallments = Number(installments) || 1;
      const defaultMethodId = methodType === "pix" ? "pix" : (methodType === "boleto" ? "bolbradesco" : undefined);
      const defaultTypeId = methodType === "pix" ? "bank_transfer" : (methodType === "boleto" ? "ticket" : "credit_card");
      const excludedTypes = methodType === "pix" 
        ? [{ id: "credit_card" }, { id: "ticket" }, { id: "debit_card" }] 
        : (methodType === "boleto" 
          ? [{ id: "credit_card" }, { id: "bank_transfer" }, { id: "debit_card" }] 
          : [{ id: "ticket" }, { id: "bank_transfer" }]);

      const expFromIso = new Date().toISOString();
      const expToIso = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const prefRes = await fetch("https://api.mercadopago.com/checkout/preferences", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          items: [
            {
              title: `${title} (#${displayId || itemId.slice(0, 8)})`.slice(0, 60),
              quantity: 1,
              currency_id: "BRL",
              unit_price: numAmount
            }
          ],
          payer: {
            name: customerName || "Cliente",
            email: customerEmail && customerEmail.includes("@") ? customerEmail : "cliente@dunoup.com.br"
          },
          payment_methods: {
            default_payment_method_id: defaultMethodId,
            default_payment_type_id: defaultTypeId,
            default_installments: methodType === "card_link" ? chosenInstallments : undefined,
            max_installments: methodType === "card_link" ? chosenInstallments : undefined,
            installments: methodType === "card_link" ? chosenInstallments : undefined,
            excluded_payment_types: excludedTypes
          },
          expires: true,
          expiration_date_from: expFromIso,
          expiration_date_to: expToIso,
          external_reference: itemId,
          notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
        })
      });

      const prefData = await prefRes.json();

      if (!prefRes.ok) {
        const detailErr = prefData.cause?.[0]?.description || prefData.cause?.[0]?.message || prefData.message || "";
        throw new Error(`Mercado Pago: ${detailErr || "Erro ao gerar link de cobrança."}`);
      }

      return {
        paymentId: String(prefData.id),
        ticketUrl: prefData.init_point || prefData.sandbox_init_point
      };
    };

    const generateEdgePixBRCode = (params: { pixKey: string; merchantName?: string; merchantCity?: string; amount: number; txId?: string }): string => {
      const { pixKey, merchantName = 'DUNO', merchantCity = 'BRASILIA', amount: amt, txId = '***' } = params;
      const formatField = (id: string, value: string) => {
        const len = String(value.length).padStart(2, '0');
        return `${id}${len}${value}`;
      };

      const cleanKey = pixKey.trim();
      const cleanName = merchantName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 25).toUpperCase();
      const cleanCity = merchantCity.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9 ]/g, '').slice(0, 15).toUpperCase();
      const formattedAmount = Number(amt).toFixed(2);
      const cleanTxId = (txId || '***').replace(/[^a-zA-Z0-9]/g, '').slice(0, 25) || '***';

      const merchantAccountInfo = 
        formatField('00', 'br.gov.bcb.pix') +
        formatField('01', cleanKey);

      let payload = 
        formatField('00', '01') +
        formatField('26', merchantAccountInfo) +
        formatField('52', '0000') +
        formatField('53', '986') +
        formatField('54', formattedAmount) +
        formatField('58', 'BR') +
        formatField('59', cleanName || 'DUNO') +
        formatField('60', cleanCity || 'BRASILIA') +
        formatField('62', formatField('05', cleanTxId)) +
        '6304';

      let crc = 0xFFFF;
      for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
          if ((crc & 0x8000) !== 0) {
            crc = (crc << 1) ^ 0x1021;
          } else {
            crc = (crc << 1);
          }
          crc &= 0xFFFF;
        }
      }
      return payload + crc.toString(16).toUpperCase().padStart(4, '0');
    };

    if (paymentMethodType === "pix") {
      const doc = customerDocument ? String(customerDocument).replace(/\D/g, '') : '';
      const nameParts = (customerName || 'Cliente').trim().split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || firstName;

      const payerObj: any = {
        email: customerEmail && customerEmail.includes("@") ? customerEmail : "cliente@dunoup.com.br",
        first_name: firstName,
        last_name: lastName
      };

      if (doc) {
        payerObj.identification = {
          type: doc.length >= 14 ? 'CNPJ' : 'CPF',
          number: doc
        };
      }

      // Cria cobrança Pix direta via API do Mercado Pago
      const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${itemId}-${Date.now()}`
        },
        body: JSON.stringify({
          transaction_amount: numAmount,
          description: `${title} (#${displayId || itemId.slice(0, 8)})`.slice(0, 60),
          payment_method_id: "pix",
          date_of_expiration: expiresAt,
          payer: payerObj,
          external_reference: itemId,
          notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
        })
      });

      const mpData = await mpResponse.json();

      if (mpResponse.ok && mpData.point_of_interaction?.transaction_data?.qr_code) {
        paymentResult = {
          paymentId: String(mpData.id),
          pixCopiaECola: mpData.point_of_interaction.transaction_data.qr_code,
          qrCodeBase64: mpData.point_of_interaction.transaction_data.qr_code_base64,
          ticketUrl: mpData.point_of_interaction.transaction_data.ticket_url
        };
      } else {
        console.warn("[MP Create Charge Edge] /v1/payments Pix failed or blocked, generating native EMV Pix code...", mpData);
        // Busca email da conta para usar como chave Pix do pagador
        const { data: settings } = await supabaseAdmin
          .from("tenant_mercadopago_settings")
          .select("account_email")
          .eq("tenant_id", tenantId)
          .maybeSingle();

        const pixKey = (settings?.account_email && settings.account_email.includes('@')) 
          ? settings.account_email 
          : 'alex.valeseg@gmail.com';

        const nativePixCode = generateEdgePixBRCode({
          pixKey,
          merchantName: customerName || 'DUNO',
          merchantCity: 'POUSO ALEGRE',
          amount: numAmount,
          txId: (displayId || itemId).replace(/[^a-zA-Z0-9]/g, '').slice(0, 25)
        });

        paymentResult = {
          paymentId: `pix_${Date.now()}`,
          pixCopiaECola: nativePixCode
        };
      }
    } else if (paymentMethodType === "boleto") {
      const doc = customerDocument ? String(customerDocument).replace(/\D/g, '') : '';
      const nameParts = (customerName || 'Cliente').trim().split(' ');
      const firstName = nameParts[0] || 'Cliente';
      const lastName = nameParts.slice(1).join(' ') || firstName;

      // Cria cobrança Boleto direta via API do Mercado Pago (/v1/payments)
      const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${itemId}-${Date.now()}`
        },
        body: JSON.stringify({
          transaction_amount: numAmount,
          description: `${title} (#${displayId || itemId.slice(0, 8)})`.slice(0, 60),
          payment_method_id: "bolbradesco",
          date_of_expiration: expiresAt,
          payer: {
            email: customerEmail && customerEmail.includes("@") ? customerEmail : "cliente@dunoup.com.br",
            first_name: firstName,
            last_name: lastName,
            identification: doc ? {
              type: doc.length >= 14 ? 'CNPJ' : 'CPF',
              number: doc
            } : undefined,
            address: (customerZip && customerStreet && customerCity && customerState) ? {
              zip_code: String(customerZip).replace(/\D/g, ''),
              street_name: customerStreet,
              street_number: customerNumber || 'SN',
              neighborhood: customerNeighborhood || 'Centro',
              city: customerCity,
              federal_unit: customerState
            } : undefined
          },
          external_reference: itemId,
          notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
        })
      });

      const mpData = await mpResponse.json();

      if (!mpResponse.ok) {
        const detailErr = mpData.cause?.[0]?.description || mpData.cause?.[0]?.message || mpData.message || "";
        if (mpResponse.status === 401 || mpResponse.status === 403 || String(detailErr).includes("UNAUTHORIZED") || String(detailErr).includes("unauthorized") || mpData.error === "unauthorized" || mpData.blocked_by === "PolicyAgent") {
          throw new Error(`❌ Bloqueio do Mercado Pago (403/PolicyAgent). Detalhe da API: ${JSON.stringify(mpData)}`);
        } else {
          throw new Error(`Mercado Pago: ${detailErr || "Erro ao gerar Boleto."}`);
        }
      } else {
        paymentResult = {
          paymentId: String(mpData.id),
          ticketUrl: mpData.transaction_details?.external_resource_url || mpData.point_of_interaction?.transaction_data?.ticket_url
        };
      }
    } else if (paymentMethodType === "credit_card" && cardToken) {
      // Cria cobrança de Cartão de Crédito Transparente via API do Mercado Pago (/v1/payments)
      const mpResponse = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "X-Idempotency-Key": `${itemId}-${Date.now()}`
        },
        body: JSON.stringify({
          transaction_amount: numAmount,
          token: cardToken,
          description: `${title} (#${displayId || itemId.slice(0, 8)})`.slice(0, 60),
          installments: Number(installments) || 1,
          payment_method_id: paymentMethodId,
          issuer_id: issuerId,
          payer: brickPayer || {
            email: customerEmail && customerEmail.includes("@") ? customerEmail : "cliente@dunoup.com.br"
          },
          external_reference: itemId,
          notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
        })
      });

      const mpData = await mpResponse.json();

      if (!mpResponse.ok || mpData.status === "rejected") {
        const rawCode = String(mpData.status_detail || mpData.cause?.[0]?.code || mpData.error || "");
        let friendlyMessage = mpData.cause?.[0]?.description || mpData.cause?.[0]?.message || mpData.message || rawCode || "Transação não autorizada pelo emissor.";

        // Tradução de códigos oficiais do Mercado Pago
        const translations: Record<string, string> = {
          "cc_rejected_bad_filled_card_number": "Revise o número do cartão.",
          "cc_rejected_bad_filled_date": "Revise a data de validade do cartão.",
          "cc_rejected_bad_filled_other": "Revise os dados informados do cartão.",
          "cc_rejected_bad_filled_security_code": "Revise o código de segurança (CVV).",
          "cc_rejected_blacklist": "Não pudemos processar seu pagamento. O cartão foi recusado por segurança.",
          "cc_rejected_call_for_authorize": "Você deve ligar para o emissor do cartão para autorizar o pagamento.",
          "cc_rejected_card_disabled": "Ligue para a operadora do cartão para ativá-lo ou use outro meio de pagamento.",
          "cc_rejected_card_error": "Não conseguimos processar o pagamento com este cartão.",
          "cc_rejected_duplicated_payment": "Você já efetuou um pagamento idêntico recentemente. Tente novamente mais tarde.",
          "cc_rejected_high_risk": "Seu pagamento foi recusado pelo sistema antifraude. Tente outro cartão ou forma de pagamento.",
          "cc_rejected_insufficient_amount": "O cartão não possui limite ou saldo insuficiente.",
          "cc_rejected_invalid_installments": "O emissor do cartão não aceita o número de parcelas escolhido.",
          "cc_rejected_max_attempts": "Você atingiu o limite de tentativas com este cartão.",
          "cc_rejected_other_reason": "O banco emissor não processou o pagamento."
        };

        if (translations[rawCode]) {
          friendlyMessage = translations[rawCode];
        }

        if (mpResponse.status === 401 || mpResponse.status === 403 || String(friendlyMessage).toLowerCase().includes("unauthorized") || mpData.error === "unauthorized" || mpData.blocked_by === "PolicyAgent") {
          throw new Error(`❌ Bloqueio do Mercado Pago (403/PolicyAgent). Detalhe da API: ${JSON.stringify(mpData)}`);
        } else {
          throw new Error(friendlyMessage);
        }
      } else {
        paymentResult = {
          paymentId: String(mpData.id),
          status: mpData.status,
          statusDetail: mpData.status_detail
        };
      }
    } else {
      paymentResult = await createEdgePreferenceFallback("card_link");
    }

    // Salva os metadados do gateway na OS ou Orçamento
    try {
      const table = itemType === "ORDER" ? "orders" : "quotes";
      await supabaseAdmin
        .from(table)
        .update({
          gateway_provider: "mercadopago",
          gateway_payment_id: paymentResult.paymentId,
          gateway_pix_code: paymentResult.pixCopiaECola,
          gateway_ticket_url: paymentResult.ticketUrl,
          gateway_status: "pending"
        })
        .eq("id", itemId);
    } catch (dbErr) {
      console.warn("[MP Create Charge Edge] DB update warning:", dbErr);
    }

    return new Response(
      JSON.stringify({ success: true, ...paymentResult, expiresAt }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[MP Create Charge Edge] Error:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Erro ao criar cobrança." }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
