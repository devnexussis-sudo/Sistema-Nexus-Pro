import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// 🛡️ Rate Limiting Server-Side (max 30 requests/min por IP)
const rateLimits = new Map<string, number[]>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const window = rateLimits.get(ip)?.filter(t => now - t < 60000) || [];
  if (window.length >= 30) return false;
  window.push(now);
  rateLimits.set(ip, window);
  return true;
}

// 🧊 Cache Semântico Server-Side (cross-user, context-aware)
const responseCache = new Map<string, { answer: string; timestamp: number }>();
const SERVER_CACHE_TTL = 60 * 60 * 1000; // 1 hora

function buildServerCacheKey(query: string, chunkSources: string[], history?: any[], persona?: string): string {
  let historyKey = 'nohistory';
  if (history && Array.isArray(history) && history.length > 0) {
    const lastMsgs = history.slice(-2).map((m: any) => 
      (typeof m.content === 'string' ? m.content : '').substring(0, 40).toLowerCase().replace(/[^\w]/g, '')
    );
    historyKey = lastMsgs.join('__');
  }
  const q = query.toLowerCase().trim().replace(/[^\w\s]/g, '').split(/\s+/).sort().join('_');
  const s = chunkSources.sort().join('|').toLowerCase();
  const p = persona || 'default';
  return `${p}::${historyKey}::${q}::${s}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Rate limiting por IP
    const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    if (!checkRateLimit(clientIp)) {
      return new Response(JSON.stringify({ error: "Rate limit exceeded. Máximo 30 perguntas por minuto." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 429,
      });
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { query, chunks = [], persona, history, lang } = await req.json();

    if (!query || typeof query !== "string" || !query.trim()) {
      return new Response(JSON.stringify({ error: "Missing or invalid query" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    // ══════════════════════════════════════════════════════
    // CHAVE DEEPSEEK
    // ══════════════════════════════════════════════════════
    const openAiApiKey = Deno.env.get("DEEPSEEK_API_KEY");

    if (!openAiApiKey) {
      return new Response(JSON.stringify({
        error: "A chave DEEPSEEK_API_KEY não foi configurada nos Secrets do Supabase."
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    // ══════════════════════════════════════════════════════
    // MONTAGEM DO CONTEXTO DE TRECHOS (RAG)
    // ══════════════════════════════════════════════════════
    const validChunks = Array.isArray(chunks) ? chunks : [];
    const contextText = validChunks.length > 0
      ? validChunks
          .map((c: any, i: number) => `Trecho ${i + 1} [Fonte: ${c.source_name || "Manual"}]:\n"${c.content}"`)
          .join("\n\n---\n\n")
      : "Nenhum manual específico foi retornado pela busca. Utilize a base de procedimentos padrão do ecossistema DUNO.";

    // Suporte multi-idioma (mobile envia lang: 'pt' | 'en' | 'es')
    const targetLang = lang === 'en' ? 'English (en)' : lang === 'es' ? 'Español (es)' : 'Português do Brasil (pt-BR)';

    const baseSystemPrompt = `IDIOMA OBRIGATÓRIO: ${targetLang}. Responda SEMPRE em ${targetLang}. NUNCA em outro idioma.

Você é a DUNO IA, a inteligência artificial especialista e oficial do ecossistema **DUNO** (Sistema Web ERP e Aplicativo de Campo do Técnico).
Sua missão é responder com precisão cirúrgica, alta assertividade técnica, coerência semântica e fluidez conversacional contínua.

══════════════════════════════════════════════════════════════════════════════════
DIRETRIZES DE ENGENHARIA DE PROMPT & RAG AVANÇADO:
══════════════════════════════════════════════════════════════════════════════════
1. MULTI-TURN & SEGUIMENTO DE CONTEXTO:
   - Siga atentamente o fluxo da conversa através do histórico fornecido. Quando o usuário fizer perguntas de acompanhamento usando pronomes ou elipses ("e como resolvo isso?", "onde fica essa peça?", "qual a voltagem dele?", "o que fazer se não funcionar?"), identifique imediatamente o equipamento, código de erro ou tela do sistema tratado nas mensagens anteriores.
   - NUNCA aja como se a conversa estivesse começando do zero. Mantenha total continuidade e assertividade.

2. FONTES DE CONHECIMENTO & DUPLA ATUAÇÃO:
   Você atua com maestria em duas frentes fundamentadas nos trechos fornecidos:
   a) MANUAIS TÉCNICOS DE EQUIPAMENTOS (Fornos combinados, Fritadeiras, Câmaras, Refrigeração, Lavadoras, etc.):
      - Diagnósticos de falhas, códigos de erro (ex: E18, F04, etc.), testes de sensores (resistência em Ohms), esquemas elétricos, localização de componentes e procedimentos mecânicos/eletrônicos.
      - Seja detalhista, indique valores de teste, escala de instrumentos e cuidados de segurança elétrica/térmica.
   b) SISTEMA OFICIAL DUNO (ERP & APP DO TÉCNICO):
      - Gestão de Ordens de Serviço (OS), Pedidos de Venda (PVD), Orçamentos, Estoque de Peças, Gestão de Clientes, Contratos PMOC, Faturamento, Rotas e Checklists.
      - O sistema se chama exclusivamente **DUNO** (nunca Nexus). Forneça o passo a passo exato de telas, botões e ações no sistema.

