import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ══════════════════════════════════════════════════════════════
// CACHE DE MODELOS GRATUITOS (reutilizado entre requisições)
// Evita chamar a API /models do OpenRouter a cada pergunta.
// O cache dura 10 minutos e depois é renovado automaticamente.
// ══════════════════════════════════════════════════════════════
interface FreeModel { id: string; contextLength: number; }
let cachedFreeModels: FreeModel[] = [];
let cacheTimestamp = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

serve(async (req) => {
  // CORS preflight
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

    // Não exigiremos strict auth (auth.getUser()) porque os Técnicos e o Master Admin
    // usam sistemas de autenticação customizados que não geram JWTs do Supabase Auth.
    // O RLS do banco de dados (nas chamadas de RAG) e CORS já protegem a função.
    
    // (Código antigo de auth foi removido)



    const { query, chunks } = await req.json();

    if (!query || !chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return new Response(JSON.stringify({ error: "Missing query or chunks" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

    let provider = "google";
    let apiKey = "";

    // ⚡ Prioridade Máxima: Groq Cloud (Extremamente rápido e gratuito).
    if (groqApiKey) {
      provider = "groq";
      apiKey = groqApiKey;
      console.log("⚡ Usando Groq Cloud (Modelos ultra rápidos e gratuitos).");
    } else if (geminiApiKey) {
      provider = "google";
      apiKey = geminiApiKey;
      console.warn("⚠️ AVISO: Usando Google Gemini Nativo. Cuidado com os limites baixos de cota gratuita!");
    } else if (openAiApiKey) {
      if (openAiApiKey.startsWith("sk-or-")) {
        provider = "openrouter"; // (mantém por compatibilidade legada)
      } else if (openAiApiKey.startsWith("gsk_")) {
        provider = "groq";
      } else if (openAiApiKey.startsWith("AIzaSy")) {
        provider = "google";
      } else {
        provider = "openai";
      }
      apiKey = openAiApiKey;
    } else {
      return new Response(JSON.stringify({ error: "Nenhuma API Key (GROQ_API_KEY, GEMINI_API_KEY ou OPENAI_API_KEY) configurada no servidor (Secrets)." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    // Montar o contexto com os chunks extraídos do manual
    const contextText = chunks.map((c: any, i: number) => `Trecho ${i + 1}:\n"${c.content}"`).join("\n\n");
    const systemPrompt = `IDIOMA OBRIGATÓRIO: Português do Brasil (pt-BR). Você DEVE responder SEMPRE em português brasileiro. NUNCA responda em inglês ou outro idioma.

Você é o Duno Copilot, um especialista técnico sênior do sistema de gestão Nexus. Você tem acesso aos manuais técnicos e operacionais da empresa e sua missão é fornecer respostas COMPLETAS, RICAS e PRECISAS.

DIRETRIZES DE COMPORTAMENTO:
1. RACIOCÍNIO SEMÂNTICO AVANÇADO: Não procure apenas palavras exatas. Entenda o "espírito" da pergunta e conecte informações de DIFERENTES trechos para formar uma resposta completa. Se o Trecho 1 fala do procedimento e o Trecho 3 menciona uma observação importante sobre ele, COMBINE as duas informações.
2. SÍNTESE ENTRE TRECHOS: Leia TODOS os trechos fornecidos antes de responder. A resposta completa pode estar distribuída em mais de um trecho.
3. RESPOSTAS RICAS E DETALHADAS: Nunca dê uma resposta de 2 linhas se o manual contém mais informação relevante. Forneça o passo a passo completo, inclua avisos importantes, dicas de segurança, e informe o que acontece depois de cada etapa quando isso for relevante.
4. FORMATO PROFISSIONAL: Use listas numeradas para passo a passos. Use negrito para termos importantes. Organize a resposta em seções se for longa.
5. HONESTIDADE: Se os trechos realmente não contiverem NENHUMA pista sobre o assunto, diga: "Não encontrei informações específicas sobre isso nos manuais disponíveis. Pode descrever melhor o problema para eu ajudar?"
6. CONTEXTO DO SISTEMA: Você conhece o sistema Nexus de gestão de ordens de serviço (OS), técnicos, clientes, equipamentos, regiões de atendimento e relatórios. Use esse conhecimento como base para interpretar as perguntas.

MANUAIS DE REFERÊNCIA PARA A SUA RESPOSTA:
${contextText}

LEMBRETE FINAL: Sua resposta DEVE ser inteiramente em PORTUGUÊS DO BRASIL. Sintetize os trechos acima e entregue a resposta mais completa e útil possível.
`;

    let answer = "";
    
    if (provider === "google") {
      const modelsToTry = [
        "gemini-3.5-flash", 
        "gemini-flash-latest", 
        "gemini-2.5-flash",
        "gemini-2.0-flash"
      ];
      
      let lastError = null;
      let data = null;

      for (const model of modelsToTry) {
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ role: "user", parts: [{ text: query }] }],
              system_instruction: { parts: [{ text: systemPrompt }] },
              generation_config: { temperature: 0.4 }
            }),
          });

          const jsonResponse = await response.json();
          if (jsonResponse.error) {
            if (jsonResponse.error.message?.includes('not found') || jsonResponse.error.code === 404) {
              lastError = jsonResponse.error.message;
              continue;
            }
            throw new Error(`Google Error: ${jsonResponse.error.message}`);
          }
          
          data = jsonResponse;
          break;
        } catch (err: any) {
          lastError = err.message;
        }
      }

      if (!data) {
        try {
          const listResponse = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
          const listData = await listResponse.json();
          const availableModels = listData.models?.map((m: any) => m.name.replace('models/', '')).join(', ');
          
          throw new Error(`\n⚠️ CHAVE GROQ_API_KEY AUSENTE!\nO sistema tentou usar o Groq, mas a chave GROQ_API_KEY não foi encontrada nos Secrets do Supabase.\nComo fallback, tentou usar o Google Gemini, mas falhou: NENHUM MODELO ENCONTRADO na chave do Google.\nA sua chave Google só tem acesso aos modelos:\n[ ${availableModels || 'Nenhum, a chave está vazia ou restrita'} ]`);
        } catch (listErr: any) {
          throw new Error(`A chave GROQ_API_KEY não está no servidor! Fallback pro Google falhou: ${listErr.message}`);
        }
      }
      
      answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if (provider === "groq") {
      // GROQ CLOUD IMPLEMENTATION (Fastest free LPU API)
      let groqModelsToTry = [
        { id: "llama-3.3-70b-versatile", contextLength: 128000 },
        { id: "llama-3.1-8b-instant", contextLength: 128000 },
        { id: "mixtral-8x7b-32768", contextLength: 32768 },
      ];
          
      let allErrors: string[] = [];
      let data = null;

      for (const modelInfo of groqModelsToTry) {
        try {
          console.log(`[Groq] Tentando modelo: ${modelInfo.id} (ctx: ${modelInfo.contextLength} tokens)...`);
          
          let currentSystemPrompt = systemPrompt;
          
          // Calcula limite de caracteres (1 token ≈ 3 caracteres)
          const maxChars = Math.floor(modelInfo.contextLength * 3 * 0.70);
          
          if (currentSystemPrompt.length > maxChars) {
            currentSystemPrompt = currentSystemPrompt.substring(0, maxChars) + "\n\n[... CONTEXTO CORTADO NO LIMITE DA IA ...]";
            console.log(`[Groq] ✂️ Texto cortado para ${maxChars} chars.`);
          }

          // Timeout de 15 segundos para dar tempo de sobra pra Groq (que responde em <2s)
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 15000);

          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`
            },
            body: JSON.stringify({
              model: modelInfo.id,
              messages: [
                { role: "system", content: currentSystemPrompt },
                { role: "user", content: query }
              ]
            }),
          });
          
          clearTimeout(timeoutId);

          const jsonResponse = await response.json();
          if (jsonResponse.error) {
            const errMsg = jsonResponse.error.message;
            allErrors.push(`[${modelInfo.id}]: ${errMsg}`);
            console.error(`[OpenRouter] ❌ Modelo ${modelInfo.id} falhou:`, errMsg);
            continue; // Falhou, tenta o próximo!
          }
          
          console.log(`[OpenRouter] ✅ Sucesso! Modelo usado: ${jsonResponse.model}`);
          data = jsonResponse;
          break; // Sucesso!
        } catch (err: any) {
          allErrors.push(`[${modelInfo.id}]: ${err.message}`);
          console.error(`[OpenRouter] ❌ Erro na requisição do modelo ${modelInfo.id}:`, err.message);
        }
      }

      if (!data) {
        throw new Error(`Nenhum modelo gratuito do OpenRouter funcionou.\nMotivos:\n${allErrors.join('\n')}`);
      }
      answer = data.choices?.[0]?.message?.content || "";
    } else if (provider === "openai") {
      const openAiModel = Deno.env.get("OPENAI_MODEL") || "gpt-4o-mini";
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: openAiModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: query }
          ],
          temperature: 0.4,
        }),
      });

      const data = await response.json();
      if (data.error) {
        throw new Error(`OpenAI Error: ${data.error.message}`);
      }
      answer = data.choices?.[0]?.message?.content || "";
    }

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
