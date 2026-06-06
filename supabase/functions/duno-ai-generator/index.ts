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
    const openRouterApiKey = Deno.env.get("OPENROUTER_API_KEY");
    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");

    let provider = "google";
    let apiKey = "";

    // ⚡ Prioridade: OpenRouter (pois oferece modelos com limites generosos/gratuitos).
    // O problema de lentidão foi resolvido reduzindo os chunks na busca.
    if (openRouterApiKey) {
      provider = "openrouter";
      apiKey = openRouterApiKey;
      console.log("⚡ Usando OpenRouter (Modelos gratuitos, alto limite).");
    } else if (geminiApiKey) {
      provider = "google";
      apiKey = geminiApiKey;
      console.warn("⚠️ AVISO: Usando Google Gemini Nativo. Cuidado com os limites baixos de cota gratuita!");
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
    const systemPrompt = `IDIOMA OBRIGATÓRIO: Português do Brasil (pt-BR). Você DEVE responder SEMPRE em português brasileiro. NUNCA responda em inglês ou outro idioma.

Você é o Duno Copilot, um especialista técnico sênior e assistente de IA focado nos manuais da empresa.
Seu objetivo é interpretar o problema do usuário e usar sua forte capacidade de raciocínio lógico e semântico para encontrar a solução nos trechos fornecidos.

DIRETRIZES DE COMPORTAMENTO:
1. RACIOCÍNIO SEMÂNTICO: Não procure apenas palavras exatas. Entenda o "espírito" da pergunta. Se o manual fala de "falha de conexão" e o usuário relata "não entra na rede", faça a conexão inteligente.
2. DIDÁTICA E CLAREZA: Responda SEMPRE em PORTUGUÊS DO BRASIL de forma clara, empática e profissional. Se houver um passo a passo, use listas numeradas.
3. CONTEXTO EXCLUSIVO: Toda instrução técnica deve ser extraída dos trechos abaixo. Você pode usar seu conhecimento geral para estruturar a frase ou explicar conceitos básicos da área, mas senhas e procedimentos específicos devem vir do manual.
4. HONESTIDADE: Se os trechos fornecidos realmente não tiverem NENHUMA pista, diga educadamente: "Ainda não encontrei informações específicas sobre isso nos manuais que aprendi, mas se você quiser detalhar mais o problema, posso tentar ajudar!"
5. RIQUEZA DE DETALHES: Como o sistema agora é ultra rápido, você NÃO precisa ser excessivamente resumido. Forneça respostas completas, ricas em contexto. Se houver informações adicionais importantes no manual que complementem a dúvida do usuário (como dicas de segurança, avisos ou passos seguintes), INCLUA-AS. Entregue a melhor e mais completa experiência de suporte.

MANUAIS DE REFERÊNCIA PARA A SUA RESPOSTA:
${contextText}

LEMBRETE FINAL: Sua resposta DEVE ser inteiramente em PORTUGUÊS DO BRASIL.
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
          
          throw new Error(`\n⚠️ CHAVE OPENROUTER AUSENTE!\nO sistema tentou usar o OpenRouter, mas a chave OPENROUTER_API_KEY não foi encontrada nos Secrets do Supabase.\nComo fallback, tentou usar o Google Gemini, mas falhou: NENHUM MODELO ENCONTRADO na chave do Google.\nA sua chave Google só tem acesso aos modelos:\n[ ${availableModels || 'Nenhum, a chave está vazia ou restrita'} ]`);
        } catch (listErr: any) {
          throw new Error(`A chave OPENROUTER_API_KEY não está no servidor! Fallback pro Google falhou: ${listErr.message}`);
        }
      }
      
      answer = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    } else if (provider === "openrouter") {
      // OPENROUTER - Descobre os modelos GRATUITOS disponíveis DINAMICAMENTE via API!
      // Usa CACHE para não perder tempo buscando a lista em toda pergunta.
      
      const now = Date.now();
      if (cachedFreeModels.length === 0 || (now - cacheTimestamp) > CACHE_TTL_MS) {
        try {
          console.log("[OpenRouter] 🔍 Atualizando cache de modelos gratuitos...");
          const modelsResponse = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { "Authorization": `Bearer ${apiKey}` }
          });
          const modelsData = await modelsResponse.json();
          
          if (modelsData.data && Array.isArray(modelsData.data)) {
            cachedFreeModels = modelsData.data
              .filter((m: any) => 
                m.id.endsWith(":free") && 
                m.pricing?.prompt === "0" && 
                m.pricing?.completion === "0"
              )
              .sort((a: any, b: any) => (b.context_length || 0) - (a.context_length || 0))
              .slice(0, 4)
              .map((m: any) => ({ id: m.id, contextLength: m.context_length || 8192 }));
            
            cacheTimestamp = now;
            console.log(`[OpenRouter] ✅ Cache atualizado: ${cachedFreeModels.length} modelos gratuitos.`);
            cachedFreeModels.forEach(m => console.log(`  - ${m.id} (ctx: ${m.contextLength})`));
          }
        } catch (fetchErr: any) {
          console.warn("[OpenRouter] ⚠️ Falha ao buscar modelos. Usando cache anterior ou fallback:", fetchErr.message);
        }
      } else {
        console.log(`[OpenRouter] ⚡ Usando cache de modelos (${cachedFreeModels.length} modelos, cache tem ${Math.round((now - cacheTimestamp) / 1000)}s).`);
      }
      
      let orModelsToTry = [
        // O OpenRouter rotaciona os modelos gratuitos. Estes são os ATUAIS disponíveis:
        // "openrouter/free" é um modelo especial que roteia automaticamente para o melhor grátis disponível!
        { id: "openrouter/free", contextLength: 200000 },
        { id: "google/gemma-4-31b-it:free", contextLength: 262144 },
        { id: "meta-llama/llama-3.2-3b-instruct:free", contextLength: 131072 },
        { id: "qwen/qwen3-coder:free", contextLength: 1048576 },
        ...cachedFreeModels
      ];
      
      // Remove duplicados e limita a 4 tentativas para evitar longas esperas
      orModelsToTry = orModelsToTry.filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i).slice(0, 4);
          
      let allErrors: string[] = [];
      let data = null;

      for (const modelInfo of orModelsToTry) {
        try {
          console.log(`[OpenRouter] Tentando modelo: ${modelInfo.id} (ctx: ${modelInfo.contextLength} tokens)...`);
          
          let currentSystemPrompt = systemPrompt;
          
          // Calcula o limite de caracteres baseado no contexto REAL do modelo.
          // 1 token ≈ 3 caracteres. Usamos 70% da capacidade para deixar margem segura.
          // Ex: Llama 3.3 com 128k tokens → pode receber até ~268.000 caracteres!
          const maxChars = Math.floor(modelInfo.contextLength * 3 * 0.70);
          
          if (currentSystemPrompt.length > maxChars) {
            currentSystemPrompt = currentSystemPrompt.substring(0, maxChars) + "\n\n[... CONTEXTO CORTADO NO LIMITE DESTA IA GRATUITA ...]";
            console.log(`[OpenRouter] ✂️ Texto cortado para ${maxChars} chars (${modelInfo.contextLength} tokens disponíveis em ${modelInfo.id}).`);
          } else {
            console.log(`[OpenRouter] ✅ Contexto completo enviado: ${currentSystemPrompt.length} chars de ${maxChars} disponíveis.`);
          }

          // Timeout rigoroso: se o modelo gratuito travar ou estiver lento, 
          // abortamos em 10 segundos e pulamos para o próximo!
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000);

          const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            signal: controller.signal,
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${apiKey}`,
              "HTTP-Referer": "https://dunoup.com.br",
              "X-Title": "Nexus OS",
            },
            body: JSON.stringify({
              model: modelInfo.id,
              provider: {
                allow_fallbacks: false, // BLOQUEIA O OPENROUTER DE TROCAR PRO MODELO PAGO!
              },
              messages: [
                { role: "system", content: currentSystemPrompt },
                { role: "user", content: query }
              ],
              temperature: 0.2,
              max_tokens: 1000, // Dá liberdade total pra IA detalhar a resposta
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
