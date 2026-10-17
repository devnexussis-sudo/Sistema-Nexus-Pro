# 📘 Manual Mestre de Usabilidade e Funcionalidades Completa do Sistema Duno (Nexus Pro)

> **Propósito deste Documento:** Este guia mestre reúne **100% das funcionalidades, regras de negócio e fluxos de usabilidade** da plataforma **Duno / Sistema Nexus Pro**. Ele foi estruturado em **14 Temas Organizacionais** e **100 Parágrafos Enumerados Sequencialmente (`§ 001` a `§ 100`)**, desenhados de forma intuitiva para servir como manual definitivo de operação, treinamento de equipes, auditoria funcional e referência executiva.

---

## 🧭 Índice de Temas e Parágrafos

1. **TEMA 1: Arquitetura do Ecossistema, Acesso, Login e Segurança da Conta** (`§ 001` a `§ 007`)
2. **TEMA 2: Portal SuperAdmin / Master (Governança Multi-Empresas e Provisionamento)** (`§ 008` a `§ 013`)
3. **TEMA 3: Configurações da Organização, Parâmetros do Sistema, App e SLA** (`§ 014` a `§ 019`)
4. **TEMA 4: Controle de Acesso, Usuários e Grupos de Permissão (RBAC)** (`§ 020` a `§ 023`)
5. **TEMA 5: Cadastros Base — Clientes, Técnicos, Regiões Geográficas e Ativos** (`§ 024` a `§ 032`)
6. **TEMA 6: Almoxarifado Digital, Estoque Central, Estoque do Técnico e QR Code** (`§ 033` a `§ 039`)
7. **TEMA 7: Formulários Dinâmicos, Checklists e Motor de Regras de Ativação** (`§ 040` a `§ 043`)
8. **TEMA 8: Dashboard Executivo, Agenda e Visão de Campo (Mapa GPS em Tempo Real)** (`§ 044` a `§ 048`)
9. **TEMA 9: Central de Atividades — Ciclo Completo da Ordem de Serviço (OS)** (`§ 049` a `§ 060`)
10. **TEMA 10: Atendimento Omnichannel WhatsApp, Agente de IA ("Lia"), Duno IA e Triagem de Solicitações** (`§ 061` a `§ 068`)
11. **TEMA 11: Gestão Comercial — Orçamentos, Propostas e Contratos Recorrentes (PMOC)** (`§ 069` a `§ 075`)
12. **TEMA 12: Módulo Financeiro Completo, Faturamento, Gateway Asaas, NFS-e e Comissões** (`§ 076` a `§ 085`)
13. **TEMA 13: Aplicativo Mobile do Técnico (App Duno Nativo & Tech PWA)** (`§ 086` a `§ 093`)
14. **TEMA 14: Portais Públicos do Cliente (Sem Login) e Integrações Externas (API & Webhooks)** (`§ 094` a `§ 100`)

---

## TEMA 1: Arquitetura do Ecossistema, Acesso, Login e Segurança da Conta

**§ 001. Visão Geral dos 4 Ambientes Integrados da Plataforma:**
O sistema **Duno (Nexus Pro)** é uma plataforma corporativa completa de gestão de serviços de campo (*Field Service Management* — FSM), ERP operacional, CRM de atendimento via WhatsApp e automação financeira. A usabilidade total do sistema é dividida em quatro ambientes conectados em tempo real via WebSockets: **(1) Painel Administrativo Web** (voltado para gestores, despachantes, financeiro, almoxarifado e atendimento); **(2) Portal SuperAdmin / Master** (voltado para governança multi-empresa e controle de licenças); **(3) Aplicativo Mobile Duno do Técnico** (aplicativo nativo e PWA offline-first para execução de serviços em campo); e **(4) Portais Públicos do Cliente** (páginas externas responsivas, sem necessidade de senha, para acompanhamento de OS, aprovação de orçamentos com assinatura digital e pagamento online).

**§ 002. Fluxo de Autenticação, Login Corporativo, Google SSO e Recuperação de Senha:**
Na tela de entrada (`src/components/admin/AdminLogin.tsx`), o usuário administrativo pode autenticar-se informando seu **E-mail e Senha** ou utilizando o botão de login único **Google SSO (Single Sign-On)**, desde que sua conta Google esteja previamente vinculada ao seu perfil. Caso o colaborador esqueça suas credenciais, a opção **"Esqueci minha senha"** dispara um link criptografado para o e-mail cadastrado, direcionando-o à tela dedicada de redefinição (`src/components/admin/ResetPassword.tsx`), que exige padrão de segurança forte (mínimo de 8 caracteres, incluindo ao menos uma letra maiúscula e um número).

**§ 003. Menu de Perfil do Usuário, Foto em Nuvem (R2), Troca de Senha e Vínculo Google:**
No canto superior direito do cabeçalho global (`src/components/layout/AdminLayout.tsx`), ao clicar sobre o nome ou avatar do usuário logado, abre-se um menu suspenso (*Popover*) dividido em três abas de autogestão: **(a) Foto de Perfil**, que permite enviar uma fotografia diretamente para o armazenamento em nuvem (Cloudflare R2 / Supabase Storage), bloqueando imagens pesadas em Base64; **(b) Alterar Senha**, que permite definir uma nova senha imediatamente ou solicitar link de redefinição por e-mail (deslogando automaticamente a sessão após a troca por segurança); e **(c) Google SSO**, onde o usuário pode vincular ou desvincular sua conta Google pessoal/corporativa para logins rápidos com um clique.

**§ 004. Navegação Global, Barra Lateral Retrátil, Mobile Card Hub e Indicadores de Resiliência:**
A navegação principal adapta-se automaticamente ao dispositivo do usuário. No computador (Desktop), exibe uma **barra lateral esquerda retrátil** (que pode ser recolhida para exibir apenas ícones e o monograma "D", maximizando a área útil de tabelas e mapas). Em celulares ou tablets, o menu transforma-se em um **Hub de Cards Categorizados** (*Operação & Atendimentos*, *Financeiro & Comercial*, *Cadastros & Ativos* e *Configurações & IA*). No rodapé da barra lateral, há um botão verde **"Suporte (Online Agora)"** que abre conversa direta com o suporte técnico oficial, além de indicadores automáticos de status de conexão de rede (`NetworkStatusIndicator.tsx`) e saúde do servidor (`ResilienceIndicator.tsx`).

**§ 005. Central de Notificações Internas e Modais de Leitura Obrigatória:**
Ao lado do perfil do usuário, no cabeçalho superior, localiza-se o **ícone de sino (Notificações)** com contador em tempo real de avisos não lidos. As notificações recebidas da administração ou do sistema dividem-se em três níveis: **Informativas (Info)**, **Atenção (Warning)** e **Urgentes (Urgent)**. Enquanto avisos normais ficam listados na caixa de entrada do sino (com suporte a botões de ação que redirecionam para telas internas ou links externos), os comunicados classificados como **Urgentes** abrem automaticamente uma janela modal bloqueante no centro da tela assim que o usuário acessa o sistema, exigindo o clique explícito no botão **"Ciente, Confirmar Leitura"** para liberar o uso da plataforma.

**§ 006. Isolamento Multi-Tenant (RLS) e Segurança em Profundidade:**
Toda a usabilidade do sistema opera sob isolamento absoluto de dados entre empresas (*Multi-Tenant*). Cada ação de leitura, criação, edição ou exclusão passa por políticas de **Row Level Security (RLS)** diretamente no banco de dados PostgreSQL, que valida o identificador da empresa (`tenant_id`) e as permissões do grupo do usuário (`has_module_permission`). Isso garante que nenhuma empresa jamais visualize dados de outra e impede que qualquer usuário mal-intencionado tente burlar botões ocultos da interface enviando comandos diretos via API.

**§ 007. Código de Identidade Exclusivo de 6 Dígitos (PIN Operacional):**
Todo usuário administrativo e todo técnico de campo cadastrado recebe automaticamente um **Código de Identidade Exclusivo de 6 Dígitos (PIN)**. Esse identificador curto e único funciona como uma assinatura operacional rápida para rastreabilidade em auditorias internas, validações de movimentação de estoque, identificação de operadores e confirmações logísticas.

---

## TEMA 2: Portal SuperAdmin / Master (Governança Multi-Empresas e Provisionamento)

**§ 008. Acesso Seguro ao Portal Master e Painel Global de Instâncias (Tenants):**
Acessado através de uma rota secreta parametrizada por variável de ambiente (`MasterLogin.tsx` e `SuperAdminPage.tsx`), o **Portal SuperAdmin (Master)** é o centro de comando do proprietário da plataforma SaaS. Ele apresenta indicadores globais de infraestrutura e lista todas as empresas clientes (*Tenants*) cadastradas, exibindo em tempo real o status da assinatura (Ativa ou Suspensa), quantidade de usuários, técnicos ativos, total de Ordens de Serviço geradas e equipamentos cadastrados em cada organização.

**§ 009. Provisionamento de Novas Empresas, Sequencial de OS e Cotas Operacionais:**
Ao clicar em **"+ Nova Empresa"** no Portal Master, o SuperAdmin provisiona um novo ambiente completo em segundos. O formulário permite definir: Razão Social, Nome Fantasia, CNPJ, Inscrição Estadual, Identificador único (*Slug*), E-mail do Administrador Principal, Senha Inicial, Endereço completo (com busca automática por CEP), Logotipo, **Prefixo da OS** (ex.: `OS-`), **Número Inicial da Sequência de OS** (ex.: `1000`), **Limite Máximo de Licenças de Técnicos** (`max_technicians`), **Cota Máxima de Manuais na IA** (`max_ai_manuals`) e **Qualidade Padrão de Compressão de Vídeo** (SD/HD).

