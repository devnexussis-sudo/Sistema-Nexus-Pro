// ============================================================
// src/services/dunoBrain.ts
// 🧠 Duno IA Core Brain — Motor NLP e Grafo de Conhecimento Interno
// Mapeia todas as entidades, rotas, ações e atributos do Nexus OS
// ============================================================

export type ActionType = 'create' | 'read' | 'update' | 'delete' | 'report' | 'explain';

export interface SystemEntity {
  id: string;
  name: string;
  synonyms: string[];
  menuPath: string;
  description: string;
  attributes: string[];
  actions: {
    [key in ActionType]?: string;
  };
}

// ── Grafo do Sistema Nexus OS ──
export const SYSTEM_GRAPH: SystemEntity[] = [
  {
    id: 'app_tecnico',
    name: 'App do Técnico (Mobile PWA)',
    synonyms: ['app', 'aplicativo', 'celular', 'pwa', 'app mobile', 'app do tecnico'],
    menuPath: 'Menu Principal > Configurações > Aba "APP do Técnico"',
    description: 'Aplicativo PWA utilizado pelos técnicos em campo para gerenciar as ordens de serviço (OS) diretamente do celular.',
    attributes: [
      'Iniciar Atendimento (com captura de GPS)',
      'Câmera nativa para Fotos e Vídeos',
      'Formulários e Checklists dinâmicos',
      'Leitor de QR Code para peças',
      'Bloqueio de OS (Impedimentos)',
      'Assinatura Digital do cliente',
      'Rastreio de Deslocamento (Km e Tempo)',
      'Sincronização Offline'
    ],
    actions: {
      read: 'As configurações e permissões do App ficam centralizadas na tela de Configurações do sistema.',
      update: 'Para alterar o que o técnico pode ver no App (como preços, botão de WhatsApp ou limite de OS simultâneas), altere os toggles na aba APP do Técnico.',
      explain: 'Ele não requer download nas lojas de app; basta o técnico acessar a URL pelo celular e adicionar à tela inicial.'
    }
  },
  {
    id: 'os',
    name: 'Atividades (Ordem de Serviço)',
    synonyms: ['os', 'ordem de servico', 'ordens', 'atividade', 'atividades', 'chamado', 'ticket'],
    menuPath: 'Menu Principal > Atividade',
    description: 'Módulo central do sistema para abertura, acompanhamento e execução de serviços.',
    attributes: [
      'Cliente e Equipamento Vinculado',
      'Tipo de Serviço (Preventiva, Corretiva, etc)',
      'Prioridade (Baixa, Média, Alta, Crítica)',
      'Técnico Atribuído',
      'Data Agendada',
      'Status de SLA',
      'Timeline (Histórico Completo)'
    ],
    actions: {
      create: 'Clique no botão "+ Nova OS" no canto superior direito da tela de Atividades. Preencha os dados do cliente e a descrição do problema.',
      read: 'Você pode visualizar todas as OS em formato de lista ou Kanban. Use a barra de busca para encontrar por número ou cliente.',
      update: 'Clique na OS desejada e use o botão "Editar OS" para mudar técnico, prioridade ou status.',
      delete: 'OS podem ser Canceladas usando o botão "Cancelar OS" no cabeçalho interno da atividade.',
      report: 'Dentro da OS, clique em "Gerar PDF" para exportar o relatório técnico de fechamento.'
    }
  },
  {
    id: 'cliente',
    name: 'Clientes',
    synonyms: ['cliente', 'clientes', 'empresa cliente', 'contratante', 'consumidor'],
    menuPath: 'Menu Principal > Cliente',
    description: 'Cadastro de pessoas físicas ou jurídicas que solicitam os serviços.',
    attributes: [
      'Razão Social / Nome Completo',
      'CNPJ / CPF',
      'E-mail e Telefones',
      'WhatsApp',
      'Endereço Completo (com latitude/longitude para o mapa)',
      'Equipamentos (Ativos) vinculados'
    ],
    actions: {
      create: 'Acesse o módulo Cliente e clique em "+ Novo Cliente". Digite o CNPJ para preenchimento automático (se aplicável).',
      read: 'A lista de clientes pode ser pesquisada por documento ou nome.',
      update: 'Ao abrir um cliente, você pode editar seus dados ou adicionar novos endereços.'
    }
  },
  {
    id: 'tecnico',
    name: 'Técnicos',
    synonyms: ['tecnico', 'tecnicos', 'equipe', 'funcionario de campo', 'instalador'],
    menuPath: 'Menu Principal > Técnicos',
    description: 'Gerenciamento da equipe de campo que utiliza o App Mobile.',
    attributes: [
      'Nome e Contato',
      'Especialidade técnica',
      'Cor de identificação no calendário',
      'Status atual (Disponível, Em Atendimento, Ausente)',
      'Histórico de Atendimentos'
    ],
    actions: {
      create: 'Vá no módulo Técnicos e clique em "+ Novo Técnico" para cadastrá-lo e gerar seu acesso ao App.',
      read: 'A localização dos técnicos pode ser vista em tempo real no módulo "Visão de Campo".'
    }
  },
  {
    id: 'estoque',
    name: 'Estoque de Peças',
    synonyms: ['estoque', 'peca', 'pecas', 'produto', 'produtos', 'material', 'insumo'],
    menuPath: 'Menu Principal > Estoque',
    description: 'Controle de entrada e saída de peças utilizadas nas manutenções.',
    attributes: [
      'Código SK U e Código de Barras',
      'Nome e Descrição',
      'Categoria',
      'Quantidade disponível',
      'Valor Unitário',
      'Geração de QR Code'
    ],
    actions: {
      create: 'Na tela de Estoque, clique em "+ Novo Item". Defina as quantidades e valores.',
      update: 'Para dar entrada ou saída manual, clique sobre o item e faça o ajuste de quantidade.',
      report: 'Selecione os itens desejados e clique em "Imprimir Etiquetas" para gerar os QR Codes (A4 ou Térmica).'
    }
  },
  {
    id: 'ativo',
    name: 'Ativos (Equipamentos)',
    synonyms: ['ativo', 'ativos', 'equipamento', 'equipamentos', 'maquina', 'aparelho', 'ar condicionado'],
    menuPath: 'Menu Principal > Ativos',
    description: 'Gestão dos equipamentos que pertencem aos clientes e recebem manutenção.',
    attributes: [
      'Nome e Modelo',
      'Família (Ex: Split, Chiller, VRF)',
      'Número de Série e Patrimônio',
      'Data de Fabricação',
      'Garantia (em meses)',
      'Cliente Vinculado'
    ],
    actions: {
      create: 'Você pode cadastrar um equipamento diretamente na tela "Ativos" ou dentro do perfil do Cliente na aba Equipamentos.',
      read: 'O sistema calcula automaticamente o status de Garantia (Verde/Vermelho) baseado na data de fabricação.'
    }
  },
  {
    id: 'orcamento',
    name: 'Orçamentos',
    synonyms: ['orcamento', 'orcamentos', 'proposta', 'cotacao', 'propostas'],
    menuPath: 'Menu Principal > Orçamentos',
    description: 'Geração de propostas comerciais para os clientes com integração ao estoque.',
    attributes: [
      'Cliente e OS de origem',
      'Itens (Serviços e Peças)',
      'Descontos e Acréscimos',
      'Condições de Pagamento',
      'Validade',
      'Status (Pendente, Aprovado, Recusado)'
    ],
    actions: {
      create: 'Vá em Orçamentos > "+ Novo Orçamento". Adicione os itens e o sistema calcula os totais.',
      read: 'Você pode compartilhar o Orçamento via "Link Público" para o cliente aprovar digitalmente.',
      report: 'Gere o PDF do orçamento para enviar por e-mail ou WhatsApp.'
    }
  },
  {
    id: 'contrato',
    name: 'Contratos / PMOC',
    synonyms: ['contrato', 'contratos', 'pmoc', 'manutencao preventiva', 'recorrencia', 'plano'],
    menuPath: 'Menu Principal > Contratos',
    description: 'Gerenciador de manutenções periódicas (PMOC) com geração automática de OS.',
    attributes: [
      'Periodicidade (Mensal, Trimestral, Anual, etc)',
      'Data de Início e Vencimento',
      'Valor do Contrato',
      'Equipamentos Cobertos',
      'Checklists Obrigatórios'
    ],
    actions: {
      create: 'Cadastre o contrato, vincule os ativos do cliente e defina a recorrência. O sistema vai abrir as OS automaticamente nas datas certas.',
      update: 'Contratos podem ser pausados ou ter a periodicidade ajustada a qualquer momento.'
    }
  },
  {
    id: 'usuario',
    name: 'Usuários e Permissões',
    synonyms: ['usuario', 'usuarios', 'acesso', 'login', 'senha', 'permissao', 'permissoes', 'grupo', 'cargo'],
    menuPath: 'Menu Principal > Configurações > Usuários / Grupos',
    description: 'Controle de quem pode acessar o painel administrativo do Nexus OS.',
    attributes: [
      'Nome e E-mail',
      'Grupos de Permissão (Roles)',
      'Status (Ativo/Bloqueado)',
      'Regras de Acesso (LGPD)'
    ],
    actions: {
      create: 'Vá em Configurações > Usuários para enviar um convite de acesso. A senha é definida pelo próprio usuário (LGPD).',
      update: 'Para alterar o que um usuário pode ver/fazer, modifique o "Grupo" dele na tela de Grupos.',
      delete: 'Por segurança, você não exclui, mas "Bloqueia" o acesso de um usuário para manter o histórico.'
    }
  },
  {
    id: 'financeiro',
    name: 'Financeiro',
    synonyms: ['financeiro', 'faturamento', 'receita', 'contas', 'pagamento', 'faturar'],
    menuPath: 'Menu Principal > Financeiro',
    description: 'Dashboard financeiro que exibe o faturamento das OS e controle de caixa.',
    attributes: [
      'Filtro por Período de Faturamento',
      'Filtro por Técnico e Cliente',
      'Gráfico de Receita Mensal',
      'Exportação de Relatório (A4)',
      'Listagem de Atividades Faturadas'
    ],
    actions: {
      read: 'O faturamento é gerado automaticamente a partir das OS concluídas e aprovadas.',
      report: 'No canto superior da tela do Financeiro, há um botão de Exportar Relatório em PDF.'
    }
  },
  {
    id: 'visao_campo',
    name: 'Visão de Campo (Mapa)',
    synonyms: ['mapa', 'visao de campo', 'gps', 'localizacao', 'rota', 'rastreamento'],
    menuPath: 'Menu Principal > Visão de Campo',
    description: 'Visualização geográfica em tempo real da equipe e das OS abertas.',
    attributes: [
      'Pins de Técnicos em Tempo Real',
      'Status de Disponibilidade no Mapa',
      'Localização de Clientes com OS Pendentes'
    ],
    actions: {
      read: 'Acesse "Visão de Campo" na barra lateral para abrir o mapa interativo. Clique nos pins para ver mais detalhes.',
      explain: 'Ele utiliza a localização GPS enviada pelo App do Técnico durante os atendimentos.'
    }
  },
  {
    id: 'agenda',
    name: 'Agenda (Calendário)',
    synonyms: ['agenda', 'calendario', 'agendamento', 'programacao', 'datas'],
    menuPath: 'Menu Principal > Agenda',
    description: 'Calendário visual para planejamento e acompanhamento dos agendamentos técnicos.',
    attributes: [
      'Visão Mensal, Semanal e Diária',
      'Filtro por Técnico',
      'Cores baseadas no Status da OS',
      'Acesso Rápido aos detalhes da OS'
    ],
    actions: {
      read: 'Navegue pelo mês e clique sobre os blocos coloridos para abrir um resumo da Ordem de Serviço.'
    }
  },
  {
    id: 'dashboard',
    name: 'Dashboard Inicial',
    synonyms: ['dashboard', 'painel', 'resumo', 'indicadores', 'kpi', 'tela inicial', 'home'],
    menuPath: 'Menu Principal > Dashboard',
    description: 'Tela de entrada do sistema com os principais indicadores de operação.',
    attributes: [
      'Contagem de OS por Status',
      'Gráficos de Atendimentos',
      'Métricas de SLA',
      'Resumo de Clientes e Técnicos Ativos'
    ],
    actions: {
      read: 'O Dashboard é a primeira tela ao fazer login. Você pode filtrar todos os gráficos selecionando um período específico no topo da tela.'
    }
  },
  {
    id: 'formularios',
    name: 'Formulários Customizados',
    synonyms: ['formulario', 'formularios', 'checklist', 'checklists', 'campos personalizados', 'template'],
    menuPath: 'Menu Principal > Formulários',
    description: 'Criador de formulários dinâmicos (checklists) que os técnicos preenchem no App Mobile.',
    attributes: [
      'Campos de Texto, Número e Seleção',
      'Exigência de Foto e Assinatura',
      'Regras de Exibição (Por Serviço ou Família)',
      'Obrigatoriedade por Campo'
    ],
    actions: {
      create: 'Para criar um novo checklist, clique em "+ Novo Formulário", adicione os campos e defina em quais tipos de OS ele deve aparecer.',
      read: 'Os técnicos veem os formulários automaticamente na aba correspondente dentro do App Mobile durante a execução da OS.'
    }
  }
];

