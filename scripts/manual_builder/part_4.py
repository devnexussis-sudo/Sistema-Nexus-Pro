# -*- coding: utf-8 -*-
"""
Módulo: Parte IV — Manual Completo do Aplicativo Móvel do Técnico (Duno App & Tech PWA)
"""

CONTENT = """# PARTE IV — MANUAL DO APLICATIVO MÓVEL DO TÉCNICO (DUNO APP & TECH PWA)

---

## CAPÍTULO 29: INSTALAÇÃO, PRIMEIRO ACESSO E AUTENTICAÇÃO

O **Aplicativo Móvel Duno** é o companheiro diário do técnico em campo. Desenvolvido com tecnologia de ponta para smartphones Android e iOS, o app foi projetado para operar com rapidez, consumo mínimo de bateria e total resiliência quando não houver sinal de internet.

### 29.1 Instalação no Smartphone e Acesso PWA

Existem duas formas oficiais de operar o Duno no smartphone:

1. **Aplicativo Nativo (Instalação via APK / Loja Corporativa):**
   * Receba o link oficial de instalação disponibilizado pelo administrador da sua empresa.
   * No Android: baixe o arquivo de instalação (`.apk`), abra as notificações e toque em **"Instalar"**. Caso o sistema solicite, autorize a instalação de fontes confiáveis.
   * Ao abrir o aplicativo pela primeira vez, o sistema solicitará permissões essenciais de aparelho:
     * **Câmera:** Obrigatória para fotografar evidências de manutenção e ler QR Codes de equipamentos;
     * **Localização (GPS):** Obrigatória para registrar o início de deslocamento e comprovar o comparecimento no endereço do cliente;
     * **Armazenamento / Fotos:** Necessário para salvar fotos em cache offline quando não houver internet.
     * Toque em **"Permitir Durante o Uso do App"** em todas as solicitações.

2. **Aplicativo Web Progressivo (Tech PWA — Acesso sem Instalação):**
   * Caso prefira ou utilize um aparelho alternativo, abra o navegador do celular (Google Chrome no Android ou Safari no iPhone) e acesse o endereço web corporativo informado pelo escritório.
   * No menu do navegador, toque em **"Adicionar à Tela de Início"** (ou *"Instalar Aplicativo"*).
   * O ícone do Duno surgirá na grade de aplicativos do seu celular como se fosse um app instalado.

---

### 29.2 Login do Técnico, PIN de Identificação e Termos de Uso

#### Procedimento: Efetuar Primeiro Login no Aplicativo
* **Objetivo:** Autenticar o profissional no dispositivo móvel e descarregar a escala de atendimentos do dia.
* **Onde Acessar:** Tela inicial do App Duno no smartphone.
* **Pré-requisitos:** O técnico deve ter sido previamente cadastrado no módulo administrativo web com e-mail corporativo e status "Liberado".
* **Passo a Passo:**
  1. Digite seu **E-mail Corporativo** cadastrado pelo escritório.
  2. Digite sua **Senha de Acesso**.
  3. Marque a caixa de seleção **"Manter Conectado"** para que você não precise digitar sua senha novamente toda vez que abrir o aplicativo.
  4. Caso seja o seu primeiro acesso, o aplicativo exibirá a janela modal dos **Termos de Uso e Política de Privacidade**. Role o texto até o fim e toque em **"Li e Concordo com os Termos"**.
  5. Toque no botão azul **"Entrar"**.
* **Resultado Esperado:** O aplicativo valida as credenciais, descarrega suas configurações de perfil e exibe a tela principal com a lista de Ordens de Serviço do dia.
* **PIN de Identificação:** No rodapé do seu perfil, localize o seu **PIN de 6 Dígitos** (ex: `PIN: 582194`). Memorize este código, pois ele poderá ser solicitado para confirmar baixas rápidas de estoque ou assinar relatórios operacionais.

---

## CAPÍTULO 30: INTERFACE DO APP E FEED DIÁRIO DE ATENDIMENTOS

### 30.1 Telas Principais e Navegação por Abas

Na barra de navegação inferior do aplicativo móvel, o técnico encontra 5 abas principais:
1. **Início (Ícone de Prancheta):** Feed diário com todas as Ordens de Serviço atribuídas a você para o dia de hoje, organizadas por horário e prioridade.
2. **Agenda (Ícone de Calendário):** Visão mensal e semanal da sua escala de atendimentos programados para os próximos dias.
3. **Estoque (Ícone de Caixa):** Consulta em tempo real do saldo de peças e insumos que estão dentro do seu próprio veículo.
4. **Duno IA (Ícone de Robô):** Assistente técnico com inteligência artificial para consulta rápida de manuais de equipamentos, testes de sensores e códigos de erro de máquinas em campo.
5. **Perfil (Ícone de Engrenagem / Usuário):** Seus dados profissionais, foto de avatar, status de sincronização de rede (*Smart Sync Monitor*) e botão de encerramento de sessão.

---

### 30.2 Leitura dos Cards de Ordens de Serviço

Cada atendimento na tela inicial é exibido em um **Card Operacional Inteligente**:
* **Tarja de Prioridade:**
  * **Vermelho (Urgente):** Chamados críticos que exigem atendimento imediato;
  * **Laranja (Alta):** Chamados de clientes com contrato prioritário;
  * **Azul (Média):** Chamados corretivos padrão;
  * **Verde / Cinza (Baixa):** Vistorias e preventivas de rotina.
* **Número do Protocolo:** Código identificador exclusivo (ex: `#OS-10492`).
* **Nome do Cliente:** Razão social ou nome completo do cliente em destaque.
* **Endereço Completo:** Rua, número, bairro e complementos de acesso.
* **Horário Agendado:** Dia e faixa de horário em que o cliente está aguardando a chegada da equipe (ex: *Hoje às 14:00*).
* **Tipo de Atendimento:** Etiqueta azul indicando se o serviço é *Corretiva*, *Preventiva*, *Instalação* ou *Garantia*.
* **Defeito Relatado:** Etiqueta amarela sintetizando o problema que o cliente descreveu.

---

### 30.3 Contato Rápido com o Cliente via WhatsApp

No rodapé de cada card de atendimento, há um botão verde com o ícone do **WhatsApp**:
* Ao tocar neste botão, o Duno abre instantaneamente o aplicativo do WhatsApp no seu celular com uma conversa direta iniciada com o número do cliente cadastrado.
* Uma mensagem inicial padronizada é sugerida (ex: *"Olá, sou o técnico Roberto da empresa Duno. Estou com o seu atendimento #OS-10492 agendado para hoje. Gostaria de confirmar se há alguém no local para nos receber"*).
* Isso evita viagens perdidas e reduz significativamente os casos de clientes ausentes.

---

## CAPÍTULO 31: DESLOCAMENTO, CHEGADA E REGISTRO DE IMPEDIMENTOS

Ao tocar sobre qualquer card de atendimento no feed, abre-se a **Tela de Detalhes da Ordem de Serviço**.

### 31.1 Abertura de Rota no GPS (Google Maps / Waze)

Ao lado do endereço do cliente, toque no botão azul **"GPS"**:
* O aplicativo pergunta se você deseja abrir a rota no **Waze** ou no **Google Maps**.
* O destino exato do cliente já é inserido no navegador de trânsito, calculando a melhor rota com base no congestionamento da cidade.

---

### 31.2 Registro de "Iniciar Deslocamento" e "Cheguei no Local"

O Duno audita com precisão os tempos e distâncias da sua jornada de trabalho através de dois botões sequenciais:

#### 1. Botão "Iniciar Deslocamento" (Amarelo):
* **Quando Tocar:** No exato momento em que você entrar no veículo e começar a dirigir em direção ao cliente.
* **Efeito no Sistema:**
  * O status da OS muda imediatamente para **"EM DESLOCAMENTO"**;
  * O escritório central é avisado de que você está a caminho;
  * O cliente que estiver acompanhando pelo link público visualiza que a equipe técnica já partiu;
  * O GPS registra o horário exato de partida e suas coordenadas geográficas.

#### 2. Botão "Cheguei no Local" / "Iniciar Atendimento" (Verde):
* **Quando Tocar:** Quando você estacionar o veículo no cliente e entrar na recepção ou portaria.
* **Efeito no Sistema:**
  * O status da OS muda para **"EM ANDAMENTO"**;
  * O relógio de tempo de atendimento em tempo real começa a contar no seu celular e na tela do escritório;
  * O sistema grava o check-in presencial georreferenciado;
  * A tela é automaticamente direcionada para o **Modo de Execução Técnica Guiada**.

---

### 31.3 Registro de Impedimento com Fotos e Testemunha

Caso você compareça ao local e **não consiga realizar o serviço** (por motivos como: *Cliente ausente e ninguém atende a porta*, *Falta de energia elétrica no galpão*, *Portaria não tem autorização para liberar entrada de terceiros* ou *Equipamento em altura de 6 metros sem andaime disponível*):

#### Procedimento: Registrar um Impedimento Operacional
1. Na tela de detalhes da OS, toque no botão vermelho **"Registrar Impedimento"**.
2. No campo **Motivo do Impedimento**, selecione a categoria correspondente e detalhe a situação ocorrida.
3. No campo **Fotografia Comprobatória (Obrigatória)**, toque no ícone de câmera e tire no mínimo uma foto da fachada do imóvel ou da portaria com a placa de identificação, comprovando que você esteve presente no endereço.
4. Caso haja um porteiro ou preposto no local que se recusou a liberar a entrada, peça para ele informar o nome legível e **desenhar sua assinatura na tela** como testemunha da recusa.
5. Toque em **"Confirmar Impedimento"**.
* **Resultado:** O chamado muda para o status **"IMPEDIDO"**, a sede é alertada com uma notificação urgente para entrar em contato com a diretoria do cliente e reagendar a visita, e você fica livre para partir para o próximo chamado sem ser penalizado por atraso de SLA.

---

## CAPÍTULO 32: EXECUÇÃO TÉCNICA GUIADA DA ORDEM DE SERVIÇO

Ao tocar em "Iniciar Atendimento", o aplicativo abre a esteira de execução dividida em páginas sequenciais numeradas no topo da tela (ex: *Etapa 1 de 4*).

### 32.1 O Fluxo de Execução Passo a Passo no Celular
A esteira segue uma ordem lógica e intuitiva:
* **Página 1:** Dados Gerais do Atendimento e resumo do defeito relatado;
* **Página 2 (quando aplicável):** Lançamento de Peças e Insumos consumidos do seu veículo;
* **Páginas Intermediárias:** Checklists técnicos e inspeção obrigatória por equipamento;
* **Penúltima Página:** Laudo Técnico Pericial e Fotos de Conclusão;
* **Última Página:** Validação com o Cliente e Coleta das Assinaturas Digitais.

---

### 32.2 Preenchimento Obrigatório de Checklists por Ativo

Para cada máquina coberta pelo atendimento, o Duno apresenta o checklist específico daquele tipo de aparelho:
* **Medições Técnicas:** Digite os valores medidos nos instrumentos (ex: Tensão, Corrente, Pressão em PSI, Temperatura). O sistema valida se o valor digitado faz sentido físico.
* **Inspeções de Conformidade:** Toque nas opções correspondentes (*Conforme*, *Não Conforme*, *Ajustado no Local*).
* **Campos Obrigatórios com Trava:** Se uma pergunta tiver um asterisco vermelho (`*`), o aplicativo não permitirá avançar para a próxima página enquanto o campo não for respondido.
* **Fotos de Item Específico:** Se a verificação exigir comprovação (ex: *"Foto da placa de identificação da máquina"* ou *"Foto do teste de queima de óleo"*), toque no botão de câmera integrado ao lado da pergunta e capture a imagem na hora.

---

### 32.3 Lançamento de Peças e Insumos do Estoque do Carro

Se durante a manutenção você precisar substituir um componente (ex: um capacitor queimado ou uma correia partida):
1. Na página de Peças e Serviços, toque no botão **"Adicionar Peça do Meu Estoque"**.
2. Digite o nome da peça. O aplicativo exibe apenas os itens que você possui fisicamente dentro do seu veículo no momento, acompanhados da quantidade disponível.
3. Selecione o item e informe a quantidade aplicada (ex: *1 UN*).
4. **Baixa Automática:** Ao salvar, o saldo da peça é diminuído imediatamente do estoque do seu carro, garantindo que o almoxarifado saiba exatamente o que precisa ser reposto no final do dia.

---

### 32.4 Registro Fotográfico e em Vídeo das Evidências

O Duno adota a política de "serviço comprovado":
* Na página de conclusão técnica, toque em **"Adicionar Fotos do Serviço"**.
* A câmera nativa abre com foco automático e estabilização.
* Fotografe a máquina limpa, montada e em funcionamento pleno.
* As fotos são compactadas de forma inteligente para não consumir seu pacote de dados 4G, mantendo nitidez perfeita para zoom.
* Cada foto recebe uma chancela invisível de autenticidade contendo a data, hora e as coordenadas de latitude/longitude onde a foto foi batida.

---

### 32.5 Redação do Laudo Técnico Pericial e Recomendações

No campo **Laudo Técnico Descritivo**:
* Utilize o teclado do smartphone ou o recurso de **Digitação por Voz (Microfone)** para ditar o laudo com naturalidade.
* Descreva com rigor profissional:
  1. O que foi inspecionado;
  2. A causa que provocou o problema;
  3. A solução técnica aplicada;
  4. O estado final de operação em que o sistema foi entregue.
* No campo **Recomendações ao Cliente**, registre orientações preventivas importantes (ex: *"Recomenda-se manter a porta da câmara frigorífica fechada durante os horários de pico e programar a limpeza semestral dos filtros"*). Essas recomendações protegem sua empresa contra reclamações indevidas no futuro.

---

## CAPÍTULO 33: VALIDAÇÃO, ASSINATURAS DIGITAIS E ENCERRAMENTO

A última página da esteira de execução é a mais importante do atendimento, pois confere validade jurídica e comercial ao serviço executado.

### 33.1 Conferência dos Dados com o Responsável no Local
1. Chame o responsável pelo estabelecimento, gerente ou proprietário para acompanhar a entrega do serviço.
2. Mostre na tela do celular o resumo do laudo, as fotos de antes e depois e as peças que foram aplicadas.
3. No campo **Nome do Responsável no Local**, digite o nome completo da pessoa que está recebendo a entrega técnica.
4. No campo **Documento (CPF ou RG)**, informe os dígitos do documento de identificação do recebedor.

---

### 33.2 Coleta da Assinatura Digital do Cliente na Tela
1. Toque no botão azul **"Coletar Assinatura do Cliente"**.
2. Uma tela em branco em modo paisagem se abrirá no smartphone.
3. Entregue o aparelho para que o cliente **desenhe sua assinatura oficial utilizando a ponta do dedo ou uma caneta touch**.
4. Caso o cliente erre o traço, toque em **"Limpar"** para permitir nova tentativa.
5. Estando a assinatura legível, toque em **"Confirmar Assinatura"**.
* A assinatura é convertida em um vetor digital seguro e carimbada com o nome e documento da pessoa.

---

### 33.3 Assinatura do Técnico e Botão Finalizar Atendimento
1. No campo abaixo, o próprio técnico desenha sua rubrica profissional.
2. Toque no grande botão verde **"Finalizar Atendimento"**.
3. O aplicativo exibe uma mensagem de confirmação: *"Deseja realmente concluir a Ordem de Serviço #OS-10492?"*. Toque em **"Sim, Concluir"**.
* **Efeito Imediato:** O cronômetro de atendimento é travado, o status da OS passa para **"CONCLUÍDA"** em todo o sistema, o laudo técnico em PDF oficial é montado na hora e uma cópia é disparada automaticamente para o e-mail e WhatsApp do cliente.

---

## CAPÍTULO 34: RECURSOS ADICIONAIS DO APLICATIVO MÓVEL

### 34.1 Consulta da Agenda e Escala de Trabalho
Na aba **"Agenda"**, o técnico visualiza seu calendário dos próximos dias. É possível clicar em qualquer data para saber quais clientes estão programados para amanhã ou para a próxima semana, permitindo planejar rotas e separar ferramentas especiais com antecedência.

### 34.2 Consulta do Estoque de Peças no Veículo
Na aba **"Estoque"**, o técnico consulta a relação completa de todos os itens e ferramentas que constam sob sua custódia no veículo. Caso encontre alguma divergência física na van, o profissional pode tocar em **"Solicitar Reposição"** para avisar o almoxarifado central.

### 34.3 Chat com Duno IA para Dúvidas Técnicas e Manuais
Na aba **"Duno IA"**, o técnico tem acesso a um assistente inteligente especializado em serviços de manutenção:
* Digite ou fale frases como: *"Qual o valor padrão de resistência da bobina do compressor Danfoss MT64?"* ou *"Como resetar o alarme de alta pressão no controlador Carel Easy?"*.
* A inteligência artificial consulta a base de manuais técnicos cadastrados na empresa e responde de forma clara em poucos segundos na palma da sua mão.

---

## CAPÍTULO 35: RESILIÊNCIA — OPERAÇÃO OFFLINE E SMART SYNC

### 35.1 Como o Duno Opera em Áreas Sem Sinal

É muito comum que atendimentos técnicos ocorram em subsolos de prédios, casas de máquinas industriais blindadas ou áreas rurais onde o sinal de 4G e Wi-Fi é inexistente.

O Duno foi concebido com arquitetura **Offline-First**:
* Ao perder a internet, o aplicativo **não trava, não fecha e não perde nenhuma informação**.
* Você pode continuar executando a Ordem de Serviço com total normalidade: preencher checklists, tirar fotografias com a câmera, ditar laudos e colher a assinatura digital do cliente na tela.
* Todos os dados, imagens e vetores de assinatura são gravados com segurança criptografada na memória interna do aparelho celular.

---

### 35.2 A Fila de Sincronização Inteligente (Smart Sync) e HUD de Status

No topo da tela do aplicativo, um pequeno indicador discreto (*Smart Sync HUD*) exibe o status de envio dos dados:
* **Ícone Verde (Sincronizado):** Todos os atendimentos e fotos já foram enviados com sucesso para a sede da empresa.
* **Ícone Laranja / Nuvem com Relógio (Fila Pendente):** Há atendimentos ou fotografias salvas na memória do aparelho aguardando conexão com a internet para upload (ex: *"3 itens na fila"*).
* **Envio Automático em Segundo Plano:** Assim que você sair do subsolo e o celular recuperar o sinal 4G ou conectar-se à rede Wi-Fi de um posto ou restaurante, o Duno detecta a conexão automaticamente e realiza o envio de todas as fotos e laudos em segundo plano, sem exigir nenhuma ação manual do técnico.

---

### 35.3 Cuidados ao Trocar de Conexão e Garantia de Dados

> ⚠️ **ATENÇÃO CRÍTICA — NUNCA DESINSTALE O APP COM ITENS NA FILA:** Se você realizou atendimentos em área sem sinal e o indicador laranja estiver exibindo itens pendentes de sincronização, **nunca desinstale o aplicativo nem limpe o armazenamento do aparelho**. Dirija-se até uma área com cobertura de internet e aguarde o indicador ficar verde antes de encerrar o expediente.

---

## CAPÍTULO 36: BOAS PRÁTICAS E RECOMENDAÇÕES PARA TÉCNICOS

Para garantir a excelência no atendimento e a valorização profissional do técnico de campo:
1. **Verifique sua Bateria e Carregador Veicular:** Mantenha sempre um cabo e adaptador de carregador rápido no veículo para não ficar sem bateria durante um atendimento.
2. **Capriche nas Fotografias:** Fotos nítidas, bem iluminadas e sem dedos na frente da lente são a maior prova do seu profissionalismo e protegem você caso o cliente alegue que a máquina foi deixada suja ou danificada.
3. **Colete a Assinatura Sempre na Presença do Cliente:** Nunca assine pelo cliente. A assinatura coletada no celular tem valor de auditoria jurídica e evita contestações de cobrança no futuro.
4. **Mantenha o GPS do Aparelho Sempre Ativo:** O registro do trajeto comprova sua pontualidade e dedicação à empresa.

---
"""