**§ 010. Ativação e Bloqueio Granular de Módulos por Empresa (Feature Flags Master):**
Dentro do cadastro ou edição de cada empresa no Portal Master, o SuperAdmin controla chaves individuais (*Feature Flags*) para habilitar ou desabilitar módulos específicos conforme o plano comercial contratado pelo cliente (Dashboard, Duno IA, WhatsApp, Solicitações, Atividades/OS, Agenda, Mapa, Financeiro, Orçamentos, Estoque, Contratos, Clientes, Ativos, Formulários, Técnicos, Regiões, Usuários, Configurações e Integrações). Quando um módulo é desativado pelo Master, ele fica imediatamente bloqueado para todos os usuários daquela empresa, inclusive para o administrador local.

**§ 011. Impersonation ("Acessar Painel" / Login Master sem Senha):**
Para prestar suporte avançado ou configurar a conta de um cliente, o SuperAdmin dispõe do recurso de **Impersonation**. Ao clicar para acessar o painel de uma empresa listada no Portal Master, o sistema autentica o SuperAdmin diretamente dentro do ambiente daquela empresa com privilégios totais (*Master Override*), exibindo uma barra superior de alerta indicando o modo de supervisão e permitindo retornar ao Portal Master a qualquer momento.

**§ 012. Disparo de Comunicados Master (Broadcast ou Direcionados) e Auditoria de Leitura:**
O Portal Master conta com uma central de mensageria corporativa que permite enviar comunicados para **todas as empresas (Broadcast)** ou **empresas e cargos específicos (Targeted)**. O SuperAdmin define título, conteúdo, nível de prioridade (*Info*, *Warning* ou *Urgent*), data de expiração e botão de ação opcional (rótulo e link). Após o disparo, o painel Master exibe estatísticas de engajamento e permite abrir o **Modal de Auditoria de Leitura**, listando nominalmente quais usuários de quais empresas já visualizaram e confirmaram a leitura do comunicado, com data e hora exatas.

**§ 013. Motor de Backup Completo por Empresa (`BackupEngine`):**
Em cada card de empresa no Portal Master, há um botão dedicado para **Exportação e Backup Completo**. Ao acioná-lo, o motor `BackupEngine` extrai com barra de progresso em tempo real todos os registros operacionais, cadastros, histórico financeiro, clientes, ativos e ordens de serviço daquele *Tenant*, gerando um pacote consolidado de segurança para download local.

---

## TEMA 3: Configurações da Organização, Parâmetros do Sistema, App e SLA

**§ 014. Aba Organização — Dados Fiscais, Identidade Visual e Proteção LGPD:**
No menu lateral **Configurações** (`src/components/admin/SettingsPage.tsx`), a primeira aba (**Organização**) centraliza os dados institucionais da empresa: Razão Social, Nome Fantasia, CNPJ, Inscrição Estadual, E-mail corporativo, Telefone/WhatsApp, Website, Endereço completo e **Logotipo Oficial**. O logotipo enviado aqui é injetado automaticamente no topo do painel, nos cabeçalhos de todos os relatórios PDF de Ordens de Serviço, nos PDFs de Orçamentos, nos Recibos Financeiros e nos Links Públicos enviados aos clientes. Dados estruturais críticos contam com travas de segurança compatíveis com a LGPD para evitar adulterações acidentais.

**§ 015. Aba Sistema — Idioma, Fuso Horário, Sequencial de OS, Sessão e GPS Global:**
Na aba **Sistema**, o administrador parametriza o comportamento global da plataforma: escolha do **Idioma da Interface** (Português `pt-BR`, Inglês `en-US` ou Espanhol `es-ES`), **Fuso Horário** regional (garantindo precisão em agendamentos e logs), **Prefixo e Número Inicial de OS** (com trava automática após a primeira OS gerada para evitar duplicidade de numeração), **Tempo Limite de Sessão Ociosa** (*Idle Logout* para segurança em computadores compartilhados), frequência de backup e ativação global de rastreamento GPS e notificações automáticas ao cliente.

**§ 016. Aba APP do Técnico — Controle de Visibilidade e Permissões Operacionais em Campo:**
Na aba **APP do Técnico**, o gestor define exatamente o que os profissionais de campo podem ver ou fazer no celular através de chaves liga/desliga intuitivas:
1. **Exibir Preços de Itens no App:** oculta ou mostra valores financeiros de peças e serviços para o técnico;
2. **Permitir Compartilhamento de OS:** libera ou bloqueia o envio do link da OS pelo técnico;
3. **Permitir Múltiplas OS em Andamento Simultâneo:** quando desativado, obriga o técnico a concluir ou pausar/impedir a OS atual antes de iniciar outra;
4. **Exibir Contato do Cliente:** controla se o técnico vê o telefone/WhatsApp direto do cliente;
5. **Exibir Histórico de Peças e Histórico de Visitas:** libera consulta ao passado do equipamento;
6. **Permitir Registro de Impedimento:** autoriza ou bloqueia que o técnico marque uma visita como "Impedida".

**§ 017. Aba APP do Técnico — Check-in Automático (50m) e Bloqueio por Geofencing (300m):**
Ainda na aba **APP do Técnico**, existem duas automações geográficas avançadas para auditoria de presença física:
- **Check-in Automático por Proximidade:** quando ativado, o aplicativo mobile monitora a chegada do técnico em um raio de **50 metros** do endereço do cliente e, após permanecer **10 minutos** no local, registra automaticamente a chegada e inicia o atendimento sem necessidade de clique manual;
- **Restringir Execução por Localização (Geofencing de 300 metros):** quando ativado, o aplicativo mobile bloqueia fisicamente o início ou preenchimento da Ordem de Serviço caso o GPS do celular do técnico indique que ele está a mais de **300 metros** de distância das coordenadas do cliente.

**§ 018. Aba Parâmetros de Dashboard, Metas de SLA e Regras de Link Público:**
Na aba de **Parâmetros de Dashboard e Visualização**, o administrador define as metas percentuais de **SLA de 24 horas** e **SLA de 48 horas** (que alimentam os medidores de eficiência na tela inicial do sistema), ativa ou desativa a validação territorial de **Geofencing no Agendamento** (`enableGeofencing`) e controla a privacidade dos Links Públicos enviados aos clientes (escolhendo se o cliente final poderá ver os preços unitários dos itens e o histórico detalhado de visitas anteriores).

**§ 019. Aba WhatsApp Bot — Conexão QR Code, Personalidade da IA e Horário de Expediente:**
Na aba **WhatsApp Bot**, a empresa conecta seu número corporativo de WhatsApp (via motor UAZAPI / Z-API) escaneando um **QR Code ao vivo** diretamente na tela. O painel permite configurar:
- **Ativação do Bot de IA**, **Nome do Assistente Virtual** (ex.: *Lia*) e **Gênero da Persona**;
- **Mensagem de Saudação Inicial** e **Palavra-Chave de Transbordo Humano** (ex.: `ATENDENTE`);
- **Informações Institucionais da Empresa** (contexto usado pela IA para responder dúvidas sobre serviços, endereço e políticas);
- **Dias e Horários de Expediente Comercial** (ex.: Segunda a Sexta, das 08:00 às 18:00) e **Mensagem Automática Fora de Expediente**;
- **Painel de Diagnóstico e Histórico de Conexão**, que traduz automaticamente códigos técnicos de desconexão da API (como aparelho sem internet, sessão desconectada no celular ou troca de dispositivo) e monitora a saúde do WhatsApp no cabeçalho do sistema.

---

## TEMA 4: Controle de Acesso, Usuários e Grupos de Permissão (RBAC)

**§ 020. Criação e Gestão de Grupos de Permissão Personalizados:**
No módulo **Usuários** (`UserManagement.tsx` e `GroupList.tsx`), o sistema adota controle de acesso baseado em papéis (*Role-Based Access Control* — RBAC). Antes de cadastrar operadores de backoffice, o administrador pode criar quantos **Grupos de Permissão** desejar (por exemplo: *Atendimento / Call Center*, *Supervisores de Campo*, *Almoxarifado*, *Financeiro / Faturamento*, *Comercial*).

**§ 021. Matriz de Permissões Granulares (CRUD por Módulo e Abas Sensíveis):**
Ao criar ou editar um grupo no modal `GroupFormModal.tsx`, o administrador marca individualmente o que os membros daquele grupo podem fazer em cada módulo do sistema: **Acessar Menu (Visualizar)**, **Criar Novos Registros**, **Editar Registros Existentes** e **Excluir Registros**. Também é possível controlar individualmente o acesso a cada aba interna do menu de Configurações (Organização, Sistema, App do Técnico, Dashboard e WhatsApp) e à Gestão de Regiões.

