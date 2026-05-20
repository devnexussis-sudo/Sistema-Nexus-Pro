import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Bot, Send, User, Sparkles, RefreshCw, BookOpen, Loader2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { findBestMatch, KnowledgeEntry, KNOWLEDGE_BASE } from '../../data/dunoKnowledge';
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

// ── Busca combinada (KB estática + aprendidos) ──
const searchAll = (input: string): string | null => {
  const all = [...KNOWLEDGE_BASE, ...getLearnedEntries()];
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
  // Nome do usuário
  if (/(meu\s+nome|como\s+me\s+chamo|qual\s+(e|é)\s+meu\s+nome|quem\s+sou\s+eu)/i.test(l)) {
    return `Claro, ${firstName}! Seu nome completo é **${fullName}**. Você está logado no sistema com esse perfil. 😊`;
  }
  // Agradecimentos
  if (/^(obrigad|valeu|thanks|agradeç|tmj|brigad)/i.test(l.trim())) {
    const replies = [
      `De nada, ${firstName}! Fico feliz em ajudar. Se precisar de mais alguma coisa, estou aqui! 😊`,
      `Sempre às ordens, ${firstName}! Qualquer dúvida é só chamar. 👍`,
      `Disponha, ${firstName}! É pra isso que estou aqui. 🚀`,
    ];
    return replies[Math.floor(Math.random() * replies.length)];
  }
  // Saudações
  if (/^(oi|olá|ola|hey|bom\s+dia|boa\s+tarde|boa\s+noite|e\s+a[ií]|tudo\s+bem|hello|hi)\b/i.test(l.trim())) {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
    return `${greeting}, ${firstName}! 👋 Como posso te ajudar hoje?\n\nPode me perguntar sobre qualquer módulo do sistema, ou até pedir um **resumo geral** com dados reais. Só mandar!`;
  }
  // Quem é a IA
  if (/(quem\s+(e|é)\s+voc[eê]|seu\s+nome|o\s+que\s+voc[eê]\s+faz|sobre\s+voc[eê])/i.test(l)) {
    return `Eu sou a **Duno IA**, ${firstName}! 🤖\n\nSou a inteligência artificial integrada ao sistema **Duno**. Posso:\n\n• 📊 **Consultar dados reais** — quantidade de OS, clientes, técnicos, garantias, etc.\n• 📖 **Explicar funcionalidades** — como criar OS, usar PMOC, configurar formulários...\n• 🧠 **Aprender** — me ensine algo novo com "Saiba que..." e eu memorizo!\n\nPergunte qualquer coisa!`;
  }
  return null;
};

