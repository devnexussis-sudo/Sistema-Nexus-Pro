import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-signature, x-request-id",
};

/**
 * Validação de Assinatura HMAC SHA-256 do Mercado Pago (x-signature)
 * Documentação oficial: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
async function verifyMercadoPagoSignature(
  secretKey: string,
  dataId: string,
  requestId: string,
  ts: string,
  expectedHash: string
): Promise<boolean> {
  if (!secretKey || !dataId || !requestId || !ts || !expectedHash) return false;

  try {
    const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secretKey);
    const messageData = encoder.encode(manifest);

    const cryptoKey = await crypto.subtle.importKey(
      "raw",
      keyData,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
    const calculatedHash = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    return calculatedHash.toLowerCase() === expectedHash.toLowerCase();
  } catch (err) {
    console.error("[MP Signature Error]:", err);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id") || url.searchParams.get("data.id");
    const tenantId = url.searchParams.get("tenant_id");

    const body = await req.json().catch(() => ({}));
    const paymentId = id || body?.data?.id || body?.id;

    if (!paymentId) {
      return new Response("No payment ID", { status: 200, headers: corsHeaders });
    }

    // ── VALIDAÇÃO DE SEGURANÇA HMAC SHA-256 (x-signature) ──────────────────────
    const xSignature = req.headers.get("x-signature") || "";
    const xRequestId = req.headers.get("x-request-id") || "";

    let ts = "";
    let hashV1 = "";
    if (xSignature) {
      xSignature.split(",").forEach(part => {
        const [k, v] = part.split("=").map(s => s.trim());
        if (k === "ts") ts = v;
        if (k === "v1") hashV1 = v;
      });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let webhookSecret = Deno.env.get("MERCADOPAGO_WEBHOOK_SECRET") || "";
    if (!webhookSecret && tenantId) {
      const { data: tenantSettings } = await supabaseAdmin
        .from("tenant_mercadopago_settings")
        .select("mp_webhook_secret")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      webhookSecret = tenantSettings?.mp_webhook_secret || "";
    }

    // Se o webhookSecret estiver configurado (global ou por tenant) E for um aviso automático via webhook
    if (webhookSecret && xSignature && body.action !== 'manual_check' && body.action !== 'reconcile_all') {
      const isValid = await verifyMercadoPagoSignature(webhookSecret, String(paymentId), xRequestId, ts, hashV1);
      if (!isValid) {
        console.warn("[MP Webhook Edge] Rejeitado: Assinatura x-signature HMAC SHA-256 inválida!");
        return new Response(
          JSON.stringify({ error: "Assinatura do Webhook Mercado Pago inválida." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("[MP Webhook Edge] 🔒 Assinatura HMAC SHA-256 validada com sucesso!");
    }

    // REMOVIDO: O bloco legacy 'reconcile_all' foi deletado permanentemente pois realizava
    // um loop de fetch na API do Mercado Pago para todos os itens pagos. Isso causava 
    // estrangulamento da API (Rate Limit 429) e timeouts severos na Edge Function.

    let externalReference = null;
    let isApproved = false;
    let paidAt = new Date().toISOString();
    let paymentMethod = "Mercado Pago";
    let paidAmount = 0;
    let gatewayStatus = "pending";

    let accessTokens: string[] = [];

    if (tenantId) {
      const { data: tenantSettings } = await supabaseAdmin
        .from("tenant_mercadopago_settings")
        .select("mp_access_token")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (tenantSettings?.mp_access_token) {
        accessTokens.push(tenantSettings.mp_access_token);
      }
    }

    // Se tenant_id não veio na URL ou o token não foi encontrado, busca todos os tokens ativos
    if (accessTokens.length === 0) {
      const { data: allSettings } = await supabaseAdmin
        .from("tenant_mercadopago_settings")
        .select("mp_access_token");

      if (allSettings && allSettings.length > 0) {
        accessTokens = allSettings.map(s => s.mp_access_token).filter(Boolean);
      }
    }

    for (const token of accessTokens) {
      try {
        // Se for checagem manual pela tela, busca pela referência externa (Order ID)
        // Isso resolve o problema de links antigos onde só tínhamos o Preference ID salvo.
        if (body.action === 'manual_check' && body.item_id) {
          const sRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(body.item_id)}&sort=date_created&criteria=desc`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          
          if (sRes.ok) {
            const sJson = await sRes.json();
            const approvedPayment = (sJson.results || []).find((p: any) => p.status === 'approved' || p.status === 'accredited');
            
            if (approvedPayment) {
              externalReference = approvedPayment.external_reference || body.item_id;
              isApproved = true;
              gatewayStatus = approvedPayment.status;
              paidAt = approvedPayment.date_approved || new Date().toISOString();
              paidAmount = Number(approvedPayment.transaction_amount || 0);

              const pmId = String(approvedPayment.payment_method_id || '').toLowerCase();
              if (pmId.includes('pix')) paymentMethod = 'Pix';
              else if (pmId.includes('boleto') || pmId.includes('ticket')) paymentMethod = 'Boleto';
              else paymentMethod = 'Cartão de Crédito';
              
              break; // Encontrou a transação válida!
            }
          }
        }

        // Fluxo normal do webhook (se não encontrou na busca acima ou é webhook automático)
        if (!isApproved) {
          const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });

          if (mpRes.ok) {
            const mpData = await mpRes.json();
            externalReference = mpData.external_reference;
            isApproved = mpData.status === "approved" || mpData.status === "accredited";
            gatewayStatus = mpData.status || "pending";
            paidAt = mpData.date_approved || new Date().toISOString();
            paidAmount = Number(mpData.transaction_amount || 0);

            const pmId = String(mpData.payment_method_id || '').toLowerCase();
            if (pmId.includes('pix')) paymentMethod = 'Pix';
            else if (pmId.includes('boleto') || pmId.includes('ticket')) paymentMethod = 'Boleto';
            else paymentMethod = 'Cartão de Crédito';

            if (externalReference || isApproved) {
              break; // Encontrou a transação válida!
            }
          }
        }
      } catch (err) {
        console.warn("[MP Webhook Edge] Erro ao consultar token:", err);
      }
    }

    // Função para furar o bloqueio de RLS e atualizar todas as telas (Checkout, Modais e Dashboards)
    const broadcastPaymentApproved = async (itemId: string, tenantId?: string) => {
      try {
        console.log(`[MP Webhook Realtime] Disparando broadcast PAYMENT_APPROVED para item ${itemId} (tenant: ${tenantId || 'all'})`);
        const channelsToNotify = [
          `checkout_status_${itemId}`,
          `public_checkout_status_${itemId}`,
          `modal_checkout_status_${itemId}`,
          `realtime_financial_dashboard_gateway`
        ];
        if (tenantId) {
          channelsToNotify.push(`nexus-realtime-${tenantId}`);
        }

        for (const channelName of channelsToNotify) {
          const ch = supabaseAdmin.channel(channelName);
          ch.subscribe(async (status: string) => {
            if (status === "SUBSCRIBED") {
              await ch.send({
                type: "broadcast",
                event: "PAYMENT_APPROVED",
                payload: { id: itemId, itemId: itemId, status: "PAID", tenantId }
              });
              console.log(`[MP Webhook Realtime] Broadcast enviado com sucesso no canal ${channelName}`);
              setTimeout(() => {
                try { supabaseAdmin.removeChannel(ch); } catch (_) {}
              }, 2000);
            }
          });
        }
      } catch (e) {
        console.warn("[MP Webhook] Falha no broadcast:", e);
      }
    };

    // Função auxiliar para atualizar e registrar no fluxo de caixa
    const processPayment = async (table: "orders" | "quotes", record: any) => {
      if (record.billing_status !== "PAID" || record.gateway_status !== "approved") {
        const updateObj: any = {
          billing_status: "PAID",
          payment_method: paymentMethod,
          paid_at: paidAt,
          gateway_status: "approved"
        };

        await supabaseAdmin.from(table).update(updateObj).eq("id", record.id);
        await broadcastPaymentApproved(record.id, record.tenant_id); // Avisa a tela instantaneamente!

        if (table === "orders") {
          await supabaseAdmin.from("cash_flow").insert([{
            tenant_id: record.tenant_id,
            customer_id: record.customer_id,
            technician_id: record.assigned_to,
            type: "INCOME",
            category: "Serviço (O.S.)",
            amount: paidAmount || record.total_value || 0,
            description: `Faturamento automático via Mercado Pago — O.S. #${record.id.slice(0, 8)}`,
            reference_id: record.id,
            reference_type: "ORDER",
            payment_method: paymentMethod,
            entry_date: paidAt,
            created_at: paidAt,
            created_by: "system_webhook"
          }]);
        } else {
          await supabaseAdmin.from("cash_flow").insert([{
            tenant_id: record.tenant_id,
            customer_id: record.customer_id,
            type: "INCOME",
            category: "Serviço (Orçamento)",
            amount: paidAmount || record.total_value || 0,
            description: `Faturamento automático via Mercado Pago — Orçamento #${record.id.slice(0, 8)}`,
            reference_id: record.id,
            reference_type: "QUOTE",
            payment_method: paymentMethod,
            entry_date: paidAt,
            created_at: paidAt,
            created_by: "system_webhook"
          }]);
        }
      }

      // Atualiza a Fatura pai vinculada (invoices)
      const refType = table === "orders" ? "ORDER" : "QUOTE";
      const { data: invItems } = await supabaseAdmin
        .from("invoice_items")
        .select("invoice_id")
        .eq("reference_type", refType)
        .eq("reference_id", record.id);

      for (const item of (invItems || [])) {
        await supabaseAdmin.from("invoices").update({
          status: "PAID",
          gateway_status: "approved",
          payment_method: paymentMethod,
          paid_at: paidAt,
          gateway_payment_id: String(paymentId)
        }).eq("id", item.invoice_id);
        await broadcastPaymentApproved(item.invoice_id, record.tenant_id); // Avisa a tela do admin também
      }
    };

    const processInvoice = async (invoice: any) => {
      const updateObj: any = {
        status: "PAID",
        gateway_status: "approved",
        payment_method: paymentMethod,
        paid_at: paidAt,
        gateway_payment_id: String(paymentId),
        payment_gateway_id: String(paymentId)
      };

      await supabaseAdmin.from("invoices").update(updateObj).eq("id", invoice.id);
      await broadcastPaymentApproved(invoice.id, invoice.tenant_id); // Avisa a tela instantaneamente (Admin/Fatura)

      const { data: items } = await supabaseAdmin.from("invoice_items").select("*").eq("invoice_id", invoice.id);
      
      for (const item of (items || [])) {
        if (item.reference_type === "ORDER") {
          const { data: order } = await supabaseAdmin.from("orders").select("*").eq("id", item.reference_id).maybeSingle();
          if (order) await processPayment("orders", order);
        } else if (item.reference_type === "QUOTE") {
          const { data: quote } = await supabaseAdmin.from("quotes").select("*").eq("id", item.reference_id).maybeSingle();
          if (quote) await processPayment("quotes", quote);
        }
      }
    };

    const updateGatewayStatus = async (table: "invoices" | "orders" | "quotes", id: string) => {
      const updateData: any = { gateway_status: gatewayStatus };
      if (table === "invoices" && (gatewayStatus === "cancelled" || gatewayStatus === "rejected" || gatewayStatus === "refunded")) {
         updateData.status = "CANCELED";
      }
      await supabaseAdmin.from(table).update(updateData).eq("id", id);
    };

    const isUUID = (str: string) => /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(str);

    if (externalReference) {
      let invoice;
      if (isUUID(externalReference)) {
        const res = await supabaseAdmin.from("invoices").select("*").or(`id.eq.${externalReference},display_id.eq.${externalReference}`).maybeSingle();
        invoice = res.data;
      } else {
        const res = await supabaseAdmin.from("invoices").select("*").eq("display_id", externalReference).maybeSingle();
        invoice = res.data;
      }
      
      if (invoice) {
        if (isApproved) await processInvoice(invoice);
        else await updateGatewayStatus("invoices", invoice.id);
      } else {
        let order;
        if (isUUID(externalReference)) {
            const res = await supabaseAdmin.from("orders").select("*").eq("id", externalReference).maybeSingle();
            order = res.data;
        }
        if (order) {
          if (isApproved) await processPayment("orders", order);
          else await updateGatewayStatus("orders", order.id);
        } else {
          let quote;
          if (isUUID(externalReference)) {
              const res = await supabaseAdmin.from("quotes").select("*").eq("id", externalReference).maybeSingle();
              quote = res.data;
          }
          if (quote) {
            if (isApproved) await processPayment("quotes", quote);
            else await updateGatewayStatus("quotes", quote.id);
          }
        }
      }
    } else {
      let { data: invoice } = await supabaseAdmin.from("invoices").select("*").or(`gateway_payment_id.eq.${String(paymentId)},payment_gateway_id.eq.${String(paymentId)}`).maybeSingle();
      if (invoice) {
        if (isApproved) await processInvoice(invoice);
        else await updateGatewayStatus("invoices", invoice.id);
      } else {
        let { data: order } = await supabaseAdmin.from("orders").select("*").eq("gateway_payment_id", String(paymentId)).maybeSingle();
        if (order) {
          if (isApproved) await processPayment("orders", order);
          else await updateGatewayStatus("orders", order.id);
        } else {
          let { data: quote } = await supabaseAdmin.from("quotes").select("*").eq("gateway_payment_id", String(paymentId)).maybeSingle();
          if (quote) {
            if (isApproved) await processPayment("quotes", quote);
            else await updateGatewayStatus("quotes", quote.id);
          }
        }
      }
    }

    return new Response(JSON.stringify({ success: true, isPaid: isApproved, isApproved, receivedId: paymentId, gatewayStatus }), { 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  } catch (err: any) {
    console.error("[MP Webhook Edge] Error:", err);
    return new Response(JSON.stringify({ error: err.message }), { 
      status: 200, 
      headers: { ...corsHeaders, "Content-Type": "application/json" } 
    });
  }
});
