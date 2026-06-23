// ═══════════════════════════════════════════════════════════════════
// whatsapp-admin-send — Envio de mensagem por agente humano
// Chamado pelo painel admin quando o agente digita uma resposta
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
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Não autorizado");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Verificar sessão do agente
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) throw new Error("Sessão inválida");

    const { conversation_id, action, message, ...extra } = await req.json();

    // Carregar conversa
    const { data: conv, error: convErr } = await supabaseAdmin
      .from("whatsapp_conversations")
      .select("*")
      .eq("id", conversation_id)
      .single();

    if (convErr || !conv) throw new Error("Conversa não encontrada");

    // Carregar configurações do tenant
    const { data: tenant } = await supabaseAdmin
      .from("tenants")
      .select("whatsapp_settings")
      .eq("id", conv.tenant_id)
      .single();

    const settings = tenant?.whatsapp_settings as Record<string, string>;

    // ── Ação: assumir conversa
    if (action === "takeover") {
      const { data: agentData } = await supabase
        .from("users")
        .select("name")
        .eq("id", user.id)
        .single();

      const agentName = agentData?.name || "nossa equipe";
      const takeoverMsg = `✅ *${agentName}* da equipe assumiu o atendimento. Como posso ajudar?`;

      const updatedHistory = [
        ...(conv.history || []),
        { role: "agent", content: takeoverMsg, timestamp: new Date().toISOString(), agent_id: user.id },
      ];

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "HUMAN_ACTIVE",
          assigned_agent_id: user.id,
          history: updatedHistory,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      await sendZApiMessage(settings, conv.phone_number, takeoverMsg);

      return new Response(JSON.stringify({ ok: true, action: "takeover" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: devolver ao bot
    if (action === "return_to_bot") {
      const returnMsg = `🤖 O atendimento foi retornado ao assistente virtual. Como posso ajudar?`;
      
      const updatedHistory = [
        ...(conv.history || []),
        { role: "bot", content: returnMsg, timestamp: new Date().toISOString() },
      ];

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "CUSTOMER_FOUND",
          assigned_agent_id: null,
          history: updatedHistory,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      await sendZApiMessage(settings, conv.phone_number, returnMsg);

      return new Response(JSON.stringify({ ok: true, action: "return_to_bot" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: transferir para outro agente
    if (action === "transfer" && extra?.target_user_id) {
      const { data: targetAgent } = await supabase
        .from("users")
        .select("name")
        .eq("id", extra.target_user_id)
        .single();

      const targetName = targetAgent?.name || "outro agente";
      const transferMsg = `🔃 O atendimento foi transferido para *${targetName}*. Aguarde um momento.`;
      
      const updatedHistory = [
        ...(conv.history || []),
        { role: "agent", content: transferMsg, timestamp: new Date().toISOString(), agent_id: user.id },
      ];

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          assigned_agent_id: extra.target_user_id,
          history: updatedHistory,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      await sendZApiMessage(settings, conv.phone_number, transferMsg);

      return new Response(JSON.stringify({ ok: true, action: "transfer" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: encerrar conversa
    if (action === "close_conversation") {
      const closeMsg = `Atendimento encerrado por um de nossos agentes. Agradecemos o contato! 👋`;
      
      const updatedHistory = [
        ...(conv.history || []),
        { role: "agent", content: closeMsg, timestamp: new Date().toISOString(), agent_id: user.id },
      ];

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "GREETING",
          assigned_agent_id: null,
          history: updatedHistory,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      await sendZApiMessage(settings, conv.phone_number, closeMsg);

      return new Response(JSON.stringify({ ok: true, action: "close_conversation" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: enviar mensagem do agente
    if (action === "send" && message) {
      // Salvar no histórico
      const updatedHistory = [
        ...(conv.history || []),
        { role: "agent", content: message, timestamp: new Date().toISOString(), agent_id: user.id },
      ];

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          history: updatedHistory,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      // Enviar via Z-API
      await sendZApiMessage(settings, conv.phone_number, message);

      return new Response(JSON.stringify({ ok: true, action: "sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Ação não reconhecida: " + action);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 400,
    });
  }
});

async function sendZApiMessage(
  settings: Record<string, string>,
  phone: string,
  text: string
): Promise<void> {
  const { zapi_instance_id, zapi_instance_token, zapi_client_token } = settings;
  if (!zapi_instance_id || !zapi_instance_token) return;

  const url = `https://api.z-api.io/instances/${zapi_instance_id}/token/${zapi_instance_token}/send-text`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (zapi_client_token) headers["Client-Token"] = zapi_client_token;
  
  await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: phone, message: text }),
  });
}