// ── Motor Fuzzy (Tolerância a Erros de Digitação) ──

function levenshtein(a: string, b: string): number {
  const matrix = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = 0; i <= a.length; i++) matrix[i][0] = i;
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      );
    }
  }
  return matrix[a.length][b.length];
}

function fuzzyContains(query: string, synonym: string): boolean {
  const qWords = query.split(/[\s,]+/);
  const sWords = synonym.split(/[\s,]+/);

  for (const sWord of sWords) {
    let found = false;
    for (const qWord of qWords) {
      if (sWord.length <= 3) {
         if (qWord === sWord) { found = true; break; }
      } else {
         if (Math.abs(qWord.length - sWord.length) > 2) continue;
         const dist = levenshtein(qWord, sWord);
         const allowed = sWord.length > 6 ? 2 : 1;
         if (dist <= allowed) { found = true; break; }
      }
    }
    // Ignora conectivos curtos (de, do, da) se a frase principal casou
    if (!found) {
       if (sWord.length <= 2 && sWords.length > 1) continue;
       return false;
    }
  }
  return true;
}

// ── NLP Simplificado ──

function removeAccents(str: string) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export interface CodebaseResource {
  id: string;
  name: string;
  type: 'file' | 'table' | 'api' | 'config';
  path: string;
  keywords: string[];
  description: string;
  details: string;
}

