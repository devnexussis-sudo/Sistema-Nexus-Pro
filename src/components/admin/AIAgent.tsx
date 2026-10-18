import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Bot, Send, User, Sparkles, RefreshCw, Loader2, BrainCircuit, 
  Paperclip, Database, Search, Trash2, FileText, X, AlertTriangle,
  Wrench, ShoppingBag, Plus, ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { KnowledgeEntry, findBestMatch } from '../../data/dunoKnowledge';
import { detectDataIntent, executeDataQuery } from '../../services/dunoQueryService';
import { analyzeAndDiscover } from '../../services/dunoBrain';
import { aiKnowledgeService, KnowledgeDocument } from '../../services/aiKnowledgeService';
import { getCurrentTenantId } from '../../lib/tenantContext';

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
    return `${greeting}, ${firstName}! 👋 Como posso te ajudar hoje?\n\nPode me perguntar sobre qualquer módulo do sistema, manuais de equipamentos cadastrados ou pedir um **resumo geral com dados reais** das OS de hoje.`;
  }
  if (/(quem\s+(e|é)\s+voc[eê]|seu\s+nome|o\s+que\s+voc[eê]\s+faz|sobre\s+voc[eê])/i.test(l)) {
    return `Eu sou a **Duno IA**, ${firstName}! 🤖\n\nSou a inteligência artificial especialista do ecossistema **DUNO**. Minhas capacidades:\n\n• 📊 **Consultar dados reais** — quantidade de OS, clientes, técnicos, garantias e faturamento.\n• 📖 **Explicar funcionalidades** — como criar OS, usar Pedidos de Venda (PVD), PMOC, faturar...\n• 🔧 **RAG de Manuais Técnicos** — diagnósticos de falhas, códigos de erro e valores ôhmicos nos manuais que você anexar.\n• 🧠 **Aprender** — me ensine algo novo com "Saiba que..." e eu memorizo para as próximas conversas!`;
  }
  return null;
};

