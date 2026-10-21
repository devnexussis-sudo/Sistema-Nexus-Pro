# -*- coding: utf-8 -*-
"""
Módulo: Parte II — Primeiros Passos e Configuração da Empresa
"""

CONTENT = """# PARTE II — PRIMEIROS PASSOS E CONFIGURAÇÃO DA EMPRESA

---

## CAPÍTULO 4: AUTENTICAÇÃO, ACESSO SEGURO E IDENTIFICAÇÃO OPERACIONAL

### 4.1 Login por E-mail e Senha e Google SSO

O acesso ao Painel Web é realizado através da página oficial de login.

#### Procedimento: Realizar Login no Sistema Web
* **Objetivo:** Autenticar com segurança o usuário e carregar as permissões e dados da sua organização.
* **Onde Acessar:** Tela inicial do sistema (`/login`).
* **Pré-requisitos:** Usuário previamente cadastrado por um Administrador da empresa.
* **Passo a Passo:**
  1. Digite seu **E-mail Corporativo** no campo indicado.
  2. Digite sua **Senha de Acesso**. Caso queira verificar a digitação, clique no ícone de "olho" para exibir os caracteres.
  3. Marque a opção **"Lembrar meu acesso"** caso esteja operando em um computador pessoal seguro.
  4. Clique no botão azul **"Entrar no Sistema"**.
  5. Alternativamente, caso seu e-mail corporativo esteja associado ao Google Workspace, clique no botão **"Entrar com Google"** para efetuar a autenticação em um clique via Single Sign-On (SSO).
* **Campos e Informações:**
  * `E-mail`: Endereço eletrônico corporativo válido (obrigatório).
  * `Senha`: Senha alfanumérica cadastrada (obrigatória).
* **Resultado Esperado:** O sistema valida as credenciais e direciona o usuário imediatamente para a tela inicial do Painel Administrativo.
* **Como Conferir:** No canto superior direito da tela, verifique se o seu nome e sua foto de perfil aparecem no cabeçalho global.
* **Cuidados Importantes:** Nunca compartilhe sua senha de acesso com outros colaboradores. Cada usuário deve ter seu próprio login para garantir a auditoria correta de quem criou ou alterou cada registro.
* **Problemas Comuns:** Caso a mensagem "Credenciais inválidas" apareça, certifique-se de que a tecla Fixa (Caps Lock) não está ativada e confirme com o administrador se seu e-mail foi digitado corretamente no cadastro.

---

### 4.2 Recuperação e Redefinição de Senha

#### Procedimento: Redefinir Senha Esquecida
* **Objetivo:** Recuperar o acesso ao sistema quando o colaborador esquecer a senha atual.
* **Onde Acessar:** Na tela de login, clique no link **"Esqueci minha senha"**.
* **Pré-requisitos:** Ter acesso à caixa de entrada do e-mail cadastrado.
* **Passo a Passo:**
  1. Na tela de recuperação, informe o seu **E-mail Cadastrado**.
  2. Clique em **"Enviar Link de Recuperação"**.
  3. Acesse seu e-mail e localize a mensagem enviada pelo Duno contendo o link exclusivo de redefinição.
  4. Clique no link para abrir a página de criação de nova senha.
  5. Digite a **Nova Senha** e confirme-a no campo **"Confirmar Nova Senha"**.
  6. Clique em **"Salvar Nova Senha"**.
* **Campos e Informações:**
  * `Nova Senha`: Requer padrão corporativo seguro de no mínimo 8 caracteres, contendo ao menos uma letra maiúscula e pelo menos um número.
* **Resultado Esperado:** A nova senha é gravada com sucesso e todas as sessões anteriores são encerradas por segurança, redirecionando o usuário à tela de login para autenticação com a nova credencial.
* **Como Conferir:** Efetue o login com a nova senha para certificar-se da liberação do acesso.

---

### 4.3 Código de Identidade Exclusivo (PIN Operacional de 6 Dígitos)

Todo usuário administrativo e todo técnico de campo recebe automaticamente do sistema um **PIN de Identidade Operacional de 6 Dígitos** (ex: `PIN: 849201`).

* **Finalidade Operacional:** O PIN funciona como uma "assinatura digital simplificada" para conferências rápidas. Ele é utilizado para:
  1. Identificar com rapidez quem é o operador responsável por uma transferência de peças no almoxarifado;
  2. Confirmar a identidade do técnico em conferências por telefone com o cliente ou despachante;
  3. Assinar internamente movimentações de estoque físico e auditorias de conferência.
* **Onde Localizar:** O PIN do usuário logado pode ser consultado a qualquer momento clicando sobre seu avatar no canto superior direito do cabeçalho web, bem como no menu "Perfil" do aplicativo móvel.

---

## CAPÍTULO 5: INTERFACE DO USUÁRIO, NAVEGAÇÃO E INDICADORES GLOBAIS

### 5.1 Barra Lateral Retrátil e Categorias de Menus

A interface web do Duno adota um design ergonômico planejado para maximizar a área útil de visualização de mapas, tabelas de ordens de serviço e gráficos operacionais.

* **Modo Expandido vs Modo Retrátil:** No canto superior esquerdo da barra lateral, há um botão de recolhimento. Ao clicar nele, a barra lateral contrai-se, exibindo apenas os ícones e o monograma "D", ampliando o espaço disponível na tela.
* **Categorias de Navegação:** Os menus são agrupados logicamente em quatro grandes blocos que podem ser recolhidos ou expandidos:
  1. **Operação & Atendimento:** *Dashboard*, *Duno IA*, *Solicitações (Triagem)*, *Ordens de Serviço*, *Agenda*, *Visão de Campo (Mapa)* e *WhatsApp Inbox*.
  2. **Financeiro & Comercial:** *Financeiro Completo*, *Pedidos de Venda*, *Orçamentos*, *Almoxarifado & Estoque* e *Contratos PMOC*.
  3. **Cadastros & Ativos:** *Clientes*, *Equipamentos / Ativos*, *Formulários & Checklists*, *Técnicos*, *Gestão de Regiões* e *Usuários & Permissões*.
  4. **Configurações & Sistema:** *Configurações da Empresa*, *Integrações* e *Docs / FAQ*.
* **Em Dispositivos Móveis e Tablets:** O menu lateral transforma-se em um **Hub de Cards** categorizado, permitindo toque rápido nos módulos principais sem necessidade de rolagem excessiva.

---

### 5.2 Central de Notificações Internas e Modais de Leitura Obrigatória

No cabeçalho superior global, ao lado do perfil, encontra-se o **ícone de sino (Notificações)**, acompanhado de um marcador numérico que indica quantos avisos pendentes existem para você.

O sistema classifica as notificações em três níveis de prioridade:
1. **Informativa (Info / Azul):** Avisos rotineiros, como confirmação de agendamento de uma nova visita ou atualização cadastral de um cliente. Ficam armazenadas na lista do sino.
2. **Atenção (Warning / Amarelo):** Alertas operacionais importantes, como aproximação do vencimento de SLA de uma Ordem de Serviço ou item de estoque atingindo o limite mínimo.
3. **Urgente (Urgent / Vermelho):** Comunicados de alta criticidade emitidos pela diretoria ou alertas operacionais graves (ex: cliente prioritário impedindo atendimento). 
   * **Comportamento Bloqueante:** Comunicados Urgentes abrem automaticamente uma janela modal no centro da tela assim que o usuário entra no sistema. Para continuar utilizando o Duno, o colaborador é obrigado a ler o texto e clicar no botão **"Ciente, Confirmar Leitura"**, gerando um registro imutável de confirmação.

---

### 5.3 Indicadores de Conexão e Saúde Operacional

No rodapé da barra lateral esquerda, o Duno exibe monitores em tempo real para manter o usuário ciente das condições do ambiente:
* **Indicador de Conexão de Rede (`NetworkStatusIndicator`):** Exibe uma luz verde com a mensagem "Online" quando a sua conexão com a internet estiver estável. Se a sua internet oscilar ou cair, o indicador muda para amarelo ou vermelho ("Offline"), alertando que novas atualizações não estão chegando em tempo real.
* **Indicador de Saúde Operacional (`ResilienceIndicator`):** Monitora a sincronização e latência com o servidor. Se houver alguma lentidão momentânea na rede externa, o sistema informa que está operando em modo de resiliência, garantindo que suas ações continuem gravadas localmente.

---

### 5.4 Gestão do Perfil do Usuário e Foto de Avatar

#### Procedimento: Atualizar Foto e Preferências do Perfil
* **Objetivo:** Manter a identidade visual do colaborador atualizada no sistema e no aplicativo móvel.
* **Onde Acessar:** Clique no seu nome/avatar no canto superior direito do cabeçalho e selecione a aba desejada no popover.
* **Passo a Passo:**
  1. **Para alterar a foto:** Selecione a aba **"Foto de Perfil"**. Clique no botão **"Enviar Foto"** e selecione uma imagem do seu computador (formato JPG ou PNG). O sistema processa o arquivo e atualiza seu avatar instantaneamente.
  2. **Para alterar sua senha:** Selecione a aba **"Alterar Senha"**. Digite a nova senha desejada, confirme-a e clique em **"Atualizar Senha"**. Por segurança, o sistema encerrará a sessão em 2 segundos e exigirá novo login com a senha atualizada.
  3. **Para vincular conta Google:** Selecione a aba **"Google SSO"**. Clique em **"Conectar com Google"** e autorize sua conta corporativa para habilitar o login em 1 clique.

---

## CAPÍTULO 6: CONFIGURAÇÕES DA EMPRESA, MARCA E PRAZOS DE SLA

### 6.1 Cadastro dos Dados Institucionais e Logotipo

#### Procedimento: Configurar os Dados da Empresa
* **Objetivo:** Estabelecer a identidade corporativa da organização, que será exibida nos cabeçalhos de todos os laudos técnicos, ordens de serviço impressas, orçamentos e mensagens de WhatsApp.
* **Onde Acessar:** Menu lateral > **Configurações & Sistema** > **Configurações** > Aba **"Empresa"**.
* **Pré-requisitos:** Perfil de Administrador do sistema.
* **Passo a Passo:**
  1. No campo **Razão Social**, informe o nome jurídico registrado da sua empresa.
  2. No campo **Nome Fantasia**, informe o nome comercial conhecido pelos seus clientes.
  3. Digite o **CNPJ** (o sistema aplica a máscara automaticamente e valida os dígitos verificadores).
  4. Informe a **Inscrição Estadual** e **Inscrição Municipal**, quando aplicável.
  5. Preencha os campos de **Telefone**, **WhatsApp Corporativo** e **E-mail de Suporte**.
  6. Preencha o **Endereço Completo da Sede** (CEP, Logradouro, Número, Bairro, Cidade e Estado).
  7. No campo **Logotipo da Empresa**, clique em **"Carregar Imagem"** e selecione um arquivo em alta resolução (preferencialmente PNG com fundo transparente).
  8. Clique no botão azul **"Salvar Alterações"** no canto inferior direito.
* **Resultado Esperado:** As informações são atualizadas em toda a plataforma. Todas as novas propostas comerciais e laudos técnicos em PDF passarão a estampar a marca e os dados oficiais cadastrados.
* **Como Conferir:** Abra qualquer Ordem de Serviço e clique em "Imprimir / PDF" para constatar a presença do logotipo e dos dados no topo do documento.

---

### 6.2 Cabeçalhos e Rodapés de Relatórios e Laudos Técnicos

Na mesma aba de configurações da empresa, você pode definir textos padronizados para compor os documentos oficiais emitidos aos clientes:
* **Texto de Cabeçalho Institucional:** Frase ou slogan que acompanha o logotipo no topo das páginas (ex: *"Duno Serviços Especializados — Soluções em Climatização e Refrigeração Industrial"*).
* **Termo de Rodapé e Declaração Legal:** Texto informativo impresso ao final de laudos e orçamentos (ex: *"Garantia de 90 dias sobre a mão de obra executada e garantia de fábrica para peças aplicadas conforme certificado anexo"*).

---

### 6.3 Definição de Prazos de SLA por Prioridade de Atendimento

O Duno possui um motor inteligente de controle de **Nível de Serviço** (*Service Level Agreement* — SLA). Ele monitora o tempo transcorrido desde a abertura da Ordem de Serviço até o atendimento e a conclusão do serviço, avisando visualmente a equipe caso o prazo esteja em risco.

#### Procedimento: Ajustar os Prazos de SLA da Operação
* **Onde Acessar:** Menu lateral > **Configurações** > Aba **"Sistema"** > Seção **"Regras de SLA"**.
* **Configuração dos Prazos Padrão:**
  * **Prioridade Baixa:** Prazo recomendado de 72 horas úteis (atendimentos preventivos rotineiros ou vistorias sem urgência).
  * **Prioridade Média:** Prazo recomendado de 24 a 48 horas úteis (atendimentos corretivos padrão).
  * **Prioridade Alta:** Prazo recomendado de 8 a 12 horas corridas (clientes com contrato ou falhas que afetam a operação parcial do cliente).
  * **Prioridade Urgente (Emergência):** Prazo recomendado de 2 a 4 horas corridas (parada total de fábrica, vazamentos críticos, risco patrimonial ou hospitalar).
* **Passo a Passo:**
  1. Digite a quantidade de horas correspondente a cada nível de prioridade.
  2. Defina o **Horário de Expediente Operacional** da empresa (ex: das 08:00 às 18:00, de segunda a sexta-feira) para que o relógio de SLA não contabilize períodos noturnos caso sua empresa não opere em regime 24/7.
  3. Clique em **"Salvar Configurações de SLA"**.
* **Resultado Esperado:** O painel de ordens de serviço passará a colorir o relógio de SLA em verde (no prazo), amarelo (próximo do limite) ou vermelho piscante (SLA estourado), auxiliando os despachantes a priorizarem a fila.

---

## CAPÍTULO 7: PARÂMETROS DO APLICATIVO MÓVEL E POLÍTICAS DE CAMPO

No menu **Configurações** > Aba **"App do Técnico"**, o gestor define quais travas e regras de segurança o aplicativo móvel dos técnicos deve impor durante os atendimentos.

### 7.1 Obrigatoriedade de Fotos e Evidências
* **Opção "Exigir Fotos de Conclusão":** Quando ativada, o técnico fica terminantemente impedido de clicar em "Finalizar Atendimento" caso não tenha registrado no mínimo 1 fotografia comprovando a execução do serviço.
* **Opção "Exigir Fotos Antes e Depois":** Quando selecionada nos checklists de ativos, força o registro da situação em que o equipamento foi encontrado e a condição em que foi deixado após a manutenção.

### 7.2 Exigência de Assinatura Digital do Cliente
* **Opção "Assinatura Obrigatória":** Garante que nenhuma Ordem de Serviço seja encerrada sem que o cliente ou preposto no local desenhe sua assinatura na tela do celular e informe seu nome legível e número de documento (CPF ou RG).

### 7.3 Controle de GPS e Deslocamento
* **Opção "Exigir GPS Ativo":** O aplicativo exige que a localização do aparelho esteja ativada para que o técnico possa registrar "Iniciar Deslocamento" e "Cheguei no Local". Isso garante que o horário e a posição geográfica da chegada sejam auditados com precisão.

### 7.4 Permissões de Adição de Peças pelo Técnico
* **Opção "Permitir Inclusão de Peças em Campo":** Define se o técnico tem autorização para lançar no atendimento peças que ele retirou do estoque do seu próprio carro, ou se todas as peças precisam ser previamente autorizadas e lançadas pelo escritório central.

---

## CAPÍTULO 8: ROTEIRO RECOMENDADO DE IMPLANTAÇÃO OPERACIONAL

Se a sua empresa acabou de contratar o Duno, **não comece abrindo ordens de serviço aleatoriamente**. Siga rigorosamente este roteiro em 7 etapas para estruturar a base cadastral da sua operação:

```
PASSO 1: Configurações Institucionais (Capítulo 6)
   └── Dados da empresa, logotipo, cabeçalhos de PDF e prazos de SLA.
PASSO 2: Grupos de Permissão e Usuários Administrativos (Capítulo 27)
   └── Criar perfis (Atendente, Financeiro, Gestor) e convidar a equipe interna.
PASSO 3: Cadastro de Técnicos e Liberação do App (Capítulo 13)
   └── Cadastrar os profissionais de campo e orientá-los a instalar o App Duno.
PASSO 4: Cadastro de Categorias e Itens de Almoxarifado (Capítulo 23)
   └── Cadastrar peças de reposição, estoque central e estoque inicial dos veículos.
PASSO 5: Criação de Formulários e Checklists Técnicos (Capítulo 12)
   └── Montar os modelos de inspeção técnica e regras automáticas por serviço.
PASSO 6: Cadastro de Clientes e seus Equipamentos/Ativos (Capítulos 10 e 11)
   └── Importar ou cadastrar os clientes e os respectivos equipamentos com número de série.
PASSO 7: Operação Plena e Central de Ordens de Serviço (Capítulos 15 a 18)
   └── Iniciar a abertura, distribuição, execução móvel e faturamento dos atendimentos.
```

> ⚠️ **IMPORTANTE:** Seguir este roteiro evita erros comuns como abrir uma OS para um cliente sem conseguir vincular o equipamento correto, ou despachar um técnico que ainda não teve seu usuário liberado no aplicativo móvel.

---
"""
