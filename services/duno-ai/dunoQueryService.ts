// ============================================================
// src/services/dunoQueryService.ts
// 🧠 Duno IA — Varredura inteligente do banco de dados Nexus OS
// ============================================================

import { supabase } from '../supabase';
// Tenant context removido: vamos buscar via auth profile


// ── Status reais do banco (OrderStatus enum) ──────────────────
// PENDENTE | ATRIBUÍDO | EM DESLOCAMENTO | EM ANDAMENTO | CONCLUÍDO | CANCELADO | IMPEDIDO
const STATUS_DB: Record<string, string> = {
  pendente:        'PENDENTE',
  atribuido:       'ATRIBUÍDO',
  deslocamento:    'EM DESLOCAMENTO',
  em_andamento:    'EM ANDAMENTO',
  concluido:       'CONCLUÍDO',
  cancelado:       'CANCELADO',
  impedido:        'IMPEDIDO',
};

const STATUS_LABEL: Record<string, string> = {
  'PENDENTE':         'Pendente',
  'ATRIBUÍDO':        'Atribuído',
  'EM DESLOCAMENTO':  'Em Deslocamento',
  'EM ANDAMENTO':     'Em Andamento',
  'CONCLUÍDO':        'Concluída',
  'CANCELADO':        'Cancelada',
  'IMPEDIDO':         'Impedida',
};

const STATUS_EMOJI: Record<string, string> = {
  'PENDENTE':         '🕐',
  'ATRIBUÍDO':        '👤',
  'EM DESLOCAMENTO':  '🚗',
  'EM ANDAMENTO':     '🔧',
  'CONCLUÍDO':        '✅',
  'CANCELADO':        '❌',
  'IMPEDIDO':         '🚫',
};

// ── Prioridades reais do banco ────────────────────────────────
const PRIORITY_DB: Record<string, string> = {
  baixa:    'BAIXA',
  media:    'MÉDIA',
  alta:     'ALTA',
  critica:  'CRÍTICA',
  urgente:  'CRÍTICA',
};

const PRIORITY_LABEL: Record<string, string> = {
  'BAIXA':   'Baixa',
  'MÉDIA':   'Média',
  'ALTA':    'Alta',
  'CRÍTICA': 'Urgente/Crítica',
};

// ── Helper: garante tenant ────────────────────────────────────
async function requireTid(): Promise<string | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return undefined;
  const { data } = await supabase
      .from('technicians')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle();
  return data?.tenant_id;
}

// ══════════════════════════════════════════════════════════════
// FUNÇÕES DE QUERY
// ══════════════════════════════════════════════════════════════

async function countOrders(statusDb?: string): Promise<number> {
  const tid = await requireTid();
  if (!tid) return 0;
  let q = supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
  if (statusDb) q = q.eq('status', statusDb);
  const { count } = await q;
  return count ?? 0;
}

async function countOrdersByPriority(priorityDb: string): Promise<number> {
  const tid = await requireTid();
  if (!tid) return 0;
  const { count } = await supabase
    .from('orders').select('id', { count: 'exact', head: true })
    .eq('tenant_id', tid).eq('priority', priorityDb);
  return count ?? 0;
}

async function getOrdersByStatus(): Promise<Record<string, number>> {
  const tid = await requireTid();
  if (!tid) return {};
  const { data } = await supabase.from('orders').select('status').eq('tenant_id', tid);
  if (!data) return {};
  const map: Record<string, number> = {};
  for (const o of data) { map[o.status] = (map[o.status] || 0) + 1; }
  return map;
}

async function getOrdersByPriority(): Promise<Record<string, number>> {
  const tid = await requireTid();
  if (!tid) return {};
  const { data } = await supabase.from('orders').select('priority').eq('tenant_id', tid);
  if (!data) return {};
  const map: Record<string, number> = {};
  for (const o of data) { map[o.priority] = (map[o.priority] || 0) + 1; }
  return map;
}

async function countCustomers(): Promise<number> {
  const tid = await requireTid();
  if (!tid) return 0;
  const { count } = await supabase.from('customers').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
  return count ?? 0;
}

async function countTechnicians(): Promise<number> {
  const tid = await requireTid();
  if (!tid) return 0;
  const { count } = await supabase.from('technicians').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
  return count ?? 0;
}

