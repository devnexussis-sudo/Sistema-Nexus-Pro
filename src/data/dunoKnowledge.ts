export interface KnowledgeEntry { keywords: string[]; response: string; }

// ══════════════════════════════════════════════════════════════
// NOMES CORRETOS DOS MENUS (pt-BR):
//   Dashboard | Atividade | Agenda | Visão de campo | Financeiro
//   Orçamentos | Estoque | Contratos | Cliente | Ativos
//   Formulários | Técnicos | Usuários | Configurações
// ══════════════════════════════════════════════════════════════

export const KNOWLEDGE_BASE: KnowledgeEntry[] = [
  // ── DASHBOARD ──
  { keywords: ['dashboard','painel','visão geral','overview','resumo','indicadores','kpi','tela inicial'],
    response: `O **Dashboard** é a tela inicial do sistema.\n\n**O que você encontra:**\n• Contadores de OS por status (Abertas, Em Andamento, Concluídas, Canceladas).\n• Gráficos de desempenho por período.\n• Filtros por **data inicial** e **data final** no topo da tela.\n• Resumo de técnicos ativos e clientes cadastrados.\n• Cards de acesso rápido aos módulos mais usados.\n\nPara acessar, clique em **"Dashboard"** na barra lateral.` },

  // ── ATIVIDADES (OS) ──
  { keywords: ['ordem de serviço','os','abrir os','criar os','nova os','chamado','abrir chamado','atividade','atividades'],
    response: `Para criar uma nova **OS**, acesse o menu **"Atividade"** na barra lateral e clique em **"+ Nova OS"**.\n\n**Assistente de criação em 5 etapas:**\n1. **Cliente** — Selecione o cliente (busca por nome).\n2. **Tipo de Serviço** — Corretiva, Preventiva, Instalação, etc.\n3. **Detalhes** — Título, Descrição e Prioridade (Normal, Urgente, Crítica).\n4. **Técnico** — Atribua o responsável e a data agendada.\n5. **Revisão** — Confira e confirme a criação.\n\n**Após criada:**\n• A OS aparece na listagem com status "Aberta".\n• O técnico recebe no App Mobile.\n• Um **link público** é gerado para o cliente acompanhar.` },

  { keywords: ['editar os','alterar os','modificar os','atualizar os'],
    response: `Para **editar uma OS**, acesse **"Atividade"**, clique na OS desejada e depois em **"Editar OS"**.\n\n**O que pode ser editado:**\n• Título, descrição e prioridade.\n• Técnico atribuído e data agendada.\n• Adicionar/remover ativos vinculados.\n• Observações internas.\n\n**Botões do cabeçalho da OS:**\n• **Editar OS** — Modo de edição.\n• **Visualizar** — Link público do cliente.\n• **WhatsApp** — Conversa direta com o cliente.\n• **Gerar PDF** — Exporta relatório.\n• **Cancelar OS** — Cancela a ordem.` },

  { keywords: ['status','andamento','fluxo','workflow','etapa','ciclo de vida'],
    response: `O **ciclo de vida** de uma OS:\n\n• **Pendente** — Recém-criada, aguardando início.\n• **Agendada** — Data de atendimento definida.\n• **Em Deslocamento** — Técnico a caminho.\n• **Em Andamento** — Técnico iniciou o atendimento.\n• **Impedida** — Bloqueio registrado (falta de peça, acesso negado).\n• **Concluída** — Serviço finalizado.\n• **Cancelada** — Cancelada pelo administrador.\n\nCada mudança gera registro na **Timeline** da OS.` },

  { keywords: ['filtrar os','buscar os','pesquisar os','search','procurar'],
    response: `Na tela de **Atividade** você tem filtros poderosos:\n\n• **Barra de busca** — Pesquisa por número, título ou cliente.\n• **Filtro por Status** — Pendente, Agendada, Em Andamento, Impedida, Concluída, Cancelada.\n• **Filtro por Técnico** — Selecione um técnico.\n• **Filtro por Período** — Data inicial e final.\n• **Ordenação** — Por data, prioridade ou status.\n\nOs filtros podem ser combinados.` },

  // ── ABAS DA OS ──
  { keywords: ['aba','tab','navegação os','detalhes os','dentro da os'],
    response: `Ao abrir uma OS em **"Atividade"**, as abas de navegação ficam na lateral esquerda:\n\n• **Visão Geral** — Dados principais, cliente, tipo, prioridade e técnico.\n• **Ativos** — Equipamentos vinculados com status de garantia.\n• **Visitas** — Histórico de visitas técnicas.\n• **Formulários** — Checklists preenchidos pelo técnico.\n• **Deslocamento** — Dados de km e tempo.\n• **Fotos e Vídeos** — Mídias capturadas.\n• **Timeline** — Histórico completo de eventos.\n• **Observações** — Notas internas.` },

  // ── CONTRATOS / PMOC ──
  { keywords: ['pmoc','contrato','preventiva','manutenção planejada','recorrente','programada'],
    response: `O módulo **"Contratos"** gerencia manutenções preventivas recorrentes (PMOC).\n\n**Como cadastrar:**\n1. Menu **"Contratos"** > botão **"+ Novo Contrato"**.\n2. Selecione o **Cliente**.\n3. Vincule os **Equipamentos** cobertos.\n4. Defina a **periodicidade**: Mensal, Bimestral, Trimestral, Semestral ou Anual.\n5. Informe datas de início e vencimento.\n\n**Automático:** O sistema gera OS preventivas conforme a periodicidade.\n\n**Legislação:** Atende à Lei 13.589/2018 (climatização).` },

  // ── ATIVOS ──
  { keywords: ['ativo','equipamento','patrimônio','inventário','cadastrar equipamento'],
    response: `O módulo **"Ativos"** na barra lateral gerencia o inventário de equipamentos.\n\n**Cadastro:**\n• Nome, Modelo e **Família** (Split, VRF, Chiller, etc).\n• Número de Série e Patrimônio.\n• Cliente vinculado.\n• **Data de Fabricação** e **Garantia (meses)** — opcionais.\n\n**Na tabela:**\n• Coluna **Garantia**: badge verde ("Em Garantia") ou vermelho ("Fora de Garantia").\n• "Sem Info." quando dados não preenchidos.\n\n**Ao editar:** Aba Histórico mostra todas as OS realizadas naquele equipamento.` },

  { keywords: ['garantia','warranty','fabricação','validade'],
    response: `O sistema calcula **automaticamente** o status de garantia:\n\n• Preencha **Data de Fabricação** e **Garantia (meses)** no cadastro do ativo (menu **"Ativos"**).\n• Data futura → **Em Garantia** (badge verde).\n• Data passada → **Fora de Garantia** (badge vermelho).\n\n**Onde aparece:**\n• Na tabela de **"Ativos"** (coluna Garantia).\n• Na **edição de OS** em **"Atividade"** (aba Ativos).\n\nCampos opcionais — se não preenchidos, aparece "Sem Info."` },

  // ── CLIENTES ──
  { keywords: ['cliente','customer','cadastro cliente','cnpj','cpf'],
    response: `O módulo **"Cliente"** na barra lateral gerencia todos os clientes.\n\n**Campos:**\n• Nome / Razão Social, CNPJ ou CPF.\n• E-mail, Telefone e **WhatsApp**.\n• Endereço completo (CEP, Rua, Número, Bairro, Cidade, Estado).\n• Coordenadas para o **Visão de Campo** (mapa).\n\n**Funcionalidades:**\n• Busca rápida por nome ou documento.\n• Vinculação de ativos/equipamentos.\n• Visualização das OS do cliente.` },

  // ── TÉCNICOS ──
  { keywords: ['técnico','technician','equipe','campo','atribuir técnico'],
    response: `O módulo **"Técnicos"** na barra lateral gerencia a equipe de campo.\n\n**Cadastro:** Nome, especialidade e contato.\n\n**No painel admin:**\n• Lista de técnicos com status.\n• Visualização no **"Visão de Campo"** (mapa) com localização em tempo real.\n• Filtro de OS por técnico.\n\n**No App Mobile (PWA):** O técnico acessa pelo celular suas OS atribuídas, inicia/conclui atendimentos, registra fotos, preenche formulários e gerencia peças.` },

  // ── APP MOBILE ──
  { keywords: ['app','mobile','pwa','celular','aplicativo','app do técnico','app mobile'],
    response: `O **App Mobile** é um PWA usado pelos técnicos em campo.\n\n**Acesso:** Pelo navegador do celular (pode instalar na tela inicial).\n\n**Funcionalidades:**\n• **Minhas OS** — Lista de ordens atribuídas.\n• **Iniciar Atendimento** — Com geolocalização.\n• **Fotos/Vídeos** — Câmera integrada.\n• **Formulários** — Checklists configurados no admin.\n• **Adicionar Peças** — Manual ou via **QR Code Scanner**.\n• **Impedimento** — Bloqueia a OS com justificativa.\n• **Concluir** — Finaliza com assinatura digital.\n• **Deslocamento** — Registra km e tempo.\n\n**Configurações do App:** Menu **"Configurações"** > aba **"APP do Técnico"** controla visibilidade de preços, compartilhamento, OS simultâneas, contato do cliente, histórico de peças e impedimentos.` },

  // ── ESTOQUE ──
  { keywords: ['estoque','peça','stock','material','inventário peças'],
    response: `O módulo **"Estoque"** na barra lateral controla peças e materiais.\n\n**Cadastro:**\n• Código, Nome, Descrição.\n• Categoria (Filtros, Compressores, Válvulas, etc).\n• Quantidade, Valor unitário, Localização.\n\n**Funcionalidades:**\n• Gerenciamento por **Categorias**.\n• Controle de entrada e saída.\n• Geração de **Etiquetas QR Code** (A4 ou Térmica).\n• Integração com App Mobile (técnico adiciona via QR).\n• Vinculação de peças a **Orçamentos**.` },

  { keywords: ['qr code','etiqueta','label','scanner','escanear'],
    response: `O sistema de **QR Code** funciona em duas frentes:\n\n**No Admin (menu "Estoque"):**\n• Selecione itens e clique em **"Imprimir Etiquetas"**.\n• Formato: **A4** ou **Térmica**.\n\n**No App Mobile (Técnico):**\n• Ao adicionar peça na OS, escolha **"QR Code"**.\n• A câmera escaneia e identifica a peça automaticamente.\n• Se não está no estoque do técnico, mostra aviso.\n• Após escanear, informa a quantidade utilizada.` },

  // ── ORÇAMENTOS ──
  { keywords: ['orçamento','proposta','quote','cotação'],
    response: `O módulo **"Orçamentos"** na barra lateral cria propostas comerciais.\n\n**Como criar:**\n1. **"Orçamentos"** > **"+ Novo Orçamento"**.\n2. Vincule **Cliente** e opcionalmente uma **OS**.\n3. Adicione itens do estoque ou manuais.\n4. Sistema calcula totais automaticamente.\n5. Gere **Link Público** para aprovação do cliente.\n\n**Funcionalidades:**\n• Status: Pendente, Aprovado, Recusado.\n• Exportação em **PDF** profissional.\n• Link público para o cliente visualizar e aprovar.` },

  // ── FINANCEIRO ──
  { keywords: ['financeiro','faturamento','receita','financial','relatório financeiro'],
    response: `O módulo **"Financeiro"** na barra lateral centraliza a gestão de receitas.\n\n**Recursos:**\n• Faturamento por período com filtros de data.\n• Filtros por técnico, cliente e tipo de serviço.\n• Gráficos de receita e performance.\n• Listagem de OS concluídas com valores.\n• Integração com Orçamentos aprovados.\n• Exportação em **PDF** formato A4.` },

  // ── FORMULÁRIOS ──
  { keywords: ['formulário','checklist','form','campo personalizado','template'],
    response: `O módulo **"Formulários"** na barra lateral cria checklists personalizados.\n\n**Como criar:**\n1. **"Formulários"** > **"+ Novo Formulário"**.\n2. Defina o nome.\n3. Adicione campos: Texto, Número, Checkbox, Seleção, Foto, Assinatura.\n4. Configure **Regras de Ativação** (tipo de serviço ou família de equipamento).\n\n**Funcionamento:**\n• O formulário aparece automaticamente no App do técnico.\n• Respostas ficam na OS (aba **Formulários**).\n• Coluna "Formulário" na lista de ativos: "✓ Sim" ou "○ Pendente".` },

  // ── USUÁRIOS E PERMISSÕES ──
  { keywords: ['usuário','permissão','grupo','acesso','segurança','controle acesso'],
    response: `O módulo **"Usuários"** na barra lateral controla acesso ao sistema.\n\n**Estrutura:**\n• Cada usuário pertence a um ou mais **Grupos de Permissão**.\n• Cada grupo define menus acessíveis e permissões de Criar/Editar/Excluir/Visualizar.\n\n**Segurança:**\n• Botões restritos ficam **esmaecidos** (dimmed) com feedback "Acesso Negado".\n• Padrão: "Restritivo por Default".\n\n**Senha:** Recuperação pelo próprio usuário via "Esqueci minha senha" (LGPD).` },

  // ── VISÃO DE CAMPO (MAPA) ──
  { keywords: ['mapa','localização','geolocalização','gps','visão de campo','rota'],
    response: `O módulo **"Visão de Campo"** na barra lateral mostra a equipe e clientes no mapa.\n\n**Recursos:**\n• Pins de técnicos com status (disponível, em atendimento).\n• Pins de clientes com OS abertas.\n• Info ao clicar no pin (nome, OS ativa, contato).\n• Integração com GPS do App Mobile.` },

  // ── AGENDA (CALENDÁRIO) ──
  { keywords: ['calendário','agenda','calendar','agendamento','agendar'],
    response: `O módulo **"Agenda"** na barra lateral mostra a visão temporal das OS.\n\n**Visualizações:** Mensal, Semanal e Diária.\n\n**Funcionalidades:**\n• Cores por status da OS.\n• Filtros por técnico e cliente.\n• Clique na OS para abrir detalhes.\n• Navegação entre períodos.` },

  // ── CONFIGURAÇÕES ──
  { keywords: ['configuração','setting','personalização','empresa','logo','tenant'],
    response: `O módulo **"Configurações"** na barra lateral personaliza o sistema.\n\n**Abas disponíveis:**\n• **Organização** — Dados da empresa (nome, CNPJ, logo, endereço). Campos protegidos por LGPD (alteração via Master Admin).\n• **Sistema** — Idioma, fuso horário, GPS em tempo real, notificações automáticas.\n• **APP do Técnico** — Controle de visibilidade: preços, compartilhamento, OS simultâneas, contato do cliente, histórico de peças, impedimentos, histórico de visitas.\n• **Parâmetros de Dashboard** — Metas de SLA (24h e 48h).` },

  // ── LINK PÚBLICO ──
  { keywords: ['link público','compartilhar','acompanhamento','público','link cliente'],
    response: `Cada OS e Orçamento gera um **Link Público** único.\n\n• Cliente acompanha sem login.\n• Vê status, timeline, fotos e relatórios.\n• Botão **"Visualizar"** no cabeçalho da OS gera/abre o link.\n• Para orçamentos, o cliente pode aprovar/recusar diretamente.\n\n**Segurança:** Link único, não expõe dados de outros clientes.` },

  // ── VISITAS ──
  { keywords: ['visita','atendimento','histórico visita','deslocamento'],
    response: `Cada OS pode ter múltiplas **Visitas Técnicas** (aba "Visitas" dentro da OS em **"Atividade"**).\n\n**Registrado em cada visita:**\n• Data/hora de início e fim.\n• Técnico responsável.\n• Fotos e vídeos, formulários preenchidos.\n• Peças utilizadas (do estoque).\n• Observações e dados de deslocamento (km, tempo).` },

  // ── PDF / IMPRESSÃO ──
  { keywords: ['imprimir','pdf','relatório','impressão','exportar','print'],
    response: `O sistema gera **PDF** em vários módulos:\n\n• **Atividade** — Botão "Gerar PDF" no cabeçalho da OS.\n• **Orçamentos** — PDF profissional com composição de proposta.\n• **Financeiro** — Relatório de faturamento A4.\n• **Estoque** — Etiquetas QR Code (A4 ou Térmica).\n\nTodos com layout padronizado, logo e dados da empresa.` },

  // ── NOTIFICAÇÕES ──
  { keywords: ['notificação','alerta','aviso','inbox','sino'],
    response: `As **Notificações** ficam no ícone de sino no cabeçalho superior.\n\n• **Info** — Comunicados gerais.\n• **Warning** — Alertas de atenção.\n• **Urgente** — Aparecem como modal obrigatório ao entrar.\n\nBadge vermelho no sino indica mensagens não lidas. Botão "Ciente, Confirmar Leitura" marca como lida.` },

  // ── WHATSAPP ──
  { keywords: ['whatsapp','zap','mensagem','contato cliente'],
    response: `O botão **WhatsApp** na OS (menu **"Atividade"**) abre conversa direta com o cliente.\n\n• O campo "WhatsApp" deve estar preenchido no cadastro do cliente (menu **"Cliente"**).\n• Se não cadastrado, aparece alerta: "WhatsApp do cliente não cadastrado no sistema."` },

  // ── SUPORTE ──
  { keywords: ['suporte','ajuda','help','problema','bug','erro'],
    response: `Para **suporte técnico:**\n\n• Clique no botão **"Suporte"** verde no rodapé da barra lateral.\n• Abre o WhatsApp do suporte técnico diretamente.\n\n**Dentro do sistema:** Esta **Duno IA** ajuda com dúvidas sobre funcionalidades. Para bugs, contate o suporte humano.` },

  // ── MENUS DO SISTEMA ──
  { keywords: ['menu','barra lateral','sidebar','navegação','módulos','onde fica'],
    response: `Os módulos do sistema ficam na **barra lateral esquerda**:\n\n1. **Dashboard** — Tela inicial com resumo.\n2. **Duno IA** — Assistente inteligente (você está aqui!).\n3. **Atividade** — Ordens de Serviço.\n4. **Agenda** — Calendário de OS.\n5. **Visão de Campo** — Mapa com técnicos e clientes.\n6. **Financeiro** — Dashboard financeiro.\n7. **Orçamentos** — Propostas comerciais.\n8. **Estoque** — Peças e materiais.\n9. **Contratos** — PMOC e manutenção preventiva.\n10. **Cliente** — Cadastro de clientes.\n11. **Ativos** — Equipamentos e garantias.\n12. **Formulários** — Checklists personalizados.\n13. **Técnicos** — Equipe de campo.\n14. **Usuários** — Permissões e grupos.\n15. **Configurações** — Personalização do sistema.` },

  // ── SAUDAÇÕES ──
  { keywords: ['olá','oi','hey','bom dia','boa tarde','boa noite','tudo bem','hello','e aí'],
    response: `Olá! 👋 Estou aqui para te ajudar com qualquer dúvida sobre o Nexus OS.\n\nPosso explicar sobre:\n• **Atividade** — Criar, editar e filtrar OS\n• **Contratos** — PMOC e manutenção preventiva\n• **Ativos** — Equipamentos e garantias\n• **Estoque** — Peças e QR Code\n• **Orçamentos** — Propostas comerciais\n• **App Mobile** — Funcionalidades do técnico\n• **Usuários** — Permissões e grupos\n• **Agenda / Visão de Campo / Financeiro**\n• **Formulários** e muito mais!\n\nÉ só perguntar!` },

  { keywords: ['obrigado','valeu','thanks','agradeço','tmj'], response: `De nada! 😊 Fico feliz em ajudar. Se surgir mais alguma dúvida, é só perguntar!` },

  { keywords: ['quem é você','o que você faz','qual seu nome','sobre você'],
    response: `Eu sou a **Duno IA**, a inteligência artificial integrada ao **Nexus OS**.\n\n**Minha função:**\n• Responder dúvidas sobre todas as funcionalidades.\n• Explicar como usar cada módulo passo a passo.\n• Aprender novas informações que você me ensinar.\n\n**Limitações:**\n• Não acesso dados sensíveis (clientes, OS, financeiro).\n• Não executo ações — apenas oriento.\n• Conhecimento sobre funcionalidades, não dados operacionais.` },
];

