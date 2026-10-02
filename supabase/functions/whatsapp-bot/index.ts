// -------------------------------------------------------------------
// whatsapp-bot - Webhook Receiver (UAZAPI / Evolution / Z-API)
// Recebe eventos da UAZAPI/Z-API e orquestra o fluxo do bot de IA
// Suporte a lotes concorrentes, audios de voz (max 2MB) e bloqueio de videos
// -------------------------------------------------------------------

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { PutObjectCommand, S3Client } from 'npm:@aws-sdk/client-s3@3.370.0';
import { Image } from 'https://deno.land/x/imagescript@1.2.15/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Conversation {
  id: string;
  tenant_id: string;
  phone_number: string;
  customer_id: string | null;
  state: string;
  history: Array<{ role: string; content: string; timestamp: string }>;
  assigned_agent_id: string | null;
  last_message_at?: string;
}

function extractPhoneNumber(payload: any): string {
  const msgObj = payload.data?.messages?.[0] || payload.data;
  const phoneVal = payload.phone ||
    payload.chat?.phone ||
    payload.chat?.id ||
    payload.sender?.phone ||
    payload.sender?.id ||
    payload.message?.chatid ||
    payload.remoteJid ||
    msgObj?.key?.remoteJid ||
    msgObj?.remoteJid ||
    '';
  const cleanPhone = String(phoneVal).split('@')[0];
  return cleanPhone.replace(/[^0-9]/g, '');
}

function unwrapMessage(msg: any): any {
  if (!msg || typeof msg !== 'object') return msg;
  if (msg.ephemeralMessage) return unwrapMessage(msg.ephemeralMessage.message);
  if (msg.viewOnceMessage) return unwrapMessage(msg.viewOnceMessage.message);
  if (msg.viewOnceMessageV2) return unwrapMessage(msg.viewOnceMessageV2.message);
  if (msg.viewOnceMessageV2Extension) return unwrapMessage(msg.viewOnceMessageV2Extension.message);
  if (msg.documentWithCaptionMessage) return unwrapMessage(msg.documentWithCaptionMessage.message);
  if (msg.editedMessage) {
    return unwrapMessage(
      msg.editedMessage.message?.protocolMessage?.editedMessage || msg.editedMessage.message,
    );
  }
  return msg;
}

function extractMessageId(payload: any): string {
  const msgObj = payload.data?.messages?.[0] || payload.data || {};
  const msgData = getActualMessageObj(payload) || {};
  return (
    payload.messageid ||
    payload.message?.messageid ||
    payload.message?.id ||
    msgData.messageid ||
    msgData.id ||
    msgObj.key?.id ||
    msgObj.id ||
    payload.id ||
    ''
  );
}

function extractText(payload: any): string | null {
  const content = payload.content ||
    payload.message?.content ||
    payload.text?.message ||
    payload.body;

  if (typeof content === 'string') return content;
  if (typeof content === 'object' && content !== null && content.caption) {
    return content.caption;
  }

  const actualMsg = getActualMessageObj(payload);
  const textMsg = actualMsg?.conversation ||
    actualMsg?.extendedTextMessage?.text;

  if (typeof textMsg === 'string') return textMsg;

  return null;
}

function getActualMessageObj(payload: any): any {
  const rawMsg = payload.data?.messages?.[0]?.message ||
    payload.data?.message?.message ||
    payload.data?.message ||
    payload.message ||
    {};
  return unwrapMessage(rawMsg);
}

// Filtra webhooks de metadados, protocolo, confirmacoes e cabecalhos de album sem midias reais
function isProtocolOrMetadataMessage(payload: any): boolean {
  const typeStr = String(payload.type || payload.mediaType || payload.messageType || '')
    .toLowerCase();
  const msgData = getActualMessageObj(payload) || {};

  const metaTypes = [
    'protocolmessage',
    'senderkeydistributionmessage',
    'messagecontextinfo',
    'reactionmessage',
    'keepinchatmessage',
    'pininchatmessage',
    'pollupdatemessage',
    'notification',
    'ciphertext',
    'enc',
  ];

  if (metaTypes.includes(typeStr)) return true;
  if (msgData.protocolMessage || msgData.senderKeyDistributionMessage || msgData.reactionMessage) {
    return true;
  }

  const isAlbumHeader = typeStr === 'album' ||
    typeStr === 'media_album' ||
    typeStr === 'mediagroup' ||
    typeStr === 'albummessage' ||
    !!msgData.albumMessage;

  if (isAlbumHeader) {
    const hasRealMedia = !!(
      (typeof payload.image === 'object' && payload.image !== null &&
        (payload.image?.imageUrl || payload.image?.url || payload.image?.base64)) ||
      (typeof payload.message?.image === 'object' && payload.message?.image !== null &&
        (payload.message.image?.url || payload.message.image?.base64)) ||
      (typeof payload.url === 'string' && payload.url.length > 0) ||
      (typeof payload.fileURL === 'string' && payload.fileURL.length > 0) ||
      (typeof payload.mediaUrl === 'string' && payload.mediaUrl.length > 0) ||
      (typeof payload.base64 === 'string' && payload.base64.length > 0) ||
      (typeof payload.data?.base64 === 'string' && payload.data?.base64.length > 0) ||
      (typeof payload.data?.message?.base64 === 'string' &&
        payload.data?.message?.base64.length > 0) ||
      msgData.imageMessage?.url || msgData.imageMessage?.jpegThumbnail
    );
    if (!hasRealMedia) return true;
  }

  return false;
}