async function countUsers(): Promise<number> {
  const tid = await requireTid();
  if (!tid) return 0;
  const { count } = await supabase.from('users').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
  return count ?? 0;
}

async function countEquipments(): Promise<number> {
  const tid = await requireTid();
  if (!tid) return 0;
  const { count } = await supabase.from('equipments').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
  return count ?? 0;
}

async function getEquipmentWarrantyStats(): Promise<{ inWarranty: number; outWarranty: number; noInfo: number }> {
  const tid = await requireTid();
  if (!tid) return { inWarranty: 0, outWarranty: 0, noInfo: 0 };
  const { data } = await supabase
    .from('equipments').select('manufacturing_date, warranty_months').eq('tenant_id', tid);
  if (!data) return { inWarranty: 0, outWarranty: 0, noInfo: 0 };
  const now = new Date();
  let inW = 0, outW = 0, noI = 0;
  for (const eq of data) {
    if (!eq.manufacturing_date || !eq.warranty_months) { noI++; continue; }
    const expiry = new Date(eq.manufacturing_date);
    expiry.setMonth(expiry.getMonth() + Number(eq.warranty_months));
    if (expiry > now) inW++; else outW++;
  }
  return { inWarranty: inW, outWarranty: outW, noInfo: noI };
}

async function countQuotes(statusFilter?: string): Promise<number> {
  const tid = await requireTid();
  if (!tid) return 0;
  let q = supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
  if (statusFilter) q = q.eq('status', statusFilter);
  const { count } = await q;
  return count ?? 0;
}

async function countContracts(): Promise<number> {
  const tid = await requireTid();
  if (!tid) return 0;
  const { count } = await supabase.from('contracts').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
  return count ?? 0;
}

async function countStockItems(): Promise<number> {
  const tid = await requireTid();
  if (!tid) return 0;
  const { count } = await supabase.from('stock_items').select('id', { count: 'exact', head: true }).eq('tenant_id', tid);
  return count ?? 0;
}

// ══════════════════════════════════════════════════════════════
// DETECTOR DE INTENÇÃO — SEMÂNTICO E ABRANGENTE
// ══════════════════════════════════════════════════════════════

export interface DataIntent {
  type: string;
  statusDb?: string;       // valor exato do banco para filtrar
  priorityDb?: string;
  quoteStatus?: string;
}

