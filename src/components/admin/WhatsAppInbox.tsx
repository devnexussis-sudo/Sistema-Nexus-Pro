import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { MessageCircle, User, Bot, Phone, RefreshCw, Send, UserCheck, RotateCcw, X, BellRing, Bell, Volume2, ArrowRight, Sticker } from 'lucide-react';

interface Message {
  role: 'bot' | 'user' | 'agent';
  content: string;
  timestamp: string;
  agent_id?: string;
  type?: 'text' | 'sticker';
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

const DEFAULT_STICKERS = [
  { id: '1', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Smiling%20Face%20with%20Smiling%20Eyes.png', label: 'Sorriso' },
  { id: '2', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Hand%20gestures/Thumbs%20Up.png', label: 'Joinha' },
  { id: '3', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Hand%20gestures/Waving%20Hand.png', label: 'Olá' },
  { id: '4', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Smilies/Party%20Popper.png', label: 'Pronto!' },
  { id: '5', url: 'https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Hand%20gestures/Folded%20Hands.png', label: 'Obrigado' },
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
  const [teamMembers, setTeamMembers] = useState<{ id: string, name: string }[]>([]);
  const [transferModal, setTransferModal] = useState<string | null>(null);
  const [inboxSearch, setInboxSearch] = useState('');
  const [agentSearch, setAgentSearch] = useState('');
  const [readIndex, setReadIndex] = useState<Record<string, number>>({});
  const [showStickers, setShowStickers] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const conversationsRef = useRef<Conversation[]>([]);
  const selectedIdRef = useRef<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setCurrentUserId(data.user?.id || null));
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
    const { data } = await supabase
      .from('whatsapp_conversations')
      .select('*, customers(name, document), users(name)')
      .order('last_message_at', { ascending: false })
      .limit(50);
    if (data) {
      setConversations(prev => {
        // Detectar novas mensagens para tocar som/notificações
        (data as Conversation[]).forEach(updated => {
          const existing = prev.find(c => c.id === updated.id);
          if (existing) {
            const newMsgs = (updated.history?.length || 0) > (existing.history?.length || 0)
              ? updated.history.slice(existing.history!.length)
              : [];
            
            const hasUserMsg = newMsgs.some((m: Message) => m.role === 'user');
            
            // Só notifica se pediu humano AGORA, ou se mandou mensagem DEPOIS de pedir humano
            const justAskedForHuman = updated.state === 'WAITING_HUMAN' && existing.state !== 'WAITING_HUMAN';
            const userMsgWhileHuman = hasUserMsg && (updated.state === 'WAITING_HUMAN' || updated.state === 'HUMAN_ACTIVE');
            
            // Notificar transferência de conversa para mim
            const justAssignedToMe = updated.assigned_agent_id === currentUserId && existing.assigned_agent_id !== currentUserId && currentUserId !== null;

            if (justAskedForHuman || userMsgWhileHuman || justAssignedToMe) {
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
              }
              setTimeout(() => setToast(null), 5000);
            }
          }
        });
        return data as Conversation[];
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
    triggerNavUpdate();
    return true;
  };

  const handleTakeover = async () => {
    if (!selected) return;
    setSendingAction('takeover');
    try { await invoke('takeover'); } finally { setSendingAction(null); }
  };

  const handleReturnToBot = async () => {
    if (!selected) return;
    setSendingAction('return_to_bot');
    try { await invoke('return_to_bot'); } finally { setSendingAction(null); }
  };

  const handleCloseConversation = async () => {
    if (!selected) return;
    setSendingAction('close');
    try { await invoke('close_conversation'); } finally { setSendingAction(null); }
  };
  
  const handleResetBot = async () => {
    if (!selected) return;
    if (!confirm('Deseja realmente apagar o histórico e reiniciar o bot para este cliente?')) return;
    setSendingAction('reset');
    try { await invoke('reset_bot'); } finally { setSendingAction(null); }
  };

  const handleTransfer = async (targetUserId: string) => {
    setSendingAction('transfer');
    setTransferModal(null);
    try { await invoke('transfer', { target_user_id: targetUserId }); } finally { setSendingAction(null); }
  };

  const handleSend = async () => {
    const txt = message.trim();
    if (!selected || !txt) return;
    setSendingAction('send');
    setMessage('');

    // ✨ Update otimista: mensagem aparece instantaneamente na tela
    const optimisticMsg: Message = {
      role: 'agent',
      content: txt,
      timestamp: new Date().toISOString(),
    };
    setConversations(prev => prev.map(c => {
      if (c.id !== selected.id) return c;
      return { ...c, history: [...(c.history || []), optimisticMsg], last_message_at: new Date().toISOString() };
    }));

    try {
      await invoke('send', { message: txt });
    } catch {
      // Se falhar, desfazer o optimistic update
      setConversations(prev => prev.map(c => {
        if (c.id !== selected.id) return c;
        return { ...c, history: (c.history || []).filter(m => m !== optimisticMsg) };
      }));
      setMessage(txt); // restaurar texto
    } finally {
      setSendingAction(null);
    }
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
      await invoke('send_sticker', { message: url });
    } catch {
      setConversations(prev => prev.map(c => {
        if (c.id !== selected.id) return c;
        return { ...c, history: (c.history || []).filter(m => m !== optimisticMsg) };
      }));
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
                      {conv.state === 'HUMAN_ACTIVE' && conv.users?.name ? `👤 Atendido por: ${conv.users.name.split(' ')[0]}` : stateInfo.label}
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
                    Atendido por: <strong className="text-slate-700">{selected.users.name}</strong>
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
                  onClick={handleResetBot}
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
            {(selected.history || []).map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role !== 'user' && (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm ${
                    msg.role === 'bot' ? 'bg-emerald-100' : 'bg-indigo-100'
                  }`}>
                    {msg.role === 'bot' ? <Bot size={14} className="text-emerald-600" /> : <User size={14} className="text-indigo-600" />}
                  </div>
                )}
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-xs leading-relaxed shadow-sm ${
                  msg.role === 'user'
                    ? 'bg-[#1c2d4f] text-white rounded-tr-sm'
                    : msg.role === 'agent'
                    ? 'bg-indigo-600 text-white rounded-tl-sm'
                    : 'bg-white text-slate-800 border border-slate-200 rounded-tl-sm'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-[9px] mt-1 flex flex-wrap gap-1 ${msg.role === 'user' || msg.role === 'agent' ? 'text-white/60' : 'text-slate-400'}`}>
                    <span>{new Date(msg.timestamp).toLocaleDateString('pt-BR')} às {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                    <span>· {msg.role === 'bot' ? 'Bot' : msg.role === 'agent' ? 'Agente' : 'Cliente'}</span>
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                    <User size={14} className="text-slate-500" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input */}
          {selected.state === 'HUMAN_ACTIVE' ? (
            <div className="bg-white border-t border-slate-100 p-4 relative shadow-[0_-4px_10px_rgba(0,0,0,0.02)]">
              
              {/* Sticker Popover */}
              {showStickers && (
                <div className="absolute bottom-full mb-2 left-4 bg-white border border-slate-200 shadow-xl rounded-2xl p-3 z-50 w-64 animate-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-600">Figurinhas Rápidas</p>
                    <button onClick={() => setShowStickers(false)} className="text-slate-400 hover:text-slate-600">
                      <X size={14} />
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {DEFAULT_STICKERS.map(sticker => (
                      <button
                        key={sticker.id}
                        onClick={() => handleSendSticker(sticker.url)}
                        className="p-1 hover:bg-slate-50 rounded-xl transition-all border border-transparent hover:border-slate-200 group relative"
                        title={sticker.label}
                        disabled={sendingAction !== null}
                      >
                        <img src={sticker.url} alt={sticker.label} className="w-10 h-10 object-contain mx-auto group-hover:scale-110 transition-transform" />
                        <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[9px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 whitespace-nowrap pointer-events-none z-10">
                          {sticker.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-full pr-2 pl-2 py-1.5 focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-400 transition-all shadow-inner">
                <button
                  onClick={() => setShowStickers(!showStickers)}
                  className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0 ${showStickers ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400 hover:bg-slate-200 hover:text-slate-600'}`}
                  title="Enviar Figurinha"
                >
                  <Sticker size={18} />
                </button>
                <input
                  type="text"
                  value={message}
                  onChange={e => setMessage(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                  placeholder="Digite sua mensagem..."
                  className="flex-1 bg-transparent border-none outline-none text-sm text-slate-700 placeholder-slate-400 py-2"
                />
                <button
                  onClick={handleSend}
                  disabled={sendingAction !== null || !message.trim()}
                  className="w-10 h-10 flex items-center justify-center bg-[#1c2d4f] text-white rounded-full hover:bg-[#2a4376] disabled:opacity-50 transition-all shrink-0 shadow-md"
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

      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateX(-50%) translateY(-16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>
    </div>
  );
};
