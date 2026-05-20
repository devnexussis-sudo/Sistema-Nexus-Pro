// ============================================================
// src/services/dunoBrain.ts
// 🧠 Duno IA Core Brain — Sistema de Consciência do Nexus OS
// Motor de Busca Ponderada e Base Integrada de Procedimentos do Sistema
// ============================================================

export type ActionType = 'create' | 'read' | 'update' | 'delete' | 'report' | 'explain';

export interface KnowledgeNode {
  title: string;
  category: 'workflow' | 'engineering' | 'security' | 'design';
  keywords: string[];
  description: string;
  steps: string[];
  technicalDetails: string;
  relatedFiles: string[];
}

// ══════════════════════════════════════════════════════════════
// 🧠 BASE DE CONSCIÊNCIA GLOBAL E DETALHADA DO NEXUS OS
// Mapeia fluxos funcionais completos, arquivos do projeto e lógica técnica.
// ══════════════════════════════════════════════════════════════
export const CONSCIOUSNESS_BASE: KnowledgeNode[] = [
  {
    title: "Abertura e Criação de Ordens de Serviço (OS)",
    category: "workflow",
    keywords: [
      'abrir os', 'criar os', 'nova os', 'abrir chamado', 'criar chamado', 'nova atividade', 
      'criar atividade', 'gerar os', 'cadastrar os', 'ordem de servico', 'atividades', 'atividade'
    ],
    description: "Fluxo passo a passo para abertura de Ordens de Serviço (OS) pelo painel administrativo.",
    steps: [
      "Acesse o menu 'Atividade' na barra lateral esquerda do painel.",
      "Clique no botão '+ Nova OS' localizado no canto superior direito.",
      "Etapa 1 (Cliente): Digite o nome ou selecione o cliente desejado no campo de busca.",
      "Etapa 2 (Tipo de Serviço): Escolha o tipo de intervenção (Corretiva, Preventiva, Instalação, etc.).",
      "Etapa 3 (Detalhes): Preencha o Título descritivo do problema, a Descrição detalhada e selecione a Prioridade (Baixa, Média, Alta ou Crítica).",
      "Etapa 4 (Técnico): Escolha o técnico responsável pela execução e defina a data agendada para o serviço.",
      "Etapa 5 (Revisão): Confira os dados na tela de revisão e clique em 'Confirmar' para gerar a OS."
    ],
    technicalDetails: "• **Frontend:** Gerenciado pelo componente `CreateOrderModal.tsx`, que implementa um formulário dinâmico em 5 etapas controlado pelo estado do React.\n• **Banco de Dados:** Insere um registro na tabela `public.orders` com status inicial 'PENDENTE'.\n• **Eventos:** Cria o primeiro registro de evento na timeline da OS e gera o link público de acompanhamento do cliente.",
    relatedFiles: [
      "src/components/admin/CreateOrderModal.tsx",
      "src/components/admin/AdminOverview.tsx",
      "src/services/orderService.ts"
    ]
  },
  {
    title: "Execução de Ordens de Serviço no App do Técnico (Mobile PWA)",
    category: "workflow",
    keywords: [
      'app do tecnico', 'mobile', 'celular', 'pwa', 'executar os', 'iniciar atendimento', 
      'concluir os', 'impedimento', 'app', 'aplicativo', 'foto os', 'camera', 'gps tecnico', 
      'visita tecnica', 'assinar os', 'assinatura cliente'
    ],
    description: "Procedimento completo de atendimento em campo realizado pelo técnico através do aplicativo celular.",
    steps: [
      "O técnico acessa a URL do sistema no celular, adiciona o app à tela inicial (PWA) e faz login.",
      "Na tela inicial, acessa o menu lateral e entra na seção 'Minhas OS'.",
      "Ao chegar no cliente, seleciona a OS correspondente e clica em 'Iniciar Atendimento'. O status passa a 'Em Andamento' e registra o início com captura GPS.",
      "O técnico executa as tarefas e pode capturar Fotos/Vídeos diretamente da aba 'Mídias' usando a câmera nativa do celular.",
      "Se houver checklists vinculados, ele deve preenchê-los na aba 'Formulários'.",
      "Para adicionar peças utilizadas, clica em 'Adicionar Peça', escolhe a opção 'QR Code' para abrir a câmera e escanear a etiqueta do material físico, ou adiciona manualmente.",
      "Caso o serviço não possa ser finalizado (ex: falta de peças), clica em 'Registrar Impedimento', altera o status para 'Impedido' e digita a justificativa.",
      "Para finalizar, colhe a Assinatura Digital do cliente desenhada na tela do celular e clica em 'Concluir OS'."
    ],
    technicalDetails: "• **PWA Mobile:** Desenvolvido no shell de aplicativo `TechAppShell.tsx` utilizando React e TailwindCSS otimizado para dispositivos móveis.\n• **Upload de Mídias:** Fotos e vídeos são enviados diretamente para o bucket do Supabase Storage via `supabaseClient`.\n• **Assinatura:** Capturada via componente Canvas 2D HTML5 e armazenada em base64/URL no banco de dados.\n• **Rastreamento:** Utiliza a API de Geolocalização do navegador para registrar latitude e longitude em cada início de deslocamento e início de visita.",
    relatedFiles: [
      "src/apps/tech/TechAppShell.tsx",
      "src/apps/tech/v2/context/TechContext.tsx",
      "src/tech-pwa/OrderDetailsModal.tsx"
    ]
  },
  {
    title: "Manutenção Planejada (PMOC) e Contratos Recorrentes",
    category: "workflow",
    keywords: [
      'pmoc', 'contrato', 'preventiva', 'manutencao planejada', 'recorrente', 
      'periodicidade', 'lei pmoc', 'manutencao programada', 'contratos', 'novo contrato'
    ],
    description: "Criação e agendamento de inspeções de manutenção preventiva periódicas conforme as exigências da lei do PMOC.",
    steps: [
      "No painel administrativo, acesse o menu 'Contratos' na barra lateral esquerda.",
      "Clique no botão '+ Novo Contrato' no canto superior direito da página.",
      "Selecione o Cliente parceiro e o valor recorrente cobrado mensalmente.",
      "Adicione os Equipamentos (Ativos) que farão parte da cobertura do contrato de manutenção.",
      "Defina a Periodicidade do ciclo de visitas preventivas (Mensal, Bimestral, Trimestral, Semestral ou Anual).",
      "Preencha as datas de início da vigência do contrato e de vencimento do plano.",
      "Salve o cadastro. O sistema passará a gerar automaticamente as Ordens de Serviço preventivas na agenda técnica no início de cada ciclo programado."
    ],
    technicalDetails: "• **Módulo:** Controlado pelo componente `PlannedMaintenance.tsx`.\n• **Agendamento:** A tabela `contracts` armazena os metadados do plano, enquanto a tabela `contract_assets` vincula as máquinas. O gerador automático de OS preventivas cria chamados diretamente na tabela `orders` associando o checklist de PMOC obrigatório.",
    relatedFiles: [
      "src/components/admin/PlannedMaintenance.tsx",
      "src/services/contractService.ts"
    ]
  },
  {
    title: "Gerenciamento de Estoque de Peças e Etiquetas QR Code",
    category: "workflow",
    keywords: [
      'estoque', 'peca', 'pecas', 'cadastrar peca', 'qr code', 'etiqueta', 'imprimir etiquetas', 
      'termica', 'folha a4', 'entrada estoque', 'saida estoque', 'materiais', 'inventario'
    ],
    description: "Fluxo de cadastro de peças, controle de movimentações e impressão de etiquetas de código QR para identificação física e escaner em campo.",
    steps: [
      "Acesse o menu 'Estoque' na barra lateral esquerda do painel.",
      "Para adicionar uma peça: Clique em '+ Novo Item', digite o Nome, SKU/Código, Categoria, Quantidade Inicial e Valor Unitário, depois clique em Salvar.",
      "Para movimentar manualmente: Clique sobre o item na listagem, selecione 'Ajustar Estoque', insira a quantidade e defina se é uma Entrada ou Saída.",
      "Para gerar etiquetas: Na listagem de itens do estoque, marque a caixa de seleção ao lado de cada peça que deseja etiquetar.",
      "Clique no botão 'Imprimir Etiquetas' localizado no topo da tabela.",
      "No popup de opções, escolha entre: 'Folha A4' (para impressoras normais jato de tinta/laser, gerando uma folha com múltiplos QR Codes) ou 'Impressora Térmica' (otimizado para fitas de etiquetas térmicas portáteis).",
      "Confirme e o navegador abrirá a tela de impressão do sistema."
    ],
    technicalDetails: "• **Componente:** `StockManagement.tsx` contendo tabelas de listagem, modais de ajuste de saldo e motor de renderização de etiquetas.\n• **Impressão:** Utiliza regras CSS de impressão em `src/styles/index.css` via media query `@media print`, escondendo o cabeçalho e a barra lateral do painel admin e exibindo apenas os contêineres de código de barras/QR Code configurados para quebra de página (`page-break-after: always`).",
    relatedFiles: [
      "src/components/admin/StockManagement.tsx",
      "src/styles/index.css"
    ]
  },
  {
    title: "Emissão de Orçamentos e fluxo de Aprovação Externa",
    category: "workflow",
    keywords: [
      'orcamento', 'proposta', 'aprovar orcamento', 'recusar orcamento', 'link publico', 
      'link de proposta', 'cotação', 'pdf orcamento', 'novo orcamento', 'enviar proposta'
    ],
    description: "Criação de propostas comerciais de manutenção ou instalação com geração de link externo para aprovação online e assinatura pelo cliente final.",
    steps: [
      "Acesse o menu 'Orçamentos' na barra lateral esquerda.",
      "Clique no botão '+ Novo Orçamento' no canto superior direito.",
      "Selecione o Cliente de destino e vincule a Ordem de Serviço de origem (se aplicável).",
      "Adicione as Peças do Estoque (o valor é puxado automaticamente) e inclua os Serviços de Mão de Obra definindo os valores.",
      "Defina condições de pagamento, validade da proposta e clique em Salvar.",
      "No cabeçalho do orçamento salvo, clique em 'Link Público'.",
      "Copie a URL gerada e envie ao cliente por WhatsApp ou E-mail.",
      "O cliente acessa a página pública, confere os valores, assina na tela do celular ou computador e clica em 'Aprovar Orçamento' ou 'Recusar Orçamento' (fornecendo o motivo)."
    ],
    technicalDetails: "• **Frontend Admin:** Gerido em `QuoteManagement.tsx` com cálculos matemáticos em tempo real.\n• **Frontend Público:** Exibido em `src/components/public/PublicQuoteView.tsx`.\n• **Banco de Dados:** Tabela `public.quotes` atualiza seu campo `status` para 'approved' ou 'rejected'. Quando aprovado, os itens de estoque vinculados geram movimentações automáticas de saída.",
    relatedFiles: [
      "src/components/admin/QuoteManagement.tsx",
      "src/components/public/PublicQuoteView.tsx",
      "src/services/dunoQueryService.ts"
    ]
  },
  {
    title: "Configuração de Integrações (Chaves de API e Webhooks)",
    category: "workflow",
    keywords: [
      'integracoes', 'api key', 'chave api', 'webhook', 'url webhook', 'documentacao api', 
      'docs', 'fern', 'api.dunoup.com.br', 'segredo webhook', 'eventos webhook', 'gerar chave api'
    ],
    description: "Geração de chaves de acesso REST e configuração de disparos HTTP (Webhooks) para sincronização com sistemas de terceiros.",
    steps: [
      "Acesse o menu 'Integrações' na barra lateral esquerda.",
      "Aba Chaves de API: Clique em '+ Criar Nova Chave', digite um Nome identificador e salve. Copie a chave (`nx_live_...`) exibida imediatamente na tela. Por segurança, ela nunca mais será mostrada na íntegra.",
      "Aba Webhooks: Clique em '+ Novo Webhook', insira um nome descritivo e digite a URL HTTP do servidor de destino que receberá os dados.",
      "Escolha ou use o segredo (`whsec_...`) gerado para assinatura das requisições POST.",
      "Marque os eventos desejados: `os_created` (OS Aberta), `os_updated` (OS Atualizada), `quote_approved` (Orçamento Aprovado) ou `stock_updated` (Estoque Atualizado).",
      "Clique em Salvar para ativar o webhook.",
      "Para consultar os formatos de dados da API, clique no botão 'Documentação da API' no topo direito da tela para abrir o portal Fern."
    ],
    technicalDetails: "• **Frontend:** Tela controlada por `IntegrationsPage.tsx` com sistema de tabs.\n• **Segurança da API:** Tokens baseados no prefixo `nx_live_...`. Apenas o hash SHA-256 do token é salvo no banco (`api_keys.key_hash`). As chamadas à API são filtradas pelo Tenant ID descriptografado do hash do Bearer token.\n• **Assinatura de Webhooks:** Os payloads enviados geram uma assinatura SHA-256 codificada com o segredo do webhook (`whsec_...`) enviada no header `X-Nexus-Signature` para o destino validar a origem.",
    relatedFiles: [
      "src/components/admin/IntegrationsPage.tsx",
      "supabase/migrations/20260520_create_integrations.sql",
      "supabase/functions/api_v1/index.ts"
    ]
  },
  {
    title: "Gestão de Usuários, Cargos e Controle RLS (Segurança)",
    category: "security",
    keywords: [
      'usuarios', 'permissao', 'grupo de permissao', 'bloquear acesso', 'senha administrador', 
      'senha convite', 'get_user_tenant_id', 'rls', 'seguranca', 'tenant', 'multi-tenant'
    ],
    description: "Administração de acessos do painel administrativo, grupos de permissão para restrição de ações de CRUD e políticas de isolamento de banco de dados.",
    steps: [
      "Acesse o menu 'Usuários' na barra lateral esquerda.",
      "Para criar um acesso: Clique em '+ Novo Usuário', insira Nome, E-mail e selecione a quais Grupos de Permissões o usuário pertence.",
      "Clique em enviar. O sistema enviará um link por e-mail para o usuário criar a sua própria senha por questões de conformidade com a LGPD (o admin não cria senhas).",
      "Para configurar permissões dos grupos: Acesse 'Configurações' > aba 'Grupos'. Ative ou desative as chaves de CRUD (Criar, Editar, Excluir, Visualizar) para cada módulo do sistema.",
      "Caso um usuário tente interagir com um botão para o qual seu grupo não possui permissão, o botão aparecerá esmaecido (dimmed) e ao clicar será mostrado o alerta de 'Acesso Negado'."
    ],
    technicalDetails: "• **Frontend:** Controlado por `UserManagement.tsx` e modal integrado em `GroupFormModal.tsx`.\n• **Segurança Multi-Tenant (RLS):** Toda query no Supabase é protegida no banco de dados por políticas RLS. As tabelas filtram automaticamente registros pela expressão `USING (tenant_id = public.get_user_tenant_id())`, que identifica a empresa ativa da sessão autenticada de forma inviolável no PostgreSQL.",
    relatedFiles: [
      "src/components/admin/UserManagement.tsx",
      "src/components/layout/AdminLayout.tsx",
      "supabase/migrations/20260520_fix_integrations_rls.sql"
    ]
  },
  {
    title: "Padrão Visual das Letras e Tipografia do Sistema (Poppins)",
    category: "design",
    keywords: [
      'negrito global', 'fonte', 'tamanho de letra', 'index.css', 'poppins', 'suavizar negrito', 
      'letras padrao', 'padrao visual', 'estilo de letras', 'visual clean', 'retirar negrito'
    ],
    description: "Normalização estética de fontes e pesos para garantir um design de alta qualidade, leveza e consistência tipográfica em todas as páginas do sistema.",
    steps: [
      "O sistema utiliza a fonte 'Poppins' como fonte padrão global.",
      "Para garantir que a tipografia se mantenha elegante e sem letras excessivamente grossas e pretas (negrito pesado), a espessura das fontes é controlada.",
      "Títulos (`h1` a `h6`), cabeçalhos de tabelas (`th`), textos destacados (`strong`, `b`) e as classes de negrito (`.font-bold`, `.font-semibold`) são interceptados e normalizados para o peso `500` (Medium).",
      "O peso `500` da fonte Poppins serve como um negrito suave e altamente legível, unificando todo o sistema com a estética da página de integrações."
    ],
    technicalDetails: "• **Implementação de Design:** Regras injetadas em `src/styles/index.css` utilizando a diretiva CSS `!important`. Isso força a substituição de pesos de fonte nativos do navegador e das classes padrão do TailwindCSS (como `font-bold` que aplica 700 ou `font-semibold` que aplica 600) para o padrão uniforme de `500`.",
    relatedFiles: [
      "src/styles/index.css"
    ]
  },
  {
    title: "Visão de Campo (Mapa GPS) e Agenda de Serviços",
    category: "workflow",
    keywords: [
      'mapa', 'visao de campo', 'gps', 'localizacao', 'rota', 'rastreamento', 'calendario', 
      'agenda', 'agendamento', 'programacao', 'datas', 'sla', 'sla 24h', 'sla 48h'
    ],
    description: "Visualização interativa da agenda de Ordens de Serviço por período e rastreamento em tempo real da geolocalização dos técnicos em campo.",
    steps: [
      "Visão de Campo (Mapa): Acesse o menu 'Visão de Campo' na barra lateral. O mapa exibirá Pins de Técnicos e Clientes. Ao clicar no pin do técnico, você vê o status atual, contato e OS ativa.",
      "Agenda (Calendário): Acesse o menu 'Agenda' na barra lateral. Navegue pelas visões de Mês, Semana ou Dia. A cor dos cards na agenda reflete o status atual da OS.",
      "Métricas de SLA: No painel do Dashboard inicial, as métricas de conformidade com SLA (metas de atendimento em até 24 horas ou 48 horas) são exibidas nos gráficos operacionais."
    ],
    technicalDetails: "• **Visão de Campo:** Componente `TechnicianMap.tsx` que utiliza mapas do Google Maps ou OpenStreetMap integrados. Consome coordenadas de latitude e longitude salvas nos cadastros e enviadas pelo App Mobile do técnico.\n• **Calendário:** Componente `OrderCalendar.tsx` integrado com bibliotecas de grid temporal.",
    relatedFiles: [
      "src/components/admin/OrderCalendar.tsx",
      "src/components/admin/TechnicianMap.tsx",
      "src/components/admin/AdminDashboard.tsx"
    ]
  }
];

