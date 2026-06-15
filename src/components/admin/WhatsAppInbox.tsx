import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { MessageCircle, User, Bot, Clock, Phone, CheckCircle, AlertCircle, RefreshCw, Send, UserCheck, RotateCcw, X } from 'lucide-react';

interface Message {
  role: 'bot' | 'user' | 'agent';
  content: string;
  timestamp: string;
  agent_id?: string;
}

interface Conversation {
  id: string;
  phone_number: string;
  state: string;
  history: Message[];
  last_message_at: string;
  customer_id: string | null;
  assigned_agent_id: string | null;
  customers?: { name: string; trading_name?: string; document?: string } | null;
  users?: { name: string } | null;
}

const STATE_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  GREETING:       { label: 'Iniciando',        color: 'text-gray-400',   dot: 'bg-gray-300' },
  IDENTIFYING:    { label: 'Identificando',    color: 'text-yellow-500', dot: 'bg-yellow-400' },
  CUSTOMER_FOUND: { label: 'Bot ativo',        color: 'text-emerald-600',dot: 'bg-emerald-400' },
  VIEWING_ORDERS: { label: 'Bot ativo',        color: 'text-emerald-600',dot: 'bg-emerald-400' },
  CREATING_ORDER: { label: 'Abrindo OS',       color: 'text-blue-500',   dot: 'bg-blue-400' },
  WAITING_HUMAN:  { label: '⚠ Aguarda humano', color: 'text-orange-500', dot: 'bg-orange-400 animate-pulse' },
  HUMAN_ACTIVE:   { label: 'Humano ativo',     color: 'text-indigo-600', dot: 'bg-indigo-400' },
  RESOLVED:       { label: 'Resolvido',        color: 'text-gray-400',   dot: 'bg-gray-300' },
};

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