**§ 022. Cadastro de Usuários Administrativos e Fluxo de Senha Compatível com LGPD:**
Para adicionar um membro da equipe interna, o administrador clica em **"+ Novo Usuário"**, preenche Nome Completo, E-mail corporativo, Cargo e vincula o colaborador a um **Grupo de Permissão**. Em conformidade com as boas práticas de segurança e LGPD, a definição ou redefinição de senha pode ser disparada diretamente para o e-mail do usuário para que somente ele conheça sua credencial privada, além de gerar automaticamente seu PIN exclusivo de 6 dígitos.

**§ 023. Edição de Perfil, Troca de Grupo, Monitoramento e Bloqueio Instantâneo:**
Na listagem de usuários, o administrador visualiza o grupo atual, status da conta e dados de contato de cada colaborador. Caso um funcionário mude de setor, basta editar seu cadastro e alterar seu Grupo de Permissão para que a barra lateral e os botões de ação se ajustem instantaneamente em tempo real. Em caso de desligamento ou férias, o botão de **Bloqueio / Suspensão de Acesso** revoga imediatamente a entrada do usuário no sistema sem apagar o histórico das Ordens de Serviço, notas internas ou lançamentos financeiros que ele realizou no passado.

---

## TEMA 5: Cadastros Base — Clientes, Técnicos, Regiões Geográficas e Ativos

**§ 024. Gestão de Clientes — Cadastro Completo, Validação CPF/CNPJ e Busca de CEP:**
No módulo **Cliente** (`CustomerManagement.tsx`), a empresa gerencia toda a sua carteira de clientes (Pessoas Físicas ou Jurídicas). Ao clicar em **"+ Novo Cliente"**, o formulário realiza validação algorítmica de **CPF ou CNPJ**, solicita Nome/Razão Social, Nome Fantasia, E-mail, Telefone fixo e **WhatsApp** (usado para disparos e botões de conversa direta). Ao digitar o **CEP**, o sistema consulta automaticamente a base nacional (ViaCEP) e preenche Logradouro, Bairro, Cidade e Estado.

**§ 025. Geocodificação Precisa de Clientes e Importância Crítica do Número do Endereço:**
Ao salvar o cadastro ou edição de um cliente, o motor geográfico do Duno converte automaticamente o endereço completo em **coordenadas exatas de Latitude e Longitude (PostGIS)**. Para que a precisão geográfica seja máxima no Mapa de Visão de Campo e na validação de Cercas Virtuais (*Geofencing*), o preenchimento do campo **Número do Estabelecimento/Residência** é fundamental: com ele, o pino do cliente cai exatamente sobre o imóvel correto na rua.

**§ 026. Gaveta (Drawer) de Histórico 360º do Cliente:**
Ao clicar sobre qualquer cliente na tabela de listagem, abre-se um painel detalhado (*Drawer*) com a visão 360º daquele tomador de serviço: dados cadastrais e endereço georreferenciado, lista de todos os **Ativos/Equipamentos** instalados naquele cliente, histórico completo de **Ordens de Serviço** (abertas, em andamento e concluídas), **Orçamentos** enviados e resumo de **Faturamento**, permitindo editar dados ou iniciar ações rápidas sem sair da tela.

**§ 027. Gestão de Técnicos de Campo — Especialidades, Cores e Contato Rápido:**
No módulo **Técnicos** (`TechnicianManagement.tsx`), o gestor cadastra os profissionais que atuam externamente utilizando o aplicativo móvel Duno. Cada cadastro inclui Nome, E-mail de login no App, Senha inicial, Telefone/WhatsApp, **Especialidade Técnica Principal** (ex.: Refrigeração, Elétrica, Hidráulica, Linha Branca), placa/veículo e uma **Cor de Identificação Visual**. Essa cor escolhida acompanha o técnico em todo o sistema: colore seu pino GPS no Mapa em Tempo Real e seus blocos de serviço na Agenda. O painel também exibe o limite de licenças contratadas e oferece botão de chamada rápida no WhatsApp do técnico.

**§ 028. Inativação Segura vs. Exclusão de Técnicos:**
O módulo de Técnicos permite alternar o status do profissional entre **Ativo/Disponível** e **Inativo/Indisponível** (para casos de férias, afastamento ou desligamento). Inativar um técnico bloqueia imediatamente seu login no App Mobile e o oculta das listas de agendamento de novas OS, mas **preserva intacta a integridade histórica** de todas as Ordens de Serviço, visitas, comissões e relatórios que ele executou anteriormente.

**§ 029. Gestão de Regiões e Cercas Virtuais (Geofencing) — Criação e Vínculo de Equipe:**
No módulo **Gestão de Regiões** (`RegionManagement.tsx` e `RegionModal.tsx`), a empresa organiza seu território de atendimento em zonas geográficas. Ao clicar em **"+ Criar Nova Região"**, o gestor define um Nome (ex.: *Zona Sul*, *Grande ABC*, *Região Metropolitana*), escolhe uma **Cor de Destaque** para o mapa e seleciona quais **Técnicos** são responsáveis por atender aquela área.

**§ 030. Desenho e Edição de Polígonos no Mapa e Bloqueio Territorial Automático (Turf.js):**
Após criar a região, o modo de desenho interativo é ativado sobre o mapa (com busca rápida **"Ir para cidade..."**): o gestor clica nos pontos das ruas/bairros para desenhar o **polígono da cerca virtual** e pode remodelar seus vértices a qualquer momento clicando em **"Editar Mapa"**. Quando a chave de Geofencing está ativa nas Configurações, toda vez que um operador vai abrir uma OS ou agendar uma visita técnica, o motor espacial (`Turf.js`) verifica se o endereço do cliente cai dentro de algum polígono ativo: se cair, **apenas os técnicos vinculados àquela região ficam liberados para seleção**, enquanto os demais técnicos aparecem bloqueados com aviso visual, evitando erros de escala logística.

**§ 031. Gestão de Ativos e Equipamentos — Inventário por Cliente e Manuais Técnicos:**
No módulo **Ativos** (`EquipmentManagement.tsx`), a empresa cadastra e rastreia individualmente cada máquina, veículo ou equipamento instalado em seus clientes. O cadastro armazena: **Cliente proprietário**, **Nome/Descrição**, **Marca**, **Modelo**, **Família/Categoria do Equipamento** (usada para acionar checklists automáticos), **Número de Série**, **Tag/Patrimônio**, localização física na planta do cliente, foto do ativo e anexo de documentos/manuais.

**§ 032. Cálculo Automático de Garantia de Ativos (Selo Verde vs. Selo Vermelho):**
Ao cadastrar ou editar um ativo, o usuário pode informar a **Data de Fabricação/Instalação** e o **Prazo de Garantia (em meses)**. Com base nesses dois campos, o sistema calcula automaticamente e em tempo real a vigência da cobertura, exibindo um selo visual verde (**"Em Garantia"**) ou vermelho (**"Fora de Garantia"**) tanto na listagem de ativos quanto dentro da Ordem de Serviço e no aplicativo do técnico antes do início do diagnóstico.

---

## TEMA 6: Almoxarifado Digital, Estoque Central, Estoque do Técnico e QR Code

**§ 033. Catálogo de Peças e Materiais — SKU, Custos, Impostos e Preço de Venda:**
O módulo **Estoque** (`StockManagement.tsx`) é dividido em 5 abas operacionais (*Itens*, *Categorias*, *Estoque Técnicos*, *Movimentações* e *Balanço*). Na aba **Itens**, o almoxarife cadastra peças, insumos e materiais com **Código/SKU interno gerado automaticamente** (padrão `NX` + 6 dígitos ou customizado), código externo do fabricante, descrição, categoria, endereço físico no almoxarifado (corredor/prateleira), unidade de medida (`UN`, `MT`, `KG`, `LT`, `CX`), foto do produto, **Quantidade Atual**, **Estoque Mínimo de Segurança**, **Preço de Custo**, **Custo de Frete**, **Percentual de Imposto (%)** e **Preço Final de Venda**.

**§ 034. Gestão de Categorias de Estoque e Alertas de Saldo Mínimo:**
Na aba **Categorias**, o gestor cria e organiza os grupos de materiais (ex.: *Compressores*, *Gases Refrigerantes*, *Placas Eletrônicas*, *Cabos e Conectores*). Na listagem principal de itens, o sistema monitora continuamente a relação entre a Quantidade Atual e o Estoque Mínimo configurado, destacando visualmente os itens com **Estoque Baixo / Crítico** ou **Sem Estoque** para facilitar compras e reposições preventivas.

**§ 035. Geração Automática de QR Code e Impressão de Etiquetas (A4 ou Térmica):**
Para cada peça cadastrada no estoque, o sistema gera instantaneamente um **QR Code único** vinculado ao código SKU do produto. O usuário pode selecionar um ou múltiplos itens na tabela e acionar a **Impressão de Etiquetas**, escolhendo entre o layout para **Folha A4 (impressoras laser/jato de tinta)** ou layout para **Impressora Térmica de Etiquetas**. Coladas nas peças físicas, essas etiquetas permitem que o técnico dê baixa no item em campo apenas apontando a câmera do celular, eliminando erros de digitação.

**§ 036. Reposição Rápida (Entrada de Estoque) e Log Auditável de Movimentações:**
Para alimentar o saldo de mercadorias que chegam de fornecedores sem precisar editar todo o cadastro do produto, o botão de **Reposição / Entrada Rápida** permite buscar o item e somar a quantidade recebida imediatamente. Todas as entradas, saídas, baixas em OS, reservas em orçamentos e ajustes ficam gravados de forma imutável na aba **Movimentações** (e na aba *Logs* dentro do modal de cada item), permitindo filtrar por período, tipo de operação e responsável.

