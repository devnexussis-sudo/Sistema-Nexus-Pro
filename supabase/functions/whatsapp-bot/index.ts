// ═══════════════════════════════════════════════════════════════════
// whatsapp-bot — Webhook Receiver
// Recebe eventos da Evolution API e orquestra o fluxo do bot
// ═══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-evolution-token",
};

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface EvolutionMessage {
  event: string;
  instance: string;
  data: {
    key: { remoteJid: string; fromMe: boolean; id: string };
    message?: { conversation?: string; extendedTextMessage?: { text: string } };
    messageType?: string;
    pushName?: string;
  };
}

interface Conversation {
  id: string;
  tenant_id: string;
  phone_number: string;
  customer_id: string | null;
  state: string;
  history: Array<{ role: string; content: string; timestamp: string }>;
  assigned_agent_id: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPhoneNumber(jid: string): string {
  // "5535999998888@s.whatsapp.net" → "5535999998888"
  return jid.replace(/@.+$/, "").replace(/[^0-9]/g, "");
}

function extractTextFromMessage(data: EvolutionMessage["data"]): string | null {
  return (
    data.message?.conversation ||
    data.message?.extendedTextMessage?.text ||
    null
  );
}

// ── Main Handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── Parse webhook payload
    const payload: EvolutionMessage = await req.json();

    // Ignorar eventos que não são mensagens recebidas
    if (payload.event !== "messages.upsert") {
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: msgData } = payload;

    // Ignorar mensagens enviadas pelo próprio bot
    if (msgData.key.fromMe) {
      return new Response(JSON.stringify({ ok: true, skipped: "fromMe" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Ignorar grupos
    if (msgData.key.remoteJid.includes("@g.us")) {
      return new Response(JSON.stringify({ ok: true, skipped: "group" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const text = extractTextFromMessage(msgData);
    if (!text) {
      // Mídia não suportada — ignorar silenciosamente
      return new Response(JSON.stringify({ ok: true, skipped: "no_text" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = extractPhoneNumber(msgData.key.remoteJid);
    const instanceName = payload.instance;

    // ── Encontrar tenant pela instância Evolution API
    const { data: tenants, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, company_name, trading_name, whatsapp_settings")
      .filter("whatsapp_settings->>instance_name", "eq", instanceName);

    if (tenantErr || !tenants || tenants.length === 0) {
      console.error("[WPP Bot] Tenant não encontrado para instância:", instanceName);
      return new Response(JSON.stringify({ ok: false, error: "tenant_not_found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const tenant = tenants[0];
    const settings = tenant.whatsapp_settings as Record<string, string>;

    // Verificar se o bot está habilitado
    if (settings.bot_enabled === "false" || settings.bot_enabled === false as unknown as string) {
      return new Response(JSON.stringify({ ok: true, skipped: "bot_disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Carregar ou criar sessão de conversa
    const { data: existingConv } = await supabase
      .from("whatsapp_conversations")
      .select("*")
      .eq("phone_number", phone)
      .eq("tenant_id", tenant.id)
      .single();

    let conversation: Conversation;

    if (existingConv) {
      conversation = existingConv as Conversation;
    } else {
      const { data: newConv, error: createErr } = await supabase
        .from("whatsapp_conversations")
        .insert({
          tenant_id: tenant.id,
          phone_number: phone,
          state: "GREETING",
          history: [],
        })
        .select()
        .single();

      if (createErr || !newConv) {
        throw new Error("Falha ao criar sessão: " + createErr?.message);
      }
      conversation = newConv as Conversation;
    }

    // ── Se agente humano está ativo: repassar para Realtime, não processar com IA
    if (conversation.state === "HUMAN_ACTIVE") {
      // Salvar mensagem do cliente no histórico apenas
      const updatedHistory = [
        ...conversation.history,
        { role: "user", content: text, timestamp: new Date().toISOString() },
      ];

      await supabase
        .from("whatsapp_conversations")
        .update({
          history: updatedHistory,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation.id);

      // Supabase Realtime já notifica o agente via subscription
      return new Response(JSON.stringify({ ok: true, mode: "human_active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verificar palavra-chave para chamar humano manualmente
    const humanKeyword = settings.human_keyword || "ATENDENTE";
    if (text.toUpperCase().includes(humanKeyword.toUpperCase())) {
      const agentMsg =
        "🙋 Entendido! Estou notificando nossa equipe agora. Um atendente assumirá a conversa em instantes. Aguarde... ⏳";

      const updatedHistory = [
        ...conversation.history,
        { role: "user", content: text, timestamp: new Date().toISOString() },
        { role: "bot", content: agentMsg, timestamp: new Date().toISOString() },
      ];

      await supabase.from("whatsapp_conversations").update({
        state: "WAITING_HUMAN",
        history: updatedHistory,
        last_message_at: new Date().toISOString(),
      }).eq("id", conversation.id);

      await sendWhatsAppMessage(settings, phone, agentMsg);

      return new Response(JSON.stringify({ ok: true, state: "WAITING_HUMAN" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Chamar o agente IA
    const agentResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-ai-agent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          tenant_id: tenant.id,
          tenant_name: tenant.trading_name || tenant.company_name,
          settings,
          conversation,
          user_message: text,
        }),
      }
    );

    const agentResult = await agentResponse.json();
    const { reply, new_state, customer_id } = agentResult;

    // ── Atualizar sessão
    const updatedHistory = [
      ...conversation.history,
      { role: "user", content: text, timestamp: new Date().toISOString() },
      { role: "bot", content: reply, timestamp: new Date().toISOString() },
    ];

    await supabase.from("whatsapp_conversations").update({
      state: new_state || conversation.state,
      history: updatedHistory,
      customer_id: customer_id || conversation.customer_id,
      last_message_at: new Date().toISOString(),
    }).eq("id", conversation.id);

    // ── Enviar resposta ao cliente
    await sendWhatsAppMessage(settings, phone, reply);

    return new Response(JSON.stringify({ ok: true, reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WPP Bot] Erro:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

// ── Evolution API: enviar mensagem ────────────────────────────────────────────

async function sendWhatsAppMessage(
  settings: Record<string, string>,
  phone: string,
  text: string
): Promise<void> {
  const { evolution_api_url, evolution_api_key, instance_name } = settings;

  if (!evolution_api_url || !evolution_api_key || !instance_name) {
    console.error("[WPP Bot] Credenciais Evolution API incompletas");
    return;
  }

  const url = `${evolution_api_url}/message/sendText/${instance_name}`;
  const body = {
    number: phone,
    text,
    delay: 800, // ms — simula digitação humana
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: evolution_api_key,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.error("[WPP Bot] Falha ao enviar mensagem:", await res.text());
  }
}
