import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, User, Sparkles, RefreshCw, BookOpen, Loader2, BrainCircuit } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { KnowledgeEntry } from '../../data/dunoKnowledge';
import { detectDataIntent, executeDataQuery } from '../../services/dunoQueryService';

import { analyzeAndDiscover } from '../../services/dunoBrain';

interface Message { id: string; role: 'user' | 'assistant'; content: string; isTyping?: boolean; }

// ── Aprendizado persistente ──
const LEARNED_KEY = 'duno_ia_learned';
const getLearnedEntries = (): KnowledgeEntry[] => { try { return JSON.parse(localStorage.getItem(LEARNED_KEY) || '[]'); } catch { return []; } };
const saveLearnedEntry = (entry: KnowledgeEntry) => { const c = getLearnedEntries(); c.push(entry); localStorage.setItem(LEARNED_KEY, JSON.stringify(c)); };

// ── Detecção de ensino ──
const detectTeaching = (text: string): { is: boolean; topic: string; info: string } => {
  const patterns = [
    /(?:saiba que|aprenda que|anota que|grava que|lembra que|registra que)\s+(.+)/i,
    /(?:quando alguém perguntar sobre|se perguntarem sobre)\s+(.+?)[\s,]+(?:responda|diga|fale)\s+(.+)/i,
    /(?:a funcionalidade de|o módulo de|a tela de)\s+(.+?)(?:\s+funciona assim|\s+serve para)\s*[:\s]+(.+)/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[2] ? { is: true, topic: m[1].trim(), info: m[2].trim() } : { is: true, topic: '', info: m[1].trim() };
  }
  const lower = text.toLowerCase();
  if (lower.includes('saiba que') || lower.includes('aprenda') || lower.includes('anota') || lower.includes('grava isso')) {
    return { is: true, topic: '', info: text };
  }
  return { is: false, topic: '', info: '' };
};

// ── Busca em Aprendizados ──
const searchLearned = (input: string): string | null => {
  const all = getLearnedEntries();
  if (all.length === 0) return null;
  const lower = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let best: KnowledgeEntry | null = null, bestScore = 0;
  for (const e of all) {
    let s = 0;
    for (const kw of e.keywords) { 
      const n = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); 
      if (new RegExp(`(^|\\b|\\s)${n}(\\b|\\s|$)`).test(lower)) s += n.length; 
    }
    if (s > bestScore) { bestScore = s; best = e; }
  }
  return best && bestScore >= 3 ? best.response : null;
};

// ── Detecção de perguntas pessoais/conversacionais ──
const detectPersonal = (text: string, fullName: string, firstName: string): string | null => {
  const l = text.toLowerCase();
  if (/(meu\s+nome|como\s+me\s+chamo|qual\s+(e|é)\s+meu\s+nome|quem\s+sou\s+eu)/i.test(l)) {
    return `Claro, ${firstName}! Seu nome completo é **${fullName}**. Você está logado no sistema com esse perfil. 😊`;
  }
  if (/^(obrigad|valeu|thanks|agradeç|tmj|brigad)/i.test(l.trim())) {
    const replies = [
      `De nada, ${firstName}! Fico feliz em ajudar. Se precisar de mais alguma coisa, estou aqui! 😊`,
      `Sempre às ordens, ${firstName}! Qualquer dúvida é só chamar. 👍`,
      `Disponha, ${firstName}! É pra isso que estou aqui. 🚀`,
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  if (/^(oi|olá|ola|hey|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+a[ií]|tudo\s+bem|hello|hi)\b/i.test(l.trim())) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return `${greeting}, ${firstName}! 👋 Como posso te ajudar hoje?\n\nPode me perguntar sobre qualquer módulo do sistema, ou até pedir um **resumo geral** com dados reais. Só mandar!`;
  }
  if (/(quem\s+(e|é)\s+voc[eê]|seu\s+nome|o\s+que\s+voc[eê]\s+faz|sobre\s+voc[eê])/i.test(l)) {
    return `Eu sou a **Duno IA**, ${firstName}! 🤖\n\nSou a inteligência artificial integrada ao sistema **Duno**. Posso:\n\n• 📊 **Consultar dados reais** — quantidade de OS, clientes, técnicos, garantias, etc.\n• 📖 **Explicar funcionalidades** — como criar OS, usar PMOC, configurar formulários...\n• 🧠 **Aprender** — me ensine algo novo com "Saiba que..." e eu memorizo!\n\nPergunte qualquer coisa!`;
  }
  return null;
};

// ── Markdown renderer ──
const renderMarkdown = (text: string) => text.split('\n').map((line, i) => {
  let html = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/_(.+?)_/g, '<em>$1</em>');
  if (html.trim().startsWith('•') || html.trim().startsWith('—')) return <p key={i} className="pl-3 py-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
  if (/^\d+\./.test(html.trim())) return <p key={i} className="pl-3 py-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
  if (/^\s{2}•/.test(html)) return <p key={i} className="pl-6 py-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
  if (!html.trim()) return <div key={i} className="h-2" />;
  return <p key={i} className="py-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
});