// Mapas detalhados de engenharia do sistema para o varredor dinâmico da Duno IA
export const CODEBASE_MAP: CodebaseResource[] = [
  {
    id: 'api_keys_table',
    name: 'Tabela public.api_keys (Banco de Dados)',
    type: 'table',
    path: 'supabase/migrations/20260520_create_integrations.sql',
    keywords: ['tabela api_keys', 'api_keys', 'api keys banco', 'banco de dados api', 'chave api sql', 'campo api_keys', 'tabela de chaves', 'tabela de chaves de api'],
    description: 'Armazena com segurança as chaves de API geradas pelos tenants do sistema.',
    details: '• **Estrutura:** Possui os campos `id` (UUID), `tenant_id` (UUID), `name` (Texto), `key_hash` (Texto criptografado SHA-256 da chave), `status` (Texto: active/revoked), `created_at` e `last_used_at`.\n• **Segurança (RLS):** Protegida pela política `api_keys_isolation_policy` que isola as chaves usando `tenant_id = public.get_user_tenant_id()`. Evita consultas diretas à tabela `public.users` para prevenir recursividade.'
  },
  {
    id: 'webhooks_table',
    name: 'Tabela public.webhooks (Banco de Dados)',
    type: 'table',
    path: 'supabase/migrations/20260520_create_integrations.sql',
    keywords: ['tabela webhooks', 'webhook sql', 'banco webhooks', 'campos webhooks', 'webhooks db', 'tabela de webhooks'],
    description: 'Armazena os endpoints de destino dos webhooks configurados pelos clientes.',
    details: '• **Estrutura:** Contém `id` (UUID), `tenant_id` (UUID), `name` (Texto), `url` (Texto), `secret` (Texto, padrão `whsec_...` para assinatura), `events` (Array de Texto: os_created, os_updated, etc), `is_active` (Booleano) e timestamps.\n• **Segurança (RLS):** Protegida por `webhooks_isolation_policy` com isolamento por `tenant_id = public.get_user_tenant_id()`.'
  },
  {
    id: 'edge_function_api',
    name: 'Edge Function de Integração (API v1)',
    type: 'api',
    path: 'supabase/functions/api_v1/index.ts',
    keywords: ['edge function api', 'api_v1', 'funcao api', 'endpoint api', 'codigo api', 'backend api', 'orders api', 'customers api', 'equipments api', 'quotes api', 'api endpoints', 'api v1'],
    description: 'O servidor REST Deno que responde pelas consultas de integrações externas.',
    details: '• **Endpoints Suportados:** `GET /orders`, `GET /customers`, `GET /equipments` e `GET /quotes`.\n• **Segurança e Autenticação:** Recebe o token `Bearer nx_live_...` no header, gera o hash SHA-256 em tempo real e valida contra a tabela `api_keys`.\n• **Isolamento de Dados:** Utiliza cliente administrativo (service role) para ler ignorando RLS, mas aplica obrigatoriamente `.eq(\'tenant_id\', tenantId)` em todas as queries para isolamento absoluto de dados.'
  },
  {
    id: 'rate_limiting',
    name: 'Controle de Rate Limiting da API',
    type: 'config',
    path: 'supabase/functions/api_v1/index.ts',
    keywords: ['rate limit', 'limite de requisicoes', 'limite api', 'trava de seguranca', 'sobrecarga', 'bloqueio requisicoes', '429 too many', 'limite de chamadas', 'trava de seguranca da api'],
    description: 'Sistema em memória para evitar que requisições excessivas sobrecarreguem o banco de dados.',
    details: '• **Funcionamento:** Implementado na memória do Deno Isolates. Cada `tenant_id` é limitado a no máximo **100 requisições por minuto**.\n• **Resposta:** Ao estourar o limite, retorna o status HTTP `429 Too Many Requests` com cabeçalhos padrão de controle (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset` e `Retry-After`).'
  },
  {
    id: 'integrations_page',
    name: 'Tela de Integrações (Frontend)',
    type: 'file',
    path: 'src/components/admin/IntegrationsPage.tsx',
    keywords: ['tela de integracoes', 'pagina de integracao', 'integrationspage', 'componente integracao', 'onde gera chave', 'gerar chave api', 'copiar url api', 'botoes de integracoes', 'modal de confirmacao', 'confirmacao de exclusao'],
    description: 'Componente React que gerencia as chaves de API, webhooks e acesso à documentação do usuário administrador.',
    details: '• **Interface:** Contém tabs para "Chaves de API" e "Webhooks". Possui o botão "Documentação da API" que aponta para o domínio do Fern (`api-duno.docs.buildwithfern.com`).\n• **Confirmação Personalizada:** Substitui o `window.confirm` padrão por modais do Design System com backdrop blur e animações de entrada suaves.\n• **Design:** Botões padronizados (altura e bordas), botão de cópia rápido de token de API e chaves exibidas no formato oculto após criação.'
  },
  {
    id: 'fern_docs',
    name: 'Configuração da Documentação Fern',
    type: 'config',
    path: 'fern/docs.yml e fern/openapi.yml',
    keywords: ['fern docs', 'fern', 'documentacao api url', 'docs buildwithfern', 'api.dunoup.com.br', 'buildwithfern', 'docs.yml', 'openapi.yml', 'documentacao da api'],
    description: 'Estrutura que compila a especificação OpenAPI 3.1.0 e publica a documentação na nuvem.',
    details: '• **Domínios:** Customizado no Umbler para `api.dunoup.com.br` e apontando no Fern para `api-duno.docs.buildwithfern.com`.\n• **Configuração:** O arquivo `docs.yml` mapeia a instância de hospedagem da Equipe do Alex (`alex-s-team-473229`).'
  },
  {
    id: 'global_typography',
    name: 'Normalização e Ajuste Global de Fontes (Poppins)',
    type: 'config',
    path: 'src/styles/index.css',
    keywords: ['fonte poppins', 'negrito global', 'index.css', 'tamanho de letra', 'padrao de letra', 'retirar negrito', 'suavizar negrito', 'negrito de qualquer parte', 'sistema padrao de letra'],
    description: 'Estilo tipográfico do Nexus OS para um visual SaaS limpo e premium.',
    details: '• **Poppins:** Forçada globalmente em todos os elementos da interface.\n• **Suavização de Negritos:** Regra de normalização que limita o peso máximo das fontes (`font-bold`, `h1-h6`, `th`, `strong`, `.font-semibold`) para `500` (Medium), eliminando negritos exagerados (700/800) e deixando a interface leve e elegante.'
  },
  {
    id: 'user_management_page',
    name: 'Tela de Gestão de Usuários (Frontend)',
    type: 'file',
    path: 'src/components/admin/UserManagement.tsx',
    keywords: ['tela de usuarios', 'cadastro de usuario', 'usermanagement', 'grupos de usuario', 'senha administrador', 'senha convite', 'modal de usuario'],
    description: 'Interface administrativa de cadastro de equipe e cargos.',
    details: '• **Modais:** O modal de edição é alinhado à visualização de Ordens de Serviço (2/3 de informações principais + 1/3 de ações rápidas).\n• **LGPD:** A senha não é definida pelo administrador; o usuário recebe um convite e define sua própria senha de acesso.'
  }
];

