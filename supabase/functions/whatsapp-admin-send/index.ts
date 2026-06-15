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

    const { conversation_id, message, action } = await req.json();

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
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "HUMAN_ACTIVE",
          assigned_agent_id: user.id,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      // Notificar o cliente que um humano assumiu
      const { data: agentData } = await supabase
        .from("users")
        .select("name")
        .eq("id", user.id)
        .single();

      const agentName = agentData?.name || "nossa equipe";
      const takeoverMsg = `✅ *${agentName}* da equipe assumiu o atendimento. Como posso ajudar?`;

      await sendEvolutionMessage(settings, conv.phone_number, takeoverMsg);

      return new Response(JSON.stringify({ ok: true, action: "takeover" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: devolver ao bot
    if (action === "return_to_bot") {
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "CUSTOMER_FOUND",
          assigned_agent_id: null,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      const returnMsg = `🤖 O atendimento foi retornado ao assistente virtual. Como posso ajudar?`;
      await sendEvolutionMessage(settings, conv.phone_number, returnMsg);

      return new Response(JSON.stringify({ ok: true, action: "return_to_bot" }), {
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

      // Enviar via Evolution API
      await sendEvolutionMessage(settings, conv.phone_number, message);

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

async function sendEvolutionMessage(
  settings: Record<string, string>,
  phone: string,
  text: string
): Promise<void> {
  const { evolution_api_url, evolution_api_key, instance_name } = settings;
  if (!evolution_api_url || !evolution_api_key || !instance_name) return;

  await fetch(`${evolution_api_url}/message/sendText/${instance_name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: evolution_api_key },
    body: JSON.stringify({ number: phone, text, delay: 500 }),
  });
}