**§ 037. Estoque Descentralizado por Técnico (Controle de Maleta / Veículo):**
Na aba **Estoque Técnicos**, o sistema controla o inventário individual que está em posse de cada profissional de campo (na maleta de ferramentas ou na van de atendimento). O almoxarife utiliza o modal de **Transferência de Estoque** para transferir unidades do **Estoque Central para o Técnico** (ou registrar a **Devolução do Técnico para o Estoque Central**). Assim, quando o técnico consome uma peça durante uma Ordem de Serviço no App Mobile, a baixa pode ser descontada diretamente da carga que estava com ele.

**§ 038. Balanço Físico e Auditoria de Inventário (Contagem e Relatórios de Divergência):**
A aba **Balanço** oferece uma ferramenta empresarial de contagem física de estoque. Ao iniciar um novo ciclo de balanço, o operador digita as quantidades reais contadas nas prateleiras item a item; o sistema compara automaticamente o **Saldo do Sistema vs. Saldo Contado**, calcula as divergências positivas ou negativas e, após confirmação no modal de fechamento, ajusta os saldos e gera um **Relatório Histórico de Balanço Auditado** que pode ser consultado, filtrado por data/código e impresso a qualquer momento.

**§ 039. Baixa Automática de Peças via OS e Orçamentos:**
O estoque é totalmente integrado aos fluxos operacionais e comerciais: quando um técnico adiciona peças utilizadas na execução da OS pelo aplicativo móvel (seja por busca manual ou leitura de QR Code) ou quando o administrador vincula itens do estoque em uma OS/Orçamento aprovado, o sistema processa a movimentação de saída e atualiza os saldos em tempo real.

---

## TEMA 7: Formulários Dinâmicos, Checklists e Motor de Regras de Ativação

**§ 040. Construtor de Formulários e Checklists Personalizados:**
No módulo **Formulários** (`FormManagement.tsx`), a empresa digitaliza seus relatórios de campo criando templates de checklists sob medida. Em cada formulário, o administrador adiciona quantas perguntas ou etapas desejar, configurando para cada item: o título da pergunta/verificação, o **Tipo de Resposta** (**Texto Livre**, **Numérico/Medição**, **Seleção Única / Múltipla Escolha / Sim-Não-N/A**, **Captura de Foto** ou **Assinatura**) e a chave de **Preenchimento Obrigatório**.

**§ 041. Cadastro de Tipos de Serviço (Modalidades) e Tipos de Defeito:**
Dentro da estrutura de parametrização de formulários e atividades, o administrador gerencia os **Tipos de Serviço / Modalidades Operacionais** (ex.: *Manutenção Preventiva*, *Manutenção Corretiva*, *Instalação*, *Vistoria Técnica*, *Garantia*) e os **Tipos de Defeito Padronizados**. Essas classificações estruturam a abertura de Ordens de Serviço, alimentam os gráficos do Dashboard e servem de gatilho para comissões e checklists.

**§ 042. Motor de Regras de Ativação Condicional (Tipo de Serviço × Família de Ativo):**
O grande diferencial de usabilidade do módulo de Formulários é o **Motor de Regras de Ativação** (`formRulesEngine.ts`). O administrador cria regras lógicas vinculando: **Se o Tipo de Serviço for `[X]` E a Família do Equipamento for `[Y]` (ou `Todos`) ➔ Carregar automaticamente o Formulário `[Z]`**. Caso uma OS possua múltiplos equipamentos de famílias diferentes, o aplicativo do técnico carrega o checklist específico correspondente para cada equipamento individualmente.

**§ 043. Validação Bloqueante no App Mobile e Renderização no PDF:**
Quando uma pergunta ou foto do checklist é marcada como **Obrigatória**, o aplicativo móvel do técnico impede a finalização da Ordem de Serviço até que aquele campo seja respondido ou a foto seja capturada na hora. Uma vez concluída a visita, todas as respostas e fotos do checklist aparecem organizadas na aba **Formulários** da OS no painel web e são impressas automaticamente no Relatório PDF oficial entregue ao cliente.

---

## TEMA 8: Dashboard Executivo, Agenda e Visão de Campo (Mapa GPS em Tempo Real)

**§ 044. Dashboard de Indicadores Operacionais (KPIs e Medidores de SLA):**
A tela inicial **Dashboard** (`AdminOverview.tsx`) entrega uma visão executiva instantânea da operação. Ela apresenta:
- **Cards de Contagem por Status:** total de OS Abertas/Pendentes, Agendadas, Em Andamento, Impedidas, Concluídas e Canceladas no período;
- **Medidores de Eficiência de SLA (24h e 48h):** comparam o percentual real de chamados resolvidos dentro do prazo contra a meta definida nas Configurações;
- **Gráficos de Produtividade e Volume:** evolução de atendimentos por período, distribuição por tipo de serviço, ranking de técnicos ativos e resumo de contratos e clientes.

**§ 045. Filtros Temporais Inteligentes e Atualização Instantânea (Edge Function & Realtime):**
No topo do Dashboard, o gestor pode filtrar todos os indicadores por **Data Inicial e Data Final** (com trava automática de segurança para intervalos de até 365 dias). O carregamento é ultra-rápido graças à agregação em nuvem via Edge Function (`dashboard-summary`) combinada ao barramento **Supabase Realtime**, que atualiza os contadores na tela assim que qualquer técnico muda o status de uma OS em campo.

**§ 046. Módulo Agenda (Calendário Interativo de Distribuição de Carga):**
No menu **Agenda** (`OrderCalendar.tsx`), o despachante visualiza todas as Ordens de Serviço e visitas distribuídas no tempo. A interface permite alternar entre as visões **Mensal, Semanal e Diária**, filtrar a agenda por um **Técnico específico** ou por **Status**, identificar visualmente cada profissional pela sua cor cadastrada e clicar sobre qualquer card de agendamento para abrir instantaneamente os detalhes completos da OS.

**§ 047. Módulo Visão de Campo (Mapa Logístico GPS em Tempo Real):**
No menu **Visão de Campo** (`TechnicianMap.tsx`), toda a operação de rua é plotada sobre um mapa geográfico interativo. O gestor visualiza simultaneamente: **(a) os pinos dos técnicos em campo** (com sua foto/cor, status online/offline, nível de bateria/última atualização e qual OS estão atendendo ou se estão livres) e **(b) os pinos dos clientes e chamados ativos**, facilitando a tomada de decisão rápida para escalar o técnico mais próximo de uma emergência.

**§ 048. Histórico de Rastreamento e Deslocamento Geográfico:**
Além da posição ao vivo, a arquitetura de localização armazena o histórico de coordenadas enviadas pelo aplicativo móvel durante os deslocamentos e execuções, permitindo auditar trajetos, distâncias percorridas e horários de passagem de cada membro da equipe externa.

---

## TEMA 9: Central de Atividades — Ciclo Completo da Ordem de Serviço (OS)

**§ 049. Listagem Avançada de Ordens de Serviço, Busca e Filtros Combinados:**
O módulo **Atividade** (`AdminDashboard.tsx`) é o cockpit principal de operação. Utiliza paginação *server-side* de alta performance e oferece uma barra de ferramentas completa:
- **Busca Textual Instantânea:** pesquisa por número da OS (`displayId`), título, nome do cliente ou documento;
- **Seletor de Tipo de Data e Período:** filtra por Data de Agendamento, Data de Criação ou Data de Conclusão;
- **Filtros Avançados Combináveis:** filtra por **Status da OS**, **Técnico Responsável**, **Cliente**, **Tipo de Serviço**, **Número de Série do Equipamento** e **Usuário Criador da OS**, além de ordenação crescente/decrescente em qualquer coluna da tabela.

**§ 050. Assistente de Abertura de Nova OS em 5 Etapas Guiadas:**
Ao clicar em **"+ Nova OS"**, abre-se o modal inteligente `CreateOrderModal.tsx`, que conduz o operador passo a passo:
1. **Cliente e Localização:** seleção do cliente (com busca rápida) e conferência do endereço;
2. **Equipamentos / Ativos:** seleção de um ou múltiplos equipamentos cadastrados daquele cliente (exibindo se estão em garantia);
3. **Classificação e Escopo:** escolha do Tipo de Serviço, Tipo de Defeito, Prioridade (*Baixa*, *Normal*, *Alta*, *Urgente/Crítica*), Título, Descrição detalhada do problema e Checklist/Formulário;
4. **Agendamento e Escala Inteligente:** escolha da Data, Horário e **Técnico Responsável** (validando automaticamente as regras de *Geofencing* da região do cliente);
5. **Revisão e Confirmação:** resumo geral antes de gerar a OS e disparar a sincronização para o celular do técnico.

**§ 051. Ciclo de Vida e Máquina de Estados da Ordem de Serviço:**
Toda OS percorre um fluxo de estados padronizado e rastreado:
- **ABERTA / PENDENTE:** recém-criada, aguardando agendamento ou início;
- **AGENDADA / ATRIBUÍDA:** com técnico, data e hora definidos;
- **EM DESLOCAMENTO:** técnico acionou no App que está a caminho do cliente;
- **EM ANDAMENTO:** técnico realizou check-in no local e está executando o serviço;
- **IMPEDIDA (BLOQUEADA):** atendimento interrompido por motivo justificado (ex.: cliente ausente, falta de peça, local inacessível);
- **CONCLUÍDA:** serviço finalizado com laudo, checklist e assinatura do cliente;
- **FATURADA / PAGA:** OS já processada pelo setor financeiro;
- **CANCELADA:** ordem encerrada administrativamente.

