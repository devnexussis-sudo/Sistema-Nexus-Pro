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
        if (initial_message && initial_message.trim()) {
          await supabaseAdmin.from("whatsapp_messages").insert({
              conversation_id: existingConv.id,
              tenant_id: targetTenantId,
              role: "agent",
              content: initial_message.trim().substring(0, 2000),
              type: "text",
              is_from_me: true,
              agent_id: user.id,
              agent_name: agentName,
              created_at: new Date().toISOString()
          });
        }

        await supabaseAdmin
          .from("whatsapp_conversations")
          .update({
            state: "HUMAN_ACTIVE",
            assigned_agent_id: user.id,
            customer_id: customer_id || existingConv.customer_id,
            history: [...(existingConv.history || []), { role: "agent", content: initial_message.trim().substring(0, 2000), timestamp: new Date().toISOString() }],
            last_message_at: new Date().toISOString(),
          })
          .eq("id", existingConv.id);

        convId = existingConv.id;
      } else {
        const { data: created, error: createErr } = await supabaseAdmin
          .from("whatsapp_conversations")
          .insert([{
            tenant_id: targetTenantId,
            phone_number: phone_number,
            customer_id: customer_id || null,
            assigned_agent_id: user.id,
            state: "HUMAN_ACTIVE",
            last_message_at: new Date().toISOString(),
            history: initial_message && initial_message.trim() ? [{ role: "agent", content: initial_message.trim().substring(0, 2000), timestamp: new Date().toISOString() }] : [],
          }])
          .select("id")
          .single();

        if (createErr) throw new Error(createErr.message);
        convId = created?.id;
        
        if (initial_message && initial_message.trim() && convId) {
            await supabaseAdmin.from("whatsapp_messages").insert({
              conversation_id: convId,
              tenant_id: targetTenantId,
              role: "agent",
              content: initial_message.trim().substring(0, 2000),
              type: "text",
              is_from_me: true,
              agent_id: user.id,
              agent_name: agentName,
              created_at: new Date().toISOString()
            });
        }
      }

      // Se houver mensagem inicial, disparar via UAIZAP / Z-API
      if (initial_message && initial_message.trim()) {
        const { data: tenant } = await supabaseAdmin
          .from("tenants")
          .select("whatsapp_settings")
          .eq("id", targetTenantId)
          .single();
        const settings = (tenant?.whatsapp_settings || {}) as Record<string, any>;
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

    const settings = tenant?.whatsapp_settings as Record<string, any>;

    // ── Ação: assumir conversa
    if (action === "takeover") {
      const { data: agentData } = await supabase
        .from("users")
        .select("name")
        .eq("id", user.id)
        .single();

      const agentName = agentData?.name || "nossa equipe";
      const takeoverMsg = `✅ *${agentName}* da equipe assumiu o atendimento. Como posso ajudar?`;

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id: conversation_id,
        tenant_id: conv.tenant_id,
        role: "agent",
        content: takeoverMsg,
        type: "text",
        is_from_me: true,
        agent_id: user.id,
        agent_name: agentName,
        created_at: new Date().toISOString()
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "HUMAN_ACTIVE",
          assigned_agent_id: user.id,
          history: [...(conv.history || []), { role: "agent", content: takeoverMsg, timestamp: new Date().toISOString() }],
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

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id: conversation_id,
        tenant_id: conv.tenant_id,
        role: "bot",
        content: returnMsg,
        type: "text",
        is_from_me: true,
        created_at: new Date().toISOString()
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "CUSTOMER_FOUND",
          assigned_agent_id: null,
          history: [...(conv.history || []), { role: "bot", content: returnMsg, timestamp: new Date().toISOString() }],
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

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id: conversation_id,
        tenant_id: conv.tenant_id,
        role: "agent",
        content: transferMsg,
        type: "text",
        is_from_me: true,
        agent_id: user.id,
        agent_name: extra?.agent_name || "Agente",
        created_at: new Date().toISOString()
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          assigned_agent_id: extra.target_user_id,
          history: [...(conv.history || []), { role: "agent", content: transferMsg, timestamp: new Date().toISOString() }],
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
      const resetMsg = `🤖 Bot reiniciado.`;
      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "GREETING",
          assigned_agent_id: null,
          history: [...(conv.history || []), { role: "agent", content: resetMsg, timestamp: new Date().toISOString() }],
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

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id: conversation_id,
        tenant_id: conv.tenant_id,
        role: "agent",
        content: closeMsg,
        type: "text",
        is_from_me: true,
        agent_id: user.id,
        agent_name: extra?.agent_name || "Agente",
        created_at: new Date().toISOString()
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({
          state: "GREETING",
          assigned_agent_id: null,
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
      const safeText = message.substring(0, 2000);

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id: conversation_id,
        tenant_id: conv.tenant_id,
        role: "agent",
        content: safeText,
        type: "text",
        is_from_me: true,
        agent_id: user.id,
        agent_name: extra?.agent_name || "Agente",
        created_at: new Date().toISOString()
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ 
            history: [...(conv.history || []), { role: "agent", content: safeText, timestamp: new Date().toISOString() }],
            last_message_at: new Date().toISOString() 
        })
        .eq("id", conversation_id);

      // Enviar via UAZAPI / Z-API
      await sendWhatsAppMessage(settings, conv.phone_number, message);

      return new Response(JSON.stringify({ ok: true, action: "sent" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: enviar mídia do agente (imagem ou documento)
    if (action === "send_media" && message) {
      const { media_type, original_name } = extra;
      const type = media_type || "image";
      
      const safeText = `MEDIA_URL:${type}:${message}`;

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id: conversation_id,
        tenant_id: conv.tenant_id,
        role: "agent",
        content: safeText,
        type: type,
        media_url: message, // public R2 url
        is_from_me: true,
        agent_id: user.id,
        agent_name: extra?.agent_name || "Agente",
        created_at: new Date().toISOString()
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ 
            history: [...(conv.history || []), { role: "agent", content: safeText, timestamp: new Date().toISOString() }],
            last_message_at: new Date().toISOString() 
        })
        .eq("id", conversation_id);

      // Enviar media via UAZAPI / Z-API
      await sendWhatsAppMedia(settings, conv.phone_number, message, type, original_name);

      return new Response(JSON.stringify({ ok: true, action: "send_media" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ação: enviar figurinha do agente
    if (action === "send_sticker" && message) {
      const safeText = "[✨ Figurinha Enviada]";

      await supabaseAdmin.from("whatsapp_messages").insert({
        conversation_id: conversation_id,
        tenant_id: conv.tenant_id,
        role: "agent",
        content: safeText,
        type: "sticker",
        media_url: message, // sticker url
        is_from_me: true,
        agent_id: user.id,
        agent_name: extra?.agent_name || "Agente",
        created_at: new Date().toISOString()
      });

      await supabaseAdmin
        .from("whatsapp_conversations")
        .update({ 
            history: [...(conv.history || []), { role: "agent", content: safeText, timestamp: new Date().toISOString() }],
            last_message_at: new Date().toISOString() 
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
  settings: Record<string, any>,
  phone: string,
  text: string
): Promise<void> {
  // 1. Tentar UAZAPI primeiro
  if (settings.uazapi_url && settings.uazapi_token) {
    let baseUrl = settings.uazapi_url.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const token = settings.uazapi_token.trim();

    const baseDelay = 1000;
    const charDelay = Math.min(text.length * (Math.floor(Math.random() * 15) + 20), 3000);
    const calculatedDelay = baseDelay + charDelay;

    const url = `${baseUrl}/send/text`;

    const payload = { 
      number: phone, 
      text: text,
      readchat: true,      // Marca conversa como lida no WhatsApp
      readmessages: true,  // Marca mensagens recebidas como lidas
      delay: calculatedDelay // Simula digitação humana
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": token,
        "token": token,
        "apikey": token
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

async function sendWhatsAppMedia(
  settings: Record<string, any>,
  phone: string,
  mediaUrl: string,
  mediaType: string,
  originalName?: string
): Promise<void> {
  // 1. Tentar UAZAPI primeiro
  if (settings.uazapi_url && settings.uazapi_token) {
    let baseUrl = settings.uazapi_url.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const token = settings.uazapi_token.trim();

    const isDoc = mediaType === 'document';
    const url = `${baseUrl}/send/media`;

    // Conforme Especificação OpenAPI UAZAPI:
    // POST /send/media requer: { "number": "...", "type": "image|document", "file": "URL" }
    const payload: Record<string, any> = { 
      number: phone,
      type: isDoc ? 'document' : 'image',
      file: mediaUrl,
      readchat: true,
      readmessages: true,
      delay: 1500
    };

    if (isDoc) {
      payload.docName = originalName || 'documento.pdf';
    }

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": token,
        "token": token,
        "apikey": token
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[Admin Send] ❌ Falha UAZAPI (Media):", res.status, errText);
    }
    return;
  }

  // 2. Fallback Z-API
  const { zapi_instance_id, zapi_instance_token, zapi_client_token } = settings;
  if (!zapi_instance_id || !zapi_instance_token) return;

  const isDoc = mediaType === 'document';
  const url = `https://api.z-api.io/instances/${zapi_instance_id}/token/${zapi_instance_token}/send-${isDoc ? 'document' : 'image'}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (zapi_client_token) headers["Client-Token"] = zapi_client_token;

  const payload: Record<string, any> = { phone: phone };
  if (isDoc) {
    payload.document = mediaUrl;
    payload.fileName = originalName || 'documento.pdf';
  } else {
    payload.image = mediaUrl;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`[Admin Send] ❌ Falha Z-API (${mediaType}):`, res.status, errText);
  }
}

async function sendWhatsAppSticker(
  settings: Record<string, any>,
  phone: string,
  stickerUrlOrBase64: string
): Promise<void> {
  // 1. Tentar UAZAPI primeiro
  if (settings.uazapi_url && settings.uazapi_token) {
    let baseUrl = settings.uazapi_url.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const token = settings.uazapi_token.trim();

    const url = `${baseUrl}/send/media`;

    const payload = { 
      number: phone, 
      type: "sticker",
      file: stickerUrlOrBase64,
      readchat: true,
      readmessages: true
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Client-Token": token,
        "token": token,
        "apikey": token
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