function extractMediaUrl(payload: any): { type: string; url: string; thumbnail?: string } | null {
  const msgData = getActualMessageObj(payload);
  const topType = String(payload.type || payload.mediaType || payload.messageType || '')
    .toLowerCase();
  const mime = String(
    payload.message?.content?.mimetype ||
      payload.message?.mimetype ||
      payload.mimetype ||
      payload.data?.mimetype ||
      payload.content?.mimetype ||
      '',
  ).toLowerCase();

  const imageMsg = msgData.imageMessage;
  const videoMsg = msgData.videoMessage;
  const audioMsg = msgData.audioMessage || msgData.pttMessage;
  const docMsg = msgData.documentMessage ||
    msgData.documentWithCaptionMessage?.message?.documentMessage;
  const stickerMsg = msgData.stickerMessage;

  const zapiImageUrl = (typeof payload.image === 'object' && payload.image?.imageUrl) ||
    payload.imageUrl || payload.message?.imageUrl || payload.url || payload.fileURL ||
    payload.mediaUrl || payload.message?.url || payload.message?.content?.URL || '';
  const zapiAudioUrl = (typeof payload.audio === 'object' && payload.audio?.audioUrl) ||
    payload.audioUrl || payload.message?.audioUrl || payload.url || payload.fileURL ||
    payload.mediaUrl || '';
  const zapiVideoUrl = (typeof payload.video === 'object' && payload.video?.videoUrl) ||
    payload.videoUrl || payload.message?.videoUrl;
  const zapiDocUrl = (typeof payload.document === 'object' && payload.document?.documentUrl) ||
    payload.documentUrl || payload.message?.documentUrl;
  const zapiCaption = (typeof payload.image === 'object' && payload.image?.caption) ||
    (typeof payload.video === 'object' && payload.video?.caption) || payload.caption ||
    payload.message?.content?.caption || '';

  const hasImageObj = typeof payload.image === 'object' && payload.image !== null &&
    (!!payload.image.imageUrl || !!payload.image.url || !!payload.image.base64);
  const hasVideoObj = typeof payload.video === 'object' && payload.video !== null &&
    (!!payload.video.videoUrl || !!payload.video.url || !!payload.video.base64);
  const hasAudioObj = typeof payload.audio === 'object' && payload.audio !== null &&
    (!!payload.audio.audioUrl || !!payload.audio.url || !!payload.audio.base64);
  const hasDocObj = typeof payload.document === 'object' && payload.document !== null &&
    (!!payload.document.documentUrl || !!payload.document.url || !!payload.document.base64);

  const isImage = imageMsg || topType.includes('image') || topType.includes('photo') ||
    mime.includes('image') || !!zapiImageUrl || hasImageObj;
  const isVideo = videoMsg || topType.includes('video') || mime.includes('video') ||
    !!zapiVideoUrl || hasVideoObj;
  const isAudio = audioMsg || topType === 'ptt' || topType.includes('audio') ||
    topType.includes('voice') || mime.includes('audio') || !!zapiAudioUrl || hasAudioObj;
  const isDoc = docMsg || topType.includes('document') || topType.includes('file') ||
    mime.includes('pdf') || mime.includes('document') || !!zapiDocUrl || hasDocObj;
  const isSticker = stickerMsg || topType.includes('sticker') || mime.includes('webp');

  if (typeof payload.message?.content === 'object' && payload.message?.content?.URL) {
    const mimeStr = String(payload.message.content.mimetype || '').toLowerCase();
    if (mimeStr.includes('image')) {
      return {
        type: 'image',
        url: payload.message.content.URL || zapiImageUrl || '',
        thumbnail: 'Imagem',
      };
    }
    if (mimeStr.includes('video')) {
      return {
        type: 'video',
        url: payload.message.content.URL || zapiVideoUrl || '',
        thumbnail: 'Video',
      };
    }
    if (mimeStr.includes('audio')) {
      return { type: 'audio', url: payload.message.content.URL || zapiAudioUrl || '' };
    }
    return {
      type: 'document',
      url: payload.message.content.URL || zapiDocUrl || '',
      thumbnail: 'Documento',
    };
  }

  if (isImage) {
    const thumbnail = imageMsg?.jpegThumbnail || stickerMsg?.jpegThumbnail || '';
    const directUrl = zapiImageUrl || '';
    const caption = imageMsg?.caption || zapiCaption || '';
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
    return { type: 'audio', url: zapiAudioUrl || '' };
  }
  if (isDoc) {
    const fileName = docMsg?.fileName || docMsg?.title || payload.document?.fileName || 'Documento';
    return { type: 'document', url: zapiDocUrl || '', thumbnail: fileName };
  }
  return null;
}

// Chamar /message/markread na UAZAPI para gerar o azulzinho (double check) no celular do cliente
async function markWhatsAppRead(settings: Record<string, any>, messageId: string): Promise<void> {
  if (!messageId || !settings.uazapi_url || !settings.uazapi_token) return;
  try {
    let baseUrl = settings.uazapi_url.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const token = settings.uazapi_token.trim();

    await fetch(`${baseUrl}/message/markread`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': token,
        'token': token,
        'apikey': token,
      },
      body: JSON.stringify({ id: [messageId] }),
    });
    console.log('[WPP Bot] Read receipt (/message/markread) enviado para msg ID:', messageId);
  } catch (e) {
    console.error('[WPP Bot] Erro ao enviar marcacao de leitura:', e);
  }
}

