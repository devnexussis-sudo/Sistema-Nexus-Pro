# -*- coding: utf-8 -*-
"""
Módulo: Parte III-B — Guia Detalhado dos Módulos Web (Comercial, Estoque, Financeiro e Governança: Capítulos 19 a 28)
"""

CONTENT = """## CAPÍTULO 19: CENTRAL DE SOLICITAÇÕES DE ATENDIMENTO (TRIAGEM)

O módulo de Solicitações (`/admin/solicitacoes`) atua como a câmara de triagem para chamados abertos através de canais digitais (como WhatsApp automatizado ou formulários web externos).

### 19.1 Fila de Solicitações Recebidas e Status

Na tela de triagem, as mensagens recebidas são agrupadas nos seguintes status operacionais:
* **Pendente (`PENDING` / Amarelo):** Novo chamado aguardando avaliação do despachante.
* **Aceita (`ACCEPTED` / Azul):** Chamado aprovado que foi transformado em Ordem de Serviço oficial.
* **Resolvida (`RESOLVED` / Verde):** Solicitação atendida remotamente por orientação ao cliente, sem necessidade de deslocamento físico de equipe técnica.
* **Rejeitada (`REJECTED` / Vermelho):** Chamado recusado pela empresa (ex: fora da área de cobertura ou serviço não atendido).

### 19.2 Conversão Direta em Ordem de Serviço

#### Procedimento: Converter Solicitação em Ordem de Serviço
* **Objetivo:** Transformar um pedido de atendimento recebido pelo WhatsApp em uma Ordem de Serviço agendada com um único clique.
* **Onde Acessar:** Menu lateral > **Operação & Atendimento** > **Solicitações** > Clique sobre a solicitação pendente desejada.
* **Pré-requisitos Críticos:** Para que o sistema permita converter a solicitação em OS, o **Cliente** e o **Ativo (Equipamento)** devem estar devidamente identificados ou cadastrados.
* **Passo a Passo:**
  1. Ao abrir os detalhes da solicitação, o sistema exibe os dados coletados pela assistente virtual: nome do solicitante, telefone de WhatsApp, endereço e descrição do problema.
  2. Verifique se o cliente já existe na sua base. Caso o cliente seja novo, clique no botão **"Cadastrar Cliente"** para criar o registro aproveitando os dados do WhatsApp.
  3. Vincule o **Equipamento** correspondente.
  4. Clique no botão azul **"Aceitar e Abrir Ordem de Serviço"**.
  5. O sistema transfere todas as descrições e mídias da solicitação diretamente para o Wizard de Ordem de Serviço.
  6. Defina a prioridade, o agendamento e o técnico responsável.
  7. Confirme a emissão da OS.
* **Resultado Esperado:** A solicitação é marcada como "Aceita", vincula-se ao número da nova OS gerada e sai da fila de pendências de triagem.

### 19.3 Resolução Remota e Rejeição Justificada
* **Para resolver remotamente:** Clique no botão **"Marcar como Resolvido"**, descreva a instrução repassada ao cliente (ex: *"Orientado cliente a religar o disjuntor geral da condensadora; sistema restabelecido normalmente"*).
* **Para rejeitar:** Clique em **"Rejeitar Chamado"** e selecione ou digite a justificativa oficial.

---

## CAPÍTULO 20: WHATSAPP INBOX INTEGRADO E ATENDENTE IA ("LIA")

O módulo de WhatsApp Inbox (`/admin/whatsapp`) é a central omnichannel que unifica o atendimento humano e a inteligência artificial da sua empresa.

### 20.1 Central Omnichannel de Conversas e Mensagens
* Todas as conversas de clientes recebidas no número de WhatsApp corporativo da sua empresa aparecem em uma caixa de entrada unificada.
* O painel exibe a lista de conversas ativas com foto do cliente, última mensagem enviada, horário e selo de status:
  * **"Em Atendimento pela IA" (Roxo):** O cliente está conversando com a inteligência artificial (*Lia*).
  * **"Aguardando Humano" (Laranja Pulsante):** O cliente solicitou falar com uma pessoa ou a IA identificou uma necessidade complexa de negociação.
  * **"Em Atendimento Humano" (Azul):** Um operador da sede assumiu a conversa.

### 20.2 Triagem Automática com IA e Coleta de Dados
A assistente virtual **Lia / Duno IA** atua 24 horas por dia, 7 dias por semana:
* Recepciona educadamente o cliente pelo nome.
* Pergunta qual é o problema ou serviço necessário.
* Solicita o endereço e ponto de referência.
* Pede a marca e o modelo do aparelho ou orienta o cliente a enviar uma foto da etiqueta do equipamento.
* Quando todas as informações essenciais são reunidas, a IA cria automaticamente uma **Solicitação de Atendimento** no módulo correspondente e avisa a equipe do escritório.

### 20.3 Transbordo para Atendimento Humano
Quando o cliente digita frases como *"quero falar com um atendente"*, *"chame uma pessoa"* ou quando há uma reclamação que exige sensibilidade comercial:
* A IA encerra suas respostas automáticas de imediato e emite um alerta sonoro e visual no painel web dos atendentes.
* O operador clica no botão **"Assumir Atendimento"** e passa a dialogar em tempo real com o cliente pelo mesmo número de WhatsApp.
* É possível enviar textos, áudios, imagens, PDFs de orçamentos e comprovantes de faturas diretamente pela interface do Duno.

### 20.4 Reativação do Robô e Envio de Documentos
Ao término do diálogo com o cliente, caso o atendente deseje que novos chamados voltem a ser triados automaticamente pela inteligência artificial, basta clicar no botão superior **"Reiniciar Robô (IA)"**.

---

## CAPÍTULO 21: GESTÃO COMERCIAL — ORÇAMENTOS E PROPOSTAS

O módulo de Orçamentos (`/admin/quotes`) gerencia todo o ciclo de propostas comerciais da empresa, desde a cotação inicial até a aprovação formal pelo cliente.

### 21.1 Criação de Propostas com Peças e Serviços

#### Procedimento: Elaborar um Novo Orçamento Comercial
* **Objetivo:** Montar uma proposta detalhada com serviços de mão de obra e peças de reposição para envio e aprovação do cliente.
* **Onde Acessar:** Menu lateral > **Financeiro & Comercial** > **Orçamentos** > Botão azul **"Novo Orçamento"**.
* **Passo a Passo:**
  1. No modal aberto, na aba **"Dados Gerais"**, selecione o **Cliente**.
  2. Defina a **Data de Validade da Proposta** (ex: 15 dias corridos).
  3. Indique o **Vendedor / Técnico Responsável** pela cotação.
  4. No campo **Descrição dos Serviços**, descreva detalhadamente o escopo técnico do trabalho a ser executado.
  5. Alterne para a aba **"Peças e Serviços"**.
  6. Clique em **"Adicionar Item"** para inserir peças do almoxarifado (com preço de custo e venda já parametrizados) ou serviços de mão de obra.
  7. Informe descontos comerciais ou condições de parcelamento (ex: *Entrada + 2x no cartão*).
  8. Clique em **"Salvar Orçamento"**.
* **Resultado Esperado:** O orçamento é gerado com status "Aberto" e o sistema gera o número oficial da proposta.

### 21.2 Envio por Link Público para Aprovação do Cliente
* No card do orçamento salvo, clique no botão **"Compartilhar Link da Proposta"**.
* O sistema copia um endereço exclusivo (ex: `https://app.duno.com.br/view-quote/4091`).
* Envie esse link para o cliente por WhatsApp ou e-mail.
* **Experiência do Cliente:** O cliente abre a proposta pelo próprio celular. Ele visualiza uma página profissional com o logotipo da sua empresa, a descrição técnica do serviço, a relação de peças e o valor final detalhado.

### 21.3 Assinatura Digital Online e Conversão em OS
* Diretamente na tela do celular, o cliente possui dois botões: **"Aprovar Proposta"** ou **"Recusar Proposta"**.
* Ao clicar em **"Aprovar Proposta"**, o sistema solicita que o cliente digite seu nome, documento e **desenhe sua assinatura com o dedo na tela**.
* **Efeito Imediato no Sistema:** O status do orçamento muda para "Aprovado" no escritório, com a gravação da data, hora e assinatura do cliente.
* **Conversão em Ordem de Serviço:** No painel web, o botão **"Converter em OS"** fica imediatamente disponível. Ao clicar nele, o sistema cria a Ordem de Serviço correspondente com todos os itens do orçamento pré-preenchidos.

---

## CAPÍTULO 22: PEDIDOS DE VENDA (FATURAMENTO DE BALCÃO)

O módulo de Pedidos de Venda (`/admin/sales-orders`) atende à comercialização direta de produtos, peças avulsas e serviços de balcão que não exigem o envio de uma equipe técnica externa a campo.

### 22.1 Criação de Pedidos de Venda Direta
* Indicado para vendas realizadas na sede da empresa (ex: um cliente que compra um controle remoto, um filtro de reposição ou um refil de gás diretamente no balcão da sua loja).
* **Passo a Passo:** Clique em **"Novo Pedido de Venda"**, selecione o cliente, adicione os produtos do almoxarifado, selecione a condição de pagamento e clique em **"Salvar Pedido"**.

### 22.2 Baixa de Estoque e Integração Financeira
* Ao clicar no botão **"Finalizar e Faturar Venda"**:
  1. O sistema dá baixa física imediata no saldo dos itens do almoxarifado central;
  2. O status do pedido muda para **CONCLUÍDO**;
  3. Um lançamento de receita é gerado instantaneamente no módulo financeiro;
  4. O sistema gera o comprovante de venda para impressão térmica ou envio em PDF.

---

## CAPÍTULO 23: ALMOXARIFADO DIGITAL E CONTROLE DE ESTOQUE

O módulo de Estoque (`/admin/stock`) é a estrutura de suprimentos da empresa, dividida entre o Almoxarifado Central e o Estoque Móvel dos Técnicos.

### 23.1 Cadastro de Peças, Insumos e Estoque Mínimo

#### Procedimento: Cadastrar uma Nova Peça no Estoque
* **Onde Acessar:** Menu lateral > **Financeiro & Comercial** > **Estoque** > Botão **"Novo Item"**.
* **Passo a Passo:**
  1. No campo **Código / SKU**, digite a referência técnica da peça (ex: `CAP-45UF-450V`).
  2. No campo **Nome do Item**, descreva a peça claramente (ex: *Capacitor de Partida 45uF 450V*).
  3. Selecione a **Categoria** (ex: *Componentes Elétricos*, *Gases Refrigerantes*, *Filtros*, *Ferramentas*).
  4. Informe a **Unidade de Medida** (UN = Unidade, KG = Quilo, MT = Metro, LT = Litro, CX = Caixa).
  5. Informe o **Preço de Custo (R$)** pago ao fornecedor.
  6. Informe o **Preço de Venda Padrão (R$)** cobrado dos clientes.
  7. No campo **Estoque Mínimo**, defina a quantidade de segurança (ponto de reposição).
  8. Informe a **Localização Física no Almoxarifado** (ex: *Prateleira B, Gaveteiro 04*).
  9. Clique em **"Salvar Item"**.
* **Resultado:** O item entra no catálogo com saldo zero até que uma entrada seja registrada.

### 23.2 Movimentações: Entradas, Saídas e Ajustes
* **Entrada de Mercadorias (Reposição):** Clique no botão **"Entrada de Estoque"**, selecione o item, informe a quantidade comprada, o novo preço de custo e o número da Nota Fiscal de compra. O saldo físico do almoxarifado central é incrementado imediatamente.
* **Saídas por Ordem de Serviço:** São automáticas. Quando um técnico consome uma peça durante um atendimento em campo ou quando a OS é finalizada no escritório, o sistema abate a quantidade do saldo físico e registra o número da OS na rastreabilidade da peça.

### 23.3 Estoque dos Técnicos e Transferências de Peças
Cada veículo de assistência técnica funciona como uma "filial móvel" do almoxarifado.

#### Procedimento: Transferir Peças da Sede para o Carro do Técnico
* **Objetivo:** Abastecer o veículo do técnico com as peças mais utilizadas no dia a dia.
* **Onde Acessar:** Menu lateral > **Estoque** > Botão **"Transferir para Técnico"**.
* **Passo a Passo:**
  1. Selecione o **Técnico de Destino** (ex: *Técnico Carlos — Veículo Fiorino Placa ABC-1234*).
  2. Selecione a **Peça** e informe a **Quantidade Transferida**.
  3. Clique em **"Confirmar Transferência"**.
* **Efeito Operacional:** O saldo da peça é diminuído do Almoxarifado Central e acrescido no **Estoque Móvel do Técnico**. Quando o técnico estiver na rua e utilizar a peça em um cliente, a baixa ocorrerá do estoque do seu próprio carro.

### 23.4 Balanço Físico de Inventário e Auditoria com QR Code
Na aba **"Balanço de Estoque"**, os operadores realizam a contagem periódica do inventário:
* O operador bipar o QR Code da prateleira ou do produto com o leitor óptico.
* Digita a quantidade física encontrada na prateleira.
* O sistema compara a contagem real com o saldo registrado no computador. Havendo divergência, gera o relatório de auditoria e permite o ajuste de inventário mediante justificativa formal registrada no histórico imutável.

---

## CAPÍTULO 24: CONTRATOS RECORRENTES, MANUTENÇÃO PREVENTIVA E PMOC

O módulo de Contratos (`/admin/contracts`) automatiza o gerenciamento de clientes corporativos com contratos de manutenção periódica e atendimento às exigências legais do **PMOC** (Plano de Manutenção, Operação e Controle — Lei Federal 13.589/2018).

### 24.1 Configuração de Contratos Periódicos e PMOC

#### Procedimento: Criar um Novo Contrato Recorrente
* **Onde Acessar:** Menu lateral > **Financeiro & Comercial** > **Contratos** > Botão **"Novo Contrato"**.
* **Passo a Passo:**
  1. Na aba **"Dados Técnicos"**, selecione o **Cliente Contratante**.
  2. Digite o **Título do Contrato** (ex: *Contrato PMOC — Climatização Hospital Central*).
  3. Defina a **Periodicidade da Manutenção**: *Mensal*, *Bimestral*, *Trimestral*, *Semestral* ou *Anual*.
  4. Defina o **Dia Padrão para Execução** da manutenção no mês (ex: todo dia 10).
  5. Selecione o **Técnico ou Equipe Responsável Padrão**.
  6. Alterne para a aba **"Dados Comerciais"**:
     * Digite o **Valor da Mensalidade Recorrente (R$)**;
     * Marque se o contrato **"Inclui Peças de Reposição"** (Sim ou Não);
     * Informe o número de visitas preventivas e corretivas de emergência cobertas na franquia.
  7. Na aba **"Monitoramento e Alertas"**:
     * Configure com quantos dias de antecedência o sistema deve avisar a equipe e gerar automaticamente as ordens de serviço preventivas do próximo mês (ex: 5 dias antes).
  8. Clique em **"Confirmar Contrato"**.

### 24.2 Vínculo de Múltiplos Ativos e Cronograma de Visitas
No mesmo contrato, o gestor marca todos os equipamentos e aparelhos instalados naquele cliente que fazem parte do plano de manutenção (podendo selecionar dezenas de aparelhos de uma só vez).

### 24.3 Geração Automática das Ordens de Serviço Preventivas
Com o contrato ativo, **o gestor não precisa se preocupar em lembrar de abrir chamados preventivos**. Todo mês, no prazo programado, o motor do Duno gera automaticamente a Ordem de Serviço Preventiva contendo todos os equipamentos cobertos e os respectivos checklists técnicos, inserindo a visita na agenda do técnico responsável.

---

## CAPÍTULO 25: GESTÃO FINANCEIRA — CONTAS A RECEBER E FATURAMENTO

O módulo Financeiro (`/admin/financial`) unifica a arrecadação, faturamento e integração com meios de pagamento automatizados.

### 25.1 Faturamento de OS e Orçamentos Aprovados
Na visão de **"Lançamentos a Receber"**:
* O analista visualiza todas as Ordens de Serviço concluídas em campo e orçamentos aprovados que estão aguardando faturamento.
* É possível selecionar atendimentos individualmente ou marcar múltiplos atendimentos do mesmo cliente para emitir uma **Fatura Unificada**.

### 25.2 Gestão de Faturas e Cobrança Integrada (Pix, Boleto, Cartão)
Ao clicar no botão **"Gerar Fatura"**:
* O sistema cria a fatura formal com data de vencimento programada.
* **Integração Gateway Asaas:** O sistema gera automaticamente:
  1. **Linha Digitável e Boleto Bancário Registrado** em PDF;
  2. **Código Pix Copia-e-Cola e QR Code Dinâmico** com baixa automática e instantânea no momento em que o cliente pagar no banco;
  3. **Link de Pagamento por Cartão de Crédito**.
* O cliente recebe a fatura por WhatsApp ou e-mail. Quando ele realiza o pagamento pelo aplicativo do seu banco, o Duno recebe a confirmação em menos de 10 segundos e muda o status da fatura para **"RECEBIDA"** de forma 100% automática, sem que o financeiro precise digitar nada.

### 25.3 Emissão de Recibos de Pagamento e NFS-e
* Para faturas quitadas, o sistema disponibiliza o botão **"Imprimir Recibo"**, gerando comprovante timbrado de quitação.
* Caso habilitada a integração de NFS-e, os dados da fatura são encaminhados para a prefeitura municipal para emissão da Nota Fiscal de Serviços eletrônica.

---

## CAPÍTULO 26: GESTÃO FINANCEIRA — CONTAS A PAGAR, FLUXO DE CAIXA E COMISSÕES

### 26.1 Contas a Pagar e Despesas Operacionais
Na aba **"Contas a Pagar" (`PAYABLES`)**:
* O financeiro cadastra todas as despesas da empresa: boletos de fornecedores de peças, aluguel da sede, combustível das frotas, contas de água/energia e salários.
* É possível anexar o arquivo PDF do boleto e o comprovante de pagamento a cada lançamento para auditoria contábil.

### 26.2 Fluxo de Caixa e DRE Operacional
Na aba **"Fluxo de Caixa" (`CASH_FLOW`)**:
* Gráficos dinâmicos projetam as receitas previstas (faturas a vencer) contra as despesas programadas para os próximos 30, 60 ou 90 dias.
* Permite identificar com antecedência períodos de aperto de liquidez e planejar investimentos da empresa.

### 26.3 Apuração Automática e Quitação de Comissões de Técnicos
Na aba **"Comissões" (`COMMISSIONS`)**:
* O sistema calcula automaticamente o valor exato que cada técnico de campo tem a receber de remuneração variável no período.
* O cálculo considera estritamente as Ordens de Serviço com status "Concluída" em que o cliente já efetuou o pagamento.
* O financeiro pode conferir o extrato detalhado de cada profissional (com a lista de OSs atendidas) e clicar no botão **"Quitar Comissões"**, gerando o recibo de pagamento do colaborador.

---

## CAPÍTULO 27: CONTROLE DE ACESSO, USUÁRIOS E PIN OPERACIONAL

O módulo de Usuários (`/admin/users`) gerencia quem pode entrar no sistema administrativo e o que cada colaborador tem autorização para fazer.

### 27.1 Cadastro de Usuários do Painel Administrativo
* Clique no botão **"Novo Usuário"**, informe o nome completo, o e-mail de acesso corporativo e atribua o grupo de permissão correspondente.

### 27.2 Grupos de Permissão e Níveis de Acesso (RBAC)
Na aba **"Grupos de Permissão"**, o administrador cria perfis customizados com controle granular por módulo:
* Para cada tela do sistema (*Ordens de Serviço*, *Financeiro*, *Estoque*, *Clientes*), é possível marcar separadamente:
  * [x] **Visualizar** (apenas leitura de dados);
  * [x] **Criar** (abertura de novos registros);
  * [x] **Editar** (alteração de cadastros existentes);
  * [x] **Excluir** (remoção definitiva de registros — recomenda-se limitar apenas aos gestores).

### 27.3 Código de Identidade Exclusivo (PIN de 6 Dígitos)
O PIN pessoal de 6 dígitos gerado para cada usuário garante que mesmo em computadores compartilhados da empresa, ações sensíveis (como ajustes de saldo físico de estoque ou concessão de descontos especiais) exijam a confirmação do PIN do operador para registro na linha do tempo.

---

## CAPÍTULO 28: INTEGRAÇÕES OPERACIONAIS, PORTAIS PÚBLICOS E SUPERADMIN

### 28.1 Configuração de Gateway de Pagamento e Webhooks
No menu **Configurações** > **Integrações** (`/admin/integrations`):
* O administrador conecta a conta da empresa ao gateway de pagamentos parceiro (Asaas) informando a Chave de API corporativa.
* O botão **"Sincronizar Webhook"** configura a rota automática para que o sistema receba instantaneamente as confirmações de recebimento de Pix e boletos bancários.

### 28.2 Portais Públicos sem Senha (Acompanhamento e Checkout)
O Duno conta com páginas externas responsivas desenhadas para o consumidor final:
* **Portal de OS Pública (`/order/view/:id`):** O cliente acompanha a chegada do técnico e o laudo de conclusão com fotos;
* **Portal de Orçamento Público (`/view-quote/:id`):** O cliente visualiza a proposta e assina digitalmente no celular;
* **Checkout de Pagamento (`/checkout/:id`):** O cliente efetua o pagamento imediato da sua fatura via Pix dinâmico.

### 28.3 Painel Master de Governança Multi-Empresas e Licenciamento
Exclusivo para diretores de instâncias corporativas (`/master`):
* Gerencia o provisionamento de empresas filiais, cotas de técnicos autorizados e ativação de módulos premium como Duno IA e PMOC.
* Inclui a ferramenta de **Backup Completo**, permitindo exportar todos os cadastros, laudos e fotos da empresa a qualquer momento.

---
"""