// ── Markdown renderer ──
const renderMarkdown = (text: string) => text.split('\n').map((line, i) => {
  let html = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
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
      content: `Olá, **${firstName}**! 👋 Sou a **Duno IA**, sua assistente inteligente do sistema Duno.\n\nPosso **consultar dados reais** do sistema e te ajudar com qualquer dúvida. Experimente:\n\n• "Quantas OS tenho?"\n• "Quantos clientes cadastrados?"\n• "Status de garantia dos equipamentos"\n• "Resumo geral do sistema"\n• "Como criar uma OS?"\n\nComo posso te ajudar, ${firstName}?` }
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

    let response: string;

    try {
      // Simula tempo de busca/processamento de 2 segundos (spinner)
      await new Promise(r => setTimeout(r, 2000));

      // 1️⃣ Perguntas pessoais / conversacionais
      const personal = detectPersonal(userMsg.content, fullName, firstName);
      if (personal) {
        await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
        response = personal;

      // 2️⃣ Ensino / aprendizado
      } else if (detectTeaching(userMsg.content).is) {
        const teaching = detectTeaching(userMsg.content);
        await new Promise(r => setTimeout(r, 400));
        const keywords = teaching.topic
          ? teaching.topic.toLowerCase().split(/[\s,]+/).filter(w => w.length > 2)
          : userMsg.content.toLowerCase().split(/[\s,]+/).filter(w => w.length > 3).slice(0, 5);
        saveLearnedEntry({ keywords, response: teaching.info || userMsg.content });
        setLearnedCount(getLearnedEntries().length);
        response = `Anotado, ${firstName}! ✅ Aprendi essa informação e vou lembrar nas próximas conversas.\n\n**Palavras-chave:** ${keywords.join(', ')}\n\nPode me ensinar mais coisas quando quiser!`;

      // 3️⃣ Consultas ao banco de dados (dados reais!)
      } else {
        const dataIntent = detectDataIntent(userMsg.content);
        if (dataIntent) {
          response = await executeDataQuery(dataIntent, firstName);
        } else {
          // 4️⃣ Base de Conhecimento Secundária (Respostas aprendidas ou estáticas)
          const kbResponse = searchAll(userMsg.content);
          if (kbResponse) {
            response = kbResponse.includes(firstName) ? kbResponse : `${firstName}, ${kbResponse.charAt(0).toLowerCase()}${kbResponse.slice(1)}`;
          } else {
            // 5️⃣ Tenta descobrir procedimento avançado no Grafo do Sistema (Duno Copilot Engine)
            const proc = analyzeAndDiscover(userMsg.content);
            if (proc) {
              response = proc;
            } else {
              // 6️⃣ Fallback de segurança (findBestMatch)
              const fallback = findBestMatch(userMsg.content);
              response = fallback.includes(firstName) ? fallback : `${firstName}, ${fallback.charAt(0).toLowerCase()}${fallback.slice(1)}`;
            }
          }
        }
      }
    } catch (err) {
      console.error('[Duno IA] Error:', err);
      response = `${firstName}, desculpe, tive um problema ao processar sua pergunta. Pode tentar novamente? 🔄`;
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
    'Quantas OS tenho?',
    'Quantos clientes cadastrados?',
    'Equipamentos em garantia?',
    'Como criar uma OS?',
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50/30">
      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-100 px-5 py-2.5 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1c2d4f] to-[#2a4a7f] flex items-center justify-center text-white shadow-sm">
            <Sparkles size={15} />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              Duno IA
              <span className="px-1.5 py-px bg-slate-100 text-slate-500 border border-slate-200 text-[8px] uppercase tracking-widest rounded font-bold">Beta</span>
            </h2>
            <p className="text-[10px] font-medium text-slate-400 -mt-0.5">Assistente inteligente do sistema Duno</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {learnedCount > 0 && (
            <span className="hidden sm:flex items-center gap-1 px-2 py-1 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded text-[9px] font-bold">
              <BookOpen size={10} /> {learnedCount}
            </span>
          )}
          <button onClick={() => setMessages([messages[0]])} className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-bold text-slate-400 hover:text-slate-700 hover:bg-slate-50 rounded-md transition-all border border-slate-200">
            <RefreshCw size={11} /> Limpar
          </button>
        </div>
      </div>

      {/* ── Chat Area ── */}
      <div className="flex-1 overflow-y-auto p-4 sm:px-6 sm:py-5 custom-scrollbar scroll-smooth">
        <div className="max-w-2xl mx-auto space-y-5">

          {/* Suggestion Chips */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-1.5 justify-center py-3">
              {suggestions.map(s => (
                <button key={s} onClick={() => { setInput(s); }} className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-500 hover:bg-[#1c2d4f]/5 hover:border-[#1c2d4f]/20 hover:text-[#1c2d4f] transition-all">
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Messages */}
          {messages.map(msg => (
            <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {msg.role === 'assistant' && (
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-[#1c2d4f] to-[#2a4a7f] flex items-center justify-center text-white shrink-0 mt-0.5 shadow-sm">
                  <Bot size={14} />
                </div>
              )}
              <div className={`max-w-[82%] rounded-xl px-4 py-3 text-[12.5px] font-medium leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-[#1c2d4f] text-white rounded-tr-sm shadow-sm'
                  : 'bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm'
              }`}>
                {msg.isTyping ? (
                  <div className="flex items-center gap-2 px-1">
                    <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
                    <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider animate-pulse">Pensando...</span>
                  </div>
                ) : (
                  <div>{renderMarkdown(msg.content)}</div>
                )}
              </div>
              {msg.role === 'user' && (
                <div className="w-7 h-7 rounded-md bg-slate-200 flex items-center justify-center text-slate-500 shrink-0 mt-0.5">
                  <User size={14} />
                </div>
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      </div>

      {/* ── Input ── */}
      <div className="bg-white border-t border-slate-100 px-4 py-3 sm:px-6 shrink-0 z-10">
        <div className="max-w-2xl mx-auto relative">
          <textarea ref={taRef} value={input} onChange={handleInput} onKeyDown={handleKeyDown}
            placeholder={`Pergunte algo, ${firstName}...`}
            className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-[13px] font-medium text-slate-700 outline-none focus:bg-white focus:border-[#1c2d4f]/30 focus:ring-2 focus:ring-[#1c2d4f]/5 transition-all resize-none"
            rows={1} style={{ minHeight: '52px', maxHeight: '120px' }} />
          <button onClick={handleSend} disabled={!input.trim() || isLoading}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 w-8 h-8 bg-[#1c2d4f] hover:bg-[#253a66] disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg flex items-center justify-center transition-all shadow-sm disabled:shadow-none">
            <Send size={14} />
          </button>
        </div>
        <p className="text-center text-[9px] font-semibold text-slate-300 mt-2 uppercase tracking-widest">
          Duno IA • Consulta dados em tempo real • Base de conhecimento local
        </p>
      </div>
    </div>
  );
};
