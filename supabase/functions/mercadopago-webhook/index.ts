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
    const url = new URL(req.url);
    const id = url.searchParams.get("id") || url.searchParams.get("data.id");
    const tenantId = url.searchParams.get("tenant_id");

    const body = await req.json().catch(() => ({}));
    const paymentId = id || body?.data?.id || body?.id;

    if (!paymentId) {
      return new Response("No payment ID", { status: 200, headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    if (body.action === 'reconcile_all') {
      const { data: tenantSettings } = await supabaseAdmin
        .from("tenant_mercadopago_settings")
        .select("mp_access_token, tenant_id");

      const tokenMap = new Map();
      (tenantSettings || []).forEach((s: any) => {
        if (s.mp_access_token) tokenMap.set(s.tenant_id, s.mp_access_token);
      });

      let revertedQuotes = 0;
      let revertedOrders = 0;

      const { data: paidQuotes } = await supabaseAdmin.from("quotes").select("*").eq("billing_status", "PAID");
      for (const q of (paidQuotes || [])) {
        const token = tokenMap.get(q.tenant_id);
        let isActuallyPaid = false;
        if (token) {
          const gtwId = String(q.gateway_payment_id || '').trim();
          if (gtwId && /^\d+$/.test(gtwId)) {
            const pRes = await fetch(`https://api.mercadopago.com/v1/payments/${gtwId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (pRes.ok) {
              const mpData = await pRes.json();
              if (mpData.status === 'approved' || mpData.status === 'accredited') isActuallyPaid = true;
            }
          }
          if (!isActuallyPaid && q.id) {
            const sRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(q.id)}&sort=date_created&criteria=desc`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (sRes.ok) {
              const sJson = await sRes.json();
              if ((sJson.results || []).some((p: any) => p.status === 'approved' || p.status === 'accredited')) isActuallyPaid = true;
            }
          }
        }
        if (!isActuallyPaid) {
          await supabaseAdmin.from("quotes").update({
            billing_status: "PENDING",
            gateway_status: "pending",
            paid_at: null,
            payment_method: null
          }).eq("id", q.id);
          await supabaseAdmin.from("cash_flow").delete().eq("reference_id", q.id);
          revertedQuotes++;
        }
      }

      const { data: paidOrders } = await supabaseAdmin.from("orders").select("*").eq("billing_status", "PAID");
      for (const o of (paidOrders || [])) {
        const token = tokenMap.get(o.tenant_id);
        let isActuallyPaid = false;
        if (token) {
          const gtwId = String(o.gateway_payment_id || '').trim();
          if (gtwId && /^\d+$/.test(gtwId)) {
            const pRes = await fetch(`https://api.mercadopago.com/v1/payments/${gtwId}`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (pRes.ok) {
              const mpData = await pRes.json();
              if (mpData.status === 'approved' || mpData.status === 'accredited') isActuallyPaid = true;
            }
          }
          if (!isActuallyPaid && o.id) {
            const sRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(o.id)}&sort=date_created&criteria=desc`, {
              headers: { Authorization: `Bearer ${token}` }
            });
            if (sRes.ok) {
              const sJson = await sRes.json();
              if ((sJson.results || []).some((p: any) => p.status === 'approved' || p.status === 'accredited')) isActuallyPaid = true;
            }
          }
        }
        if (!isActuallyPaid) {
          await supabaseAdmin.from("orders").update({
            billing_status: "PENDING",
            gateway_status: "pending",
            paid_at: null,
            payment_method: null
          }).eq("id", o.id);
          await supabaseAdmin.from("cash_flow").delete().eq("reference_id", o.id);
          revertedOrders++;
        }
      }

      return new Response(JSON.stringify({ success: true, revertedQuotes, revertedOrders }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    let externalReference = null;
    let isApproved = false;
    let paidAt = new Date().toISOString();
    let paymentMethod = "Mercado Pago";
    let paidAmount = 0;

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

    // Função auxiliar para atualizar e registrar no fluxo de caixa
    const processPayment = async (table: "orders" | "quotes", record: any) => {
      if (record.billing_status === "PAID") return;
      
      const updateObj: any = {
        billing_status: "PAID",
        payment_method: paymentMethod,
        paid_at: paidAt,
        gateway_status: "approved"
      };

      await supabaseAdmin.from(table).update(updateObj).eq("id", record.id);

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
    };

    // 2. Apenas se o pagamento foi EFETIVAMENTE APROVADO no Mercado Pago
    if (isApproved) {
      if (externalReference) {
        let { data: order } = await supabaseAdmin.from("orders").select("*").eq("id", externalReference).maybeSingle();
        if (order) {
          await processPayment("orders", order);
        } else {
          let { data: quote } = await supabaseAdmin.from("quotes").select("*").eq("id", externalReference).maybeSingle();
          if (quote) await processPayment("quotes", quote);
        }
      } else {
        let { data: order } = await supabaseAdmin.from("orders").select("*").eq("gateway_payment_id", String(paymentId)).maybeSingle();
        if (order) {
          await processPayment("orders", order);
        } else {
          let { data: quote } = await supabaseAdmin.from("quotes").select("*").eq("gateway_payment_id", String(paymentId)).maybeSingle();
          if (quote) await processPayment("quotes", quote);
        }
      }
    }

    return new Response(JSON.stringify({ success: true, isPaid: isApproved, isApproved, receivedId: paymentId }), { 
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
