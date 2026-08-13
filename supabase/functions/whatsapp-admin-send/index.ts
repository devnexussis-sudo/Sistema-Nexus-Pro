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

    const body = await req.json();
    const { conversation_id, action, message, ...extra } = body;

    // ── Ação: Iniciar Nova Conversa (Outbound) ──
    if (action === "start_conversation") {
      const { phone_number, customer_id, initial_message, tenant_id } = extra;

      if (!phone_number) throw new Error("Número de telefone é obrigatório");

      let targetTenantId = tenant_id;
      if (!targetTenantId) {
        const { data: userProfile } = await supabaseAdmin
          .from("users")
          .select("tenant_id")
          .eq("id", user.id)
          .single();
        targetTenantId = userProfile?.tenant_id;
      }

      if (!targetTenantId) throw new Error("Tenant não localizado");

      const { data: agentData } = await supabaseAdmin
        .from("users")
        .select("name")
        .eq("id", user.id)
        .single();
      const agentName = agentData?.name || extra.agent_name || "Agente";

      // NORMALIZAÇÃO DE NÚMERO BRASILEIRO (Com e Sem o 9)
      let possiblePhones = [phone_number];
      if (phone_number.startsWith('55') && phone_number.length === 12) {
        possiblePhones.push(`55${phone_number.substring(2, 4)}9${phone_number.substring(4)}`);
      } else if (phone_number.startsWith('55') && phone_number.length === 13 && phone_number[4] === '9') {
        possiblePhones.push(`55${phone_number.substring(2, 4)}${phone_number.substring(5)}`);
      }

      // Verificar se a conversa já existe
      const { data: existingConvs } = await supabaseAdmin
        .from("whatsapp_conversations")
        .select("*")
        .eq("tenant_id", targetTenantId)
        .in("phone_number", possiblePhones)
        .order("last_message_at", { ascending: false, nullsFirst: false })
        .limit(1);

      const existingConv = existingConvs?.[0] || null;

      let convId = existingConv?.id;

      if (existingConv) {
        let history = existingConv.history || [];
        if (initial_message && initial_message.trim()) {
          history = [
            ...history,
            {
              role: "agent",
              content: initial_message.trim().substring(0, 2000),
              timestamp: new Date().toISOString(),
              agent_id: user.id,
              agent_name: agentName,
            },
          ];
        }

        await supabaseAdmin
          .from("whatsapp_conversations")
          .update({
            state: "HUMAN_ACTIVE",
            assigned_agent_id: user.id,
            customer_id: customer_id || existingConv.customer_id,
            history: history.slice(-100),
            last_message_at: new Date().toISOString(),
          })
          .eq("id", existingConv.id);

        convId = existingConv.id;
      } else {
        const initialHistory = initial_message && initial_message.trim() ? [{
          role: "agent",
          content: initial_message.trim().substring(0, 2000),
          timestamp: new Date().toISOString(),
          agent_id: user.id,
          agent_name: agentName,
        }] : [];

        const { data: created, error: createErr } = await supabaseAdmin
          .from("whatsapp_conversations")
          .insert([{
            tenant_id: targetTenantId,
            phone_number: phone_number,
            customer_id: customer_id || null,
            assigned_agent_id: user.id,
            state: "HUMAN_ACTIVE",
            history: initialHistory,
            last_message_at: new Date().toISOString(),
          }])
          .select("id")
          .single();

        if (createErr) throw new Error(createErr.message);
        convId = created?.id;
      }

      // Se houver mensagem inicial, disparar via UAIZAP / Z-API
      if (initial_message && initial_message.trim()) {
        const { data: tenant } = await supabaseAdmin
          .from("tenants")
          .select("whatsapp_settings")
          .eq("id", targetTenantId)
          .single();
        const settings = (tenant?.whatsapp_settings || {}) as Record<string, string>;
        await sendWhatsAppMessage(settings, phone_number, initial_message.trim());
      }

      return new Response(JSON.stringify({ ok: true, action: "start_conversation", conversation_id: convId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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
        { role: "agent", content: takeoverMsg, timestamp: new Date().toISOString(), agent_id: user.id, agent_name: agentName },
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

      await sendWhatsAppMessage(settings, conv.phone_number, takeoverMsg);

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
          history: updatedHistory.slice(-100),
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      await sendWhatsAppMessage(settings, conv.phone_number, returnMsg);

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
        { role: "agent", content: transferMsg, timestamp: new Date().toISOString(), agent_id: user.id, agent_name: extra?.agent_name || "Agente" },
      ];

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          assigned_agent_id: extra.target_user_id,
          history: updatedHistory.slice(-100),
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      await sendWhatsAppMessage(settings, conv.phone_number, transferMsg);

      return new Response(JSON.stringify({ ok: true, action: "transfer" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: reiniciar bot
    if (action === "reset_bot") {
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "GREETING",
          assigned_agent_id: null,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      return new Response(JSON.stringify({ ok: true, action: "reset_bot" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: encerrar conversa
    if (action === "close_conversation") {
      const closeMsg = `Atendimento encerrado por um de nossos agentes. Agradecemos o contato! 👋`;

      const updatedHistory = [
        ...(conv.history || []),
        { role: "agent", content: closeMsg, timestamp: new Date().toISOString(), agent_id: user.id, agent_name: extra?.agent_name || "Agente" },
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

      await sendWhatsAppMessage(settings, conv.phone_number, closeMsg);

      return new Response(JSON.stringify({ ok: true, action: "close_conversation" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: enviar mensagem do agente
    if (action === "send" && message) {
      // Salvar no histórico
      // --- ANTI-BLOAT: Impedir mensagens maiores que 2000 caracteres (ex: base64) ---
      const safeText = message.substring(0, 2000);

      let updatedHistory = [
        ...(conv.history || []),
        { role: "agent", content: safeText, timestamp: new Date().toISOString(), agent_id: user.id, agent_name: extra?.agent_name || "Agente" },
      ];

      // --- ANTI-BLOAT: Janela deslizante de 100 mensagens ---
      if (updatedHistory.length > 100) {
        updatedHistory = updatedHistory.slice(-100);
      }

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          history: updatedHistory,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      // Enviar via UAZAPI / Z-API
      await sendWhatsAppMessage(settings, conv.phone_number, message);

      return new Response(JSON.stringify({ ok: true, action: "sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: enviar figurinha do agente
    if (action === "send_sticker" && message) {
      // O 'message' conterá a URL ou base64 da figurinha, mas salvaremos no histórico como um aviso amigável
      const safeText = "[✨ Figurinha Enviada]";

      let updatedHistory = [
        ...(conv.history || []),
        { role: "agent", content: safeText, timestamp: new Date().toISOString(), agent_id: user.id, agent_name: extra?.agent_name || "Agente" },
      ];

      if (updatedHistory.length > 100) {
        updatedHistory = updatedHistory.slice(-100);
      }

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          history: updatedHistory,
          last_message_at: new Date().toISOString(),
        })
        .eq("id", conversation_id);

      // Enviar sticker via UAZAPI / Z-API
      await sendWhatsAppSticker(settings, conv.phone_number, message);

      return new Response(JSON.stringify({ ok: true, action: "send_sticker" }), {
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

async function sendWhatsAppMessage(
  settings: Record<string, string>,
  phone: string,
  text: string
): Promise<void> {
  // 1. Tentar UAZAPI primeiro
  if (settings.uazapi_url && settings.uazapi_token) {
    let baseUrl = settings.uazapi_url.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    // --- ANTI-BAN: Calcular delay humano para o atendente ---
    const baseDelay = 1000; // 1s base para o atendente
    const charDelay = Math.min(text.length * (Math.floor(Math.random() * 15) + 20), 3000);
    const calculatedDelay = baseDelay + charDelay;

    const url = `${baseUrl}/send/text`;

    const payload = { 
      number: phone, 
      text: text,
      readchat: true,      // Simula visualização da mensagem recebida
      delay: calculatedDelay // Simula o digitando...
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
      console.error("[Admin Send] ❌ Falha UAZAPI:", res.status, errText);
    }
    return;
  }

  // 2. Fallback Z-API
  const { zapi_instance_id, zapi_instance_token, zapi_client_token } = settings;
  if (!zapi_instance_id || !zapi_instance_token) {
    console.error("[Admin Send] Credenciais de WhatsApp ausentes no tenant");
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
    console.error("[Admin Send] ❌ Falha Z-API:", res.status, errText);
  }
}

async function sendWhatsAppSticker(
  settings: Record<string, string>,
  phone: string,
  stickerUrlOrBase64: string
): Promise<void> {
  // 1. Tentar UAZAPI primeiro
  if (settings.uazapi_url && settings.uazapi_token) {
    let baseUrl = settings.uazapi_url.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    const url = `${baseUrl}/send/sticker`;

    const payload = { 
      number: phone, 
      sticker: stickerUrlOrBase64
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
      console.error("[Admin Send] ❌ Falha UAZAPI (Sticker):", res.status, errText);
    }
    return;
  }

  // 2. Fallback Z-API
  const { zapi_instance_id, zapi_instance_token, zapi_client_token } = settings;
  if (!zapi_instance_id || !zapi_instance_token) return;

  const url = `https://api.z-api.io/instances/${zapi_instance_id}/token/${zapi_instance_token}/send-sticker`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (zapi_client_token) headers["Client-Token"] = zapi_client_token;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ phone: phone, sticker: stickerUrlOrBase64 }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("[Admin Send] ❌ Falha Z-API (Sticker):", res.status, errText);
  }
}