// Chamar /message/download na UAZAPI com retentativas resilientes para lotes de midias
async function downloadWhatsAppMedia(
  settings: Record<string, any>,
  messageId: string,
): Promise<{ base64?: string; fileURL?: string } | null> {
  if (!messageId || !settings.uazapi_url || !settings.uazapi_token) return null;
  let baseUrl = settings.uazapi_url.trim();
  if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
  const token = settings.uazapi_token.trim();

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(`${baseUrl}/message/download`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Client-Token': token,
          'token': token,
          'apikey': token,
        },
        body: JSON.stringify({
          id: messageId,
          return_base64: true,
          return_link: true,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const base64 = data.base64Data || data.base64 || data.fileBase64 || '';
        const fileURL = data.fileURL || data.fileUrl || data.url || '';
        if (base64 || fileURL) {
          console.log(
            `[WPP Bot] /message/download sucesso (tentativa ${attempt + 1}) para msg ID:`,
            messageId,
          );
          return { base64, fileURL };
        }
      }
    } catch (e) {
      console.error(`[WPP Bot] Excecao /message/download (tentativa ${attempt + 1}):`, e);
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }
  return null;
}

// Salva mensagens concorrentes de forma atomica no banco (evita sobrescrita de array no history)
async function appendMessagesToConversation(
  supabase: any,
  conversationId: string,
  tenantId: string,
  messagesToAppend: Array<
    {
      id?: string;
      role: string;
      content: string;
      type?: string;
      is_from_me?: boolean;
      agent_id?: string;
      agent_name?: string;
      timestamp?: string;
    }
  >,
  newState?: string,
  customerId?: string | null,
) {
  const { error: rpcErr } = await supabase.rpc('append_whatsapp_message', {
    p_conversation_id: conversationId,
    p_tenant_id: tenantId,
    p_messages: messagesToAppend,
    p_new_state: newState || null,
    p_customer_id: customerId || null,
  });

  if (!rpcErr) {
    console.log('[WPP Bot] RPC atomico append_whatsapp_message executado com sucesso');
    return;
  }

  console.warn(
    '[WPP Bot] RPC append_whatsapp_message pendente no DB, executando fallback direto:',
    rpcErr.message,
  );

  let lastUserMsgId: string | null = null;

  for (const m of messagesToAppend) {
    let msgType = m.type || 'text';
    if (m.content.startsWith('MEDIA_URL:')) {
      msgType = m.content.split(':')[1] || 'text';
    }
    const isFromMe = m.is_from_me !== undefined
      ? m.is_from_me
      : (m.role === 'agent' || m.role === 'bot' || m.role === 'system');
    const msgId = m.id || crypto.randomUUID();

    if (m.role === 'user') {
      lastUserMsgId = msgId;
    }

    const insertPayload: Record<string, any> = {
      id: msgId,
      conversation_id: conversationId,
      tenant_id: tenantId,
      role: m.role,
      content: m.content,
      type: msgType,
      is_from_me: isFromMe,
      agent_id: m.agent_id || null,
      agent_name: m.agent_name || null,
      created_at: m.timestamp || new Date().toISOString(),
    };

    await supabase.from('whatsapp_messages').insert(insertPayload);
  }

  const { data: freshConv } = await supabase
    .from('whatsapp_conversations')
    .select('history')
    .eq('id', conversationId)
    .single();

  const currentHistory = Array.isArray(freshConv?.history) ? freshConv.history : [];
  let updatedHistory = [...currentHistory, ...messagesToAppend];
  if (updatedHistory.length > 100) updatedHistory = updatedHistory.slice(-100);

  const updateObj: Record<string, any> = {
    history: updatedHistory,
    last_message_at: new Date().toISOString(),
  };
  if (newState) updateObj.state = newState;
  if (customerId) updateObj.customer_id = customerId;
  if (lastUserMsgId) updateObj.last_user_message_id = lastUserMsgId;

  await supabase
    .from('whatsapp_conversations')
    .update(updateObj)
    .eq('id', conversationId);
}

