import React, { useState, useRef, useEffect } from 'react';
import { Bot, X, Send, User as UserIcon, Loader2, Phone, Minus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { analyzeAndDiscover } from '../../services/dunoBrain';
import { aiKnowledgeService } from '../../services/aiKnowledgeService';
import { getCurrentTenantId } from '../../lib/tenantContext';
import { useLocation } from 'react-router-dom';

interface Message {
  id: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
}

// ── Markdown renderer rápido ──
const renderMarkdown = (text: string) => {
  // Transforma links MD [Texto](URL) em tags <a> reais
  let processedText = text;
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  processedText = processedText.replace(linkRegex, '<a href="$2" target="_blank" class="text-blue-500 font-bold hover:underline">$1</a>');

  return processedText.split('\n').map((line, i) => {
    let html = line.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/_(.+?)_/g, '<em>$1</em>');
    if (html.trim().startsWith('•') || html.trim().startsWith('—')) return <p key={i} className="pl-3 py-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
    if (/^\d+\./.test(html.trim())) return <p key={i} className="pl-3 py-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
    if (/^\s{2}•/.test(html)) return <p key={i} className="pl-6 py-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
    if (!html.trim()) return <div key={i} className="h-2" />;
    return <p key={i} className="py-0.5" dangerouslySetInnerHTML={{ __html: html }} />;
  });
};

