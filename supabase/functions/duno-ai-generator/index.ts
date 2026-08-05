import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { query, chunks, persona } = await req.json();

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

    const systemPrompt = `IDIOMA OBRIGATÓRIO: Português do Brasil (pt-BR). Responda SEMPRE em português. NUNCA em inglês.

Você é a Duno IA, assistente inteligente oficial do sistema de gestão **Duno**. Sua missão é dar respostas COMPLETAS, RICAS e PRECISAS baseadas nos manuais fornecidos.

DIRETRIZES:
1. RACIOCÍNIO SEMÂNTICO: Entenda o "espírito" da pergunta. Conecte informações de trechos diferentes para uma resposta completa.
2. SÍNTESE COMPLETA: Leia TODOS os trechos antes de responder. A resposta pode estar distribuída em mais de um trecho.
3. RESPOSTAS DETALHADAS: Inclua passo a passo completo, avisos de segurança, e informações que complementem a dúvida.
4. FORMATO PROFISSIONAL: Use listas numeradas para passos, negrito para termos importantes, organize em seções se necessário.
5. HONESTIDADE: Se os trechos não tiverem a informação, diga: "Não encontrei nos manuais disponíveis. Pode detalhar melhor?"
6. CONTEXTO DUNO: Você conhece o sistema Duno — OS, técnicos, clientes, equipamentos, regiões e relatórios. O sistema se chama DUNO, nunca Nexus.

MANUAIS DE REFERÊNCIA:
${contextText}

LEMBRETE: Responda EXCLUSIVAMENTE em PORTUGUÊS DO BRASIL. Seja completo e útil.`;

    // Persona de chat (painel flutuante) — mais bem-humorado e com emojis
    const finalSystemPrompt = persona === "chat"
      ? systemPrompt + `\n\nDIRETRIZ DE PERSONALIDADE ESPECIAL: Você está conversando em um chat flutuante de suporte direto com o usuário. Seja EXTREMAMENTE bem-humorado, amigável, acolhedor e use BASTANTE emojis nas suas respostas! O sistema se chama DUNO (nunca Nexus). Faça o usuário sorrir enquanto responde com precisão.`
      : systemPrompt;

    // ══════════════════════════════════════════════════════
    // CHAMADA DEEPSEEK — deepseek-chat
    // ══════════════════════════════════════════════════════
    console.log("[Duno AI] Chamando DeepSeek-chat...");

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: [
          { role: "system", content: finalSystemPrompt },
          { role: "user", content: query },
        ],
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
