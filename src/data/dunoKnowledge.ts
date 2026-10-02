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
  { keywords: ['pmoc','contrato','preventiva','manutenção planejada','recorrente','programada','criar contrato','cadastrar contrato','editar contrato','excluir contrato','deletar contrato'],
    response: `O módulo **"Contratos"** gerencia preventivas recorrentes (PMOC).\n\n• **Como Cadastrar:** Acesse **"Contratos"** > clique em **"+ Novo Contrato"** no topo direito. Escolha o cliente, vincule os ativos/equipamentos e defina a periodicidade (Mensal, Bimestral, Trimestral, Semestral ou Anual). Defina as datas de vigência e salve.\n• **Como Editar:** Clique no contrato desejado na lista, clique em **"Editar Contrato"**, faça as alterações de ciclo ou vigência e salve.\n• **Como Excluir/Cancelar:** Abra o contrato correspondente e clique no botão **"Encerrar Recorrência"** ou **"Excluir Plano"** nas opções internas.\n\n**Automação:** O sistema gera OS preventivas agendadas automaticamente conforme o ciclo do contrato.` },

  // ── ATIVOS ──
  { keywords: ['ativo','equipamento','patrimônio','inventário','cadastrar equipamento','criar ativo','cadastrar ativo','editar ativo','excluir ativo','deletar ativo'],
    response: `O módulo **"Ativos"** gerencia o inventário de equipamentos dos clientes.\n\n• **Como Cadastrar:** Acesse **"Ativos"** > clique em **"+ Novo Ativo"** no topo direito. Preencha Marca/Nome, Modelo, Série, Patrimônio, Cliente e opcionalmente Data de Fabricação e Garantia (em meses).\n• **Como Editar:** Na listagem de ativos, clique no item correspondente e faça as alterações desejadas direto nos campos do painel de detalhes.\n• **Como Excluir:** Na linha do ativo na listagem, clique no ícone da lixeira no final da tabela e confirme a exclusão.\n• **Garantia:** O sistema calcula o status sozinho. Exibe um badge verde ("Em Garantia") ou vermelho ("Fora de Garantia").` },

  // ── CLIENTES ──
  { keywords: ['cliente','customer','cadastro cliente','cnpj','cpf','criar cliente','cadastrar cliente','editar cliente','excluir cliente','deletar cliente'],
    response: `O módulo **"Cliente"** gerencia o cadastro e localização das empresas atendidas.\n\n• **Como Cadastrar:** Acesse **"Cliente"** > clique em **"+ Novo Cliente"** no topo direito. Preencha CNPJ ou CPF, Razão Social, contatos (E-mail, Telefone, WhatsApp), endereço completo e salve.\n• **Como Editar:** Clique no cliente na lista para abrir a aba lateral de detalhes, altere os campos necessários e confirme.\n• **Como Excluir:** Localize o cliente na tabela e clique no ícone de lixeira no final da linha correspondente.` },

  // ── TÉCNICOS ──
  { keywords: ['técnico','tecnicos','technician','equipe','campo','cadastrar técnico','criar técnico','editar técnico','excluir técnico','deletar técnico'],
    response: `O módulo **"Técnicos"** gerencia a equipe de campo e suas OS.\n\n• **Como Cadastrar:** Acesse **"Técnicos"** > clique em **"+ Novo Técnico"** no topo direito. Insira Nome, contato (Telefone/WhatsApp), especialidade principal e uma cor de identificação para o mapa/agenda.\n• **Como Editar:** Clique no técnico correspondente na lista, altere os dados ou status de disponibilidade e salve.\n• **Como Excluir:** Clique na lixeira no final da linha do técnico para remover o acesso dele.\n• **App Duno:** Os técnicos não utilizam PWA, eles acessam o **App Duno** (aplicativo nativo) instalado no celular para ver suas OS, registrar fotos e fechar visitas.` },

  // ── APP MOBILE ──
  { keywords: ['app','mobile','celular','aplicativo','app do técnico','app mobile','pwa'],
    response: `O técnico em campo utiliza o **App Duno** (aplicativo mobile nativo, não é um PWA web-app).\n\n• **Acesso:** Através do aplicativo Duno instalado no celular.\n• **Funcionalidades:** Visualizar OS atribuídas, iniciar deslocamento/atendimento com GPS, tirar fotos/vídeos de evidência, responder formulários, dar saída em peças do estoque (manual ou escaneando o **QR Code** com a câmera) e finalizar com assinatura digital do cliente.\n• **Configuração do App:** O administrador pode restringir o que o técnico vê no app em **Configurações** > aba **"APP do Técnico"** (como preços, OS simultâneas, contato do cliente ou histórico de peças).` },

  // ── ESTOQUE ──
  { keywords: ['estoque','stock','material','inventário peças','cadastrar peça','adicionar peça','editar estoque','excluir peça','entrada estoque','saída estoque'],
    response: `O módulo **"Estoque"** controla o estoque de peças e suprimentos.\n\n• **Como Cadastrar Item:** Acesse **"Estoque"** > clique em **"+ Novo Item"** no topo direito. Insira Código/SKU, Nome, Descrição, Categoria, Quantidade Inicial e Valor Unitário.\n• **Como Ajustar Estoque (Entradas/Saídas):** Clique no item correspondente na tabela de estoque para abrir suas movimentações e clique em "Registrar Entrada" ou "Registrar Saída" para alterar a quantidade.\n• **Como Excluir:** Clique na lixeira ao lado do item na listagem para removê-lo definitivamente.\n• **Etiquetas:** Selecione itens no estoque e clique em **"Imprimir Etiquetas"** para gerar folhas A4 ou formato Térmico.` },

  // ── ORÇAMENTOS ──
  { keywords: ['orçamento','proposta','quote','cotação','criar orçamento','cadastrar orçamento','editar orçamento','excluir orçamento','deletar orçamento'],
    response: `O módulo **"Orçamentos"** gerencia a criação e envio de propostas comerciais.\n\n• **Como Criar:** Acesse **"Orçamentos"** > clique em **"+ Novo Orçamento"** no topo direito. Escolha o cliente, adicione as peças do estoque ou serviços manuais, configure as condições de pagamento e salve.\n• **Como Editar:** Clique no orçamento pendente na lista para abrir a edição e ajustar valores ou itens.\n• **Como Excluir:** Abra o orçamento desejado e selecione **"Excluir Orçamento"** ou mude seu status para **"Recusado"**.\n• **Aprovação do Cliente:** Cada proposta gera um **Link Público**. O cliente pode visualizar e clicar em "Aprovar" ou "Recusar" sem precisar logar.` },

  // ── FINANCEIRO ──
  { keywords: ['financeiro','faturamento','financial','relatório financeiro','faturar'],
    response: `O módulo **"Financeiro"** consolida as receitas do sistema.\n\n• **Como Funciona:** Lista todas as OS concluídas e orçamentos aprovados com valores.\n• **Visualização:** Mostra gráficos de performance, faturamento total por período, por cliente e por técnico.\n• **Ações:** Filtre por data no topo esquerdo e clique no botão de impressão para gerar o relatório financeiro consolidado em PDF.` },

  // ── FORMULÁRIOS ──
  { keywords: ['formulário','checklist','form','campo personalizado','template','criar formulário','editar formulário','excluir formulário'],
    response: `O módulo **"Formulários"** cria check-lists de verificação para os técnicos preencherem no campo.\n\n• **Como Criar:** Acesse **"Formulários"** > clique em **"+ Novo Formulário"** no topo direito. Dê um título e adicione as perguntas (Texto, Número, Foto, Seleção ou Assinatura). Defina as Regras de Ativação (se o formulário deve aparecer para tipos específicos de OS ou famílias de equipamento) e salve.\n• **Como Editar:** Selecione o checklist na listagem e clique em **"Editar Estrutura"** para incluir ou modificar perguntas.\n• **Como Excluir:** Clique no ícone de lixeira correspondente ao formulário na listagem.` },

  // ── USUÁRIOS E PERMISSÕES ──
  { keywords: ['usuário','permissão','grupo','acesso','segurança','controle acesso','criar usuário','editar usuário','bloquear usuário','excluir usuário'],
    response: `O módulo **"Usuários"** gerencia quem tem acesso ao painel administrativo.\n\n• **Como Criar:** Acesse **"Usuários"** > clique em **"+ Novo Usuário"** no topo direito. Preencha Nome, E-mail e selecione a quais Grupos de Permissão ele pertence. Por segurança da LGPD, a senha é definida pelo próprio usuário via link enviado por e-mail.\n• **Como Editar:** Selecione o perfil na listagem e edite seus dados ou altere seus grupos de permissão.\n• **Como Excluir/Bloquear:** Localize o usuário e clique em **"Bloquear Acesso"** na linha correspondente para suspender a conta imediatamente.` },

  // ── GESTÃO DE REGIÕES (CERCAS VIRTUAIS) ──
  { keywords: ['região','regiões','cerca virtual','geofence','mapa de região','gestão de regiões','delimitar area','desenhar mapa'],
    response: `O módulo **"Gestão de Regiões"** permite criar cercas virtuais geográficas para organizar o atendimento.\n\n• **Como Acessar:** Fica no menu lateral (ou dentro das configurações de mapa).\n• **Como Criar:** Clique em **"Criar Nova Região"**, preencha o Nome, escolha uma Cor de destaque e selecione os Técnicos responsáveis por aquela área. Após salvar, o modo de desenho será ativado no mapa.\n• **Como Desenhar:** Com a região pendente, clique no botão de polígono no mapa e desenhe os pontos clicando nas ruas. Para fechar a cerca, clique no primeiro ponto.\n• **Como Editar/Remodelar:** Clique em uma região existente na lista ou no mapa, e selecione **"Editar Mapa"**. Você poderá arrastar os vértices da cerca para ajustar os limites. Clique em Salvar na barra flutuante verde.\n• **Filtros e Busca:** Você pode buscar rapidamente o mapa de uma cidade específica pela barra "Ir para cidade...", além de filtrar regiões ativas/inativas ou por técnico.` },

  // ── VISÃO DE CAMPO (MAPA) ──
  { keywords: ['mapa','localização','geolocalização','gps','visão de campo','rota'],
    response: `O módulo **"Visão de Campo"** plota toda a operação no mapa.\n\n• **Visualização:** Mostra a localização atualizada de cada técnico (com cores indicando disponibilidade ou se está em OS) e pins dos clientes.\n• **Ações:** Clique sobre o técnico para ver qual OS ele está atendendo no momento ou traçar a rota até o cliente.` },

  // ── AGENDA (CALENDÁRIO) ──
  { keywords: ['calendário','agenda','calendar','agendamento','agendar','marcar compromisso'],
    response: `O módulo **"Agenda"** gerencia a distribuição temporal de serviços.\n\n• **Visualização:** Exibição Mensal, Semanal ou Diária das OS cadastradas.\n• **Ações:** Filtre por técnico para ver a carga de trabalho dele, ou clique em qualquer card de OS para abrir os detalhes de atendimento de forma instantânea.` },

  // ── INTEGRAÇÕES, CHAVES DE API E WEBHOOKS ──
  { keywords: ['integração', 'integracoes', 'api key', 'chave de api', 'token api', 'criar chave api', 'webhooks', 'webhook', 'segredo webhook', 'documentação da api', 'documentacao', 'api.dunoup.com.br'],
    response: `O módulo **"Integrações"** gerencia conexões externas ao sistema Duno.\n\n**O que você encontra:**\n• **Chaves de API** — Geração de tokens de acesso seguro que iniciam com o prefixo \`nx_live_\`. A chave inteira é exibida apenas uma vez ao criar por segurança (depois disso ela é salva em hash SHA-256 e fica mascarada).\n• **Webhooks** — Envio de notificações automáticas para outras plataformas nos eventos: \`os_created\`, \`os_updated\`, \`quote_approved\` e \`stock_updated\`.\n• **Documentação da API** — Botão para acessar a documentação online hospedada no Fern.\n• **Segurança:** Todas as requisições à API têm controle de **Rate Limiting** (máximo de 100 requisições por minuto por tenant) para evitar sobrecarga no banco de dados.` },

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
  { keywords: ['suporte','ajuda','help','bug'],
    response: `Para **suporte técnico:**\n\n• Clique no botão **"Suporte"** verde no rodapé da barra lateral.\n• Abre o WhatsApp do suporte técnico diretamente.\n\n**Dentro do sistema:** Esta **Duno IA** ajuda com dúvidas sobre funcionalidades. Para bugs, contate o suporte humano.` },

  // ── MENUS DO SISTEMA ──
  { keywords: ['menu','barra lateral','sidebar','navegação','módulos','onde fica'],
    response: `Os módulos do sistema ficam na **barra lateral esquerda**:\n\n1. **Dashboard** — Tela inicial com resumo.\n2. **Duno IA** — Assistente inteligente (você está aqui!).\n3. **Atividade** — Ordens de Serviço.\n4. **Agenda** — Calendário de OS.\n5. **Visão de Campo** — Mapa com técnicos e clientes.\n6. **Financeiro** — Dashboard financeiro.\n7. **Orçamentos** — Propostas comerciais.\n8. **Estoque** — Peças e materiais.\n9. **Contratos** — PMOC e manutenção preventiva.\n10. **Cliente** — Cadastro de clientes.\n11. **Ativos** — Equipamentos e garantias.\n12. **Formulários** — Checklists personalizados.\n13. **Técnicos** — Equipe de campo.\n14. **Gestão de Regiões** — Cercas virtuais geográficas.\n15. **Usuários** — Permissões e grupos.\n16. **Configurações** — Personalização do sistema.` },

  // ── SAUDAÇÕES ──
  { keywords: ['olá','oi','hey','bom dia','boa tarde','boa noite','tudo bem','hello','e aí'],
    response: `Olá! 👋 Estou aqui para te ajudar com qualquer dúvida sobre o sistema Duno.\n\nPosso explicar sobre:\n• **Atividade** — Criar, editar e filtrar OS\n• **Contratos** — PMOC e manutenção preventiva\n• **Ativos** — Equipamentos e garantias\n• **Estoque** — Peças e QR Code\n• **Orçamentos** — Propostas comerciais\n• **App Mobile** — Funcionalidades do técnico\n• **Usuários** — Permissões e grupos\n• **Agenda / Visão de Campo / Financeiro**\n• **Formulários** e muito mais!\\n\\nÉ só perguntar!` },

  { keywords: ['obrigado','valeu','thanks','agradeço','tmj'], response: `De nada! 😊 Fico feliz em ajudar. Se surgir mais alguma dúvida, é só perguntar!` },

  { keywords: ['quem é você','o que você faz','qual seu nome','sobre você'],
    response: `Eu sou a **Duno IA**, a inteligência artificial integrada ao sistema **Duno**.\n\n**Minha função:**\n• Responder dúvidas sobre todas as funcionalidades.\\n• Explicar como usar cada módulo passo a passo.\\n• Aprender novas informações que você me ensinar.\\n\\n**Limitações:**\\n• Não acesso dados sensíveis (clientes, OS, financeiro).\\n• Não executo ações — apenas oriento.\\n• Conhecimento sobre funcionalidades, não dados operacionais.` },

  // ── ATUALIZAÇÕES RECENTES (ÚLTIMOS 4 MESES) ──
  { keywords: [
      'contas a pagar','conta a pagar','despesas','despesa','fornecedor','fornecedores','categoria de despesa','pagamento parcial','juros','multa','financeiro contas',
      'cadastrar conta','cadastrar despesa','lancamento','lançamento','fatura','boleto','lançar boleto','pagar conta','como cadastrar conta a pagar',
      'como lancar conta a pagar','como lancar despesa','cadastrar uma conta a pagar','cadastrar boleto','novo boleto','nova despesa','lancar despesa'
    ],
    response: ` O **Módulo Financeiro — Contas a Pagar** permite cadastrar, controlar e dar baixa em todas as despesas da empresa!\n\n**Passo a Passo para Cadastrar uma Conta a Pagar:**\n1. Acesse o menu **"Financeiro"** na barra lateral esquerda.\n2. No topo da tela do Financeiro, selecione a aba **"Contas a Pagar"**.\n3. Clique no botão **"+ Nova Conta"** (no canto superior direito).\n4. Preencha os campos do formulário:\n   • **Descrição:** Título ou motivo da despesa (ex: Conta de Luz, Boleto Fornecedor X).\n   • **Fornecedor:** Selecione o fornecedor cadastrado (ou insira o nome).\n   • **Valor e Vencimento:** Insira o valor total (R$) e a data de vencimento.\n   • **Categoria:** Selecione a categoria da despesa (ex: Operacional, Peças, Aluguel).\n   • **Anexo:** Faça o upload do boleto (PDF) ou comprovante.\n5. Clique em **"Salvar Conta"**.\n\n**Recursos Importantes:**\n• **Baixa e Pagamento Parcial:** Ao dar baixa, você pode registrar o valor pago parcial. O sistema manterá o saldo restante como pendente.\n• **Juros e Multas:** Em pagamentos com atraso, adicione o valor dos acréscimos ao quitar.\n• **Gerenciar Categorias:** Clique em **"Categorias"** para criar novas seções de despesas.` },

  { keywords: ['whatsapp bot','bot do whatsapp','atendimento automático','robô do zap','chatbot','respostas automáticas'],
    response: `A **Duno IA agora atende no WhatsApp!** 🤖📱\n\nVocê pode conectar o seu número corporativo na aba **"Configurações > WhatsApp Bot"**.\n\n**O que a IA faz:**\n• Recebe os clientes 24/7 e tira dúvidas básicas.\n• Entende se o cliente é novo ou recorrente.\n• Transforma relatos de problemas em **Solicitações de Atendimento** estruturadas direto no seu painel (Módulo Atividade).\n• Coleta dados de clientes não cadastrados automaticamente.` },

  { keywords: ['solicitação de atendimento','triagem','aprovar solicitação','rejeitar solicitação','inbox de os'],
    response: `As **Solicitações de Atendimento** são a nova caixa de entrada de serviços!\n\n• Quando um cliente relata um problema via WhatsApp Bot ou Link Público, o pedido cai na aba **"Solicitações de Atendimento"** (na tela de Atividades).\n• **Triagem Inteligente:** O painel avisa se o cliente já existe no sistema ou se é necessário cadastrá-lo.\n• **Aceitar:** Com 1 clique, você aprova a solicitação, e ela se transforma em uma Ordem de Serviço real atribuída a um técnico.\n• **Rejeitar:** Pode negar o chamado informando o motivo.` },

  { keywords: ['check-in automático','checkin automatico','raio de atendimento','chegada automática'],
    response: `Nova funcionalidade no APP do Técnico: **Check-in Automático**! 📍\n\n• Habilite em **"Configurações > APP do Técnico"**.\n• O app usa GPS para identificar automaticamente quando o técnico entra em um raio de 50 metros do endereço do cliente.\n• Após 10 minutos no local, a OS inicia sozinha, registrando o status "Cheguei no Cliente" sem intervenção manual.` },

  { keywords: ['restringir execução','geofencing','bloqueio de os','300 metros','cerca de bloqueio'],
    response: `Mais segurança na operação: **Restrição de Execução por Localização (Geofencing)**.\n\n• Ativável em **"Configurações > APP do Técnico"**.\n• O técnico é impedido de iniciar ou dar andamento na OS caso esteja a mais de 300 metros do cliente.\n• Garante que a equipe de campo só preencha os formulários e assine a OS quando estiver fisicamente no local.` },
];


export const findBestMatch = (input: string): string | null => {
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
  
  if (bestMatch && bestScore >= 5) return bestMatch.response;
  return null;
};
