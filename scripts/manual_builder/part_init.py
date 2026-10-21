# -*- coding: utf-8 -*-
"""
Módulo: Elementos Iniciais e Sumário Navegável
"""

CONTENT = """# MANUAL DO USUÁRIO — SISTEMA DUNO
## Sistema de Gestão de Serviços, Manutenção e Operações de Campo
**Versão do Documento:** 2.5 Pro (Edição 2026)  
**Data de Atualização:** Outubro de 2026  
**Classificação:** Manual Oficial de Operação e Treinamento  

---

## APRESENTAÇÃO DO MANUAL

Seja bem-vindo ao **Manual Oficial do Usuário do Sistema Duno**.

O **Duno** é uma plataforma corporativa completa desenvolvida especificamente para modernizar, agilizar e profissionalizar empresas prestadoras de serviços, assistência técnica e manutenção preventiva e corretiva. O sistema unifica, em uma única experiência integrada, o gerenciamento de chamados e solicitações via WhatsApp, o planejamento e distribuição de ordens de serviço, o controle de equipes de campo por aplicativo móvel, a gestão de ativos e contratos (PMOC), o almoxarifado digital e a automação financeira de faturamento e cobrança.

Este manual foi elaborado com rigor didático e profundidade operacional para que qualquer colaborador — desde o diretor geral da empresa até o técnico em seu primeiro dia de atendimento em campo — consiga compreender a lógica da plataforma, configurar os parâmetros de sua operação e executar suas tarefas com total autonomia, segurança e produtividade.

---

## OBJETIVO DESTE DOCUMENTO

O objetivo central deste documento é fornecer uma **referência completa, passo a passo e autossuficiente** para a operação diária do Duno. Ao longo de seus capítulos, você aprenderá:

1. A navegar com fluidez pelo sistema web no computador e pelo aplicativo móvel no smartphone;
2. A implantar a plataforma em sua empresa através de uma sequência lógica e ordenada de cadastros base;
3. A gerenciar o ciclo de vida completo de uma Ordem de Serviço (OS), desde a triagem do chamado até a emissão do laudo técnico com assinatura digital;
4. A operar os módulos comercial, de contratos de manutenção planejada (PMOC), almoxarifado e financeiro;
5. A aplicar as melhores práticas operacionais de campo para eliminar retrabalho, perda de informações e atritos com os clientes.

---

## PÚBLICO-ALVO

Este manual destina-se exclusivamente aos usuários finais do ecossistema Duno, abrangendo os seguintes perfis profissionais:

* **Gestores e Administradores:** Responsáveis pela parametrização do sistema, definição de regras de negócio, metas de SLA, acompanhamento de indicadores globais e governança da empresa.
* **Despachantes, Atendentes e Coordenadores Operacionais:** Profissionais que realizam a triagem de mensagens de clientes, distribuição de chamados na agenda, acompanhamento do mapa de técnicos em tempo real e emissão de orçamentos.
* **Técnicos de Campo e Prestadores de Serviço:** Profissionais responsáveis pela execução dos serviços nos clientes, que operam o aplicativo móvel Duno para registrar check-ins, preencher checklists técnicos, capturar fotografias de evidência, apontar peças e colher assinaturas digitais.
* **Analistas Financeiros e Faturistas:** Usuários encarregados da emissão de faturas, cobranças via Pix e boleto, conciliação de pagamentos, controle de contas a pagar e apuração de comissões de técnicos.
* **Almoxarifes e Responsáveis por Suprimentos:** Operadores encarregados do controle do estoque central, inventários físicos, transferências de peças para os veículos dos técnicos e reposições.

---

## COMO UTILIZAR ESTE MANUAL

Para extrair o máximo proveito desta documentação, recomendamos:

* **Para Novos Usuários:** Leia sequencialmente a **Parte I (Conhecendo o Duno)** e a **Parte II (Primeiros Passos)** antes de iniciar as operações reais no sistema.
* **Para Gestores de Implantação:** Siga com atenção o **Capítulo 8 (Roteiro Recomendado de Implantação)** para cadastrar os dados da empresa, clientes, ativos e equipes na ordem correta, evitando retrabalho.
* **Para Técnicos de Campo:** Concentre-se na **Parte IV (Aplicativo Móvel do Técnico)**, onde cada tela, botão e procedimento de atendimento em campo é explicado em detalhes práticos.
* **Para Consulta Rápida:** Utilize o **Sumário Navegável** abaixo ou a ferramenta de busca do leitor de documentos para saltar diretamente ao procedimento ou módulo desejado.

---

## LEGENDA DE ELEMENTOS E CONVENÇÕES VISUAIS

Ao longo deste manual, você encontrará blocos visuais destacados para chamar sua atenção para pontos críticos da operação:

> 📘 **NOTA OPERACIONAL:** Explicações adicionais sobre o comportamento padrão da funcionalidade, regras de negócio aplicadas pelo sistema ou contexto de utilização.

> 💡 **DICA DE PRODUTIVIDADE:** Sugestões práticas, atalhos de navegação e recomendações para executar a tarefa com mais agilidade e evitar esforço desnecessário.

> ⚠️ **ATENÇÃO E CUIDADO:** Alertas sobre ações que exigem cautela, campos de preenchimento sensível ou condições que podem afetar outros módulos caso sejam ignoradas.

> 🚫 **RESTRIÇÃO OU IMPEDIMENTO:** Situações em que o sistema bloqueia a continuidade da operação devido à falta de pré-requisitos, validações de segurança ou regras de integridade cadastral.

---

## PADRÃO ESTRUTURAL DOS PROCEDIMENTOS

Todos os procedimentos descritos neste manual seguem uma estrutura padronizada para assegurar clareza e previsibilidade:

* **Objetivo:** O que a ação realiza e qual o resultado esperado para a empresa.
* **Onde Acessar:** O caminho exato de menus, abas ou botões na interface.
* **Pré-requisitos:** Quais cadastros ou permissões prévias são exigidos antes de começar.
* **Passo a Passo:** Sequência lógica e numerada de cliques e preenchimentos.
* **Campos e Informações:** Descrição detalhada dos campos, opções e obrigatoriedades.
* **Resultado Esperado:** O que acontece na interface e na operação após salvar ou confirmar.
* **Como Conferir:** Onde verificar se a operação foi gravada e processada corretamente.
* **Cuidados Importantes:** Restrições operacionais e pontos de atenção.
* **Problemas Comuns:** Soluções para erros de preenchimento ou dúvidas frequentes.
* **Próxima Etapa:** Qual o fluxo natural de trabalho que se segue.

---

## SUMÁRIO GERAL NAVEGÁVEL

* [ELEMENTOS INICIAIS](#manual-do-usuário--sistema-duno)
  * [Apresentação do Manual](#apresentação-do-manual)
  * [Objetivo deste Documento](#objetivo-deste-documento)
  * [Público-Alvo](#público-alvo)
  * [Como Utilizar este Manual](#como-utilizar-este-manual)
  * [Legenda de Elementos e Convenções](#legenda-de-elementos-e-convenções-visuais)
* [PARTE I — CONHECENDO O SISTEMA DUNO](#parte-i--conhecendo-o-sistema-duno)
  * [Capítulo 1: Arquitetura Funcional e Ambientes Integrados](#capítulo-1-arquitetura-funcional-e-ambientes-integrados)
    * [1.1 Os Quatro Ambientes do Ecossistema Duno](#11-os-quatro-ambientes-do-ecossistema-duno)
    * [1.2 Sincronização em Tempo Real e Continuidade Operacional](#12-sincronização-em-tempo-real-e-continuidade-operacional)
  * [Capítulo 2: Perfis de Usuário, Responsabilidades e RBAC](#capítulo-2-perfis-de-usuário-responsabilidades-e-rbac)
    * [2.1 Matriz de Papéis e Permissões do Sistema](#21-matriz-de-papéis-e-permissões-do-sistema)
    * [2.2 Isolamento de Dados por Empresa](#22-isolamento-de-dados-por-empresa)
  * [Capítulo 3: Diferenças Essenciais entre o Sistema Web e o App Móvel](#capítulo-3-diferenças-essenciais-entre-o-sistema-web-e-o-app-móvel)
* [PARTE II — PRIMEIROS PASSOS E CONFIGURAÇÃO DA EMPRESA](#parte-ii--primeiros-passos-e-configuração-da-empresa)
  * [Capítulo 4: Autenticação, Acesso Seguro e Identificação Operacional](#capítulo-4-autenticação-acesso-seguro-e-identificação-operacional)
    * [4.1 Login por E-mail e Senha e Google SSO](#41-login-por-e-mail-e-senha-e-google-sso)
    * [4.2 Recuperação e Redefinição de Senha](#42-recuperação-e-redefinição-de-senha)
    * [4.3 Código de Identidade Exclusivo (PIN Operacional de 6 Dígitos)](#43-código-de-identidade-exclusivo-pin-operacional-de-6-dígitos)
  * [Capítulo 5: Interface do Usuário, Navegação e Indicadores Globais](#capítulo-5-interface-do-usuário-navegação-e-indicadores-globais)
    * [5.1 Barra Lateral Retrátil e Categorias de Menus](#51-barra-lateral-retrátil-e-categorias-de-menus)
    * [5.2 Central de Notificações Internas e Modais de Leitura Obrigatória](#52-central-de-notificações-internas-e-modais-de-leitura-obrigatória)
    * [5.3 Indicadores de Conexão e Saúde Operacional](#53-indicadores-de-conexão-e-saúde-operacional)
    * [5.4 Gestão do Perfil do Usuário e Foto de Avatar](#54-gestão-do-perfil-do-usuário-e-foto-de-avatar)
  * [Capítulo 6: Configurações da Empresa, Marca e Prazos de SLA](#capítulo-6-configurações-da-empresa-marca-e-prazos-de-sla)
    * [6.1 Cadastro dos Dados Institucionais e Logotipo](#61-cadastro-dos-dados-institucionais-e-logotipo)
    * [6.2 Cabeçalhos e Rodapés de Relatórios e Laudos Técnicos](#62-cabeçalhos-e-rodapés-de-relatórios-e-laudos-técnicos)
    * [6.3 Definição de Prazos de SLA por Prioridade de Atendimento](#63-definição-de-prazos-de-sla-por-prioridade-de-atendimento)
  * [Capítulo 7: Parâmetros do Aplicativo Móvel e Políticas de Campo](#capítulo-7-parâmetros-do-aplicativo-móvel-e-políticas-de-campo)
    * [7.1 Obrigatoriedade de Fotos e Evidências](#71-obrigatoriedade-de-fotos-e-evidências)
    * [7.2 Exigência de Assinatura Digital do Cliente](#72-exigência-de-assinatura-digital-do-cliente)
    * [7.3 Controle de GPS e Deslocamento](#73-controle-de-gps-e-deslocamento)
    * [7.4 Permissões de Adição de Peças pelo Técnico](#74-permissões-de-adição-de-peças-pelo-técnico)
  * [Capítulo 8: Roteiro Recomendado de Implantação e Sequência Inicial](#capítulo-8-roteiro-recomendado-de-implantação-e-sequência-inicial)
* [PARTE III — GUIA DETALHADO DOS MÓDULOS (SISTEMA WEB)](#parte-iii--guia-detalhado-dos-módulos-sistema-web)
  * [Capítulo 9: Painel Inicial (Dashboard Operacional e Métricas)](#capítulo-9-painel-inicial-dashboard-operacional-e-métricas)
    * [9.1 Visão Geral dos Indicadores e Cards Estatísticos](#91-visão-geral-dos-indicadores-e-cards-estatísticos)
    * [9.2 Monitoramento da Fila de Atendimento e Atrasos em Tempo Real](#92-monitoramento-da-fila-de-atendimento-e-atrasos-em-tempo-real)
    * [9.3 Filtros Avançados por Período, Técnico, Cliente e Status](#93-filtros-avançados-por-período-técnico-cliente-e-status)
  * [Capítulo 10: Gestão Completa de Clientes](#capítulo-10-gestão-completa-de-clientes)
    * [10.1 Cadastro de Clientes (Pessoa Física e Pessoa Jurídica)](#101-cadastro-de-clientes-pessoa-física-e-pessoa-jurídica)
    * [10.2 Busca Inteligente e Validação Anti-Duplicidade de CPF/CNPJ](#102-busca-inteligente-e-validação-anti-duplicidade-de-cpfcnpj)
    * [10.3 Gestão de Múltiplos Endereços e Contatos Telefônicos](#103-gestão-de-múltiplos-endereços-e-contatos-telefônicos)
    * [10.4 Consulta ao Histórico Unificado de Atendimentos do Cliente](#104-consulta-ao-histórico-unificado-de-atendimentos-do-cliente)
  * [Capítulo 11: Gestão de Equipamentos e Ativos dos Clientes](#capítulo-11-gestão-de-equipamentos-e-ativos-dos-clientes)
    * [11.1 Cadastro Técnico de Ativos e Vinculação ao Cliente](#111-cadastro-técnico-de-ativos-e-vinculação-ao-cliente)
    * [11.2 Famílias e Categorias de Equipamentos](#112-famílias-e-categorias-de-equipamentos)
    * [11.3 Geração e Impressão de Etiquetas com QR Code Patrimonial](#113-geração-e-impressão-de-etiquetas-com-qr-code-patrimonial)
    * [11.4 Consulta ao Histórico Técnico por Número de Série](#114-consulta-ao-histórico-técnico-por-número-de-série)
  * [Capítulo 12: Motor de Formulários Dinâmicos e Checklists Técnicos](#capítulo-12-motor-de-formulários-dinâmicos-e-checklists-técnicos)
    * [12.1 Criação de Modelos de Formulários e Checklists](#121-criação-de-modelos-de-formulários-e-checklists)
    * [12.2 Tipos de Campos Suportados e Condições Lógicas](#122-tipos-de-campos-suportados-e-condições-lógicas)
    * [12.3 Regras de Ativação Automática (Serviço + Família de Ativo)](#123-regras-de-ativação-automática-serviço--família-de-ativo)
    * [12.4 Catálogo de Defeitos e Diagnósticos Padronizados](#124-catálogo-de-defeitos-e-diagnósticos-padronizados)
  * [Capítulo 13: Gestão de Técnicos e Equipes de Campo](#capítulo-13-gestão-de-técnicos-e-equipes-de-campo)
    * [13.1 Cadastro de Técnicos, Especialidades e Informações de Contato](#131-cadastro-de-técnicos-especialidades-e-informações-de-contato)
    * [13.2 Configuração de Vínculo, Código Único e Habilitação de Acesso ao App](#132-configuração-de-vínculo-código-único-e-habilitação-de-acesso-ao-app)
    * [13.3 Definição de Comissões e Produtividade](#133-definição-de-comissões-e-produtividade)
  * [Capítulo 14: Gestão de Regiões Geográficas e Geofencing](#capítulo-14-gestão-de-regiões-geográficas-e-geofencing)
    * [14.1 Delimitação de Áreas de Atendimento no Mapa](#141-delimitação-de-áreas-de-atendimento-no-mapa)
    * [14.2 Atribuição de Técnicos por Região e Taxas de Deslocamento](#142-atribuição-de-técnicos-por-região-e-taxas-de-deslocamento)
  * [Capítulo 15: Central de Ordens de Serviço — Abertura e Emissão](#capítulo-15-central-de-ordens-de-serviço--abertura-e-emissão)
    * [15.1 O Wizard de Emissão de OS em 5 Etapas](#151-o-wizard-de-emissão-de-os-em-5-etapas)
    * [15.2 Etapa 1: Identificação do Cliente ou Busca por Serial](#152-etapa-1-identificação-do-cliente-ou-busca-por-serial)
    * [15.3 Etapa 2: Programação, Defeito Relatado, Prioridade e Técnico](#153-etapa-2-programação-defeito-relatado-prioridade-e-técnico)
    * [15.4 Etapa 3: Definição do Escopo Operacional, Peças e Serviços](#154-etapa-3-definição-do-escopo-operacional-peças-e-serviços)
    * [15.5 Etapa 4: Composição de Valores, Custos e Condições Comerciais](#155-etapa-4-composição-de-valores-custos-e-condições-comerciais)
    * [15.6 Etapa 5: Resumo do Protocolo e Emissão do Código Oficial](#156-etapa-5-resumo-do-protocolo-e-emissão-do-código-oficial)
  * [Capítulo 16: Gestão da Ordem de Serviço — As 10 Abas do Painel Operacional](#capítulo-16-gestão-da-ordem-de-serviço--as-10-abas-do-painel-operacional)
    * [16.1 Aba 1: Visão Geral do Atendimento](#161-aba-1-visão-geral-do-atendimento)
    * [16.2 Aba 2: Anotações Internas e Comunicação Confidencial](#162-aba-2-anotações-internas-e-comunicação-confidencial)
    * [16.3 Aba 3: Ativos e Equipamentos Vinculados](#163-aba-3-ativos-e-equipamentos-vinculados)
    * [16.4 Aba 4: Formulários Técnicos e Respostas de Checklists](#164-aba-4-formulários-técnicos-e-respostas-de-checklists)
    * [16.5 Aba 5: Execução Técnica, Laudo e Recomendações](#165-aba-5-execução-técnica-laudo-e-recomendações)
    * [16.6 Aba 6: Mídias, Fotografias de Antes/Depois e Evidências](#166-aba-6-mídias-fotografias-de-antesdepois-e-evidências)
    * [16.7 Aba 7: Linha do Tempo e Auditoria Operacional Imutável](#167-aba-7-linha-do-tempo-e-auditoria-operacional-imutável)
    * [16.8 Aba 8: Composição de Custos, Peças e Margem](#168-aba-8-composição-de-custos-peças-e-margem)
    * [16.9 Aba 9: Histórico e Gerenciamento de Visitas e Retornos](#169-aba-9-histórico-e-gerenciamento-de-visitas-e-retornos)
    * [16.10 Aba 10: Histórico de Impedimentos e Bloqueios](#1610-aba-10-histórico-de-impedimentos-e-bloqueios)
    * [16.11 Emissão e Impressão do Laudo Técnico Oficial em PDF](#1611-emissão-e-impressão-do-laudo-técnico-oficial-em-pdf)
    * [16.12 Compartilhamento de Link Público de Acompanhamento](#1612-compartilhamento-de-link-público-de-acompanhamento)
  * [Capítulo 17: Agenda e Calendário de Atendimentos](#capítulo-17-agenda-e-calendário-de-atendimentos)
    * [17.1 Visualização em Grade Mensal, Semanal e Diária](#171-visualização-em-grade-mensal-semanal-e-diária)
    * [17.2 Distribuição de Atendimentos e Prevenção de Conflitos](#172-distribuição-de-atendimentos-e-prevenção-de-conflitos)
  * [Capítulo 18: Visão de Campo e Monitoramento GPS (Duno Maps)](#capítulo-18-visão-de-campo-e-monitoramento-gps-duno-maps)
    * [18.1 Mapa Interativo em Tempo Real de Técnicos e OS](#181-mapa-interativo-em-tempo-real-de-técnicos-e-os)
    * [18.2 Identificação de Status de Movimentação e Rotas](#182-identificação-de-status-de-movimentação-e-rotas)
  * [Capítulo 19: Central de Solicitações de Atendimento (Triagem)](#capítulo-19-central-de-solicitações-de-atendimento-triagem)
    * [19.1 Fila de Solicitações Recebidas e Status](#191-fila-de-solicitações-recebidas-e-status)
    * [19.2 Conversão Direta em Ordem de Serviço](#192-conversão-direta-em-ordem-de-serviço)
    * [19.3 Resolução Remota e Rejeição Justificada](#193-resolução-remota-e-rejeição-justificada)
  * [Capítulo 20: WhatsApp Inbox Integrado e Atendente IA ("Lia")](#capítulo-20-whatsapp-inbox-integrado-e-atendente-ia-lia)
    * [20.1 Central Omnichannel de Conversas e Mensagens](#201-central-omnichannel-de-conversas-e-mensagens)
    * [20.2 Triagem Automática com IA e Coleta de Dados](#202-triagem-automática-com-ia-e-coleta-de-dados)
    * [20.3 Transbordo para Atendimento Humano](#203-transbordo-para-atendimento-humano)
    * [20.4 Reativação do Robô e Envio de Documentos](#204-reativação-do-robô-e-envio-de-documentos)
  * [Capítulo 21: Gestão Comercial — Orçamentos e Propostas](#capítulo-21-gestão-comercial--orçamentos-e-propostas)
    * [21.1 Criação de Propostas com Peças e Serviços](#211-criação-de-propostas-com-peças-e-serviços)
    * [21.2 Envio por Link Público para Aprovação do Cliente](#212-envio-por-link-público-para-aprovação-do-cliente)
    * [21.3 Assinatura Digital Online e Conversão em OS](#213-assinatura-digital-online-e-conversão-em-os)
  * [Capítulo 22: Pedidos de Venda (Faturamento de Balcão)](#capítulo-22-pedidos-de-venda-faturamento-de-balcão)
    * [22.1 Criação de Pedidos de Venda Direta](#221-criação-de-pedidos-de-venda-direta)
    * [22.2 Baixa de Estoque e Integração Financeira](#222-baixa-de-estoque-e-integração-financeira)
  * [Capítulo 23: Almoxarifado Digital e Controle de Estoque](#capítulo-23-almoxarifado-digital-e-controle-de-estoque)
    * [23.1 Cadastro de Peças, Insumos e Estoque Mínimo](#231-cadastro-de-peças-insumos-e-estoque-mínimo)
    * [23.2 Movimentações: Entradas, Saídas e Ajustes](#232-movimentações-entradas-saídas-e-ajustes)
    * [23.3 Estoque dos Técnicos e Transferências de Peças](#233-estoque-dos-técnicos-e-transferências-de-peças)
    * [23.4 Balanço Físico de Inventário e Auditoria com QR Code](#234-balanço-físico-de-inventário-e-auditoria-com-qr-code)
  * [Capítulo 24: Contratos Recorrentes, Manutenção Preventiva e PMOC](#capítulo-24-contratos-recorrentes-manutenção-preventiva-e-pmoc)
    * [24.1 Configuração de Contratos Periódicos e PMOC](#241-configuração-de-contratos-periódicos-e-pmoc)
    * [24.2 Vínculo de Múltiplos Ativos e Cronograma de Visitas](#242-vínculo-de-múltiplos-ativos-e-cronograma-de-visitas)
    * [24.3 Geração Automática das Ordens de Serviço Preventivas](#243-geração-automática-das-ordens-de-serviço-preventivas)
  * [Capítulo 25: Gestão Financeira — Contas a Receber e Faturamento](#capítulo-25-gestão-financeira--contas-a-receber-e-faturamento)
    * [25.1 Faturamento de OS e Orçamentos Aprovados](#251-faturamento-de-os-e-orçamentos-aprovados)
    * [25.2 Gestão de Faturas e Cobrança Integrada (Pix, Boleto, Cartão)](#252-gestão-de-faturas-e-cobrança-integrada-pix-boleto-cartão)
    * [25.3 Emissão de Recibos de Pagamento e NFS-e](#253-emissão-de-recibos-de-pagamento-e-nfs-e)
  * [Capítulo 26: Gestão Financeira — Contas a Pagar, Fluxo de Caixa e Comissões](#capítulo-26-gestão-financeira--contas-a-pagar-fluxo-de-caixa-e-comissões)
    * [26.1 Contas a Pagar e Despesas Operacionais](#261-contas-a-pagar-e-despesas-operacionais)
    * [26.2 Fluxo de Caixa e DRE Operacional](#262-fluxo-de-caixa-e-dre-operacional)
    * [26.3 Apuração Automática e Quitação de Comissões de Técnicos](#263-apuração-automática-e-quitação-de-comissões-de-técnicos)
  * [Capítulo 27: Controle de Acesso, Usuários e PIN Operacional](#capítulo-27-controle-de-acesso-usuários-e-pin-operacional)
    * [27.1 Cadastro de Usuários do Painel Administrativo](#271-cadastro-de-usuários-do-painel-administrativo)
    * [27.2 Grupos de Permissão e Níveis de Acesso (RBAC)](#272-grupos-de-permissão-e-níveis-de-acesso-rbac)
    * [27.3 Código de Identidade Exclusivo (PIN de 6 Dígitos)](#273-código-de-identidade-exclusivo-pin-de-6-dígitos)
  * [Capítulo 28: Integrações Operacionais, Portais Públicos e SuperAdmin](#capítulo-28-integrações-operacionais-portais-públicos-e-superadmin)
    * [28.1 Configuração de Gateway de Pagamento e Webhooks](#281-configuração-de-gateway-de-pagamento-e-webhooks)
    * [28.2 Portais Públicos sem Senha (Acompanhamento e Checkout)](#282-portais-públicos-sem-senha-acompanhamento-e-checkout)
    * [28.3 Painel Master de Governança Multi-Empresas e Licenciamento](#283-painel-master-de-governança-multi-empresas-e-licenciamento)
* [PARTE IV — MANUAL DO APLICATIVO MÓVEL DO TÉCNICO](#parte-iv--manual-do-aplicativo-móvel-do-técnico)
  * [Capítulo 29: Instalação, Primeiro Acesso e Autenticação](#capítulo-29-instalação-primeiro-acesso-e-autenticação)
    * [29.1 Instalação no Smartphone e Acesso PWA](#291-instalação-no-smartphone-e-acesso-pwa)
    * [29.2 Login do Técnico, PIN de Identificação e Termos de Uso](#292-login-do-técnico-pin-de-identificação-e-termos-de-uso)
  * [Capítulo 30: Interface do App e Feed Diário de Atendimentos](#capítulo-30-interface-do-app-e-feed-diário-de-atendimentos)
    * [30.1 Telas Principais e Navegação por Abas](#301-telas-principais-e-navegação-por-abas)
    * [30.2 Leitura dos Cards de Ordens de Serviço](#302-leitura-dos-cards-de-ordens-de-serviço)
    * [30.3 Contato Rápido com o Cliente via WhatsApp](#303-contato-rápido-com-o-cliente-via-whatsapp)
  * [Capítulo 31: Deslocamento, Chegada e Registro de Impedimentos](#capítulo-31-deslocamento-chegada-e-registro-de-impedimentos)
    * [31.1 Abertura de Rota no GPS (Google Maps / Waze)](#311-abertura-de-rota-no-gps-google-maps--waze)
    * [31.2 Registro de "Iniciar Deslocamento" e "Cheguei no Local"](#312-registro-de-iniciar-deslocamento-e-cheguei-no-local)
    * [31.3 Registro de Impedimento com Fotos e Testemunha](#313-registro-de-impedimento-com-fotos-e-testemunha)
  * [Capítulo 32: Execução Técnica Guiada da Ordem de Serviço](#capítulo-32-execução-técnica-guiada-da-ordem-de-serviço)
    * [32.1 O Fluxo de Execução Passo a Passo no Celular](#321-o-fluxo-de-execução-passo-a-passo-no-celular)
    * [32.2 Preenchimento Obrigatório de Checklists por Ativo](#322-preenchimento-obrigatório-de-checklists-por-ativo)
    * [32.3 Lançamento de Peças e Insumos do Estoque do Carro](#323-lançamento-de-peças-e-insumos-do-estoque-do-carro)
    * [32.4 Registro Fotográfico e em Vídeo das Evidências](#324-registro-fotográfico-e-em-vídeo-das-evidências)
    * [32.5 Redação do Laudo Técnico Pericial e Recomendações](#325-redação-do-laudo-técnico-pericial-e-recomendações)
  * [Capítulo 33: Validação, Assinaturas Digitais e Encerramento](#capítulo-33-validação-assinaturas-digitais-e-encerramento)
    * [33.1 Conferência dos Dados com o Responsável no Local](#331-conferência-dos-dados-com-o-responsável-no-local)
    * [33.2 Coleta da Assinatura Digital do Cliente na Tela](#332-coleta-da-assinatura-digital-do-cliente-na-tela)
    * [33.3 Assinatura do Técnico e Botão Finalizar Atendimento](#333-assinatura-do-técnico-e-botão-finalizar-atendimento)
  * [Capítulo 34: Recursos Adicionais do Aplicativo Móvel](#capítulo-34-recursos-adicionais-do-aplicativo-móvel)
    * [34.1 Consulta da Agenda e Escala de Trabalho](#341-consulta-da-agenda-e-escala-de-trabalho)
    * [34.2 Consulta do Estoque de Peças no Veículo](#342-consulta-do-estoque-de-peças-no-veículo)
    * [34.3 Chat com Duno IA para Dúvidas Técnicas e Manuais](#343-chat-com-duno-ia-para-dúvidas-técnicas-e-manuais)
  * [Capítulo 35: Resiliência — Operação Offline e Smart Sync](#capítulo-35-resiliência--operação-offline-e-smart-sync)
    * [35.1 Como o Duno Opera em Áreas Sem Sinal](#351-como-o-duno-opera-em-áreas-sem-sinal)
    * [35.2 A Fila de Sincronização Inteligente (Smart Sync)](#352-a-fila-de-sincronização-inteligente-smart-sync)
    * [35.3 Cuidados ao Trocar de Conexão e Garantia de Dados](#353-cuidados-ao-trocar-de-conexão-e-garantia-de-dados)
  * [Capítulo 36: Boas Práticas e Recomendações para Técnicos](#capítulo-36-boas-práticas-e-recomendações-para-técnicos)
* [PARTE V — FLUXOS OPERACIONAIS DE PONTA A PONTA](#parte-v--fluxos-operacionais-de-ponta-a-ponta)
  * [Fluxo 1: Ciclo Completo da Ordem de Serviço](#fluxo-1-ciclo-completo-da-ordem-de-serviço)
  * [Fluxo 2: Atendimento no WhatsApp até a Abertura da OS](#fluxo-2-atendimento-no-whatsapp-até-a-abertura-da-os)
  * [Fluxo 3: Orçamento Comercial -> Assinatura Online -> OS](#fluxo-3-orçamento-comercial---assinatura-online---os)
  * [Fluxo 4: Contrato PMOC -> Cronograma Preventivo -> Execução](#fluxo-4-contrato-pmoc---cronograma-preventivo---execução)
  * [Fluxo 5: Controle de Peças: Almoxarifado -> Veículo -> OS](#fluxo-5-controle-de-peças-almoxarifado---veículo---os)
  * [Fluxo 6: Conclusão do Serviço -> Fatura Pix/Boleto -> Quitação](#fluxo-6-conclusão-do-serviço---fatura-pixboleto---quitação)
* [PARTE VI — GUIA DE SOLUÇÃO DE PROBLEMAS E SUPORTE](#parte-vi--guia-de-solução-de-problemas-e-suporte)
  * [Diagnóstico Rápido de Dificuldades Operacionais Comuns (12 Casos)](#diagnóstico-rápido-de-dificuldades-operacionais-comuns-12-casos)
  * [Como Entrar em Contato com o Suporte Oficial Duno](#como-entrar-em-contato-com-o-suporte-oficial-duno)
* [PARTE VII — REFERÊNCIA RÁPIDA, GLOSSÁRIO E FAQ](#parte-vii--referência-rápida-glossário-e-faq)
  * [Glossário Técnico e Operacional de Termos Duno](#glossário-técnico-e-operacional-de-termos-duno)
  * [Matriz de Referência Rápida de Procedimentos](#matriz-de-referência-rápida-de-procedimentos)
  * [Perguntas Frequentes (FAQ)](#perguntas-frequentes-faq)

---
"""