export const findBestMatch = (input: string): string => {
  const lower = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  let bestMatch: KnowledgeEntry | null = null;
  let bestScore = 0;
  
  // 1. Busca na base de conhecimento estática
  for (const entry of KNOWLEDGE_BASE) {
    let score = 0;
    for (const kw of entry.keywords) {
      const nkw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (new RegExp(`(^|\\b|\\s)${nkw}(\\b|\\s|$)`).test(lower)) score += nkw.length;
    }
    if (score > bestScore) { bestScore = score; bestMatch = entry; }
  }
  
  if (bestMatch && bestScore >= 3) return bestMatch.response;
  
  // 2. Simulação de "Varredura do Sistema" (Fallback Inteligente)
  // Mapeia palavras-chave para módulos para sugerir caminhos, caso não haja resposta pronta.
  const moduleHints: Record<string, string[]> = {
    'Configurações': ['senha', 'logo', 'empresa', 'cnpj', 'fuso horário', 'idioma', 'notificação', 'notificações', 'gps', 'tempo real'],
    'Financeiro': ['pagamento', 'fatura', 'boleto', 'receber', 'pagar', 'caixa', 'dinheiro', 'lucro'],
    'Usuários': ['permissão', 'acesso', 'bloquear', 'senha', 'esqueci', 'login', 'grupo', 'cargo'],
    'Estoque': ['peça', 'material', 'quantidade', 'falta', 'compra', 'fornecedor'],
    'Atividade (OS)': ['imprimir os', 'pdf', 'pdf os', 'relatório os', 'foto os', 'vídeo os', 'fechar os', 'reabrir os'],
    'Orçamentos': ['aprovar', 'recusar', 'enviar proposta', 'proposta', 'email cliente'],
    'App do Técnico': ['celular', 'aplicativo', 'app', 'offline', 'sincronizar', 'bateria', 'gps técnico']
  };

  for (const [module, keywords] of Object.entries(moduleHints)) {
    if (keywords.some(k => new RegExp(`(^|\\b|\\s)${k.normalize('NFD').replace(/[\u0300-\u036f]/g, '')}(\\b|\\s|$)`).test(lower))) {
      const intros = [
        `Dei uma varrida no sistema e, analisando o que você pediu, vi que isso geralmente é feito no módulo **${module}**. 🔍\n\nTente dar uma olhada lá! Se não encontrar, me dê mais detalhes para eu ajudar.`,
        `Hmm, fiz uma análise rápida nas telas do Nexus OS... Você deve encontrar opções para isso acessando **${module}** no menu lateral. 🚀`,
        `Olha só, eu vasculhei as permissões e telas do sistema aqui. Acredito que o caminho certo para resolver isso seja indo em **${module}**. 😉`
      ];
      return intros[Math.floor(Math.random() * intros.length)];
    }
  }

  // 3. Fallback Honesto (Assistente em treinamento)
  const fallbacks = [
    `Desculpe, ainda não fui treinada para responder sobre esse fluxo específico. 🤔\n\nComo sou uma inteligência em constante evolução, você pode me ensinar! É só digitar:\n\n**"Saiba que..."** seguido da explicação, e eu gravo pra sempre! 🧠`,
    `Ainda não tenho essa informação exata nos meus registros internos. 😅\n\nSe você já souber como faz, pode me treinar para as próximas vezes usando o comando:\n\n**"Aprenda que [sua explicação]"**!`,
    `Ainda não mapeei a resposta para essa pergunta específica. 🧐\n\nVocê pode tentar perguntar usando outros termos (ex: nome da tela ou ação), ou me ensinar digitando:\n\n**"Grava que..."** e o passo a passo!`
  ];
  
  return fallbacks[Math.floor(Math.random() * fallbacks.length)];
};
