// ═══════════════════════════════════════════════════════════════════
// whatsapp-ai-agent — Motor de Raciocínio com Tool Calling (OpenAI)
// ═══════════════════════════════════════════════════════════════════

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOOLS = [
  {
    type: "function",
    function: {
      name: "find_customer",
      description: "Busca cliente na base de dados pelo CNPJ (com ou sem formatação) ou pelo número de série de um equipamento.",
      parameters: {
        type: "object",
        properties: {
          cnpj: { type: "string" },
          serial_number: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_order_details",
      description: "Busca o status de uma Ordem de Serviço pelo número.",
      parameters: {
        type: "object",
        properties: {
          order_number: { type: "string" }
        },
        required: ["order_number"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_orders",
      description: "Busca a lista de Ordens de Serviço (OS) de um cliente pelo CNPJ, ou vinculadas a um equipamento pelo número de série. Retorna o status, agendamento, etc.",
      parameters: {
        type: "object",
        properties: {
          cnpj: { type: "string" },
          serial_number: { type: "string" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description: "Transfere o atendimento para um atendente humano.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" }
        },
        required: ["reason"]
      }
    }
  }
];

const debugLogs: any[] = [];

async function executeTool(
  toolName: string,
  args: Record<string, string>,
  supabase: ReturnType<typeof createClient>
): Promise<string> {
  debugLogs.push({ event: "tool_called", toolName, args });
  try {
    switch (toolName) {
      case "find_customer": {
        const docArg = args.cnpj || args.document;
        if (docArg) {
          const cleanCnpj = docArg.replace(/\D/g, "");
          let formattedCnpj = cleanCnpj;
          if (cleanCnpj.length === 14) {
            formattedCnpj = cleanCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
          } else if (cleanCnpj.length === 11) {
            formattedCnpj = cleanCnpj.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
          }

          const { data, error } = await supabase
            .from("customers")
            .select("id, name, document, email, phone, whatsapp")
            .eq("tenant_id", args.tenant_id)
            .in("document", [cleanCnpj, formattedCnpj])
            .limit(1)
            .single();

          debugLogs.push({ event: "db_result", cleanCnpj, formattedCnpj, tenant_id: args.tenant_id, data, error });

          if (error || !data) return JSON.stringify({ found: false, message: "Cliente não encontrado." });
          return JSON.stringify({ found: true, customer: data });
        }
        if (args.serial_number) {
          // Busca case-insensitive pelo número de série permitindo partes
          const { data, error } = await supabase
            .from("equipments")
            .select("id, name, serial_number, customer_id, customers(id, name, document)")
            .eq("tenant_id", args.tenant_id)
            .ilike("serial_number", `%${args.serial_number.trim()}%`)
            .limit(1)
            .single();
          debugLogs.push({ event: "db_result_serial", data, error });
          if (error || !data) return JSON.stringify({ found: false, message: "Equipamento não encontrado com este número de série." });
          return JSON.stringify({ found: true, customer: data.customers, equipment: { id: data.id, name: data.name, serial_number: data.serial_number } });
        }
        return JSON.stringify({ found: false, message: "Parâmetros insuficientes." });
      }

      case "get_order_details": {
        let seq = args.order_number || "";
        // Remove espaços extras apenas, deixamos o texto porque display_id é string (ex: NEX-1007)
        seq = seq.trim();
        if (!seq) return JSON.stringify({ found: false, message: "Número de OS inválido." });

        const { data, error } = await supabase
          .from("orders")
          .select("id, display_id, status, description, scheduled_date, equipment_name, equipment_model, equipment_serial, customer_name, assigned_to, technician:users(name)")
          .eq("tenant_id", args.tenant_id)
          .ilike("display_id", `%${seq}%`)
          .limit(1)
          .single();
        
        debugLogs.push({ event: "get_order_result", query: seq, data, error });
        if (error || !data) return JSON.stringify({ found: false, message: "OS não encontrada com este número." });
        return JSON.stringify({ found: true, order: data });
      }

      case "list_orders": {
        // A tabela orders tem equipment_serial como coluna direta (sem FK)
        if (args.serial_number) {
          // Busca direta na tabela orders pelo serial do equipamento permitindo partes do serial
          const { data, error } = await supabase
            .from("orders")
            .select("id, display_id, status, priority, description, scheduled_date, equipment_name, equipment_model, equipment_serial, customer_name, assigned_to, technician:users(name)")
            .eq("tenant_id", args.tenant_id)
            .ilike("equipment_serial", `%${args.serial_number.trim()}%`)
            .order("created_at", { ascending: false })
            .limit(30);
          
          debugLogs.push({ event: "list_orders_by_serial", serial: args.serial_number, count: data?.length, error });
          if (error) return JSON.stringify({ error: error.message });
          if (!data || data.length === 0) return JSON.stringify({ found: true, orders: [], message: "Nenhuma OS encontrada para este número de série." });
          return JSON.stringify({ found: true, orders: data });
        }

        if (args.cnpj) {
          const cleanCnpj = args.cnpj.replace(/\D/g, "");
          let formattedCnpj = cleanCnpj;
          if (cleanCnpj.length === 14) formattedCnpj = cleanCnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
          else if (cleanCnpj.length === 11) formattedCnpj = cleanCnpj.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4");
          
          const { data: cData } = await supabase.from("customers").select("name").eq("tenant_id", args.tenant_id).in("document", [cleanCnpj, formattedCnpj]).limit(1).single();
          if (!cData) return JSON.stringify({ found: false, message: "Cliente não encontrado para este CNPJ." });
          
          const { data, error } = await supabase
            .from("orders")
            .select("id, display_id, status, priority, description, scheduled_date, equipment_name, equipment_model, equipment_serial, customer_name, assigned_to, technician:users(name)")
            .eq("tenant_id", args.tenant_id)
            .ilike("customer_name", `%${cData.name}%`)
            .order("created_at", { ascending: false })
            .limit(30);
          
          debugLogs.push({ event: "list_orders_by_cnpj", cnpj: args.cnpj, customer_name: cData.name, count: data?.length, error });
          if (error) return JSON.stringify({ error: error.message });
          if (!data || data.length === 0) return JSON.stringify({ found: true, orders: [], message: "Nenhuma OS encontrada para este cliente." });
          return JSON.stringify({ found: true, orders: data });
        }

        return JSON.stringify({ found: false, message: "Forneça cnpj ou serial_number para consultar as OS." });
      }

      case "escalate_to_human": {
        return JSON.stringify({ escalated: true, message: "Atendimento transferido para humano." });
      }

      default:
        return JSON.stringify({ error: `Tool desconhecida: ${toolName}` });
    }
  } catch (e: any) {
    return JSON.stringify({ error: `Erro na execução da tool: ${e.message}` });
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    debugLogs.length = 0;

    const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAiApiKey) {
      return new Response(JSON.stringify({
        reply: "⚙️ A chave OPENAI_API_KEY não está configurada nos Secrets do Supabase.",
        debugLogs
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    
    // ── Parse e Validação defensiva do body
    let body: any;
    try {
      body = await req.json();
    } catch (e) {
      throw new Error("Body inválido: não é um JSON válido.");
    }

    const { tenant_id, tenant_name, settings, conversation, user_message } = body ?? {};
    
    if (!tenant_id) throw new Error("Campo obrigatório ausente: tenant_id");
    if (!user_message) throw new Error("Campo obrigatório ausente: user_message");
    if (!conversation) throw new Error("Campo obrigatório ausente: conversation");

    let customerId = conversation.customer_id ?? null;
    let newState = conversation.state ?? "GREETING";

    // ── Null-safety: history pode vir como null do banco
    const rawHistory: any[] = Array.isArray(conversation.history) ? conversation.history : [];
    const recentHistory = rawHistory.slice(-10);
    
    const llmMessages: any[] = [
      {
        role: "system",
        content: `Você é Lia, assistente virtual da empresa ${tenant_name ?? "nossa empresa"}, especialista em ordens de serviço.

Sua personalidade: próxima, atenciosa, profissional mas descontraída. Use emojis com naturalidade. Escreva como uma pessoa real — com pontuação natural, sem parecer um formulário.

REGRAS PARA BUSCAR OS:
- Quando o cliente informar um CNPJ ou Número de Série → use IMEDIATAMENTE a tool 'list_orders'
- Quando informar número de OS (ex: 1007, NEX-1007) → use IMEDIATAMENTE a tool 'get_order_details'
- NUNCA diga que não encontrou antes de tentar as tools

REGRAS PARA APRESENTAR OS:
1. Prioridade MÁXIMA: mostrar OS com status ABERTA, EM EXECUÇÃO ou IMPEDIDA
2. SOMENTE SE não houver nenhuma ativa: mostrar a última OS CONCLUÍDA
3. Formato de apresentação:
   🔧 *OS:* NEX-XXXX
   📋 *Status:* Em Execução
   🛠️ *Equipamento:* [nome] — Série: [serial]
   📅 *Agendado:* [data]
   👨‍🔧 *Técnico:* [nome ou "a definir"]
4. Se houver múltiplas OS ativas, liste todas de forma organizada.

OUTRAS REGRAS:
- Para transferir para humano: use 'escalate_to_human'
- Seja caloroso — o cliente não deve perceber que é uma IA
ESTADO ATUAL: ${newState}`,
      },
    ];

    for (const msg of recentHistory) {
      if (!msg?.role || !msg?.content) continue;
      if (msg.role === "user") llmMessages.push({ role: "user", content: msg.content });
      else if (msg.role === "bot") llmMessages.push({ role: "assistant", content: msg.content });
    }
    llmMessages.push({ role: "user", content: user_message });

    let reply = "";

    // ══════════════════════════════════════════════════════
    // LOOP DE TOOL CALLING — OpenAI gpt-4o-mini
    // ══════════════════════════════════════════════════════
    for (let i = 0; i < 5; i++) {
      const openAiResponse = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: llmMessages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: 0.2,
        }),
      });

      if (!openAiResponse.ok) {
        const errObj = await openAiResponse.json();
        throw new Error(`OpenAI API error: ${JSON.stringify(errObj)}`);
      }

      const data = await openAiResponse.json();
      const assistantMsg = data.choices?.[0]?.message;
      if (!assistantMsg) throw new Error("Resposta inválida da OpenAI");

      llmMessages.push(assistantMsg);

      // Sem tool calls → resposta final
      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        reply = assistantMsg.content || "Desculpe, não consegui processar.";
        break;
      }

      // Executar tools
      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name;
        let toolArgs;
        try {
          toolArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch (e) {
          debugLogs.push({ error: "JSON Parse failed for tool arguments", arguments: toolCall.function.arguments });
          toolArgs = {};
        }
        toolArgs.tenant_id = tenant_id;
        const toolResult = await executeTool(toolName, toolArgs, supabase);
        const parsed = JSON.parse(toolResult);

        if (toolName === "find_customer" && parsed.found && parsed.customer) {
          customerId = parsed.customer.id;
          newState = "CUSTOMER_FOUND";
        } else if (toolName === "escalate_to_human" && parsed.escalated) {
          newState = "WAITING_HUMAN";
        }

        llmMessages.push({ role: "tool", tool_call_id: toolCall.id, name: toolName, content: toolResult });
      }
    }

    return new Response(JSON.stringify({ reply, new_state: newState, customer_id: customerId, debugLogs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    const errMsg = err?.message ?? String(err);
    const errStack = err?.stack ?? "";
    console.error("[WPP AI Agent] ERRO CRÍTICO:", errMsg, errStack);
    return new Response(JSON.stringify({
      reply: `Desculpe, tive um problema técnico ao processar sua solicitação. Nossa equipe foi notificada. Por favor, tente novamente.`,
      error: errMsg,
      error_stack: errStack,
      debugLogs
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  }
});
 
