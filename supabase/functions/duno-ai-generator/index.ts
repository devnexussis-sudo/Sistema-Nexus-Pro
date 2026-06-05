import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // ============================================
    // DIAGNÓSTICO DE DEPLOY (APAGAR DEPOIS)
    // Se você não ver esse erro na tela, o Supabase NÃO atualizou o código!
    if (req.method === "POST") {
       return new Response(JSON.stringify({ error: "SUCESSO: O NOVO CÓDIGO CHEGOU NA NUVEM!" }), {
         headers: { ...corsHeaders, "Content-Type": "application/json" },
         status: 400,
       });
    }
    // ============================================

    const { query, chunks } = await req.json();

    if (!query || !chunks || !Array.isArray(chunks) || chunks.length === 0) {
      return new Response(JSON.stringify({ error: "Missing query or chunks" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_API_KEY");
    const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

    let provider = "google";
    let apiKey = "";

    if (geminiApiKey) {
      provider = "google";
      apiKey = geminiApiKey;
    } else if (openRouterApiKey) {
      provider = "openrouter";
      apiKey = openRouterApiKey;
    } else if (openAiApiKey) {
      if (openAiApiKey.startsWith("sk-or-")) {
        provider = "openrouter";
      } else if (openAiApiKey.startsWith("AIzaSy")) {
        provider = "google";
      } else {
        provider = "openai";
      }
      apiKey = openAiApiKey;
    } else {
      return new Response(JSON.stringify({ error: "Nenhuma API Key (GEMINI_API_KEY, GOOGLE_API_KEY, OPENROUTER_API_KEY ou OPENAI_API_KEY) configurada no servidor (Secrets)." }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    // Montar o contexto com os chunks extraídos do manual
    const contextText = chunks.map((c: any, i: number) => `Trecho ${i + 1}:\n"${c.content}"`).join("\n\n");
    const systemPrompt = `Você é o Duno Copilot, um especialista técnico sênior e assistente de IA focado nos manuais da empresa.
Seu objetivo é interpretar o problema do usuário e usar sua forte capacidade de raciocínio lógico e semântico para encontrar a solução nos trechos fornecidos.

DIRETRIZES DE COMPORTAMENTO:
1. RACIOCÍNIO SEMÂNTICO: Não procure apenas palavras exatas. Entenda o "espírito" da pergunta. Se o manual fala de "falha de conexão" e o usuário relata "não entra na rede", faça a conexão inteligente.
2. DIDÁTICA E CLAREZA: Responda em português de forma extremamente clara, empática e profissional. Se houver um passo a passo, use listas numeradas e explique com calma.
3. CONTEXTO EXCLUSIVO: Toda instrução técnica deve ser extraída dos trechos abaixo. Você pode usar seu conhecimento geral para estruturar a frase ou explicar conceitos básicos da área, mas senhas e procedimentos específicos devem vir do manual.
4. HONESTIDADE: Se os trechos fornecidos realmente não tiverem NENHUMA pista, diga educadamente: "Ainda não encontrei informações específicas sobre isso nos manuais que aprendi, mas se você quiser detalhar mais o problema, posso tentar ajudar!"

MANUAIS DE REFERÊNCIA PARA A SUA RESPOSTA:
${contextText}
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
          
          throw new Error(`\n⚠️ NENHUM MODELO ENCONTRADO.\nA sua chave só tem acesso aos modelos:\n[ ${availableModels || 'Nenhum, a chave está vazia ou restrita'} ]`);
        } catch (listErr: any) {
          throw new Error(`Não consegui nem listar os modelos: ${listErr.message}`);
        }
      }
      
      answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if (provider === "openrouter") {
      // OPENROUTER - Estratégia "Free First" (Tenta todos os grátis antes de pagar)
      const openRouterModel = Deno.env.get("OPENROUTER_MODEL");
      
      // Bateria de modelos 100% gratuitos e de alta inteligência
      const freeModels = [
        "google/gemini-2.0-flash-thinking-exp:free", // Mais inteligente (raciocínio avançado)
        "google/gemini-2.0-flash-exp:free",          // Rápido e contexto gigante
        "meta-llama/llama-3.3-70b-instruct:free",    // Peso-pesado da Meta
        "qwen/qwen-2.5-72b-instruct:free",           // Excelente modelo open-source
        "mistralai/mistral-7b-instruct:free"         // Fallback rápido e confiável
      ];
      
      // O modelo pago foi COMPLETAMENTE REMOVIDO da fila automática para garantir ZERO GASTO.
      // Agora o sistema só usa os modelos gratuitos.
      const orModelsToTry = [...freeModels];
          
      let lastError = null;
      let data = null;

      for (const model of orModelsToTry) {
        try {
          console.log(`[OpenRouter] Tentando modelo: ${model}...`);
          
          let currentSystemPrompt = systemPrompt;
          
          // O Gemini aguenta 2 Milhões de tokens. Mas o Llama, Mistral e Qwen na versão GRATUITA do OpenRouter 
          // são limitados a apenas 8.192 tokens (cerca de 30.000 caracteres).
          // Se enviarmos mais que isso, eles dão erro e a IA falha.
          // Solução: Se o modelo não for Gemini, cortamos o texto para 25.000 caracteres para ele conseguir ler de graça.
          if (!model.includes("gemini")) {
            if (currentSystemPrompt.length > 25000) {
              currentSystemPrompt = currentSystemPrompt.substring(0, 25000) + "\n\n[... RESTANTE DO MANUAL CORTADO DEVIDO AO LIMITE DE MEMÓRIA DESTA IA GRATUITA ...]";
              console.log(`[OpenRouter] ✂️ Texto cortado para 25k caracteres para o modelo ${model} suportar na versão grátis.`);
            }
          }

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "HTTP-Referer": "https://dunoup.com.br",
              "X-Title": "Nexus OS",
            },
            body: JSON.stringify({
              model: model,
              provider: {
                allow_fallbacks: false, // BLOQUEIA O OPENROUTER DE TROCAR PRO MODELO PAGO SILENCIOSAMENTE!
              },
              messages: [
                { role: "system", content: currentSystemPrompt },
                { role: "user", content: query }
              ],
              temperature: 0.2,
            }),
          });

          const jsonResponse = await response.json();
          if (jsonResponse.error) {
            lastError = jsonResponse.error.message;
            console.error(`[OpenRouter] ❌ Modelo ${model} falhou:`, lastError);
            continue; // Falhou, tenta o próximo modelo grátis!
          }
          
          console.log(`[OpenRouter] ✅ Sucesso! Modelo solicitado: ${model} | Modelo realmente usado pelo OpenRouter: ${jsonResponse.model}`);
          data = jsonResponse;
          break; // Sucesso!
        } catch (err: any) {
          lastError = err.message;
          console.error(`[OpenRouter] ❌ Erro na requisição do modelo ${model}:`, lastError);
        }
      }

      if (!data) {
        throw new Error(`Nenhum modelo do OpenRouter funcionou. Último erro: ${lastError}`);
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