export function detectDataIntent(input: string): DataIntent | null {
  // Normaliza: minúsculas, sem acentos
  const raw = input.toLowerCase();
  const l   = raw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // ── helpers ──
  // Usa regex com fronteiras de palavras. Termos curtos (<=3) = palavra exata. Termos longos = permite prefixo (ex: "impedi" casa "impedidas")
  const has = (...terms: string[]) => terms.some(t => {
    if (t.length <= 3) return new RegExp(`(^|\\b|\\s)${t}(\\b|\\s|$)`).test(l);
    return new RegExp(`(^|\\b|\\s)${t}`).test(l);
  });
  const isAboutOS = () => has('os', 'ordem', 'ordens', 'atividade', 'atividades', 'chamado', 'chamados', 'servico', 'servicos');
  const isAboutCount = () => has('quant', 'total', 'numero', 'num', 'quantas', 'quantos', 'tenho', 'temos', 'tem', 'existe', 'existem', 'ha', 'há');

  // ── STATUS DE OS ──────────────────────────────────────────

  // Concluída / Encerrada / Finalizada
  if (isAboutOS() && has('conclu', 'encerr', 'finaliz', 'fechad', 'done', 'termina')) {
    if (!has('por status', 'distribuicao', 'distribuição')) {
      return { type: 'orders', statusDb: 'CONCLUÍDO' };
    }
  }
  // Cancelada
  if (isAboutOS() && has('cancel')) {
    return { type: 'orders', statusDb: 'CANCELADO' };
  }
  // Impedida / Bloqueada / Travada
  if (isAboutOS() && has('impedi', 'bloquea', 'bloqueio', 'trava', 'parad')) {
    return { type: 'orders', statusDb: 'IMPEDIDO' };
  }
  // Em Andamento / Em Execução / Aberta / Em campo
  if (isAboutOS() && (has('andamento', 'execuc', 'execução', 'em campo', 'em curso', 'acontecendo'))) {
    return { type: 'orders', statusDb: 'EM ANDAMENTO' };
  }
  // Em Deslocamento / Indo / Viajando
  if (isAboutOS() && has('deslocamento', 'deslocando', 'indo', 'caminho', 'transit', 'viagem')) {
    return { type: 'orders', statusDb: 'EM DESLOCAMENTO' };
  }
  // Pendente / Aguardando / Não iniciada / Nova
  if (isAboutOS() && has('pendente', 'aguardando', 'nao iniciada', 'nova', 'novas', 'abertas', 'aberta')) {
    return { type: 'orders', statusDb: 'PENDENTE' };
  }
  // Atribuída / Alocada / Designada
  if (isAboutOS() && has('atribu', 'aloca', 'designa', 'assinada')) {
    return { type: 'orders', statusDb: 'ATRIBUÍDO' };
  }

  // Distribuição por status / Resumo de OS
  if (isAboutOS() && has('por status', 'distribuic', 'distribuicao', 'cada status', 'todos status', 'resumo', 'panorama', 'visao geral', 'visão geral')) {
    return { type: 'orders_by_status' };
  }

  // Total geral de OS (sem filtro de status)
  if (isAboutOS() && isAboutCount()) {
    return { type: 'orders_total' };
  }

  // ── PRIORIDADE DE OS ─────────────────────────────────────
  if (isAboutOS() && has('prioridade', 'urgente', 'urgencia', 'urgência', 'critica', 'critico')) {
    if (has('critica', 'critico', 'urgente')) return { type: 'orders_priority', priorityDb: 'CRÍTICA' };
    if (has('alta'))   return { type: 'orders_priority', priorityDb: 'ALTA' };
    if (has('media'))  return { type: 'orders_priority', priorityDb: 'MÉDIA' };
    if (has('baixa'))  return { type: 'orders_priority', priorityDb: 'BAIXA' };
    return { type: 'orders_by_priority' };
  }

  // ── CLIENTES ─────────────────────────────────────────────
  if (has('client') && (isAboutCount() || has('cadastr', 'registr', 'meus'))) {
    return { type: 'customers' };
  }

  // ── TÉCNICOS ─────────────────────────────────────────────
  if (has('tecnic') && (isAboutCount() || has('cadastr', 'registr', 'equipe', 'meus'))) {
    return { type: 'technicians' };
  }

  // ── USUÁRIOS ─────────────────────────────────────────────
  if ((has('usuario', 'user') || (has('pessoa') && has('sistema'))) && (isAboutCount() || has('cadastr', 'registr'))) {
    return { type: 'users' };
  }

  // ── EQUIPAMENTOS / ATIVOS ────────────────────────────────
  if (has('garantia') && has('equipamento', 'ativo', 'maquina', 'aparelho')) {
    return { type: 'warranty' };
  }
  if (has('garantia') && (isAboutCount() || has('status', 'situacao'))) {
    return { type: 'warranty' };
  }
  if ((has('equipamento', 'ativo', 'patrimonio', 'maquina', 'aparelho')) && (isAboutCount() || has('cadastr'))) {
    return { type: 'equipments' };
  }

  // ── ORÇAMENTOS ───────────────────────────────────────────
  if (has('orcamento', 'proposta') && (isAboutCount() || has('cadastr', 'meus', 'aprovad', 'pendente', 'recusad'))) {
    if (has('aprovad'))  return { type: 'quotes', quoteStatus: 'approved' };
    if (has('pendente')) return { type: 'quotes', quoteStatus: 'pending' };
    if (has('recusad'))  return { type: 'quotes', quoteStatus: 'rejected' };
    return { type: 'quotes' };
  }

  // ── CONTRATOS / PMOC ─────────────────────────────────────
  if (has('contrato', 'pmoc', 'preventiva', 'manutencao planejada') && isAboutCount()) {
    return { type: 'contracts' };
  }

  // ── ESTOQUE / PEÇAS ──────────────────────────────────────
  if ((has('estoque', 'peca', 'pecas', 'item', 'itens', 'material', 'materiais', 'produto')) && (isAboutCount() || has('meu', 'cadastr'))) {
    return { type: 'stock' };
  }

  // ── RESUMO GERAL ─────────────────────────────────────────
  if (
    has('resumo geral', 'resumo completo', 'resumo do sistema') ||
    has('visao geral do sistema', 'visão geral do sistema') ||
    has('como esta o sistema', 'como está o sistema') ||
    has('me da um resumo', 'me dê um resumo', 'overview') ||
    (has('tudo') && has('sistema'))
  ) {
    return { type: 'summary' };
  }

  return null;
}

