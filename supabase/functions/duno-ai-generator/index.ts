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

// 🧊 Cache Semântico Server-Side (cross-user, cross-session)
// Se 2 técnicos perguntam a mesma coisa = 1 chamada DeepSeek, não 2
const responseCache = new Map<string, { answer: string; timestamp: number }>();
const SERVER_CACHE_TTL = 60 * 60 * 1000; // 1 hora

function buildServerCacheKey(query: string, chunkSources: string[]): string {
  const q = query.toLowerCase().trim().replace(/[^\w\s]/g, '').split(/\s+/).sort().join('_');
  const s = chunkSources.sort().join('|').toLowerCase();
  return `${q}::${s}`;
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

    const { query, chunks, persona, history, lang } = await req.json();

    if (!query || !chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return new Response(JSON.stringify({ error: "Missing query or chunks" }), {
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
    // MONTAGEM DO PROMPT
    // ══════════════════════════════════════════════════════
    const contextText = chunks
      .map((c: any, i: number) => `Trecho ${i + 1} (Fonte: ${c.source_name || "Manual"}):\n"${c.content}"`)
      .join("\n\n---\n\n");

    // Suporte multi-idioma (mobile envia lang: 'pt' | 'en' | 'es')
    const targetLang = lang === 'en' ? 'English (en)' : lang === 'es' ? 'Español (es)' : 'Português do Brasil (pt-BR)';

    const systemPrompt = `IDIOMA OBRIGATÓRIO: ${targetLang}. Responda SEMPRE em ${targetLang}. NUNCA em outro idioma.

Você é a Duno IA, assistente inteligente oficial do sistema de gestão **Duno**. Sua missão é dar respostas COMPLETAS, RICAS e PRECISAS baseadas nos manuais fornecidos.

DIRETRIZES:
1. RACIOCÍNIO SEMÂNTICO: Entenda o "espírito" da pergunta. Conecte informações de trechos diferentes para uma resposta completa.
2. SÍNTESE COMPLETA: Leia TODOS os trechos antes de responder. A resposta pode estar distribuída em mais de um trecho.
3. RESPOSTAS DETALHADAS: Inclua passo a passo completo, avisos de segurança, e informações que complementem a dúvida.
4. FORMATO PROFISSIONAL: Use listas numeradas para passos, negrito para termos importantes, organize em seções se necessário.
5. HONESTIDADE: Se os trechos não tiverem a informação, diga: "Não encontrei nos manuais disponíveis. Pode detalhar melhor?" NÃO invente dados.
6. CONTEXTO DUNO: Você conhece o sistema Duno — OS, técnicos, clientes, equipamentos, regiões e relatórios. O sistema se chama DUNO, nunca Nexus.

MANUAIS DE REFERÊNCIA:
${contextText}

LEMBRETE: Responda EXCLUSIVAMENTE em ${targetLang}. Seja completo e útil.`;

    // Persona de chat (app mobile) — mais bem-humorado e com emojis
    const finalSystemPrompt = persona === "chat"
      ? systemPrompt + `\n\nDIRETRIZ DE PERSONALIDADE ESPECIAL: Você está conversando em um chat de suporte direto com o técnico em campo. Seja EXTREMAMENTE bem-humorado, amigável, acolhedor e use BASTANTE emojis nas suas respostas! Faça o técnico se sentir apoiado enquanto responde com precisão técnica.`
      : systemPrompt;

    // ══════════════════════════════════════════════════════
    // MONTAGEM DAS MENSAGENS (com histórico multi-turn)
    // ══════════════════════════════════════════════════════
    const messages: any[] = [
      { role: "system", content: finalSystemPrompt },
    ];

    // Injeta histórico conversacional se disponível (últimas 4 mensagens)
    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-4)) {
        if (msg.role && msg.content) {
          messages.push({
            role: msg.role === 'user' ? 'user' : 'assistant',
            content: msg.content
          });
        }
      }
    }

    messages.push({ role: "user", content: query });

    // ══════════════════════════════════════════════════════
    // VERIFICAR CACHE SERVER-SIDE
    // ══════════════════════════════════════════════════════
    const chunkSources = chunks.map((c: any) => c.source_name || 'unknown');
    const cacheKey = buildServerCacheKey(query, chunkSources);
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
    console.log(`[Duno AI] Chamando DeepSeek-chat (${chunks.length} chunks, ${history?.length || 0} msgs histórico)...`);

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages,
        temperature: 0.2,
        max_tokens: 2048,
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
