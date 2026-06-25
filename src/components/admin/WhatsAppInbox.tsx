import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { MessageCircle, User, Bot, Phone, RefreshCw, Send, UserCheck, RotateCcw, X, BellRing, Bell, Volume2, ArrowRight, Sticker, FileVideo, Mic, FileText, Download, AlertCircle } from 'lucide-react';

interface Message {
  role: 'bot' | 'user' | 'agent';
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
  history: Message[];
  last_message_at: string;
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
  RESOLVED:       { label: 'Resolvido',        color: 'text-gray-400',    dot: 'bg-gray-300' },
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
  const [filter, setFilter] = useState<'all' | 'waiting' | 'mine' | 'active'>('all');
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
  const conversationsRef = useRef<Conversation[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  const isOptimisticPending = useRef(false);
  const actionInitiatedConvId = useRef<string | null>(null);
  const stickerRef = useRef<HTMLDivElement>(null);

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

  // Auto-scroll quando histórico muda
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selected?.history?.length]);

  const [realtimeOk, setRealtimeOk] = useState(false);

  // Helper para disparar atualização imediata na badge do menu
  const triggerNavUpdate = () => window.dispatchEvent(new Event('whatsapp_state_changed'));

  // ── Carregar conversas (merge silencioso, sem piscar) ───────────────────────
  const fetchConversations = useCallback(async (silent = false) => {
    if (isOptimisticPending.current) return; // Não sobresscrever estado otimista com dados velhos do DB
    
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('*, customers(name, document), users(name)')
      .order('last_message_at', { ascending: false })
      .limit(50);
    if (data) {
      setConversations(prev => {
        // Detectar novas mensagens para tocar som/notificações
        const next = (data as Conversation[]).map(updated => {
          const existing = prev.find(c => c.id === updated.id);
          if (!existing) return updated;

          // Preservar mensagens otimistas locais que ainda não chegaram do servidor
          // (mensagens do agente com timestamp mais recente que a última do servidor)
          const serverHistoryLen = updated.history?.length || 0;
          const localHistoryLen = existing.history?.length || 0;
          let mergedHistory = updated.history || [];
          if (localHistoryLen > serverHistoryLen) {
            const localOnlyMsgs = (existing.history || []).slice(serverHistoryLen);
            // Só mantém as mensagens locais se forem do tipo 'agent' (otimistas)
            const optimisticOnly = localOnlyMsgs.filter(m => m.role === 'agent');
            mergedHistory = [...mergedHistory, ...optimisticOnly];
          }

          const newMsgs = serverHistoryLen > (prev.find(c => c.id === updated.id)?.history?.length || 0)
            ? (updated.history || []).slice(prev.find(c => c.id === updated.id)?.history?.length || 0)
            : [];
          
          const hasUserMsg = newMsgs.some((m: Message) => m.role === 'user');
          
          const justAskedForHuman = updated.state === 'WAITING_HUMAN' && existing.state !== 'WAITING_HUMAN';
          const userMsgWhileHuman = hasUserMsg && (updated.state === 'WAITING_HUMAN' || updated.state === 'HUMAN_ACTIVE');
          
          // Se fui eu que iniciei a ação, não devo receber notificação de que foi transferido para mim
          const isMyOwnAction = actionInitiatedConvId.current === updated.id;
          const justAssignedToMe = !isMyOwnAction && updated.assigned_agent_id === currentUserId && existing.assigned_agent_id !== currentUserId && currentUserId !== null && updated.state === 'HUMAN_ACTIVE';

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
              const previewMsg = newMsgs.find(m => m.role === 'user')?.content || 'Cliente solicitou atendimento.';
              const preview = String(previewMsg).substring(0, 60);
              sendBrowserNotification('💬 Duno WhatsApp', `${updated.phone_number}: ${preview}`);
              setToast(justAskedForHuman ? '⚠️ Cliente pediu atendimento humano!' : '💬 Nova mensagem do cliente!');
              setTimeout(() => setToast(null), 5000);
            }
          }

          return { ...updated, history: mergedHistory };
        });
        return next;
      });
    }
    if (!silent) setLoading(false);
  }, [currentUserId]);

  // ── Realtime subscription + polling fallback ─────────────────────────────
  useEffect(() => {
    fetchConversations();

    // POLLING: Sempre ativo a cada 3s — garante entrega mesmo sem Realtime
    const pollInterval = setInterval(() => fetchConversations(true), 3000);

    // REALTIME: atualiza ainda mais rápido quando funcionar
    const channel = supabase
      .channel('whatsapp-inbox-v4')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations',
      }, () => {
        // Quando chega evento realtime, recarregar imediatamente
        fetchConversations(true);
      })
      .subscribe((status) => {
        console.log('[Realtime] Status:', status);
        setRealtimeOk(status === 'SUBSCRIBED');
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

  const handleSend = () => {
    if (!message.trim() || !selected || sendingAction !== null) return;
    const txt = message;
    setMessage('');

    // ✨ Update otimista: mensagem aparece instantaneamente na tela
    const optimisticMsg: Message = {
      role: 'agent',
      content: txt,
      timestamp: new Date().toISOString(),
      agent_id: currentUserId || undefined,
      agent_name: currentUserName,
    };
    setConversations(prev => prev.map(c => {
      if (c.id !== selected.id) return c;
      return { ...c, history: [...(c.history || []), optimisticMsg], last_message_at: new Date().toISOString() };
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
    setSendingAction('sticker');
    setShowStickers(false);

    const optimisticMsg: Message = {
      role: 'agent',
      content: '[✨ Figurinha Enviada]',
      timestamp: new Date().toISOString(),
    };
    
    setConversations(prev => prev.map(c => {
      if (c.id !== selected.id) return c;
      return { ...c, history: [...(c.history || []), optimisticMsg], last_message_at: new Date().toISOString() };
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
    // Ocultar conversas encerradas (RESOLVED) — histórico preservado no banco
    if (c.state === 'RESOLVED') return false;

    if (filter === 'waiting' && c.state !== 'WAITING_HUMAN') return false;
    if (filter === 'mine' && (c.state !== 'HUMAN_ACTIVE' || c.assigned_agent_id !== currentUserId)) return false;
    if (filter === 'active' && c.state !== 'HUMAN_ACTIVE') return false;

    if (inboxSearch.trim()) {
      const q = inboxSearch.toLowerCase().trim();
      const matchPhone = c.phone_number?.includes(q) || false;
      const matchName = c.customers?.name?.toLowerCase().includes(q) || c.users?.name?.toLowerCase().includes(q) || false;
      const matchHistory = c.history?.some(h => h.content?.toLowerCase().includes(q));
      if (!matchPhone && !matchName && !matchHistory) return false;
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
          className="absolute top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-indigo-600 text-white rounded-full shadow-2xl"
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
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-3 border-b border-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle size={18} className="text-emerald-500" />
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-tight">WhatsApp Inbox</h2>
            <div className="ml-auto flex items-center gap-1.5" title={realtimeOk ? 'Tempo real ativo' : 'Modo polling (3s)'}>
              <div className={`w-2 h-2 rounded-full ${realtimeOk ? 'bg-emerald-400 animate-pulse' : 'bg-yellow-400'}`} />
              <span className="text-[9px] text-gray-400 font-medium">{realtimeOk ? 'Ao vivo' : 'Polling'}</span>
            </div>
            {waitingCount > 0 && (
              <span className="bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                {waitingCount}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {(['all', 'waiting', 'mine', 'active'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 text-[10px] font-bold uppercase py-1 rounded-lg transition-all ${
                  filter === f ? 'bg-[#1c2d4f] text-white' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {f === 'all' ? 'Todos' : f === 'waiting' ? '⚠ Aguarda' : f === 'mine' ? 'Meus' : '👤 Outros'}
              </button>
            ))}
          </div>

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

        <div className="flex-1 overflow-y-auto">
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
          {filtered.map(conv => {
            const stateInfo = STATE_LABELS[conv.state] || STATE_LABELS['GREETING'];
            const history = conv.history || [];
            const lastMsg = history[history.length - 1];
            const customerName = conv.customers?.name;
            const isSelected = selectedId === conv.id;
            const unreadCount = history.length - (readIndex[conv.id] || 0);
            const isUnread = !isSelected && unreadCount > 0 && lastMsg?.role === 'user';
            
            return (
              <button
                key={conv.id}
                onClick={() => {
                  setSelectedId(conv.id);
                  setReadIndex(prev => ({ ...prev, [conv.id]: history.length }));
                }}
                className={`w-full text-left p-3 border-b border-gray-50 hover:bg-gray-50 transition-all ${
                  isSelected ? 'bg-emerald-50 border-l-2 border-l-emerald-400' : isUnread ? 'bg-emerald-50/30' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${stateInfo.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className={`text-xs font-bold truncate ${isUnread ? 'text-emerald-700' : 'text-gray-800'}`}>
                        {customerName || formatPhone(conv.phone_number)}
                      </p>
                      <span className="text-[9px] text-gray-400 flex-shrink-0">{timeAgo(conv.last_message_at)}</span>
                    </div>
                    {!customerName && <p className="text-[10px] text-gray-400">{formatPhone(conv.phone_number)}</p>}
                    <p className={`text-[10px] font-medium ${stateInfo.color}`}>
                      {conv.state === 'HUMAN_ACTIVE' && conv.users?.name ? `👤 Em atendimento pelo: ${conv.users.name.split(' ')[0]}` : conv.state === 'RESOLVED' && conv.users?.name ? `✅ Finalizado por: ${conv.users.name.split(' ')[0]}` : stateInfo.label}
                    </p>
                    {lastMsg && (
                      <p className={`text-xs truncate w-full ${isUnread ? 'text-emerald-600 font-semibold' : 'text-slate-500'}`}>
                        {isUnread && <span className="mr-1 text-[8px] bg-emerald-500 text-white px-1.5 py-0.5 rounded-full animate-pulse">NOVA</span>}
                        {lastMsg.role === 'bot' ? '🤖' : lastMsg.role === 'agent' ? '👤' : '💬'} {String(lastMsg.content || '').substring(0, 50)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Coluna direita: janela de chat ── */}
      {selected ? (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-100 p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-800">
                  {selected.customers?.name || formatPhone(selected.phone_number)}
                </p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  selected.state === 'WAITING_HUMAN' ? 'bg-orange-50 text-orange-500 border-orange-200' :
                  selected.state === 'HUMAN_ACTIVE'  ? 'bg-indigo-50 text-indigo-500 border-indigo-200' :
                  selected.state.includes('FOUND') || selected.state.includes('VIEWING') ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                  'bg-gray-50 text-gray-400 border-gray-200'
                }`}>
                  {STATE_LABELS[selected.state]?.label || selected.state}
                </span>
                {selected.state === 'HUMAN_ACTIVE' && selected.users?.name && (
                  <span className="text-[10px] font-medium text-slate-500 ml-1">
                    Em atendimento pelo: <strong className="text-slate-700">{selected.users.name}</strong>
                  </span>
                )}
                {selected.state === 'RESOLVED' && selected.users?.name && (
                  <span className="text-[10px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full mt-1 w-fit">
                    Finalizado por: <strong className="text-slate-700">{selected.users.name}</strong> em {new Date(selected.last_message_at).toLocaleString('pt-BR')}
                  </span>
                )}
              </div>
              <p className="text-[10px] text-gray-400">
                <Phone size={10} className="inline mr-1" />{formatPhone(selected.phone_number)}
                {selected.customers?.document && ` · Doc: ${selected.customers.document}`}
              </p>
            </div>
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {(selected.state !== 'HUMAN_ACTIVE' || selected.assigned_agent_id !== currentUserId) && (
                <button
                  onClick={handleTakeover}
                  disabled={sendingAction !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1c2d4f] text-white text-[11px] font-bold rounded-xl hover:bg-[#2a4376] disabled:opacity-50 transition-all shadow-sm border border-[#1c2d4f]"
                >
                  {sendingAction === 'takeover' ? <RefreshCw size={14} className="animate-spin" /> : <UserCheck size={14} />} {selected.state === 'HUMAN_ACTIVE' ? 'Assumir p/ Mim' : 'Assumir Conversa'}
                </button>
              )}
              {selected.state !== 'HUMAN_ACTIVE' && (
                <button
                  onClick={() => setShowResetConfirm(true)}
                  disabled={sendingAction !== null}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white text-slate-600 text-[11px] font-bold rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-all border border-slate-200 shadow-sm"
                >
                  {sendingAction === 'reset' ? <RefreshCw size={14} className="animate-spin" /> : <RotateCcw size={14} />} Reiniciar Bot
                </button>
              )}
              {selected.state === 'HUMAN_ACTIVE' && selected.assigned_agent_id === currentUserId && (
                <>
                  <div className="relative">
                    <button
                      onClick={() => setTransferModal(transferModal === selected.id ? null : selected.id)}
                      disabled={sendingAction !== null}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 text-[11px] font-bold rounded-xl hover:bg-indigo-100 disabled:opacity-50 transition-all border border-indigo-200 shadow-sm"
                    >
                      {sendingAction === 'transfer' ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRight size={14} />} Transferir
                    </button>
                    {transferModal === selected.id && (
                      <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-100 shadow-xl rounded-xl z-50 overflow-hidden">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex flex-col gap-2">
                          <p className="text-[10px] font-bold text-gray-500 uppercase">Selecione o agente</p>
                          <div className="relative">
                            <input
                              type="text"
                              placeholder="Pesquisar agente..."
                              value={agentSearch}
                              onChange={(e) => setAgentSearch(e.target.value)}
                              className="w-full px-2 py-1 bg-white border border-gray-200 rounded text-[10px] focus:ring-1 focus:ring-indigo-500 outline-none"
                              autoFocus
                            />
                          </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                          {teamMembers.filter(m => m.id !== currentUserId && (m.name || '').toLowerCase().includes(agentSearch.toLowerCase())).length === 0 && (
                            <p className="px-3 py-4 text-xs text-gray-400 text-center">Nenhum agente encontrado</p>
                          )}
                          {teamMembers.filter(m => m.id !== currentUserId && (m.name || '').toLowerCase().includes(agentSearch.toLowerCase())).map(m => (
                            <button
                              key={m.id}
                              onClick={() => {
                                handleTransfer(m.id);
                                setAgentSearch('');
                              }}
                              className="w-full text-left px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border-b border-gray-50 last:border-0"
                            >
                              {m.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleReturnToBot}
                    disabled={sendingAction !== null}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 text-emerald-700 text-[11px] font-bold rounded-xl hover:bg-emerald-100 disabled:opacity-50 transition-all border border-emerald-200 shadow-sm"
                  >
                    {sendingAction === 'return_to_bot' ? <RefreshCw size={14} className="animate-spin" /> : <Bot size={14} />} Devolver ao Bot
                  </button>
                </>
              )}
              {/* Encerrar Atendimento agora sempre visível (se não estiver encerrado) */}
              <button
                onClick={handleCloseConversation}
                disabled={sendingAction !== null}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 text-rose-700 text-[11px] font-bold rounded-xl hover:bg-rose-100 disabled:opacity-50 transition-all border border-rose-200 shadow-sm"
              >
                {sendingAction === 'close' ? <RefreshCw size={14} className="animate-spin" /> : <X size={14} />} Encerrar
              </button>

              <button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 ml-1">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
            {(!selected.history || selected.history.length === 0) && (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <MessageCircle size={40} />
                <p className="text-xs mt-2">Nenhuma mensagem ainda</p>
              </div>
            )}
            {(selected.history || []).map((msg, i) => {
              const isFromMe = msg.role === 'agent' || msg.role === 'bot';
              return (
                <div
                  key={i}
                  className={`flex gap-2 items-end ${isFromMe ? 'justify-end' : 'justify-start'}`}
                >
                  {/* Avatar esquerda — apenas cliente */}
                  {!isFromMe && (
                    <div className="w-7 h-7 rounded-full bg-slate-300 flex items-center justify-center flex-shrink-0 shadow-sm flex-shrink-0">
                      <User size={14} className="text-slate-600" />
                    </div>
                  )}

                  {/* Balão */}
                  <div className={`max-w-[72%] px-3.5 py-2.5 text-xs leading-relaxed shadow-sm ${
                    msg.role === 'agent'
                      ? 'bg-emerald-800 text-white rounded-2xl rounded-br-sm'
                      : msg.role === 'bot'
                      ? 'bg-violet-700 text-white rounded-2xl rounded-bl-sm'
                      : 'bg-blue-800 text-white rounded-2xl rounded-bl-sm'
                  }`}>
                    {/* Nome — apenas para o remetente correto */}
                    {msg.role === 'user' && (
                      <p className="text-[10px] font-semibold text-blue-200 mb-1 tracking-wide">
                        {formatPhone(selected.phone_number)}
                      </p>
                    )}
                    {msg.role === 'agent' && (
                      <p className="text-[10px] font-semibold text-emerald-200 mb-1 tracking-wide uppercase">
                        👤 {msg.agent_name || (msg.agent_id ? teamMembers.find(m => m.id === msg.agent_id)?.name : null) || selected.users?.name || currentUserName}
                      </p>
                    )}
                    {msg.role === 'bot' && (
                      <p className="text-[10px] font-semibold text-emerald-200 mb-1 tracking-wide uppercase">
                        🤖 Assistente Virtual
                      </p>
                    )}

                    {(() => {
                      const content = msg.content || '';
                      if (content.startsWith('MEDIA_URL:')) {
                        const withoutPrefix = content.replace('MEDIA_URL:', '');
                        const colonIdx = withoutPrefix.indexOf(':');
                        const mediaType = withoutPrefix.substring(0, colonIdx);
                        const rest = withoutPrefix.substring(colonIdx + 1);
                        const pipeIdx = rest.lastIndexOf('|');
                        const mediaUrl = pipeIdx >= 0 ? rest.substring(0, pipeIdx) : rest;
                        const caption = pipeIdx >= 0 ? rest.substring(pipeIdx + 1) : '';
                        const isLight = isFromMe;
                        const textColor = isLight ? 'text-white/60' : 'text-slate-400';

                        if ((mediaType === 'image' || mediaType === 'sticker') && mediaUrl) {
                          return (
                            <div className="space-y-1">
                              <img
                                src={mediaUrl}
                                alt={caption || 'Imagem'}
                                className="max-w-[220px] rounded-xl object-cover cursor-pointer hover:opacity-90 transition-opacity border border-white/10"
                                onClick={() => window.open(mediaUrl, '_blank')}
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
                              {caption && <p className={`text-[10px] italic ${textColor}`}>{caption}</p>}
                            </div>
                          );
                        }
                        if (mediaType === 'audio' && mediaUrl) {
                          return (
                            <div className="flex items-center gap-2 py-1">
                              <Mic size={16} className={isLight ? 'text-white/70' : 'text-indigo-400'} />
                              <audio controls src={mediaUrl} className="h-8" style={{ width: '180px' }} />
                            </div>
                          );
                        }
                        if (mediaType === 'video' && mediaUrl) {
                          return (
                            <div className="space-y-1">
                              <video src={mediaUrl} controls className="max-w-[220px] rounded-xl" style={{ maxHeight: '160px' }} />
                              {caption && <p className={`text-[10px] italic ${textColor}`}>{caption}</p>}
                            </div>
                          );
                        }
                        if (mediaType === 'document') {
                          const fileName = caption || mediaUrl.split('/').pop() || 'Documento';
                          return (
                            <a href={mediaUrl || '#'} target="_blank" rel="noopener noreferrer"
                               className={`flex items-center gap-2 p-2 rounded-lg hover:opacity-80 transition-opacity ${isLight ? 'bg-white/10' : 'bg-slate-100'}`}>
                              <FileText size={16} className={isLight ? 'text-white' : 'text-indigo-500'} />
                              <span className={`text-[11px] font-medium truncate max-w-[150px] ${isLight ? 'text-white' : 'text-slate-700'}`}>{fileName}</span>
                              {mediaUrl && <Download size={12} className={isLight ? 'text-white/70' : 'text-slate-400'} />}
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
                      return <p className="whitespace-pre-wrap">{content}</p>;
                    })()}

                    <p className={`text-[9px] mt-1 ${isFromMe ? 'text-white/50 text-right' : 'text-slate-400'}`}>
                      {new Date(msg.timestamp).toLocaleDateString('pt-BR')} às {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  {/* Avatar do Agente/Bot (direita) */}
                  {isFromMe && (
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${msg.role === 'bot' ? 'bg-emerald-100' : 'bg-indigo-100'}`}>
                      {msg.role === 'bot' ? <Bot size={14} className="text-emerald-600" /> : <User size={14} className="text-indigo-600" />}
                    </div>
                  )}
                </div>
              );
            })}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          {selected.state === 'HUMAN_ACTIVE' ? (
            <div className="bg-white border-t border-slate-100 p-4 relative shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
              
              {/* Emoji Popover */}
              {showStickers && (
                <div
                  ref={stickerRef}
                  className="absolute bottom-full mb-2 left-4 bg-white border border-slate-200 shadow-xl rounded-2xl p-3 z-50 w-72 animate-in slide-in-from-bottom-2"
                >
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-600">Emojis Rápidos</p>
                    <button onClick={() => setShowStickers(false)} className="text-slate-400 hover:text-slate-600">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-8 gap-1 h-36 overflow-y-auto custom-scrollbar pr-1">
                    {DEFAULT_EMOJIS.map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => setMessage(prev => prev + emoji)}
                        className="text-xl hover:bg-slate-100 rounded p-1 transition-colors flex items-center justify-center"
                        disabled={sendingAction !== null}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-end gap-3 bg-slate-50 border border-slate-200 rounded-3xl pr-2 pl-2 py-2 focus-within:ring-2 focus-within:ring-emerald-500/20 focus-within:border-emerald-400 transition-all shadow-inner">
                <button
                  onClick={() => setShowStickers(!showStickers)}
                  className={`w-9 h-9 mb-0.5 flex items-center justify-center rounded-full transition-colors shrink-0 ${showStickers ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}
                  title="Inserir Emoji"
                >
                  <Sticker size={18} />
                </button>
                <textarea
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSend();
                      }
                  }}
                  rows={1}
                  placeholder="Digite sua mensagem (Shift + Enter para nova linha)..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400 py-1.5 resize-none custom-scrollbar"
                  style={{ minHeight: '36px', maxHeight: '120px' }}
                  onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = 'auto';
                      target.style.height = `${target.scrollHeight}px`;
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={sendingAction !== null || !message.trim()}
                  className="w-10 h-10 mb-0.5 flex items-center justify-center bg-emerald-500 text-white rounded-full hover:bg-emerald-600 disabled:opacity-50 transition-all shrink-0 shadow-md hover:shadow-lg active:scale-95"
                  title="Enviar (Enter)"
                >
                  {sendingAction === 'send' ? <RefreshCw size={18} className="animate-spin" /> : <Send size={18} className="ml-1" />}
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white border-t border-gray-100 p-3 text-center text-[11px] text-gray-400">
              {selected.state === 'WAITING_HUMAN'
                ? '⚠ Cliente aguardando — clique em "Assumir Conversa" para responder'
                : '🤖 Bot está gerenciando esta conversa'}
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
      {showResetConfirm && selected && (
        <div className="absolute inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-full flex items-center justify-center mb-4">
              <RotateCcw size={24} />
            </div>
            <h3 className="text-lg font-bold text-slate-800 mb-2">Reiniciar Bot?</h3>
            <p className="text-sm text-slate-500 mb-6">
              O bot de Inteligência Artificial assumirá esta conversa desde o início (estado de boas-vindas). O histórico de mensagens será mantido para consulta futura.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-bold rounded-xl transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleResetBot}
                className="px-4 py-2 bg-rose-500 hover:bg-rose-600 text-white text-sm font-bold rounded-xl transition-colors"
              >
                Sim, reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
};
