// ============================================================
// src/services/dunoBrain.ts
// 🧠 Duno IA Core Brain — Sistema de Consciência do Nexus OS
// Motor de Busca Ponderada e Base Integrada de Procedimentos do Sistema
// ============================================================

import { searchProjectFiles } from '../utils/fileSearch';

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
    title: "Execução de Ordens de Serviço no App Duno (Aplicativo Nativo do Técnico)",
    category: "workflow",
    keywords: [
      'app duno', 'app do tecnico', 'mobile', 'celular', 'executar os', 'iniciar atendimento', 
      'concluir os', 'impedimento', 'app', 'aplicativo', 'foto os', 'camera', 'gps tecnico', 
      'visita tecnica', 'assinar os', 'assinatura cliente'
    ],
    description: "Procedimento completo de atendimento em campo realizado pelo técnico através do aplicativo celular nativo.",
    steps: [
      "O técnico abre o aplicativo nativo App Duno em seu dispositivo móvel (Android ou iOS) e faz o login seguro.",
      "Na tela principal do app, acessa a lista de OS agendadas para o dia e seleciona o chamado que irá atender.",
      "Ao chegar no local de atendimento, clica em 'Iniciar Atendimento'. O status passa a 'Em Andamento' e a localização de início é gravada no banco de dados.",
      "Na aba 'Mídias', o técnico tira fotos e faz vídeos das condições do equipamento e do local usando a câmera do celular.",
      "Na aba 'Formulários', responde os checklists obrigatórios vinculados ao tipo de serviço e ao equipamento.",
      "Se precisar utilizar peças, clica em 'Adicionar Peça', escolhe a opção de câmera para ler o QR Code físico fixado na peça/embalagem (ou busca manualmente pelo SKU) e define a quantidade consumida.",
      "Caso encontre problemas para concluir, clica em 'Registrar Impedimento', escolhe o motivo (falta de acesso, falta de peça, etc.) e o chamado passa ao status 'Impedido'.",
      "Ao concluir os trabalhos, colhe a assinatura digital na tela sensível ao toque do celular e finaliza o atendimento."
    ],
    technicalDetails: "• **Mobile App:** Aplicativo nativo construído com componentes móveis de alta performance.\n• **Upload de Fotos/Vídeos:** Os arquivos de imagem e vídeo são enviados em tempo real para os Buckets do Supabase Storage.\n• **Integração de Estoque:** Ao consumir peças via QR Code no App, o estoque é atualizado de imediato com a baixa no banco de dados.\n• **Geolocalização:** Captura coordenadas de GPS no momento em que o técnico altera o status para 'Em Deslocamento', 'Em Andamento' ou 'Concluída'.",
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
  },
  {
    title: "Gestão Detalhada de Clientes e Geolocalização (Cadastro & Detalhes)",
    category: "workflow",
    keywords: [
      'detalhes cliente', 'localizacao cliente', 'cadastrar cliente', 'editar cliente', 
      'excluir cliente', 'coordenadas', 'mapa cliente', 'cnpj cliente', 'cep cliente'
    ],
    description: "Cadastro de clientes com geolocalização por endereço, CEP autocomplete e histórico operacional.",
    steps: [
      "Acesse 'Cliente' na barra lateral esquerda.",
      "Para cadastrar: Clique em '+ Novo Cliente'. Insira o CNPJ/CPF (com validação automática de formato), Razão Social, E-mail, Telefone, CEP (o preenchimento do CEP busca automaticamente Rua, Bairro, Cidade e Estado via API externa) e salve.",
      "Para geolocalização: O sistema converte o endereço do cliente em coordenadas de Latitude e Longitude automaticamente. Essas coordenadas posicionam o cliente no mapa do módulo 'Visão de Campo'.",
      "Para visualizar histórico: Clique sobre o cliente na listagem. Uma aba lateral se abre mostrando dados de cadastro e a lista de todas as Ordens de Serviço (OS) históricas daquela empresa."
    ],
    technicalDetails: "• **Componente:** `CustomerManagement.tsx` com painéis laterais deslizantes para detalhes e edição.\n• **Banco de Dados:** Tabela `public.customers` armazena os metadados cadastrais e o ponto de geolocalização (`latitude`, `longitude`).",
    relatedFiles: [
      "src/components/admin/CustomerManagement.tsx",
      "src/services/customerService.ts"
    ]
  },
  {
    title: "Gestão de Ativos, Equipamentos e Cálculo de Garantia",
    category: "workflow",
    keywords: [
      'cadastrar ativo', 'editar ativo', 'calcular garantia', 'garantia vencida', 
      'garantia ativo', 'marca equipamento', 'modelo equipamento', 'historico ativo'
    ],
    description: "Cadastro de equipamentos com cálculo em tempo real do período de garantia e histórico de manutenção preventiva/corretiva.",
    steps: [
      "Acesse 'Ativos' na barra lateral esquerda.",
      "Para cadastrar: Clique em '+ Novo Ativo'. Vincule a um Cliente cadastrado, selecione a Família do Equipamento (Split, Chiller, VRF, etc.), digite a Marca, Modelo, Número de Série e Patrimônio.",
      "Configuração de Garantia: Preencha opcionalmente a 'Data de Fabricação' e o período de 'Garantia (em meses)'.",
      "Cálculo Automático: O sistema calcula a data de término somando a garantia em meses à data de fabricação. Se a data atual for anterior ao término, exibe o selo verde 'Em Garantia'. Se for posterior, exibe o selo vermelho 'Fora de Garantia'.",
      "Histórico de Manutenções: Ao clicar em um ativo na tabela, abra a aba 'Histórico' no painel lateral para ver todas as OS vinculadas àquele equipamento."
    ],
    technicalDetails: "• **Componente:** `EquipmentManagement.tsx` contendo a tabela de inventário de ativos e os formulários de cadastro.\n• **Cálculo:** Lógica Javascript em tempo real baseada em `date-fns` ou manipulação nativa de datas do browser.",
    relatedFiles: [
      "src/components/admin/EquipmentManagement.tsx",
      "src/services/equipmentService.ts"
    ]
  },
  {
    title: "Cadastro, Edição e Gestão de Técnicos",
    category: "workflow",
    keywords: [
      'cadastrar tecnico', 'editar tecnico', 'excluir tecnico', 'inativar tecnico', 
      'bloquear tecnico', 'desativar tecnico', 'equipe de campo', 'novo tecnico', 'adicionar tecnico'
    ],
    description: "Fluxo completo para adicionar, modificar, inativar ou excluir técnicos do sistema.",
    steps: [
      "Acesse 'Técnicos' na barra lateral esquerda.",
      "Para cadastrar: Clique em '+ Novo Técnico' no topo direito. Preencha nome, contato (telefone/WhatsApp), cor de identificação e especialidade.",
      "Para editar ou inativar: Clique no técnico correspondente na listagem. Altere os dados necessários ou mude o status de disponibilidade para inativá-lo temporariamente.",
      "Para excluir: Clique no botão com ícone de lixeira ao lado do nome do técnico na listagem para removê-lo em definitivo.",
      "Nota: Técnicos não acessam o painel web administrativo, eles apenas usam o App Duno mobile."
    ],
    technicalDetails: "• **Componente:** `TechnicianManagement.tsx` contendo formulários de criação e atualização da equipe de campo.\n• **Banco de Dados:** Tabela `public.technicians` armazenando metadados.",
    relatedFiles: [
      "src/components/admin/TechnicianManagement.tsx",
      "src/services/technicianService.ts"
    ]
  },
  {
    title: "Módulo Financeiro, Relatórios de Receitas e Faturamento",
    category: "workflow",
    keywords: [
      'faturamento', 'relatorio financeiro', 'graficos financeiro', 'receitas', 
      'valores os', 'valor peca', 'lucro', 'pdf financeiro', 'imprimir financeiro'
    ],
    description: "Gestão consolidada de receitas oriundas de Ordens de Serviço concluídas e orçamentos aprovados com exportação de relatórios.",
    steps: [
      "Acesse 'Financeiro' na barra lateral esquerda.",
      "Filtros de Período: Use o seletor de data inicial e final no topo esquerdo para segmentar o faturamento.",
      "Análise de Performance: Visualize os cards de receita total consolidada no período, faturamento por tipo de serviço e faturamento por técnico.",
      "Listagem de Transações: A tabela central mostra cada OS finalizada e orçamento aprovado, com seus respectivos valores unitários e somatórios.",
      "Impressão: Clique no botão 'Exportar Relatório' no topo direito para gerar um documento PDF formatado no tamanho A4 contendo tabelas financeiras limpas e gráficos consolidados."
    ],
    technicalDetails: "• **Componente:** `FinancialDashboard.tsx` integrado com bibliotecas de plotagem de gráficos responsivos.\n• **Layout A4:** O CSS de impressão restringe a largura máxima e redimensiona fontes para evitar overflow de tabelas financeiras no papel.",
    relatedFiles: [
      "src/components/admin/FinancialDashboard.tsx",
      "src/services/financeService.ts"
    ]
  },
  {
    title: "Formulários Customizados e Regras de Ativação no App do Técnico",
    category: "workflow",
    keywords: [
      'criar checklist', 'criar formulario', 'regras de ativacao', 'perguntas formulario', 
      'tipo de campo', 'checklist obrigatorio', 'formulario tecnico'
    ],
    description: "Criação de checklists flexíveis com condições de exibição inteligente para o técnico responder em campo.",
    steps: [
      "Acesse 'Formulários' na barra lateral esquerda.",
      "Para criar: Clique em '+ Novo Formulário'. Defina o título do checklist.",
      "Adicionar Questões: Clique em 'Adicionar Campo' e escolha o tipo de resposta: Texto, Número, Checkbox (Sim/Não), Seleção Múltipla, Foto obrigatória ou Assinatura.",
      "Regras de Ativação Dinâmicas: Configure para que o formulário apareça no app apenas quando a OS for de um tipo específico (ex: 'Preventiva') ou se o Equipamento for de uma determinada Família (ex: 'Chiller').",
      "No App Duno: Quando o técnico inicia o atendimento de uma OS que atende aos critérios configurados, o formulário é carregado na aba 'Formulários' do app celular e o preenchimento deve ser concluído para fechar a OS."
    ],
    technicalDetails: "• **Componentes:** `FormManagement.tsx` (construtor do formulário no painel admin) e componentes móveis no App do Técnico para preenchimento dinâmico.\n• **Estrutura de Dados:** Salvo em formato JSON no banco de dados para flexibilidade máxima dos campos customizados.",
    relatedFiles: [
      "src/components/admin/FormManagement.tsx",
      "src/apps/tech/components/DynamicFormRenderer.tsx"
    ]
  },
  {
    title: "Configurações Globais da Organização, SLA e Parâmetros do App",
    category: "workflow",
    keywords: [
      'configurar sla', 'mudar logo', 'configurar organizacao', 'parametros app', 
      'meta de atendimento', 'configuracoes do sistema', 'dados organizacao'
    ],
    description: "Configuração do perfil da empresa, limites de tempo de atendimento (SLA) e permissões de visibilidade do App do Técnico.",
    steps: [
      "Acesse 'Configurações' na barra lateral esquerda.",
      "Aba Organização: Cadastre os dados oficiais da sua empresa (Nome Fantasia, CNPJ, Telefone de contato corporativo e faça o upload da Logo da empresa que sairá nos relatórios PDF).",
      "Aba APP do Técnico: Ative ou desative parâmetros do aplicativo móvel, tais como: 'Exibir preços das peças', 'Permitir OS simultâneas', 'Mostrar telefone do cliente' e 'Exibir histórico de visitas anteriores'.",
      "Aba Parâmetros de SLA: Defina as metas de tempo de atendimento para chamados. O padrão do sistema alerta visualmente OS que ultrapassam 24 horas (Alerta normal) ou 48 horas (Alerta crítico) sem finalização."
    ],
    technicalDetails: "• **Componente:** `SystemSettings.tsx` dividido em seções tabulares para organização e facilidade de navegação.",
    relatedFiles: [
      "src/components/admin/SystemSettings.tsx",
      "src/components/layout/AdminLayout.tsx"
    ]
  },
  {
    title: "Triagem de WhatsApp, Solicitações de Atendimento e Caixa de Entrada",
    category: "workflow",
    keywords: [
      'whatsapp bot', 'bot do zap', 'robo whatsapp', 'atendimento automatico', 
      'solicitacao de atendimento', 'triagem', 'aprovar solicitacao', 'rejeitar solicitacao', 'inbox'
    ],
    description: "Configuração do bot 24/7 no WhatsApp e triagem de relatos de clientes que se tornam chamados ou OS na caixa de entrada.",
    steps: [
      "No menu Configurações > WhatsApp Bot, conecte o número corporativo da empresa.",
      "O bot da Duno IA passará a recepcionar os clientes no WhatsApp.",
      "Quando o cliente relatar um problema, o bot entende, extrai os dados e envia para a fila de Triagem.",
      "Acesse Atividade > aba Solicitações de Atendimento para ver a caixa de entrada.",
      "Para Aceitar: Clique na solicitação. O sistema verifica se o cliente existe. Ao aprovar, o chamado se torna uma OS real vinculada a um técnico.",
      "Para Rejeitar: Você pode cancelar a solicitação e registrar o motivo do cancelamento."
    ],
    technicalDetails: "• **Webhook:** A integração oficial processa os webhooks da Meta/WhatsApp.\n• **Triagem:** Tabela separada no banco que isola relatos brutos de OS formais.",
    relatedFiles: [
      "src/components/admin/WhatsAppSettings.tsx",
      "src/components/admin/ServiceRequests.tsx"
    ]
  },
  {
    title: "Contas a Pagar e Despesas Financeiras",
    category: "workflow",
    keywords: [
      'contas a pagar', 'contas', 'despesas', 'fornecedor', 'pagamento parcial', 
      'juros', 'multa', 'anexo nota fiscal', 'categoria de despesa', 'centro de custo',
      'boleto', 'fatura', 'lancamento'
    ],
    description: "Lançamento e controle de despesas operacionais da empresa com anexos, controle de juros e pagamentos parciais.",
    steps: [
      "Acesse o menu Financeiro e vá na aba Contas a Pagar.",
      "Para Cadastrar: Clique em '+ Nova Conta'.",
      "Insira o valor, fornecedor, descrição e data de vencimento.",
      "Anexos: Faça o upload de notas fiscais (PDF) ou comprovantes direto no registro.",
      "Pagamentos Parciais: Ao dar baixa, você pode informar um valor menor que o total. O sistema manterá o saldo restante em aberto.",
      "Juros/Multas: Se a conta estiver atrasada, o sistema aplica regras configuradas para recalcular o valor."
    ],
    technicalDetails: "• **Componente:** `AccountsPayableTab.tsx`.\n• **Cálculos:** Usa rotinas utilitárias para computar multas e abater saldos parcialmente em tempo real.",
    relatedFiles: [
      "src/components/admin/AccountsPayableTab.tsx",
      "src/components/admin/CreatePayableModal.tsx"
    ]
  },
  {
    title: "Check-in Automático e Geofencing (Restrição de Execução)",
    category: "workflow",
    keywords: [
      'check in automatico', 'raio de atendimento', 'geofencing', 'restringir execucao', 
      'bloqueio de os', 'bloqueio gps', 'cheguei cliente', 'cerca virtual'
    ],
    description: "Ferramentas de segurança via GPS para o aplicativo do técnico, automatizando o check-in e bloqueando atendimentos falsos.",
    steps: [
      "No menu Configurações, aba APP do Técnico.",
      "Check-in Automático: Habilite esta função para que o App Duno detecte automaticamente quando o técnico entra no raio de 50 metros do cliente e inicie a OS sozinho após alguns minutos.",
      "Restringir Execução: Habilite para bloquear o botão de 'Concluir' caso o técnico tente finalizar a OS a mais de 300 metros de distância do local da visita.",
      "Essas funções exigem que a localização GPS esteja ativa no celular do técnico."
    ],
    technicalDetails: "• **PWA/App:** Faz uso da API de Geolocation do browser associada ao Haversine formula para calcular distâncias esféricas.",
    relatedFiles: [
      "src/apps/tech/TechAppShell.tsx",
      "src/components/admin/SystemSettings.tsx"
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
export async function analyzeAndDiscover(input: string): Promise<string | null> {
  const query = removeAccents(input.toLowerCase());

  // Tokeniza e limpa a query de conectivos
  const stopwords = new Set([
    'de', 'do', 'da', 'em', 'para', 'com', 'um', 'uma', 'os', 'as', 'o', 'a', 
    'como', 'fazer', 'onde', 'qual', 'quais', 'sistema', 'tela', 'modulo', 
    'botao', 'que', 'se', 'na', 'no', 'eu', 'quero', 'detalhes', 'executar',
    'tarefa', 'dentro', 'como', 'consigo', 'posso', 'faco', 'passo', 'a', 'passo',
    'duno', 'ia', 'bot', 'copilot'
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

    // Regra 2: Presença de tokens da pergunta no título do fluxo (peso 10 por token)
    const titleNormalized = removeAccents(node.title.toLowerCase());
    for (const token of tokens) {
      if (titleNormalized.includes(token)) {
        score += 10;
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

  // Retorna resposta estruturada se o score for confiável (mínimo 25 pontos)
  if (bestNode && maxScore >= 25) {
    let response = `🤖 **Duno Copilot — Guia do Sistema**\n\n`;
    response += `📌 **Módulo/Fluxo:** ${bestNode.title}\n`;
    response += `📖 **Descrição Operacional:** ${bestNode.description}\n\n`;

    if (bestNode.steps.length > 0) {
      response += `🛠️ **Como executar esta tarefa (Passo a Passo):**\n`;
      bestNode.steps.forEach((step, idx) => {
        response += `  ${idx + 1}. ${step}\n`;
      });
      response += `\n`;
    }

    return response;
  }

  // ============================================================
  // 🤖 MOTOR GERATIVO HEURÍSTICO DO DUNO COPILOT
  // Intercepta e monta guias customizados de CRUD para qualquer tela
  // ============================================================
  const verbKey = detectVerb(query);

  // Apenas intercepta se o usuário usar um verbo claro de ação no sistema (CRUD) ou perguntar explicitamente pelo sistema
  const isSystemQuestion = verbKey !== null || query.includes("sistema") || query.includes("modulo") || query.includes("tela") || query.includes("painel");

  if (isSystemQuestion) {
    const matchedModule = detectModule(query);

    if (matchedModule) {
      const verbLabels = {
        create: 'Criar / Cadastrar',
        update: 'Editar / Alterar',
        delete: 'Excluir / Deletar / Cancelar',
        read: 'Visualizar / Consultar',
        report: 'Gerar Relatório / Imprimir'
      };

      let response = `🤖 **Duno Copilot — Assistente de Procedimento**\n\n`;
      
      if (verbKey) {
        response += `Identifiquei sua intenção de **${verbLabels[verbKey]}** no módulo de **${matchedModule.name}**.\n\n`;
        response += `📍 **Onde executar no sistema:**\n`;
        response += `Acesse o caminho: \`${matchedModule.menuPath}\`\n\n`;
        response += `🛠️ **Como fazer (Passo a Passo):**\n`;
        response += `1. ${matchedModule.steps[verbKey]}\n`;
        response += `2. Certifique-se de estar autenticado com as permissões corretas para este módulo.\n`;
        response += `3. Qualquer ação crítica de exclusão ou alteração de dados abrirá o modal de confirmação do Design System.\n\n`;
      } else {
        response += `Identifiquei que você está buscando informações sobre o módulo de **${matchedModule.name}**.\n\n`;
        response += `📍 **Onde encontrar:** \`${matchedModule.menuPath}\`\n\n`;
        response += `🛠️ **Ações comuns mapeadas pelo Copilot:**\n`;
        response += `• **Criar:** ${matchedModule.steps.create}\n`;
        response += `• **Editar:** ${matchedModule.steps.update}\n`;
        response += `• **Excluir:** ${matchedModule.steps.delete}\n`;
        response += `• **Visualizar:** ${matchedModule.steps.read}\n`;
        if (matchedModule.steps.report) {
          response += `• **Imprimir:** ${matchedModule.steps.report}\n`;
        }
        response += `\n`;
      }

      response += `*Espero ter ajudado! Se tiver outra dúvida de fluxo, pode mandar.*`;
      return response;
    }
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

  // Se chegou até aqui e o score dos fallbacks é baixo ou não há resultados, retorna null
  // para permitir que o RAG ou outras fontes tentem responder.
  return null;
}

export interface CopilotModule {
  name: string;
  nouns: string[];
  menuPath: string;
  filePath: string;
  dbTable: string;
  steps: {
    create: string;
    update: string;
    delete: string;
    read: string;
    report: string;
  };
}

export const COPILOT_MODULES: CopilotModule[] = [
  {
    name: "Ordens de Serviço (Atividades)",
    nouns: ['os', 'ordem', 'ordens', 'servico', 'servicos', 'atividade', 'atividades', 'chamado', 'chamados', 'visita', 'visitas'],
    menuPath: "Menu Principal > Atividade",
    filePath: "src/components/admin/AdminDashboard.tsx",
    dbTable: "orders",
    steps: {
      create: "Clique em '+ Nova OS' no topo direito e complete o assistente em 5 etapas (Cliente, Tipo, Detalhes, Técnico e Revisão).",
      update: "Clique na OS desejada na listagem e depois no botão 'Editar OS' no cabeçalho.",
      delete: "Abra a OS na tela e clique no botão 'Cancelar OS' no topo direito. Confirme no modal.",
      read: "Veja a listagem de chamados na aba Atividade. Utilize a barra de busca no topo por número ou cliente.",
      report: "Clique no botão 'Gerar PDF' no cabeçalho interno da OS para exportar o relatório técnico."
    }
  },
  {
    name: "Clientes",
    nouns: ['cliente', 'clientes', 'empresa', 'cnpj', 'cpf', 'dados de cliente'],
    menuPath: "Menu Principal > Cliente",
    filePath: "src/components/admin/CustomerManagement.tsx",
    dbTable: "customers",
    steps: {
      create: "Clique em '+ Novo Cliente' no topo direito da tela e preencha CNPJ, Razão Social, contatos e endereço.",
      update: "Clique no cliente na listagem para abrir o painel de detalhes e edite os campos.",
      delete: "Clique no botão de lixeira no final da linha do cliente correspondente na tabela.",
      read: "Visualize e filtre a lista completa de clientes cadastrados no painel central.",
      report: "Os dados de faturamento por cliente podem ser exportados em PDF no módulo Financeiro."
    }
  },
  {
    name: "Equipamentos (Ativos)",
    nouns: ['equipamento', 'equipamentos', 'ativo', 'ativos', 'maquina', 'aparelho', 'ar condicionado', 'garantia'],
    menuPath: "Menu Principal > Ativos",
    filePath: "src/components/admin/EquipmentManagement.tsx",
    dbTable: "equipments",
    steps: {
      create: "Clique em '+ Novo Ativo' no topo direito, defina marca, modelo, série, patrimônio e garantia.",
      update: "Abra os detalhes do ativo na tabela e faça as modificações necessárias.",
      delete: "Clique no ícone de lixeira na linha correspondente ao ativo na listagem.",
      read: "Confira a lista de ativos e visualize o status da garantia (badge verde para Em Garantia ou vermelho para Vencido).",
      report: "Abra a aba 'Histórico' de um ativo para visualizar e exportar todas as OS vinculadas a ele."
    }
  },
  {
    name: "Técnicos",
    nouns: ['tecnico', 'tecnicos', 'equipe', 'campo', 'funcionario', 'especialidade'],
    menuPath: "Menu Principal > Técnicos",
    filePath: "src/components/admin/TechnicianManagement.tsx",
    dbTable: "technicians",
    steps: {
      create: "Clique em '+ Novo Técnico' no topo direito da tela para preencher nome, contato e cor de identificação.",
      update: "Abra o perfil do técnico correspondente e edite sua especialidade ou status de disponibilidade.",
      delete: "Clique no botão de lixeira ao lado do nome do técnico para revogar o acesso dele.",
      read: "Veja a equipe listada ou acesse 'Visão de Campo' para visualizar o mapa com técnicos em tempo real.",
      report: "O relatório financeiro de atendimentos por técnico pode ser exportado na tela de Financeiro."
    }
  },
  {
    name: "Estoque de Peças",
    nouns: ['estoque', 'peca', 'pecas', 'material', 'materiais', 'produto', 'produtos', 'item', 'itens', 'sku'],
    menuPath: "Menu Principal > Estoque",
    filePath: "src/components/admin/StockManagement.tsx",
    dbTable: "stock_items",
    steps: {
      create: "Clique em '+ Novo Item' na tela de Estoque, insira o nome, SKU, quantidade e valor unitário.",
      update: "Selecione o item e insira movimentação de Entrada ou Saída para ajustar a quantidade disponível.",
      delete: "Clique no botão de lixeira correspondente ao item que deseja excluir da tabela.",
      read: "Visualize as peças cadastradas organizadas em categorias, com barra de busca por SKU no topo.",
      report: "Selecione múltiplos itens e clique em 'Imprimir Etiquetas' no topo para gerar etiquetas A4 ou Térmicas."
    }
  },
  {
    name: "Orçamentos e Propostas",
    nouns: ['orcamento', 'orcamentos', 'proposta', 'propostas', 'cotacao', 'cotacoes'],
    menuPath: "Menu Principal > Orçamentos",
    filePath: "src/components/admin/QuoteManagement.tsx",
    dbTable: "quotes",
    steps: {
      create: "Clique em '+ Novo Orçamento', selecione o cliente, adicione peças/serviços e clique em Salvar.",
      update: "Clique no orçamento pendente da lista para editar os itens ou valores da cotação.",
      delete: "Abra a proposta e selecione 'Excluir Orçamento' ou mude seu status para 'Recusado'.",
      read: "Veja e gerencie a lista de orçamentos categorizados por status (Pendentes, Aprovados, Recusados).",
      report: "Abra o orçamento e clique no botão 'Visualizar PDF' para gerar o relatório impresso."
    }
  },
  {
    name: "Contratos (PMOC)",
    nouns: ['contrato', 'contratos', 'pmoc', 'preventiva', 'manutencao planejada', 'recorrencia'],
    menuPath: "Menu Principal > Contratos",
    filePath: "src/components/admin/PlannedMaintenance.tsx",
    dbTable: "contracts",
    steps: {
      create: "Clique em '+ Novo Contrato', escolha o cliente, vincule os ativos e defina a periodicidade do ciclo.",
      update: "Abra os detalhes do contrato para pausá-lo, prorrogar a vigência ou mudar as datas de inspeção.",
      delete: "Clique em 'Encerrar Recorrência' ou 'Excluir Plano' nas opções internas do contrato.",
      read: "Acesse a listagem para acompanhar todos os contratos de preventivas recorrentes ativos.",
      report: "As ordens de serviço preventivas geradas pelo PMOC são agendadas e listadas na tela de Atividades."
    }
  },
  {
    name: "Integrações (API & Webhooks)",
    nouns: ['integracao', 'integracoes', 'api', 'api key', 'chave api', 'token api', 'webhook', 'webhooks'],
    menuPath: "Menu Principal > Integrações",
    filePath: "src/components/admin/IntegrationsPage.tsx",
    dbTable: "api_keys / webhooks",
    steps: {
      create: "Chaves de API: clique em '+ Criar Nova Chave' na aba Chaves de API. Webhooks: clique em '+ Novo Webhook' na aba de Webhooks.",
      update: "Chaves de API são imutáveis (devem ser recriadas). Webhooks podem ser editados clicando sobre eles.",
      delete: "Para revogar tokens ou remover Webhooks, clique no botão de lixeira ao lado de cada item listado.",
      read: "Veja as chaves ativas mascaradas na listagem e gerencie seus endpoints de webhook cadastrados.",
      report: "Clique em 'Documentação da API' no topo para acessar a especificação técnica interativa da API."
    }
  },
  {
    name: "Usuários e Permissões",
    nouns: ['usuario', 'usuarios', 'acesso', 'senha', 'permissao', 'permissoes', 'grupo', 'grupos'],
    menuPath: "Menu Principal > Usuários",
    filePath: "src/components/admin/UserManagement.tsx",
    dbTable: "users",
    steps: {
      create: "Clique em '+ Novo Usuário', defina nome, e-mail e adicione aos grupos. Ele definirá a senha via e-mail (LGPD).",
      update: "Selecione o perfil do usuário e altere seus grupos de permissão ou dados básicos.",
      delete: "Clique em 'Bloquear Acesso' na linha correspondente para suspender a conta dele por segurança.",
      read: "Monitore a lista de usuários autorizados e configure os níveis de permissão em Configurações > Grupos.",
      report: "Visualização completa de ações permitidas e bloqueadas nas abas de regras de privilégios."
    }
  },
  {
    name: "Formulários Customizados",
    nouns: ['formulario', 'formularios', 'checklist', 'checklists', 'template', 'templates'],
    menuPath: "Menu Principal > Formulários",
    filePath: "src/components/admin/FormManagement.tsx",
    dbTable: "forms",
    steps: {
      create: "Clique em '+ Novo Formulário', adicione as questões e defina as condições de exibição no App do Técnico.",
      update: "Selecione o checklist na listagem e clique em 'Editar Estrutura' para ajustar perguntas.",
      delete: "Clique na lixeira ao lado do formulário na tabela correspondente para apagá-lo.",
      read: "Veja a listagem de formulários ativos e vinculados a tipos de serviço específicos.",
      report: "As respostas coletadas pelos técnicos em campo ficam anexadas na OS correspondente (aba Formulários)."
    }
  },
  {
    name: "WhatsApp Bot",
    nouns: ['whatsapp', 'bot', 'zap', 'robo', 'triagem', 'solicitacoes', 'atendimento'],
    menuPath: "Configurações > WhatsApp Bot ou Atividades > Solicitações",
    filePath: "src/components/admin/WhatsAppSettings.tsx",
    dbTable: "service_requests",
    steps: {
      create: "Acesse Atividades > Solicitações de Atendimento para ver os chamados capturados pelo WhatsApp.",
      update: "Aprove ou Rejeite o chamado. Ao aprovar, ele vira uma OS (Ordem de Serviço).",
      delete: "Você pode rejeitar o chamado se for inválido.",
      read: "Veja toda a lista de chamados aguardando triagem no painel de solicitações.",
      report: "Nenhuma funcionalidade de PDF para caixas de entrada de triagem."
    }
  },
  {
    name: "Contas a Pagar",
    nouns: ['despesa', 'despesas', 'conta', 'fornecedor', 'pagar', 'pagamento parcial', 'multa', 'juros', 'boleto', 'boletos', 'fatura', 'faturas', 'lancamento', 'lancamentos'],
    menuPath: "Menu Principal > Financeiro > Aba Contas a Pagar",
    filePath: "src/components/admin/AccountsPayableTab.tsx",
    dbTable: "accounts_payable",
    steps: {
      create: "Acesse o Financeiro, aba Contas a Pagar e clique em '+ Nova Conta'.",
      update: "Edite valores ou registre uma baixa (pagamento parcial ou total) clicando no item listado.",
      delete: "Cancele a conta apagando seu registro através do botão de lixeira.",
      read: "Visualize os lançamentos e organize por vencimentos, pendentes e atrasados.",
      report: "Adicione anexos (PDF, recibos) no ato da baixa."
    }
  }
];

function detectVerb(query: string): 'create' | 'update' | 'delete' | 'read' | 'report' | null {
  const q = removeAccents(query);
  if (/(criar|criacao|novo|nova|cadastr|adicion|abrir|gerar|inserir|lanc|registr)/.test(q)) return 'create';
  if (/(edit|alter|modific|muda|atualiz|salvar|inativ|desativ|bloque)/.test(q)) return 'update';
  if (/(delet|exclui|remov|apaga|cancel|revoga|exclusao)/.test(q)) return 'delete';
  if (/(imprim|pdf|relatori|baixa|export|etiqueta|impressao)/.test(q)) return 'report';
  if (/(consultar\s+lista|onde\s+fica\s+a\s+tela|como\s+acessar|listar\s+todos)/.test(q)) return 'read';
  return null;
}

function detectModule(query: string): CopilotModule | null {
  const q = removeAccents(query);
  for (const mod of COPILOT_MODULES) {
    for (const noun of mod.nouns) {
      const nNoun = removeAccents(noun);
      if (new RegExp(`(^|\\b|\\s)${nNoun}`).test(q)) {
        return mod;
      }
    }
  }
  return null;
}
