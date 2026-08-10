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
      tenantId, installments, accessToken: providedToken 
    } = body;

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
    let accessToken = providedToken || "";

    if (!accessToken) {
      const { data: settings } = await supabaseAdmin
        .from("tenant_mercadopago_settings")
        .select("mp_access_token")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      accessToken = settings?.mp_access_token || Deno.env.get("MERCADOPAGO_DEFAULT_ACCESS_TOKEN") || "";
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

    if (paymentMethodType === "pix") {
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
          payer: {
            email: customerEmail && customerEmail.includes("@") ? customerEmail : "cliente@nexus.com",
            first_name: customerName ? customerName.slice(0, 30) : "Cliente"
          },
          external_reference: itemId,
          notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
        })
      });

      const mpData = await mpResponse.json();

      if (!mpResponse.ok) {
        const detailErr = mpData.cause?.[0]?.description || mpData.cause?.[0]?.message || mpData.message;
        throw new Error(`Mercado Pago: ${detailErr || "Erro ao gerar Pix."}`);
      }

      paymentResult = {
        paymentId: String(mpData.id),
        pixCopiaECola: mpData.point_of_interaction?.transaction_data?.qr_code,
        qrCodeBase64: mpData.point_of_interaction?.transaction_data?.qr_code_base64,
        ticketUrl: mpData.point_of_interaction?.transaction_data?.ticket_url
      };
    } else if (paymentMethodType === "boleto") {
      const doc = customerDocument ? String(customerDocument).replace(/\D/g, '') : '';
      if (!doc) {
        return new Response(
          JSON.stringify({ success: false, error: "CPF/CNPJ do cliente é obrigatório para gerar o boleto diretamente." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

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
            email: customerEmail && customerEmail.includes("@") ? customerEmail : "cliente@nexus.com",
            first_name: customerName ? customerName.slice(0, 30) : "Cliente",
            identification: {
              type: doc.length >= 14 ? 'CNPJ' : 'CPF',
              number: doc
            }
          },
          external_reference: itemId,
          notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
        })
      });

      const mpData = await mpResponse.json();

      if (!mpResponse.ok) {
        const detailErr = mpData.cause?.[0]?.description || mpData.cause?.[0]?.message || mpData.message;
        throw new Error(`Mercado Pago: ${detailErr || "Erro ao gerar Boleto."}`);
      }

      paymentResult = {
        paymentId: String(mpData.id),
        ticketUrl: mpData.transaction_details?.external_resource_url || mpData.point_of_interaction?.transaction_data?.ticket_url
      };
    } else {
      // Cria link de Checkout de Cartão com Parcelas Pré-Selecionadas (1x a 12x)
      const chosenInstallments = Number(installments) || 1;

      const mpResponse = await fetch("https://api.mercadopago.com/checkout/preferences", {
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
            name: customerName,
            email: customerEmail && customerEmail.includes("@") ? customerEmail : "cliente@nexus.com"
          },
          payment_methods: {
            default_payment_type_id: "credit_card",
            default_installments: chosenInstallments,
            max_installments: chosenInstallments,
            installments: chosenInstallments,
            excluded_payment_types: [
              { id: "ticket" }
            ]
          },
          expires: true,
          expiration_date_from: new Date().toISOString().split('.')[0] + 'Z',
          expiration_date_to: expiresAt,
          external_reference: itemId,
          notification_url: `${Deno.env.get("SUPABASE_URL")}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
        })
      });

      const mpData = await mpResponse.json();

      if (!mpResponse.ok) {
        const detailErr = mpData.cause?.[0]?.description || mpData.cause?.[0]?.message || mpData.message;
        throw new Error(`Mercado Pago: ${detailErr || "Erro ao gerar Checkout de Cartão."}`);
      }

      paymentResult = {
        paymentId: String(mpData.id),
        ticketUrl: mpData.init_point || mpData.sandbox_init_point
      };
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
