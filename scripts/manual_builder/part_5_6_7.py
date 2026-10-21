# -*- coding: utf-8 -*-
"""
Módulo: Partes V, VI e VII — Fluxos de Ponta a Ponta, Solução de Problemas, Referência Rápida e Glossário
"""

CONTENT = """# PARTE V — FLUXOS OPERACIONAIS DE PONTA A PONTA

---

## FLUXO 1: CICLO COMPLETO DA ORDEM DE SERVIÇO (DO DESPACHO AO FATURAMENTO)

Este é o fluxo mestre que rege a prestação de serviços no Duno:

```
[1. ABERTURA DA OS NA SEDE]
   ├── Atendente abre Wizard em 5 etapas
   ├── Seleciona Cliente, Equipamento e Defeito
   └── Atribui Técnico Roberto (OS fica "ATRIBUÍDA")
            │
            ▼
[2. RECEBIMENTO NO SMARTPHONE]
   ├── Técnico Roberto recebe notificação push no App Duno
   ├── Confere endereço e defeito relatado
   └── Toca em "Iniciar Deslocamento" (OS fica "EM DESLOCAMENTO")
            │
            ▼
[3. CHEGADA E EXECUÇÃO TÉCNICA]
   ├── Técnico chega no local e toca em "Cheguei no Local" (OS fica "EM ANDAMENTO")
   ├── Inspeciona a máquina e preenche Checklists técnicos obrigatórios
   ├── Substitui capacitor com peça retirada do seu veículo
   ├── Tira 4 fotografias em alta resolução de evidência
   └── Redige o Laudo Pericial e recomendações preventivas
            │
            ▼
[4. VALIDAÇÃO E ENTREGA TÉCNICA]
   ├── Chama o responsável no cliente
   ├── Coleta nome, documento e assinatura digital na tela do celular
   ├── Técnico assina sua rubrica e toca em "Finalizar Atendimento"
   └── OS passa para "CONCLUÍDA" em todo o sistema
            │
            ▼
[5. FATURAMENTO E COBRANÇA NA SEDE]
   ├── Analista financeiro visualiza a OS concluída na aba Lançamentos
   ├── Gera Fatura integrada Asaas com Pix Copia-e-Cola e Boleto
   ├── Dispara fatura por WhatsApp para o departamento financeiro do cliente
   └── Cliente paga via Pix no banco -> Duno dá baixa automática em 10 segundos
```

---

## FLUXO 2: ATENDIMENTO NO WHATSAPP ATÉ A ABERTURA DA ORDEM DE SERVIÇO

Como um chamado iniciado pelo cliente no WhatsApp vira uma Ordem de Serviço na agenda:

```
[1. CLIENTE MANDA MENSAGEM NO WHATSAPP]
   └── "Bom dia, o ar condicionado da minha loja parou de gelar!"
            │
            ▼
[2. ATENDIMENTO AUTOMATIZADO PELA IA (LIA)]
   ├── Lia responde cordialmente em 3 segundos
   ├── Coleta o endereço da loja e modelo do aparelho
   ├── Orienta cliente a enviar foto da etiqueta da máquina
   └── Gera uma "SOLICITAÇÃO DE ATENDIMENTO" pendente no sistema
            │
            ▼
[3. TRIAGEM PELO DESPACHANTE NA SEDE]
   ├── Despachante abre a tela de Solicitações e analisa os dados
   ├── Confere histórico do cliente e ativo vinculado
   └── Clica em "Aceitar e Abrir Ordem de Serviço"
            │
            ▼
[4. CONVERSÃO E AGENDAMENTO]
   ├── Todos os dados do WhatsApp são importados para o Wizard da OS
   ├── Despachante agenda para as 15:00 com o técnico daquela região
   └── Lia avisa o cliente no WhatsApp: "Seu atendimento foi agendado para hoje às 15:00 com o técnico Carlos"
```

---

## FLUXO 3: ORÇAMENTO COMERCIAL -> ASSINATURA ONLINE -> OS

O fluxo para serviços de médio e grande porte que demandam aprovação prévia de custos:

```
[1. ELABORAÇÃO DA PROPOSTA NA SEDE]
   ├── Vendedor/Atendente monta o Orçamento com peças e serviços
   ├── Sistema calcula totais, margens e condições de pagamento
   └── Clica em "Salvar Orçamento" (Status: "ABERTO")
            │
            ▼
[2. ENVIO DO LINK PÚBLICO AO CLIENTE]
   ├── Operador clica em "Copiar Link Público" e envia via WhatsApp
   └── Cliente abre a proposta profissional no navegador do seu smartphone
            │
            ▼
[3. APROVAÇÃO E ASSINATURA DIGITAL PELO CLIENTE]
   ├── Cliente analisa itens, valores e garantia
   ├── Toca em "Aprovar Proposta Comercial"
   ├── Digita nome, CPF e desenha sua assinatura com o dedo na tela
   └── Orçamento muda instantaneamente para "APROVADO" no escritório
            │
            ▼
[4. CONVERSÃO AUTOMÁTICA EM ORDEM DE SERVIÇO]
   ├── Despachante clica no botão "Converter em OS"
   ├── A Ordem de Serviço é criada com todas as peças e serviços já vinculados
   └── Peças são reservadas no almoxarifado central e equipe é despachada
```

---

## FLUXO 4: CONTRATO PMOC -> CRONOGRAMA PREVENTIVO -> EXECUÇÃO

Como o Duno gerencia contratos de manutenção preventiva corporativa:

```
[1. CONFIGURAÇÃO DO CONTRATO NA SEDE]
   ├── Gestor cadastra o Contrato PMOC do cliente
   ├── Vincula os 25 aparelhos de ar condicionado do prédio
   ├── Define periodicidade mensal (todo dia 05) e valor da mensalidade
   └── Programa antecedência de alerta de 5 dias
            │
            ▼
[2. DISPARO AUTOMÁTICO DA OS PREVENTIVA]
   ├── Todo dia 01 do mês, o motor do Duno gera a OS Preventiva
   ├── Insere os 25 ativos com seus respectivos checklists técnicos
   └── Aloca a OS diretamente na agenda do técnico responsável
            │
            ▼
[3. EXECUÇÃO EM CAMPO PELO TÉCNICO]
   ├── Técnico chega no prédio, abre a OS no aplicativo Duno
   ├── Bipa o QR Code de cada uma das 25 máquinas
   ├── Preenche medições e limpezas por aparelho
   └── Coleta assinatura do síndico/gerente predial ao final
            │
            ▼
[4. CERTIFICADO PMOC E FATURAMENTO RECORRENTE]
   ├── Laudo PMOC mensal é emitido em PDF para o livro de inspeção da Vigilância Sanitária
   └── Fatura mensal de mensalidade é disparada automaticamente para o cliente
```

---

## FLUXO 5: CONTROLE DE PEÇAS: ALMOXARIFADO -> VEÍCULO -> OS

A rastreabilidade física e contábil das peças de reposição:

```
[1. COMPRA E ENTRADA NO ALMOXARIFADO CENTRAL]
   ├── Chegada de 20 capacitores do fornecedor com Nota Fiscal
   ├── Almoxarife registra "Entrada de Estoque" no sistema
   └── Saldo do Almoxarifado Central sobe de 0 para 20 UN
            │
            ▼
[2. TRANSFERÊNCIA PARA O VEÍCULO DO TÉCNICO]
   ├── Almoxarife transfere 4 capacitores para a van do Técnico Roberto
   ├── Saldo Central passa para 16 UN
   └── Estoque Móvel do Técnico Roberto passa para 4 UN
            │
            ▼
[3. APLICAÇÃO EM CAMPO NA ORDEM DE SERVIÇO]
   ├── Em atendimento, Roberto constata que o capacitor da máquina queimou
   ├── Pelo App Duno, adiciona 1 capacitor do estoque do seu carro na OS
   └── Ao finalizar a OS, o saldo do carro baixa de 4 para 3 UN
            │
            ▼
[4. AUDITORIA E REPOSIÇÃO]
   ├── Ao final do expediente, relatório de conferência mostra a baixa
   └── Almoxarife separa 1 novo capacitor para reabastecer a van de Roberto
```

---

## FLUXO 6: CONCLUSÃO DO SERVIÇO -> FATURA PIX/BOLETO -> QUITAÇÃO

A automação financeira pós-serviço:

```
[1. FINALIZAÇÃO DA OS EM CAMPO]
   └── Técnico encerra o serviço com laudo e assinatura do cliente
            │
            ▼
[2. EMISSÃO DA FATURA PELO FINANCEIRO]
   ├── Analista acessa "Lançamentos a Receber" no Financeiro
   ├── Clica em "Gerar Fatura Asaas"
   └── Define vencimento para 5 dias úteis
            │
            ▼
[3. DISPARO DO LINK DE COBRANÇA]
   ├── Sistema gera Boleto Bancário e Pix Copia-e-Cola com QR Code
   └── Envia fatura automaticamente para o WhatsApp do cliente
            │
            ▼
[4. PAGAMENTO E BAIXA INSTANTÂNEA]
   ├── Cliente abre o aplicativo do seu banco e lê o QR Code Pix
   ├── Banco autoriza a transferência
   ├── Em 10 segundos, o Duno recebe a notificação do gateway
   ├── Status da fatura muda automaticamente para "RECEBIDA"
   └── Comissão do técnico é liberada para pagamento no extrato
```

---

# PARTE VI — GUIA DE SOLUÇÃO DE PROBLEMAS E SUPORTE

---

## DIAGNÓSTICO RÁPIDO DE DIFICULDADES OPERACIONAIS COMUNS (12 CASOS)

### Caso 1: "Credenciais inválidas ao tentar fazer login no sistema web"
* **O que você observa:** Mensagem de erro vermelha na tela de login informando que o e-mail ou a senha estão incorretos.
* **Causas prováveis:** Tecla Fixa (Caps Lock) ativada, espaçamento involuntário antes ou depois do e-mail, ou senha esquecida.
* **O que verificar primeiro:** Confira se a luz de Caps Lock está acesa no teclado e verifique se digitou o e-mail completo sem espaços vazios.
* **Procedimento recomendado:** Clique no link **"Esqueci minha senha"**, digite seu e-mail e aguarde o recebimento do link de redefinição na sua caixa de entrada.
* **Quando acionar o suporte:** Se o e-mail com o link de recuperação não chegar à sua caixa de entrada em até 5 minutos (verifique também a pasta de Spam/Lixo Eletrônico).

---

### Caso 2: "O técnico não consegue fazer login no aplicativo móvel"
* **O que você observa:** O aplicativo exibe a mensagem "Usuário não autorizado" ou "Credenciais inválidas".
* **Causas prováveis:** O status do técnico foi alterado para "Suspenso" no cadastro web, ou o e-mail digitado no celular é diferente do e-mail cadastrado na sede.
* **O que verificar primeiro:** Acesse o menu **Cadastros & Ativos** > **Técnicos** no computador e confira se o status do técnico está **"Liberado (App Ativo)"** e qual o e-mail exato cadastrado.
* **Procedimento recomendado:** Caso o técnico esteja liberado, redefina a senha dele no cadastro web e oriente-o a digitar novamente no celular.

---

### Caso 3: "O botão 'Finalizar Atendimento' não responde ou exibe alerta de campo obrigatório"
* **O que você observa:** O técnico tenta concluir a Ordem de Serviço no aplicativo móvel, mas o sistema bloqueia e emite um aviso.
* **Causas prováveis:** Há algum item obrigatório no checklist do equipamento sem preenchimento, falta a foto de comprovação exigida pelas regras da empresa, ou o cliente não desenhou a assinatura digital.
* **O que verificar primeiro:** Role todas as páginas da esteira de execução observando se há campos marcados com asterisco vermelho (`*`) que ficaram em branco.
* **Procedimento recomendado:** Preencha os campos pendentes, capture a foto solicitada, colete a assinatura do responsável no cliente e toque novamente em "Finalizar Atendimento".

---

### Caso 4: "O aplicativo exibe 'Sem Conexão' e as fotos não estão sendo enviadas"
* **O que você observa:** O indicador do topo do aplicativo (*Smart Sync HUD*) exibe um ícone de nuvem laranja com itens pendentes na fila.
* **Causas prováveis:** O técnico está operando em um subsolo, área rural ou local com blindagem eletromagnética sem sinal de operadora de celular.
* **O que verificar primeiro:** Verifique na barra de status do smartphone se há barras de sinal 4G ou conexão Wi-Fi ativa.
* **Procedimento recomendado:** **Não faça nada de imediato e NUNCA desinstale o app.** Continue o atendimento normalmente até a assinatura. Assim que você sair do subsolo e retornar à rua com cobertura de internet, o aplicativo enviará tudo automaticamente e a nuvem ficará verde.

---

### Caso 5: "Não consigo converter a Solicitação do WhatsApp em Ordem de Serviço"
* **O que você observa:** Ao clicar em "Aceitar e Abrir OS" na tela de triagem, o sistema bloqueia a ação.
* **Causas prováveis:** Falta vincular um Cliente cadastrado ou um Ativo (Equipamento) à solicitação.
* **O que verificar primeiro:** Observe os cards no topo da solicitação. Se estiver escrito "Cliente não identificado" ou "Equipamento não vinculado", o botão não liberará a conversão.
* **Procedimento recomendado:** Clique no botão **"Cadastrar / Vincular Cliente"** para associar o número do WhatsApp a um cliente da sua base e selecione o equipamento correspondente. Em seguida, clique novamente em "Aceitar e Abrir OS".

---

### Caso 6: "O cliente pagou a fatura via Pix no banco, mas o status no sistema continua 'Pendente'"
* **O que você observa:** O cliente enviou o comprovante bancário por WhatsApp, mas a fatura continua como "Em Aberto" no módulo financeiro.
* **Causas prováveis:** O cliente pagou através de uma chave Pix pessoal ou por transferência bancária manual (TED/DOC), em vez de escanear o QR Code dinâmico gerado pelo Duno; ou a sincronização de webhooks do Asaas precisa de atualização.
* **O que verificar primeiro:** Acesse **Configurações** > **Integrações** e clique no botão **"Ressincronizar Webhook"**.
* **Procedimento recomendado:** Caso o cliente tenha feito Pix direto na conta bancária física da empresa (fora da cobrança gerada), o analista financeiro deve abrir a fatura no painel e clicar em **"Baixa Manual de Pagamento"**, informando a data e o comprovante.

---

### Caso 7: "A peça que o técnico usou não aparece para adicionar no aplicativo"
* **O que você observa:** O técnico tenta lançar uma peça pelo celular, mas o item não surge no campo de busca.
* **Causas prováveis:** A peça não foi previamente transferida da sede para o estoque móvel daquele veículo específico, ou o saldo físico daquela van está zerado no sistema.
* **O que verificar primeiro:** Acesse **Estoque** no painel web, filtre pelo estoque do técnico e verifique se a peça consta na lista com saldo maior que zero.
* **Procedimento recomendado:** O almoxarife deve realizar a transferência virtual da peça para a van do técnico através do botão "Transferir para Técnico". Em seguida, o técnico atualiza a tela do aplicativo puxando para baixo para atualizar.

---

### Caso 8: "O mapa de técnicos (Duno Maps) não atualiza a posição de um técnico"
* **O que você observa:** O marcador do técnico no mapa web está congelado em uma posição antiga ou aparece como "Offline".
* **Causas prováveis:** O técnico desativou a Localização (GPS) nas configurações do Android/iOS, ativou o modo de economia extrema de bateria, ou o aplicativo foi forçado a fechar pelo usuário.
* **O que verificar primeiro:** Ligue ou envie mensagem para o técnico e solicite que ele confirme se o ícone de localização (GPS) está ativo na barra de notificações do celular.
* **Procedimento recomendado:** O técnico deve abrir o aplicativo Duno e garantir que a permissão de localização esteja configurada para *"Permitir Sempre"* ou *"Permitir Durante o Uso"*.

---

### Caso 9: "O cliente alega que não recebeu o e-mail com o laudo em PDF"
* **O que você observa:** O serviço foi concluído, mas o cliente afirma não ter recebido o relatório na sua caixa de entrada.
* **Causas prováveis:** O e-mail do cliente foi digitado com erro de grafia no cadastro, ou a mensagem caiu na pasta de Spam / Lixo Eletrônico.
* **O que verificar primeiro:** Abra o cadastro do cliente e confira letra por letra o endereço de e-mail (ex: verificar se não foi digitado `@gmai.com` em vez de `@gmail.com`).
* **Procedimento recomendado:** No painel web da OS concluída, clique em **"Copiar Link Público"** e envie o laudo diretamente pelo WhatsApp do cliente.

---

### Caso 10: "A Ordem de Serviço foi encerrada por engano e precisa de correção"
* **O que você observa:** O técnico finalizou a OS antes de registrar uma peça importante ou antes de tirar a foto correta.
* **Causas prováveis:** Toque involuntário em "Sim, Concluir".
* **O que verificar primeiro:** Por segurança e auditoria jurídica, uma OS concluída entra em modo de somente leitura.
* **Procedimento recomendado:** O usuário com perfil de **Administrador Geral** deve abrir a OS no painel web, clicar no menu de ações superiores e selecionar **"Reabrir Ordem de Serviço"** mediante justificativa formal. A OS volta ao status "Em Andamento", permitindo a inclusão dos dados faltantes.

---

### Caso 11: "A IA do WhatsApp (Lia) parou de responder às mensagens dos clientes"
* **O que você observa:** Clientes enviam mensagens no WhatsApp corporativo e não recebem resposta imediata do robô.
* **Causas prováveis:** A conexão do WhatsApp foi desconectada no aparelho celular físico (sessão expirada), ou o limite de atendimento do robô foi atingido.
* **O que verificar primeiro:** Acesse **Configurações** > **WhatsApp** no painel web e verifique o indicador de status da conexão.
* **Procedimento recomendado:** Se o status estiver "Desconectado", clique em **"Reconectar WhatsApp"**, aponte a câmera do celular da empresa para o QR Code exibido na tela e reconecte a sessão.

---

### Caso 12: "O sistema web exibe 'Acesso Negado' ao tentar abrir um módulo"
* **O que você observa:** Uma janela de alerta informa: *"Acesso Negado: Você não tem permissão para acessar este módulo. Contate o administrador"*.
* **Causas prováveis:** O grupo de permissões (RBAC) ao qual seu usuário pertence não possui autorização para aquela tela específica.
* **O que verificar primeiro:** Confirme com o administrador da sua empresa se a sua função exige acesso àquele módulo.
* **Procedimento recomendado:** O administrador deve acessar **Cadastros & Ativos** > **Usuários** > **Grupos de Permissão**, editar o seu grupo e marcar a caixa de seleção do módulo desejado.

---

## COMO ENTRAR EM CONTATO COM O SUPORTE OFICIAL DUNO

Caso você enfrente alguma situação não coberta por este guia de solução de problemas:

1. **Canal de Atendimento Oficial (Chat Integrado):**
   * No rodapé da barra lateral esquerda do painel web, clique no botão verde **"Suporte (Online Agora)"** para iniciar uma conversa direta com nossa equipe de engenharia e atendimento.
2. **Informações que Você Deve Fornecer ao Suporte para Agilizar a Resolução:**
   * O número do protocolo da Ordem de Serviço envolvida (ex: `#OS-10492`);
   * O nome do técnico ou usuário logado;
   * O modelo e sistema operacional do celular (se o problema ocorreu no app móvel);
   * Uma captura de tela (print) da mensagem de erro exibida.

---

# PARTE VII — REFERÊNCIA RÁPIDA, GLOSSÁRIO E FAQ

---

## GLOSSÁRIO TÉCNICO E OPERACIONAL DE TERMOS DUNO

* **Ativo:** Qualquer máquina, aparelho ou equipamento físico pertencente a um cliente que recebe intervenções de manutenção da sua empresa (ex: um aparelho de ar condicionado, um gerador elétrico).
* **Checklist Dinâmico:** Questionário técnico digital personalizado contendo verificações de conformidade, medições físicas e fotos obrigatórias.
* **Despacho:** Ato de designar e agendar uma Ordem de Serviço para um técnico específico da equipe.
* **Geofencing:** Delimitação de uma área geográfica ou polígono no mapa da cidade para controle de taxas de deslocamento e equipes responsáveis.
* **Impedimento:** Situação operacional em que o técnico comparece ao cliente mas fica impossibilitado de executar o serviço por circunstâncias alheias à sua vontade (ex: portaria fechada, falta de energia).
* **Laudo Técnico Pericial:** Documento descritivo formal emitido pelo especialista de campo ao final do atendimento, atestando o diagnóstico da máquina, as peças trocadas e a solução aplicada.
* **Offline-First:** Arquitetura do aplicativo móvel que permite trabalhar sem conexão de internet, salvando tudo na memória do celular e sincronizando automaticamente depois.
* **Ordem de Serviço (OS):** O documento mestre que autoriza, guia, audita e comprova a execução de um serviço técnico em campo.
* **PIN Operacional:** Código de identidade exclusivo de 6 dígitos que atua como assinatura rápida para conferências internas de segurança.
* **PMOC (Plano de Manutenção, Operação e Controle):** Plano legal de manutenção preventiva periódica exigido por lei para edifícios comerciais e hospitalares.
* **RBAC (*Role-Based Access Control*):** Modelo de governança que define o que cada colaborador pode ver e fazer com base no seu cargo na empresa.
* **SLA (*Service Level Agreement*):** Prazo máximo acordado com o cliente para início ou conclusão do atendimento, medido de acordo com a prioridade do chamado.
* **Smart Sync:** Fila de sincronização inteligente do aplicativo móvel que envia fotos e laudos em segundo plano assim que o celular recupera conexão 4G/Wi-Fi.
* **TMA (Tempo Médio de Atendimento):** Indicador estatístico que calcula a média de tempo gasta pelos técnicos executando os serviços nos clientes.
* **Transbordo Humano:** Passagem automática da conversa de atendimento do robô de inteligência artificial (Lia) para um atendente humano na sede.
* **Wizard:** Formulário guiado passo a passo (como a abertura de OS em 5 etapas) que orienta o usuário de forma sequencial.

---

## MATRIZ DE REFERÊNCIA RÁPIDA DE PROCEDIMENTOS

| O Que Você Deseja Fazer? | Menu no Sistema Web | Botão ou Atalho Principal |
| :--- | :--- | :--- |
| **Abrir uma nova Ordem de Serviço** | `Operação > Ordens de Serviço` | Botão azul **"Nova Ordem de Serviço"** |
| **Cadastrar um novo cliente** | `Cadastros > Clientes` | Botão **"Novo Cliente"** |
| **Cadastrar uma máquina / ativo** | `Cadastros > Equipamentos` | Botão **"Novo Equipamento"** |
| **Imprimir etiqueta com QR Code** | `Cadastros > Equipamentos` | Ícone de **QR Code** no card do ativo |
| **Ver localização dos técnicos no mapa** | `Operação > Visão de Campo` | Menu lateral **"Mapa"** |
| **Montar um checklist técnico** | `Cadastros > Formulários` | Botão **"Novo Modelo"** |
| **Cadastrar um técnico de campo** | `Cadastros > Técnicos` | Botão **"Novo Técnico"** |
| **Criar uma proposta comercial** | `Comercial > Orçamentos` | Botão **"Novo Orçamento"** |
| **Lançar uma compra de peças** | `Comercial > Estoque` | Botão **"Entrada de Estoque"** |
| **Abastecer a van do técnico** | `Comercial > Estoque` | Botão **"Transferir para Técnico"** |
| **Criar um contrato PMOC** | `Comercial > Contratos` | Botão **"Novo Contrato"** |
| **Emitir cobrança com Pix/Boleto** | `Financeiro > Financeiro` | Aba Recebíveis > Botão **"Gerar Fatura"** |
| **Conferir comissão dos técnicos** | `Financeiro > Financeiro` | Aba **"Comissões"** |
| **Criar um novo usuário administrativo** | `Cadastros > Usuários` | Botão **"Novo Usuário"** |
| **Alterar logotipo da empresa** | `Configurações > Empresa` | Botão **"Carregar Imagem"** |
| **Ajustar prazos de SLA** | `Configurações > Sistema` | Seção **"Regras de SLA"** |

---

## PERGUNTAS FREQUENTES (FAQ)

**1. O cliente precisa ter uma conta ou senha para aprovar orçamentos e ver laudos?**  
Não. O Duno gera links públicos exclusivos e seguros com chave criptográfica. O cliente abre o link diretamente pelo navegador do smartphone ou computador, sem necessidade de cadastrar nenhuma senha.

**2. Quantas fotos o técnico pode anexar em uma mesma Ordem de Serviço?**  
Não há limite imposto pelo sistema. O técnico pode capturar dezenas de fotografias de cada etapa da manutenção. As imagens são compactadas automaticamente no celular para upload rápido sem sobrecarregar a memória do aparelho.

**3. O que acontece se o técnico perder o sinal de internet no meio de um atendimento?**  
O técnico pode continuar preenchendo o laudo, checklists e tirando fotos normalmente. O aplicativo salva tudo na memória do celular. Quando a conexão voltar, o sistema envia todos os dados automaticamente em segundo plano.

**4. O Duno emite Nota Fiscal de Serviços (NFS-e)?**  
Sim. Quando o módulo fiscal estiver habilitado e conectado à prefeitura da sua cidade, o sistema permite a transmissão dos dados e geração da NFS-e a partir das faturas geradas.

**5. Posso usar o Duno em mais de um computador ao mesmo tempo no escritório?**  
Sim. O sistema opera em nuvem com sincronização em tempo real. Vários despachantes, atendentes e diretores podem operar a plataforma simultaneamente em computadores diferentes sem conflito de dados.

**6. Como faço para desativar o acesso de um técnico que saiu da empresa?**  
Acesse o menu **Cadastros & Ativos** > **Técnicos**, clique para editar o colaborador e mude o status para **"Suspenso (Bloqueado)"**. Imediatamente, a sessão dele no aplicativo móvel é encerrada e ele não terá mais acesso a nenhum dado.

---

### ENCERRAMENTO E COMPROMISSO DE QUALIDADE

Este manual reflete a versão oficial 2.5 Pro do ecossistema Duno. A plataforma passa por aprimoramentos contínuos de usabilidade e performance para proporcionar a melhor experiência de gestão operacional para sua empresa.

*Duno — Sistema de Gestão de Serviços, Manutenção e Operações de Campo.*  
*Todos os direitos reservados.*
"""
