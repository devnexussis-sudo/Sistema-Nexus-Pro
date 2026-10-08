import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { MessageCircle, User, Bot, Phone, RefreshCw, Send, UserCheck, RotateCcw, X, BellRing, Bell, Volume2, ArrowRight, ArrowLeft, ChevronLeft, ChevronRight, Sticker, FileVideo, Paperclip, Mic, FileText, Download, AlertCircle, Plus, Search, Loader2, CheckCircle2, ExternalLink, Images, Clock, Calendar } from 'lucide-react';
import { Customer } from '../../types';
import { getCurrentTenantId } from '../../lib/tenantContext';

function parseMessageMedia(content: string) {
  if (!content || !content.startsWith('MEDIA_URL:')) return null;
  const withoutPrefix = content.replace('MEDIA_URL:', '');
  const colonIdx = withoutPrefix.indexOf(':');
  if (colonIdx === -1) return null;
  const mediaType = withoutPrefix.substring(0, colonIdx);
  const rest = withoutPrefix.substring(colonIdx + 1);
  const pipeIdx = rest.lastIndexOf('|');
  const mediaUrl = pipeIdx >= 0 ? rest.substring(0, pipeIdx) : rest;
  const rawCaption = pipeIdx >= 0 ? rest.substring(pipeIdx + 1) : '';
  const caption = (rawCaption && rawCaption !== 'Imagem' && !rawCaption.includes('INSTRUCAO:')) ? rawCaption : '';
  return { mediaType, mediaUrl, caption };
}

interface Message {
  role: 'bot' | 'user' | 'agent' | 'system';
  content: string;
  timestamp: string;
  agent_id?: string;
  type?: 'text' | 'sticker';
  agent_name?: string;
}

interface Conversation {
  id: string;
  phone_number: string;
  state: string;
  history?: Message[];
  last_message_at: string;
  last_message_preview?: string | null;
  last_message_role?: string | null;
  customer_id: string | null;
  assigned_agent_id: string | null;
  customers?: { name: string; document?: string } | null;
  users?: { name: string } | null;
}

const STATE_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  GREETING:       { label: 'Iniciando',        color: 'text-gray-400',    dot: 'bg-gray-300' },
  IDENTIFYING:    { label: 'Identificando',    color: 'text-yellow-500',  dot: 'bg-yellow-400' },
  CUSTOMER_FOUND: { label: 'Bot ativo',        color: 'text-emerald-600', dot: 'bg-emerald-400' },
  VIEWING_ORDERS: { label: 'Bot ativo',        color: 'text-emerald-600', dot: 'bg-emerald-400' },
  CREATING_ORDER: { label: 'Abrindo OS',       color: 'text-blue-500',    dot: 'bg-blue-400' },
  WAITING_HUMAN:  { label: '⚠ Aguarda humano', color: 'text-orange-500',  dot: 'bg-orange-400 animate-pulse' },
  HUMAN_ACTIVE:   { label: 'Humano ativo',     color: 'text-indigo-600',  dot: 'bg-indigo-400' },
  RESOLVED:       { label: 'Finalizada',       color: 'text-gray-400',    dot: 'bg-gray-300' },
  CLOSED:         { label: 'Finalizada',       color: 'text-gray-400',    dot: 'bg-gray-300' },
};

