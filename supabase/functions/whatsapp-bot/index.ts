// ═══════════════════════════════════════════════════════════════════
// whatsapp-bot — Webhook Receiver (Z-API)
// Recebe eventos da Z-API e orquestra o fluxo do bot de IA
// ═══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface ZApiMessage {
  instanceId?: string;
  phone?: string;
  isGroupMsg?: boolean;
  fromMe?: boolean;
  type?: string; // "ReceivedCallback", "chat", "DeliveryCallback", etc.
  text?: { message?: string };
  body?: string;
  chatName?: string;
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

function extractPhoneNumber(payload: ZApiMessage): string {
  return String(payload.phone || '').replace(/[^0-9]/g, '');
}

function extractText(payload: ZApiMessage): string | null {
  return payload.text?.message || payload.body || null;
}

// Tipos de eventos que a Z-API envia que NÃO são mensagens recebidas
const STATUS_EVENT_TYPES = [
  'DeliveryCallback', 'ReadCallback', 'PlayedCallback',
  'SentCallback', 'MessageStatusCallback', 'PresenceCallback',
  'ConnectedCallback', 'DisconnectedCallback', 'AllUnreadMessagesCallback',
];

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

    // ── Parse payload
    const payload: ZApiMessage = await req.json();
    console.log("[WPP Bot] Payload:", JSON.stringify(payload).substring(0, 400));

    // ── Ignorar eventos de status/entrega da Z-API (não são mensagens do cliente)
    if (STATUS_EVENT_TYPES.includes(payload.type || '')) {
      return new Response(JSON.stringify({ ok: true, skipped: `status:${payload.type}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ignorar mensagens enviadas pelo próprio bot ou de grupos
    if (payload.fromMe === true || payload.isGroupMsg === true) {
      return new Response(JSON.stringify({ ok: true, skipped: "fromMe_or_group" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = extractPhoneNumber(payload);
    const text = extractText(payload);

    console.log("[WPP Bot] phone:", phone, "| text:", text?.substring(0, 80), "| type:", payload.type);

    if (!phone) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!text) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_text" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Encontrar tenant pela instância Z-API
    const instanceId = payload.instanceId || '';
    console.log("[WPP Bot] instanceId:", instanceId);

    const { data: tenants, error: tenantErr } = await supabase
      .from("tenants")
      .select("id, company_name, trading_name, whatsapp_settings")
      .filter("whatsapp_settings->>zapi_instance_id", "eq", instanceId);

    if (tenantErr || !tenants || tenants.length === 0) {
      console.error("[WPP Bot] Tenant não encontrado para instanceId:", instanceId);
      return new Response(JSON.stringify({ ok: false, error: "tenant_not_found", instanceId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const tenant = tenants[0];
    const settings = tenant.whatsapp_settings as Record<string, any>;
    console.log("[WPP Bot] Tenant:", tenant.company_name, "| bot_enabled:", settings?.bot_enabled);

    // ── Verificar se o bot está habilitado
    if (settings.bot_enabled === false || settings.bot_enabled === "false") {
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
      .maybeSingle();

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

    // ── Prevenção de duplicidade: ignorar mensagens idênticas recebidas em menos de 15 segundos
    const lastUserMsg = [...conversation.history].reverse().find(m => m.role === "user");
    if (lastUserMsg && lastUserMsg.content === text) {
      const lastTime = new Date(lastUserMsg.timestamp).getTime();
      if (Date.now() - lastTime < 15000) {
        console.log("[WPP Bot] Mensagem duplicada ignorada (recebida há menos de 15s):", text);
        return new Response(JSON.stringify({ ok: true, skipped: "duplicate" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Se agente humano está ativo: apenas salvar no histórico, não processar com IA
    if (conversation.state === "HUMAN_ACTIVE") {
      const updatedHistory = [
        ...conversation.history,
        { role: "user", content: text, timestamp: new Date().toISOString() },
      ];
      await supabase
        .from("whatsapp_conversations")
        .update({ history: updatedHistory, last_message_at: new Date().toISOString() })
        .eq("id", conversation.id);

      return new Response(JSON.stringify({ ok: true, mode: "human_active" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Verificar palavra-chave para chamar humano manualmente
    const humanKeyword = settings.human_keyword || "ATENDENTE";
    if (text.toUpperCase().includes(humanKeyword.toUpperCase())) {
      const agentMsg = "🙋 Entendido! Estou notificando nossa equipe agora. Um atendente assumirá a conversa em instantes. Aguarde... ⏳";
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
    console.log("[WPP Bot] Chamando whatsapp-ai-agent...");
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

    if (!agentResponse.ok) {
      const errText = await agentResponse.text();
      console.error("[WPP Bot] AI agent HTTP error:", agentResponse.status, errText);
      throw new Error(`AI agent error: ${agentResponse.status}`);
    }

    const agentResult = await agentResponse.json();
    console.log("[WPP Bot] AI reply:", JSON.stringify(agentResult).substring(0, 200));
    let { reply, new_state, customer_id } = agentResult;

    if (!reply) {
      reply = "Desculpe, ocorreu uma instabilidade momentânea. Por favor, tente novamente em instantes.";
    }

    // ── Atualizar sessão no banco
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

    // ── Enviar resposta ao cliente via Z-API
    await sendWhatsAppMessage(settings, phone, reply);
    console.log("[WPP Bot] ✅ Resposta enviada para", phone);

    return new Response(JSON.stringify({ ok: true, reply }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[WPP Bot] ❌ Erro crítico:", msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});

// ── Z-API: enviar mensagem ────────────────────────────────────────────────────

async function sendWhatsAppMessage(
  settings: Record<string, any>,
  phone: string,
  text: string
): Promise<void> {
  const { zapi_instance_id, zapi_instance_token, zapi_client_token } = settings;

  if (!zapi_instance_id || !zapi_instance_token) {
    console.error("[WPP Bot] Credenciais Z-API ausentes no tenant");
    return;
  }

  const url = `https://api.z-api.io/instances/${zapi_instance_id}/token/${zapi_instance_token}/send-text`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (zapi_client_token) headers["Client-Token"] = zapi_client_token;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone, message: text }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[WPP Bot] ❌ Falha ao enviar Z-API:", res.status, errText);
  }
}
