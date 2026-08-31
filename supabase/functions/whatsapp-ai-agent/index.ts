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
      name: "check_customer_registration",
      description: "Busca os dados do cliente e a ordem de serviço atual ativa informando CPF, CNPJ ou Número de Série do equipamento.",
      parameters: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CPF ou CNPJ do cliente com ou sem pontuação. Ex: 123.456.789-00 ou 12.345.678/0001-90" },
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
      description: "Busca a lista de Ordens de Serviço (OS) de um cliente pelo CPF ou CNPJ, ou vinculadas a um equipamento pelo número de série. O sistema aceita tanto CPF quanto CNPJ.",
      parameters: {
        type: "object",
        properties: {
          cnpj: { type: "string", description: "CPF (pessoa física) ou CNPJ (pessoa jurídica) do cliente, com ou sem pontuação. Ex: 123.456.789-00 ou 12.345.678/0001-90" },
          serial_number: { type: "string", description: "Número de série do equipamento" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "escalate_to_human",
      description: "Transfere o atendimento para um atendente humano. Se a empresa estiver fechada, você será instruído a abrir um Ticket.",
      parameters: {
        type: "object",
        properties: {
          reason: { type: "string" }
        },
        required: ["reason"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "request_service_order",
      description: "Registra uma solicitação de abertura de Ordem de Serviço (OS/Chamado) feita pelo cliente. Use quando o cliente pede para abrir um chamado, registrar um problema, solicitar visita técnica ou qualquer tipo de atendimento técnico. Pode ser chamado mesmo sem todos os dados do cliente.",
      parameters: {
        type: "object",
        properties: {
          customer_name: { type: "string", description: "Nome do cliente, se identificado" },
          customer_document: { type: "string", description: "CPF ou CNPJ do cliente, se informado" },
          equipment_serial: { type: "string", description: "Número de série do equipamento, se informado" },
          equipment_name: { type: "string", description: "Nome ou modelo do equipamento" },
          problem_description: { type: "string", description: "Descrição do problema relatado pelo cliente" }
        },
        required: ["problem_description"]
      }
    }
  }
];

const debugLogs: any[] = [];

function isWithinBusinessHours(settings: Record<string, any>): boolean {
  const businessDays = settings.business_days ?? [1, 2, 3, 4, 5];
  const startStr = settings.business_start || "08:00";
  const endStr = settings.business_end || "18:00";

  const now = new Date();
  const spDate = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
  
  const currentDay = spDate.getDay();
  if (!businessDays.includes(currentDay)) return false;

  const currentHour = spDate.getHours();
  const currentMinute = spDate.getMinutes();
  const currentTotal = currentHour * 60 + currentMinute;

  const [startH, startM] = startStr.split(':').map(Number);
  const startTotal = startH * 60 + (startM || 0);

  const [endH, endM] = endStr.split(':').map(Number);
  const endTotal = endH * 60 + (endM || 0);

  return currentTotal >= startTotal && currentTotal <= endTotal;
}

async function executeTool(
  toolName: string,
  args: Record<string, string>,
  supabase: ReturnType<typeof createClient>,
  settings: Record<string, any>
): Promise<string> {
  debugLogs.push({ event: "tool_called", toolName, args });
  try {
    switch (toolName) {
      case "check_customer_registration": {
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
        const isOnline = isWithinBusinessHours(settings);
        if (!isOnline) {
          const outMsg = settings.out_of_office_msg || "Nosso horário de atendimento é de Seg a Sex das 08h às 18h.";
          return JSON.stringify({ 
            escalated: false, 
            message: `SISTEMA: A empresa está FECHADA neste momento. INSTRUÇÃO MÁXIMA: 1) Avise o cliente cordialmente ("${outMsg}"). 2) Execute IMEDIATAMENTE a tool 'request_service_order' para gerar um Ticket com a solicitação do cliente (mesmo sem todos os dados), garantindo que a equipe verá no próximo dia útil.` 
          });
        }
        return JSON.stringify({ escalated: true, message: "Atendimento transferido para humano." });
      }

      case "request_service_order": {
        // Recupera o tenant_id e conversation_id dos args injetados
        const tenantId = args.tenant_id;
        const convId = args.conversation_id || null;
        const phoneNumber = args.phone_number || "";
        const customerId = args.customer_id || null;

        const { data: reqData, error: reqError } = await supabase
          .from("whatsapp_service_requests")
          .insert({
            tenant_id: tenantId,
            conversation_id: convId,
            phone_number: phoneNumber,
            customer_id: customerId,
            customer_name: args.customer_name || null,
            customer_document: args.customer_document || null,
            equipment_serial: args.equipment_serial || null,
            equipment_name: args.equipment_name || null,
            problem_description: args.problem_description,
            status: "PENDING"
          })
          .select("id")
          .single();

        if (reqError) {
          debugLogs.push({ event: "request_service_order_error", error: reqError.message });
          return JSON.stringify({ 
            registered: false, 
            message: "Não foi possível registrar a solicitação no momento. Tente novamente em instantes." 
          });
        }

        const shortTicket = reqData?.id ? reqData.id.substring(0, 6).toUpperCase() : "";
        debugLogs.push({ event: "request_service_order_ok", id: reqData?.id, ticket: shortTicket });
        
        return JSON.stringify({ 
          registered: true, 
          request_id: reqData?.id,
          ticket_number: `Ticket #${shortTicket}`,
          message: `Solicitação registrada com sucesso sob o protocolo #${shortTicket}. Nossa equipe entrará em contato para confirmar o agendamento. (Diga exatamente este número de Ticket para o cliente)` 
        });
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

    const openAiApiKey = Deno.env.get("DEEPSEEK_API_KEY");
    if (!openAiApiKey) {
      return new Response(JSON.stringify({
        reply: "⚙️ A chave DEEPSEEK_API_KEY não está configurada nos Secrets do Supabase.",
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

    const { tenant_id, tenant_name, tenant_cnpj, tenant_address, settings, conversation, user_message } = body ?? {};
    
    if (!tenant_id) throw new Error("Campo obrigatório ausente: tenant_id");
    if (!user_message) throw new Error("Campo obrigatório ausente: user_message");
    if (!conversation) throw new Error("Campo obrigatório ausente: conversation");

    let customerId = conversation.customer_id ?? null;
    let newState = conversation.state ?? "GREETING";

    // ── Null-safety: history pode vir como null do banco
    const rawHistory: any[] = Array.isArray(conversation.history) ? conversation.history : [];
    const recentHistory = rawHistory.slice(-10);

    // Descobre a saudação e despedida com base na hora atual em São Paulo/Brasília
    const now = new Date();
    const spNow = new Date(now.toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
    const spHour = spNow.getHours();
    const spMinute = spNow.getMinutes();
    const spDayOfWeek = spNow.getDay();
    const spHourFormatted = `${String(spHour).padStart(2, '0')}:${String(spMinute).padStart(2, '0')}`;
    const diasSemanaFull: Record<number, string> = {
      0: "Domingo", 1: "Segunda-feira", 2: "Terça-feira", 3: "Quarta-feira",
      4: "Quinta-feira", 5: "Sexta-feira", 6: "Sábado"
    };
    const diaAtual = diasSemanaFull[spDayOfWeek];

    let saudacao = "Bom dia";
    let despedida = "Um excelente dia pra você";
    if (spHour >= 12 && spHour < 18) {
      saudacao = "Boa tarde";
      despedida = "Uma excelente tarde pra você";
    } else if (spHour >= 18) {
      saudacao = "Boa noite";
      despedida = "Uma excelente noite pra você";
    }

    const botName = settings?.bot_name || "Lia";
    const botGender = settings?.bot_gender || "Feminino";
    const wordObrigado = botGender === "Masculino" ? "obrigado" : "obrigada";
    const genderDirective = `\nGÊNERO: Você se identifica no gênero ${botGender}. Ao agradecer ou usar adjetivos para si mesmo(a), adapte a gramática corretamente (ex: use 'obrigado' se masculino, 'obrigada' se feminino).`;

    // Saudação personalizada: usa o campo greeting_message das configurações se preenchido,
    // mas SEMPRE garante que o nome do bot e o nome da empresa estejam presentes.
    const customGreeting = settings?.greeting_message?.trim();
    const firstContactGreeting = customGreeting
      ? `${customGreeting} Sou ${botName}, da equipe da ${tenant_name ?? "empresa"}.`
      : `${saudacao}! Tudo bem? Sou ${botName}, da equipe da ${tenant_name ?? "empresa"}. Como posso te ajudar hoje?`;

    const companyInfo = settings?.company_info
      ? `SOBRE A EMPRESA (LEIA COM ATENÇÃO — use essas informações ao responder qualquer dúvida sobre o que a empresa faz, seus serviços, produtos, marcas e diferenciais):\n${settings.company_info}\n\n`
      : "";
    const cnpjInfo = tenant_cnpj ? `CNPJ DA EMPRESA:\n${tenant_cnpj}\n\n` : "";
    const addressInfo = tenant_address ? `ENDEREÇO DA EMPRESA:\n${tenant_address}\n\n` : "";

    const isOnline = isWithinBusinessHours(settings || {});
    const businessDaysMap: Record<number, string> = { 0: "Dom", 1: "Seg", 2: "Ter", 3: "Qua", 4: "Qui", 5: "Sex", 6: "Sáb" };
    const bDaysArray: number[] = settings?.business_days ?? [1, 2, 3, 4, 5];
    const bDaysStr = bDaysArray.map((d: number) => businessDaysMap[d]).join(", ");
    const bStart = settings?.business_start || "08:00";
    const bEnd = settings?.business_end || "18:00";
    const businessHoursInfo = `HORÁRIO DE ATENDIMENTO:\n- Dias: ${bDaysStr}\n- Horário: ${bStart} às ${bEnd}\n- Status Atual: ${isOnline ? "ABERTO (Equipe online e trabalhando agora)" : "FECHADO (Fora do horário comercial)"}\n\n`;

    // Contexto de data/hora atual em Brasília — a IA DEVE usar isso para responder perguntas sobre dia e hora
    const dateTimeContext = `DATA E HORA ATUAL (Brasília/São Paulo):\n- Dia da semana: ${diaAtual}\n- Horário atual: ${spHourFormatted}\n\n`;

    const llmMessages: any[] = [
      {
        role: "system",
        content: `Você é ${botName}, assistente administrativa e de atendimento da ${tenant_name ?? "nossa empresa"}.
${cnpjInfo}${companyInfo}${addressInfo}${dateTimeContext}${businessHoursInfo}Personalidade: Você é uma atendente humana real digitando no WhatsApp. Seja extremamente natural, prestativa, carismática e transmita total segurança de que o problema do cliente está sendo resolvido com atenção. NUNCA se apresente como IA ou bot.${genderDirective}

DIRETRIZES DE COMUNICAÇÃO:
- Primeiro Contato: APENAS na primeira mensagem da conversa (quando o histórico estiver vazio), diga EXATAMENTE: "${firstContactGreeting}". Se a conversa já estiver em andamento, NUNCA repita o cumprimento ou a apresentação, vá direto ao ponto e seja natural.
- Identificação: Você sempre trabalha para a ${tenant_name ?? "empresa"} e deve deixar isso claro de forma sutil quando relevante.
- Tom: Acolhedor, resolutivo e direto ao ponto. Use pontuação natural de conversas (sem formalidades robóticas). Mostre empatia e garanta que estamos cuidando da solicitação dele.
- Uso de Emojis: Seja EXTREMAMENTE sensato e contido. Não use emojis em todas as mensagens nem coloque "carinhas" no final das frases de forma automática. Use no máximo 1 emoji apenas se o cliente for muito amigável e o tom da conversa for leve. Se o cliente estiver insatisfeito, crítico, agressivo, ou se o assunto for sério/urgente, NÃO use NENHUM emoji. Mantenha uma postura estritamente profissional e empática.
- Fora de Horário (FECHADO): Se o Status Atual for FECHADO, é OBRIGATÓRIO avisar o cliente imediatamente que a empresa está fechada. JAMAIS use os termos "equipe humana" ou "atendimento com humanos". Apresente o aviso bem formatado (ex: "Nosso horário é de ${bStart} às ${bEnd}"). Além disso, se ele tiver um problema, EXECUTE IMEDIATAMENTE a ferramenta 'request_service_order' para criar um chamado e informe o número do Ticket gerado, dizendo que a equipe verá assim que retornar.
- Transferência (APENAS SE ABERTO): Se o Status Atual for ABERTO e você precisar transferir, NUNCA diga "transferir para um humano". Diga de forma natural: "Vou passar o seu contato agora mesmo para um de nossos colaboradores dar sequência, só um instante por favor." e execute 'escalate_to_human'. Se estiver FECHADO, não prometa transferência, apenas aplique a regra de Fora de Horário.
- Encerramento: NUNCA diga que "alguém encerrou" o chat. Diga de forma gentil: "Estou encerrando o seu atendimento por aqui, mas se precisar de mais alguma coisa, é só nos chamar novamente. ${despedida} e muito ${wordObrigado}!"

REGRAS TÉCNICAS (Use as Tools OBRIGATORIAMENTE):
- O cliente passou CPF, CNPJ ou N. de Série? → Execute 'list_orders'.
- O cliente passou Nº de OS (ex: 1007, NEX-1007)? → Execute 'get_order_details'.
- O cliente quer abrir chamado, agendar visita, relatou um problema ou pediu ajuda técnica? → EXECUTE IMEDIATAMENTE a tool 'request_service_order'. NUNCA prometa "vou abrir um chamado" sem efetivamente acionar a ferramenta no MESMO momento. Colete os dados básicos e já execute a tool!
- **ATENÇÃO MÁXIMA:** Se você JÁ abriu um chamado/OS nesta conversa e já passou o número do Ticket para o cliente, e na mensagem seguinte ele apenas pedir urgência, adicionar uma observação extra ou agradecer, **NÃO execute 'request_service_order' novamente**. Apenas responda confirmando de forma empática que você já repassou a urgência/observação para a equipe responsável pelo Ticket atual.
- O cliente quer falar com um atendente, suporte, ou representante? → Execute 'escalate_to_human'. Se o sistema avisar que está fechado, siga as instruções de criar o ticket imediatamente.
- IMPORTANTE: Nunca afirme que não encontrou informações antes de de fato executar as ferramentas de busca.

APRESENTAÇÃO DE O.S.:
Priorize listar OS Ativas (Aberta, Em Execução, Impedida).
Siga este formato rigorosamente:
🔧 *OS:* NEX-XXXX
📋 *Status:* [status]
🛠️ *Equipamento:* [nome] — Série: [serial]
📅 *Agendado:* [data]
👨‍🔧 *Técnico:* [nome]

ESTADO ATUAL: ${newState}`,
      },
    ];


    for (const msg of recentHistory) {
      if (!msg?.role || !msg?.content) continue;
      if (msg.role === "user") {
        llmMessages.push({ role: "user", content: msg.content });
      } else if (msg.role === "bot" || msg.role === "agent") {
        llmMessages.push({ role: "assistant", content: msg.content });
      }
    }
    llmMessages.push({ role: "user", content: user_message });

    let reply = "";

    // ══════════════════════════════════════════════════════
    // LOOP DE TOOL CALLING — DeepSeek Chat
    // ══════════════════════════════════════════════════════
    for (let i = 0; i < 5; i++) {
      const openAiResponse = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${openAiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "deepseek-chat",
          messages: llmMessages,
          tools: TOOLS,
          tool_choice: "auto",
          temperature: 0.2,
        }),
      });

      if (!openAiResponse.ok) {
        const errObj = await openAiResponse.json();
        throw new Error(`DeepSeek API error: ${JSON.stringify(errObj)}`);
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
        // Injeta contexto da conversa para as tools que precisam
        toolArgs.tenant_id = tenant_id;
        toolArgs.conversation_id = conversation.id || null;
        toolArgs.phone_number = conversation.phone_number || "";
        toolArgs.customer_id = customerId;
        const toolResult = await executeTool(toolName, toolArgs, supabase, settings);
        const parsed = JSON.parse(toolResult);

        if (toolName === "check_customer_registration" && parsed.found && parsed.customer) {
          customerId = parsed.customer.id;
          newState = "CUSTOMER_FOUND";
        } else if (toolName === "escalate_to_human" && parsed.escalated) {
          newState = "WAITING_HUMAN";
        } else if (toolName === "request_service_order" && parsed.registered) {
          // Mantém o estado atual, apenas registra a solicitação
          debugLogs.push({ event: "service_request_registered", request_id: parsed.request_id });
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
 
