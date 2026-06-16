// ═══════════════════════════════════════════════════════════════════
// whatsapp-ai-agent — Motor de Raciocínio com Tool Calling
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
      description: "Busca cliente na base de dados pelo CNPJ (com ou sem formatação) ou pelo número de série de um equipamento. Use quando o usuário fornecer um CNPJ ou número de série.",
      parameters: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CNPJ com ou sem formatação. Ex: 12.345.678/0001-90 ou 12345678000190" },
          serial_number: { type: "string", description: "Número de série do equipamento" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_order_details",
      description: "Busca o status detalhado de uma Ordem de Serviço (OS) pelo número de sequência (ex: OS-1002 ou apenas 1002).",
      parameters: {
        type: "object",
        properties: {
          order_number: { type: "string", description: "Número da OS (ex: 1002 ou OS-1002)" }
        },
        required: ["order_number"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description: "Transfere o atendimento para um atendente humano se o cliente pedir para falar com atendente, ou se a IA não conseguir resolver o problema.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Motivo da transferência" }
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

          if (error || !data) return JSON.stringify({ found: false, message: "Cliente não encontrado com esse CNPJ." });
          return JSON.stringify({ found: true, customer: data });
        }
        if (args.serial_number) {
          const { data, error } = await supabase
            .from("equipments")
            .select("id, name, serial_number, customer_id, customers(id, name, document)")
            .eq("tenant_id", args.tenant_id)
            .eq("serial_number", args.serial_number)
            .limit(1)
            .single();
          debugLogs.push({ event: "db_result_serial", data, error });
          if (error || !data) return JSON.stringify({ found: false, message: "Equipamento não encontrado." });
          return JSON.stringify({ found: true, customer: data.customers, equipment: { id: data.id, name: data.name, serial_number: data.serial_number } });
        }
        return JSON.stringify({ found: false, message: "Parâmetros insuficientes para a busca." });
      }

      case "get_order_details": {
        let seq = args.order_number;
        if (seq.toUpperCase().startsWith("OS-")) {
          seq = seq.substring(3).trim();
        }
        const numericSeq = parseInt(seq, 10);
        if (isNaN(numericSeq)) {
          return JSON.stringify({ found: false, message: "Número de OS inválido." });
        }

        const { data, error } = await supabase
          .from("orders")
          .select("id, status, description, scheduled_at, customers(name)")
          .eq("tenant_id", args.tenant_id)
          .eq("sequence_id", numericSeq)
          .limit(1)
          .single();
        if (error || !data) return JSON.stringify({ found: false, message: "OS não encontrada." });
        return JSON.stringify({ found: true, order: data });
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
    debugLogs.length = 0; // reset logs
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json();
    const { tenant_id, tenant_name, settings, conversation, user_message } = body;
    let customerId = conversation.customer_id;
    let newState = conversation.state;
    const groqApiKey = Deno.env.get("GROQ_API_KEY");

    const recentHistory = conversation.history.slice(-10);
    const llmMessages: any[] = [
      {
        role: "system",
        content: `Você é o assistente virtual da empresa ${tenant_name}.
MUITO IMPORTANTE: Quando o cliente mandar um CNPJ ou Número de Série ou Número da OS, VOCÊ TEM QUE USAR A TOOL CORRESPONDENTE (find_customer ou get_order_details) PARA BUSCAR NO BANCO. NUNCA DE UMA DESCULPA ANTES DE USAR A TOOL!
ESTADO ATUAL DA CONVERSA: ${conversation.state}`,
      },
    ];

    for (const msg of recentHistory) {
      if (msg.role === "user") llmMessages.push({ role: "user", content: msg.content });
      else if (msg.role === "bot") llmMessages.push({ role: "assistant", content: msg.content });
    }
    llmMessages.push({ role: "user", content: user_message });

    let reply = "";
    for (let i = 0; i < 5; i++) {
      const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Authorization": `Bearer ${groqApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: llmMessages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: 0.2,
        }),
      });

      if (!groqResponse.ok) {
        const err = await groqResponse.text();
        return new Response(JSON.stringify({ reply: "Desculpe, tivemos um problema técnico.", debugLogs, error: err }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const data = await groqResponse.json();
      const assistantMsg = data.choices?.[0]?.message;
      if (!assistantMsg) throw new Error("Resposta inválida do Groq");

      llmMessages.push(assistantMsg);

      if (!assistantMsg.tool_calls || assistantMsg.tool_calls.length === 0) {
        reply = assistantMsg.content || "Desculpe, não consegui processar.";
        break;
      }

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
    return new Response(JSON.stringify({ reply: "Desculpe, tivemos um problema técnico. Tente novamente.", error: err.message, debugLogs }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