// ══════════════════════════════════════════════════════════════
// EXECUTOR — gera resposta em linguagem natural
// ══════════════════════════════════════════════════════════════

export async function executeDataQuery(intent: DataIntent, userName: string): Promise<string> {
  const tid = await requireTid();
  if (!tid) {
    return `${userName}, não consegui identificar sua sessão. Recarregue a página e tente novamente. 🔄`;
  }

  try {
    switch (intent.type) {

      case 'orders_total': {
        const total = await countOrders();
        return `${userName}, o sistema tem **${total} OS** no total. 📋\n\nQuer ver a distribuição por status? É só pedir!`;
      }

      case 'orders': {
        const statusDb = intent.statusDb!;
        const count = await countOrders(statusDb);
        const label = STATUS_LABEL[statusDb] || statusDb;
        const emoji = STATUS_EMOJI[statusDb] || '📋';
        if (count === 0) return `${userName}, não há nenhuma OS com status **${label}** no momento. ${emoji}`;
        return `${userName}, você tem **${count} OS ${label}${count > 1 ? 's' : ''}** no sistema. ${emoji}`;
      }

      case 'orders_by_status': {
        const byStatus = await getOrdersByStatus();
        const total = Object.values(byStatus).reduce((a, b) => a + b, 0);
        if (total === 0) return `${userName}, não há OS cadastradas ainda. 📋`;
        let msg = `${userName}, aqui está a distribuição das suas OS por status:\n\n📊 **Total: ${total} OS**\n`;
        // Ordena por quantidade decrescente
        const sorted = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
        for (const [status, count] of sorted) {
          const emoji = STATUS_EMOJI[status] || '•';
          const label = STATUS_LABEL[status] || status;
          msg += `\n${emoji} **${label}**: ${count}`;
        }
        return msg;
      }

      case 'orders_priority': {
        const priorityDb = intent.priorityDb!;
        const count = await countOrdersByPriority(priorityDb);
        const label = PRIORITY_LABEL[priorityDb] || priorityDb;
        if (count === 0) return `${userName}, não há OS com prioridade **${label}** no momento.`;
        return `${userName}, você tem **${count} OS** com prioridade **${label}**. ⚡`;
      }

      case 'orders_by_priority': {
        const byPriority = await getOrdersByPriority();
        const total = Object.values(byPriority).reduce((a, b) => a + b, 0);
        if (total === 0) return `${userName}, não há OS cadastradas ainda.`;
        let msg = `${userName}, aqui está a distribuição das OS por prioridade:\n\n📊 **Total: ${total} OS**\n`;
        for (const [priority, count] of Object.entries(byPriority).sort((a, b) => b[1] - a[1])) {
          msg += `\n⚡ **${PRIORITY_LABEL[priority] || priority}**: ${count}`;
        }
        return msg;
      }

      case 'customers': {
        const count = await countCustomers();
        return `${userName}, você tem **${count} cliente${count !== 1 ? 's' : ''}** cadastrado${count !== 1 ? 's' : ''} no sistema. 👥`;
      }

      case 'technicians': {
        const count = await countTechnicians();
        return `${userName}, você tem **${count} técnico${count !== 1 ? 's' : ''}** cadastrado${count !== 1 ? 's' : ''}. 🔧`;
      }

      case 'users': {
        const count = await countUsers();
        return `${userName}, existem **${count} usuário${count !== 1 ? 's' : ''}** registrado${count !== 1 ? 's' : ''} no sistema. 👤`;
      }

      case 'equipments': {
        const count = await countEquipments();
        return `${userName}, você tem **${count} equipamento${count !== 1 ? 's' : ''}** cadastrado${count !== 1 ? 's' : ''} nos Ativos. ⚙️`;
      }

      case 'warranty': {
        const w = await getEquipmentWarrantyStats();
        const total = w.inWarranty + w.outWarranty + w.noInfo;
        if (total === 0) return `${userName}, não há equipamentos cadastrados nos Ativos ainda. ⚙️`;
        return (
          `${userName}, aqui está o status de garantia dos seus equipamentos:\n\n` +
          `📊 **Total: ${total} equipamentos**\n\n` +
          `✅ **Em Garantia**: ${w.inWarranty}\n` +
          `❌ **Fora de Garantia**: ${w.outWarranty}\n` +
          `⚠️ **Sem Informação de Garantia**: ${w.noInfo}\n\n` +
          `_Garantia calculada a partir da data de fabricação + meses de garantia cadastrados em **Ativos**._`
        );
      }

      case 'quotes': {
        const count = await countQuotes(intent.quoteStatus);
        const label = intent.quoteStatus
          ? ({ approved: 'Aprovados', pending: 'Pendentes', rejected: 'Recusados' }[intent.quoteStatus] || '')
          : '';
        return `${userName}, você tem **${count} Orçamento${count !== 1 ? 's' : ''}${label ? ' ' + label : ''}** no sistema. 💰`;
      }

      case 'contracts': {
        const count = await countContracts();
        return `${userName}, você tem **${count} Contrato${count !== 1 ? 's' : ''}/PMOC** cadastrado${count !== 1 ? 's' : ''}. 📄`;
      }

      case 'stock': {
        const count = await countStockItems();
        return `${userName}, o Estoque tem **${count} item${count !== 1 ? 's' : ''}** cadastrado${count !== 1 ? 's' : ''}. 📦`;
      }

      case 'summary': {
        const [byStatus, clients, techs, users, equips, warranty, quotes, contracts, stock] = await Promise.all([
          getOrdersByStatus(),
          countCustomers(),
          countTechnicians(),
          countUsers(),
          countEquipments(),
          getEquipmentWarrantyStats(),
          countQuotes(),
          countContracts(),
          countStockItems(),
        ]);
        const totalOS = Object.values(byStatus).reduce((a, b) => a + b, 0);

        let msg = `${userName}, aqui está o **resumo geral em tempo real** do Nexus OS:\n\n`;

        msg += `📋 **Atividades (OS):** ${totalOS}\n`;
        const sorted = Object.entries(byStatus).sort((a, b) => b[1] - a[1]);
        for (const [status, count] of sorted) {
          msg += `  ${STATUS_EMOJI[status] || '•'} ${STATUS_LABEL[status] || status}: ${count}\n`;
        }

        msg += `\n👥 **Clientes:** ${clients}`;
        msg += `\n🔧 **Técnicos:** ${techs}`;
        msg += `\n👤 **Usuários:** ${users}`;
        msg += `\n⚙️ **Equipamentos (Ativos):** ${equips}`;
        msg += `\n  ✅ Em Garantia: ${warranty.inWarranty} | ❌ Fora: ${warranty.outWarranty} | ⚠️ Sem Info: ${warranty.noInfo}`;
        msg += `\n💰 **Orçamentos:** ${quotes}`;
        msg += `\n📄 **Contratos/PMOC:** ${contracts}`;
        msg += `\n📦 **Estoque:** ${stock} itens`;

        return msg;
      }

      default:
        return '';
    }
  } catch (err: any) {
    console.error('[Duno IA] Query error:', err);
    return `${userName}, tive um problema ao consultar os dados agora. Tente novamente em alguns instantes. 🔄`;
  }
}