const STATUS_EVENT_TYPES = [
  'DeliveryCallback',
  'ReadCallback',
  'PlayedCallback',
  'SentCallback',
  'MessageStatusCallback',
  'PresenceCallback',
  'ConnectedCallback',
  'DisconnectedCallback',
  'AllUnreadMessagesCallback',
  'MESSAGE_STATUS',
  'CONNECTION_UPDATE',
  'messages_update',
  'MESSAGE_UPDATE',
  'messages.update',
  'MESSAGES_UPDATE',
];

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const rawPayload = await req.json();
    const payload: any = rawPayload;
    console.log('[WPP Bot] Keys:', Object.keys(rawPayload).join(', '));
    console.log('[WPP Bot] Payload:', JSON.stringify(rawPayload).substring(0, 2000));

    if (STATUS_EVENT_TYPES.includes(payload.type || '')) {
      return new Response(JSON.stringify({ ok: true, skipped: `status:${payload.type}` }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (isProtocolOrMetadataMessage(payload)) {
      console.log('[WPP Bot] Webhook de metadados/protocolo ignorado');
      return new Response(JSON.stringify({ ok: true, skipped: 'protocol_or_metadata_message' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const msgObj = payload.data?.messages?.[0] || payload.data;
    const isFromMe = payload.fromMe === true || msgObj?.key?.fromMe === true;
    const remoteJid = msgObj?.key?.remoteJid || '';
    const isGroup = payload.isGroupMsg === true || remoteJid.includes('@g.us');

    if (isFromMe || isGroup) {
      return new Response(JSON.stringify({ ok: true, skipped: 'fromMe_or_group' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const phone = extractPhoneNumber(payload);
    let text = extractText(payload);
    const messageId = extractMessageId(payload);

    const url = new URL(req.url);
    const rawTenantIdParam = url.searchParams.get('tenant_id');
    const tenantIdParam = rawTenantIdParam ? rawTenantIdParam.split('/')[0] : null;

    const instanceId = payload.instanceName || payload.instance || payload.instanceId ||
      payload.session || '';
    console.log(
      '[WPP Bot] instanceId:',
      instanceId,
      '| tenantIdParam:',
      tenantIdParam,
      '| msgId:',
      messageId,
    );

    let tenants: any[] | null = null;

    if (tenantIdParam) {
      const { data } = await supabase
        .from('tenants')
        .select(
          'id, company_name, trading_name, cnpj, whatsapp_settings, street, number, complement, neighborhood, city, state, cep',
        )
        .eq('id', tenantIdParam);
      tenants = data;
    } else {
      const { data } = await supabase
        .from('tenants')
        .select(
          'id, company_name, trading_name, cnpj, whatsapp_settings, street, number, complement, neighborhood, city, state, cep',
        );

      if (data) {
        tenants = data.filter((t) => {
          const ws = t.whatsapp_settings as Record<string, any>;
          if (!ws) return false;
          if (
            ws.uazapi_instance && instanceId &&
            ws.uazapi_instance.toLowerCase() === instanceId.toLowerCase()
          ) return true;
          if (ws.uazapi_url && instanceId && ws.uazapi_url.includes(instanceId)) return true;
          if (
            ws.zapi_instance_id && instanceId &&
            ws.zapi_instance_id.toLowerCase() === instanceId.toLowerCase()
          ) return true;
          return false;
        });

        if ((!tenants || tenants.length === 0) && data.length === 1) {
          tenants = data;
        }
      }
    }

    if (!tenants || tenants.length === 0) {
      console.error('[WPP Bot] Tenant nao encontrado para instanceId:', instanceId);
      return new Response(JSON.stringify({ ok: false, error: 'tenant_not_found', instanceId }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 404,
      });
    }

    const tenant = tenants[0];
    const settings = (tenant.whatsapp_settings || {}) as Record<string, any>;
    
    // BUSCA CHAVE REAL NO COFRE
    const { data: vault } = await supabase
      .from('tenant_secrets')
      .select('uazapi_token')
      .eq('tenant_id', tenant.id)
      .single();
    if (vault?.uazapi_token) settings.uazapi_token = vault.uazapi_token;

    console.log('[WPP Bot] Tenant:', tenant.company_name, '| bot_enabled:', settings?.bot_enabled);

    if (messageId) {
      markWhatsAppRead(settings, messageId);
    }

    if (
      instanceId && settings &&
      (settings.uazapi_instance !== instanceId || settings.zapi_instance_id !== instanceId)
    ) {
      const updatedSettings = {
        ...settings,
        uazapi_instance: instanceId,
        zapi_instance_id: instanceId,
      };
      supabase.from('tenants').update({ whatsapp_settings: updatedSettings }).eq('id', tenant.id)
        .then();
    }

    const msgType = payload.type || payload.mediaType || payload.messageType || '';
    const msgData = getActualMessageObj(payload) || {};
    const typeStr = String(msgType).toLowerCase();
    const mimeStr = String(
      payload.message?.content?.mimetype ||
        payload.message?.mimetype ||
        payload.mimetype ||
        payload.data?.mimetype ||
        payload.content?.mimetype ||
        '',
    ).toLowerCase();

    const waLastMsgType = String(payload.chat?.wa_lastMessageType || '').toLowerCase();

    const hasImageObj = typeof payload.image === 'object' && payload.image !== null &&
      (!!payload.image.imageUrl || !!payload.image.url || !!payload.image.base64);
    const hasVideoObj = typeof payload.video === 'object' && payload.video !== null &&
      (!!payload.video.videoUrl || !!payload.video.url || !!payload.video.base64);
    const hasAudioObj = typeof payload.audio === 'object' && payload.audio !== null &&
      (!!payload.audio.audioUrl || !!payload.audio.url || !!payload.audio.base64);
    const hasDocObj = typeof payload.document === 'object' && payload.document !== null &&
      (!!payload.document.documentUrl || !!payload.document.url || !!payload.document.base64);

    const hasImage = typeStr.includes('image') ||
      typeStr.includes('photo') ||
      mimeStr.includes('image') ||
      waLastMsgType.includes('image') ||
      !!msgData.imageMessage ||
      hasImageObj ||
      !!payload.message?.image ||
      !!payload.data?.image;

    const hasVideo = typeStr.includes('video') ||
      mimeStr.includes('video') ||
      waLastMsgType.includes('video') ||
      !!msgData.videoMessage ||
      hasVideoObj ||
      !!payload.message?.video;

    const hasAudio = typeStr.includes('audio') ||
      typeStr === 'ptt' ||
      typeStr.includes('voice') ||
      mimeStr.includes('audio') ||
      waLastMsgType.includes('audio') ||
      !!msgData.audioMessage ||
      !!msgData.pttMessage ||
      hasAudioObj ||
      !!payload.message?.audio;

    const hasDoc = typeStr.includes('document') ||
      typeStr.includes('file') ||
      mimeStr.includes('pdf') ||
      mimeStr.includes('document') ||
      waLastMsgType.includes('document') ||
      !!msgData.documentMessage ||
      !!msgData.documentWithCaptionMessage ||
      hasDocObj ||
      !!payload.message?.document;

    const hasSticker = typeStr.includes('sticker') ||
      mimeStr.includes('webp') ||
      waLastMsgType.includes('sticker') ||
      !!msgData.stickerMessage ||
      !!payload.sticker;

    const hasLocation = typeStr.includes('location') || !!msgData.locationMessage ||
      !!payload.location;
    const hasContact = typeStr.includes('contact') || !!msgData.contactMessage ||
      !!msgData.contactsArrayMessage || !!payload.contact;

    const isUazapiMedia = typeof payload.message?.content === 'object' &&
      payload.message?.content !== null;
    const isUazapiImage = isUazapiMedia &&
      (waLastMsgType.includes('image') || mimeStr.includes('image'));
    const isUazapiVideo = isUazapiMedia &&
      (waLastMsgType.includes('video') || mimeStr.includes('video'));
    const isUazapiAudio = isUazapiMedia &&
      (waLastMsgType.includes('audio') || mimeStr.includes('audio'));
    const isUazapiDoc = isUazapiMedia && waLastMsgType.includes('document');

    const isMedia = hasImage || hasVideo || hasAudio || hasDoc || hasSticker || hasLocation ||
      hasContact || isUazapiMedia;

    if (isMedia || !text) {
      const mediaInfo = extractMediaUrl(payload);
      let cdnUrl = mediaInfo?.url || '';
      const extractedThumbnailCap = mediaInfo?.thumbnail || '';
      const caption = text && text !== extractedThumbnailCap && text !== 'Imagem'
        ? text
        : (extractedThumbnailCap && extractedThumbnailCap !== 'Imagem'
          ? extractedThumbnailCap
          : '');

      let fileBuffer: Uint8Array | null = null;
      let fileExt = (hasImage || isUazapiImage)
        ? 'webp'
        : (hasAudio || isUazapiAudio)
        ? 'ogg'
        : 'pdf';
      let audioExceededSize = false;

      // 🚫 BLOQUEAR VIDEOS COMPLETAMENTE: nao baixa e nao salva no R2
      if (hasVideo || isUazapiVideo) {
        console.log('[WPP Bot] 🚫 Video bloqueado (envio de videos desativado)');
        text =
          `[Video Recebido] (INSTRUCAO PARA A IA: Informe ao cliente gentilmente que o envio de videos esta desativado no momento e peca para ele enviar mensagem de voz ou texto.)`;
      } else if (hasImage || isUazapiImage || hasDoc || isUazapiDoc || hasAudio || isUazapiAudio) {
        let b64 = payload.data?.message?.base64 || payload.data?.base64 ||
          payload.message?.base64 || payload.base64 || payload.message?.content?.base64 ||
          payload.data?.message?.content?.base64 || '';

        if (!b64 && messageId && settings.uazapi_url && settings.uazapi_token) {
          const downloaded = await downloadWhatsAppMedia(settings, messageId);
          if (downloaded?.base64) {
            b64 = downloaded.base64;
          } else if (downloaded?.fileURL) {
            cdnUrl = downloaded.fileURL;
          }
        }

        if (b64) {
          if (b64.includes('base64,')) b64 = b64.split('base64,')[1];
          try {
            const binaryString = atob(b64);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
              bytes[i] = binaryString.charCodeAt(i);
            }
            fileBuffer = bytes;
          } catch (e) {
            console.error('[WPP Bot] Erro decode base64', e);
          }
        } else if (cdnUrl && !cdnUrl.startsWith('data:')) {
          try {
            const fetchRes = await fetch(cdnUrl);
            if (fetchRes.ok) fileBuffer = new Uint8Array(await fetchRes.arrayBuffer());
          } catch (e) {
            console.error('[WPP Bot] Erro fetch cdnUrl', e);
          }
        } else if (cdnUrl && cdnUrl.startsWith('data:')) {
          const b64Data = cdnUrl.split('base64,')[1];
          if (b64Data) {
            try {
              const binaryString = atob(b64Data);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
              fileBuffer = bytes;
            } catch (e) {}
          }
        }

        // 🎙️ AUDIOS: Limite maximo de 2 MB
        if (hasAudio || isUazapiAudio) {
          const MAX_AUDIO_BYTES = 2 * 1024 * 1024; // 2 MB strict limit
          if (fileBuffer && fileBuffer.length > MAX_AUDIO_BYTES) {
            console.warn(
              `[WPP Bot] ⚠️ Audio excedeu 2MB (${
                (fileBuffer.length / (1024 * 1024)).toFixed(2)
              }MB). Upload cancelado.`,
            );
            audioExceededSize = true;
            fileBuffer = null;
          } else {
            fileExt = mimeStr.includes('mpeg') || mimeStr.includes('mp3')
              ? 'mp3'
              : (mimeStr.includes('mp4') || mimeStr.includes('m4a') ? 'm4a' : 'ogg');
          }
        }

        if (fileBuffer && !audioExceededSize) {
          if (hasImage || isUazapiImage) {
            try {
              const MAX_BYTES = 200 * 1024;
              let img = await Image.decode(fileBuffer);
              let maxDim = 1200;
              if (img.width > maxDim || img.height > maxDim) {
                img.resize(maxDim, Image.RESIZE_AUTO);
              }
              let quality = 75;
              let encoded = await img.encode(quality);

              let attempts = 0;
              while (encoded.length > MAX_BYTES && attempts < 5) {
                attempts++;
                maxDim = Math.round(maxDim * 0.8);
                quality = Math.max(25, quality - 15);
                img = await Image.decode(fileBuffer);
                img.resize(maxDim, Image.RESIZE_AUTO);
                encoded = await img.encode(quality);
              }

              fileBuffer = encoded;
              fileExt = 'webp';
              console.log(
                `[WPP Bot] Imagem recebida comprimida para R2: ${
                  (fileBuffer.length / 1024).toFixed(1)
                }KB`,
              );
            } catch (e) {
              console.error('[WPP Bot] Erro conversao WebP', e);
            }
          } else if (hasDoc || isUazapiDoc) {
            const docMsg = msgData.documentMessage ||
              msgData.documentWithCaptionMessage?.message?.documentMessage;
            const fileName = docMsg?.fileName || docMsg?.title || payload.document?.fileName ||
              'document.pdf';
            fileExt = fileName.split('.').pop() || 'pdf';
          }

          if (tenant?.id) {
            const accountId = Deno.env.get('R2_ACCOUNT_ID')?.trim();
            const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID')?.trim();
            const secretAccessKey = Deno.env.get('R2_SECRET_ACCESS_KEY')?.trim();

            if (accountId && accessKeyId && secretAccessKey) {
              const S3 = new S3Client({
                region: 'auto',
                endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
                credentials: { accessKeyId, secretAccessKey },
              });

              const d = new Date();
              const dateFolder = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}_${
                String(d.getDate()).padStart(2, '0')
              }`;
              const folderName = (hasImage || isUazapiImage)
                ? 'imagens'
                : (hasAudio || isUazapiAudio)
                ? 'audios'
                : 'documentos';
              const fileName = crypto.randomUUID() + '.' + fileExt;

              const r2Path =
                `whatsapp/${tenant.id}/${phone}/${folderName}/${dateFolder}/${fileName}`;

              let contentType = 'application/octet-stream';
              if (hasImage || isUazapiImage) contentType = 'image/webp';
              else if (hasAudio || isUazapiAudio) contentType = mimeStr || 'audio/ogg';

              try {
                await S3.send(
                  new PutObjectCommand({
                    Bucket: 'nexus-files',
                    Key: r2Path,
                    Body: fileBuffer,
                    ContentType: contentType,
                  }),
                );
                cdnUrl = `https://pub-e1fad40780de437fbbb01f3b203193e9.r2.dev/${r2Path}`;
                console.log('[WPP Bot] Upload R2 Concluido com sucesso:', cdnUrl);
              } catch (e) {
                console.error('[WPP Bot] Erro upload R2', e);
              }
            }
          }
        }
      }

      const mkMedia = (type: string, url: string, cap?: string) =>
        url ? `MEDIA_URL:${type}:${url}${cap ? '|' + cap : ''}` : null;

      if (hasImage || isUazapiImage) {
        text = mkMedia('image', cdnUrl, caption) ||
          (cdnUrl ? `MEDIA_URL:image:${cdnUrl}` : `[Imagem Recebida]`);
      } else if (hasDoc || isUazapiDoc) {
        text = mkMedia('document', cdnUrl, caption) || `[Documento Recebido]`;
      } else if (hasAudio || isUazapiAudio) {
        if (audioExceededSize) {
          text =
            `[Audio Excede 2MB] (INSTRUCAO PARA A IA: O audio enviado pelo cliente ultrapassa o limite maximo de 2MB. Informe-o gentilmente e peca para enviar um audio mais curto ou digitar em texto.)`;
        } else {
          text = mkMedia('audio', cdnUrl) ||
            (cdnUrl ? `MEDIA_URL:audio:${cdnUrl}` : `[Audio Recebido]`);
        }
      } else if (hasVideo || isUazapiVideo) {
        text =
          `[Video Recebido] (INSTRUCAO PARA A IA: Informe ao cliente gentilmente que o envio de videos esta desativado no momento e peca para ele enviar mensagem de voz ou texto.)`;
      } else if (hasSticker) {
        text = mkMedia('sticker', cdnUrl) || `[Figurinha Recebida]`;
      } else if (hasLocation) text = `[Localizacao Recebida]`;
      else if (hasContact) text = `[Contato Recebido]`;
      else {
        console.warn('[WPP Bot] Webhook com payload nao reconhecido ignorado:', typeStr);
        return new Response(JSON.stringify({ ok: true, skipped: 'unrecognized_media_payload' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    text = String(text || '');
    console.log(
      '[WPP Bot] phone:',
      phone,
      '| text:',
      text.substring(0, 80),
      '| type:',
      payload.type,
    );

    if (!phone) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_phone' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!text) {
      return new Response(JSON.stringify({ ok: true, skipped: 'no_text_or_media' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const safeText = text.startsWith('MEDIA_URL:') ? text : text.substring(0, 2000);

    // 🚫 RESPONDER A VIDEOS: Avisa que videos nao sao aceitos e sugere foto, audio, arquivo ou texto
    if (hasVideo || isUazapiVideo) {
      console.log('[WPP Bot] 🚫 Vídeo recebido (envio de vídeos desativado)');
      const videoNotice =
        'Olá! No momento não recebemos vídeos por este canal. Por favor, envie sua mensagem por foto, áudio, documento ou texto que teremos o prazer em lhe atender!';

      let possiblePhones = [phone];
      if (phone.startsWith('55') && phone.length === 12) {
        possiblePhones.push(`55${phone.substring(2, 4)}9${phone.substring(4)}`);
      } else if (phone.startsWith('55') && phone.length === 13 && phone[4] === '9') {
        possiblePhones.push(`55${phone.substring(2, 4)}${phone.substring(5)}`);
      }

      const { data: convs } = await supabase
        .from('whatsapp_conversations')
        .select('*')
        .in('phone_number', possiblePhones)
        .eq('tenant_id', tenant.id)
        .order('last_message_at', { ascending: false })
        .limit(1);

      let conversationId = convs?.[0]?.id;
      if (!conversationId) {
        const { data: newC } = await supabase.from('whatsapp_conversations').insert({
          tenant_id: tenant.id,
          phone_number: phone,
          state: 'GREETING',
          history: [],
        }).select('id').single();
        conversationId = newC?.id;
      }

      if (conversationId) {
        await appendMessagesToConversation(
          supabase,
          conversationId,
          tenant.id,
          [
            {
              role: 'user',
              content: '[Vídeo enviado pelo cliente]',
              timestamp: new Date().toISOString(),
            },
            {
              role: 'bot',
              content: videoNotice,
              timestamp: new Date(Date.now() + 500).toISOString(),
            },
          ],
        );
      }

      await sendWhatsAppMessage(settings, phone, videoNotice);
      return new Response(
        JSON.stringify({ ok: true, reply: videoNotice, skipped: 'video_not_supported' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    let possiblePhones = [phone];
    if (phone.startsWith('55') && phone.length === 12) {
      possiblePhones.push(`55${phone.substring(2, 4)}9${phone.substring(4)}`);
    } else if (phone.startsWith('55') && phone.length === 13 && phone[4] === '9') {
      possiblePhones.push(`55${phone.substring(2, 4)}${phone.substring(5)}`);
    }

    const { data: existingConvs } = await supabase
      .from('whatsapp_conversations')
      .select('*')
      .in('phone_number', possiblePhones)
      .eq('tenant_id', tenant.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(1);

    const existingConv = existingConvs?.[0] || null;

    let conversation: Conversation;

    if (existingConv) {
      conversation = existingConv as Conversation;

      if (conversation.state === 'RESOLVED') {
        conversation.state = 'GREETING';
      }
    } else {
      const { data: newConv, error: createErr } = await supabase
        .from('whatsapp_conversations')
        .insert({
          tenant_id: tenant.id,
          phone_number: phone,
          state: 'GREETING',
          history: [],
        })
        .select()
        .single();

      if (createErr || !newConv) {
        throw new Error('Falha ao criar sessao: ' + createErr?.message);
      }
      conversation = newConv as Conversation;
    }

    const nowTime = Date.now();
    const lastUserMsg = [...conversation.history].reverse().find((m) => m.role === 'user');
    if (lastUserMsg && !isMedia) {
      const lastTime = new Date(lastUserMsg.timestamp).getTime();
      if ((nowTime - lastTime < 15000) && lastUserMsg.content === text) {
        return new Response(JSON.stringify({ ok: true, skipped: 'duplicate_spam' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    if (conversation.state === 'HUMAN_ACTIVE') {
      let humanVisibleText = safeText;
      if (humanVisibleText.includes('INSTRUCAO PARA A IA:')) {
        humanVisibleText = humanVisibleText.split('INSTRUCAO PARA A IA:')[0].trim();
      }

      await appendMessagesToConversation(
        supabase,
        conversation.id,
        tenant.id,
        [{ role: 'user', content: humanVisibleText, timestamp: new Date().toISOString() }],
      );

      return new Response(JSON.stringify({ ok: true, mode: 'human_active' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ⏱️ TIMER-RESET DEBOUNCE ATÔMICO COM ELEIÇÃO DE LÍDER (BIG TECH PATTERN)
    const myMsgId = crypto.randomUUID();
    const incomingTimestamp = new Date().toISOString();

    // 1. Registra a mensagem do usuário no banco com ID único determinístico
    await appendMessagesToConversation(
      supabase,
      conversation.id,
      tenant.id,
      [{ id: myMsgId, role: 'user', content: safeText, timestamp: incomingTimestamp }],
    );

    // 2. Janela de debounce deslizante (3.5s) para aguardar mensagens em sequência
    await new Promise((resolve) => setTimeout(resolve, 3500));

    // 3. ELEIÇÃO DE LÍDER (LEADER ELECTION VERIFICATION)
    // A) Checagem na conversa pelo ID da última mensagem de usuário registrada
    const { data: convCheck } = await supabase
      .from('whatsapp_conversations')
      .select('last_user_message_id')
      .eq('id', conversation.id)
      .maybeSingle();

    if (convCheck?.last_user_message_id && convCheck.last_user_message_id !== myMsgId) {
      console.log(
        `[WPP Bot] ⏳ Nova mensagem foi enviada após a minha (minha: ${myMsgId}, mais recente: ${convCheck.last_user_message_id}). Esta execução cede a vez.`,
      );
      return new Response(
        JSON.stringify({ ok: true, skipped: 'debounced_newer_message_arrived' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // B) Checagem estrita na tabela whatsapp_messages (garante liderança atômica)
    const { data: latestMsg } = await supabase
      .from('whatsapp_messages')
      .select('id')
      .eq('conversation_id', conversation.id)
      .eq('role', 'user')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestMsg && latestMsg.id !== myMsgId) {
      console.log(
        `[WPP Bot] ⏳ Mensagem ${latestMsg.id} é mais recente que a minha (${myMsgId}). Cedendo a vez.`,
      );
      return new Response(
        JSON.stringify({ ok: true, skipped: 'debounced_newer_message_arrived' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        },
      );
    }

    // 4. Busca a última resposta enviada pelo robô ou atendente nesta conversa
    const { data: lastBotMsgs } = await supabase
      .from('whatsapp_messages')
      .select('created_at')
      .eq('conversation_id', conversation.id)
      .in('role', ['bot', 'agent'])
      .order('created_at', { ascending: false })
      .limit(1);

    const lastBotTime = lastBotMsgs?.[0]?.created_at || null;

    // 5. Coleta TODAS as mensagens seguidas que o usuário mandou desde a última resposta do robô
    let pendingQuery = supabase
      .from('whatsapp_messages')
      .select('content, type, created_at')
      .eq('conversation_id', conversation.id)
      .eq('role', 'user')
      .order('created_at', { ascending: true });

    if (lastBotTime) {
      pendingQuery = pendingQuery.gt('created_at', lastBotTime);
    }

    const { data: pendingUserMsgs } = await pendingQuery;

    const unrespondedTexts: string[] = [];
    if (pendingUserMsgs && pendingUserMsgs.length > 0) {
      for (const pMsg of pendingUserMsgs) {
        let txt = pMsg.content || '';
        if (txt.includes('(INSTRUCAO PARA A IA:')) {
          txt = txt.split('(INSTRUCAO PARA A IA:')[0].trim();
        }
        if (txt) unrespondedTexts.push(txt);
      }
    }

    // Deduplica frases exatamente iguais mantendo a ordem do diálogo
    const uniqueTexts: string[] = [];
    for (const t of unrespondedTexts) {
      if (uniqueTexts[uniqueTexts.length - 1] !== t) {
        uniqueTexts.push(t);
      }
    }

    let combinedUserText = uniqueTexts.length > 0 ? uniqueTexts.join('\n') : safeText;

    // 6. Formata a instrução final para a IA no caso de foto ou documento
    let formattedUserMsg = combinedUserText;
    if (hasImage || isUazapiImage) {
      formattedUserMsg =
        `${combinedUserText}\n(INSTRUCAO PARA A IA: O cliente enviou uma foto/imagem. Confirme o recebimento da imagem. Se houver legenda ou dúvida, responda. Pergunte se ele deseja ser direcionado a algum departamento para atendimento ou abrir um chamado. Se a empresa estiver ABERTA no horário comercial e ele solicitar departamento/atendimento humano, acione a ferramenta 'escalate_to_human'. Se estiver FECHADA, informe o horário de funcionamento e crie um chamado/Ticket via 'request_service_order'.)`;
    } else if (hasDoc || isUazapiDoc) {
      formattedUserMsg =
        `${combinedUserText}\n(INSTRUCAO PARA A IA: O cliente enviou um arquivo/documento. Confirme o recebimento do documento. Pergunte se ele deseja atendimento de algum departamento. Se a empresa estiver ABERTA, use 'escalate_to_human' se solicitado. Se estiver FECHADA, informe o horário e crie um Ticket via 'request_service_order'.)`;
    }

    console.log(
      '[WPP Bot] Chamando whatsapp-ai-agent com todas as frases unificadas:\n',
      combinedUserText,
    );
    const agentResponse = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/whatsapp-ai-agent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          tenant_id: tenant.id,
          tenant_name: tenant.trading_name || tenant.company_name,
          tenant_cnpj: tenant.cnpj || tenant.document || '',
          tenant_address: `${tenant.street || ''}, ${tenant.number || ''} ${
            tenant.complement || ''
          } - ${tenant.neighborhood || ''}, ${tenant.city || ''} - ${tenant.state || ''}, CEP: ${
            tenant.cep || ''
          }`.replace(/,\s*,/g, ',').replace(/\s+/g, ' ').trim(),
          settings,
          conversation,
          user_message: formattedUserMsg,
        }),
      },
    );

    if (!agentResponse.ok) {
      const errText = await agentResponse.text();
      console.error('[WPP Bot] AI agent HTTP error:', agentResponse.status, errText);
      throw new Error(`AI agent error: ${agentResponse.status}`);
    }

    const agentResult = await agentResponse.json();
    console.log('[WPP Bot] AI reply:', JSON.stringify(agentResult).substring(0, 200));
    let { reply, new_state, customer_id } = agentResult;

    if (!reply) {
      reply =
        'Desculpe, ocorreu uma instabilidade momentanea. Por favor, tente novamente em instantes.';
    }

    const safeReply = reply.substring(0, 2000);

    await appendMessagesToConversation(
      supabase,
      conversation.id,
      tenant.id,
      [
        { role: 'bot', content: safeReply, timestamp: new Date().toISOString() },
      ],
      new_state || conversation.state,
      customer_id || conversation.customer_id,
    );

    await sendWhatsAppMessage(settings, phone, reply);
    console.log('[WPP Bot] Resposta enviada para', phone);

    return new Response(JSON.stringify({ ok: true, reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[WPP Bot] Erro critico:', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});

async function sendWhatsAppMessage(
  settings: Record<string, any>,
  phone: string,
  text: string,
): Promise<void> {
  const baseDelay = 2000;
  const charDelay = Math.min(text.length * (Math.floor(Math.random() * 20) + 30), 4000);
  const calculatedDelay = baseDelay + charDelay;

  if (settings.uazapi_url && settings.uazapi_token) {
    let baseUrl = settings.uazapi_url.trim();
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const token = settings.uazapi_token.trim();

    const url = `${baseUrl}/send/text`;

    const payload = {
      number: phone,
      text: text,
      readchat: true,
      readmessages: true,
      delay: calculatedDelay,
    };

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Client-Token': token,
        'token': token,
        'apikey': token,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[WPP Bot] Falha UAZAPI:', res.status, errText);
    }
    return;
  }

  const { zapi_instance_id, zapi_instance_token, zapi_client_token } = settings;

  if (!zapi_instance_id || !zapi_instance_token) {
    console.error('[WPP Bot] Credenciais de WhatsApp ausentes no tenant');
    return;
  }

  const url =
    `https://api.z-api.io/instances/${zapi_instance_id}/token/${zapi_instance_token}/send-text`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (zapi_client_token) headers['Client-Token'] = zapi_client_token;

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ phone, message: text }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[WPP Bot] Falha ao enviar Z-API:', res.status, errText);
  }
}
