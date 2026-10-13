// ============================================================
// src/services/dunoQueryService.ts
// 🧠 Duno IA — Varredura inteligente do banco de dados Nexus OS
// ============================================================

import { supabase } from '../supabase';
// Tenant context removido: vamos buscar via auth profile

// 🛡️ Rate Limiting: janela deslizante de timestamps (max 20 queries/min)
let rateLimitWindow: number[] = [];

// 🧊 Cache Semântico: evita chamadas repetidas à LLM para perguntas similares
// Chave = hash normalizado da query + source_names dos chunks
// Valor = { response, timestamp }
const semanticCache = new Map<string, { response: string; timestamp: number }>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

function buildCacheKey(query: string, sources: string[]): string {
  const normalizedQuery = query.toLowerCase().trim()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .sort()
    .join('_');
  const sourceKey = sources.sort().join('|').toLowerCase();
  return `${normalizedQuery}::${sourceKey}`;
}




// ══════════════════════════════════════════════════════════════
// 🔑 Helper: garante tenant
// ══════════════════════════════════════════════════════════════
async function requireTid(): Promise<string | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;
  const { data } = await supabase
      .from('technicians')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();
  return data?.tenant_id;
}

// ══════════════════════════════════════════════════════════════
// 📚 BUSCA NA BASE DE CONHECIMENTO RAG (MANUAIS PDF)
// ══════════════════════════════════════════════════════════════

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'de', 'do', 'da', 'em', 'para', 'com', 'um', 'uma', 'os', 'as', 'o', 'a', 
    'como', 'fazer', 'onde', 'qual', 'quais', 'sistema', 'tela', 'modulo', 
    'botao', 'que', 'se', 'na', 'no', 'eu', 'quero', 'detalhes', 'executar',
    'tarefa', 'dentro', 'consigo', 'posso', 'faco', 'passo', 'por', 'ou',
    'e', 'sao', 'nao', 'sim', 'esta', 'este', 'isso', 'aquilo', 'ele', 'ela'
  ]);
  
  const words = removeAccents(text.toLowerCase())
    .replace(/[^\w\s\-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 2 && !stopwords.has(w));
    
  const freqs: Record<string, number> = {};
  for (const w of words) freqs[w] = (freqs[w] || 0) + 1;
  
  return Object.entries(freqs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(e => e[0]);
}

export async function searchKnowledgeBase(
  query: string, 
  history: Array<{ role: 'user' | 'assistant', content: string }> = [],
  userLang: 'pt' | 'en' | 'es' = 'pt'
): Promise<string | null> {
  const tid = await requireTid();
  if (!tid) return null;

  console.log('[AI Search Mobile] Iniciando busca com contexto para query:', query, 'lang:', userLang);
  
  // 🎯 ACÚMULO DE CONTEXTO MULTI-TURN:
  // Se for uma pergunta de acompanhamento ("e a pressão de alta dele?"),
  // mesclamos o texto das últimas 3 mensagens do usuário para não perder marcas/modelos (ex: "Daikin RXYQ")
  const recentUserTexts = history
    .filter(m => m.role === 'user' && m.content)
    .slice(-3)
    .map(m => m.content)
    .join(' ');

  const combinedSearchText = recentUserTexts ? `${recentUserTexts} ${query}` : query;

  let queryKeywords = extractKeywords(combinedSearchText);

  // Injeção de sinônimos conhecidos que falham por hifenização
  const synonyms: string[] = [];
  for (const kw of queryKeywords) {
    // Gera versão com e sem hífen automaticamente
    if (kw.includes('-')) {
      synonyms.push(kw.replace(/-/g, ''));
    } else if (kw.length > 3) {
      // Tenta inserir hífen após 1ª letra (padrão C-MAX, X-PRO, etc.)
      const withHyphen = kw.slice(0, 1) + '-' + kw.slice(1);
      synonyms.push(withHyphen);
    }
  }
  queryKeywords = [...new Set([...queryKeywords, ...synonyms])];

  if (queryKeywords.length === 0) {
    queryKeywords = removeAccents(combinedSearchText.toLowerCase())
      .replace(/[^\w\s\-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length >= 2);
  }

  // ══════════════════════════════════════════════════════════════
  // BUSCA V3: RPC Global + Fallback ILIKE duplo (content + source_name)
  // Idêntico ao fluxo do Painel Admin (aiKnowledgeService.ts)
  // ══════════════════════════════════════════════════════════════
  let data: any[] = [];
  if (queryKeywords.length > 0) {
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('search_ai_knowledge_global', { p_keywords: queryKeywords, p_limit: 20 });

    if (rpcError) {
      console.error('[AI Search Mobile] Erro na RPC V3:', rpcError.message);
    } else {
      data = rpcData || [];
      console.log(`[AI Search Mobile] RPC V3 retornou ${data.length} chunks já ordenados por relevância.`);
    }

    // Fallback ILIKE: busca bruta no content E no source_name
    if (data.length === 0) {
      console.log('[AI Search Mobile] RPC vazia. Tentando fallback ILIKE (content + source_name)...');
      const contentFilters = queryKeywords.slice(0, 8).map(k => `content.ilike.%${k}%`);
      const sourceFilters = queryKeywords.slice(0, 8).map(k => `source_name.ilike.%${k}%`);
      const orQuery = [...contentFilters, ...sourceFilters].join(',');
      const { data: fallbackData } = await supabase
        .from('ai_knowledge_base')
        .select('content, source_name, keywords')
        .eq('tenant_id', tid)
        .or(orQuery)
        .limit(20);
      data = fallbackData || [];
      console.log(`[AI Search Mobile] Fallback ILIKE retornou ${data.length} chunks.`);
    }
  } else {
    const { data: fallbackData } = await supabase
      .from('ai_knowledge_base')
      .select('content, source_name, keywords')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false })
      .limit(20);
    data = fallbackData || [];
  }

  // ══════════════════════════════════════════════════════════════
  // RE-RANK LOCAL (idêntico ao admin: boost de marca + frase exata)
  // ══════════════════════════════════════════════════════════════
  const queryNorm = removeAccents(combinedSearchText.toLowerCase());
  const queryWordsRaw = queryNorm.split(/\s+/).filter(w => w.length >= 2);
  const brandWords = combinedSearchText
    .split(/\s+/)
    .filter(w => /^[A-Z]{2,}/.test(w) || /^[A-Z][a-záéíóúãõ]+/.test(w))
    .map(w => removeAccents(w.toLowerCase()));
  
  // Também trata keywords que não foram detectadas como "marca" (case insensitive)
  for (const kw of queryKeywords) {
    if (!brandWords.includes(kw) && kw.length >= 3) {
      brandWords.push(kw);
    }
  }

  const scored = data.map((doc: any) => {
    let score = (doc.relevance_score || 0) * 3;
    const contentNorm = removeAccents((doc.content || '').toLowerCase());
    const sourceNorm = removeAccents((doc.source_name || '').toLowerCase());

    // Boost: marca/modelo no nome do arquivo (peso altíssimo)
    for (const brand of brandWords) {
      if (sourceNorm.includes(brand)) score += 50;
      if (contentNorm.includes(brand)) score += 20;
    }

    // Boost: palavras da pergunta no conteúdo
    for (const w of queryWordsRaw) {
      if (contentNorm.includes(w)) score += 5;
    }

    // Mega-boost: frase exata (2+ palavras consecutivas)
    for (let len = Math.min(queryWordsRaw.length, 5); len >= 2; len--) {
      for (let start = 0; start <= queryWordsRaw.length - len; start++) {
        const phrase = queryWordsRaw.slice(start, start + len).join(' ');
        if (contentNorm.includes(phrase)) score += len * 10;
      }
    }

    return { ...doc, score };
  });

  scored.sort((a: any, b: any) => b.score - a.score);
  // Envia até 5 chunks (sweet spot: 95% da qualidade com 30% menos tokens)
  const bestMatches = scored.slice(0, 5);

  // ══════════════════════════════════════════════════════════════
  // 🛡️ RATE LIMITING CLIENT-SIDE (max 20 queries por minuto)
  // ══════════════════════════════════════════════════════════════
  const now = Date.now();
  rateLimitWindow = rateLimitWindow.filter(t => now - t < 60000);
  if (rateLimitWindow.length >= 20) {
    return `⚠️ **Limite de perguntas atingido.** Aguarde um momento antes de enviar outra pergunta. Isso protege o sistema contra sobrecarga.`;
  }
  rateLimitWindow.push(now);

  // 🧊 CHECK CACHE: Se já respondemos uma pergunta similar, retorna do cache
  const chunkSources = bestMatches.map((m: any) => m.source_name || 'unknown');
  const cacheKey = buildCacheKey(query, chunkSources);
  const cached = semanticCache.get(cacheKey);
  if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
    console.log('[DunoIA Mobile] 🧊 CACHE HIT! Retornando resposta cacheada (0 tokens consumidos)');
    return cached.response;
  }

  try {
    // 🎯 CHAMADA VIA EDGE FUNCTION (mesma que o Painel Admin usa)
    // A chave DeepSeek fica nos Secrets do Supabase — ZERO exposição no client
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    
    if (!token) {
      console.error('[DunoIA Mobile] Sem token de autenticação');
      return null;
    }

    const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
    const functionUrl = `${SUPABASE_URL}/functions/v1/duno-ai-generator`;

    // Monta os chunks no formato que a Edge Function espera
    const chunksPayload = bestMatches.map((m: any) => ({
      content: m.content,
      source_name: m.source_name,
      keywords: m.keywords
    }));

    // Histórico conversacional (últimas 4 mensagens — otimizado de 6 para economizar tokens)
    const formattedHistory = history.slice(-4).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

    console.log('[DunoIA Mobile] Chamando Edge Function (API key segura no servidor). Chunks:', chunksPayload.length);

    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        query,
        chunks: chunksPayload,
        history: formattedHistory,
        persona: 'chat',
        lang: userLang
      })
    });

    const json = await response.json();
    
    if (json.answer) {
      // 🧊 STORE CACHE: Salva a resposta para perguntas futuras similares
      semanticCache.set(cacheKey, { response: json.answer, timestamp: Date.now() });
      // Limpa entradas antigas do cache (max 100 entradas)
      if (semanticCache.size > 100) {
        const oldestKey = semanticCache.keys().next().value;
        if (oldestKey) semanticCache.delete(oldestKey);
      }
      return json.answer;
    }

    if (json.error) {
      console.error('[DunoIA Mobile] Edge Function error:', json.error);
      throw new Error(json.error);
    }

    throw new Error('Resposta vazia da Edge Function');
  } catch (err: any) {
    console.error('[DunoIA Mobile] Edge Function error:', err);
    let fb = `⚠️ **Erro de Comunicação com a IA:** ${err.message}\n\nEncontrei informações nos manuais. Aqui estão os trechos relevantes:\n\n`;
    bestMatches.forEach((m: any) => fb += `> "...${(m.content || '').substring(0, 300)}..."\n\n`);
    return fb;
  }
}

// ══════════════════════════════════════════════════════════════
// 📚 BUSCA LISTA DE MANUAIS / MEMÓRIA DISPONÍVEIS NO TENANT
// ══════════════════════════════════════════════════════════════

export interface ManualSummary {
  name: string;
  chunksCount: number;
}

export async function getAvailableManuals(): Promise<ManualSummary[]> {
  const tid = await requireTid();
  if (!tid) return [];

  try {
    const { data, error } = await supabase
      .from('ai_knowledge_base')
      .select('source_name')
      .eq('tenant_id', tid);

    if (error || !data) return [];

    const counts: Record<string, number> = {};
    for (const item of data) {
      const src = (item.source_name || 'Manual Técnico').trim();
      counts[src] = (counts[src] || 0) + 1;
    }

    return Object.entries(counts).map(([name, chunksCount]) => ({
      name,
      chunksCount
    })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('[DunoIA Mobile] Error loading manuals list:', err);
    return [];
  }
}