function scanCodebaseMap(query: string): string | null {
  let bestMatch: CodebaseResource | null = null;
  let maxScore = 0;

  for (const resource of CODEBASE_MAP) {
    let score = 0;
    for (const kw of resource.keywords) {
      const nKw = removeAccents(kw.toLowerCase());
      if (new RegExp(`(^|\\b|\\s)${nKw}`).test(query)) {
        score += nKw.length;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = resource;
    }
  }

  if (bestMatch && maxScore >= 3) {
    return `🔍 **Varredura Dinâmica de Engenharia:**\n` +
           `Encontrei o recurso solicitado na estrutura interna do Nexus OS:\n\n` +
           `📁 **Recurso:** ${bestMatch.name}\n` +
           `📍 **Caminho Físico:** \`${bestMatch.path}\`\n` +
           `💡 **Função:** ${bestMatch.description}\n\n` +
           `🛠️ **Detalhes Técnicos de Implementação:**\n${bestMatch.details}\n\n` +
           `*Esta análise foi feita varrendo o grafo de engenharia do sistema.*`;
  }

  return null;
}

function detectAction(input: string): ActionType {
  const verbs = removeAccents(input.toLowerCase());
  if (/(criar|criacao|novo|nova|cadastr|adicion|abrir|gerar)/.test(verbs)) return 'create';
  if (/(edit|alter|modific|muda|atualiz)/.test(verbs)) return 'update';
  if (/(delet|exclui|remov|apaga|cancel)/.test(verbs)) return 'delete';
  if (/(imprim|pdf|relatori|baixa|export)/.test(verbs)) return 'report';
  if (/(onde fica|lista|acha|busca|pesquis|ver|qual|quais)/.test(verbs)) return 'read';
  return 'explain'; // Padrão
}

function detectAttributesRequest(input: string): boolean {
  const q = removeAccents(input.toLowerCase());
  return /(atributo|campo|funcionalidade|funcoe|funcao|o que tem|o que faz|como funciona)/.test(q);
}

// ── O Cérebro da Análise ──

export function analyzeAndDiscover(input: string): string | null {
  const query = removeAccents(input.toLowerCase());

  // 1. Tentar varredura física do codebase primeiro
  const codebaseResponse = scanCodebaseMap(query);
  if (codebaseResponse) return codebaseResponse;

  // 2. Encontrar a entidade alvo na frase usando Tolerância a Erros
  let bestEntity: SystemEntity | null = null;
  let maxScore = 0;

  for (const entity of SYSTEM_GRAPH) {
    let score = 0;
    for (const syn of entity.synonyms) {
      const nSyn = removeAccents(syn);
      if (fuzzyContains(query, nSyn)) {
        score += nSyn.length;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestEntity = entity;
    }
  }

  // Se não encontrou nenhuma entidade confiável
  if (!bestEntity || maxScore < 2) return null;

  // 3. Extrair Intenções
  const action = detectAction(query);
  const wantsAttributes = detectAttributesRequest(query);

  // 4. Montar Resposta Inteligente Dinâmica
  let response = `Fiz uma varredura na estrutura do sistema sobre **${bestEntity.name}**. 🧠\n\n`;
  
  response += `📍 **Localização no Sistema:** ${bestEntity.menuPath}\n\n`;

  // Se perguntou por atributos ou como funciona
  if (wantsAttributes || action === 'explain') {
    response += `💡 **Descrição:** ${bestEntity.description}\n\n`;
    response += `📋 **Atributos e Funcionalidades que mapeei:**\n`;
    bestEntity.attributes.forEach(attr => {
      response += `• ${attr}\n`;
    });
  } else {
    // Se pediu para executar uma ação específica (criar, deletar, etc)
    const actionHelp = bestEntity.actions[action] || bestEntity.actions.explain;
    response += `💡 **Instrução de Procedimento:** ${actionHelp}\n`;
  }

  response += `\n*Ficou claro? Se precisar de ajuda em outra tela, é só pedir!*`;

  return response;
}