3. ESTRUTURAÇÃO & ASSERTIVIDADE:
   - Vá direto ao ponto de forma profissional, segura e sem enrolação.
   - Utilize formatação Markdown rica:
     * **Negrito** para componentes cruciais, códigos de erro e nomes de telas/botões.
     * Listas numeradas (1, 2, 3...) para procedimentos e passo a passo.
     * Alertas de segurança com ícones (ex: ⚠️ **Atenção:** Desconecte a alimentação elétrica antes de...).
   - Conecte informações complementares quando a resposta estiver distribuída entre trechos diferentes.

4. DIRETRIZ DE TRANSPARÊNCIA:
   - Se a dúvida for sobre um modelo específico de equipamento cujo manual não esteja nos trechos disponíveis, informe com elegância e ofereça o direcionamento técnico padrão da boa engenharia de manutenção, sugerindo que o usuário envie o PDF do manual na aba "Memórias" para procedimentos exatos do fabricante.
   - NUNCA invente códigos de peças ou procedimentos incompatíveis.

5. IDENTIDADE:
   - Você é a DUNO IA. Jamais mencione provedores externos de tecnologia como OpenAI ou DeepSeek.

══════════════════════════════════════════════════════════════════════════════════
TRECHOS DE CONHECIMENTO DISPONÍVEIS:
══════════════════════════════════════════════════════════════════════════════════
${contextText}

LEMBRETE: Responda estritamente em ${targetLang}. Seja resolutiva, inteligente e completa.`;

    // Persona de chat (app mobile / suporte de campo) — acolhedor, rápido, prático e companheiro de bancada
    const finalSystemPrompt = persona === "chat"
      ? baseSystemPrompt + `\n\n══════════════════════════════════════════════════════════════════════════════════
DIRETRIZ DE PERSONALIDADE — APP DO TÉCNICO DE CAMPO:
══════════════════════════════════════════════════════════════════════════════════
Você está conversando diretamente com um técnico em campo ou na bancada de manutenção.
- Seja um parceiro de trabalho experiente, ágil, prestativo e animado!
- Use emojis úteis (🔧, ⚡, 📋, 💡, 🚀) para tornar a leitura dinâmica na tela do celular.
- Dê instruções no estilo "mão na massa": onde posicionar as pontas de prova, o que observar visualmente, como isolar o defeito com rapidez e segurança.
- Mantenha o técnico seguro e confiante no diagnóstico!`
      : baseSystemPrompt;

    // ══════════════════════════════════════════════════════
    // MONTAGEM DAS MENSAGENS (com histórico multi-turn)
    // ══════════════════════════════════════════════════════
    const messages: any[] = [
      { role: "system", content: finalSystemPrompt },
    ];

    // Injeta histórico conversacional recente (até 6 mensagens anteriores)
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-6)) {
        if (msg && msg.role && msg.content && typeof msg.content === 'string') {
          const role = msg.role === 'user' ? 'user' : 'assistant';
          messages.push({
            role,
            content: msg.content.trim()
          });
        }
      }
    }

    messages.push({ role: "user", content: query.trim() });

    // ══════════════════════════════════════════════════════
    // VERIFICAR CACHE SERVER-SIDE
    // ══════════════════════════════════════════════════════
    const chunkSources = validChunks.map((c: any) => c.source_name || 'unknown');
    const cacheKey = buildServerCacheKey(query, chunkSources, history, persona);
    const cached = responseCache.get(cacheKey);

    if (cached && (Date.now() - cached.timestamp) < SERVER_CACHE_TTL) {
      console.log(`[Duno AI] 🧊 CACHE HIT (Server-Side)! Retornando resposta instantânea (0 tokens)`);
      return new Response(JSON.stringify({ answer: cached.answer }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════
    // CHAMADA DEEPSEEK — deepseek-chat
    // ══════════════════════════════════════════════════════
    console.log(`[Duno AI] Chamando DeepSeek-chat (${validChunks.length} chunks, ${history?.length || 0} msgs histórico, persona: ${persona || 'default'})...`);

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        temperature: 0.1, // Temperatura baixa para máxima assertividade e fidelidade técnica
        max_tokens: 2500,
      }),
    });

    const json = await response.json();

    if (!response.ok || json.error) {
      const errMsg = json.error?.message || JSON.stringify(json.error) || "Erro desconhecido na DeepSeek API";
      console.error("[Duno AI] DeepSeek erro:", errMsg);
      return new Response(JSON.stringify({ error: `DeepSeek: ${errMsg}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    const answer = json.choices?.[0]?.message?.content;
    if (!answer) {
      return new Response(JSON.stringify({ error: "DeepSeek retornou resposta vazia." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    console.log("[Duno AI] ✓ Resposta recebida com sucesso.");

    // Salva no cache antes de retornar
    responseCache.set(cacheKey, { answer, timestamp: Date.now() });
    
    // Cleanup de segurança (max 500 itens no cache)
    if (responseCache.size > 500) {
      const oldestKey = responseCache.keys().next().value;
      if (oldestKey) responseCache.delete(oldestKey);
    }

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("[Duno AI] Erro geral:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
