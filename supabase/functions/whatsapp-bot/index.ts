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
  type?: string; 
  text?: { message?: string };
  body?: string;
  content?: string;
  chatName?: string;
  wook?: string;
  status?: string;
  session?: string;
  
  // Campos UazapiGO / Evolution API
  event?: string;
  instance?: string;
  data?: {
    key?: {
      remoteJid?: string;
      fromMe?: boolean;
    };
    message?: {
      conversation?: string;
      extendedTextMessage?: {
        text?: string;
      };
    };
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

function extractPhoneNumber(payload: any): string {
  const msgObj = payload.data?.messages?.[0] || payload.data;
  const phoneVal = payload.phone || 
                   payload.chat?.phone || 
                   payload.message?.chatid || 
                   msgObj?.key?.remoteJid || 
                   '';
  return String(phoneVal).replace(/[^0-9]/g, '');
}

function extractText(payload: any): string | null {
  const msgObj = payload.data?.messages?.[0] || payload.data;
  const content = payload.content || 
                  payload.message?.content ||
                  payload.text?.message || 
                  payload.body || 
                  msgObj?.message?.conversation ||
                  msgObj?.message?.extendedTextMessage?.text;

  // Em alguns payloads da UAZAPI, 'content' é um objeto quando é mídia.
  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content !== null) {
    return content.caption || null;
  }
  return null;
}

// Retorna o objeto interno da mensagem (remove os wrappers da UAZAPI/Evolution API)
function getActualMessageObj(payload: any): any {
  return payload.data?.messages?.[0]?.message || 
         payload.data?.message?.message || 
         payload.data?.message || 
         payload.message || 
         {};
}

// Tenta extrair a melhor representação da mídia do payload (UAZAPI/Z-API)
// Para imagens: usa jpegThumbnail (base64) que é acessível diretamente no browser
// Para outros: retorna apenas metadados (URL do WA é criptografada, não acessível)
function extractMediaUrl(payload: any): { type: string; url: string; thumbnail?: string } | null {
  const msgData = getActualMessageObj(payload);
  const topType = String(payload.type || '').toLowerCase();

  // UAZAPI / Evolution API
  const imageMsg   = msgData.imageMessage;
  const videoMsg   = msgData.videoMessage;
  const audioMsg   = msgData.audioMessage || msgData.pttMessage;
  const docMsg     = msgData.documentMessage || msgData.documentWithCaptionMessage?.message?.documentMessage;
  const stickerMsg = msgData.stickerMessage;

  // Z-API: campos top-level
  const zapiImageUrl = payload.image?.imageUrl || payload.imageUrl;
  const zapiAudioUrl = payload.audio?.audioUrl || payload.audioUrl;
  const zapiVideoUrl = payload.video?.videoUrl || payload.videoUrl;
  const zapiDocUrl   = payload.document?.documentUrl || payload.documentUrl;
  const zapiCaption  = payload.image?.caption || payload.video?.caption || payload.caption || '';

  const isImage = imageMsg || topType.includes('image') || topType.includes('photo') || !!zapiImageUrl;
  const isVideo = videoMsg || topType.includes('video') || !!zapiVideoUrl;
  const isAudio = audioMsg || topType === 'ptt' || topType.includes('audio') || topType.includes('voice') || !!zapiAudioUrl;
  const isDoc   = docMsg || topType.includes('document') || topType.includes('file') || !!zapiDocUrl;
  const isSticker = stickerMsg || topType.includes('sticker');

  // Detecção específica para o webhook "EventType: messages" da UAZAPI
  if (typeof payload.message?.content === 'object' && payload.message?.content?.URL) {
    const mime = String(payload.message.content.mimetype || '').toLowerCase();
    // A UAZAPI não manda thumbnail base64 aqui, apenas a URL encriptada do WhatsApp
    if (mime.includes('image')) return { type: 'image', url: '', thumbnail: 'Imagem' };
    if (mime.includes('video')) return { type: 'video', url: '', thumbnail: 'Vídeo' };
    if (mime.includes('audio')) return { type: 'audio', url: '' };
    return { type: 'document', url: '', thumbnail: 'Documento' };
  }

  if (isImage) {
    // jpegThumbnail é base64 acessível diretamente - não requer auth do WA
    const thumbnail = imageMsg?.jpegThumbnail || stickerMsg?.jpegThumbnail || '';
    // Z-API fornece URL pública direta
    const directUrl = zapiImageUrl || '';
    const caption = imageMsg?.caption || zapiCaption || '';
    // Prefere URL direta da Z-API; se não, usa thumbnail base64
    const displayUrl = directUrl || (thumbnail ? `data:image/jpeg;base64,${thumbnail}` : '');
    return { type: 'image', url: displayUrl, thumbnail: caption };
  }
  if (isSticker) {
    const thumbnail = stickerMsg?.jpegThumbnail || '';
    const displayUrl = thumbnail ? `data:image/jpeg;base64,${thumbnail}` : '';
    return { type: 'sticker', url: displayUrl };
  }
  if (isVideo) {
    const thumbnail = videoMsg?.jpegThumbnail || '';
    const directUrl = zapiVideoUrl || '';
    const displayUrl = directUrl || (thumbnail ? `data:image/jpeg;base64,${thumbnail}` : '');
    const caption = videoMsg?.caption || zapiCaption || '';
    return { type: 'video', url: displayUrl, thumbnail: caption };
  }
  if (isAudio) {
    // Áudio da UAZAPI não tem thumbnail - só Z-API fornece URL direta
    return { type: 'audio', url: zapiAudioUrl || '' };
  }
  if (isDoc) {
    const fileName = docMsg?.fileName || docMsg?.title || payload.document?.fileName || 'Documento';
    return { type: 'document', url: zapiDocUrl || '', thumbnail: fileName };
  }
  return null;
}

