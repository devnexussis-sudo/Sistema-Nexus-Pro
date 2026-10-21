# -*- coding: utf-8 -*-
"""
Módulo: Parte III-A — Guia Detalhado dos Módulos Web (Operação & Atendimento: Capítulos 9 a 18)
"""

CONTENT = """# PARTE III — GUIA DETALHADO DOS MÓDULOS (SISTEMA WEB)

---

## CAPÍTULO 9: PAINEL INICIAL (DASHBOARD OPERACIONAL E MÉTRICAS)

O **Painel Inicial** (`/admin`) é a primeira tela apresentada após o login e funciona como a torre de controle diária para gestores, despachantes e supervisores de campo.

### 9.1 Visão Geral dos Indicadores e Cards Estatísticos

No topo do painel, os cards sintetizam a saúde operacional em tempo real:
* **Total de Atendimentos Ativos:** Contabiliza todas as Ordens de Serviço abertas que demandam atenção da equipe.
* **Ordens Concluídas (Verde):** Quantidade de chamados finalizados com laudo técnico e assinatura dentro do período selecionado.
* **Ordens Em Andamento (Âmbar):** Ordens de serviço em que o técnico já registrou "Cheguei no Local" e o cronômetro de atendimento está correndo.
* **Ordens Atribuídas (Azul):** Ordens agendadas e vinculadas a um técnico específico, aguardando o início do deslocamento.
* **Ordens Pendentes (Cinza/Slate):** Ordens abertas que ainda não foram designadas a nenhum técnico de campo (fila de distribuição).
* **Ordens com Impedimento / Bloqueadas (Vermelho/Rosa):** Atendimentos em que o técnico encontrou algum bloqueio físico ou ausência de responsável no cliente, exigindo intervenção imediata do escritório.
* **Tempo Médio de Atendimento (TMA):** Média de horas e minutos que os técnicos levam desde a chegada ao local até a finalização do serviço.

### 9.2 Monitoramento da Fila de Atendimento e Atrasos em Tempo Real

Abaixo dos cards estatísticos, o painel exibe a régua de **Atrasos e Fila Crítica**:
* O sistema cruza o horário agendado de cada atendimento com o relógio atual do computador.
* Se um atendimento marcado para as 09:00 ainda constar como "Atribuído" ou "Pendente" às 09:30, ele é automaticamente destacado com uma tarja de alerta e o tempo de atraso transcorrido (ex: *"Atrasado há 30 min"*).
* Isso permite ao coordenador remanejar a visita para outro profissional disponível antes que o cliente ligue para reclamar.

### 9.3 Filtros Avançados por Período, Técnico, Cliente e Status

No canto superior direito do Dashboard, a barra de ferramentas permite segmentar os dados:
* **Filtro de Data:** Permite alternar entre *Hoje*, *Esta Semana*, *Este Mês*, *Últimos 30 Dias* ou selecionar um *Intervalo Personalizado*.
* **Base de Data:** Permite filtrar os gráficos pela **Data de Criação**, **Data de Agendamento** ou **Data de Conclusão** da OS.
* **Filtro por Técnico:** Permite isolar os indicadores de produtividade de um técnico específico para avaliação de desempenho.
* **Filtro por Cliente:** Exibe apenas os chamados de uma determinada conta ou contrato corporativo.

---

## CAPÍTULO 10: GESTÃO COMPLETA DE CLIENTES

O módulo de Clientes (`/admin/customers`) centraliza todos os dados de contato, localização e patrimônio técnico das empresas e pessoas físicas atendidas.

### 10.1 Cadastro de Clientes (Pessoa Física e Pessoa Jurídica)

#### Procedimento: Cadastrar um Novo Cliente
* **Objetivo:** Registrar um novo tomador de serviços no sistema para possibilitar a abertura de orçamentos, contratos e ordens de serviço.
* **Onde Acessar:** Menu lateral > **Cadastros & Ativos** > **Clientes** > Botão azul **"Novo Cliente"**.
* **Passo a Passo:**
  1. No modal aberto, na aba **"Dados Cadastrais"**, selecione o tipo de cliente: **Pessoa Jurídica (PJ)** ou **Pessoa Física (PF)**.
  2. Digite o **CNPJ** (para PJ) ou **CPF** (para PF). O sistema formata automaticamente os números e valida a autenticidade do documento.
  3. No caso de PJ, preencha a **Razão Social** e o **Nome Fantasia**. Para PF, preencha o **Nome Completo**.
  4. Informe a **Inscrição Estadual** (caso contribuinte de ICMS) ou **Inscrição Municipal**.
  5. No campo **CEP**, digite o código postal. O sistema realiza a busca automática e preenche de imediato o Logradouro, Bairro, Cidade e Estado.
  6. Digite o **Número** do imóvel e o **Complemento** (ex: *Bloco B, 3º Andar, Sala 304*).
  7. Preencha o **E-mail Principal** para envio automático de laudos e orçamentos.
  8. Informe o **Telefone Fixo** e o **WhatsApp do Cliente** com DDD.
  9. Preencha o campo **Observações Gerais** caso haja instruções de acesso ao local (ex: *"Acesso pela portaria dos fundos; exige capacete e bota de segurança"*).
  10. Clique no botão azul **"Confirmar Cadastro"**.
* **Campos Obrigatórios:** Nome/Razão Social, Documento (CPF/CNPJ), Endereço e ao menos um Telefone ou WhatsApp de contato.
* **Resultado Esperado:** O cliente é gravado na base de dados e imediatamente exibido na listagem com status "Ativo".
* **Como Conferir:** Digite o nome do cliente na barra de pesquisa da tela para localizar o card recém-criado.

### 10.2 Busca Inteligente e Validação Anti-Duplicidade de CPF/CNPJ

O Duno conta com um mecanismo ativo de prevenção de cadastros duplicados:
* Ao digitar um CPF ou CNPJ que já pertence a outro cliente salvo, o sistema exibe imediatamente um alerta visual vermelho: *"Atenção: Já existe um cliente cadastrado com este documento [Nome do Cliente Existente]"*.
* Isso impede que a mesma empresa seja registrada duas vezes com grafias ligeiramente diferentes, o que fragmentaria o histórico de atendimentos e peças.

### 10.3 Gestão de Múltiplos Endereços e Contatos Telefônicos

Para clientes corporativos que possuem diversas filiais, lojas ou galpões atendidos pela sua empresa:
* No card do cliente, você pode cadastrar **Endereços Secundários de Atendimento**, identificando cada um com um apelido claro (ex: *"Filial Shopping Sul"*, *"Galpão Logístico CD2"*).
* Durante a abertura da Ordem de Serviço, o despachante poderá selecionar exatamente qual das unidades receberá a equipe de campo, garantindo que o técnico seja direcionado ao endereço correto pelo GPS.

### 10.4 Consulta ao Histórico Unificado de Atendimentos do Cliente

Ao clicar sobre qualquer cliente na listagem e acessar a aba **"Histórico"**:
* O sistema exibe a linha do tempo completa de todas as Ordens de Serviço já abertas para aquela conta, desde a fundação da empresa.
* É possível filtrar as OS antigas por status (Concluídas, Canceladas), consultar o total financeiro já faturado para o cliente e abrir os relatórios técnicos em PDF emitidos no passado com apenas um clique.

---

## CAPÍTULO 11: GESTÃO DE EQUIPAMENTOS E ATIVOS DOS CLIENTES

O módulo de Ativos (`/admin/equipments`) gerencia o parque de máquinas e aparelhos instalados nos clientes (ex: sistemas de ar condicionado, câmaras frias, geradores, elevadores, compressores).

### 11.1 Cadastro Técnico de Ativos e Vinculação ao Cliente

#### Procedimento: Cadastrar um Novo Ativo
* **Objetivo:** Registrar uma máquina individual com seu número de série exclusivo para permitir o controle de histórico de manutenções por equipamento.
* **Onde Acessar:** Menu lateral > **Cadastros & Ativos** > **Equipamentos** > Botão **"Novo Equipamento"**.
* **Pré-requisitos:** O cliente proprietário do equipamento já deve estar cadastrado.
* **Passo a Passo:**
  1. No campo **Cliente Proprietário**, digite as primeiras letras do nome do cliente e selecione-o na lista suspensa.
  2. No campo **Número de Série (Serial)**, digite o código de identificação único da máquina (obrigatório e exclusivo).
  3. No campo **Modelo**, informe o modelo do fabricante (ex: *Split Inverter 30.000 BTUs*).
  4. Informe a **Marca / Fabricante** (ex: *Carrier, Daikin, Elgin, Schulz*).
  5. Selecione a **Família / Categoria Técnica** correspondente.
  6. Informe a **Capacidade / Potência** (ex: *30.000 BTUs, 15 HP, 250 kVA*).
  7. Selecione a **Tensão Elétrica** (ex: *220V Monofásico, 380V Trifásico, Bivolt*).
  8. No campo **Localização Física no Cliente**, descreva com precisão onde o aparelho está instalado (ex: *Telhado Bloco A - Condensadora 03*, ou *Sala de Servidores TI - Piso 2*).
  9. Informe a **Data de Instalação** e a data de validade da garantia de fábrica.
  10. Clique em **"Salvar Equipamento"**.
* **Resultado Esperado:** O ativo é registrado e associado àquele cliente. A partir desse momento, ele poderá ser selecionado em ordens de serviço e planos de manutenção periódica (PMOC).

### 11.2 Famílias e Categorias de Equipamentos

Na aba **"Famílias de Equipamentos"**, o gestor organiza os ativos em grupos homogêneos (ex: *Chillers*, *Splits*, *Câmaras de Congelamento*, *Fancois*). Essa categorização é vital para o funcionamento do motor de formulários dinâmicos (Capítulo 12), pois permite associar checklists específicos a cada família de equipamento.

### 11.3 Geração e Impressão de Etiquetas com QR Code Patrimonial

Cada equipamento cadastrado recebe automaticamente um **QR Code Único de Identificação Patrimonial**.

#### Procedimento: Imprimir Etiquetas com QR Code
* **Objetivo:** Fixar na carcaça do equipamento uma etiqueta adesiva física para leitura rápida em campo.
* **Onde Acessar:** No card do equipamento desejado, clique no ícone de **"QR Code"** e selecione **"Imprimir Etiqueta"**.
* **Passo a Passo:**
  1. O sistema abre a pré-visualização de impressão da etiqueta, contendo o logotipo da sua empresa, o modelo, o número de série, a localização do ativo e o código QR escaneável.
  2. Selecione a impressora térmica ou padrão desejada e clique em **"Imprimir"**.
* **Utilização Prática pelo Técnico:** Quando o técnico estiver em campo com o celular, basta abrir a câmera do aplicativo Duno e apontar para o QR Code da máquina. O aplicativo identifica o equipamento em menos de 1 segundo, abre a Ordem de Serviço correspondente e carrega o histórico das últimas 5 intervenções feitas naquele aparelho específico.

### 11.4 Consulta ao Histórico Técnico por Número de Série

No modal de detalhes do equipamento, a aba **"Histórico Técnico"** exibe todas as ordens de serviço já realizadas naquele ativo específico, os técnicos que o atenderam, as peças já substituídas nele (com data de troca) e as fotografias registradas nas manutenções anteriores. Isso elimina a dependência da memória dos colaboradores e permite diagnosticar falhas reincidentes com rapidez.

---

## CAPÍTULO 12: MOTOR DE FORMULÁRIOS DINÂMICOS E CHECKLISTS TÉCNICOS

O módulo de Formulários (`/admin/forms`) é um dos diferenciais mais poderosos do Duno. Ele permite criar formulários digitais e checklists de inspeção sob medida para a sua operação, eliminando completamente pranchetas e relatórios de papel.

### 12.1 Criação de Modelos de Formulários e Checklists

#### Procedimento: Montar um Novo Modelo de Checklist
* **Objetivo:** Padronizar os itens que o técnico em campo deve inspecionar, medir e fotografar durante a execução do serviço.
* **Onde Acessar:** Menu lateral > **Cadastros & Ativos** > **Formulários** > Botão **"Novo Modelo"**.
* **Passo a Passo:**
  1. Informe o **Título do Formulário** (ex: *Checklist Preventivo Mensal — Ar Condicionado Split*).
  2. Digite uma **Descrição** orientando o técnico sobre a finalidade da inspeção.
  3. Clique no botão **"Adicionar Campo"** para inserir perguntas ou verificações técnicas.
  4. Para cada campo adicionado, defina o **Rótulo** (a pergunta exibida ao técnico), o **Tipo de Campo** e se o preenchimento é **Obrigatório**.
  5. Utilize as setas de ordenação para organizar a sequência lógica das perguntas (ex: itens da unidade evaporadora primeiro, itens da unidade condensadora depois).
  6. Clique em **"Salvar Modelo"**.

### 12.2 Tipos de Campos Suportados e Condições Lógicas

O motor de formulários do Duno oferece os seguintes tipos de campos:
* **Texto Curto / Texto Longo:** Para descrições de diagnóstico, observações e laudos.
* **Número / Medição Decimal:** Para registro de parâmetros técnicos com unidade de medida (ex: *Tensão de Entrada em Volts*, *Corrente do Compressor em Amperes*, *Pressão de Sucção em PSI*, *Temperatura de Insuflamento em °C*).
* **Seleção Única (Sim / Não / Não se Aplica):** Para perguntas diretas de inspeção (ex: *"Filtro de ar limpo?"*, *"Dreno desobstruído?"*).
* **Múltipla Escolha / Lista Suspensa:** Para escolher opções pré-cadastradas de uma lista padronizada.
* **Fotografia Obrigatória (Câmera):** Força o técnico a tirar uma foto no momento exato da verificação para comprovar o estado do item inspecionado.
* **Assinatura Digital no Campo:** Para validações técnicas que exijam rubrica específica de um supervisor no local.

> 💡 **DICA DE OURO — CAMPOS CONDICIONAIS:** Você pode configurar regras lógicas no formulário. Exemplo: Se o campo *"Vazamento de fluido refrigerante detectado?"* for respondido como **"Sim"**, o sistema abre automaticamente um novo campo obrigatório: *"Onde foi localizado o vazamento e qual a pressão encontrada?"*, acompanhado de uma solicitação de foto do teste de estanqueidade.

### 12.3 Regras de Ativação Automática (Serviço + Família de Ativo)

Na aba **"Regras de Ativação"**, o gestor programa o sistema para vincular checklists automaticamente às ordens de serviço:
* **Exemplo de Regra:** *Sempre que o Tipo de Serviço for "Manutenção Preventiva" E o Equipamento pertencer à Família "Chillers Industriais", o sistema exigirá automaticamente o "Checklist Técnico Completo de Chiller (32 Pontos)"*.
* **Benefício Operacional:** O despachante não precisa se lembrar de escolher formulários manualmente ao abrir a OS. Ao selecionar o serviço e a máquina, o aplicativo do técnico já carrega exatamente o roteiro técnico que deve ser cumprido.

### 12.4 Catálogo de Defeitos e Diagnósticos Padronizados

Na aba **"Tipos de Defeito"**, cadastre a lista oficial de ocorrências técnicas atendidas pela sua empresa (ex: *Código E1 — Falha no Sensor de Temperatura*, *Fuga de Gás por Conexão Frouxa*, *Queima de Capacitor de Partida*, *Obstrução por Sujeira no Condensador*). Isso padroniza os relatórios estatísticos da empresa e impede que técnicos escrevam descrições vagas como *"estava quebrado"*.

---

## CAPÍTULO 13: GESTÃO DE TÉCNICOS E EQUIPES DE CAMPO

O módulo de Técnicos (`/admin/technicians`) gerencia todos os profissionais que atuam na linha de frente executando os atendimentos externos.

### 13.1 Cadastro de Técnicos, Especialidades e Contato

#### Procedimento: Cadastrar um Novo Técnico
* **Objetivo:** Criar o registro do profissional no sistema e habilitar suas credenciais para utilização do aplicativo móvel.
* **Onde Acessar:** Menu lateral > **Cadastros & Ativos** > **Técnicos** > Botão **"Novo Técnico"**.
* **Passo a Passo:**
  1. No campo **Nome Completo**, digite o nome do colaborador (ex: *Roberto Silva Santos*).
  2. No campo **E-mail**, informe o e-mail individual que o técnico utilizará para fazer login no aplicativo do celular.
  3. No campo **Telefone / WhatsApp**, informe o número de celular do aparelho corporativo ou pessoal do técnico.
  4. No campo **Função / Cargo Técnico**, descreva sua especialidade (ex: *Especialista em Refrigeração Industrial*, ou *Técnico Mecânico de Manutenção*).
  5. Selecione a **Foto de Perfil** do profissional. Essa foto será exibida no painel web e também no link público que o cliente recebe por WhatsApp (para que o cliente saiba exatamente quem é o profissional que baterá à sua porta).
  6. Defina o **Status de Acesso**: selecione **"Liberado (App Ativo)"**.
  7. Clique no botão azul **"Confirmar Cadastro"**.
* **Resultado Esperado:** O técnico é salvo na base de dados, seu código único de identificação é gerado automaticamente e suas credenciais passam a ser reconhecidas pelo aplicativo móvel.

### 13.2 Configuração de Vínculo, Código Único e Habilitação do App

* **Código do Técnico (`techCode`):** Código exclusivo alfanumérico gerado pelo sistema (ex: `TEC-042`).
* **Suspensão Temporária de Acesso:** Caso um técnico entre de férias, licença médica ou seja desligado da empresa, o gestor pode alterar o Status de Acesso para **"Suspenso (Bloqueado)"**. Imediatamente, o aplicativo do técnico é deslogado e ele não conseguirá mais visualizar clientes, ordens de serviço nem informações da empresa.

### 13.3 Definição de Comissões e Produtividade

No perfil do técnico, o gestor pode configurar a política de remuneração variável do profissional:
* **Comissão sobre Mão de Obra (%):** Percentual repassado ao técnico sobre o valor dos serviços de cada OS concluída.
* **Comissão sobre Peças / Produtos (%):** Percentual concedido caso o técnico identifique a necessidade e aplique peças em campo.
* O cálculo dessas comissões é apurado de forma automática pelo módulo financeiro (Capítulo 26).

---

## CAPÍTULO 14: GESTÃO DE REGIÕES GEOGRÁFICAS E GEOFENCING

O módulo de Gestão de Regiões (`/admin/regions`) permite desenhar no mapa áreas delimitadas de atuação operacional (*Geofencing*).

### 14.1 Delimitação de Áreas de Atendimento no Mapa

#### Procedimento: Criar uma Nova Região Operacional
* **Objetivo:** Definir zonas geográficas de atendimento (ex: *Zona Norte*, *Centro Expandido*, *Região Metropolitana*) para automatizar a distribuição de técnicos e calcular taxas de deslocamento.
* **Onde Acessar:** Menu lateral > **Cadastros & Ativos** > **Gestão de Regiões** > Botão **"Nova Região"**.
* **Passo a Passo:**
  1. Digite o **Nome da Região** (ex: *Zona Leste e ABC Paulista*).
  2. Escolha uma **Cor de Identificação** no seletor para destacar a área no mapa.
  3. No mapa interativo exibido na tela, utilize a ferramenta de desenho de polígono: clique sobre os limites dos bairros ou cidades para desenhar o contorno geográfico da sua área de cobertura.
  4. Feche o polígono clicando sobre o ponto inicial.
  5. Selecione quais **Técnicos Preferenciais** atendem prioritariamente aquela região.
  6. Defina a **Taxa Padrão de Deslocamento** cobrada para atendimentos dentro daquela zona (ex: *R$ 80,00*).
  7. Clique em **"Salvar Região"**.
* **Resultado Esperado:** A região fica gravada no mapa vetorial do sistema.

### 14.2 Atribuição de Técnicos por Região e Taxas de Deslocamento

* **Sugestão Inteligente de Técnico:** Durante a abertura de uma nova Ordem de Serviço, ao informar o endereço do cliente, o sistema identifica instantaneamente em qual polígono regional o imóvel se encontra e sugere aos despachantes apenas os técnicos que atuam naquela zona geográfica.
* **Taxa de Deslocamento Automática:** O valor da taxa de deslocamento previamente cadastrado para aquela região é inserido automaticamente na composição financeira da OS, evitando que o atendente se esqueça de cobrar o deslocamento.

---

## CAPÍTULO 15: CENTRAL DE ORDENS DE SERVIÇO — ABERTURA E EMISSÃO

O módulo de Ordens de Serviço (`/admin/orders`) é o coração operacional do Duno. A emissão de novos atendimentos é conduzida por um **Wizard Inteligente em 5 Etapas**, desenhado para garantir que nenhuma informação essencial seja esquecida.

### 15.1 O Wizard de Emissão de OS em 5 Etapas

Para iniciar um novo atendimento, clique no botão azul **"Nova Ordem de Serviço"** no canto superior direito do painel. Uma janela modal estruturada se abrirá com a barra de progresso visual (Etapas 1 a 5).

### 15.2 Etapa 1: Identificação do Cliente ou Busca por Serial

Nesta primeira etapa, defina para quem o serviço será prestado:
* **Modo "Por Cliente":** Digite o nome ou documento do cliente no campo de busca. À medida que digita, a lista suspensa exibe os clientes correspondentes. Ao selecionar o cliente desejado, o sistema carrega automaticamente o endereço principal, o telefone de contato e a lista de equipamentos que pertencem àquela conta.
* **Modo "Por Serial do Equipamento":** Se o cliente estiver ligando com a etiqueta do equipamento em mãos, alterne para o modo "Por Serial" e digite o número de série da máquina. O sistema localiza o equipamento no cadastro, identifica quem é o proprietário e preenche os dados do cliente de forma automática.

### 15.3 Etapa 2: Programação, Defeito Relatado, Prioridade e Técnico

Nesta etapa, informe os detalhes do problema e o planejamento da visita:
* **Título do Atendimento:** Descrição curta e objetiva da tarefa (ex: *"Manutenção Corretiva — Câmara Fría Não Atinge Temperatura"*).
* **Tipo de Atendimento / Operação:** Selecione a modalidade do serviço (*Corretiva Emergencial*, *Preventiva Contratual*, *Instalação de Novo Equipamento*, *Vistoria Técnica / Orçamento* ou *Garantia*).
* **Prioridade Operacional:** Selecione entre *Baixa*, *Média*, *Alta* ou *Urgente (Emergência)*. O sistema ajusta o prazo de SLA automaticamente de acordo com as regras configuradas na empresa.
* **Descrição do Defeito Relatado:** Detalhe minuciosamente o que o cliente relatou ao telefone ou no WhatsApp (ex: *"Cliente informa que o compressor arma por 3 minutos e desarma pelo relé térmico com barulho anormal. Temperatura interna subiu para +12°C"*).
* **Data e Horário Agendado:** Selecione o dia da visita e a faixa de horário prevista (ex: *22/10/2026 às 14:00*).
* **Técnico Responsável:** Selecione qual profissional executará o chamado. O sistema exibe indicadores visuais ao lado de cada técnico informando se ele já possui outros atendimentos agendados para o mesmo dia e se atende a região geográfica do cliente. Caso queira deixar para despachar depois, mantenha o campo vazio (a OS entrará como "Pendente").

### 15.4 Etapa 3: Definição do Escopo Operacional, Peças e Serviços

Nesta etapa, indique previamente quais serviços serão executados e quais peças devem ser separadas:
* **Inclusão de Serviços:** Selecione serviços do catálogo (ex: *"Higienização Completa de Sistema"*, *"Carga de Gás R-410A"*, *"Substituição de Válvula de Expansão"*), definindo o valor unitário da mão de obra.
* **Reserva de Peças no Almoxarifado Central:** Digite o nome ou código da peça no campo de busca do estoque. O sistema exibe o saldo físico disponível em tempo real. Ao adicionar a peça à OS, ela entra imediatamente em estado de **reserva**, impedindo que outro operador venda ou transfira a mesma peça.

### 15.5 Etapa 4: Composição de Valores, Custos e Condições Comerciais

Nesta etapa, configure os aspectos financeiros do atendimento:
* **Composição de Totais:** O sistema soma automaticamente: *Valor dos Serviços (Mão de Obra)* + *Valor Total das Peças* + *Taxa de Deslocamento*.
* **Descontos:** Se concedido desconto comercial, informe o valor em Reais (R$) ou percentual (%).
* **Forma de Cobrança / Faturamento:** Defina se o atendimento será:
  * *Faturado pelo Escritório* (emissão posterior de boleto ou Pix via Asaas);
  * *Cobrado no Local pelo Técnico* (recebimento em dinheiro, cartão ou Pix imediato);
  * *Coberto por Contrato Mensal / Garantia* (sem cobrança adicional ao cliente).
* **Vincular Orçamentos:** Caso este chamado tenha se originado de uma proposta previamente aprovada, vincule o número do orçamento para manter a rastreabilidade financeira unificada.

### 15.6 Etapa 5: Resumo do Protocolo e Emissão do Código Oficial

A última etapa exibe o resumo completo de todos os dados preenchidos:
1. Confira o cliente, o endereço de atendimento, o equipamento vinculado, o defeito relatado, o técnico designado e o valor total estimado.
2. Clique no botão verde **"Confirmar e Gerar Ordem de Serviço"**.
3. **Resultado Imediato:** O sistema gera o número oficial de protocolo imutável (ex: `#OS-10492`), grava o registro na base operacional e envia uma notificação push imediata para o celular do técnico designado.

---

## CAPÍTULO 16: GESTÃO DA ORDEM DE SERVIÇO — AS 10 ABAS DO PAINEL OPERACIONAL

Ao clicar sobre qualquer Ordem de Serviço na listagem do painel administrativo, abre-se a gaveta detalhada de visualização dividida em **10 abas operacionais especializadas**:

### 16.1 Aba 1: Visão Geral do Atendimento
Apresenta o raio-X completo do chamado: cabeçalho com o status atual (Pendente, Atribuído, Em Deslocamento, Em Andamento, Concluído, Impedido, Cancelado), dados do cliente com botão direto para rota no Waze/Google Maps, técnico responsável, data de criação, agendamento, SLA e resumo do defeito relatado.

### 16.2 Aba 2: Anotações Internas e Comunicação Confidencial
Espaço destinado a notas e orientações operacionais entre a equipe da sede (despachantes, supervisores e diretoria). **Essas anotações são terminantemente confidenciais** e nunca aparecem no relatório em PDF entregue ao cliente nem no link público de acompanhamento.

### 16.3 Aba 3: Ativos e Equipamentos Vinculados
Exibe a ficha técnica de todos os aparelhos cobertos por esta Ordem de Serviço: modelo, marca, número de série, localização física no cliente, histórico recente de intervenções e link direto para a etiqueta QR Code.

### 16.4 Aba 4: Formulários Técnicos e Respostas de Checklists
Apresenta as respostas preenchidas pelo técnico em campo nos checklists obrigatórios: medições elétricas e mecânicas, testes de vazamento, respostas de conformidade e as fotos vinculadas a cada item individual do questionário.

### 16.5 Aba 5: Execução Técnica, Laudo e Recomendações
Exibe o **Laudo Técnico Pericial** redigido pelo especialista de campo ao término do serviço. Detalha a causa raiz da falha encontrada, os procedimentos corretivos adotados, peças que foram substituídas e as **Recomendações Técnicas Preventivas** ao cliente para evitar novas ocorrências.

### 16.6 Aba 6: Mídias, Fotografias de Antes/Depois e Evidências
Galeria de alta resolução contendo todas as fotografias e pequenos vídeos capturados pelo técnico através do aplicativo do celular durante a visita. As imagens exibem marca d'água automática com data, hora e coordenadas geográficas, comprovando a autenticidade do serviço prestado. Clicando sobre qualquer foto, o gestor pode visualizá-la em tela cheia com zoom detalhado.

### 16.7 Aba 7: Linha do Tempo e Auditoria Operacional Imutável
Histórico cronológico e inviolável de cada segundo da vida da Ordem de Serviço:
* *10:14 — OS Criada pelo operador Carlos Eduardo;*
* *10:20 — OS Atribuída ao técnico Roberto Silva;*
* *11:05 — Técnico Roberto Silva iniciou deslocamento (GPS: -23.5505, -46.6333);*
* *11:32 — Técnico registrou chegada no cliente (Início do Atendimento);*
* *12:45 — Checklists técnicos preenchidos e 6 fotografias anexadas;*
* *13:10 — Atendimento finalizado com assinatura do cliente Marcos Souza (Doc: 341.***.***-09).*

### 16.8 Aba 8: Composição de Custos, Peças e Margem
Detalhamento financeiro analítico do atendimento: valor faturado ao cliente, custo real das peças retiradas do almoxarifado, custo do deslocamento, comissão apurada do técnico e a **Margem de Contribuição Bruta** obtida pela empresa naquele serviço específico.

### 16.9 Aba 9: Histórico e Gerenciamento de Visitas e Retornos
Muitas manutenções complexas exigem mais de uma visita técnica (ex: Visita 1 para diagnóstico inicial; Visita 2 para troca de peça encomendada de fábrica). Esta aba gerencia o histórico de todas as visitas realizadas na mesma OS, permitindo agendar um **Retorno Técnico** vinculado ao mesmo protocolo principal sem duplicar a ordem de serviço.

### 16.10 Aba 10: Histórico de Impedimentos e Bloqueios
Quando o técnico vai a campo e não consegue executar o serviço por motivo alheio à sua vontade (ex: *Portaria do prédio não autorizou entrada de prestador*, *Cliente viajou e esqueceu a chave*, *Falta de energia elétrica no galpão* ou *Máquina em local de altura sem andaime adequado*):
* Esta aba registra o histórico oficial do impedimento, incluindo o motivo detalhado, a fotografia da fachada do cliente comprovando que o técnico compareceu no local e a assinatura do porteiro ou preposto que barrou o acesso.

### 16.11 Emissão e Impressão do Laudo Técnico Oficial em PDF
No cabeçalho da gaveta da OS, o botão **"Imprimir / PDF"** gera instantaneamente o documento oficial da Ordem de Serviço, diagramado com a marca da sua empresa, dados do cliente, descrição técnica do serviço, tabelas de peças, respostas do checklist, fotos de evidência e as assinaturas digitais coletadas. O PDF pode ser salvo no computador ou enviado por e-mail com um clique.

### 16.12 Compartilhamento de Link Público de Acompanhamento
O botão **"Copiar Link Público"** gera um endereço web seguro e exclusivo para aquele atendimento (ex: `https://app.duno.com.br/order/view/10492`). Ao enviar esse link para o WhatsApp do cliente, ele poderá acompanhar em tempo real se o técnico já está a caminho, o horário previsto de chegada e, ao término, visualizar o laudo final sem precisar de nenhuma senha de acesso.

---

## CAPÍTULO 17: AGENDA E CALENDÁRIO DE ATENDIMENTOS

O módulo de Agenda (`/admin/calendar`) oferece uma visualização espacial e temporal de toda a grade de visitas da empresa.

### 17.1 Visualização em Grade Mensal, Semanal e Diária
* **Visão Mensal:** Apresenta a densidade de atendimentos ao longo do mês, permitindo planejar plantões e identificar dias de sobrecarga ou ociosidade.
* **Visão Semanal e Diária:** Exibe a grade horária (das 07:00 às 20:00), com colunas dedicadas a cada técnico de campo. As ordens de serviço aparecem como blocos coloridos de acordo com a prioridade e o status.

### 17.2 Distribuição de Atendimentos e Prevenção de Conflitos
* **Filtros por Profissional:** O despachante pode filtrar a visualização por um único técnico ou por equipes inteiras de uma determinada região.
* **Prevenção de Sobreposição:** O sistema avisa visualmente caso o despachante tente agendar dois atendimentos no mesmo horário para o mesmo técnico em endereços distantes, evitando atrasos previsíveis.

---

## CAPÍTULO 18: VISÃO DE CAMPO E MONITORAMENTO GPS (DUNO MAPS)

O módulo de Visão de Campo (`/admin/map`) integra mapas geográficos interativos para dar visibilidade total sobre o paradeiro e o deslocamento das equipes externas.

### 18.1 Mapa Interativo em Tempo Real de Técnicos e OS
* O mapa exibe marcadores coloridos diferenciados:
  * **Ícones de Técnicos:** Indicam a posição exata de cada profissional de campo através do sinal GPS transmitido pelo aplicativo móvel.
  * **Ícones de Ordens de Serviço:** Indicam os endereços dos clientes onde há atendimentos programados para o dia.
* **Camadas de Visualização:** O operador pode alternar entre a visão de **Mapa Vetorial (Ruas)** e a visão de **Satélite em Alta Resolução**, útil para visualizar telhados, galpões e acessos industriais.

### 18.2 Identificação de Status de Movimentação e Rotas
* **Em Movimento (Verde com Pulso):** Indica que o técnico está em trânsito no veículo em direção a um atendimento (velocidade acima de 10 km/h).
* **Parado no Cliente (Azul):** Indica que o técnico está fisicamente no endereço do cliente com atendimento em andamento.
* **Última Localização Registrada:** Ao clicar sobre o marcador de qualquer técnico, o painel exibe o nome do profissional, seu número de WhatsApp com atalho para conversa direta, a bateria do celular, a última vez que o sinal foi atualizado e a Ordem de Serviço que ele está executando no momento.

---
"""