// ── Markdown renderer estilizado BigTech ──
const renderMarkdown = (text: string) => text.split('\n').map((line, i) => {
  let html = line
    .replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-slate-900">$1</strong>')
    .replace(/`([^`]+)`/g, '<code class="px-1.5 py-0.5 rounded bg-slate-100 text-blue-700 font-mono text-[12px] border border-slate-200/60">$1</code>')
    .replace(/_(.+?)_/g, '<em class="italic">$1</em>');

  if (line.trim().startsWith('###')) {
    const heading = html.replace(/^###\s*/, '');
    return <h4 key={i} className="text-[14px] font-bold text-slate-900 mt-3 mb-1" dangerouslySetInnerHTML={{ __html: heading }} />;
  }
  if (line.trim().startsWith('##')) {
    const heading = html.replace(/^##\s*/, '');
    return <h3 key={i} className="text-[15px] font-bold text-slate-900 mt-4 mb-1.5" dangerouslySetInnerHTML={{ __html: heading }} />;
  }
  if (line.trim().startsWith('#')) {
    const heading = html.replace(/^#\s*/, '');
    return <h2 key={i} className="text-[16px] font-bold text-slate-900 mt-4 mb-2 tracking-tight pb-1 border-b border-slate-100" dangerouslySetInnerHTML={{ __html: heading }} />;
  }
  if (line.trim().startsWith('>')) {
    const quote = html.replace(/^>\s*/, '');
    return <blockquote key={i} className="border-l-4 border-blue-500 pl-3 py-1 my-2 bg-blue-50/50 rounded-r-lg text-slate-700 italic text-[13px]" dangerouslySetInnerHTML={{ __html: quote }} />;
  }
  if (html.trim().startsWith('•') || html.trim().startsWith('—') || html.trim().startsWith('-')) {
    return (
      <div key={i} className="pl-4 py-0.5 relative before:content-[''] before:w-1.5 before:h-1.5 before:bg-blue-500 before:rounded-full before:absolute before:left-1 before:top-2.5" dangerouslySetInnerHTML={{ __html: html.replace(/^[-•—]\s*/, '') }} />
    );
  }
  if (/^\d+\./.test(html.trim())) {
    return <p key={i} className="pl-4 py-0.5 font-medium" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  if (!html.trim()) return <div key={i} className="h-2.5" />;
  return <p key={i} className="py-0.5 leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />;
});

export const AIAgent: React.FC = () => {
  const { auth } = useAuth();
  const fullName = auth.user?.name || 'Usuário';
  const firstName = fullName.split(' ')[0];

  const [messages, setMessages] = useState<Message[]>([
    { id: 'welcome', role: 'assistant',
      content: `Olá, **${firstName}**! 👋 Sou a **Duno IA**, sua assistente inteligente integrada ao ecossistema Duno.\n\nEstou conectada ao banco de dados real e aos seus **manuais técnicos de equipamentos (RAG)**. Você pode me perguntar:\n\n• "Como criar e faturar um Pedido de Venda (PVD)?"\n• "Qual o procedimento para o erro E18 do forno Rational?"\n• "Faça um resumo geral das Ordens de Serviço do dia"\n\nComo posso te ajudar agora?` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [learnedCount, setLearnedCount] = useState(getLearnedEntries().length);
  const [mode, setMode] = useState<'assistant' | 'learn' | 'memories'>('assistant');

  // ── Memórias ──
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([]);
  const [memSearch, setMemSearch] = useState('');
  const [memLoading, setMemLoading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const loadDocuments = useCallback(async () => {
    setMemLoading(true);
    try {
      const docs = await aiKnowledgeService.listDocuments();
      setDocuments(docs);
    } catch (err) {
      console.error('[Memórias] Erro ao listar:', err);
    }
    setMemLoading(false);
  }, []);

  useEffect(() => {
    if (mode === 'memories') loadDocuments();
  }, [mode, loadDocuments]);

  const handleDeleteDoc = async (sourceName: string) => {
    setDeletingDoc(sourceName);
    try {
      const count = await aiKnowledgeService.deleteDocument(sourceName);
      setDocuments(prev => prev.filter(d => d.source_name !== sourceName));
      console.log(`[Memórias] Documento "${sourceName}" excluído com sucesso (${count} chunks eliminados).`);
    } catch (err: any) {
      alert('Erro ao excluir documento: ' + err.message);
    }
    setDeletingDoc(null);
    setConfirmDelete(null);
  };

  const filteredDocs = documents.filter(d =>
    d.source_name.toLowerCase().includes(memSearch.toLowerCase())
  );
  const fileInputRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const typingId = 'typing-' + Date.now();
    setMessages(p => [...p, 
      { id: Date.now().toString(), role: 'user', content: `Enviando manual/documento técnico: **${file.name}**` },
      { id: typingId, role: 'assistant', content: 'Processando e indexando documento na memória RAG...', isTyping: true }
    ]);
    setIsLoading(true);

    try {
      await aiKnowledgeService.ingestDocument(file, (status) => {
         setMessages(p => p.map(m => m.id === typingId ? { ...m, content: status } : m));
      });
      setMessages(p => p.map(m => m.id === typingId ? { ...m, content: `✅ **Sucesso!** O manual "${file.name}" foi lido e aprendido pela inteligência. Você já pode me fazer perguntas técnicas sobre ele.`, isTyping: false } : m));
      loadDocuments();
    } catch (error: any) {
      setMessages(p => p.map(m => m.id === typingId ? { ...m, content: `❌ **Erro ao processar:** ${error.message}`, isTyping: false } : m));
    }
    
    setIsLoading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    const typingId = 'typing-' + Date.now();
    setMessages(p => [...p, userMsg, { id: typingId, role: 'assistant', content: '', isTyping: true }]);
    setInput('');
    setIsLoading(true);
    if (taRef.current) taRef.current.style.height = '84px';

    let response: string = '';

    try {
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
        response = `Anotado, ${firstName}! ✅ Aprendi essa informação e vou lembrar nas próximas conversas.\n\n**Palavras-chave:** ${keywords.join(', ')}\n\nPode me ensinar mais procedimentos quando quiser!`;

      // 3️⃣ Consultas de dados (Data Intent)
      } else {
        const dataIntent = detectDataIntent(userMsg.content);
        if (dataIntent) {
          response = await executeDataQuery(dataIntent, firstName);
        } else {
          // Extrai histórico recente (últimas 6 mensagens) para contextualização e continuidade multi-turn
          const historyPayload = messages
            .filter(m => !m.isTyping && m.content)
            .slice(-6)
            .map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));

          if (mode === 'learn') {
             // 3.5️⃣ Modo Aprender: Busca EXCLUSIVA na Base RAG (PDFs) com histórico
             const tenantId = getCurrentTenantId();
             let kbResponse = null;
             if (tenantId) {
                kbResponse = await aiKnowledgeService.searchKnowledge(userMsg.content, tenantId, 7, 'assistant', historyPayload);
             }
             if (kbResponse) {
                response = kbResponse;
             } else {
                response = `Não encontrei informações sobre isso nos manuais e documentos que você enviou. Lembre-se que no **Modo Aprender** eu respondo estritamente com base nos anexos! 📄`;
             }
          } else {
             // 4️⃣ Modo Assistente: IA 100% Unificada (RAG + Manuais + Sistema DUNO) com histórico
             const tenantId = getCurrentTenantId();
             let kbResponse = null;
             
             if (tenantId) {
                kbResponse = await aiKnowledgeService.searchKnowledge(userMsg.content, tenantId, 7, 'assistant', historyPayload);
             }

             if (kbResponse) {
                response = kbResponse;
             } else {
                // Se a IA unificada não retornar nada, tenta o LocalStorage (Aprendizado manual)
                const learnedRes = searchLearned(userMsg.content);
                if (learnedRes) {
                  response = learnedRes.includes(firstName) ? learnedRes : `${firstName}, me ensinaram que: ${learnedRes}`;
                } else {
                  // Fallback Final Genérico
                  response = `🤖 **Duno Copilot**\n\nDesculpe ${firstName}, fiz uma varredura completa mas não encontrei informações sobre isso no sistema nem nos seus manuais anexados.\n\n👉 **Dica:** Tente usar termos claros (ex: "como criar um pedido de venda", "código de erro do forno", "como faturar uma OS").`;
                }
             }
          }
        }
      }
    } catch (err) {
      console.error('[Duno IA] Error:', err);
      response = `${firstName}, desculpe, tive um problema interno ao processar sua pergunta. Pode tentar novamente? 🔄`;
    }

    setMessages(p => p.map(m => m.id === typingId ? { id: Date.now().toString(), role: 'assistant', content: response } : m));
    setIsLoading(false);
  }, [input, isLoading, firstName, fullName, messages, mode]);

  const handleKeyDown = (e: React.KeyboardEvent) => { 
    if (e.key === 'Enter' && !e.shiftKey) { 
      e.preventDefault(); 
      handleSend(); 
    } 
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = '84px';
    e.target.style.height = Math.min(Math.max(e.target.scrollHeight, 84), 240) + 'px';
  };

  // Cards de sugestões modernas estilo BigTech (ChatGPT / Claude / Gemini)
  const promptCards = [
    {
      title: 'Diagnóstico de Equipamentos',
      description: 'Códigos de erro, valores em Ohms e testes de componentes em manuais técnicos.',
      prompt: 'Qual o procedimento de teste e código de erro nos manuais de equipamentos cadastrados?',
      icon: <Wrench size={18} />,
      iconBg: 'bg-amber-50 border border-amber-100/80',
      iconColor: 'text-amber-600',
    },
    {
      title: 'Pedido de Venda (PVD)',
      description: 'Como criar pedidos balcão, incluir peças do estoque e finalizar para faturamento.',
      prompt: 'Como emitir um Pedido de Venda (PVD), adicionar itens e enviar para o financeiro?',
      icon: <ShoppingBag size={18} />,
      iconBg: 'bg-blue-50 border border-blue-100/80',
      iconColor: 'text-blue-600',
    },
    {
      title: 'Resumo Operacional de OS',
      description: 'Contagem de ordens de serviço pendentes, em andamento e atendimentos do dia.',
      prompt: 'Faça um resumo geral do sistema com dados reais de OS, clientes e técnicos.',
      icon: <FileText size={18} />,
      iconBg: 'bg-emerald-50 border border-emerald-100/80',
      iconColor: 'text-emerald-600',
    },
    {
      title: 'Base de Memórias RAG',
      description: 'Envie manuais técnicos em PDF para a inteligência aprender novos equipamentos.',
      prompt: 'Quais manuais técnicos estão salvos na minha memória e como posso utilizá-los?',
      icon: <Database size={18} />,
      iconBg: 'bg-purple-50 border border-purple-100/80',
      iconColor: 'text-purple-600',
    },
  ];

  return (
    <div className="h-full flex flex-col bg-slate-50/70 relative overflow-hidden">
      {/* ── Ambient Background Pattern ── */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.25]" 
        style={{
          backgroundImage: 'radial-gradient(circle at center, #cbd5e1 1px, transparent 1px)',
          backgroundSize: '28px 28px'
        }}
      />

      {/* ── Top Header BigTech ── */}
      <header className="bg-white/85 backdrop-blur-md border-b border-slate-200/80 px-6 py-3.5 flex items-center justify-between shrink-0 z-10 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="relative">
            <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 to-[#1c2d4f] rounded-xl blur opacity-30 animate-pulse" />
            <div className="relative w-10 h-10 rounded-xl bg-gradient-to-br from-[#0f172a] to-[#1e3a8a] flex items-center justify-center text-white shadow-md border border-slate-700/60">
              <BrainCircuit size={20} className="text-blue-200" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-[16px] font-bold text-slate-900 tracking-tight">
                DUNO IA
              </h1>
              <span className="px-2 py-0.5 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 text-blue-700 border border-blue-200/60 text-[10px] font-bold tracking-wider rounded-md uppercase">
                Copilot 3.0
              </span>
              <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200/60 text-[10px] font-semibold text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                Online
              </span>
            </div>
            <p className="text-[12px] font-medium text-slate-500 mt-0.5">
              Inteligência RAG Multi-Turn • Manuais Técnicos & ERP DUNO
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {mode !== 'assistant' ? (
            <button 
              onClick={() => setMode('assistant')} 
              className="flex items-center gap-2 px-3.5 py-2 text-[12px] font-semibold text-slate-700 hover:text-blue-700 hover:bg-blue-50/80 rounded-xl transition-all border border-slate-200 bg-white shadow-xs hover:shadow"
            >
              <Sparkles size={14} className="text-blue-600" />
              <span>Modo Chat</span>
            </button>
          ) : (
            <button 
              onClick={() => setMessages([messages[0]])} 
              className="flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-all border border-slate-200/80 bg-white shadow-xs hover:shadow"
              title="Iniciar nova conversa limpa"
            >
              <RefreshCw size={13} className="text-slate-500" />
              <span className="hidden sm:inline">Nova Conversa</span>
            </button>
          )}

          <button 
            onClick={() => setMode(mode === 'memories' ? 'assistant' : 'memories')} 
            className={`flex items-center gap-2 px-3.5 py-2 text-[12px] font-semibold rounded-xl transition-all border shadow-xs hover:shadow ${
              mode === 'memories' 
                ? 'bg-violet-600 text-white border-violet-600' 
                : 'text-slate-700 hover:text-violet-700 hover:bg-violet-50/80 border-slate-200 bg-white'
            }`}
          >
            <Database size={14} className={mode === 'memories' ? 'text-white' : 'text-violet-600'} />
            <span>Memórias</span>
            {documents.length > 0 && (
              <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${mode === 'memories' ? 'bg-white/20 text-white' : 'bg-violet-100 text-violet-700'}`}>
                {documents.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* ── PAINEL DE MEMÓRIAS (Largura Expandida) ── */}
      {mode === 'memories' ? (
        <div className="flex-1 overflow-y-auto p-6 z-0">
          <div className="max-w-4xl xl:max-w-5xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-xs">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-md shrink-0">
                <Database size={22} className="text-white" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Base de Memórias & Manuais Técnicos</h3>
                <p className="text-[13px] text-slate-500 mt-0.5">
                  {documents.length} {documents.length === 1 ? 'manual técnico indexado' : 'manuais técnicos indexados'} para consulta RAG de alta precisão
                </p>
              </div>
              <div className="sm:ml-auto flex items-center gap-2 w-full sm:w-auto">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex-1 sm:flex-initial px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[12px] font-semibold flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer"
                >
                  <Plus size={15} />
                  <span>Adicionar Manual</span>
                </button>
                <input 
                  type="file" 
                  disabled={isLoading} 
                  accept=".pdf,.doc,.docx,.txt,application/pdf,text/plain,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" 
                  className="hidden" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload} 
                />
                <button 
                  onClick={loadDocuments} 
                  className="p-2.5 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-all border border-slate-200" 
                  title="Atualizar lista"
                >
                  <RefreshCw size={15} className={memLoading ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>

            {/* Search Filter */}
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filtrar manuais por nome ou modelo..."
                value={memSearch}
                onChange={e => setMemSearch(e.target.value)}
                className="w-full pl-11 pr-10 py-3 bg-white border border-slate-200 rounded-xl text-[13px] font-medium text-slate-800 outline-none focus:border-violet-500 focus:ring-4 focus:ring-violet-500/10 transition-all shadow-xs"
              />
              {memSearch && (
                <button onClick={() => setMemSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                  <X size={15} />
                </button>
              )}
            </div>

            {memLoading ? (
              <div className="flex items-center justify-center py-20 gap-3 text-slate-400">
                <Loader2 size={24} className="animate-spin text-violet-600" />
                <span className="text-[14px] font-medium text-slate-600">Carregando base de conhecimento...</span>
              </div>
            ) : filteredDocs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400 bg-white/60 border border-slate-200/80 rounded-2xl">
                <Database size={40} className="opacity-30 text-slate-500" />
                <p className="text-[14px] font-medium text-slate-600">
                  {memSearch ? 'Nenhum documento encontrado com este termo.' : 'Nenhum manual técnico aprendido ainda. Clique em "Enviar Manual (PDF)" para começar.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredDocs.map(doc => (
                  <div key={doc.source_name} className="group bg-white border border-slate-200/90 rounded-2xl p-4 flex items-center gap-3.5 shadow-xs hover:shadow-md hover:border-slate-300 transition-all duration-200">
                    <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
                      <FileText size={18} className="text-red-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-slate-800 truncate" title={doc.source_name}>
                        {doc.source_name}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[11px] text-slate-400 font-medium">
                          {new Date(doc.created_at).toLocaleDateString('pt-BR')}
                        </span>
                        {doc.total_chunks ? (
                          <span className="text-[10px] font-bold bg-violet-50 text-violet-700 border border-violet-100 px-1.5 py-0.5 rounded-md font-mono">
                            {doc.total_chunks} {doc.total_chunks === 1 ? 'parte' : 'partes'}
                          </span>
                        ) : null}
                      </div>
                    </div>

                    {confirmDelete === doc.source_name ? (
                      <div className="flex items-center gap-2 animate-in fade-in duration-150">
                        <button
                          onClick={() => handleDeleteDoc(doc.source_name)}
                          disabled={deletingDoc === doc.source_name}
                          className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[11px] font-bold rounded-lg transition-all flex items-center gap-1 shadow-xs disabled:opacity-60"
                        >
                          {deletingDoc === doc.source_name ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                          Confirmar
                        </button>
                        <button
                          onClick={() => setConfirmDelete(null)}
                          className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[11px] font-bold rounded-lg transition-all"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDelete(doc.source_name)}
                        className="opacity-0 group-hover:opacity-100 p-2 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all duration-200"
                        title="Excluir manual do banco de dados"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
      <>
        {/* ── Chat Messages Area (Largura Proporcional BigTech: max-w-[860px]) ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 custom-scrollbar scroll-smooth relative z-0">
          <div className="max-w-[860px] mx-auto space-y-6">

            {/* Prompt Starter Cards */}
            {messages.length <= 1 && (
              <div className="py-6 sm:py-8 max-w-[860px] mx-auto animate-in fade-in duration-300">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-100 text-blue-700 text-[12px] font-semibold mb-3 shadow-xs">
                    <Sparkles size={13} className="text-blue-600 animate-pulse" />
                    Inteligência Artificial Integrada ao Sistema
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">
                    Como posso ajudar você hoje, {firstName}?
                  </h2>
                  <p className="text-slate-500 text-[14px] mt-2 max-w-xl mx-auto">
                    Tire dúvidas sobre o sistema DUNO, consulte manuais técnicos de equipamentos ou acompanhe dados em tempo real.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {promptCards.map((card, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setInput(card.prompt);
                        taRef.current?.focus();
                      }}
                      className="group p-4 bg-white hover:bg-slate-50/80 border border-slate-200/80 hover:border-blue-400/60 rounded-2xl text-left transition-all duration-200 shadow-xs hover:shadow-md flex items-start gap-3.5 cursor-pointer text-slate-800"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${card.iconBg} ${card.iconColor} transition-transform group-hover:scale-105 shadow-xs`}>
                        {card.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-[13px] font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                          {card.title}
                        </h4>
                        <p className="text-[12px] text-slate-500 mt-0.5 line-clamp-2">
                          {card.description}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message Flow */}
            {messages.map(msg => (
              <div 
                key={msg.id} 
                className={`flex gap-3.5 sm:gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2 duration-300`}
              >
                {msg.role === 'assistant' && (
                  <div className="relative shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-b from-[#1e293b] to-[#0f172a] flex items-center justify-center text-white shadow-md border border-slate-700/60">
                      <Sparkles size={11} className="text-blue-300 animate-pulse absolute -top-1 -right-1 bg-[#0f172a] rounded-full p-0.5 border border-slate-700/80" />
                      <Bot size={19} className="text-slate-100" />
                    </div>
                  </div>
                )}

                {msg.role === 'user' ? (
                  <div className="max-w-[82%] px-5 sm:px-6 py-3.5 rounded-2xl bg-[#1c2d4f] text-white rounded-tr-xs border border-[#2e4775]/70 shadow-sm">
                    <p className="text-white text-[14px] font-normal leading-relaxed whitespace-pre-wrap select-text m-0 p-0 break-words">
                      {msg.content}
                    </p>
                  </div>
                ) : (
                  <div className="max-w-[92%] px-6 sm:px-7 py-5 rounded-2xl bg-white border border-slate-200/80 text-slate-800 rounded-tl-xs shadow-xs hover:shadow-sm">
                    {msg.isTyping ? (
                      <div className="flex items-center gap-3 py-1">
                        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
                        <span className="text-[12px] text-slate-500 font-semibold tracking-wide animate-pulse">
                          Consultando manuais e processando resposta...
                        </span>
                      </div>
                    ) : (
                      <div className="text-slate-800 text-[14px] leading-relaxed break-words">
                        {renderMarkdown(msg.content)}
                      </div>
                    )}
                  </div>
                )}

                {msg.role === 'user' && (
                  <div className="relative shrink-0 mt-1">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center text-slate-700 shadow-inner border border-slate-300/70">
                      <User size={19} />
                    </div>
                  </div>
                )}
              </div>
            ))}
            <div ref={endRef} />
          </div>
        </div>
      </>
      )}

      {/* ── Docked Input Card (Largura Proporcional BigTech: max-w-[860px]) ── */}
      <div className="bg-gradient-to-t from-white via-white/95 to-transparent pt-2 pb-5 px-4 sm:px-6 shrink-0 z-10 border-t border-slate-200/50">
        {mode !== 'memories' && (
          <div className="max-w-[860px] mx-auto">
            <div className="bg-white rounded-2xl border border-slate-200/90 shadow-md shadow-slate-200/30 hover:shadow-lg hover:border-slate-300 focus-within:border-blue-500/80 focus-within:ring-4 focus-within:ring-blue-500/10 transition-all p-3 sm:p-4">
              <textarea
                ref={taRef}
                value={input}
                onChange={handleInput}
                onKeyDown={handleKeyDown}
                placeholder={`Pergunte algo para a Duno IA, ${firstName}...`}
                className="w-full bg-transparent text-[14px] font-normal text-slate-800 placeholder:text-slate-400 outline-none resize-none leading-relaxed custom-scrollbar"
                rows={2}
                style={{ minHeight: '80px', maxHeight: '220px' }}
              />

              <div className="flex items-center justify-between pt-2.5 mt-1 border-t border-slate-100">
                <span className="text-[12px] text-slate-400 font-medium pl-1 hidden sm:inline">
                  Shift + Enter para nova linha
                </span>

                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="h-9 px-4 bg-gradient-to-r from-[#1c2d4f] to-[#253a66] hover:from-[#15233e] hover:to-[#1c2d4f] disabled:from-slate-100 disabled:to-slate-100 disabled:text-slate-400 text-white rounded-xl flex items-center gap-2 font-medium text-[13px] transition-all shadow-sm hover:shadow-md disabled:shadow-none active:scale-95 cursor-pointer disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 size={14} className="animate-spin text-blue-400" />
                        <span>Processando...</span>
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

            <p className="text-center text-[11px] font-medium text-slate-400 mt-2.5">
              Duno IA Copilot • As informações são baseadas nos manuais anexados e nos procedimentos oficiais do sistema.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