export const GlobalChatBot: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { auth } = useAuth();
  const location = useLocation();
  
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const firstName = auth.user?.name?.split(' ')[0] || 'Visitante';
  const isWhatsAppPage = location.pathname.includes('/admin/whatsapp');

  // Inicializa a primeira mensagem
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([
        {
          id: 'welcome',
          role: 'assistant',
          content: `E aí, **${firstName}**! 👋 Tudo tranquilo por aí? Sou a IA oficial da Duno! 🤖✨\n\nTô por aqui pra tirar suas dúvidas sobre a plataforma e dar aquela força no dia a dia. Pode me perguntar o que quiser! 🚀\n\nSe a coisa ficar muito técnica ou se só quiser bater um papo com um **Suporte Humano** de carne e osso, é só clicar no botão abaixo e chamar nossa equipe no zap:\n\n[📱 Chamar Suporte Técnico no WhatsApp](https://wa.me/553534227420) 💬`
        }
      ]);
    }
  }, [isOpen, messages.length, firstName]);

  // Autoscroll inteligente: rola para o TOPO da mensagem mais recente
  useEffect(() => {
    if (!isOpen) return;
    
    setTimeout(() => {
      if (isLoading) {
        const el = document.getElementById('msg-loading');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else if (messages.length > 1) {
        const lastMsg = messages[messages.length - 1];
        const el = document.getElementById(`msg-${lastMsg.id}`);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 100); // pequeno delay para garantir a renderização no DOM
  }, [messages, isLoading, isOpen]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    
    const userText = input.trim();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: userText };
    
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      // 1. Atrasa a resposta por 1 segundo para melhorar a UI (parecer mais humano digitando)
      await new Promise(r => setTimeout(r, 1000));

      const tenantId = getCurrentTenantId();
      let responseContent: string | null = null;
      
      if (tenantId) {
        // 2. Usa o Motor RAG chamando a Edge Function com a persona 'chat'
        responseContent = await aiKnowledgeService.searchKnowledge(userText, tenantId, 7, 'chat');
      }

      // Fallback para as regras estáticas caso a busca RAG falhe ou retorne vazio
      if (!responseContent) {
        responseContent = await analyzeAndDiscover(userText);
      }
      
      // 3. Se a IA não achar contexto ou falhar na geração
      if (!responseContent) {
        responseContent = `🤔 Hmm... não encontrei informações exatas sobre isso nos meus manuais, **${firstName}**.\n\nMas relaxa! 🚀 Nossa equipe técnica tá sempre de olho e pode te ajudar com isso num piscar de olhos pelo WhatsApp! Chama lá: [📱 Falar com o Suporte](https://wa.me/553534227420)`;
      }

      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: responseContent
      }]);
    } catch (err) {
      console.error('[GlobalChatBot] Error:', err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: `Tive uma falha de conexão temporária, **${firstName}**. Pode tentar enviar sua pergunta novamente?`
      }]);
    } finally {
      setIsLoading(false);
      setTimeout(() => taRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = '44px';
    e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
  };

  return (
    <div className={`fixed right-6 z-[9999] flex flex-col items-end print:hidden transition-all duration-300 ${isWhatsAppPage ? 'bottom-20' : 'bottom-6'}`}>
      
      {/* ── JANELA DO CHAT (Aberta) ── */}
      {isOpen && (
        <div className="bg-white/95 backdrop-blur-xl w-[360px] h-[520px] max-h-[80vh] shadow-2xl rounded-2xl flex flex-col mb-4 border border-slate-200/60 overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-300">
          
          {/* Header */}
          <div className="bg-gradient-to-r from-[#1c2d4f] to-[#2a4a7f] px-4 py-3 flex items-center justify-between shrink-0 shadow-md relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 rounded-full blur-2xl -mt-10 -mr-10 pointer-events-none" />
            <div className="flex items-center gap-3 relative z-10">
              <div className="w-8 h-8 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white backdrop-blur-sm shadow-inner">
                <Bot size={18} className="text-blue-100" />
              </div>
              <div className="flex flex-col">
                <span className="text-white font-bold text-[13px] tracking-tight leading-tight">Duno Assistente IA</span>
                <span className="text-blue-200/80 text-[10px] font-medium leading-tight">Online e pronto para ajudar</span>
              </div>
            </div>
            <div className="flex items-center gap-1 relative z-10">
              <button onClick={() => setIsOpen(false)} className="w-7 h-7 flex items-center justify-center text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-colors">
                <Minus size={16} />
              </button>
            </div>
          </div>

          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-slate-50/50 flex flex-col gap-4 relative">
            {messages.map(msg => (
              <div key={msg.id} id={`msg-${msg.id}`} className={`flex gap-3 max-w-[90%] ${msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'} scroll-mt-4`}>
                {/* Avatar */}
                <div className="shrink-0 mt-0.5">
                  {msg.role === 'assistant' ? (
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-[#1c2d4f] flex items-center justify-center text-white shadow-sm border border-blue-800/50">
                      <Bot size={14} />
                    </div>
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-slate-200 border border-slate-300 flex items-center justify-center text-slate-600 shadow-inner">
                      <UserIcon size={14} />
                    </div>
                  )}
                </div>
                
                {/* Bubble */}
                <div className={`px-4 py-2.5 rounded-2xl text-[13px] shadow-sm ${
                  msg.role === 'user' 
                    ? 'bg-[#1c2d4f] text-white rounded-tr-sm' 
                    : 'bg-white text-slate-700 border border-slate-200/60 rounded-tl-sm'
                }`}>
                  <div className="prose prose-sm prose-slate leading-relaxed">
                    {renderMarkdown(msg.content)}
                  </div>
                </div>
              </div>
            ))}

            {/* Loading Indicator */}
            {isLoading && (
              <div id="msg-loading" className="flex gap-3 mr-auto max-w-[85%] scroll-mt-4">
                <div className="shrink-0 mt-0.5">
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-600 to-[#1c2d4f] flex items-center justify-center text-white shadow-sm">
                    <Bot size={14} />
                  </div>
                </div>
                <div className="px-4 py-3 bg-white text-slate-700 border border-slate-200/60 rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin text-blue-500" />
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest animate-pulse">Digitando...</span>
                </div>
              </div>
            )}
            
            <div ref={endRef} />
          </div>

          {/* Input Area */}
          <div className="p-3 bg-white border-t border-slate-100 shrink-0">
            <div className="relative flex items-center">
              <textarea
                ref={taRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder="Pergunte sobre o sistema..."
                className="w-full pl-4 pr-12 py-3 bg-slate-100 border-none rounded-2xl text-[13px] text-slate-700 focus:ring-2 focus:ring-[#1c2d4f]/20 focus:bg-white transition-all resize-none custom-scrollbar"
                rows={1}
                style={{ minHeight: '44px', maxHeight: '100px' }}
              />
              <button 
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
                className="absolute right-1.5 bottom-1.5 w-8 h-8 rounded-xl bg-[#1c2d4f] hover:bg-[#253a66] disabled:bg-slate-200 disabled:text-slate-400 flex items-center justify-center text-white transition-all shadow-md disabled:shadow-none"
              >
                <Send size={14} className="ml-0.5" />
              </button>
            </div>
            
            <div className="text-center mt-2 flex justify-center">
              <a 
                href="https://wa.me/553534227420" 
                target="_blank" 
                rel="noopener noreferrer" 
                className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-emerald-600 transition-colors font-medium"
              >
                <Phone size={10} /> Suporte Humano
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── BOTÃO FLUTUANTE (Fechado) ── */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="group relative w-14 h-14 bg-gradient-to-br from-[#1c2d4f] to-[#2a4a7f] hover:from-[#152340] hover:to-[#1c2d4f] rounded-full flex items-center justify-center text-white shadow-[0_8px_30px_rgb(28,45,79,0.3)] hover:shadow-[0_8px_40px_rgb(28,45,79,0.4)] transition-all duration-300 transform hover:-translate-y-1 hover:scale-105 border border-[#ffffff1a]"
        >
          {/* Animação de anel de brilho externo */}
          <div className="absolute inset-0 rounded-full border-2 border-white/20 animate-ping opacity-20 duration-1000" />
          
          <Bot size={26} className="relative z-10 group-hover:animate-bounce" />
          
          {/* Tooltip */}
          <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-slate-800 text-white text-[11px] font-bold rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 whitespace-nowrap pointer-events-none after:content-[''] after:absolute after:left-full after:top-1/2 after:-translate-y-1/2 after:border-4 after:border-transparent after:border-l-slate-800">
            Precisa de ajuda?
          </div>
        </button>
      )}
    </div>
  );
};