// ── Motor Fuzzy e Normalização NLP ──

function removeAccents(str: string): string {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Algoritmo Levenshtein para medir distância entre strings
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

// ══════════════════════════════════════════════════════════════
// ⚙️ MOTOR DE BUSCA SEMÂNTICA E ANALISADOR DE CONSCIÊNCIA
// Varre a base de engenharia e fluxos ponderando relevância das palavras
// ══════════════════════════════════════════════════════════════
export function analyzeAndDiscover(input: string): string | null {
  const query = removeAccents(input.toLowerCase());

  // Tokeniza e limpa a query de conectivos
  const stopwords = new Set([
    'de', 'do', 'da', 'em', 'para', 'com', 'um', 'uma', 'os', 'as', 'o', 'a', 
    'como', 'fazer', 'onde', 'qual', 'quais', 'sistema', 'tela', 'modulo', 
    'botao', 'que', 'se', 'na', 'no', 'eu', 'quero', 'detalhes', 'executar',
    'tarefa', 'dentro', 'como', 'consigo', 'posso', 'faco', 'passo', 'a', 'passo'
  ]);
  
  const tokens = query.split(/[\s,.\-?/\\_]+/).filter(t => t.length > 2 && !stopwords.has(t));

  if (tokens.length === 0) return null;

  let bestNode: KnowledgeNode | null = null;
  let maxScore = 0;

  for (const node of CONSCIOUSNESS_BASE) {
    let score = 0;

    // Regra 1: Casamento direto com keywords do nó (peso 20 por palavra-chave completa correspondida na query)
    for (const kw of node.keywords) {
      const nKw = removeAccents(kw.toLowerCase());
      if (query.includes(nKw)) {
        score += 25;
      }
    }

    // Regra 2: Presença de tokens da pergunta no título do fluxo (peso 15 por token)
    const titleNormalized = removeAccents(node.title.toLowerCase());
    for (const token of tokens) {
      if (titleNormalized.includes(token)) {
        score += 15;
      }
    }

    // Regra 3: Casamento aproximado por Levenshtein de tokens nas keywords (tolerância a erros)
    for (const kw of node.keywords) {
      const nKw = removeAccents(kw.toLowerCase());
      const kwWords = nKw.split(/\s+/);
      for (const kwWord of kwWords) {
        for (const token of tokens) {
          if (kwWord === token) {
            score += 10;
          } else if (token.length > 4 && kwWord.length > 4) {
            const dist = levenshtein(token, kwWord);
            if (dist <= 1) {
              score += 6; // quase igual
            }
          }
        }
      }
    }

    // Regra 4: Casamento de tokens nos caminhos dos arquivos do projeto (peso 8 por token)
    for (const file of node.relatedFiles) {
      const nFile = file.toLowerCase();
      for (const token of tokens) {
        if (nFile.includes(token)) {
          score += 8;
        }
      }
    }

    if (score > maxScore) {
      maxScore = score;
      bestNode = node;
    }
  }

  // Retorna resposta estruturada se o score for confiável (mínimo 15 pontos)
  if (bestNode && maxScore >= 15) {
    let response = `🧠 **Consciência de Engenharia Nexus OS**\n\n`;
    response += `📌 **Módulo/Fluxo:** ${bestNode.title}\n`;
    response += `📖 **Descrição Operacional:** ${bestNode.description}\n\n`;

    if (bestNode.steps.length > 0) {
      response += `🛠️ **Como executar esta tarefa (Passo a Passo):**\n`;
      bestNode.steps.forEach((step, idx) => {
        response += `  ${idx + 1}. ${step}\n`;
      });
      response += `\n`;
    }

    response += `💻 **Detalhes Técnicos de Desenvolvimento:**\n`;
    response += `${bestNode.technicalDetails}\n\n`;

    if (bestNode.relatedFiles.length > 0) {
      response += `📁 **Arquivos Relacionados no Projeto:**\n`;
      bestNode.relatedFiles.forEach(file => {
        response += `  • [${file.split('/').pop()}](file:///${file})\n`;
      });
    }

    return response;
  }

  // Fallback Inteligente e Proativo (se não bater um score alto, sugere os 3 melhores combinados)
  const sortedMatches = CONSCIOUSNESS_BASE
    .map(node => {
      let score = 0;
      for (const kw of node.keywords) {
        const nKw = removeAccents(kw.toLowerCase());
        if (query.includes(nKw)) score += 15;
      }
      for (const token of tokens) {
        if (removeAccents(node.title.toLowerCase()).includes(token)) score += 8;
      }
      return { node, score };
    })
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (sortedMatches.length > 0) {
    let response = `Ainda estou aprendendo a responder a essa pergunta exata, mas fiz uma busca na arquitetura do Nexus OS e encontrei fluxos relacionados:\n\n`;
    sortedMatches.forEach((match) => {
      response += `• **${match.node.title}**\n  _${match.node.description}_\n\n`;
    });
    response += `*Pode refazer a pergunta usando termos como "como criar", "etiqueta", "PMOC", "api" ou "estoque" para eu te dar o passo a passo exato!*`;
    return response;
  }

  return null;
}