**§ 052. Cockpit de Detalhes da OS — Aba Visão Geral e Edição Inline Rápida:**
Ao clicar em uma OS na listagem, abre-se a janela de comando da Ordem de Serviço com menu de navegação lateral interno. Na primeira aba (**Visão Geral**), o operador visualiza todos os dados do chamado, cliente, endereço, prioridade, técnico, valores e laudo técnico. Clicando no botão **"Editar OS"**, os campos entram em modo de edição direta (*inline*), permitindo alterar técnico, data agendada, prioridade, tipo de serviço, descrição ou vincular um orçamento aprovado em segundos.

**§ 053. Cockpit da OS — Aba Ativos Vinculados (Multi-Equipamentos):**
Na aba **Ativos**, o gestor visualiza todos os equipamentos incluídos no escopo daquela Ordem de Serviço, com seus números de série, modelos, famílias e badges automáticos de status de garantia. Durante a edição da OS, é possível adicionar novos equipamentos do catálogo do cliente ou remover ativos da lista.

**§ 054. Cockpit da OS — Aba Visitas Técnicas (Histórico e Reagendamento Multi-Visitas):**
Uma mesma Ordem de Serviço pode exigir múltiplos comparecimentos ao local (por exemplo, quando a primeira visita é impedida por falta de peça e uma segunda visita é agendada para conclusão). A aba **Visitas** (`VisitHistoryTab.tsx`) lista cada visita técnica numerada (`Visita #1`, `Visita #2`...), mostrando o técnico designado, data/hora agendada, horários reais de início e fim, status da visita, motivos de impedimento e permite **Criar Nova Visita** ou **Editar Agendamento** com validação territorial de Geofencing.

**§ 055. Cockpit da OS — Aba Formulários/Checklists e Aba Execução/Custos:**
Na aba **Formulários** (`VisitFormsTab.tsx`), o backoffice consulta todas as respostas dos checklists preenchidos pelo técnico em campo, separadas por equipamento e por visita, incluindo as fotos de cada pergunta. Já na aba **Execução / Custos**, o gestor visualiza o laudo técnico final, adiciona ou edita **Peças e Materiais do Estoque** aplicados na OS, confere quantidades, valores unitários e o somatório financeiro total do atendimento.

**§ 056. Cockpit da OS — Aba Deslocamento (KM, Tempo e Coordenadas de Check-in):**
Na aba **Deslocamento** (`DisplacementTab.tsx`), o sistema exibe as métricas logísticas registradas pelo GPS do técnico: horário de início do deslocamento, horário de chegada no cliente (*Check-in*), horário de saída (*Check-out*), distância percorrida estimada/registrada em quilômetros (KM) e tempo total de viagem e de atendimento no local.

**§ 057. Cockpit da OS — Aba Fotos e Vídeos (Galeria de Evidências Multimídia):**
Na aba **Fotos e Vídeos**, ficam reunidas todas as mídias capturadas pelo técnico durante o atendimento: fotos de antes/depois, fotos de checklists, **Vídeos gravados em campo** (com reprodutor integrado) e a **Assinatura Digital do Cliente** acompanhada do nome e documento do recebedor. Qualquer imagem pode ser ampliada em tela cheia (*Fullscreen Lightbox*).

**§ 058. Cockpit da OS — Aba Observações Internas (Comunicação de Backoffice com Anexos):**
A aba **Observações Internas** funciona como um mural de comunicação exclusivo da equipe interna (invisível para o cliente final no link público). Os operadores podem digitar anotações de acompanhamento e **anexar arquivos, fotos ou documentos PDF** (armazenados na nuvem via Edge Function `save-internal-note`), mantendo um histórico cronológico com o nome do autor e horário de cada nota.

**§ 059. Cockpit da OS — Aba Timeline / Auditoria Completa:**
A aba **Timeline** (`OrderTimeline.tsx`) apresenta a linha do tempo auditável de ponta a ponta da Ordem de Serviço: desde o segundo exato em que foi criada, passando por atribuições de técnico, início de deslocamento, chegada no local, pausas/impedimentos com justificativa, até a conclusão, assinatura e faturamento.

**§ 060. Ações de Cabeçalho e Operações em Lote da OS (WhatsApp, Link Público, PDF e Excel):**
No cabeçalho de cada OS e na barra de seleção múltipla da listagem, o operador dispõe de ações imediatas:
- **Botão WhatsApp:** abre conversa direta com o número do cliente já preenchido;
- **Botão Visualizar / Copiar Link Público:** abre ou copia a URL externa para o cliente acompanhar a OS em tempo real;
- **Gerar PDF (Individual ou Impressão em Lote):** renderiza o relatório técnico A4 completo com logotipo da empresa, dados do cliente, equipamentos, checklists, fotos, peças e assinatura digital;
- **Exportar Excel (`.xlsx`):** gera planilha gerencial estilizada com todas as OS filtradas ou selecionadas.

---

## TEMA 10: Atendimento Omnichannel WhatsApp, Agente de IA ("Lia"), Duno IA e Triagem de Solicitações

**§ 061. Funcionamento do Bot de WhatsApp com IA Nativa (Atendimento 24/7):**
Quando o cliente envia uma mensagem para o WhatsApp da empresa, o motor `whatsapp-bot` e `whatsapp-ai-agent` recepciona o contato instantaneamente 24 horas por dia. A assistente de IA (configurável, por padrão **Lia**) cumprimenta o cliente, identifica automaticamente se o telefone ou CPF/CNPJ informado já consta na base de clientes do Duno, responde dúvidas institucionais e permite que o cliente **consulte o status de suas Ordens de Serviço abertas** diretamente pelo WhatsApp.

**§ 062. Coleta Estruturada de Chamados pelo WhatsApp e Interceptação de Mídias:**
Se o cliente relata um defeito ou pede uma visita técnica pelo WhatsApp, a IA conduz uma entrevista natural coletando: Nome/Empresa, CPF/CNPJ (caso seja cliente novo), Equipamento/Modelo/Número de Série e Descrição detalhada do problema. Caso o cliente envie áudios ou mídias durante a triagem automatizada, a IA informa educadamente para descrever a solicitação em texto ou encaminha o arquivo para a caixa de entrada dos atendentes humanos. Ao concluir a coleta, a IA registra automaticamente um protocolo na **Central de Solicitações**.

**§ 063. Módulo WhatsApp Inbox — Central de Atendimento Multicanal em Tempo Real:**
No menu **WhatsApp Inbox** (`WhatsAppInbox.tsx`), a equipe de atendimento acompanha todas as conversas de WhatsApp ao vivo, estilo Zendesk/WhatsApp Web corporativo. As conversas são sinalizadas por badges de estado: **Iniciando / Identificando**, **Bot Ativo (IA atendendo)**, **Abrindo OS**, **⚠ Aguardando Humano** (com alerta sonoro e contador amarelo piscante na barra lateral) e **Humano Ativo**.

**§ 064. Transbordo Humano (Assumir Conversa, Envio Multimídia e Devolução ao Bot):**
Dentro do **WhatsApp Inbox**, qualquer operador autorizado pode clicar em **"Assumir Atendimento"** para pausar a IA naquela conversa e conversar diretamente com o cliente. A interface suporta envio de mensagens de texto, emojis, **gravação de áudio pelo microfone**, envio de **fotos, vídeos e documentos PDF**, visualização de mídias recebidas, consulta aos dados do cliente vinculado e, ao finalizar o suporte, o botão **"Devolver para o Bot / Encerrar Atendimento"**, que reativa a inteligência artificial para futuros contatos daquele número.

**§ 065. Módulo Central de Solicitações — Triagem Inteligente de Chamados:**
No menu **Solicitações** (`SolicitacoesPage.tsx`), concentram-se todos os pedidos de atendimento abertos via WhatsApp Bot. Ao clicar para inspecionar uma solicitação pendente, o sistema executa uma **Triagem Automática Inteligente**: vasculha o banco de dados por telefone, documento e nome para informar visualmente se o **Cliente já está cadastrado** (exibindo seus dados completos ou oferecendo botão de cadastro rápido com 1 clique) e se o **Equipamento/Série informado já existe** no inventário (exibindo modelo e status de garantia).

**§ 066. Conversão de Solicitação em OS com 1 Clique, Resolução Direta ou Rejeição:**
Após analisar a triagem na tela de Solicitações, o supervisor tem três caminhos:
1. **Aceitar e Gerar OS:** abre o modal de criação de Ordem de Serviço já pré-preenchido com o cliente, equipamento e descrição do problema coletados no WhatsApp, gerando a OS real e vinculando o protocolo;
2. **Resolver Diretamente (Sem OS):** caso a dúvida tenha sido solucionada remotamente, marca como *Resolvida* registrando as notas de solução;
3. **Rejeitar Solicitação:** recusa o pedido registrando o motivo da rejeição para histórico e auditoria.