export const WhatsAppInbox: React.FC = () => {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<Conversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [filter, setFilter] = useState<'all' | 'waiting' | 'active'>('all');

  const fetchConversations = async () => {
    const { data, error } = await supabase
      .from('whatsapp_conversations')
      .select('*, customers(name, trading_name, document), users(name)')
      .order('last_message_at', { ascending: false })
      .limit(50);
    
    if (error) console.error('Erro ao carregar conversas:', error);
    if (data) setConversations(data as Conversation[]);
    setLoading(false);
  };

  useEffect(() => {
    fetchConversations();

    // Realtime subscription
    const channel = supabase
      .channel('whatsapp-inbox')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'whatsapp_conversations',
      }, (payload) => {
        fetchConversations();
        // Update selected conversation if it's the one that changed
        if (selected && payload.new && (payload.new as any).id === selected.id) {
          setSelected(payload.new as Conversation);
        }
        // Sound notification for WAITING_HUMAN
        if ((payload.new as any)?.state === 'WAITING_HUMAN') {
          try { new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAA==').play(); } catch {}
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selected?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selected?.history]);

  const handleTakeover = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke('whatsapp-admin-send', {
        body: { conversation_id: selected.id, action: 'takeover' },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      await fetchConversations();
    } finally { setSending(false); }
  };

  const handleReturnToBot = async () => {
    if (!selected) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke('whatsapp-admin-send', {
        body: { conversation_id: selected.id, action: 'return_to_bot' },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      await fetchConversations();
    } finally { setSending(false); }
  };

  const handleSend = async () => {
    if (!selected || !message.trim()) return;
    setSending(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      await supabase.functions.invoke('whatsapp-admin-send', {
        body: { conversation_id: selected.id, action: 'send', message: message.trim() },
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      setMessage('');
      await fetchConversations();
    } finally { setSending(false); }
  };

  const filtered = conversations.filter(c => {
    if (filter === 'waiting') return c.state === 'WAITING_HUMAN';
    if (filter === 'active') return c.state === 'HUMAN_ACTIVE';
    return true;
  });

  const waitingCount = conversations.filter(c => c.state === 'WAITING_HUMAN').length;

  return (
    <div className="flex h-full bg-gray-50/30 rounded-2xl overflow-hidden border border-gray-100 shadow-xl">
      
      {/* ── Left: Conversation List ── */}
      <div className="w-72 flex-shrink-0 bg-white border-r border-gray-100 flex flex-col">
        <div className="p-3 border-b border-gray-50">
          <div className="flex items-center gap-2 mb-3">
            <MessageCircle size={18} className="text-emerald-500" />
            <h2 className="text-sm font-bold text-gray-800 uppercase tracking-tight">WhatsApp Inbox</h2>
            {waitingCount > 0 && (
              <span className="ml-auto bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full animate-pulse">
                {waitingCount}
              </span>
            )}
          </div>
          <div className="flex gap-1">
            {(['all', 'waiting', 'active'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`flex-1 text-[10px] font-bold uppercase py-1 rounded-lg transition-all ${
                  filter === f ? 'bg-[#1c2d4f] text-white' : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {f === 'all' ? 'Todos' : f === 'waiting' ? '⚠ Aguardando' : '👤 Humano'}
              </button>
            ))}
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
            const lastMsg = conv.history[conv.history.length - 1];
            const customerName = conv.customers?.trading_name || conv.customers?.name;
            return (
              <button
                key={conv.id}
                onClick={() => setSelected(conv)}
                className={`w-full text-left p-3 border-b border-gray-50 hover:bg-gray-50 transition-all ${
                  selected?.id === conv.id ? 'bg-emerald-50 border-l-2 border-l-emerald-400' : ''
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${stateInfo.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p className="text-xs font-bold text-gray-800 truncate">
                        {customerName || formatPhone(conv.phone_number)}
                      </p>
                      <span className="text-[9px] text-gray-400 flex-shrink-0">{timeAgo(conv.last_message_at)}</span>
                    </div>
                    {!customerName && <p className="text-[10px] text-gray-400">{formatPhone(conv.phone_number)}</p>}
                    <p className={`text-[10px] font-medium ${stateInfo.color}`}>{stateInfo.label}</p>
                    {lastMsg && (
                      <p className="text-[10px] text-gray-400 truncate mt-0.5">
                        {lastMsg.role === 'bot' ? '🤖' : lastMsg.role === 'agent' ? '👤' : '💬'} {lastMsg.content.substring(0, 50)}
                      </p>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Right: Chat Window ── */}
      {selected ? (
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="bg-white border-b border-gray-100 p-3 flex items-center gap-3">
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold text-gray-800">
                  {selected.customers?.trading_name || selected.customers?.name || formatPhone(selected.phone_number)}
                </p>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  STATE_LABELS[selected.state]?.dot.includes('orange') ? 'bg-orange-50 text-orange-500 border-orange-200' :
                  STATE_LABELS[selected.state]?.dot.includes('indigo') ? 'bg-indigo-50 text-indigo-500 border-indigo-200' :
                  STATE_LABELS[selected.state]?.dot.includes('emerald') ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                  'bg-gray-50 text-gray-400 border-gray-200'
                }`}>
                  {STATE_LABELS[selected.state]?.label || selected.state}
                </span>
              </div>
              <p className="text-[10px] text-gray-400">
                <Phone size={10} className="inline mr-1" />{formatPhone(selected.phone_number)}
                {selected.customers?.document && ` · Doc: ${selected.customers.document}`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {selected.state === 'WAITING_HUMAN' && (
                <button
                  onClick={handleTakeover}
                  disabled={sending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-[11px] font-bold rounded-xl hover:bg-indigo-700 transition-all"
                >
                  <UserCheck size={14} /> Assumir Conversa
                </button>
              )}
              {selected.state === 'HUMAN_ACTIVE' && (
                <button
                  onClick={handleReturnToBot}
                  disabled={sending}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 text-[11px] font-bold rounded-xl hover:bg-gray-200 transition-all"
                >
                  <RotateCcw size={14} /> Devolver ao Bot
                </button>
              )}
              <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/50">
            {selected.history.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <MessageCircle size={40} />
                <p className="text-xs mt-2">Nenhuma mensagem ainda</p>
              </div>
            )}
            {selected.history.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role !== 'user' && (
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
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
                    : 'bg-white text-gray-800 border border-gray-100 rounded-tl-sm'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                  <p className={`text-[9px] mt-1 ${msg.role === 'user' || msg.role === 'agent' ? 'text-white/60' : 'text-gray-400'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    {msg.role === 'bot' && ' · Bot'}
                    {msg.role === 'agent' && ' · Agente'}
                  </p>
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0">
                    <User size={14} className="text-gray-500" />
                  </div>
                )}
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>

          {/* Input — only when agent is active */}
          {selected.state === 'HUMAN_ACTIVE' ? (
            <div className="bg-white border-t border-gray-100 p-3 flex gap-2">
              <input
                type="text"
                value={message}
                onChange={e => setMessage(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
                placeholder="Digite uma mensagem..."
                className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100"
              />
              <button
                onClick={handleSend}
                disabled={sending || !message.trim()}
                className="px-4 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:opacity-40 transition-all"
              >
                <Send size={16} />
              </button>
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
          <p className="text-xs">As conversas do WhatsApp aparecem aqui em tempo real</p>
        </div>
      )}
    </div>
  );
};
