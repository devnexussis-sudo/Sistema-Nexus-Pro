// ═══════════════════════════════════════════════════════════════════
// whatsapp-ai-agent — Motor de Raciocínio com Tool Calling
// Groq LLaMA 3.1 70B decide ações, executa tools no banco e gera resposta
// ═══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Tool Definitions ──────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "find_customer",
      description: "Busca cliente na base de dados pelo CNPJ (com ou sem formatação) ou pelo número de série de um equipamento. Use quando o usuário fornecer um CNPJ ou número de série.",
      parameters: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CNPJ com ou sem formatação. Ex: 12.345.678/0001-90 ou 12345678000190" },
          serial_number: { type: "string", description: "Número de série do equipamento" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_orders",
      description: "Lista as ordens de serviço abertas, em andamento ou recentes do cliente identificado. Retorna ID, status, descrição e técnico.",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "UUID do cliente" },
        },
        required: ["customer_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_order_details",
      description: "Retorna detalhes completos de uma OS específica pelo código de exibição (ex: OS-2847) ou pelo UUID.",
      parameters: {
        type: "object",
        properties: {
          order_ref: { type: "string", description: "Código da OS (ex: OS-2847) ou UUID" },
          tenant_id: { type: "string", description: "UUID do tenant" },
        },
        required: ["order_ref", "tenant_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_service_order",
      description: "Abre uma nova ordem de serviço para o cliente. Confirme os dados com o cliente antes de criar.",
      parameters: {
        type: "object",
        properties: {
          customer_id: { type: "string", description: "UUID do cliente" },
          tenant_id: { type: "string", description: "UUID do tenant" },
          description: { type: "string", description: "Descrição do problema relatado pelo cliente" },
          equipment_serial: { type: "string", description: "Número de série do equipamento com problema (opcional)" },
          priority: { type: "string", enum: ["low", "medium", "high"], description: "Prioridade: low, medium ou high" },
        },
        required: ["customer_id", "tenant_id", "description"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_public_link",
      description: "Gera o link público de acompanhamento de uma OS para enviar ao cliente.",
      parameters: {
        type: "object",
        properties: {
          order_id: { type: "string", description: "UUID da OS" },
        },
        required: ["order_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description: "Transfere a conversa para um agente humano quando o bot não conseguir resolver.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Motivo da escalada" },
        },
        required: ["reason"],
      },
    },
  },
];

// ── Tool Executor ─────────────────────────────────────────────────────────────

async function executeTool(
  toolName: string,
  args: Record<string, string>,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  console.log(`[AI Agent] 🔧 Executando tool: ${toolName}`, args);

  try {
    switch (toolName) {
      case "find_customer": {
        if (args.cnpj) {
          const cleanCnpj = args.cnpj.replace(/\D/g, "");
          let formattedCnpj = cleanCnpj;
          if (cleanCnpj.length === 14) {
             formattedCnpj = cleanCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
          } else if (cleanCnpj.length === 11) {
             formattedCnpj = cleanCnpj.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
          }

          const { data, error } = await supabase
            .from("customers")
            .select("id, name, trading_name, document, email, phone, whatsapp")
            .eq("tenant_id", args.tenant_id)
            .or(`document.eq.${cleanCnpj},document.eq.${formattedCnpj}`)
            .limit(1)
            .single();

          if (error || !data) return JSON.stringify({ found: false, message: "Cliente não encontrado com esse CNPJ." });
          return JSON.stringify({ found: true, customer: data });
        }

        if (args.serial_number) {
          const { data, error } = await supabase
            .from("equipments")
            .select("id, serial_number, model, customer_id, customers!inner(id, name, trading_name, document, tenant_id)")
            .eq("customers.tenant_id", args.tenant_id)
            .ilike("serial_number", `%${args.serial_number}%`)
            .limit(1)
            .single();

          if (error || !data) return JSON.stringify({ found: false, message: "Equipamento não encontrado com esse número de série." });
          return JSON.stringify({ found: true, customer: (data as any).customers, equipment: { id: data.id, serial: data.serial_number, model: data.model } });
        }

        return JSON.stringify({ found: false, message: "Forneça CNPJ ou número de série." });
      }

      case "list_orders": {
        const { data, error } = await supabase
          .from("orders")
          .select("id, display_id, sequence_number, title, status, operation_type, created_at, users(name)")
          .eq("customer_id", args.customer_id)
          .not("status", "in", "(CANCELADO,CONCLUÍDO)")
          .order("created_at", { ascending: false })
          .limit(5);

        if (error) return JSON.stringify({ error: error.message });
        if (!data || data.length === 0) return JSON.stringify({ orders: [], message: "Nenhum chamado em aberto encontrado." });

        const orders = data.map((o: any) => ({
          id: o.id,
          code: o.display_id || `OS-${o.sequence_number || o.id.substring(0, 6).toUpperCase()}`,
          title: o.title,
          status: o.status,
          type: o.operation_type,
          created_at: o.created_at,
          technician: o.users?.name || "Não atribuído",
        }));

        return JSON.stringify({ orders });
      }

      case "get_order_details": {
        let query = supabase
          .from("orders")
          .select("id, display_id, sequence_number, title, description, status, operation_type, created_at, start_date, scheduled_date, public_token, users(name, phone), customers(name, trading_name)");

        if (args.order_ref.includes("-") && args.order_ref.length < 20) {
          // Código de exibição como "OS-2847"
          query = query.or(`display_id.eq.${args.order_ref},display_id.ilike.%${args.order_ref}%`);
        } else {
          query = query.eq("id", args.order_ref);
        }

        if (args.tenant_id) {
          query = query.eq("tenant_id", args.tenant_id);
        }

        const { data, error } = await query.limit(1).single();
        if (error || !data) return JSON.stringify({ error: "OS não encontrada." });

        const order: any = data;
        const publicLink = order.public_token
          ? `${Deno.env.get("SUPABASE_URL")?.replace("supabase.co/", "supabase.co/").split("/rest")[0]}/os/public/${order.public_token}`
          : null;

        return JSON.stringify({
          id: order.id,
          code: order.display_id || `OS-${order.sequence_number}`,
          title: order.title,
          description: order.description,
          status: order.status,
          type: order.operation_type,
          technician: order.users?.name || "Não atribuído",
          technician_phone: order.users?.phone,
          customer: order.customers?.trading_name || order.customers?.name,
          scheduled_date: order.scheduled_date,
          started_at: order.start_date,
          public_link: publicLink,
        });
      }

      case "create_service_order": {
        const priorityMap: Record<string, string> = {
          low: "BAIXA",
          medium: "MÉDIA",
          high: "ALTA",
        };

        const { data, error } = await supabase
          .from("orders")
          .insert({
            tenant_id: args.tenant_id,
            customer_id: args.customer_id,
            title: args.description.substring(0, 100),
            description: args.description,
            status: "ABERTA",
            priority: priorityMap[args.priority || "medium"] || "MÉDIA",
            source: "whatsapp_bot",
          })
          .select("id, display_id, sequence_number")
          .single();

        if (error || !data) return JSON.stringify({ error: "Falha ao criar OS: " + error?.message });

        const order: any = data;
        const code = order.display_id || `OS-${order.sequence_number || order.id.substring(0, 6).toUpperCase()}`;
        return JSON.stringify({ created: true, order_id: order.id, code });
      }

      case "get_public_link": {
        const { data, error } = await supabase
          .from("orders")
          .select("public_token")
          .eq("id", args.order_id)
          .single();

        if (error || !data?.public_token) return JSON.stringify({ link: null, message: "Link público não disponível para esta OS." });

        // Domínio da aplicação — usar variável de ambiente
        const appDomain = Deno.env.get("APP_DOMAIN") || "https://app.duno.com.br";
        const link = `${appDomain}/os/public/${data.public_token}`;
        return JSON.stringify({ link });
      }

      case "escalate_to_human": {
        return JSON.stringify({ escalated: true, reason: args.reason });
      }

      default:
        return JSON.stringify({ error: "Tool não reconhecida: " + toolName });
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[AI Agent] Tool ${toolName} erro:`, msg);
    return JSON.stringify({ error: msg });
  }
}

// ── Main Handler ──────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { tenant_id, tenant_name, settings, conversation, user_message } = await req.json();

    const groqApiKey = Deno.env.get("GROQ_API_KEY");
    if (!groqApiKey) throw new Error("GROQ_API_KEY não configurada.");

    const botName = settings.bot_name || `Assistente ${tenant_name}`;
    const greetingInstruction = settings.greeting_message || `Olá! Sou o assistente virtual da *${tenant_name}*. Para começar, por favor me informe seu *CNPJ* ou o *número de série* do equipamento.`;

    // ── Montar histórico para o LLM (últimas 10 mensagens)
    const recentHistory = conversation.history.slice(-10);
    const llmMessages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: `Você é ${botName}, assistente virtual de atendimento ao cliente da empresa *${tenant_name}*.

MISSÃO: Atender clientes de forma profissional, humanizada e eficiente via WhatsApp.

REGRAS:
1. Sempre se comunique em PORTUGUÊS BRASILEIRO informal e amigável
2. Use emojis com moderação para humanizar (✅ 📋 🔧 ⏳ 🙋)
3. Seja CONCISO — mensagens curtas funcionam melhor no WhatsApp
4. NUNCA invente informações — use sempre as tools para buscar dados reais
5. Ao identificar o cliente, SEMPRE confirme o nome antes de prosseguir
6. Ao abrir OS, SEMPRE confirme os dados com o cliente antes de criar
7. Quando não souber resolver, use escalate_to_human
8. IMPORTANTÍSSIMO: Se não localizar o CNPJ, solicite ao cliente que informe o NÚMERO DE SÉRIE do equipamento ou o NÚMERO DA OS (se ele já tiver uma aberta).
9. Formate listas com emojis numerados: 1️⃣ 2️⃣ 3️⃣

ESTADO ATUAL DA CONVERSA: ${conversation.state}
CLIENTE IDENTIFICADO: ${conversation.customer_id ? "Sim (customer_id: " + conversation.customer_id + ")" : "Não identificado ainda"}
TENANT ID: ${tenant_id}

Se for a primeira mensagem (estado GREETING), use a saudação abaixo:
${greetingInstruction}`,
      },
    ];

    for (const msg of recentHistory) {
      if (msg.role === "user") llmMessages.push({ role: "user", content: msg.content });
      else if (msg.role === "bot") llmMessages.push({ role: "assistant", content: msg.content });
    }

    llmMessages.push({ role: "user", content: user_message });

    // ── Loop de raciocínio com Tool Calling (máx 5 iterações)
    let reply = "";
    let newState = conversation.state;
    let customerId = conversation.customer_id;
    const MAX_ITERATIONS = 5;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${groqApiKey}`,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: llmMessages,
          tools: TOOLS,
          tool_choice: "auto",
          max_tokens: 800,
          temperature: 0.4,
        }),
      });

      if (!groqResponse.ok) {
        const errText = await groqResponse.text();
        throw new Error("Groq API error: " + errText);
      }

      const groqData = await groqResponse.json();
      const choice = groqData.choices?.[0];
      const assistantMsg = choice?.message;

      if (!assistantMsg) throw new Error("Resposta inválida do Groq");

      // Adicionar resposta do assistente ao histórico do loop
      llmMessages.push(assistantMsg);

      // Se não há tool calls, temos a resposta final
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        reply = assistantMsg.content || "Desculpe, não consegui processar sua solicitação.";
        break;
      }

      // Executar cada tool call
      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name;
        // Injetar o tenant_id nos argumentos para evitar acesso cruzado e unificar a chamada
        const toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        toolArgs.tenant_id = tenant_id;

        const toolResult = await executeTool(toolName, toolArgs, supabase);
        const parsed = JSON.parse(toolResult);

        // Atualizar estado baseado no resultado das tools
        if (toolName === "find_customer" && parsed.found && parsed.customer) {
          customerId = parsed.customer.id;
          newState = "CUSTOMER_FOUND";
        } else if (toolName === "list_orders") {
          newState = "VIEWING_ORDERS";
        } else if (toolName === "create_service_order" && parsed.created) {
          newState = "CUSTOMER_FOUND"; // volta ao menu após criar
        } else if (toolName === "escalate_to_human" && parsed.escalated) {
          newState = "WAITING_HUMAN";
        }

        // Adicionar resultado da tool ao histórico
        llmMessages.push({
          role: "tool",
          content: toolResult,
          // @ts-ignore — Groq espera tool_call_id
          tool_call_id: toolCall.id,
        });
      }

      // Se todas as tools foram executadas, continuar loop para gerar resposta final
    }

    if (!reply) {
      reply = "Desculpe, não consegui processar sua solicitação no momento. Tente novamente ou digite *ATENDENTE* para falar com um humano.";
    }

    return new Response(
      JSON.stringify({ reply, new_state: newState, customer_id: customerId }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[AI Agent] Erro:", msg);
    return new Response(
      JSON.stringify({ reply: "Desculpe, tivemos um problema técnico. Tente novamente em instantes.", error: msg }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 }
    );
  }
});