**§ 067. Módulo Duno IA (Copilot Administrativo e Consultas de Dados em Tempo Real):**
No menu **Duno IA** (`AIAgent.tsx`) — e também através do botão flutuante global `GlobalChatBot.tsx` — o usuário conversa com o copiloto inteligente do sistema. A Duno IA combina duas capacidades: **(a) Guia de Usabilidade**, explicando passo a passo como usar qualquer tela do sistema; e **(b) Consulta a Dados Reais (`dunoQueryService`)**, respondendo na hora a perguntas como *"Quantas OS tenho abertas?"*, *"Me dê um resumo geral do sistema"*, *"Quais técnicos estão cadastrados?"* ou *"Quantos equipamentos estão em garantia?"*.

**§ 068. Ensino Contínuo ("Saiba que...") e Ingestão de Manuais PDF na Memória da IA:**
O módulo **Duno IA** possui três abas no topo: **Assistente**, **Ensinar** e **Memórias**. O administrador pode ensinar regras específicas da sua empresa digitando frases como *"Saiba que quando o cliente pedir urgência devemos agendar em até 4 horas"* ou clicando no ícone de clipe de papel para **fazer upload de Manuais Técnicos em PDF/TXT/MD**. O motor `aiKnowledgeService.ts` lê o documento, divide em fragmentos semânticos e armazena na base de conhecimento da empresa (respeitando a cota de manuais do tenant), permitindo consultar ou excluir documentos aprendidos na aba **Memórias**.

---

## TEMA 11: Gestão Comercial — Orçamentos, Propostas e Contratos Recorrentes (PMOC)

**§ 069. Módulo de Orçamentos — Criação de Propostas Comerciais Completas:**
No menu **Orçamentos** (`QuoteManagement.tsx`), o setor comercial elabora cotações de peças e serviços. Ao clicar em **"+ Novo Orçamento"**, o operador preenche duas abas: **(1) Dados Gerais** (Cliente, Ordem de Serviço vinculada opcional, Data de Validade da proposta, Condições de Pagamento, Prazo de Entrega e Observações comerciais) e **(2) Produtos e Serviços**, onde pode puxar peças diretamente do **Estoque** (com cálculo automático de saldo e preço) ou adicionar itens de mão de obra/serviços avulsos, aplicando descontos (fixos em R$ ou percentuais %), frete e outros acréscimos.

**§ 070. Ciclo de Status Comercial do Orçamento:**
Cada orçamento é monitorado na listagem principal através de quatro estados comerciais claros:
- **ABERTO (Amarelo):** proposta gerada e aguardando decisão do cliente;
- **APROVADO (Verde):** proposta aceita pelo cliente (via link público com assinatura ou aprovação interna);
- **CONVERTIDO (Azul):** orçamento aprovado que já gerou uma Ordem de Serviço de execução;
- **REJEITADO (Vermelho):** proposta recusada pelo cliente ou cancelada (exibindo o motivo da recusa).

**§ 071. Aprovação Digital Externa e Conversão Automática em Ordem de Serviço:**
Todo orçamento possui um botão de **Link Público** e envio rápido por **WhatsApp**. Quando o cliente aprova e assina digitalmente a proposta pelo link externo, o status no painel muda instantaneamente para **APROVADO** via Realtime, registrando o nome do aprovador, documento, data/hora e imagem da assinatura. A partir de um orçamento aprovado, o botão **"Converter em OS"** transforma a proposta comercial diretamente em uma Ordem de Serviço pronta para despacho técnico, carregando todos os itens e valores aprovados.

**§ 072. Impressão de Proposta Comercial em PDF A4 e Exportação Excel:**
O módulo de Orçamentos permite gerar a qualquer momento o **PDF Profissional da Proposta Comercial**, diagramado em folha A4 com o logotipo da empresa, dados do cliente, tabela discriminada de produtos/serviços, subtotais, descontos, condições de pagamento e assinatura digital (quando já aprovado), além de permitir exportar relatórios de cotações em formato Excel (`.xlsx`).

**§ 073. Módulo de Contratos e Manutenção Planejada (PMOC) — Cadastro Técnico e Comercial:**
No menu **Contratos** (`PlannedMaintenance.tsx`), a empresa gerencia contratos recorrentes de manutenção preventiva e planos **PMOC** (Plano de Manutenção, Operação e Controle). O modal de criação é dividido em três abas:
1. **Escopo Técnico:** seleção do Cliente, geração automática do código `PMOC-...`, título do contrato, seleção dos **Equipamentos/Ativos cobertos**, data de início, **Periodicidade** (*Mensal*, *Bimestral*, *Trimestral*, *Semestral* ou *Anual*) e dia base do mês para manutenção;
2. **Condições Comerciais:** valor mensal/recorrente do contrato, quantidade de visitas previstas por ciclo, indicação se inclui peças de reposição, cláusulas/termos contratuais e opção de **Faturamento Automático Recorrente** (gerando as cobranças programadas pelos meses de vigência);
3. **Monitoramento e Alertas:** configuração de avisos automáticos com `X` dias de antecedência do vencimento da preventiva.

**§ 074. Automação de Ordens de Serviço Preventivas e Controle de Execução PMOC:**
Com o contrato ativo, o sistema monitora os ciclos de manutenção programada de cada equipamento vinculado, gerando as Ordens de Serviço preventivas e permitindo acompanhar no painel o progresso das manutenções planejadas, quais equipamentos estão em dia e quais estão próximos do vencimento.

**§ 075. Auditoria de Alterações Contratuais e Impressão de Termos:**
Qualquer edição em um contrato vigente ou alteração de seu status (Ativar, Pausar ou Encerrar Recorrência) aciona um **Modal de Auditoria Obrigatória**, exigindo que o usuário informe o motivo/justificativa da mudança. Todas as justificativas ficam salvas na aba **Histórico de Auditoria** do contrato, que também conta com visualização e impressão dos termos contratuais.

---

## TEMA 12: Módulo Financeiro Completo, Faturamento, Gateway Asaas, NFS-e e Comissões

**§ 076. Arquitetura do Módulo Financeiro em 4 Pilares Estratégicos:**
O menu **Financeiro** (`FinancialDashboard.tsx`) consolida toda a gestão econômica da empresa em quatro grandes abas superiores:
1. **Contas a Receber & Faturamento** (Ordens de Serviço concluídas, Orçamentos aprovados e Faturas geradas);
2. **Contas a Pagar** (Despesas operacionais, fornecedores, boletos e impostos);
3. **Fluxo de Caixa** (Livro-caixa consolidado de entradas, saídas, saldo acumulado e projeções);
4. **Comissões** (Regras e apuração automática de comissionamento de técnicos).

**§ 077. Contas a Receber e Emissão de Faturas (Agrupamento, Descontos e Parcelamento):**
Na aba **Contas a Receber**, o gestor visualiza todos os títulos originados de OS concluídas e Orçamentos aprovados, bem como a lista de **Faturas Geradas** (`invoices`). O operador pode selecionar um ou múltiplos recebíveis e gerar uma **Fatura Consolidada**, aplicando descontos (fixos ou percentuais), frete ou acréscimos, definindo a data de vencimento, escolhendo a forma de pagamento (*Pix*, *Boleto*, *Cartão de Crédito*, *Dinheiro*, *Transferência*) e até desmembrando a fatura em **Múltiplas Parcelas** (`invoice_installments`) com intervalos customizáveis (ex.: 4 parcelas a cada 30 dias).

**§ 078. Integração Nativa com Gateway Asaas (Pix, Boleto Bancário e Link de Cartão):**
Quando a empresa conecta sua conta do banco/gateway **Asaas** (em *Integrações > Pagamentos*), o Duno passa a emitir cobranças bancárias reais com um único clique diretamente da tela Financeira (via Edge Function `asaas-create-charge`):
- **Cobrança via Pix:** gera instantaneamente o **QR Code dinâmico** e o código **Pix Copia e Cola**;
- **Boleto Bancário Registrado:** emite o boleto PDF oficial com código de barras e linha digitável na data de vencimento escolhida;
- **Cartão de Crédito (Checkout Transparente / Link):** gera link seguro de pagamento permitindo parcelamento até o limite autorizado pela empresa.
Todas as cobranças também podem ser sincronizadas individualmente por parcela dentro da aba **Parcelas** da fatura.

**§ 079. Conciliação Bancária Automática via Webhooks e Auditoria de Pagamentos:**
Assim que o cliente efetua o pagamento do Pix, Boleto ou Cartão, o webhook oficial (`asaas-webhook`) recebe a confirmação do banco e **dá baixa automática na fatura, na parcela, na OS/Orçamento e lança a entrada no Fluxo de Caixa em tempo real**, disparando um evento de *Broadcast* que atualiza a tela financeira sem precisar recarregar a página. Além disso, o botão de **Auditoria de Gateway** abre o modal `PaymentAuditModal.tsx`, onde o gestor inspeciona o ID da transação no Asaas, taxas, datas de liquidação e logs brutos de retorno bancário.

**§ 080. Emissão Automatizada e Gestão de Notas Fiscais de Serviço (NFS-e Municipal):**
Para cada fatura gerada ou liquidada, o módulo Financeiro disponibiliza o botão de **Emitir NFS-e** (conectado à Edge Function `asaas-nfse`). O sistema transmite os dados do tomador, serviço prestado, valores e impostos para a prefeitura correspondente via integração Asaas, monitora o status de autorização da nota fiscal em tempo real e disponibiliza na tela os botões diretos para baixar o **PDF da NFS-e** e o **Arquivo XML oficial**, ou consultar eventuais mensagens de rejeição tributária.