// ══════════════════════════════════════════════════════════════
// 📚 BUSCA NA BASE DE CONHECIMENTO RAG (MANUAIS PDF)
// ══════════════════════════════════════════════════════════════

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function extractKeywords(text: string): string[] {
  const stopwords = new Set([
    'de', 'do', 'da', 'em', 'para', 'com', 'um', 'uma', 'os', 'as', 'o', 'a', 
    'como', 'fazer', 'onde', 'qual', 'quais', 'sistema', 'tela', 'modulo', 
    'botao', 'que', 'se', 'na', 'no', 'eu', 'quero', 'detalhes', 'executar',
    'tarefa', 'dentro', 'consigo', 'posso', 'faco', 'passo', 'por', 'ou',
    'e', 'sao', 'nao', 'sim', 'esta', 'este', 'isso', 'aquilo', 'ele', 'ela'
  ]);
  
  const words = removeAccents(text.toLowerCase())
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stopwords.has(w));
    
  const freqs: Record<string, number> = {};
  for (const w of words) freqs[w] = (freqs[w] || 0) + 1;
  
  return Object.entries(freqs)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(e => e[0]);
}

export async function searchKnowledgeBase(
  query: string, 
  history: Array<{ role: 'user' | 'assistant', content: string }> = [],
  userLang: 'pt' | 'en' | 'es' = 'pt'
): Promise<string | null> {
  const tid = await requireTid();
  if (!tid) return null;

  console.log('[AI Search Mobile] Iniciando busca com contexto para query:', query, 'lang:', userLang);
  
  // 🎯 ACÚMULO DE CONTEXTO MULTI-TURN:
  // Se for uma pergunta de acompanhamento ("e a pressão de alta dele?"),
  // mesclamos o texto das últimas 3 mensagens do usuário para não perder marcas/modelos (ex: "Daikin RXYQ")
  const recentUserTexts = history
    .filter(m => m.role === 'user' && m.content)
    .slice(-3)
    .map(m => m.content)
    .join(' ');

  const combinedSearchText = recentUserTexts ? `${recentUserTexts} ${query}` : query;

  let queryKeywords = extractKeywords(combinedSearchText);

  if (queryKeywords.length === 0) {
    queryKeywords = removeAccents(combinedSearchText.toLowerCase())
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3);
  }
  if (queryKeywords.length === 0) {
    queryKeywords = removeAccents(combinedSearchText.toLowerCase())
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 2);
  }

  let data: any[] = [];
  if (queryKeywords.length > 0) {
    const { data: rpcData, error: rpcError } = await supabase
      .rpc('search_ai_knowledge_global', { p_keywords: queryKeywords, p_limit: 20 });

    if (rpcError) {
      console.error('[AI Search Mobile] Erro na RPC V3:', rpcError.message);
      const { data: fallbackData } = await supabase
        .from('ai_knowledge_base')
        .select('content, source_name, keywords')
        .eq('tenant_id', tid)
        .limit(20);
      data = fallbackData || [];
    } else {
      data = rpcData || [];
    }
  } else {
    const { data: fallbackData } = await supabase
      .from('ai_knowledge_base')
      .select('content, source_name, keywords')
      .eq('tenant_id', tid)
      .order('created_at', { ascending: false })
      .limit(20);
    data = fallbackData || [];
  }

  const queryNorm = removeAccents(combinedSearchText.toLowerCase());
  const queryWordsRaw = queryNorm.split(/\s+/).filter(w => w.length > 2);
  const brandWords = combinedSearchText
    .split(/\s+/)
    .filter(w => /^[A-Z]{2,}/.test(w) || /^[A-Z][a-záéíóúãõ]+/.test(w))
    .map(w => removeAccents(w.toLowerCase()));

  const scored = data.map((doc: any) => {
    let score = (doc.relevance_score || 0) * 3;
    const contentNorm = removeAccents((doc.content || '').toLowerCase());
    const sourceNorm = removeAccents((doc.source_name || '').toLowerCase());

    for (const brand of brandWords) {
      if (sourceNorm.includes(brand)) score += 50;
      if (contentNorm.includes(brand)) score += 20;
    }

    for (const w of queryWordsRaw) {
      if (contentNorm.includes(w)) score += 2;
    }

    for (let len = Math.min(queryWordsRaw.length, 5); len >= 2; len--) {
      for (let start = 0; start <= queryWordsRaw.length - len; start++) {
        const phrase = queryWordsRaw.slice(start, start + len).join(' ');
        if (contentNorm.includes(phrase)) score += len * 10;
      }
    }

    return { ...doc, score };
  });

  scored.sort((a: any, b: any) => b.score - a.score);
  const bestMatches = scored.slice(0, 4);

  if (bestMatches.length === 0 || bestMatches[0].score < 5) return null;

  try {
    // 🎯 DISPARO DIRETO NA DEEPSEEK API (0 Invocações de Edge Function no Supabase!)
    const getDeepSeekKey = (): string => {
      if (process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY) return process.env.EXPO_PUBLIC_DEEPSEEK_API_KEY;
      const b64 = 'c2stZDE0YTAzMjc5Y2FlNDIxOGE3MzA0NGVhMWUzZDJhYzk=';
      try {
        return typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf-8');
      } catch {
        return '';
      }
    };
    const deepseekKey = getDeepSeekKey();

    const contextText = bestMatches
      .map((c: any, i: number) => `Trecho ${i + 1} (Fonte: ${c.source_name || "Manual"}):\n"${c.content}"`)
      .join("\n\n---\n\n");

    const targetLangName = userLang === 'en' ? 'English (en)' : userLang === 'es' ? 'Español (es)' : 'Português do Brasil (pt-BR)';

    const systemPrompt = `MANDATORY LANGUAGE: Respond strictly in ${targetLangName}.

Você é a Duno IA, assistente inteligente oficial do sistema de gestão **Duno**. Sua missão é dar respostas COMPLETAS, RICAS e PRECISAS no idioma (${targetLangName}) baseadas nos manuais fornecidos.

DIRETRIZES:
1. RACIOCÍNIO SEMÂNTICO & CONTEXTO DE CONVERSA: Mantenha o contexto dos equipamentos e termos mencionados anteriormente pelo usuário na conversa.
2. SÍNTESE COMPLETA: Leia TODOS os trechos dos manuais antes de responder.
3. RESPOSTAS DETALHADAS: Inclua passo a passo completo, avisos de segurança, e informações que complementem a dúvida.
4. FORMATO PROFISSIONAL: Use listas numeradas para passos, negrito para termos importantes, organize em seções se necessário.
5. HONESTIDADE: Se os trechos não tiverem a informação, responda de forma clara no idioma (${targetLangName}) que não encontrou a informação nos manuais.
6. CONTEXTO DUNO: O sistema se chama DUNO (nunca Nexus).
7. PERSONALIDADE: Você está conversando no chat de suporte direto com o técnico. Seja EXTREMAMENTE bem-humorado, amigável, acolhedor e use BASTANTE emojis!

MANUAIS DE REFERÊNCIA:
${contextText}`;

    // Janela deslizante das últimas 6 mensagens para manter contexto sem estourar tokens
    const formattedHistory = history.slice(-6).map(m => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: m.content
    }));

    const messagesPayload = [
      { role: "system", content: systemPrompt },
      ...formattedHistory,
      { role: "user", content: query }
    ];

    console.log('[DunoIA Mobile] Disparando direto para DeepSeek (0 Edge Functions)...');

    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${deepseekKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: messagesPayload,
        temperature: 0.2,
        max_tokens: 2048
      })
    });

    const json = await response.json();
    if (json.choices?.[0]?.message?.content) {
       return json.choices[0].message.content;
    }

    if (json.error) {
       console.error('[DunoIA Mobile] DeepSeek error:', json.error);
       throw new Error(json.error.message || 'Erro na DeepSeek API');
    }

    throw new Error('Erro na geração LLM');
  } catch (err: any) {
    console.error('[DunoIA Mobile] LLM Generator error:', err);
    let fb = `⚠️ **Erro de Comunicação com a IA:** ${err.message}\n\nEncontrei informações, mas o gerador semântico de Inteligência Artificial falhou. Aqui estão os trechos do manual:\n\n`;
    bestMatches.forEach(m => fb += `> "...${m.content.substring(0, 300)}..."\n\n`);
    return fb;
  }
}

// ══════════════════════════════════════════════════════════════
// 📚 BUSCA LISTA DE MANUAIS / MEMÓRIA DISPONÍVEIS NO TENANT
// ══════════════════════════════════════════════════════════════

export interface ManualSummary {
  name: string;
  chunksCount: number;
}

export async function getAvailableManuals(): Promise<ManualSummary[]> {
  const tid = await requireTid();
  if (!tid) return [];

  try {
    const { data, error } = await supabase
      .from('ai_knowledge_base')
      .select('source_name')
      .eq('tenant_id', tid);

    if (error || !data) return [];

    const counts: Record<string, number> = {};
    for (const item of data) {
      const src = (item.source_name || 'Manual Técnico').trim();
      counts[src] = (counts[src] || 0) + 1;
    }

    return Object.entries(counts).map(([name, chunksCount]) => ({
      name,
      chunksCount
    })).sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error('[DunoIA Mobile] Error loading manuals list:', err);
    return [];
  }
}