export const AIAgent: React.FC = () => {
  const { auth } = useAuth();
  const fullName = auth.user?.name || 'Usuário';
  const firstName = fullName.split(' ')[0];

  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant',
      content: `Olá, **${firstName}**! 👋 Sou a **Duno IA**, sua assistente inteligente do sistema Duno.\n\nPosso **consultar dados reais** do sistema e te ajudar com qualquer dúvida. Experimente:\n\n• "Quantas OS tenho?"\n• "Resumo geral do sistema"\n• "Como criar uma OS ou Cadastrar um Técnico?"\n\nComo posso te ajudar, ${firstName}?` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [learnedCount, setLearnedCount] = useState(getLearnedEntries().length);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    const typingId = 'typing-' + Date.now();
    setMessages(p => [...p, userMsg, { id: typingId, role: 'assistant', content: '', isTyping: true }]);
    setInput('');
    setIsLoading(true);
    if (taRef.current) taRef.current.style.height = '52px';

    let response: string = '';

    try {
      await new Promise(r => setTimeout(r, 1500));

      // 1️⃣ Perguntas pessoais
      const personal = detectPersonal(userMsg.content, fullName, firstName);
      if (personal) {
        response = personal;

      // 2️⃣ Ensino / aprendizado
      } else if (detectTeaching(userMsg.content).is) {
        const teaching = detectTeaching(userMsg.content);
        const keywords = teaching.topic
          ? teaching.topic.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2)
          : userMsg.content.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3).slice(0, 5);
        saveLearnedEntry({ keywords, response: teaching.info || userMsg.content });
        setLearnedCount(getLearnedEntries().length);
        response = `Anotado, ${firstName}! ✅ Aprendi essa informação e vou lembrar nas próximas conversas.\n\n**Palavras-chave:** ${keywords.join(', ')}\n\nPode me ensinar mais coisas quando quiser!`;

      // 3️⃣ Consultas de dados (Data Intent)
      } else {
        const dataIntent = detectDataIntent(userMsg.content);
        if (dataIntent) {
          response = await executeDataQuery(dataIntent, firstName);
        } else {
          // 4️⃣ Busca nos Aprendizados Persistentes
          const learnedRes = searchLearned(userMsg.content);
          if (learnedRes) {
            response = learnedRes.includes(firstName) ? learnedRes : `${firstName}, me ensinaram que: ${learnedRes}`;
          } else {
            // 5️⃣ Motor Principal de NLP (Duno Copilot Engine)
            const proc = await analyzeAndDiscover(userMsg.content);
            response = proc || `Não consegui processar isso agora, ${firstName}. Pode tentar novamente?`;
          }
        }
      }
    } catch (err) {
      console.error('[Duno IA] Error:', err);
      response = `${firstName}, desculpe, tive um problema interno ao processar sua pergunta. Pode tentar novamente? 🔄`;
    }

    setMessages(p => p.map(m => m.id === typingId ? { id: Date.now().toString(), role: 'assistant', content: response } : m));
    setIsLoading(false);
  }, [input, isLoading, firstName, fullName]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };
  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = '52px';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const suggestions = [
    'Resumo geral do sistema',
    'Quantos clientes cadastrados?',
    'Equipamentos em garantia?',
    'Como criar uma OS?',
  ];

  return (
    <div className="h-full flex flex-col bg-[#f8fafc] relative overflow-hidden">
      {/* ── Premium Background Grid Pattern (Pontos alinhados e leves) ── */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.15]" 
        style={{
          backgroundImage: 'radial-gradient(circle at center, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '24px 24px'
        }}
      />

      {/* ── Header ── */}
      <div className="bg-white/90 backdrop-blur-md border-b border-slate-200/60 px-5 py-3 flex items-center justify-between shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-[#1c2d4f] rounded-lg blur opacity-25 animate-pulse" />
            <div className="relative w-9 h-9 rounded-lg bg-gradient-to-br from-[#0f172a] to-[#1e3a8a] flex items-center justify-center text-white shadow-md border border-slate-800/50">
              <BrainCircuit size={18} className="text-blue-100" />
            </div>
          </div>
          <div>
            <h2 className="text-[15px] font-bold text-slate-800 flex items-center gap-2 tracking-tight">
              Duno IA
              <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 text-[9px] uppercase tracking-widest rounded-md font-bold shadow-sm">Copilot</span>
            </h2>
            <p className="text-[11px] font-medium text-slate-500 -mt-0.5">Inteligência Suprema do Sistema</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {learnedCount > 0 && (
            <span className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50/80 text-emerald-600 border border-emerald-200/50 rounded-lg text-[10px] font-bold shadow-sm backdrop-blur-sm">
              <BookOpen size={12} /> {learnedCount} memórias
            </span>
          )}
          <button onClick={() => setMessages([messages[0]])} className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all border border-slate-200/60 bg-white shadow-sm hover:shadow">
            <RefreshCw size={13} /> Reiniciar
          </button>
        </div>
      </div>

      {/* ── Chat Area ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar scroll-smooth relative z-0">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Suggestion Chips */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2.5 justify-center py-6">
              {suggestions.map(s => (
                <button key={s} onClick={() => { setInput(s); }} className="px-4 py-2.5 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-xl text-[12px] font-bold text-slate-600 hover:bg-gradient-to-r hover:from-[#1c2d4f] hover:to-[#2a4a7f] hover:border-transparent hover:text-white shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-0.5">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}>
              {msg.role === 'assistant' && (
                <div className="relative shrink-0 mt-1">
                  <div className="absolute -inset-1 bg-gradient-to-r from-blue-500 to-[#1c2d4f] rounded-xl blur opacity-20" />
                  <div className="relative w-9 h-9 rounded-xl bg-gradient-to-b from-[#1e293b] to-[#0f172a] flex items-center justify-center text-white shadow-lg border border-slate-700/50">
                    <Sparkles size={10} className="text-blue-300 animate-pulse absolute -top-1 -right-1 bg-[#0f172a] rounded-full p-0.5 border border-slate-700/80" />
                    <Bot size={18} className="text-slate-100" />
                  </div>
                </div>
              )}
              <div className={`max-w-[85%] rounded-2xl px-5 py-4 text-[13px] font-medium leading-relaxed shadow-sm ${
                msg.role === 'user'
                  ? 'bg-gradient-to-br from-[#1c2d4f] to-[#2a4a7f] text-white rounded-tr-sm border border-[#3b5d96]/30 shadow-md'
                  : 'bg-white border border-slate-200/80 text-slate-700 rounded-tl-sm hover:shadow-md transition-shadow duration-300'
              }`}>
                {msg.isTyping ? (
                  <div className="flex items-center gap-2.5 px-2">
                    <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                    <span className="text-[11px] text-slate-500 font-bold uppercase tracking-widest animate-pulse">Processando...</span>
                  </div>
                ) : (
                  <div className="prose prose-sm prose-slate max-w-none">{renderMarkdown(msg.content)}</div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="relative shrink-0 mt-1">
                  <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-700 shadow-inner border border-slate-300/60">
                    <User size={18} />
                  </div>
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {/* ── Input ── */}
      <div className="bg-white/80 backdrop-blur-md border-t border-slate-100 px-4 py-4 sm:px-6 shrink-0 z-10">
        <div className="max-w-2xl mx-auto relative">
          <textarea ref={taRef} value={input} onChange={handleInput} onKeyDown={handleKeyDown}
            placeholder={`Pergunte algo, ${firstName}...`}
            className="w-full bg-slate-50/50 border border-slate-200 rounded-xl pl-4 pr-12 py-3.5 text-[13px] font-medium text-slate-700 outline-none focus:bg-white focus:border-[#1c2d4f]/30 focus:ring-2 focus:ring-[#1c2d4f]/5 transition-all resize-none shadow-inner"
            rows={1} style={{ minHeight: '52px', maxHeight: '120px' }} />
          <button onClick={handleSend} disabled={!input.trim() || isLoading}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8.5 h-8.5 bg-[#1c2d4f] hover:bg-[#253a66] disabled:bg-slate-100 disabled:text-slate-400 text-white rounded-lg flex items-center justify-center transition-all shadow-md disabled:shadow-none">
            <Send size={14} />
          </button>
        </div>
        <p className="text-center text-[9px] font-bold text-slate-400 mt-2.5 uppercase tracking-wider">
          A Duno IA está sendo desenvolvida e suas informações podem conter imprecisões.
        </p>
      </div>
    </div>
  );
};