function isWithinBusinessHours(settings: Record<string, any>): boolean {
  const businessDays = settings.business_days ?? [1, 2, 3, 4, 5];
  const startStr = settings.business_start || "08:00";
  const endStr = settings.business_end || "18:00";

  // Pegar data e hora atuais no fuso de São Paulo
  const now = new Date();
  const spDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  
  const currentDay = spDate.getDay(); // 0 a 6
  if (!businessDays.includes(currentDay)) return false;

  const currentHour = spDate.getHours();
  const currentMinute = spDate.getMinutes();
  const currentTotal = currentHour * 60 + currentMinute;

  const [startH, startM] = startStr.split(':').map(Number);
  const startTotal = startH * 60 + (startM || 0);

  const [endH, endM] = endStr.split(':').map(Number);
  const endTotal = endH * 60 + (endM || 0);

  return currentTotal >= startTotal && currentTotal <= endTotal;
}

// Tipos de eventos que a Z-API/UAZAPI envia que NÃO são mensagens recebidas
const STATUS_EVENT_TYPES = [
  'DeliveryCallback', 'ReadCallback', 'PlayedCallback',
  'SentCallback', 'MessageStatusCallback', 'PresenceCallback',
  'ConnectedCallback', 'DisconnectedCallback', 'AllUnreadMessagesCallback',
  'MESSAGE_STATUS', 'CONNECTION_UPDATE'
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
    const rawPayload = await req.json();
    const payload: ZApiMessage = rawPayload;
    console.log("[WPP Bot] Keys:", Object.keys(rawPayload).join(', '));
    console.log("[WPP Bot] Payload:", JSON.stringify(rawPayload).substring(0, 2000));
    // Se o payload tem 'message' como objeto, logar
    if (rawPayload.message) console.log("[WPP Bot] message:", JSON.stringify(rawPayload.message).substring(0, 500));
    if (rawPayload.chat) console.log("[WPP Bot] chat:", JSON.stringify(rawPayload.chat).substring(0, 500));

    // ── Ignorar eventos de status/entrega da Z-API (não são mensagens do cliente)
    if (STATUS_EVENT_TYPES.includes(payload.type || '')) {
      return new Response(JSON.stringify({ ok: true, skipped: `status:${payload.type}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Ignorar mensagens enviadas pelo próprio bot ou de grupos
    const msgObj = payload.data?.messages?.[0] || payload.data;
    const isFromMe = payload.fromMe === true || msgObj?.key?.fromMe === true;
    const remoteJid = msgObj?.key?.remoteJid || '';
    const isGroup = payload.isGroupMsg === true || remoteJid.includes('@g.us');

    if (isFromMe || isGroup) {
      return new Response(JSON.stringify({ ok: true, skipped: "fromMe_or_group" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const phone = extractPhoneNumber(payload);
    let text = extractText(payload);
    
    // --- MEDIA INTERCEPTION ---
    // Detectar tipo de mídia em múltiplos formatos (Z-API, UAZAPI, Evolution API)
    const msgType = payload.type || '';
    const msgData = getActualMessageObj(payload);
    
    // Detectar pelo campo 'type' top-level
    const typeStr = String(msgType).toLowerCase();
    
    // Detectar pelo conteúdo do objeto message (UAZAPI/Evolution envia assim)
    const msgKeys = Object.keys(msgData).join(',').toLowerCase();
    const hasImage    = typeStr.includes('image') || typeStr.includes('photo') || msgKeys.includes('image');
    const hasVideo    = typeStr.includes('video') || msgKeys.includes('video');
    const hasAudio    = typeStr.includes('audio') || typeStr === 'ptt' || typeStr.includes('voice') || msgKeys.includes('audio') || msgKeys.includes('ptt');
    const hasDoc      = typeStr.includes('document') || typeStr.includes('file') || msgKeys.includes('document');
    const hasSticker  = typeStr.includes('sticker') || msgKeys.includes('sticker');
    const hasLocation = typeStr.includes('location') || msgKeys.includes('location');
    const hasContact  = typeStr.includes('contact') || msgKeys.includes('contact');
    
    // Suporte ao formato UAZAPI 'EventType: messages'
    const isUazapiMedia = typeof payload.message?.content === 'object';
    const waLastMsgType = String(payload.chat?.wa_lastMessageType || '');
    const isUazapiImage = isUazapiMedia && (waLastMsgType === 'ImageMessage' || String(payload.message.content.mimetype).includes('image'));
    const isUazapiVideo = isUazapiMedia && (waLastMsgType === 'VideoMessage' || String(payload.message.content.mimetype).includes('video'));
    const isUazapiAudio = isUazapiMedia && (waLastMsgType === 'AudioMessage' || String(payload.message.content.mimetype).includes('audio'));
    const isUazapiDoc   = isUazapiMedia && waLastMsgType === 'DocumentMessage';

    const isMedia = hasImage || hasVideo || hasAudio || hasDoc || hasSticker || hasLocation || hasContact || isUazapiMedia;

    if (isMedia || !text) {
      // Tenta pegar a melhor representação da mídia (thumbnail base64 ou URL direta)
      const mediaInfo = extractMediaUrl(payload);
      const cdnUrl = mediaInfo?.url || '';
      const extractedThumbnailCap = (mediaInfo as any)?.thumbnail || '';
      
      // Combina caption da extração de texto (Evolution API coloca aqui às vezes) com a da mídia
      const caption = text && text !== extractedThumbnailCap ? text : extractedThumbnailCap;

      const mediaWarning = "INSTRUÇÃO PARA A IA: Informe ao cliente gentilmente que você ainda não consegue receber ou ler imagens/vídeos/áudios/documentos, e peça para ele digitar o que precisa em texto.";

      // Formatos com URL: salvamos para exibir no painel (sem armazenar arquivo binário)
      // Formato: MEDIA_URL:tipo:url|caption (caption é opcional)
      const mkMedia = (type: string, url: string, cap?: string) =>
        url ? `MEDIA_URL:${type}:${url}${cap ? `|${cap}` : ''}` : null;

      if (hasImage || isUazapiImage)         text = mkMedia('image', cdnUrl, caption) || `[📸 Imagem Recebida] ${mediaWarning}`;
      else if (hasVideo || isUazapiVideo)    text = mkMedia('video', cdnUrl, caption) || `[📹 Vídeo Recebido] ${mediaWarning}`;
      else if (hasAudio || isUazapiAudio)    text = mkMedia('audio', cdnUrl) || `[🎤 Áudio/PTT Recebido] ${mediaWarning}`;
      else if (hasDoc || isUazapiDoc)        text = mkMedia('document', cdnUrl, caption) || `[📄 Documento Recebido] ${mediaWarning}`;
      else if (hasSticker)                   text = mkMedia('sticker', cdnUrl) || `[✨ Figurinha Recebida] ${mediaWarning}`;
      else if (hasLocation)                  text = `[📍 Localização Recebida] ${mediaWarning}`;
      else if (hasContact)                   text = `[👤 Contato Recebido] ${mediaWarning}`;
      else {
        console.warn("[WPP Bot] Tipo desconhecido sem texto. type:", msgType, "| msgKeys:", msgKeys);
        text = `[Mensagem não reconhecida] ${mediaWarning}`;
      }

      // Quando temos URL/thumbnail, a IA apenas confirma o recebimento visual
      if (cdnUrl) {
        text += ' INSTRUCAO: Apenas diga ao cliente que você recebeu a mídia e que o atendimento continua. Não mencione limitacões.';
      }

      console.log("[WPP Bot] Mídia detectada. type:", msgType, "| hasThumb:", cdnUrl ? 'sim' : 'não', "| texto_len:", text?.length);
    }
    
    // Garantir que text seja uma string válida para evitar throw em .substring()
    text = String(text || '');
    
    console.log("[WPP Bot] phone:", phone, "| text:", text.substring(0, 80), "| type:", payload.type);

    if (!phone) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_phone" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!text) {
      return new Response(JSON.stringify({ ok: true, skipped: "no_text_or_media" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // --- ANTI-BLOAT: Impedir mensagens textuais maiores que 2000 caracteres ---
    // Importante: Não trunca strings que começam com MEDIA_URL: porque contêm base64
    const safeText = text.startsWith('MEDIA_URL:') ? text : text.substring(0, 2000);

    // ── Encontrar tenant
    const url = new URL(req.url);
    const tenantIdParam = url.searchParams.get("tenant_id");
    const instanceId = payload.instanceName || payload.instance || payload.instanceId || payload.session || '';
    console.log("[WPP Bot] instanceId:", instanceId, "| tenantIdParam:", tenantIdParam);

    let tenants: any[] | null = null;
    
    if (tenantIdParam) {
      const { data } = await supabase
        .from("tenants")
        .select("id, company_name, trading_name, whatsapp_settings, street, number, complement, neighborhood, city, state, cep")
        .eq("id", tenantIdParam);
      tenants = data;
    } else {
      const { data } = await supabase
        .from("tenants")
        .select("id, company_name, trading_name, whatsapp_settings, street, number, complement, neighborhood, city, state, cep");
        
      if (data) {
        tenants = data.filter(t => {
          const ws = t.whatsapp_settings as Record<string, any>;
          if (!ws) return false;
          if (ws.uazapi_url && instanceId && ws.uazapi_url.includes(instanceId)) return true;
          if (ws.zapi_instance_id === instanceId) return true;
          return false;
        });
      }
    }

    if (!tenants || tenants.length === 0) {
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

      // --- AUTO-FINALIZE INATIVAS POR > 6 HORAS ---
      const lastMsgTime = conversation.last_message_at ? new Date(conversation.last_message_at).getTime() : 0;
      if (Date.now() - lastMsgTime > 6 * 60 * 60 * 1000 && conversation.state !== 'RESOLVED') {
        conversation.assigned_agent_id = null;
        
        // Salva o encerramento no banco SEM apagar o histórico
        await supabase
          .from("whatsapp_conversations")
          .update({
            state: "RESOLVED",
            assigned_agent_id: null,
          })
          .eq("id", conversation.id);

        // Atualiza apenas o state local para o fluxo continuar normalmente com a nova mensagem
        conversation.state = "GREETING";
      }

      // Se o cliente enviar mensagem para uma conversa que estava encerrada, ela volta a ser GREETING
      if (conversation.state === 'RESOLVED') {
        conversation.state = "GREETING";
      }
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

    // Prevenção de duplicidade otimizada: checa a janela de tempo dos últimos 15s e ignora floods
    // (Bypass para mídia, pois o texto de fallback será igual)
    const nowTime = Date.now();
    const lastUserMsg = [...conversation.history].reverse().find(m => m.role === "user");
    if (lastUserMsg && !isMedia) {
      const lastTime = new Date(lastUserMsg.timestamp).getTime();
      if ((nowTime - lastTime < 15000) && lastUserMsg.content === text) {
        return new Response(JSON.stringify({ ok: true, skipped: "duplicate_spam" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    // ── Se agente humano está ativo: apenas salvar no histórico, não processar com IA
    if (conversation.state === "HUMAN_ACTIVE") {
      // Quando um humano está ativo, removemos o aviso gigante da IA para não poluir o painel do atendente
      let humanVisibleText = safeText;
      if (humanVisibleText.includes("INSTRUÇÃO PARA A IA:")) {
         humanVisibleText = humanVisibleText.split("INSTRUÇÃO PARA A IA:")[0].trim();
      }
      
      let updatedHistory = [
        ...conversation.history,
        { role: "user", content: humanVisibleText, timestamp: new Date().toISOString() },
      ];
      if (updatedHistory.length > 100) updatedHistory = updatedHistory.slice(-100);
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
    if (safeText.toUpperCase().includes(humanKeyword.toUpperCase())) {
      const isOnline = isWithinBusinessHours(settings);
      
      if (!isOnline) {
        // Se fora do horário comercial, avisa o cliente e MANTÉM a IA ativa (não muda o state para WAITING_HUMAN)
        const outMsg = settings.out_of_office_msg || "Nosso horário de atendimento com humanos é de Seg a Sex das 08h às 18h. Posso continuar te ajudando por aqui!";
        
        await sendWhatsAppMessage(settings, phone, outMsg);
        
        // Adiciona a mensagem ao histórico em memória para a IA e para o banco mais abaixo
        conversation.history.push({ role: "bot", content: outMsg, timestamp: new Date().toISOString() });
        
        // E NÃO RETORNA! Deixa o fluxo prosseguir para o whatsapp-ai-agent processar a mensagem atual.
      } else {
        // Se dentro do horário, vai para fila humana
        const agentMsg = "🙋 Entendido! Estou notificando nossa equipe agora. Um atendente assumirá a conversa em instantes. Aguarde... ⏳";
        let updatedHistory = [
          ...conversation.history,
          { role: "user", content: safeText, timestamp: new Date().toISOString() },
          { role: "bot", content: agentMsg, timestamp: new Date().toISOString() },
        ];
        if (updatedHistory.length > 100) updatedHistory = updatedHistory.slice(-100);
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
          tenant_address: `${tenant.street || ''}, ${tenant.number || ''} ${tenant.complement || ''} - ${tenant.neighborhood || ''}, ${tenant.city || ''} - ${tenant.state || ''}, CEP: ${tenant.cep || ''}`.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim(),
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
    const safeReply = reply.substring(0, 2000);
    let updatedHistory = [
      ...conversation.history,
      { role: "user", content: safeText, timestamp: new Date().toISOString() },
      { role: "bot", content: safeReply, timestamp: new Date().toISOString() },
    ];
    if (updatedHistory.length > 100) updatedHistory = updatedHistory.slice(-100);

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

// ── UAZAPI / Z-API: enviar mensagem ─────────────────────────────────────────────

async function sendWhatsAppMessage(
  settings: Record<string, any>,
  phone: string,
  text: string
): Promise<void> {
  // --- ANTI-BAN: Calcular delay humano ---
  // Uma pessoa digita cerca de 200 a 300 caracteres por minuto. 
  // Um bot precisa simular "lendo" a mensagem, depois "digitando".
  // Tempo base = 2 segundos + 30ms a 50ms por caractere da resposta, limitado a 6s.
  const baseDelay = 2000;
  const charDelay = Math.min(text.length * (Math.floor(Math.random() * 20) + 30), 4000);
  const calculatedDelay = baseDelay + charDelay;

  // 1. Tentar UAZAPI primeiro
  if (settings.uazapi_url && settings.uazapi_token) {
    let baseUrl = settings.uazapi_url.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
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
      console.error("[WPP Bot] ❌ Falha UAZAPI:", res.status, errText);
    }
    return;
  }

  // 2. Fallback para Z-API (compatibilidade)
  const { zapi_instance_id, zapi_instance_token, zapi_client_token } = settings;

  if (!zapi_instance_id || !zapi_instance_token) {
    console.error("[WPP Bot] Credenciais de WhatsApp ausentes no tenant");
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