**§ 081. Emissão de Recibos, Faturas Impressas e Anexos de Comprovantes:**
Ao dar baixa manual em um recebimento ou consultar uma fatura paga, o usuário pode fazer upload do **Comprovante de Pagamento** (imagem ou PDF) e clicar para imprimir o **Recibo / Fatura Oficial** (`InvoiceReceiptTemplate.tsx`). O sistema pergunta se o usuário deseja imprimir apenas o recibo padronizado A4 ou se deseja **incluir o comprovante anexado** na mesma impressão/PDF.

**§ 082. Aba Contas a Pagar — Despesas, Categorias, Baixa Parcial e Juros/Multas:**
Na aba **Contas a Pagar** (`AccountsPayableTab.tsx`), a empresa controla todas as suas obrigações financeiras. Clicando em **"+ Nova Conta"** (`CreatePayableModal.tsx`), o usuário cadastra: Descrição da despesa, Fornecedor ou Técnico beneficiário, Categoria (com gerenciador de categorias customizáveis em `PayableCategoriesModal.tsx`), Valor, Data de Vencimento, Forma de Pagamento e **Anexo do Boleto/Nota Fiscal**. Ao registrar o pagamento de uma despesa, o sistema suporta **Baixa Parcial** (mantendo o saldo residual pendente) e adição de **Juros, Multas ou Descontos obtidos**.

**§ 083. Aba Fluxo de Caixa Consolidado e Exportações Contábeis:**
Na aba **Fluxo de Caixa** (`CashFlowTab.tsx`), o gestor acompanha a saúde financeira líquida do negócio: cards de **Saldo Acumulado**, **Total de Entradas no Período**, **Total de Saídas no Período** e **Projeções A Receber / A Pagar**, seguidos pelo extrato cronológico detalhado de cada movimentação. Em todas as abas do Financeiro, a barra de ações em lote (`FloatingBatchBar.tsx`) permite selecionar registros para **Exportar Planilha Excel Estilizada (`.xlsx`)** ou **Imprimir Relatório Financeiro Consolidado A4**.

**§ 084. Aba Comissões de Técnicos — Regras Globais e Exceções por Modalidade:**
Na aba **Comissões** (`CommissionsTab.tsx`), o administrador configura a política de remuneração variável de cada técnico de campo. Para cada profissional, é possível criar uma **Regra Global** ou **Regras Específicas por Modalidade/Tipo de Serviço** (ex.: *Instalação* paga X, *Preventiva* paga Y), definindo:
- **Comissão para OS Concluída:** valor fixo em reais (`R$`) ou percentual (`%`) sobre o valor do serviço;
- **Comissão/Ajuda de Custo para Visita Impedida:** valor fixo (`R$`) ou percentual (`%`) caso o técnico vá até o local mas o atendimento seja bloqueado por culpa do cliente.

**§ 085. Sincronização Automática de Comissões com Contas a Pagar:**
O motor financeiro sincroniza automaticamente as Ordens de Serviço concluídas/impedidas com as regras de comissão ativas (`syncCommissionsForCompletedOrders`), calculando os valores devidos a cada técnico e integrando-os diretamente como lançamentos da categoria **"Comissão"** na aba de **Contas a Pagar**, prontos para conferência e quitação.

---

## TEMA 13: Aplicativo Mobile do Técnico (App Duno Nativo & Tech PWA)

**§ 086. Acesso Mobile do Técnico e Arquitetura Offline-First Resiliente:**
O profissional de campo opera através do **App Duno** (aplicativo nativo construído em React Native / Expo em `app/` e `APP Nexus/nexus-mobile/`, além da interface `TechApp.tsx`). Projetado para ambientes reais de manutenção (subsolos, casas de máquinas e zonas rurais sem sinal), o aplicativo conta com o motor `sync-service.ts`: ele baixa as Ordens de Serviço, templates de checklists e estoque para o armazenamento local do aparelho, permitindo que o técnico preencha formulários, tire fotos e colete assinaturas **totalmente offline**, sincronizando tudo automaticamente em segundo plano assim que a conexão retorna.

**§ 087. Tela Inicial do Técnico, Agenda Mobile e Consulta de Maleta de Estoque:**
Ao fazer login no aplicativo, o técnico encontra uma navegação inferior limpa dividida em abas operacionais:
1. **Minhas Atividades / OS (`app/(tabs)/index.tsx`):** lista paginada das Ordens de Serviço atribuídas a ele, destacadas por prioridade e status, com busca rápida e botão de atualização;
2. **Agenda (`app/(tabs)/calendar.tsx`):** visualização cronológica dos compromissos agendados por dia;
3. **Meu Estoque (`app/(tabs)/stock.tsx`):** consulta imediata às peças e quantidades disponíveis na maleta/veículo do próprio técnico.

**§ 088. Fluxo de Deslocamento, Rastreamento GPS, Check-in Automático e Trava Geofencing:**
Ao abrir os detalhes de uma Ordem de Serviço (`app/os/[id].tsx`), o técnico visualiza o endereço do cliente (com botão para abrir rota no Google Maps / Waze), dados dos equipamentos (com aviso se estão na garantia) e histórico de visitas. Ele aciona o botão **"Iniciar Deslocamento"** (que avisa o painel web que ele está a caminho e inicia o cálculo de KM) e, ao chegar ao local, clica em **"Cheguei no Local / Iniciar Atendimento"** (ou tem seu check-in registrado sozinho pelo **Check-in Automático de 50m**, respeitando também a **Trava de Geofencing de 300m** caso ativada pela empresa).

**§ 089. Execução Paginada da OS, Checklists por Equipamento e Ditado por Voz:**
Durante a execução do atendimento (`app/os/execute.tsx`), a interface divide o preenchimento em páginas intuitivas (*Detalhes ➔ Checklists de cada Equipamento ➔ Conclusão/Peças/Mídias ➔ Validação e Assinatura*). O técnico responde aos checklists dinâmicos de cada máquina e conta com suporte a **Entrada de Texto por Voz (`VoiceTextInput`)**, permitindo ditar observações e diagnósticos técnicos falando ao microfone do celular em vez de digitar manualmente.

**§ 090. Captura de Evidências Multimídia em Campo (Fotos Obrigatórias e Vídeo Comprimido):**
Dentro do fluxo de execução mobile, o técnico registra fotos diretamente pela câmera nativa (com compressão inteligente e upload resiliente via `image-service.ts`), adiciona fotos extras à galeria da OS e pode **gravar um Vídeo Técnico de Evidência**. O aplicativo gera automaticamente a miniatura (*thumbnail*) do vídeo, calcula seu tamanho em megabytes e realiza o envio otimizado para o armazenamento em nuvem.

**§ 091. Apontamento de Peças e Leitura de Etiquetas QR Code via Câmera:**
Na seção de peças utilizadas da execução mobile, o técnico pode adicionar materiais consumidos na OS de duas formas: pesquisando na lista do seu estoque ou acionando o **Leitor de QR Code na Câmera do Celular**. Ao apontar a câmera para a etiqueta adesiva da peça, o aplicativo identifica o SKU instantaneamente, solicita a quantidade utilizada, vincula o item à OS e desconta do estoque automaticamente.

**§ 092. Registro de Impedimento em Campo (Bloqueio Justificado):**
Caso o técnico chegue ao endereço e fique impossibilitado de concluir o serviço (por exemplo, responsável ausente, máquina inacessível ou necessidade de peça especial sob encomenda), ele pode acionar o botão **"Registrar Impedimento"**, descrever obrigatoriamente o motivo do bloqueio e anexar foto comprobatória. A OS muda para o status **Impedida**, notificando imediatamente a central de despacho no painel web.

**§ 093. Encerramento do Atendimento — Laudo Técnico e Assinatura Digital na Tela (Canvas):**
Na última etapa da execução mobile, o técnico revisa o resumo do atendimento, preenche o **Laudo Técnico Final**, digita o **Nome Completo e CPF/Documento do Cliente Recebedor** e entrega o celular para o cliente assinar na tela. O modal de **Assinatura Digital (`SignatureScreen`)** gira ou adapta a tela para facilitar o traço com o dedo ou caneta *stylus*, otimiza a imagem da assinatura e finaliza a Ordem de Serviço, sincronizando todos os dados instantaneamente com a matriz.

---

## TEMA 14: Portais Públicos do Cliente (Sem Login) e Integrações Externas (API & Webhooks)

**§ 094. Portal Público de Acompanhamento de Ordem de Serviço (`/order/view/:token`):**
Cada Ordem de Serviço possui um link público único e seguro (`PublicOrderView.tsx`) que pode ser enviado ao cliente via WhatsApp ou e-mail. Ao abrir o link no celular ou computador — **sem precisar de login ou senha** —, o cliente visualiza uma página personalizada com a marca da empresa contendo: status atual da OS em tempo real, técnico designado, linha do tempo de eventos, equipamentos atendidos, checklists respondidos, fotos e vídeos registrados em campo, peças aplicadas, assinatura coletada e botão para **Baixar / Imprimir o Relatório PDF completo**.

