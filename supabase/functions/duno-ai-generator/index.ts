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
    // CHAVES DE API — apenas Groq e Google como fallback
    // ══════════════════════════════════════════════════════
    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");

    if (!groqApiKey && !geminiApiKey) {
      return new Response(JSON.stringify({
        error: "Nenhuma API Key configurada no servidor. Configure GROQ_API_KEY nos Secrets do Supabase."
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

    // Se a requisição veio do Chatbot Global, adiciona a persona bem-humorada
    const finalSystemPrompt = persona === 'chat' 
      ? systemPrompt + `\n\nDIRETRIZ DE PERSONALIDADE ESPECIAL: Você está conversando em um chat flutuante de suporte direto com o usuário. Seja EXTREMAMENTE bem-humorado, amigável, acolhedor e use BASTANTE emojis/stickers nas suas respostas! O sistema se chama DUNO (nunca Nexus). Faça o usuário sorrir enquanto responde com precisão.`
      : systemPrompt;

    let answer = "";

    // ══════════════════════════════════════════════════════
    // GROQ CLOUD — Modelo principal (ultra rápido, gratuito)
    // ══════════════════════════════════════════════════════
    if (groqApiKey) {
      const groqModels = [
        { id: "llama-3.3-70b-versatile", contextLength: 128000 },
        { id: "llama-3.1-8b-instant", contextLength: 128000 },
        { id: "gemma2-9b-it", contextLength: 8192 },
      ];

      let allErrors: string[] = [];
      let data = null;

      for (const modelInfo of groqModels) {
        try {
          console.log(`[Groq] ▶ Tentando: ${modelInfo.id}`);

          // Garante que o prompt caiba no contexto do modelo (1 token ≈ 3 chars)
          const maxChars = Math.floor(modelInfo.contextLength * 3 * 0.75);
          const finalPromptText = finalSystemPrompt.length > maxChars
            ? finalSystemPrompt.substring(0, maxChars) + "\n\n[... contexto cortado por limite do modelo ...]"
            : finalSystemPrompt;

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s timeout

          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${groqApiKey}`,
            },
            body: JSON.stringify({
              model: modelInfo.id,
              messages: [
                { role: "system", content: finalPromptText },
                { role: "user", content: query },
              ],
              temperature: 0.2,
              max_tokens: 2048,
            }),
          });

          clearTimeout(timeoutId);

          const json = await response.json();

          if (json.error) {
            const errMsg = json.error.message || json.error.type || JSON.stringify(json.error);
            allErrors.push(`[${modelInfo.id}]: ${errMsg}`);
            console.error(`[Groq] ✗ ${modelInfo.id} falhou:`, errMsg);
            continue;
          }

          const content = json.choices?.[0]?.message?.content;
          if (!content) {
            allErrors.push(`[${modelInfo.id}]: Resposta vazia`);
            continue;
          }

          console.log(`[Groq] ✓ Sucesso com: ${modelInfo.id}`);
          answer = content;
          data = json;
          break;

        } catch (err: any) {
          allErrors.push(`[${modelInfo.id}]: ${err.message}`);
          console.error(`[Groq] ✗ Erro em ${modelInfo.id}:`, err.message);
        }
      }

      // Fallback para Gemini se todos os modelos Groq falharam
      if (!data && geminiApiKey) {
        console.warn("[Groq] Todos os modelos falharam. Tentando Google Gemini como fallback...");
        // Cai no bloco do Gemini abaixo
        const geminiModels = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-flash-latest"];
        for (const model of geminiModels) {
          try {
            const response = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  contents: [{ role: "user", parts: [{ text: query }] }],
                  system_instruction: { parts: [{ text: systemPrompt }] },
                  generation_config: { temperature: 0.2, max_output_tokens: 2048 }
                }),
              }
            );
            const json = await response.json();
            if (json.error) continue;
            const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
            if (content) { answer = content; break; }
          } catch { continue; }
        }
      }

      if (!answer) {
        return new Response(JSON.stringify({
          error: `Groq Cloud não respondeu. Erros:\n${allErrors.join('\n')}`
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }

    // ══════════════════════════════════════════════════════
    // GOOGLE GEMINI — Usado somente se não houver chave Groq
    // ══════════════════════════════════════════════════════
    } else if (geminiApiKey) {
      const geminiModels = ["gemini-2.0-flash", "gemini-2.5-flash", "gemini-flash-latest"];
      let found = false;

      for (const model of geminiModels) {
        try {
          console.log(`[Gemini] ▶ Tentando: ${model}`);
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                contents: [{ role: "user", parts: [{ text: query }] }],
                system_instruction: { parts: [{ text: systemPrompt }] },
                generation_config: { temperature: 0.2, max_output_tokens: 2048 }
              }),
            }
          );
          const json = await response.json();
          if (json.error) { console.error(`[Gemini] ✗ ${model}:`, json.error.message); continue; }
          const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
          if (content) { answer = content; found = true; console.log(`[Gemini] ✓ Sucesso com: ${model}`); break; }
        } catch (err: any) {
          console.error(`[Gemini] ✗ Erro em ${model}:`, err.message);
        }
      }

      if (!found) {
        return new Response(JSON.stringify({ error: "Gemini também não respondeu. Verifique as chaves de API nos Secrets." }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 500,
        });
      }
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
