# -*- coding: utf-8 -*-
"""
Módulo: Parte I — Conhecendo o Sistema Duno
"""

CONTENT = """# PARTE I — CONHECENDO O SISTEMA DUNO

---

## CAPÍTULO 1: ARQUITETURA FUNCIONAL E AMBIENTES INTEGRADOS

O **Duno** foi projetado para eliminar as barreiras de comunicação entre o escritório central e a operação de rua. Em muitas empresas de serviços e manutenção, informações críticas como diagnósticos, peças utilizadas e autorizações de clientes perdem-se em conversas informais de aplicativos de mensagens ou em blocos de papel. O Duno resolve essa fragmentação através de uma arquitetura integrada com quatro ambientes especializados que se comunicam continuamente.

### 1.1 Os Quatro Ambientes do Ecossistema Duno

1. **Painel Administrativo Web (Computador / Desktop / Tablet):**
   É a central de comando da empresa. Acessado via navegador de internet por diretores, gestores, despachantes, analistas financeiros e almoxarifes. Permite gerenciar cadastros de clientes, ativos e equipes, criar e distribuir ordens de serviço, visualizar a agenda, acompanhar o mapa de técnicos em tempo real, gerenciar o estoque, faturar cobranças e configurar todas as regras operacionais.

2. **Aplicativo Móvel Duno (App Nativo iOS / Android & Tech PWA):**
   É a ferramenta de trabalho do técnico em campo. Otimizado para smartphones, opera com toque rápido, navegação intuitiva e suporte a trabalho offline. Pelo celular, o técnico visualiza as ordens de serviço designadas a ele, inicia o deslocamento até o cliente, registra o horário de chegada, preenche checklists e laudos, anexa fotografias de evidência, consome peças do estoque do veículo e coleta a assinatura digital do cliente na tela do aparelho.

3. **Portais Públicos do Cliente (Acesso Sem Senha / Links Seguros):**
   Páginas externas responsivas e seguras geradas automaticamente pelo sistema para que os clientes da sua empresa possam:
   * **Acompanhar a Ordem de Serviço:** Visualizar o status do atendimento em tempo real, dados do técnico designado, horário previsto e laudo de conclusão com fotos;
   * **Aprovar Orçamentos Online:** Analisar a proposta comercial com descrição de peças e mão de obra, aprovando com assinatura digital direta ou registrando recusa fundamentada;
   * **Efetuar Pagamentos (Checkout):** Pagar faturas instantaneamente via Pix Copia-e-Cola com QR Code dinâmico ou Cartão de Crédito.

4. **Portal Master / SuperAdmin (Governança Corporativa e Multi-Empresas):**
   Ambiente de governança executiva utilizado para administração de instâncias empresariais, controle de licenças contratadas, ativação seletiva de módulos adicionais (como WhatsApp IA e PMOC), auditoria de segurança global e exportação de backups integrais.

### 1.2 Sincronização em Tempo Real e Continuidade Operacional

O ecossistema Duno é interconectado por um motor de sincronização em tempo real. Isso significa que:
* Quando o atendente no escritório distribui uma Ordem de Serviço para um técnico, o celular do profissional apita imediatamente com uma notificação visual e a nova tarefa surge no topo do seu feed diário;
* Quando o técnico no campo pressiona "Iniciar Deslocamento" ou "Finalizar Atendimento", o painel administrativo na sede atualiza o status instantaneamente sem que ninguém precise recarregar a página no navegador;
* Caso o técnico entre em uma área sem sinal de internet (como subsolos, galpões fechados ou zonas rurais), o aplicativo armazena todos os laudos, fotos e assinaturas no aparelho e realiza o envio automático (*Smart Sync*) assim que a conexão celular ou Wi-Fi for restabelecida.

---

## CAPÍTULO 2: PERFIS DE USUÁRIO, RESPONSABILIDADES E RBAC

Para garantir organização, segurança e divisão clara de tarefas, o Duno utiliza um modelo estruturado de **Controle de Acesso Baseado em Papéis** (*Role-Based Access Control* — RBAC). Cada colaborador da sua empresa possui um usuário individual vinculado a um perfil ou grupo de permissões que determina exatamente quais menus ele pode visualizar e quais ações pode executar.

### 2.1 Matriz de Papéis e Permissões do Sistema

| Perfil Operacional | Ambiente Principal | Permissões Típicas de Acesso | Ações Restritas |
| :--- | :--- | :--- | :--- |
| **Administrador Geral** | Painel Web | Acesso total irrestrito: configurações, regras de SLA, cadastros, relatórios financeiros, faturamento e exclusão de registros. | Nenhuma dentro da empresa. |
| **Coordenador / Despachante** | Painel Web | Gestão de ordens de serviço, agenda, mapa em tempo real, atendimento WhatsApp, orçamentos e triagem de solicitações. | Não altera parâmetros fiscais da empresa nem exclui usuários. |
| **Analista Financeiro** | Painel Web | Dashboard financeiro, contas a pagar, faturas geradas, boletos, emissão de NFS-e, fluxo de caixa e cálculo de comissões. | Não altera formulários técnicos nem regras de geofencing. |
| **Almoxarife / Suprimentos** | Painel Web | Gestão de peças, itens do estoque central, transferências para técnicos, entradas de mercadorias e balanço físico. | Não acessa dados financeiros de faturamento nem altera orçamentos. |
| **Técnico de Campo** | Aplicativo Móvel | Visualização das OS atribuídas a ele, execução de checklists, captura de fotos, lançamento de peças do carro e assinaturas. | Não visualiza faturamento global, OS de outros técnicos nem dados de outros clientes. |
| **Atendente de WhatsApp** | Painel Web | WhatsApp Inbox, conversação com clientes, recebimento de solicitações e encaminhamento de chamados. | Não emite faturas nem altera cadastros técnicos de equipamentos. |

### 2.2 Isolamento de Dados por Empresa

O Duno opera com isolamento rigoroso de informações entre organizações. Os dados cadastrais, ordens de serviço, histórico de clientes, equipamentos, faturamento e equipes de uma empresa são completamente inacessíveis para qualquer outra empresa usuária da plataforma. Isso garante sigilo comercial absoluto, segurança institucional e conformidade com as melhores práticas de proteção de dados.

---

## CAPÍTULO 3: DIFERENÇAS ESSENCIAIS ENTRE O SISTEMA WEB E O APLICATIVO MÓVEL

É fundamental que gestores e técnicos compreendam a divisão de propósitos entre o sistema web no computador e o aplicativo móvel no celular:

| Funcionalidade / Recurso | Painel Web (Computador) | Aplicativo Móvel (Celular) |
| :--- | :---: | :---: |
| **Abertura e Planejamento de Novas OS** | **Sim** (Wizard completo em 5 etapas) | Apenas consulta e execução |
| **Visualização da Agenda Geral da Equipe** | **Sim** (Grade mensal/semanal de todos os técnicos) | Apenas agenda individual do técnico |
| **Acompanhamento no Mapa GPS em Tempo Real** | **Sim** (Localização de todos os técnicos) | Envia posição via GPS em segundo plano |
| **Execução de Checklists e Laudos Técnicos** | Consulta e edição administrativa | **Sim** (Interface focada em toque rápido) |
| **Captura de Fotos com Câmera Integrada** | Upload de arquivos do computador | **Sim** (Câmera nativa com compressão de imagem) |
| **Coleta de Assinatura Digital do Cliente** | Registro manual pelo gestor | **Sim** (Desenho da assinatura na tela de toque) |
| **Lançamento de Peças Utilizadas** | Gestão de estoque central e transferências | Consumo direto do estoque do veículo |
| **Operação Sem Internet (Modo Offline)** | Requer conexão com a internet | **Sim** (Cache completo com sincronização inteligente) |
| **Faturamento, Boletos e Pix Integrados** | **Sim** (Emissão de faturas e links de checkout) | Consulta de valor da OS (quando habilitado) |
| **Configuração de Parâmetros e Formulários** | **Sim** (Criador visual de checklists e regras) | Apenas preenchimento dos campos exigidos |

> 💡 **DICA OPERACIONAL:** O sistema web é o "cérebro planejador" da sua empresa, enquanto o aplicativo móvel é o "braço executor". Incentive seus técnicos a utilizarem o aplicativo para registrar cada detalhe no momento exato em que ele ocorre, garantindo que o escritório sempre tenha dados atualizados e precisos.

---
"""