const DEFAULT_EMOJIS = [
  '😀','😂','😅','😉','😊','😍','😘','😜','😎','😏',
  '😒','😔','😭','😡','👍','👎','👏','🙌','🤝','🙏',
  '💪','✌️','👋','✋','👌','✅','❌','❗','❓','💯',
  '🔥','✨','🎉','💼','📅','📞','📱','🔧','⚙️','🚀',
  '📝','📎','📌','🔍','💡','⏳','⏰','💰','💳','📦'
];

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, '');
  if (d.length === 13) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,9)}-${d.slice(9)}`;
  if (d.length === 12) return `+${d.slice(0,2)} (${d.slice(2,4)}) ${d.slice(4,8)}-${d.slice(8)}`;
  return phone;
}

function timeAgo(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return `${Math.floor(diff)}s`;
  if (diff < 3600) return `${Math.floor(diff / 60)}min`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Helpers de Data Estilo WhatsApp & Zendesk ─────────────────────────────

function getDateGroupKey(dateInput?: string | Date): string {
  if (!dateInput) return 'unknown';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 'unknown';
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDateDivider(dateInput?: string | Date): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  
  const diffDays = Math.round((today.getTime() - targetDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Hoje';
  if (diffDays === 1) return 'Ontem';

  // Se for nos últimos 6 dias, mostrar dia da semana por extenso (ex: "Segunda-feira, 5 de Outubro")
  if (diffDays > 1 && diffDays < 7) {
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'long' });
    const capitalizedWeekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const dayMonth = d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
    return `${capitalizedWeekday}, ${dayMonth}`;
  }

  // Se for do ano atual
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
  }

  // Anos anteriores
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function formatConversationListDate(dateInput?: string | Date): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());

  const diffDays = Math.round((today.getTime() - targetDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) {
    return 'Ontem';
  }
  if (diffDays > 1 && diffDays < 7) {
    const weekday = d.toLocaleDateString('pt-BR', { weekday: 'short' });
    return weekday.replace('.', '').charAt(0).toUpperCase() + weekday.replace('.', '').slice(1);
  }
  if (d.getFullYear() === now.getFullYear()) {
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatFullDateTime(dateInput?: string | Date): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatLastMessagePreview(rawContent: string): string {
  if (!rawContent) return '';
  const text = String(rawContent).trim();

  if (text.startsWith('MEDIA_URL:')) {
    const withoutPrefix = text.replace('MEDIA_URL:', '');
    const colonIdx = withoutPrefix.indexOf(':');
    const mediaType = colonIdx >= 0 ? withoutPrefix.substring(0, colonIdx) : 'image';
    const rest = colonIdx >= 0 ? withoutPrefix.substring(colonIdx + 1) : withoutPrefix;
    const pipeIdx = rest.indexOf('|');
    const caption = pipeIdx >= 0 ? rest.substring(pipeIdx + 1).trim() : '';

    let label = '📷 Imagem';
    if (mediaType === 'document') label = '📄 Documento';
    else if (mediaType === 'video') label = '📹 Vídeo';
    else if (mediaType === 'audio' || mediaType === 'ptt') label = '🎤 Áudio';
    else if (mediaType === 'sticker') label = '✨ Figurinha';

    if (caption && caption !== 'Imagem' && caption !== 'Documento') {
      return `${label}: ${caption}`;
    }
    return label;
  }

  if (text.includes('[📸 Imagem Recebida]')) return '📷 Imagem';
  if (text.includes('[📄 Documento Recebido]')) return '📄 Documento';
  if (text.includes('[📹 Vídeo Recebido]')) return '📹 Vídeo';
  if (text.includes('[🎤 Áudio') || text.includes('[🎤 PTT')) return '🎤 Áudio';
  if (text.includes('[✨ Figurinha')) return '✨ Figurinha';

  return text;
}

// ─── Notificações ────────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;
let audioUnlocked = false;

function initGlobalAudioUnlock() {
  if (audioUnlocked || typeof window === 'undefined') return;

  const unlock = () => {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!audioCtx && Ctx) {
        audioCtx = new Ctx();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      if (audioCtx) {
        const buf = audioCtx.createBuffer(1, 1, 22050);
        const src = audioCtx.createBufferSource();
        src.buffer = buf;
        src.connect(audioCtx.destination);
        src.start(0);
      }
      audioUnlocked = true;
      ['click', 'touchstart', 'keydown'].forEach(evt => {
        document.removeEventListener(evt, unlock);
      });
    } catch (e) {
      console.warn('[Audio] Erro ao desbloquear:', e);
    }
  };

  ['click', 'touchstart', 'keydown'].forEach(evt => {
    document.addEventListener(evt, unlock, { once: true });
  });
}

initGlobalAudioUnlock();

let titleFlashInterval: ReturnType<typeof setInterval> | null = null;

function flashTitle() {
  if (titleFlashInterval) return;
  let toggle = false;
  const original = document.title;
  titleFlashInterval = setInterval(() => {
    document.title = toggle ? '💬 Nova mensagem!' : original;
    toggle = !toggle;
  }, 900);
  const stop = () => {
    if (titleFlashInterval) clearInterval(titleFlashInterval);
    titleFlashInterval = null;
    document.title = original;
    window.removeEventListener('focus', stop);
  };
  window.addEventListener('focus', stop);
  setTimeout(stop, 30000);
}

function playBloop() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext;
    if (!audioCtx && Ctx) {
      audioCtx = new Ctx();
    }
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const g = audioCtx.createGain();
    g.connect(audioCtx.destination);

    [[880, 0], [1100, 0.1]].forEach(([freq, delay]) => {
      const osc = audioCtx!.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq as number, audioCtx!.currentTime + delay);
      osc.connect(g);
      
      g.gain.setValueAtTime(0, audioCtx!.currentTime + delay);
      g.gain.linearRampToValueAtTime(0.5, audioCtx!.currentTime + delay + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx!.currentTime + delay + 0.3);
      
      osc.start(audioCtx!.currentTime + delay);
      osc.stop(audioCtx!.currentTime + delay + 0.35);
    });
  } catch (e) {
    console.error('[Audio] Erro no playBloop:', e);
  }
}

function sendBrowserNotification(title: string, body: string) {
  if (Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  try {
    const n = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: 'duno-whatsapp',
      requireInteraction: false,
    });
    n.onclick = () => { window.focus(); n.close(); };
    setTimeout(() => n.close(), 6000);
  } catch (_) {}
}

export const WhatsAppInbox: React.FC = () => {
  const location = useLocation();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sendingAction, setSendingAction] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'waiting' | 'mine' | 'active' | 'resolved'>('all');
  const [toast, setToast] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [permBannerDismissed, setPermBannerDismissed] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserName, setCurrentUserName] = useState<string>('Agente');
  const [teamMembers, setTeamMembers] = useState<{ id: string, name: string }[]>([]);
  const [transferModal, setTransferModal] = useState<string | null>(null);
  const [inboxSearch, setInboxSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [readIndex, setReadIndex] = useState<Record<string, number>>({});
  const [showStickers, setShowStickers] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const conversationsRef = useRef<Conversation[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const isOptimisticPending = useRef(false);
  const actionInitiatedConvId = useRef<string | null>(null);
  const outgoingActionConvIds = useRef<Map<string, number>>(new Map());

  // 🛡️ ENTRADA VS SAÍDA: Registra ação de saída iniciada pelo agente para evitar falsos alertas sonoros/visuais
  const markOutgoingAction = (convId: string) => {
    outgoingActionConvIds.current.set(convId, Date.now());
    actionInitiatedConvId.current = convId;
    setTimeout(() => {
      if (actionInitiatedConvId.current === convId) {
        actionInitiatedConvId.current = null;
      }
    }, 6000);
  };

  // ── Modal de Nova Conversa ──
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [newChatTab, setNewChatTab] = useState<'customer' | 'manual'>('customer');
  const [customerQuery, setCustomerQuery] = useState('');
  const [allCustomers, setAllCustomers] = useState<Customer[]>([]);
  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [manualPhone, setManualPhone] = useState('');
  const [initialMessage, setInitialMessage] = useState('');
  const [startingChat, setStartingChat] = useState(false);
  const [newChatError, setNewChatError] = useState<string | null>(null);

  // ── State do Viewer de Imagens (Carrossel / Lightbox) ──
  const [viewerImages, setViewerImages] = useState<{ url: string; caption?: string }[]>([]);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  // Atalhos de teclado para o Carrossel Viewer de Imagens (Seta Esquerda, Seta Direita, ESC)
  useEffect(() => {
    if (viewerIndex === null) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setViewerIndex(null);
      } else if (e.key === 'ArrowLeft') {
        setViewerIndex(prev => (prev !== null && prev > 0 ? prev - 1 : viewerImages.length - 1));
      } else if (e.key === 'ArrowRight') {
        setViewerIndex(prev => (prev !== null && prev < viewerImages.length - 1 ? prev + 1 : 0));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [viewerIndex, viewerImages.length]);

  const fetchCustomersList = async () => {
    setLoadingCustomers(true);
    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId) return;
      const { data } = await supabase
        .from('customers')
        .select('id, name, document, phone, whatsapp, city, state, address')
        .eq('tenant_id', tenantId)
        .eq('active', true)
        .order('name', { ascending: true })
        .limit(1000);
      if (data) {
        setAllCustomers(data as Customer[]);
      }
    } catch (err) {
      console.error('Erro ao buscar clientes para nova conversa:', err);
    } finally {
      setLoadingCustomers(false);
    }
  };

  const filteredSearchCustomers = allCustomers.filter(c => {
    if (!customerQuery.trim()) return true;
    const q = customerQuery.toLowerCase();
    const qClean = q.replace(/\D/g, '');

    const nameMatch = (c.name || '').toLowerCase().includes(q);

    const docRaw = ((c as any).document || (c as any).cpf || (c as any).cnpj || '').replace(/\D/g, '');
    const docMatch = qClean.length > 0 && docRaw.includes(qClean);

    const phoneRaw = (c.phone || '').replace(/\D/g, '');
    const waRaw = (c.whatsapp || '').replace(/\D/g, '');
    const phoneMatch = qClean.length > 0 && (phoneRaw.includes(qClean) || waRaw.includes(qClean));

    return nameMatch || docMatch || phoneMatch;
  });

  const handleStartNewChat = async () => {
    setNewChatError(null);

    let targetRaw = '';
    if (newChatTab === 'customer') {
      if (!selectedCustomer) {
        setNewChatError('Selecione um cliente da lista.');
        return;
      }
      targetRaw = selectedCustomer.whatsapp && selectedCustomer.whatsapp.trim()
        ? selectedCustomer.whatsapp.trim()
        : selectedCustomer.phone || '';
    } else {
      targetRaw = manualPhone;
    }

    if (!targetRaw.trim()) {
      setNewChatError('O cliente selecionado não possui número de WhatsApp ou telefone cadastrado.');
      return;
    }

    let cleaned = targetRaw.replace(/\D/g, '');
    if (cleaned.startsWith('0') && (cleaned.length === 11 || cleaned.length === 12)) {
      cleaned = cleaned.slice(1);
    }
    if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = '55' + cleaned;
    }

    if (cleaned.length < 12) {
      setNewChatError('Número de WhatsApp inválido. Informe DDD + Número (ex: 11999998888).');
      return;
    }

    setStartingChat(true);

    try {
      const tenantId = getCurrentTenantId();
      if (!tenantId) {
        setNewChatError('Tenant não localizado. Atualize a página e tente novamente.');
        setStartingChat(false);
        return;
      }

      let targetConvId: string | null = null;
      let usedEdgeFunction = false;

      // 1. Tentar primeiro via RPC Security Definer (bypassa RLS 100% no Postgres)
      try {
        const { data: rpcData, error: rpcErr } = await supabase.rpc('start_whatsapp_chat' as any, {
          p_phone_number: cleaned,
          p_customer_id: selectedCustomer?.id || null,
          p_initial_message: initialMessage.trim() || null
        });

        if (!rpcErr && rpcData?.ok && rpcData?.conversation_id) {
          targetConvId = rpcData.conversation_id;
          usedEdgeFunction = true;
        }
      } catch (e) {
        console.warn('[NewChat] RPC start_whatsapp_chat indisponível, tentando Edge Function...', e);
      }

      // 2. Tentar pela Edge Function de servidor
      if (!usedEdgeFunction) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          const { data, error } = await supabase.functions.invoke('whatsapp-admin-send', {
            body: {
              action: 'start_conversation',
              phone_number: cleaned,
              customer_id: selectedCustomer?.id || null,
              initial_message: initialMessage.trim(),
              tenant_id: tenantId,
              agent_name: currentUserName
            },
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });

          if (!error && data?.ok && data?.conversation_id) {
            targetConvId = data.conversation_id;
            usedEdgeFunction = true;
          }
        } catch (e) {
          console.warn('[NewChat] Edge function start_conversation ainda não ativa, usando fallback no DB...', e);
        }
      }

      // 2. Fallback resiliente no DB caso a Edge Function remota ainda esteja no formato anterior
      if (!usedEdgeFunction) {
        // Verificar se conversa já existe no DB
        const { data: existingConv } = await supabase
          .from('whatsapp_conversations')
          .select('id, history, customer_id')
          .eq('tenant_id', tenantId)
          .eq('phone_number', cleaned)
          .maybeSingle();

        if (existingConv) {
          let history = existingConv.history || [];
          if (initialMessage.trim()) {
            const msg: Message = {
              role: 'agent',
              content: initialMessage.trim(),
              timestamp: new Date().toISOString(),
              agent_id: currentUserId || undefined,
              agent_name: currentUserName,
            };
            history = [...history, msg];
          }

          const { error: updateErr } = await supabase
            .from('whatsapp_conversations')
            .update({
              state: 'HUMAN_ACTIVE',
              assigned_agent_id: currentUserId,
              customer_id: selectedCustomer?.id || existingConv.customer_id,
              history: history.slice(-100),
              last_message_at: new Date().toISOString(),
            })
            .eq('id', existingConv.id);

          if (updateErr) throw new Error(updateErr.message);
          targetConvId = existingConv.id;
        } else {
          // Criar nova conversa no DB
          const initialHistory: Message[] = initialMessage.trim() ? [{
            role: 'agent',
            content: initialMessage.trim(),
            timestamp: new Date().toISOString(),
            agent_id: currentUserId || undefined,
            agent_name: currentUserName,
          }] : [];

          const { data: created, error: insertError } = await supabase
            .from('whatsapp_conversations')
            .insert([{
              tenant_id: tenantId,
              phone_number: cleaned,
              customer_id: selectedCustomer?.id || null,
              assigned_agent_id: currentUserId,
              state: 'HUMAN_ACTIVE',
              history: initialHistory,
              last_message_at: new Date().toISOString(),
            }])
            .select('id')
            .single();

          if (insertError) throw new Error(insertError.message);
          targetConvId = created?.id;
        }

        // Se houver mensagem inicial, disparar via envio de mensagem padrão da Edge Function
        if (initialMessage.trim() && targetConvId) {
          const { data: { session } } = await supabase.auth.getSession();
          await supabase.functions.invoke('whatsapp-admin-send', {
            body: {
              conversation_id: targetConvId,
              action: 'send',
              message: initialMessage.trim(),
              agent_name: currentUserName
            },
            headers: { Authorization: `Bearer ${session?.access_token}` },
          });
        }
      }

      if (targetConvId) {
        markOutgoingAction(targetConvId);
      }
      setIsNewChatOpen(false);
      triggerNavUpdate();
      await fetchConversations(true);
      if (targetConvId) setSelectedId(targetConvId);
      setToast('✅ Conversa iniciada com sucesso!');
      setTimeout(() => setToast(null), 4000);
    } catch (err: any) {
      setNewChatError(err.message || 'Erro ao iniciar conversa.');
    } finally {
      setStartingChat(false);
    }
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        setCurrentUserId(data.user.id);
        const mdName = data.user.user_metadata?.name || data.user.user_metadata?.full_name;
        if (mdName) setCurrentUserName(mdName);
      }
    });
    supabase.from('users').select('id, name').neq('role', 'TECHNICIAN').order('name').then(({ data }) => setTeamMembers(data || []));
    const notifPerm = (Notification.permission as 'prompt' | 'granted' | 'denied');
    setPermissionState(notifPerm === 'default' ? 'prompt' : notifPerm);

    // Selecionar conversa vinda de outra página (ex: Solicitações)
    const state = location.state as { selectedConvId?: string } | null;
    if (state?.selectedConvId) {
      setSelectedId(state.selectedConvId);
      // Opcional: limpar o state para não re-selecionar ao navegar voltar/avançar
      window.history.replaceState({}, document.title);
    }
  }, [location.state]);

  // Função que pede todas as permissões de uma vez
  const requestPermissions = async () => {
    // 1) Forçar desbloqueio de áudio
    try {
      if (audioCtx && audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }
    } catch(e) {}

    // 2) Pedir permissão de notificações do navegador
    try {
      const result = await Notification.requestPermission();
      setPermissionState(result as 'granted' | 'denied');
      if (result === 'granted') {
        new Notification('✅ Duno — Notificações ativadas!', {
          body: 'Você receberá alertas de novas mensagens do WhatsApp.',
          icon: '/favicon.ico',
        });
        playBloop();
      }
    } catch (e) {
      console.warn('Notificações não suportadas:', e);
    }
    setPermBannerDismissed(true);
  };

  // Manter refs sincronizadas para uso dentro do Realtime callback
  conversationsRef.current = conversations;
  selectedIdRef.current = selectedId;

  // Registrar leitura local para apagar a notificação da sidebar instantaneamente ao clicar/visualizar
  useEffect(() => {
    if (selectedId) {
      try {
        localStorage.setItem('wa_active_conv_id', selectedId);
        const conv = conversations.find(c => c.id === selectedId);
        if (conv && conv.history && conv.history.length > 0) {
          const lastMsg = conv.history[conv.history.length - 1];
          const lastMsgTime = lastMsg.timestamp || new Date().toISOString();
          
          const receiptsStr = localStorage.getItem('wa_read_receipts');
          let receipts = receiptsStr ? JSON.parse(receiptsStr) : {};
          
          receipts[selectedId] = lastMsgTime;
          localStorage.setItem('wa_read_receipts', JSON.stringify(receipts));
          window.dispatchEvent(new Event('wa_read_receipts_changed'));
        }
      } catch (e) {
        console.error('Erro ao salvar recibo de leitura:', e);
      }
    } else {
      try {
        localStorage.removeItem('wa_active_conv_id');
      } catch (e) {}
    }
    return () => {
      try {
        localStorage.removeItem('wa_active_conv_id');
      } catch (e) {}
    };
  }, [selectedId, conversations]);

  // Fechar popover de emojis ao clicar fora
  useEffect(() => {
    if (!showStickers) return;
    const handler = (e: MouseEvent) => {
      if (stickerRef.current && !stickerRef.current.contains(e.target as Node)) {
        setShowStickers(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showStickers]);

  // Quando teamMembers carregam, derivar o nome do agente atual (mais confiável que user_metadata)
  useEffect(() => {
    if (!currentUserId || teamMembers.length === 0) return;
    const me = teamMembers.find(m => m.id === currentUserId);
    if (me?.name) setCurrentUserName(me.name);
  }, [currentUserId, teamMembers]);

  const selected = conversations.find(c => c.id === selectedId) || null;

  // Estado para armazenar mensagens carregadas da tabela dedicada whatsapp_messages
  const [currentDbMessages, setCurrentDbMessages] = useState<Message[]>([]);

  // ── Carregar histórico completo da tabela dedicada whatsapp_messages para a conversa ativa ──
  useEffect(() => {
    if (!selectedId) {
      setCurrentDbMessages([]);
      return;
    }

    let isMounted = true;

    const loadMessagesFromDb = async () => {
      try {
        const { data, error } = await supabase
          .from('whatsapp_messages')
          .select('id, role, content, type, media_url, is_from_me, agent_id, agent_name, created_at')
          .eq('conversation_id', selectedId)
          .order('created_at', { ascending: false })
          .limit(50);

        if (error || !data || data.length === 0) {
          // 🛡️ FALLBACK CIRÚRGICO: Se a tabela whatsapp_messages ainda não tiver os dados ou estiver indisponível,
          // busca pontualmente o history apenas DESTA conversa (1 requisição isolada e leve)
          const { data: convFallback } = await supabase
            .from('whatsapp_conversations')
            .select('history')
            .eq('id', selectedId)
            .single();

          if (convFallback?.history && Array.isArray(convFallback.history) && convFallback.history.length > 0) {
            if (isMounted) setCurrentDbMessages(convFallback.history);
            return;
          }
          if (isMounted) setCurrentDbMessages([]);
          return;
        }

        if (data && data.length > 0) {
          const formatted: Message[] = [...data].reverse().map(m => ({
            role: m.role as any,
            content: m.content,
            timestamp: m.created_at,
            agent_id: m.agent_id || undefined,
            agent_name: m.agent_name || undefined
          }));
          if (isMounted) setCurrentDbMessages(formatted);
        }
      } catch (e) {
        console.warn('[WhatsAppInbox] Carregando mensagens via fallback:', e);
      }
    };

    loadMessagesFromDb();

    // Escutar novos inserts de mensagens na tabela dedicada em tempo real para a conversa selecionada
    const channel = supabase
      .channel(`wpp_messages_active_${selectedId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'whatsapp_messages',
        filter: `conversation_id=eq.${selectedId}`
      }, (payload) => {
        const newM = payload.new as any;
        if (!newM) return;
        const formatted: Message = {
          role: newM.role,
          content: newM.content,
          timestamp: newM.created_at,
          agent_id: newM.agent_id || undefined,
          agent_name: newM.agent_name || undefined
        };
        if (isMounted) {
          setCurrentDbMessages(prev => {
            const exists = prev.some(m => 
              m.role === formatted.role && 
              m.content === formatted.content &&
              Math.abs(new Date(m.timestamp).getTime() - new Date(formatted.timestamp).getTime()) < 5000
            );
            if (exists) return prev;
            return [...prev, formatted];
          });
        }
      })
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [selectedId]);

  // Mensagens ativas combinadas (banco dedicado + histórico otimista local)
  const activeMessages = useMemo(() => {
    if (!selected) return [];
    const dbMsgs = currentDbMessages;
    const jsonMsgs = selected.history || [];

    if (dbMsgs.length > 0) {
      const merged = [...dbMsgs];
      jsonMsgs.forEach(jsonM => {
        const isAlreadyInDb = merged.some(dbM => 
          dbM.role === jsonM.role && 
          dbM.content === jsonM.content &&
          Math.abs(new Date(dbM.timestamp).getTime() - new Date(jsonM.timestamp).getTime()) < 10000
        );
        if (!isAlreadyInDb) {
          merged.push(jsonM);
        }
      });
      return merged.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    }

    return jsonMsgs;
  }, [selected, currentDbMessages]);

  // Auto-scroll quando mensagens ativas mudam
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeMessages.length]);

  const [realtimeOk, setRealtimeOk] = useState(false);

  // Helper para disparar atualização imediata na badge do menu
  const triggerNavUpdate = () => window.dispatchEvent(new Event('whatsapp_state_changed'));

  // ── 🔧 OTIMIZAÇÃO EGRESS: Carregar conversas (ZERO history no payload da listagem) ──
  const fetchConversations = useCallback(async (silent = false, singleId?: string) => {
    if (isOptimisticPending.current) return; // Não sobrescrever estado otimista com dados velhos do DB
    
    const currentTenantId = getCurrentTenantId();
    let query = supabase
      .from('whatsapp_conversations')
      .select('id, tenant_id, phone_number, state, customer_id, assigned_agent_id, last_message_at, last_user_message_id, last_message_preview, last_message_role, created_at, customers(name, document), users(name)');
    
    if (currentTenantId) query = query.eq('tenant_id', currentTenantId);
    if (singleId) {
      query = query.eq('id', singleId);
    } else {
      query = query.limit(100);
    }

    const { data } = await query.order('last_message_at', { ascending: false });
    if (data) {
      setConversations(prev => {
        // Detectar novas mensagens para tocar som/notificações
        const next = (data as Conversation[]).map(updated => {
          const existing = prev.find(c => c.id === updated.id);
          if (!existing) return updated;

          // Preservar histórico existente da memória para a conversa ativa
          const mergedHistory = updated.history || existing.history || [];

          // 🛡️ ENTRADA VS SAÍDA: Identificar se o evento é estritamente de entrada (cliente) ou de saída (agente)
          const isOutgoingAction = actionInitiatedConvId.current === updated.id || 
            ((Date.now() - (outgoingActionConvIds.current.get(updated.id) || 0)) < 8000);

          // Verifica se a última mensagem é comprovadamente do cliente
          const isLastMsgFromUser = updated.last_message_role === 'user' ||
            (!!updated.history && updated.history.length > 0 && updated.history[updated.history.length - 1]?.role === 'user');

          // Comparar timestamps para garantir que é uma mensagem que acabou de chegar do cliente
          const hasNewUserMsg = !isOutgoingAction && isLastMsgFromUser && (
            new Date(updated.last_message_at).getTime() > new Date(existing.last_message_at || 0).getTime()
          );

          const justAskedForHuman = !isOutgoingAction && updated.state === 'WAITING_HUMAN' && existing.state !== 'WAITING_HUMAN';
          const userMsgWhileHuman = hasNewUserMsg && (updated.state === 'WAITING_HUMAN' || updated.state === 'HUMAN_ACTIVE');
          
          const justAssignedToMe = !isOutgoingAction && updated.assigned_agent_id === currentUserId && existing.assigned_agent_id !== currentUserId && currentUserId !== null && updated.state === 'HUMAN_ACTIVE';

          let shouldNotify = false;
          if (justAssignedToMe) {
             shouldNotify = true;
          } else if (justAskedForHuman) {
             shouldNotify = true;
          } else if (userMsgWhileHuman) {
             if (updated.assigned_agent_id) {
                 shouldNotify = (updated.assigned_agent_id === currentUserId);
             } else {
                 shouldNotify = true;
             }
          }

          if (shouldNotify) {
            playBloop();
            flashTitle();
            if (justAssignedToMe) {
              sendBrowserNotification('💬 Chat Transferido!', `Um atendimento foi transferido para você.`);
              setToast('⚠️ Uma conversa foi transferida para você!');
            } else {
              const previewMsg = updated.last_message_preview || 'Cliente enviou uma mensagem.';
              const preview = formatLastMessagePreview(previewMsg).substring(0, 60);
              sendBrowserNotification('💬 Duno WhatsApp', `${updated.phone_number}: ${preview}`);
              setToast(justAskedForHuman ? '⚠️ Cliente pediu atendimento humano!' : '💬 Nova mensagem do cliente!');
              setTimeout(() => setToast(null), 5000);
            }
          }

          return { ...updated, history: mergedHistory };
        });

        // 🔧 OTIMIZAÇÃO EGRESS: Para fetch de conversa única (via Realtime), mergear no array existente
        if (singleId && next.length > 0) {
          const updatedConv = next[0];
          const existsInPrev = prev.some(c => c.id === updatedConv.id);
          const merged = existsInPrev
            ? prev.map(c => c.id === updatedConv.id ? updatedConv : c)
            : [updatedConv, ...prev];
          return merged.sort((a, b) => new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime());
        }

        return next;
      });
    }
    if (!silent) setLoading(false);
  }, [currentUserId]);

  // ── 🔧 OTIMIZAÇÃO EGRESS: Realtime granular + polling leve ──────────────
  useEffect(() => {
    fetchConversations();

    // 🛡️ EGRESS GUARD: o polling só roda quando o Realtime NÃO está saudável.
    let isRealtimeHealthy = false;
    let hadDisconnect = false;
    const pollInterval = setInterval(() => {
      if (!isRealtimeHealthy && typeof document !== 'undefined' && !document.hidden) {
        fetchConversations(true);
      }
    }, 120_000);

    // REALTIME: busca APENAS a conversa alterada filtrada por tenant_id
    const currentTenantId = getCurrentTenantId();
    const channel = supabase
      .channel(currentTenantId ? `wpp-inbox-${currentTenantId}` : 'whatsapp-inbox-v5')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations',
        filter: currentTenantId ? `tenant_id=eq.${currentTenantId}` : undefined,
      }, (payload: any) => {
        const changedId = payload.new?.id || payload.old?.id;
        if (payload.eventType === 'DELETE' && changedId) {
          setConversations(prev => prev.filter(c => c.id !== changedId));
          triggerNavUpdate();
          return;
        }
        // 🔧 Busca apenas a conversa alterada (1 req leve) em vez de todas (era N reqs pesadas)
        if (changedId) {
          fetchConversations(true, changedId);
        } else {
          fetchConversations(true);
        }
      })
      .subscribe((status) => {
        console.log('[Realtime] Status:', status);
        const ok = status === 'SUBSCRIBED';
        if (ok && hadDisconnect) {
          // Reconectou após queda: 1 sincronização de recuperação (eventos perdidos)
          hadDisconnect = false;
          fetchConversations(true);
        }
        if (!ok && isRealtimeHealthy) hadDisconnect = true;
        isRealtimeHealthy = ok;
        setRealtimeOk(ok);
      });

    return () => {
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [fetchConversations]);

  // ── Ações ─────────────────────────────────────────────────────────────────

  const invoke = async (action: string, extra: object = {}) => {
    const { data: { session } } = await supabase.auth.getSession();
    const { data, error } = await supabase.functions.invoke('whatsapp-admin-send', {
      body: { conversation_id: selectedId, action, ...extra },
      headers: { Authorization: `Bearer ${session?.access_token}` },
    });
    if (error) {
      let msg = error.message;
      try { msg = (await (error as any).context?.json())?.error || error.message; } catch {}
      alert('Erro: ' + msg);
      return false;
    }
    if (data && !data.ok) {
      alert('Erro: ' + data.error);
      return false;
    }
    // Não recarregamos imediatamente aqui porque o realtime já faz o trabalho 
    // ou deixamos as promises que chamam `invoke` cuidarem disso, evitando dupla re-renderização.
    triggerNavUpdate();
    return true;
  };

  const handleTakeover = async () => {
    if (!selected) return;
    markOutgoingAction(selected.id);
    setSendingAction('takeover');
    isOptimisticPending.current = true;
    actionInitiatedConvId.current = selected.id;
    
    const optimisticMsg: Message = {
      role: 'agent',
      content: `✅ *${currentUserName}* da equipe assumiu o atendimento. Como posso ajudar?`,
      timestamp: new Date().toISOString(),
      agent_id: currentUserId || undefined,
      agent_name: currentUserName
    };

    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, state: 'HUMAN_ACTIVE', assigned_agent_id: currentUserId, history: [...(c.history||[]), optimisticMsg] } : c));
    await invoke('takeover');
    setSendingAction(null);
    setTimeout(() => { 
      isOptimisticPending.current = false; 
      fetchConversations(true); 
      setTimeout(() => actionInitiatedConvId.current = null, 2000);
    }, 500);
  };

  const handleReturnToBot = async () => {
    if (!selected) return;
    markOutgoingAction(selected.id);
    setSendingAction('return_to_bot');
    isOptimisticPending.current = true;
    const optimisticMsg: Message = {
      role: 'bot',
      content: `🤖 O atendimento foi retornado ao assistente virtual. Como posso ajudar?`,
      timestamp: new Date().toISOString()
    };
    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, state: 'CUSTOMER_FOUND', assigned_agent_id: null, history: [...(c.history||[]), optimisticMsg] } : c));
    await invoke('return_to_bot');
    setSendingAction(null);
    setTimeout(() => { isOptimisticPending.current = false; fetchConversations(true); }, 500);
  };

  const handleCloseConversation = async () => {
    if (!selected) return;
    markOutgoingAction(selected.id);
    setSendingAction('close');
    isOptimisticPending.current = true;
    const optimisticMsg: Message = {
      role: 'agent',
      content: `Atendimento encerrado por um de nossos agentes. Agradecemos o contato! 👋`,
      timestamp: new Date().toISOString(),
      agent_id: currentUserId || undefined,
      agent_name: currentUserName
    };
    
    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, state: 'RESOLVED', assigned_agent_id: null, history: [...(c.history||[]), optimisticMsg] } : c));
    const oldId = selected.id;
    setSelectedId(null);
    await invoke('close_conversation', { agent_name: currentUserName });
    setSendingAction(null);
    setTimeout(() => { isOptimisticPending.current = false; fetchConversations(true); }, 500);
  };
  
  const handleResetBot = async () => {
    if (!selected) return;
    markOutgoingAction(selected.id);
    setShowResetConfirm(false);
    setSendingAction('reset');
    isOptimisticPending.current = true;
    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, state: 'GREETING', assigned_agent_id: null } : c));
    setSelectedId(null);
    await invoke('reset_bot');
    setSendingAction(null);
    setTimeout(() => { isOptimisticPending.current = false; fetchConversations(true); }, 500);
  };

  const handleTransfer = async (targetUserId: string) => {
    if (!selected) return;
    markOutgoingAction(selected.id);
    setSendingAction('transfer');
    isOptimisticPending.current = true;
    actionInitiatedConvId.current = selected.id;
    setTransferModal(null);
    const targetName = teamMembers.find(m => m.id === targetUserId)?.name || "outro agente";
    
    const optimisticMsg: Message = {
      role: 'agent',
      content: `🔃 O atendimento foi transferido para *${targetName}*. Aguarde um momento.`,
      timestamp: new Date().toISOString(),
      agent_id: currentUserId || undefined,
      agent_name: currentUserName
    };

    setConversations(prev => prev.map(c => c.id === selected.id ? { ...c, assigned_agent_id: targetUserId, history: [...(c.history||[]), optimisticMsg] } : c));
    setSelectedId(null);
    await invoke('transfer', { target_user_id: targetUserId, agent_name: currentUserName });
    setSendingAction(null);
    setTimeout(() => { 
      isOptimisticPending.current = false; 
      fetchConversations(true); 
      setTimeout(() => actionInitiatedConvId.current = null, 2000);
    }, 500);
  };


  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selected || !currentUserId) return;
    markOutgoingAction(selected.id);
    
    if (file.size > 50 * 1024 * 1024) {
      alert("O arquivo não pode ter mais de 50 MB.");
      return;
    }

    setUploadingMedia(true);
    let finalBlob: Blob = file;
    let finalExt = file.name.split('.').pop() || 'pdf';
    let isImage = file.type.startsWith('image/');

    try {
      if (isImage) {
        finalBlob = await new Promise<Blob>((resolve, reject) => {
          const img = new Image();
          const objUrl = URL.createObjectURL(file);
          img.onload = async () => {
            URL.revokeObjectURL(objUrl);
            const MAX_BYTES = 200 * 1024; // 200 KB limit
            let maxDim = 1200;
            let quality = 0.75;
            let bestBlob: Blob | null = null;

            for (let attempt = 0; attempt < 6; attempt++) {
              let width = img.width;
              let height = img.height;

              if (width > maxDim || height > maxDim) {
                const ratio = Math.min(maxDim / width, maxDim / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
              }

              const canvas = document.createElement('canvas');
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              if (!ctx) return reject('No canvas context');

              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = 'high';
              ctx.fillStyle = '#FFFFFF';
              ctx.fillRect(0, 0, width, height);
              ctx.drawImage(img, 0, 0, width, height);

              const blob = await new Promise<Blob | null>((res) => {
                canvas.toBlob(res, 'image/webp', quality);
              });

              if (blob) {
                bestBlob = blob;
                if (blob.size <= MAX_BYTES) {
                  console.log(`[Admin Upload] Imagem comprimida com sucesso: ${(blob.size / 1024).toFixed(1)}KB`);
                  return resolve(blob);
                }
              }

              maxDim = Math.round(maxDim * 0.8);
              quality = Math.max(0.25, quality - 0.15);
            }

            if (bestBlob) resolve(bestBlob);
            else reject('Canvas toBlob failed');
          };
          img.onerror = () => {
            URL.revokeObjectURL(objUrl);
            reject('Image load failed');
          };
          img.src = objUrl;
        });
        finalExt = 'webp';
      }

      const pathStr = `whatsapp/${selected.tenant_id}/${selected.phone_number}/${isImage ? 'imagens' : 'documentos'}/${new Date().toISOString().split('T')[0].replace(/-/g, '_')}/${crypto.randomUUID()}.${finalExt}`;

      const { data: signData, error: signError } = await supabase.functions.invoke('r2-operations', {
        body: {
          action: 'upload',
          path: pathStr,
          bucketType: 'nexus-files',
          contentType: isImage ? 'image/webp' : file.type
        }
      });

      if (signError || !signData?.signedUrl) throw new Error(signError?.message || 'Falha ao gerar URL de upload');

      const uploadRes = await fetch(signData.signedUrl, {
        method: 'PUT',
        body: finalBlob,
        headers: { 'Content-Type': isImage ? 'image/webp' : file.type }
      });

      if (!uploadRes.ok) throw new Error('Falha no upload para R2');

      const { data: sendData, error: sendErr } = await supabase.functions.invoke('whatsapp-admin-send', {
        body: {
          conversation_id: selected.id,
          action: 'send_media',
          message: signData.publicUrl,
          media_type: isImage ? 'image' : 'document',
          original_name: file.name,
          agent_name: currentUserName
        }
      });

      if (sendErr) throw sendErr;

      const safeText = `MEDIA_URL:${isImage ? 'image' : 'document'}:${signData.publicUrl}`;
      const nowIso = new Date().toISOString();
      const optimisticMsg = {
        role: "agent",
        content: safeText,
        type: isImage ? 'image' : 'document',
        media_url: signData.publicUrl,
        is_from_me: true,
        agent_id: currentUserId,
        agent_name: currentUserName,
        timestamp: nowIso
      };

      try {
        const receiptsStr = localStorage.getItem('wa_read_receipts');
        let receipts = receiptsStr ? JSON.parse(receiptsStr) : {};
        receipts[selected.id] = nowIso;
        localStorage.setItem('wa_read_receipts', JSON.stringify(receipts));
        window.dispatchEvent(new Event('wa_read_receipts_changed'));
      } catch (e) {}
      
      setConversations(prev => prev.map(c => {
        if (c.id === selected.id) {
          const updatedHistory = [...(Array.isArray(c.history) ? c.history : []), optimisticMsg];
          if (updatedHistory.length > 30) updatedHistory.slice(-30);
          return { ...c, history: updatedHistory, last_message_at: nowIso };
        }
        return c;
      }));

    } catch (e: any) {
      console.error(e);
      alert('Erro ao enviar arquivo: ' + e.message);
    } finally {
      setUploadingMedia(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSend = () => {
    if (!message.trim() || !selected || sendingAction !== null) return;
    markOutgoingAction(selected.id);
    const txt = message;
    setMessage('');

    const nowIso = new Date().toISOString();

    // 🛡️ ENTRADA VS SAÍDA: Grava o recibo de leitura imediatamente para a mensagem enviada pelo agente
    try {
      const receiptsStr = localStorage.getItem('wa_read_receipts');
      let receipts = receiptsStr ? JSON.parse(receiptsStr) : {};
      receipts[selected.id] = nowIso;
      localStorage.setItem('wa_read_receipts', JSON.stringify(receipts));
      window.dispatchEvent(new Event('wa_read_receipts_changed'));
    } catch (e) {}

    // ✨ Update otimista: mensagem aparece instantaneamente na tela
    const optimisticMsg: Message = {
      role: 'agent',
      content: txt,
      timestamp: nowIso,
      agent_id: currentUserId || undefined,
      agent_name: currentUserName,
    };
    setConversations(prev => prev.map(c => {
      if (c.id !== selected.id) return c;
      return { ...c, history: [...(c.history || []), optimisticMsg], last_message_at: nowIso };
    }));

    // Libera o botão imediatamente — rede roda em background
    isOptimisticPending.current = true;
    invoke('send', { message: txt, agent_name: currentUserName }).then(() => {
      setTimeout(() => { isOptimisticPending.current = false; fetchConversations(true); }, 500);
    }).catch(() => {
      // Se falhar, desfazer o optimistic update e restaurar texto
      setConversations(prev => prev.map(c => {
        if (c.id !== selected.id) return c;
        return { ...c, history: (c.history || []).filter(m => m !== optimisticMsg) };
      }));
      setMessage(txt);
      setToast('❌ Falha ao enviar mensagem. Tente novamente.');
      setTimeout(() => setToast(null), 3000);
      isOptimisticPending.current = false;
    });
  };

  const handleSendSticker = async (url: string) => {
    if (!selected) return;
    markOutgoingAction(selected.id);
    setSendingAction('sticker');
    setShowStickers(false);

    const nowIso = new Date().toISOString();

    try {
      const receiptsStr = localStorage.getItem('wa_read_receipts');
      let receipts = receiptsStr ? JSON.parse(receiptsStr) : {};
      receipts[selected.id] = nowIso;
      localStorage.setItem('wa_read_receipts', JSON.stringify(receipts));
      window.dispatchEvent(new Event('wa_read_receipts_changed'));
    } catch (e) {}

    const optimisticMsg: Message = {
      role: 'agent',
      content: '[✨ Figurinha Enviada]',
      timestamp: nowIso,
    };
    
    setConversations(prev => prev.map(c => {
      if (c.id !== selected.id) return c;
      return { ...c, history: [...(c.history || []), optimisticMsg], last_message_at: nowIso };
    }));

    try {
      isOptimisticPending.current = true;
      await invoke('send_sticker', { message: url });
      setTimeout(() => { isOptimisticPending.current = false; fetchConversations(true); }, 500);
    } catch {
      setConversations(prev => prev.map(c => {
        if (c.id !== selected.id) return c;
        return { ...c, history: (c.history || []).filter(m => m !== optimisticMsg) };
      }));
      isOptimisticPending.current = false;
    } finally {
      setSendingAction(null);
    }
  };

  // ── Filtros ───────────────────────────────────────────────────────────────
  const filtered = conversations.filter(c => {
    // Na aba 'Todos' (all), EXIBIR TODAS AS CONVERSAS SEM NENHUMA EXCLUSÃO
    if (filter === 'waiting' && c.state !== 'WAITING_HUMAN') return false;
    if (filter === 'mine' && (c.state !== 'HUMAN_ACTIVE' || c.assigned_agent_id !== currentUserId)) return false;
    if (filter === 'active' && c.state !== 'HUMAN_ACTIVE') return false;
    if (filter === 'resolved' && c.state !== 'RESOLVED') return false;

    if (inboxSearch.trim()) {
      const q = inboxSearch.toLowerCase().trim();
      const matchPhone = c.phone_number?.includes(q) || false;
      const matchName = c.customers?.name?.toLowerCase().includes(q) || c.users?.name?.toLowerCase().includes(q) || false;
      const matchPreview = c.last_message_preview?.toLowerCase().includes(q) || false;
      const matchHistory = c.history?.some(h => h.content?.toLowerCase().includes(q)) || false;
      if (!matchPhone && !matchName && !matchPreview && !matchHistory) return false;
    }

    return true;
  });

  const waitingCount = conversations.filter(c => c.state === 'WAITING_HUMAN').length;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full bg-gray-50/30 rounded-2xl overflow-hidden border border-gray-100 shadow-xl relative">

      {/* Toast de notificação */}
      {toast && (
        <div
          className="absolute top-4 left-1/2 -translate-x-1/2 z-[99999999] flex items-center gap-3 px-5 py-3 bg-indigo-600 text-white rounded-full shadow-2xl"
          style={{ animation: 'slideDown 0.3s ease' }}
        >
          <BellRing size={18} className="animate-bounce" />
          <span className="text-sm font-bold">{toast}</span>
          <button onClick={() => setToast(null)} className="ml-1 bg-white/20 rounded-full p-1 hover:bg-white/30">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Banner de permissão — aparece até o usuário conceder acesso */}
      {!permBannerDismissed && permissionState !== 'granted' && (
        <div className="absolute bottom-0 left-0 right-0 z-40 p-4">
          <div className={`flex items-center gap-4 px-5 py-4 rounded-2xl shadow-2xl border ${
            permissionState === 'denied'
              ? 'bg-red-50 border-red-200'
              : 'bg-gradient-to-r from-indigo-600 to-violet-600 border-transparent'
          }`}>
            <div className={`p-2 rounded-xl flex-shrink-0 ${
              permissionState === 'denied' ? 'bg-red-100' : 'bg-white/20'
            }`}>
              {permissionState === 'denied'
                ? <Bell size={22} className="text-red-500" />
                : <Volume2 size={22} className="text-white" />
              }
            </div>
            <div className="flex-1 min-w-0">
              {permissionState === 'denied' ? (
                <>
                  <p className="text-sm font-bold text-red-700">Notificações bloqueadas</p>
                  <p className="text-xs text-red-500 mt-0.5">
                    Clique no cadeado 🔒 na barra do navegador → Notificações → Permitir.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-bold text-white">Ativar alertas de mensagens</p>
                  <p className="text-xs text-white/80 mt-0.5">
                    Receba som e notificação visual sempre que um cliente enviar mensagem.
                  </p>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {permissionState !== 'denied' && (
                <button
                  onClick={requestPermissions}
                  className="px-4 py-2 bg-white text-indigo-700 text-xs font-bold rounded-xl hover:bg-indigo-50 transition-all shadow-sm"
                >
                  🔔 Ativar Notificações
                </button>
              )}
              <button
                onClick={() => setPermBannerDismissed(true)}
                className={`p-2 rounded-xl transition-all ${
                  permissionState === 'denied'
                    ? 'text-red-400 hover:bg-red-100'
                    : 'text-white/60 hover:bg-white/20'
                }`}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Coluna esquerda: lista de conversas ── */}
      <div className={`${selected ? 'hidden md:flex' : 'flex'} w-full md:w-[340px] lg:w-[360px] xl:w-[375px] flex-shrink-0 bg-white border-r border-slate-200/90 flex-col overflow-hidden transition-all duration-200`}>
        <div className="p-3 border-b border-gray-50">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div className="flex items-center gap-2">
              <MessageCircle size={18} className="text-emerald-500" />
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-tight font-poppins">WhatsApp Inbox</h2>
            </div>
            <div className="flex items-center gap-2">
              <div 
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-bold uppercase tracking-wider font-poppins ${
                  realtimeOk 
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 shadow-xs' 
                    : 'bg-amber-50 text-amber-700 border-amber-200/80 shadow-xs'
                }`} 
                title={realtimeOk ? 'Tempo real ativo via WebSocket' : 'Modo Polling ativo (sincronização a cada 3s)'}
              >
                <div className={`w-2 h-2 rounded-full ${realtimeOk ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500 animate-pulse'}`} />
                <span className="hidden sm:inline">{realtimeOk ? 'Ao Vivo' : 'Polling (3s)'}</span>
              </div>
              <button
                onClick={() => window.open('/#/admin/whatsapp?standalone=true', '_blank', 'width=1200,height=800,left=100,top=100')}
                className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors border border-transparent hover:border-indigo-100 shadow-sm"
                title="Abrir em Nova Aba"
              >
                <ExternalLink size={14} />
              </button>
            </div>
          </div>

          {/* Botão Nova Conversa */}
          <button
            onClick={() => {
              setIsNewChatOpen(true);
              setNewChatTab('customer');
              setCustomerQuery('');
              setSelectedCustomer(null);
              setManualPhone('');
              setInitialMessage('');
              setNewChatError(null);
              fetchCustomersList();
            }}
            className="w-full mb-3 flex items-center justify-center gap-2 py-2 px-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-600/20 active:scale-95 cursor-pointer font-poppins"
          >
            <Plus size={16} /> Nova Conversa
          </button>

          {/* Abas de Filtro — 5 Colunas Perfeitamente Legíveis Sem Barras de Rolagem */}
          {(() => {
            const counts = {
              all: conversations.length,
              waiting: conversations.filter(c => c.state === 'WAITING_HUMAN').length,
              mine: conversations.filter(c => c.state === 'HUMAN_ACTIVE' && c.assigned_agent_id === currentUserId).length,
              active: conversations.filter(c => c.state === 'HUMAN_ACTIVE' && c.assigned_agent_id !== currentUserId).length,
              resolved: conversations.filter(c => c.state === 'RESOLVED').length
            };

            const getTabStyle = (f: 'all' | 'waiting' | 'mine' | 'active' | 'resolved', isActive: boolean, hasPendingWaiting: boolean) => {
              if (isActive) {
                switch (f) {
                  case 'all':
                    return { btn: 'bg-slate-800 text-white shadow-xs ring-1 ring-slate-800 font-extrabold', badge: 'bg-white/20 text-white' };
                  case 'waiting':
                    return { btn: 'bg-amber-500 text-slate-950 shadow-xs ring-1 ring-amber-400 font-extrabold', badge: 'bg-slate-950 text-amber-300' };
                  case 'mine':
                    return { btn: 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-600 font-extrabold', badge: 'bg-white/20 text-white' };
                  case 'active':
                    return { btn: 'bg-sky-600 text-white shadow-xs ring-1 ring-sky-600 font-extrabold', badge: 'bg-white/20 text-white' };
                  case 'resolved':
                    return { btn: 'bg-purple-600 text-white shadow-xs ring-1 ring-purple-600 font-extrabold', badge: 'bg-white/20 text-white' };
                }
              }

              // Inativo: Cores suaves pastel (agradáveis e leves)
              switch (f) {
                case 'all':
                  return { btn: 'bg-white text-slate-700 border border-slate-200/80 hover:bg-slate-100/70', badge: 'bg-slate-100 text-slate-700' };
                case 'waiting':
                  return {
                    btn: hasPendingWaiting 
                      ? 'bg-amber-100/90 text-amber-900 border border-amber-300 animate-pulse font-bold' 
                      : 'bg-amber-50/90 text-amber-800 border border-amber-200/70 hover:bg-amber-100/80',
                    badge: 'bg-amber-200/90 text-amber-900'
                  };
                case 'mine':
                  return { btn: 'bg-emerald-50/90 text-emerald-800 border border-emerald-200/70 hover:bg-emerald-100/80', badge: 'bg-emerald-200/90 text-emerald-950' };
                case 'active':
                  return { btn: 'bg-sky-50/90 text-sky-800 border border-sky-200/70 hover:bg-sky-100/80', badge: 'bg-sky-200/90 text-sky-950' };
                case 'resolved':
                  return { btn: 'bg-purple-50/90 text-purple-800 border border-purple-200/70 hover:bg-purple-100/80', badge: 'bg-purple-200/90 text-purple-950' };
              }
            };

            const getTabTitle = (f: 'all' | 'waiting' | 'mine' | 'active' | 'resolved') => {
              switch (f) {
                case 'all': return 'Todas as conversas';
                case 'waiting': return 'Aguardando atendimento humano';
                case 'mine': return 'Atendimentos sob minha responsabilidade';
                case 'active': return 'Outras conversas em atendimento';
                case 'resolved': return 'Conversas finalizadas';
              }
            };

            return (
              <div className="w-full p-1 bg-slate-100/90 rounded-xl border border-slate-200/80 font-poppins">
                <div className="grid grid-cols-5 gap-1 w-full [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                  {(['all', 'waiting', 'mine', 'active', 'resolved'] as const).map(f => {
                    const isActiveTab = filter === f;
                    const count = counts[f];
                    const isWaitingTab = f === 'waiting';
                    const hasPendingWaiting = isWaitingTab && count > 0;
                    const style = getTabStyle(f, isActiveTab, hasPendingWaiting);

                    const label = f === 'all' ? 'Todos' : f === 'waiting' ? 'Fila' : f === 'mine' ? 'Meus' : f === 'active' ? 'Outros' : 'Fim';

                    return (
                      <button
                        key={f}
                        onClick={() => setFilter(f)}
                        className={`relative py-1.5 px-0.5 rounded-lg text-[9.5px] font-bold uppercase tracking-tight transition-all flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap overflow-hidden ${style.btn}`}
                        title={getTabTitle(f)}
                      >
                        {hasPendingWaiting && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping absolute -top-1 -right-1" />
                        )}
                        <span className="leading-none">{label}</span>

                        {count > 0 && (
                          <span className={`px-1 py-0.5 rounded-full text-[8.5px] font-black leading-none ${style.badge}`}>
                            {count}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Campo de pesquisa de conversas */}
          <div className="mt-3 relative">
            <input
              type="text"
              placeholder="Pesquisar conversa..."
              value={inboxSearch}
              onChange={(e) => setInboxSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 bg-gray-50 border border-gray-100 rounded-lg text-xs focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all outline-none placeholder:text-gray-400 text-gray-700"
            />
            <svg className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            {inboxSearch && (
              <button
                onClick={() => setInboxSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar">
          {loading && (
            <div className="flex items-center justify-center p-8">
              <RefreshCw size={20} className="animate-spin text-gray-300" />
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center p-8 text-gray-300">
              <MessageCircle size={40} />
              <p className="text-xs mt-2">Nenhuma conversa</p>
            </div>
          )}
          {(() => {
            let receipts: Record<string, string> = {};
            try {
              const receiptsStr = localStorage.getItem('wa_read_receipts');
              if (receiptsStr) receipts = JSON.parse(receiptsStr);
            } catch (e) {}

            return filtered.map(conv => {
              const stateInfo = STATE_LABELS[conv.state] || STATE_LABELS['GREETING'];
              const history = conv.history || [];
              const lastMsg = history[history.length - 1];
              const customerName = conv.customers?.name;
              const isSelected = selectedId === conv.id;
              const previewText = conv.last_message_preview || lastMsg?.content || '';
              const lastRole = conv.last_message_role || lastMsg?.role || 'user';

              let isUnread = false;
              if (!isSelected && lastRole === 'user') {
                const readAtStr = receipts[conv.id];
                if (!readAtStr) {
                  isUnread = true;
                } else {
                  const msgTime = new Date(conv.last_message_at || lastMsg?.timestamp || 0).getTime();
                  const readTime = new Date(readAtStr).getTime();
                  if (msgTime > readTime + 1000) {
                    isUnread = true;
                  }
                }
              }

              return (
                <button
                  key={conv.id}
                  onClick={() => {
                    setSelectedId(conv.id);
                    try {
                      const curReceiptsStr = localStorage.getItem('wa_read_receipts');
                      let curReceipts = curReceiptsStr ? JSON.parse(curReceiptsStr) : {};
                      const lastTime = conv.last_message_at || lastMsg?.timestamp || new Date().toISOString();
                      curReceipts[conv.id] = new Date(new Date(lastTime).getTime() + 1000).toISOString();
                      localStorage.setItem('wa_read_receipts', JSON.stringify(curReceipts));
                      window.dispatchEvent(new Event('wa_read_receipts_changed'));
                      window.dispatchEvent(new Event('whatsapp_state_changed'));
                    } catch (e) {}
                  }}
                  className={`w-full min-w-[280px] text-left p-3 border-b border-slate-100 transition-all cursor-pointer ${
                    isSelected 
                      ? 'bg-slate-100/90 border-l-4 border-l-[#1c2d4f] shadow-xs' 
                      : isUnread 
                      ? 'bg-emerald-50/40 hover:bg-emerald-50/70' 
                      : 'hover:bg-slate-50/80'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    {/* Zendesk Customer Initials Avatar with status badge */}
                    <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200/90 flex items-center justify-center text-slate-700 font-bold text-xs flex-shrink-0 relative shadow-2xs mt-0.5">
                      {customerName ? customerName.charAt(0).toUpperCase() : <User size={13} className="text-slate-500" />}
                      <span className={`w-2.5 h-2.5 rounded-full absolute -bottom-0.5 -right-0.5 ring-2 ring-white ${stateInfo.dot}`} />
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Linha 1: Nome do cliente + Data formatada */}
                      <div className="flex items-center justify-between gap-1.5 mb-0.5">
                        <p className={`text-[12px] font-bold truncate ${isUnread ? 'text-emerald-900' : 'text-slate-900'}`} title={customerName || conv.phone_number}>
                          {customerName || formatPhone(conv.phone_number)}
                        </p>
                        <span 
                          className="text-[10px] text-slate-500 font-semibold flex-shrink-0 tracking-tight whitespace-nowrap bg-slate-100/90 px-1.5 py-0.5 rounded border border-slate-200/60" 
                          title={formatFullDateTime(conv.last_message_at)}
                        >
                          {formatConversationListDate(conv.last_message_at)}
                        </span>
                      </div>

                      {/* Linha 2: Telefone + Atendente / Status */}
                      <div className="flex items-center justify-between gap-1 text-[10.5px] mb-1">
                        <span className="text-slate-500 font-mono font-medium truncate" title={formatPhone(conv.phone_number)}>
                          {formatPhone(conv.phone_number)}
                        </span>
                        <span className={`font-semibold shrink-0 truncate max-w-[130px] ${stateInfo.color}`}>
                          {conv.state === 'HUMAN_ACTIVE' && conv.users?.name 
                            ? `👤 ${conv.users.name.split(' ')[0]}` 
                            : conv.state === 'RESOLVED' && conv.users?.name 
                            ? `✅ ${conv.users.name.split(' ')[0]}` 
                            : stateInfo.label}
                        </span>
                      </div>

                      {/* Linha 3: Prévia da última mensagem */}
                      {(previewText || lastMsg) && (
                        <p className={`text-[11px] truncate w-full leading-relaxed ${isUnread ? 'text-emerald-800 font-semibold' : 'text-slate-500'}`}>
                          {isUnread && <span className="mr-1 text-[8.5px] bg-emerald-500 text-white px-1.5 py-0.2 rounded-full font-bold inline-block">NOVA</span>}
                          <span className="opacity-70 mr-1">
                            {lastRole === 'bot' ? '🤖' : lastRole === 'agent' ? '👤' : lastRole === 'system' ? '⏱️' : '💬'}
                          </span>
                          {formatLastMessagePreview(previewText).substring(0, 65)}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              );
            });
          })()}
        </div>
      </div>

      {/* ── Coluna direita: janela de chat ── */}
      {selected ? (
        <div className={`flex-1 flex-col ${!selected ? 'hidden md:flex' : 'flex'} w-full h-full absolute md:relative z-20 md:z-auto bg-gray-50/30`}>
          {/* Header estilo Zendesk Ticket Header */}
          <div className="bg-white border-b border-slate-200/90 px-3 py-2.5 sm:px-4 sm:py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <button 
                className="md:hidden p-1.5 -ml-1 text-slate-500 hover:bg-slate-100 rounded-lg shrink-0 transition-colors"
                onClick={() => setSelected(null)}
              >
                <ArrowLeft size={18} />
              </button>

              {/* Avatar do Cliente */}
              <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200/90 flex items-center justify-center text-slate-700 font-bold text-sm shrink-0 shadow-2xs">
                {selected.customers?.name ? selected.customers.name.charAt(0).toUpperCase() : <User size={18} className="text-slate-500" />}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-slate-900 truncate tracking-tight">
                    {selected.customers?.name || formatPhone(selected.phone_number)}
                  </h3>
                  <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 flex items-center gap-1 ${
                    selected.state === 'WAITING_HUMAN' ? 'bg-amber-50 text-amber-800 border-amber-300' :
                    selected.state === 'HUMAN_ACTIVE'  ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    selected.state.includes('FOUND') || selected.state.includes('VIEWING') ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                    'bg-slate-100 text-slate-600 border-slate-200'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      selected.state === 'WAITING_HUMAN' ? 'bg-amber-500 animate-pulse' :
                      selected.state === 'HUMAN_ACTIVE' ? 'bg-blue-500' :
                      selected.state.includes('FOUND') ? 'bg-emerald-500' : 'bg-slate-400'
                    }`} />
                    {STATE_LABELS[selected.state]?.label || selected.state}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-0.5 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1 font-mono text-slate-600">
                    <Phone size={11} className="text-slate-400" />
                    {formatPhone(selected.phone_number)}
                  </span>
                  {selected.customers?.document && (
                    <span className="bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-mono text-[10px]">
                      Doc: {selected.customers.document}
                    </span>
                  )}
                  {selected.state === 'HUMAN_ACTIVE' && selected.users?.name && (
                    <span className="text-slate-600 font-medium">
                      • Atendente: <strong className="text-slate-800 font-bold">{selected.users.name}</strong>
                    </span>
                  )}
                  {selected.state === 'RESOLVED' && selected.users?.name && (
                    <span className="text-slate-600 font-medium">
                      • Resolvido por: <strong className="text-slate-800 font-bold">{selected.users.name}</strong>
                    </span>
                  )}
                  {selected.last_message_at && (
                    <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded text-[10.5px] flex items-center gap-1.5 font-medium ml-auto sm:ml-0 border border-slate-200/60" title="Data e hora da última interação">
                      <Calendar size={11} className="text-slate-400" />
                      <span>{formatFullDateTime(selected.last_message_at)}</span>
                    </span>
                  )}
                </div>
              </div>
            </div>
            
            {/* Zendesk Action Toolbar */}
            <div className="flex items-center gap-1.5 flex-wrap sm:justify-end shrink-0">
              {(selected.state !== 'HUMAN_ACTIVE' || selected.assigned_agent_id !== currentUserId) && (
                <button
                  onClick={handleTakeover}
                  disabled={sendingAction !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c2d4f] hover:bg-[#283f6b] text-white text-xs font-bold rounded-lg disabled:opacity-50 transition-all shadow-xs active:scale-95 whitespace-nowrap cursor-pointer"
                  title="Assumir ticket de atendimento"
                >
                  {sendingAction === 'takeover' ? <RefreshCw size={13} className="animate-spin" /> : <UserCheck size={13} />}
                  <span>{selected.state === 'HUMAN_ACTIVE' ? 'Assumir p/ Mim' : 'Assumir Atendimento'}</span>
                </button>
              )}
              {selected.state !== 'HUMAN_ACTIVE' && (
                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={sendingAction !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg disabled:opacity-50 transition-all border border-slate-200/90 shadow-2xs whitespace-nowrap cursor-pointer"
                  title="Reiniciar fluxo automático da IA"
                >
                  {sendingAction === 'reset' ? <RefreshCw size={13} className="animate-spin" /> : <RotateCcw size={13} />}
                  <span>Reiniciar Bot</span>
                </button>
              )}
              {selected.state === 'HUMAN_ACTIVE' && selected.assigned_agent_id === currentUserId && (
                <>
                  <button
                    onClick={() => {
                      supabase.from('users').select('id, name').neq('role', 'TECHNICIAN').order('name').then(({ data }) => setTeamMembers(data || []));
                      setTransferModal(selected.id);
                      setAgentSearch('');
                    }}
                    disabled={sendingAction !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-indigo-50/70 text-slate-700 hover:text-indigo-700 text-xs font-semibold rounded-lg disabled:opacity-50 transition-all border border-slate-200/90 shadow-2xs whitespace-nowrap cursor-pointer"
                    title="Transferir para outro agente"
                  >
                    {sendingAction === 'transfer' ? <RefreshCw size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                    <span>Transferir</span>
                  </button>
                  <button
                    onClick={handleReturnToBot}
                    disabled={sendingAction !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg disabled:opacity-50 transition-all border border-slate-200/90 shadow-2xs whitespace-nowrap cursor-pointer"
                    title="Devolver ao fluxo automático do Bot"
                  >
                    {sendingAction === 'return_to_bot' ? <RefreshCw size={13} className="animate-spin" /> : <Bot size={13} />}
                    <span>Devolver ao Bot</span>
                  </button>
                </>
              )}
              {/* Encerrar / Resolver Atendimento */}
              <button
                onClick={handleCloseConversation}
                disabled={sendingAction !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg disabled:opacity-50 transition-all border border-rose-200/80 shadow-2xs cursor-pointer"
                title="Encerrar e marcar conversa como resolvida"
              >
                {sendingAction === 'close' ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                <span>Encerrar</span>
              </button>

              <button 
                onClick={() => setSelectedId(null)} 
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors ml-1 cursor-pointer"
                title="Fechar conversa"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
            {activeMessages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <MessageCircle size={40} />
                <p className="text-xs mt-2">Nenhuma mensagem ainda</p>
              </div>
            )}
            {(() => {
              const history = activeMessages;
              if (!history || history.length === 0) return null;

              const openViewerAtUrl = (mediaUrl: string) => {
                const allImages: { url: string; caption?: string }[] = [];
                history.forEach(m => {
                  const parsed = parseMessageMedia(m.content || '');
                  if (parsed && (parsed.mediaType === 'image' || parsed.mediaType === 'sticker') && parsed.mediaUrl) {
                    allImages.push({ url: parsed.mediaUrl, caption: parsed.caption || undefined });
                  }
                });
                const clickedIdx = allImages.findIndex(img => img.url === mediaUrl);
                setViewerImages(allImages.length > 0 ? allImages : [{ url: mediaUrl }]);
                setViewerIndex(clickedIdx >= 0 ? clickedIdx : 0);
              };

              type GroupedItem =
                | { type: 'single'; message: Message; originalIndex: number }
                | {
                    type: 'image_group';
                    role: string;
                    agent_id?: string;
                    agent_name?: string;
                    timestamp: string;
                    items: { mediaUrl: string; caption: string; msg: Message; originalIndex: number }[];
                  };

              const groupedList: GroupedItem[] = [];
              let currentGroup: {
                role: string;
                agent_id?: string;
                agent_name?: string;
                timestamp: string;
                items: { mediaUrl: string; caption: string; msg: Message; originalIndex: number }[];
              } | null = null;

              history.forEach((msg, idx) => {
                const parsed = parseMessageMedia(msg.content || '');
                const isImage = parsed && (parsed.mediaType === 'image' || parsed.mediaType === 'sticker') && parsed.mediaUrl;

                if (isImage) {
                  if (
                    currentGroup &&
                    currentGroup.role === msg.role &&
                    currentGroup.agent_id === msg.agent_id
                  ) {
                    currentGroup.items.push({
                      mediaUrl: parsed.mediaUrl,
                      caption: parsed.caption,
                      msg,
                      originalIndex: idx
                    });
                    currentGroup.timestamp = msg.timestamp;
                  } else {
                    if (currentGroup) {
                      if (currentGroup.items.length === 1) {
                        groupedList.push({
                          type: 'single',
                          message: currentGroup.items[0].msg,
                          originalIndex: currentGroup.items[0].originalIndex
                        });
                      } else {
                        groupedList.push({ type: 'image_group', ...currentGroup });
                      }
                    }
                    currentGroup = {
                      role: msg.role,
                      agent_id: msg.agent_id,
                      agent_name: msg.agent_name,
                      timestamp: msg.timestamp,
                      items: [{ mediaUrl: parsed.mediaUrl, caption: parsed.caption, msg, originalIndex: idx }]
                    };
                  }
                } else {
                  if (currentGroup) {
                    if (currentGroup.items.length === 1) {
                      groupedList.push({
                        type: 'single',
                        message: currentGroup.items[0].msg,
                        originalIndex: currentGroup.items[0].originalIndex
                      });
                    } else {
                      groupedList.push({ type: 'image_group', ...currentGroup });
                    }
                    currentGroup = null;
                  }
                  groupedList.push({ type: 'single', message: msg, originalIndex: idx });
                }
              });

              if (currentGroup) {
                if (currentGroup.items.length === 1) {
                  groupedList.push({
                    type: 'single',
                    message: currentGroup.items[0].msg,
                    originalIndex: currentGroup.items[0].originalIndex
                  });
                } else {
                  groupedList.push({ type: 'image_group', ...currentGroup });
                }
              }

              type DayGroup = {
                dateKey: string;
                dateLabel: string;
                items: GroupedItem[];
              };

              const dayGroups: DayGroup[] = [];
              groupedList.forEach((item) => {
                const itemTimestamp = item.type === 'single' ? item.message.timestamp : item.timestamp;
                const dateKey = getDateGroupKey(itemTimestamp);
                let dg = dayGroups.find(d => d.dateKey === dateKey);
                if (!dg) {
                  dg = {
                    dateKey,
                    dateLabel: formatDateDivider(itemTimestamp),
                    items: []
                  };
                  dayGroups.push(dg);
                }
                dg.items.push(item);
              });

              return dayGroups.map((dayGroup) => (
                <div key={`day-group-${dayGroup.dateKey}`} className="space-y-3">
                  {/* Separador de Data Estilo WhatsApp & Zendesk */}
                  <div className="flex justify-center my-4 sticky top-1 z-10 pointer-events-none">
                    <div className="bg-slate-200/90 dark:bg-slate-800/90 text-slate-700 dark:text-slate-200 text-[11px] font-semibold px-3.5 py-1 rounded-full shadow-2xs backdrop-blur-md border border-slate-300/80 dark:border-slate-700/80 flex items-center gap-1.5 uppercase tracking-wider select-none">
                      <Calendar size={11} className="text-slate-500 dark:text-slate-400 shrink-0" />
                      <span>{dayGroup.dateLabel}</span>
                    </div>
                  </div>

                  {dayGroup.items.map((item, gIdx) => {
                if (item.type === 'single') {
                  const msg = item.message;
                  if (msg.role === 'system') {
                    return (
                      <div key={`single-${item.originalIndex}`} className="flex justify-center my-3 w-full">
                        <div className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[11px] font-medium px-4 py-1.5 rounded-full shadow-xs border border-slate-200 dark:border-slate-700/60 flex items-center gap-1.5 text-center">
                          <Clock size={12} className="text-slate-400 shrink-0" />
                          <span>{msg.content}</span>
                        </div>
                      </div>
                    );
                  }
                  const isFromMe = msg.role === 'agent' || msg.role === 'bot';
                  const isAgent = msg.role === 'agent';
                  const isBot = msg.role === 'bot';
                  const isUser = msg.role === 'user';

                  return (
                    <div key={`single-${item.originalIndex}`} className={`flex gap-2 items-end ${isFromMe ? 'justify-end' : 'justify-start'}`}>
                      {isUser && (
                        <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200/90 flex items-center justify-center flex-shrink-0 shadow-2xs text-slate-700 font-bold text-xs">
                          {selected.customers?.name ? selected.customers.name.charAt(0).toUpperCase() : <User size={14} className="text-slate-500" />}
                        </div>
                      )}

                      <div className={`max-w-[75%] sm:max-w-[70%] px-4 py-2.5 text-xs leading-relaxed shadow-xs transition-all ${
                        isAgent
                          ? 'bg-[#1c2d4f] text-white rounded-2xl rounded-tr-xs border border-[#1c2d4f]'
                          : isBot
                          ? 'bg-violet-50/90 text-slate-800 rounded-2xl rounded-tr-xs border border-violet-200/80'
                          : 'bg-white text-slate-800 rounded-2xl rounded-tl-xs border border-slate-200/90'
                      }`}>
                        {isUser && (
                          <div className="flex items-center justify-between gap-3 mb-1 pb-1 border-b border-slate-100">
                            <span className="text-[11px] font-bold text-slate-900 tracking-tight">
                              {selected.customers?.name || formatPhone(selected.phone_number)}
                            </span>
                            <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Cliente</span>
                          </div>
                        )}
                        {isAgent && (
                          <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-white/10">
                            <UserCheck size={12} className="text-indigo-300" />
                            <span className="text-[10.5px] font-bold text-white uppercase tracking-tight">
                              {msg.agent_name || (msg.agent_id ? teamMembers.find(m => m.id === msg.agent_id)?.name : null) || selected.users?.name || currentUserName}
                            </span>
                            <span className="text-[8.5px] bg-white/20 text-indigo-100 px-1.5 py-0.2 rounded font-bold uppercase ml-auto">Agente</span>
                          </div>
                        )}
                        {isBot && (
                          <div className="flex items-center gap-1.5 mb-1 pb-1 border-b border-violet-200/60">
                            <Bot size={13} className="text-violet-600" />
                            <span className="text-[10.5px] font-bold text-violet-950 uppercase tracking-tight">
                              Nexus Assistente Virtual
                            </span>
                            <span className="text-[8.5px] bg-violet-200/80 text-violet-800 px-1.5 py-0.2 rounded font-extrabold uppercase ml-auto">IA</span>
                          </div>
                        )}

                        {(() => {
                          const content = msg.content || '';
                          const parsed = parseMessageMedia(content);
                          if (parsed) {
                            const { mediaType, mediaUrl, caption } = parsed;
                            const isLight = isAgent;
                            const textColor = isLight ? 'text-white/70' : 'text-slate-500';

                            if ((mediaType === 'image' || mediaType === 'sticker') && mediaUrl) {
                              return (
                                <div className="space-y-1">
                                  <img
                                    src={mediaUrl}
                                    alt={caption || 'Imagem'}
                                    className="max-w-[240px] rounded-xl object-cover cursor-pointer hover:opacity-95 transition-opacity border border-slate-200/50 shadow-2xs"
                                    onClick={() => openViewerAtUrl(mediaUrl)}
                                    onError={(e) => {
                                      const el = e.target as HTMLImageElement;
                                      el.style.display = 'none';
                                      const parent = el.parentElement;
                                      if (parent && !parent.querySelector('.img-fallback')) {
                                        const fb = document.createElement('div');
                                        fb.className = 'img-fallback flex items-center gap-2 text-[11px] opacity-70 py-1';
                                        fb.innerHTML = '📸 Imagem (visualização indisponível)';
                                        parent.appendChild(fb);
                                      }
                                    }}
                                  />
                                  {caption && <p className={`text-[11px] italic ${textColor}`}>{caption}</p>}
                                </div>
                              );
                            }
                            if ((mediaType === 'audio' || mediaType === 'ptt') && mediaUrl) {
                              return (
                                <div className="flex flex-col gap-1 py-1 min-w-[210px]">
                                  <div className="flex items-center gap-1.5 text-[11px] font-semibold opacity-90">
                                    <Mic size={14} className={isLight ? 'text-white' : 'text-indigo-600'} />
                                    <span className={isLight ? 'text-white' : 'text-slate-700'}>Mensagem de Voz</span>
                                  </div>
                                  <audio controls src={mediaUrl} className="h-9 w-full rounded-lg outline-none" preload="metadata" />
                                </div>
                              );
                            }
                            if (mediaType === 'video') {
                              return (
                                <div className="flex items-center gap-2 p-2 rounded-lg bg-black/10">
                                  <FileVideo size={16} className={isLight ? 'text-amber-300' : 'text-amber-600'} />
                                  <span className="text-[11px] italic">Vídeo recebido (envio de vídeos desativado)</span>
                                </div>
                              );
                            }
                            if (mediaType === 'document') {
                              const fileName = caption || mediaUrl.split('/').pop() || 'Documento';
                              return (
                                <a href={mediaUrl || '#'} target="_blank" rel="noopener noreferrer"
                                   className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all ${
                                     isLight 
                                       ? 'bg-white/10 border-white/20 hover:bg-white/15 text-white' 
                                       : 'bg-slate-50 border-slate-200/80 hover:bg-slate-100 text-slate-800'
                                   }`}>
                                  <FileText size={18} className={isLight ? 'text-indigo-200' : 'text-indigo-600'} />
                                  <span className="text-[11.5px] font-semibold truncate max-w-[170px]">{fileName}</span>
                                  {mediaUrl && <Download size={13} className={`ml-auto ${isLight ? 'text-white/80' : 'text-slate-400'}`} />}
                                </a>
                              );
                            }
                            const mediaLabel: Record<string, string> = {
                              image: '📸 Imagem', video: '📹 Vídeo', audio: '🎤 Áudio',
                              document: '📄 Documento', sticker: '✨ Figurinha'
                            };
                            return (
                              <p className="text-[11px] opacity-80 italic">
                                {mediaLabel[mediaType] || '📎 Mídia'} recebida (pré-visualização não disponível)
                              </p>
                            );
                          }
                          return <p className={`whitespace-pre-wrap text-[12.5px] leading-relaxed ${isAgent ? 'text-slate-100' : 'text-slate-800'}`}>{content}</p>;
                        })()}

                        <p className={`text-[9.5px] mt-1.5 font-medium ${isAgent ? 'text-white/60 text-right' : isBot ? 'text-violet-600/70 text-right' : 'text-slate-400'}`} title={formatFullDateTime(msg.timestamp)}>
                          {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>

                      {isFromMe && (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-2xs ${
                          isBot ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white' : 'bg-[#1c2d4f] text-white border border-white/20'
                        }`}>
                          {isBot ? <Bot size={15} /> : <User size={14} />}
                        </div>
                      )}
                    </div>
                  );
                }

                // IMAGE GROUP CARD (2+ IMAGES)
                const isFromMe = item.role === 'agent' || item.role === 'bot';
                const isAgent = item.role === 'agent';
                const isBot = item.role === 'bot';
                const isUser = item.role === 'user';
                const totalImages = item.items.length;

                return (
                  <div key={`group-${gIdx}`} className={`flex gap-2 items-end ${isFromMe ? 'justify-end' : 'justify-start'}`}>
                    {isUser && (
                      <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200/90 flex items-center justify-center flex-shrink-0 shadow-2xs text-slate-700 font-bold text-xs">
                        {selected.customers?.name ? selected.customers.name.charAt(0).toUpperCase() : <User size={14} className="text-slate-500" />}
                      </div>
                    )}

                    <div className={`max-w-[300px] p-2.5 text-xs leading-relaxed shadow-xs transition-all ${
                      isAgent
                        ? 'bg-[#1c2d4f] text-white rounded-2xl rounded-tr-xs border border-[#1c2d4f]'
                        : isBot
                        ? 'bg-violet-50/90 text-slate-800 rounded-2xl rounded-tr-xs border border-violet-200/80'
                        : 'bg-white text-slate-800 rounded-2xl rounded-tl-xs border border-slate-200/90'
                    }`}>
                      {isUser && (
                        <div className="flex items-center justify-between gap-3 mb-1.5 pb-1 border-b border-slate-100 px-1">
                          <span className="text-[11px] font-bold text-slate-900 tracking-tight">
                            {selected.customers?.name || formatPhone(selected.phone_number)}
                          </span>
                          <span className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider">Cliente</span>
                        </div>
                      )}
                      {isAgent && (
                        <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-white/10 px-1">
                          <UserCheck size={12} className="text-indigo-300" />
                          <span className="text-[10.5px] font-bold text-white uppercase tracking-tight">
                            {item.agent_name || (item.agent_id ? teamMembers.find(m => m.id === item.agent_id)?.name : null) || selected.users?.name || currentUserName}
                          </span>
                          <span className="text-[8.5px] bg-white/20 text-indigo-100 px-1.5 py-0.2 rounded font-bold uppercase ml-auto">Agente</span>
                        </div>
                      )}
                      {isBot && (
                        <div className="flex items-center gap-1.5 mb-1.5 pb-1 border-b border-violet-200/60 px-1">
                          <Bot size={13} className="text-violet-600" />
                          <span className="text-[10.5px] font-bold text-violet-950 uppercase tracking-tight">
                            Nexus Assistente Virtual
                          </span>
                          <span className="text-[8.5px] bg-violet-200/80 text-violet-800 px-1.5 py-0.2 rounded font-extrabold uppercase ml-auto">IA</span>
                        </div>
                      )}

                      {/* GRID OF IMAGES */}
                      {totalImages === 2 && (
                        <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden cursor-pointer bg-black/10">
                          {item.items.slice(0, 2).map((imgObj, idx) => (
                            <div key={idx} className="relative aspect-square overflow-hidden bg-black/20" onClick={() => openViewerAtUrl(imgObj.mediaUrl)}>
                              <img
                                src={imgObj.mediaUrl}
                                alt={imgObj.caption || `Foto ${idx + 1}`}
                                className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                                onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                              />
                            </div>
                          ))}
                        </div>
                      )}

                      {totalImages === 3 && (
                        <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden cursor-pointer bg-black/10 h-52">
                          <div className="relative h-full overflow-hidden bg-black/20" onClick={() => openViewerAtUrl(item.items[0].mediaUrl)}>
                            <img
                              src={item.items[0].mediaUrl}
                              alt={item.items[0].caption || 'Foto 1'}
                              className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                              onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                            />
                          </div>
                          <div className="grid grid-rows-2 gap-1 h-full">
                            {item.items.slice(1, 3).map((imgObj, idx) => (
                              <div key={idx} className="relative h-full overflow-hidden bg-black/20" onClick={() => openViewerAtUrl(imgObj.mediaUrl)}>
                                <img
                                  src={imgObj.mediaUrl}
                                  alt={imgObj.caption || `Foto ${idx + 2}`}
                                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {totalImages >= 4 && (
                        <div className="grid grid-cols-2 gap-1 rounded-xl overflow-hidden cursor-pointer bg-black/10">
                          {item.items.slice(0, 4).map((imgObj, idx) => {
                            const isFourth = idx === 3 && totalImages > 4;
                            const extraCount = totalImages - 3;
                            return (
                              <div key={idx} className="relative aspect-square overflow-hidden bg-black/20" onClick={() => openViewerAtUrl(imgObj.mediaUrl)}>
                                <img
                                  src={imgObj.mediaUrl}
                                  alt={imgObj.caption || `Foto ${idx + 1}`}
                                  className="w-full h-full object-cover hover:scale-105 transition-transform duration-200"
                                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                                />
                                {isFourth && (
                                  <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex flex-col items-center justify-center text-white font-bold transition-all hover:bg-black/50">
                                    <span className="text-xl">+ {extraCount}</span>
                                    <span className="text-[9px] font-normal uppercase tracking-wider text-white/80">ver todas</span>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* CAPTIONS (if any) */}
                      {item.items.some(it => !!it.caption) && (
                        <div className="mt-2 pt-1.5 border-t border-white/10 space-y-1 px-1">
                          {item.items.map((it, idx) => it.caption ? (
                            <p key={idx} className="text-[11px] leading-tight opacity-90">
                              <span className="opacity-60 text-[10px] mr-1">📷 {idx + 1}:</span>
                              {it.caption}
                            </p>
                          ) : null)}
                        </div>
                      )}

                      {/* FOOTER */}
                      <div className="flex items-center justify-between mt-1.5 pt-1 text-[9px] opacity-70 px-1 border-t border-white/5">
                        <span className="flex items-center gap-1 font-medium">
                          <Images size={11} /> {totalImages} fotos
                        </span>
                        <span title={formatFullDateTime(item.timestamp)}>
                          {new Date(item.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>

                    {isFromMe && (
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-2xs ${
                        item.role === 'bot' ? 'bg-gradient-to-tr from-violet-600 to-indigo-600 text-white' : 'bg-[#1c2d4f] text-white border border-white/20'
                      }`}>
                        {item.role === 'bot' ? <Bot size={15} /> : <User size={14} />}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ));
        })()}
            <div ref={chatEndRef} />
          </div>

          {/* Input estilo Zendesk Composer */}
          {selected.state === 'HUMAN_ACTIVE' ? (
            <div className="bg-white border-t border-slate-200/90 p-3 sm:p-4 relative shadow-[0_-4px_12px_rgba(0,0,0,0.02)]">
              
              {/* Header do Composer */}
              <div className="flex items-center justify-between pb-2 mb-2 text-xs border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="flex items-center gap-1.5 font-bold text-slate-700">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Resposta Pública
                  </span>
                  <span className="text-slate-400 text-[11px] font-medium">• WhatsApp</span>
                  {selected.assigned_agent_id !== currentUserId && (
                    <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.2 rounded-md font-bold">
                      Atribuído a outro atendente
                    </span>
                  )}
                </div>
                <span className="text-[11px] text-slate-400 hidden sm:inline font-mono">
                  Shift + Enter para nova linha
                </span>
              </div>

              {/* Emoji Popover */}
              {showStickers && selected.assigned_agent_id === currentUserId && (
                <div
                  ref={stickerRef}
                  className="absolute bottom-full mb-3 left-4 bg-white border border-slate-200 shadow-xl rounded-2xl p-3 z-50 w-72 animate-in slide-in-from-bottom-2"
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-700">Emojis Rápidos</p>
                    <button onClick={() => setShowStickers(false)} className="text-slate-400 hover:text-slate-600 p-1 rounded-md">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-8 gap-1 h-36 overflow-y-auto custom-scrollbar pr-1">
                    {DEFAULT_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => setMessage(prev => prev + emoji)}
                        className="text-xl hover:bg-slate-100 rounded-lg p-1 transition-colors flex items-center justify-center cursor-pointer"
                        disabled={sendingAction !== null}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Card de Resposta */}
              <div className={`rounded-2xl border transition-all ${
                selected.assigned_agent_id === currentUserId 
                  ? 'bg-slate-50/70 border-slate-200 focus-within:bg-white focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-400/15 shadow-2xs' 
                  : 'bg-slate-100 border-slate-200 opacity-70 cursor-not-allowed'
              }`}>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  accept="image/*,application/pdf,.doc,.docx"
                  className="hidden" 
                />

                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                      }
                  }}
                  disabled={selected.assigned_agent_id !== currentUserId}
                  rows={2}
                  placeholder={selected.assigned_agent_id === currentUserId ? "Digite sua resposta para o cliente..." : "Esta conversa pertence a outro agente."}
                  className="w-full px-3.5 pt-2.5 pb-1 bg-transparent border-none outline-none text-[13px] text-slate-800 placeholder-slate-400 resize-none custom-scrollbar disabled:cursor-not-allowed leading-relaxed"
                  style={{ minHeight: '44px', maxHeight: '140px' }}
                  onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${target.scrollHeight}px`;
                  }}
                />

                {/* Toolbar inferior */}
                <div className="flex items-center justify-between px-2.5 py-1.5 border-t border-slate-100/80">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={selected.assigned_agent_id !== currentUserId || uploadingMedia}
                      className={`p-2 rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer ${uploadingMedia ? 'opacity-50 cursor-wait' : ''}`}
                      title="Anexar Arquivo ou Imagem"
                    >
                      {uploadingMedia ? <Loader2 size={16} className="animate-spin text-indigo-600" /> : <Paperclip size={16} />}
                    </button>
                    <button
                      onClick={() => setShowStickers(!showStickers)}
                      disabled={selected.assigned_agent_id !== currentUserId}
                      className={`p-2 rounded-lg transition-colors cursor-pointer ${
                        selected.assigned_agent_id !== currentUserId 
                          ? 'text-slate-300' 
                          : showStickers 
                          ? 'bg-indigo-100 text-indigo-700' 
                          : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/60'
                      }`}
                      title="Inserir Emoji"
                    >
                      <Sticker size={16} />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">Enter ↵</span>
                    <button
                      onClick={handleSend}
                      disabled={sendingAction !== null || uploadingMedia || !message.trim() || selected.assigned_agent_id !== currentUserId}
                      className="px-4 py-1.5 bg-[#1c2d4f] hover:bg-[#283f6b] text-white text-xs font-bold rounded-xl disabled:opacity-40 transition-all shadow-xs flex items-center gap-1.5 cursor-pointer active:scale-95"
                      title="Enviar Mensagem (Enter)"
                    >
                      {sendingAction === 'send' ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />
                          <span>Enviando...</span>
                        </>
                      ) : (
                        <>
                          <span>Enviar</span>
                          <Send size={13} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-white border-t border-slate-200/90 p-4">
              {selected.state === 'WAITING_HUMAN' ? (
                <div className="bg-amber-50/90 border border-amber-200/80 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                  <div className="flex items-center gap-2.5 text-xs font-bold text-amber-900">
                    <div className="w-8 h-8 rounded-full bg-amber-100 border border-amber-200 flex items-center justify-center shrink-0 text-amber-700">
                      <AlertCircle size={16} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">Cliente aguardando atendimento humano</p>
                      <p className="text-[11px] text-amber-700 font-normal">Assuma a conversa para responder diretamente pelo WhatsApp.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleTakeover}
                    disabled={sendingAction !== null}
                    className="px-4 py-2 bg-[#1c2d4f] hover:bg-[#283f6b] text-white text-xs font-bold rounded-xl transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95"
                  >
                    {sendingAction === 'takeover' ? <RefreshCw size={14} className="animate-spin" /> : <UserCheck size={14} />}
                    <span>Assumir Conversa Agora</span>
                  </button>
                </div>
              ) : (
                <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-3 sm:p-4 flex items-center justify-center gap-2.5 text-xs text-slate-600 shadow-2xs">
                  <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 shrink-0">
                    <Bot size={15} />
                  </div>
                  <span>O assistente virtual está gerenciando este atendimento automaticamente.</span>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-300 space-y-3">
          <MessageCircle size={48} />
          <p className="text-sm font-medium">Selecione uma conversa</p>
          <p className="text-xs">As mensagens chegam automaticamente em tempo real</p>
        </div>
      )}

      {/* Modal de Confirmação para Reiniciar Bot */}
      {showResetConfirm && selected && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white border border-[#1c2d4f]/20 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[#1c2d4f] px-6 py-4 flex items-center gap-3">
              <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center text-white">
                <RotateCcw size={18} />
              </div>
              <h3 className="text-base font-bold text-white tracking-wide">Reiniciar Assistente</h3>
            </div>
            <div className="p-6 bg-slate-50/50">
              <p className="text-sm text-slate-600 leading-relaxed font-medium mb-6">
                O bot de Inteligência Artificial assumirá esta conversa desde o início (fluxo de atendimento). O histórico de mensagens anteriores será mantido para consulta.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl transition-all shadow-sm"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleResetBot}
                  className="px-5 py-2.5 bg-[#1c2d4f] hover:bg-[#15223c] text-white text-xs font-bold rounded-xl transition-all shadow-md shadow-[#1c2d4f]/20 flex items-center gap-2"
                >
                  <RotateCcw size={14} /> Confirmar Reinício
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal de Transferir Conversa ── */}
      {transferModal && selected && createPortal(
        <div className="fixed inset-0 z-[99999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-[#1c2d4f] px-6 py-5 flex items-center justify-between text-white shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-indigo-500/20 border border-indigo-400/30 rounded-2xl flex items-center justify-center text-indigo-300">
                  <ArrowRight size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold tracking-tight">Transferir Atendimento</h3>
                  <p className="text-[11px] text-slate-300">Selecione o membro da equipe para assumir este chat</p>
                </div>
              </div>
              <button
                onClick={() => { setTransferModal(null); setAgentSearch(''); }}
                className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-4 overflow-y-auto custom-scrollbar">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block uppercase tracking-wider">
                  Buscar Agente / Atendente
                </label>
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Digite o nome do atendente..."
                    value={agentSearch}
                    onChange={(e) => setAgentSearch(e.target.value)}
                    className="w-full pl-10 pr-8 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] transition-all"
                    autoFocus
                  />
                  {agentSearch && (
                    <button
                      onClick={() => setAgentSearch('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Agents List */}
              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-1">
                {(() => {
                  const filteredAgents = teamMembers.filter(m => 
                    m.id !== currentUserId && 
                    (m.name || '').toLowerCase().includes(agentSearch.toLowerCase().trim())
                  );

                  if (filteredAgents.length === 0) {
                    return (
                      <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-100">
                        <User size={28} className="text-slate-300 mx-auto mb-2" />
                        <p className="text-xs font-semibold text-slate-500">Nenhum agente encontrado</p>
                        <p className="text-[10px] text-slate-400 mt-1">Verifique o nome digitado ou se há outros usuários cadastrados na equipe.</p>
                      </div>
                    );
                  }

                  return filteredAgents.map(m => (
                    <button
                      key={m.id}
                      onClick={() => {
                        handleTransfer(m.id);
                        setTransferModal(null);
                        setAgentSearch('');
                      }}
                      className="w-full flex items-center justify-between p-3 bg-white hover:bg-indigo-50/60 border border-slate-200 hover:border-indigo-200 rounded-2xl transition-all group text-left shadow-sm hover:shadow-md"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                          {m.name ? m.name.charAt(0).toUpperCase() : 'U'}
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-800 group-hover:text-indigo-950">{m.name}</p>
                          <p className="text-[10px] text-slate-400">Atendente / Equipe</p>
                        </div>
                      </div>
                      <div className="px-3 py-1 bg-slate-100 group-hover:bg-indigo-600 group-hover:text-white text-slate-600 text-[10px] font-bold rounded-lg transition-colors">
                        Transferir
                      </div>
                    </button>
                  ));
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end">
              <button
                onClick={() => { setTransferModal(null); setAgentSearch(''); }}
                className="px-5 py-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-all shadow-sm"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Modal de Nova Conversa ── */}
      {isNewChatOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-3 sm:p-6 overflow-hidden animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] sm:max-h-[90vh] animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-200 flex justify-between items-center bg-white shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-50 rounded-lg flex items-center justify-center text-[#1c2d4f] border border-slate-200">
                  <MessageCircle size={18} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 tracking-tight">Iniciar Nova Conversa</h2>
                  <p className="text-[10px] font-bold text-slate-400 mt-0.5">WhatsApp Outbound • Atendimento direto</p>
                </div>
              </div>
              <button
                onClick={() => setIsNewChatOpen(false)}
                className="p-2 text-slate-400 hover:text-rose-600 transition-all rounded-lg hover:bg-rose-50"
              >
                <X size={20} />
              </button>
            </div>

            {/* Alternador de Abas */}
            <div className="p-4 bg-slate-50/50 border-b border-slate-200 flex gap-2 shrink-0">
              <button
                onClick={() => { setNewChatTab('customer'); setNewChatError(null); }}
                className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  newChatTab === 'customer'
                    ? 'bg-[#1c2d4f] text-white shadow-md'
                    : 'bg-white text-slate-500 border border-slate-200 hover:text-[#1c2d4f] hover:bg-slate-50'
                }`}
              >
                <User size={15} /> Cliente Cadastrado
              </button>
              <button
                onClick={() => { setNewChatTab('manual'); setNewChatError(null); setSelectedCustomer(null); }}
                className={`flex-1 py-2.5 px-4 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  newChatTab === 'manual'
                    ? 'bg-[#1c2d4f] text-white shadow-md'
                    : 'bg-white text-slate-500 border border-slate-200 hover:text-[#1c2d4f] hover:bg-slate-50'
                }`}
              >
                <Phone size={15} /> Digitar Número
              </button>
            </div>

            {/* Corpo do Modal */}
            <div className="p-6 overflow-y-auto space-y-5 flex-1 min-h-0 custom-scrollbar bg-slate-50/30">
              {newChatError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-3 text-rose-700 text-xs font-medium animate-in fade-in">
                  <AlertCircle size={18} className="shrink-0 text-rose-500" />
                  <span>{newChatError}</span>
                </div>
              )}

              {newChatTab === 'customer' ? (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-700 block">
                    Buscar Cliente por Nome, CPF, CNPJ ou Telefone
                  </label>
                  <div className="relative">
                    <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Digite o nome, CPF/CNPJ ou telefone..."
                      value={customerQuery}
                      onChange={e => setCustomerQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] transition-all"
                    />
                  </div>

                  {/* Lista de Clientes */}
                  <div className="max-h-52 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                    {loadingCustomers ? (
                      <div className="p-6 text-center text-slate-400 flex items-center justify-center gap-2 text-xs">
                        <Loader2 size={16} className="animate-spin text-emerald-600" />
                        <span>Carregando lista de clientes...</span>
                      </div>
                    ) : filteredSearchCustomers.length > 0 ? (
                      filteredSearchCustomers.map(c => {
                        const isSelected = selectedCustomer?.id === c.id;
                        const targetWA = c.whatsapp && c.whatsapp.trim() ? c.whatsapp.trim() : c.phone || '';
                        const docStr = (c as any).document || (c as any).cpf || (c as any).cnpj;

                        return (
                          <div
                            key={c.id}
                            onClick={() => {
                              setSelectedCustomer(c);
                              setNewChatError(null);
                            }}
                            className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                              isSelected
                                ? 'bg-emerald-50/80 border-emerald-500 shadow-sm'
                                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80'
                            }`}
                          >
                            <div className="space-y-1 min-w-0 flex-1 pr-3">
                              <div className="flex items-center gap-2">
                                <p className="text-xs font-bold text-slate-900 truncate">{c.name}</p>
                                {docStr && (
                                  <span className="text-[10px] font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded-md font-semibold shrink-0">
                                    {docStr}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-[11px]">
                                <span className={`font-mono font-bold flex items-center gap-1 ${targetWA ? 'text-emerald-700' : 'text-slate-400'}`}>
                                  <MessageCircle size={12} className={targetWA ? 'text-emerald-600' : 'text-slate-400'} />
                                  {targetWA ? formatPhone(targetWA) : 'Sem WhatsApp'}
                                </span>
                                {c.city && (
                                  <span className="text-slate-400 text-[10px] truncate">• {c.city} - {c.state}</span>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0">
                              {isSelected ? (
                                <div className="w-6 h-6 rounded-full bg-emerald-600 text-white flex items-center justify-center shadow-sm">
                                  <CheckCircle2 size={16} />
                                </div>
                              ) : (
                                <div className="w-6 h-6 rounded-full border border-slate-300 bg-slate-50" />
                              )}
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="p-8 text-center text-slate-400 space-y-1">
                        <User size={24} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-xs font-bold text-slate-600">Nenhum cliente localizado</p>
                        <p className="text-[11px]">Tente buscar por outro termo ou use a aba "Digitar Número".</p>
                      </div>
                    )}
                  </div>

                  {selectedCustomer && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2.5 text-xs text-emerald-800 font-bold">
                      <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                      <span>
                        Selecionado: {selectedCustomer.name} (WhatsApp: {selectedCustomer.whatsapp || selectedCustomer.phone})
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <label className="text-xs font-bold text-slate-700 block">
                    Número de WhatsApp com DDD
                  </label>
                  <div className="relative">
                    <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Ex: (11) 99999-8888 ou 5511999998888"
                      value={manualPhone}
                      onChange={e => {
                        setManualPhone(e.target.value);
                        setNewChatError(null);
                      }}
                      className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
                    💡 O código do país (55 para Brasil) será adicionado automaticamente caso você digite apenas o DDD e número.
                  </p>
                </div>
              )}

              {/* Mensagem Inicial */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="text-xs font-bold text-slate-700 block">
                  Mensagem Inicial de Abertura (Opcional)
                </label>
                <textarea
                  rows={3}
                  placeholder="Ex: Olá! Sou da equipe de suporte da Nexus Pro. Como posso ajudar com sua ordem de serviço?"
                  value={initialMessage}
                  onChange={e => setInitialMessage(e.target.value)}
                  className="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-medium text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1c2d4f]/20 focus:border-[#1c2d4f] transition-all custom-scrollbar resize-none"
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-white border-t border-slate-200 flex items-center justify-end gap-3 shrink-0">
              <button
                type="button"
                onClick={() => setIsNewChatOpen(false)}
                disabled={startingChat}
                className="px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 hover:text-rose-600 text-slate-500 text-xs font-bold rounded-lg transition-all shadow-sm disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleStartNewChat}
                disabled={startingChat || (newChatTab === 'customer' && !selectedCustomer) || (newChatTab === 'manual' && !manualPhone.trim())}
                className="px-6 py-2.5 bg-[#1c2d4f] hover:bg-[#2a4070] text-white text-xs font-bold rounded-lg transition-all shadow-md shadow-[#1c2d4f]/20 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
              >
                {startingChat ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    <span>Iniciando...</span>
                  </>
                ) : (
                  <>
                    <MessageCircle size={15} />
                    <span>Iniciar Conversa</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      {/* ── Modal de Visualização de Imagens (Carrossel Lightbox) ── */}
      {viewerIndex !== null && viewerImages[viewerIndex] && createPortal(
        <div 
          className="fixed inset-0 z-[9999] bg-black/95 backdrop-blur-md flex flex-col justify-between select-none animate-fadeIn"
          onClick={() => setViewerIndex(null)}
        >
          {/* Header do Viewer */}
          <div 
            className="w-full flex items-center justify-between p-4 bg-gradient-to-b from-black/80 to-transparent z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3">
              <span className="text-white/80 text-xs font-medium bg-white/10 px-3.5 py-1.5 rounded-full border border-white/10 shadow-sm">
                {viewerIndex + 1} de {viewerImages.length}
              </span>
              {viewerImages[viewerIndex].caption && (
                <p className="text-white text-sm truncate max-w-md italic opacity-90">
                  {viewerImages[viewerIndex].caption}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <a
                href={viewerImages[viewerIndex].url}
                target="_blank"
                rel="noopener noreferrer"
                download
                className="p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title="Baixar imagem"
                onClick={(e) => e.stopPropagation()}
              >
                <Download size={20} />
              </a>
              <button
                onClick={() => setViewerIndex(null)}
                className="p-2.5 text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors cursor-pointer"
                title="Fechar (Esc)"
              >
                <X size={24} />
              </button>
            </div>
          </div>

          {/* Área Central da Imagem e Navegação */}
          <div className="flex-1 relative flex items-center justify-center p-4 min-h-0 w-full">
            {/* Botão Anterior */}
            {viewerImages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setViewerIndex(prev => (prev !== null && prev > 0 ? prev - 1 : viewerImages.length - 1));
                }}
                className="absolute left-4 z-20 p-3 text-white/70 hover:text-white bg-black/40 hover:bg-black/80 rounded-full border border-white/10 backdrop-blur-sm transition-all transform hover:scale-105 cursor-pointer shadow-lg"
                title="Anterior (Seta Esquerda)"
              >
                <ChevronLeft size={28} />
              </button>
            )}

            {/* Imagem Principal */}
            <div 
              className="relative max-w-full max-h-full flex items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <img
                src={viewerImages[viewerIndex].url}
                alt={viewerImages[viewerIndex].caption || 'Imagem'}
                className="max-h-[78vh] max-w-[90vw] object-contain rounded-lg shadow-2xl transition-all duration-200"
              />
            </div>

            {/* Botão Próximo */}
            {viewerImages.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setViewerIndex(prev => (prev !== null && prev < viewerImages.length - 1 ? prev + 1 : 0));
                }}
                className="absolute right-4 z-20 p-3 text-white/70 hover:text-white bg-black/40 hover:bg-black/80 rounded-full border border-white/10 backdrop-blur-sm transition-all transform hover:scale-105 cursor-pointer shadow-lg"
                title="Próximo (Seta Direita)"
              >
                <ChevronRight size={28} />
              </button>
            )}
          </div>

          {/* Barra de Miniaturas no Rodapé */}
          <div 
            className="w-full p-4 bg-gradient-to-t from-black/80 to-transparent flex flex-col items-center gap-3 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            {viewerImages.length > 1 && (
              <div className="flex items-center gap-2.5 overflow-x-auto max-w-full py-1.5 px-4 scrollbar-none">
                {viewerImages.map((img, idx) => (
                  <button
                    key={idx}
                    onClick={() => setViewerIndex(idx)}
                    className={`relative rounded-lg overflow-hidden flex-shrink-0 transition-all cursor-pointer ${
                      idx === viewerIndex 
                        ? 'ring-2 ring-emerald-400 scale-105 opacity-100 shadow-md' 
                        : 'opacity-40 hover:opacity-80'
                    }`}
                  >
                    <img
                      src={img.url}
                      alt=""
                      className="w-12 h-12 object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
