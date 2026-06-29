// ═══════════════════════════════════════════════════════════════════
// os-status-notify — Webhook Triggered
// Disparado pelo Postgres quando o status de uma OS é alterado
// ═══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    console.log("[os-status-notify] Payload recebido:", JSON.stringify(payload).substring(0, 500));

    // Apenas INSERT ou UPDATE
    if (payload.type !== "UPDATE" && payload.type !== "INSERT") {
      return new Response("Skipped: Not an UPDATE/INSERT", { headers: corsHeaders });
    }

    const newRecord = payload.record;
    const oldRecord = payload.old_record;

    // Se o status não mudou (num UPDATE) ou se não tem status, ignora
    if (oldRecord && newRecord.status === oldRecord.status) {
      return new Response("Skipped: Status did not change", { headers: corsHeaders });
    }

    const status = newRecord.status;
    const isDeslocamento = status === "EM DESLOCAMENTO" || status === "EM ANDAMENTO";
    const isConcluida = status === "CONCLUÍDO";

    if (!isDeslocamento && !isConcluida) {
      return new Response(`Skipped: Status ${status} não aciona notificação`, { headers: corsHeaders });
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Buscar informações do cliente para pegar o telefone
    if (!newRecord.customer_id) {
      throw new Error("OS não possui customer_id");
    }

    const { data: customer, error: customerErr } = await supabaseAdmin
      .from("customers")
      .select("phone, whatsapp, name")
      .eq("id", newRecord.customer_id)
      .single();

    if (customerErr || !customer) {
      throw new Error(`Cliente não encontrado para ID ${newRecord.customer_id}`);
    }

    // Extrair apenas os dígitos numéricos
    let rawPhone = customer.whatsapp || customer.phone || "";
    rawPhone = String(rawPhone).replace(/[^0-9]/g, "");

    if (!rawPhone || rawPhone.length < 10) {
      return new Response("Skipped: Cliente não possui número de WhatsApp/Telefone válido", { headers: corsHeaders });
    }

    // Buscar configurações do Tenant
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from("tenants")
      .select("whatsapp_settings")
      .eq("id", newRecord.tenant_id)
      .single();

    if (tenantErr || !tenant) {
      throw new Error(`Tenant não encontrado para ID ${newRecord.tenant_id}`);
    }

    const settings = tenant.whatsapp_settings as Record<string, any>;
    if (!settings || (!settings.uazapi_token && !settings.zapi_instance_token)) {
      return new Response("Skipped: Tenant não possui configurações de WhatsApp ativas", { headers: corsHeaders });
    }

    // Montar a mensagem
    const equipamento = newRecord.equipment_name || "seu equipamento";
    const osId = newRecord.display_id || "Recém criada";
    let message = "";

    if (isDeslocamento) {
      const statusFormatado = status === "EM DESLOCAMENTO" ? "em deslocamento" : "em andamento";
      message = `Olá, o técnico alterou o status do seu atendimento para o equipamento ${equipamento} para o status (${statusFormatado}), assim que o status for alterado volto a te avisar qualquer coisa só nos chamar por aqui mesmo.`;
    } else if (isConcluida) {
      // Definir URL Base - Tenta pegar das variáveis de ambiente, ou usa o fallback do Duno/Nexus
      let baseUrl = Deno.env.get("PUBLIC_APP_URL") || "https://app.dunoup.com.br";
      if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

      const publicLink = `${baseUrl}/#/order/view/${newRecord.public_token || newRecord.id}`;
      message = `Olá, o Atendimento OS ${osId} foi encerrado pelo técnico e o relatório do atendimento segue no link abaixo:\n\n${publicLink}`;
    }

    // Disparar a mensagem via UAZAPI ou Z-API
    await sendWhatsAppMessage(settings, rawPhone, message);

    return new Response(JSON.stringify({ ok: true, sent: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[os-status-notify] ❌ Erro:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function sendWhatsAppMessage(
  settings: Record<string, string>,
  phone: string,
  text: string
): Promise<void> {
  // 1. Tentar UAZAPI primeiro
  if (settings.uazapi_url && settings.uazapi_token) {
    let baseUrl = settings.uazapi_url.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    const url = `${baseUrl}/send/text`;
    const payload = { 
      number: phone, 
      text: text,
      delay: 1500 // 1.5s delay
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": settings.uazapi_token.trim(),
        "token": settings.uazapi_token.trim()
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[os-status-notify] ❌ Falha UAZAPI:", res.status, errText);
    } else {
      console.log(`[os-status-notify] Mensagem UAZAPI enviada para ${phone}`);
    }
    return;
  }

  // 2. Fallback Z-API
  const { zapi_instance_id, zapi_instance_token, zapi_client_token } = settings;
  if (!zapi_instance_id || !zapi_instance_token) {
    console.error("[os-status-notify] Credenciais de WhatsApp ausentes");
    return;
  }

  const url = `https://api.z-api.io/instances/${zapi_instance_id}/token/${zapi_instance_token}/send-text`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (zapi_client_token) headers["Client-Token"] = zapi_client_token;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: phone, message: text }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[os-status-notify] ❌ Falha Z-API:", res.status, errText);
  } else {
    console.log(`[os-status-notify] Mensagem Z-API enviada para ${phone}`);
  }
}