**§ 095. Portal Público de Proposta Comercial e Aprovação com Assinatura (`/view-quote/:token`):**
Quando a empresa envia o link público de um orçamento (`PublicQuoteView.tsx`), o cliente final visualiza todos os itens cotados, quantidades, valores (conforme configuração da empresa), descontos, validade e condições de pagamento. Na própria página, o cliente pode clicar em **"Aprovar Orçamento"** — abrindo um quadro para desenhar sua **Assinatura Digital na tela** e informar seu nome e documento — ou clicar em **"Recusar Proposta"** informando o motivo, atualizando o painel comercial da empresa na mesma hora.

**§ 096. Portal Público de Checkout e Pagamento Online (`/checkout/:type/:id`):**
Para faturas, ordens de serviço ou orçamentos faturados, o sistema disponibiliza o **Portal Público de Checkout** (`PublicCheckoutPage.tsx`). Nele, o cliente confere o resumo financeiro da cobrança e realiza o pagamento online escolhendo entre **Pix** (com QR Code na tela, botão "Copiar Código Pix" e verificação automática de pagamento aprovado em tempo real), **Boleto Bancário** (visualização e download do PDF) ou **Cartão de Crédito** (respeitando a trava de número máximo de parcelas definida pela empresa).

**§ 097. Módulo de Integrações — Chaves de API REST (`nx_live_...`) e Rate Limiting:**
No menu **Integrações** (`IntegrationsPage.tsx`), além da aba de conexão com o gateway Asaas, a empresa dispõe da aba **Chaves de API**. O administrador pode gerar tokens de autenticação Bearer com o prefixo `nx_live_` para conectar o Duno a sistemas externos (ERPs como Omie, Bling, TOTVS, SAP ou plataformas de BI). Por segurança padrão *Big Tech*, a chave completa é exibida apenas uma única vez no momento da criação e gravada no banco de dados exclusivamente como **hash criptográfico SHA-256**, contando com proteção de **Rate Limiting (100 requisições por minuto por tenant)** na Edge Function `api_v1`.

**§ 098. Módulo de Integrações — Webhooks de Saída com Assinatura HMAC:**
Na aba **Webhooks** do módulo de Integrações, a empresa pode cadastrar URLs de sistemas externos (como n8n, Make, Zapier ou servidores próprios) para receber notificações ativas em tempo real sempre que ocorrerem eventos no Duno: **`os_created` (OS Criada)**, **`os_updated` (OS Atualizada/Concluída)**, **`quote_approved` (Orçamento Aprovado)** e **`stock_updated` (Estoque Movimentado)**. Cada disparo HTTP inclui um segredo de assinatura **HMAC** no cabeçalho para que o servidor de destino valide a autenticidade da mensagem.

**§ 099. Portal Interno de Documentação Interativa (`DocsPage`) e OpenAPI (Fern):**
Dentro do próprio painel administrativo, o menu **Docs / FAQ** (`DocsPage.tsx`) oferece uma central interativa de aprendizado com barra de busca inteligente tolerante a acentos, filtros por categoria (*Operação*, *Segurança*, *TI & Código*), mapa visual de dependência lógica de implantação e seção de Perguntas Frequentes (FAQ). Para desenvolvedores, o módulo de Integrações também disponibiliza o link direto para a especificação técnica da API REST documentada em padrão **OpenAPI / Fern** (`fern/openapi.yml`).

**§ 100. Fluxo End-to-End Recomendado de Implantação e Maturidade Operacional (As 6 Etapas):**
Para extrair 100% de usabilidade do sistema desde o primeiro dia, a jornada ideal segue **6 etapas sequenciais**:
1. **Parametrização Inicial (`Configurações`):** preencher dados fiscais, subir logotipo, definir metas de SLA (24h/48h), regras do App do Técnico, Geofencing e conectar o WhatsApp Bot;
2. **Governança e Segurança (`Usuários`):** criar os Grupos de Permissão por departamento e cadastrar a equipe administrativa;
3. **Base Territorial e Equipe (`Clientes`, `Técnicos` e `Gestão de Regiões`):** cadastrar clientes (sempre com número de endereço para geocodificação exata), cadastrar técnicos com suas cores e desenhar os polígonos de atuação no mapa;
4. **Inventário e Almoxarifado (`Ativos` e `Estoque`):** vincular os equipamentos/séries aos clientes (com prazos de garantia), cadastrar o catálogo de peças, imprimir etiquetas QR Code e transferir carga para a maleta dos técnicos;
5. **Padronização Técnica (`Formulários`):** construir os checklists digitais com fotos obrigatórias e configurar as Regras de Ativação por Tipo de Serviço e Família de Ativo;
6. **Operação Plena e Escala (`Solicitações`, `Atividade`, `Orçamentos`, `Contratos` e `Financeiro`):** recepcionar demandas via WhatsApp IA, despachar Ordens de Serviço monitoradas por GPS em tempo real, aprovar propostas via link público e faturar automaticamente com Pix, Boleto e NFS-e integrados ao Asaas.

---

## 📊 Quadro Resumo de Módulos e Acessos Rápidos

| # | Módulo / Ambiente | Caminho no Sistema | Público-Alvo | Função Principal |
| :--- | :--- | :--- | :--- | :--- |
| **01** | **Portal Master (SuperAdmin)** | `/<rota-master>` | Proprietário SaaS | Provisionar empresas (Tenants), ativar módulos, comunicados e backups (§008–§013) |
| **02** | **Dashboard** | `/admin` | Gestores / Diretoria | KPIs em tempo real, status de OS, eficiência de SLA 24h/48h e produtividade (§044–§045) |
| **03** | **Duno IA** | `/admin/ai` | Todos os Usuários | Assistente inteligente com consulta a dados reais e leitura de manuais PDF (§067–§068) |
| **04** | **Docs / FAQ** | `/admin/docs` | Todos os Usuários | Documentação interativa do sistema, pipeline de implantação e FAQ (§099) |
| **05** | **WhatsApp Inbox** | `/admin/whatsapp` | Atendimento / SAC | Central multicanal WhatsApp com Bot IA ("Lia") e transbordo humano (§061–§064) |
| **06** | **Solicitações** | `/admin/solicitacoes` | Triagem / Despacho | Caixa de entrada de chamados vindos do WhatsApp com triagem automática (§065–§066) |
| **07** | **Atividade (OS)** | `/admin/orders` | Operação / Despacho | Criação, edição, visitas, checklists, fotos/vídeos, timeline e PDF de OS (§049–§060) |
| **08** | **Agenda** | `/admin/calendar` | Despacho / Coordenação | Calendário diário, semanal e mensal de visitas por técnico (§046) |
| **09** | **Visão de Campo** | `/admin/map` | Logística / Despacho | Mapa GPS em tempo real com posição de técnicos e clientes (§047–§048) |
| **10** | **Financeiro** | `/admin/financial` | Financeiro / Faturamento | Contas a Receber, Faturas Asaas (Pix/Boleto/Cartão), NFS-e, Contas a Pagar, Caixa e Comissões (§076–§085) |
| **11** | **Orçamentos** | `/admin/quotes` | Comercial / Vendas | Propostas comerciais com peças/serviços, link público de aprovação e conversão em OS (§069–§072) |
| **12** | **Estoque** | `/admin/stock` | Almoxarifado | Peças, categorias, etiquetas QR Code, estoque de técnicos, movimentações e balanço (§033–§039) |
| **13** | **Contratos (PMOC)** | `/admin/contracts` | Engenharia / Preventiva | Contratos recorrentes, planos PMOC, faturamento programado e alertas (§073–§075) |
| **14** | **Cliente** | `/admin/customers` | Comercial / Operação | Cadastro de clientes PF/PJ, geocodificação por CEP/número e histórico 360º (§024–§026) |
| **15** | **Ativos** | `/admin/equipments` | Engenharia / Campo | Inventário de equipamentos por cliente, número de série e cálculo de garantia (§031–§032) |
| **16** | **Formulários** | `/admin/forms` | Qualidade / Engenharia | Checklists dinâmicos, tipos de serviço/defeito e regras de ativação automática (§040–§043) |
| **17** | **Técnicos** | `/admin/technicians` | RH / Coordenação | Cadastro de técnicos de campo, especialidades, cores e controle de licenças (§027–§028) |
| **18** | **Gestão de Regiões** | `/admin/regions` | Logística / Operação | Desenho de cercas virtuais (polígonos) no mapa e trava de Geofencing (§029–§030) |
| **19** | **Usuários** | `/admin/users` | Administradores | Grupos de permissão granulares (RBAC), cadastro de operadores e PIN de 6 dígitos (§020–§023) |
| **20** | **Configurações** | `/admin/settings` | Administradores | Dados da empresa, logo, idioma, regras do App do Técnico, SLA e WhatsApp Bot (§014–§019) |
| **21** | **Integrações** | `/admin/integrations` | TI / Financeiro | Conexão Asaas, Chaves de API REST (`nx_live_`) e Webhooks HMAC (§097–§098) |
| **22** | **App Mobile Duno** | App Nativo / Mobile | Técnicos de Campo | Execução offline-first, GPS, checklists, voz, fotos/vídeos, scanner QR Code e assinatura (§086–§093) |
| **23** | **Portais Públicos** | `/order/view`, `/view-quote`, `/checkout` | Cliente Final | Acompanhamento de OS ao vivo, aprovação de orçamento assinada e pagamento online (§094–§096) |
