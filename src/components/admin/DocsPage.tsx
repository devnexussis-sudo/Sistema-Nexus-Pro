import React, { useState, useMemo, useRef } from 'react';
import {
    BookOpen, Search, HelpCircle, Layers, ArrowRight,
    Bot, Calendar, Settings, ShieldAlert, Users, Box, Package,
    FileText, ClipboardList, DollarSign, Workflow, Wrench,
    Map, ChevronDown, ChevronUp, ExternalLink, Code2, Info, ShieldCheck, PlayCircle,
    LayoutDashboard, MapPin, MessageCircle
} from 'lucide-react';

interface ModuleDoc {
    id: string;
    title: string;
    category: 'workflow' | 'engineering' | 'security' | 'design';
    stepRelation: number; // 1 a 6 de acordo com a pipeline de implantação
    icon: any;
    menuPath: string;
    filePath: string;
    dbTable?: string;
    description: string;
    steps: string[];
    technicalDetails?: string;
}

export const DocsPage: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [activeSection, setActiveSection] = useState<'all' | 'workflow' | 'engineering' | 'security' | 'design'>('all');
    const [selectedStep, setSelectedStep] = useState<number | null>(null);
    const [expandedModule, setExpandedModule] = useState<string | null>(null);
    const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

    // Refs para navegação por scroll suave
    const pipelineRef = useRef<HTMLDivElement>(null);
    const modulesRef = useRef<HTMLDivElement>(null);
    const faqRef = useRef<HTMLDivElement>(null);

    const modules: ModuleDoc[] = [
        {
            id: 'config',
            title: "Configurações Iniciais da Organização",
            category: 'workflow',
            stepRelation: 1,
            icon: Settings,
            menuPath: "Menu Lateral > Configurações > Aba 'Organização'",
            filePath: "src/components/admin/SystemSettings.tsx",
            dbTable: "public.tenants",
            description: "A fundação de personalização da plataforma. Define os metadados utilizados em faturamentos, relatórios PDF, regras de SLA e controle de recursos avançados como o Geofencing.",
            steps: [
                "Insira a Razão Social, CNPJ, Inscrição Estadual e dados fiscais e telefone de contato oficial da sua empresa.",
                "Efetue o upload do logotipo oficial da empresa em alta resolução. O arquivo é armazenado no Supabase Storage e injetado automaticamente nos relatórios de visitas e orçamentos em PDF.",
                "Aba APP do Técnico: Gerencie permissões de exibição de valores monetários, preenchimento de checklists obrigatórios e se o técnico pode ter múltiplos atendimentos simultâneos no aplicativo móvel.",
                "Aba Regras de Geofencing: Habilite a chave de geofencing global ('enableGeofencing' nos metadados do tenant) para impor regras de restrição geográfica no agendamento de OS e Visitas.",
                "Aba SLA e Metas: Defina os prazos limites de atendimento normal e crítico (24h/48h) para alimentar o cálculo dinâmico de eficiência SLA exposto no Dashboard."
            ],
            technicalDetails: "Apenas usuários com o nível Master Admin (Tenant Owner) possuem privilégios de gravação nesta tabela, garantindo o isolamento da conta."
        },
        {
            id: 'users',
            title: "Controle de Acesso (Usuários e Grupos)",
            category: 'security',
            stepRelation: 2,
            icon: ShieldAlert,
            menuPath: "Menu Lateral > Usuários",
            filePath: "src/components/admin/UserManagement.tsx",
            dbTable: "public.profiles & public.user_groups",
            description: "Gerencia quem tem acesso ao painel e restringe ações de Criar, Editar, Visualizar ou Excluir por meio de políticas granulares de permissão vinculadas a grupos.",
            steps: [
                "Acesse a gestão de Grupos e crie perfis de acesso sob medida (ex: Almoxarife, Supervisor de Campo, Faturamento, Operador de Call Center).",
                "Defina permissões granulares por módulo de sistema, habilitando/desabilitando ações de Leitura (View), Escrita (Create/Edit) e Exclusão (Delete).",
                "Configure se o grupo de permissões tem acesso à aba sensível de 'Gestão de Regiões' e alteração de regras do Geofencing.",
                "Cadastre novos usuários inserindo nome, e-mail e vinculando-os a um Grupo de Permissões. O convite é enviado por e-mail para que o usuário crie sua senha via fluxo seguro LGPD.",
                "Monitore logs de último login e utilize o botão de suspensão instantânea para bloquear acessos de funcionários desligados."
            ],
            technicalDetails: "Toda consulta executa a função 'get_user_tenant_id()' na camada de banco de dados, aplicando o Row Level Security (RLS) de forma inviolável."
        },
        {
            id: 'customers',
            title: "Gestão e Cadastro de Clientes",
            category: 'workflow',
            stepRelation: 3,
            icon: Users,
            menuPath: "Menu Lateral > Cliente",
            filePath: "src/components/admin/CustomerManagement.tsx",
            dbTable: "public.customers",
            description: "Centraliza o cadastro dos tomadores de serviços, geolocalizando-os no mapa e mantendo o histórico de faturamento, orçamentos, ativos e chamados históricos.",
            steps: [
                "Clique em '+ Novo Cliente' e digite os dados básicos. Insira CNPJ/CPF com validação nativa de integridade tributária.",
                "Informe o CEP. O sistema preencherá automaticamente logradouro, bairro, cidade e estado a partir do banco nacional.",
                "CRÍTICO: Preencha sempre o número da residência/estabelecimento no campo específico. As coordenadas geográficas exatas (latitude e longitude) do cliente são geradas pelo motor de geocoding com base no endereço completo contendo o número. Caso o número não seja incluído, a precisão geográfica cai drasticamente, podendo fazer o cliente cair fora do polígono de Geofencing configurado.",
                "Abra a gaveta (drawer) de detalhes do cliente para visualizar o histórico consolidado de faturamento, orçamentos aprovados, ativos cadastrados e todas as OSs vinculadas."
            ],
            technicalDetails: "Integração nativa com rotas de CEP brasileiras e persistência de coordenadas em pontos geográficos PostGIS. Validações especiais impedem coordenadas nulas em endereços válidos com número."
        },
        {
            id: 'techs',
            title: "Cadastro de Técnicos e Equipe de Campo",
            category: 'workflow',
            stepRelation: 3,
            icon: Wrench,
            menuPath: "Menu Lateral > Técnicos",
            filePath: "src/components/admin/TechnicianManagement.tsx",
            dbTable: "public.technicians",
            description: "Gerencia os agentes que operam externamente. Técnicos não acessam este painel web, apenas o App Duno móvel para a execução de chamados em campo.",
            steps: [
                "Cadastre nome, e-mail de acesso ao aplicativo móvel, especialidade técnica principal e telefone celular (com DDD).",
                "Associe uma cor personalizada para o técnico. Esta cor será utilizada para pintar a rota e o pino GPS dele no mapa em tempo real, além de colorir seus blocos no Calendário de Agendamentos.",
                "Configure se o técnico está ativo ou indisponível (férias, licença). Técnicos indisponíveis são bloqueados no App móvel e ocultados das listas de agendamento de OS, sem quebrar o histórico de serviços passados.",
                "O contato do técnico possui integração direta de WhatsApp no painel administrativo, permitindo que a central de despacho inicie conversas com um clique."
            ]
        },
        {
            id: 'regions',
            title: "Regiões de Atendimento e Geofencing",
            category: 'security',
            stepRelation: 3,
            icon: MapPin,
            menuPath: "Menu Lateral > Gestão de Regiões",
            filePath: "src/components/admin/RegionManagement.tsx",
            dbTable: "public.service_regions",
            description: "Delimita no mapa geográfico as áreas de atuação (polígonos) de técnicos específicos. Impede que operadores escalem técnicos que não cobrem a região onde o cliente reside.",
            steps: [
                "Habilite a regra de Geofencing em 'Configurações > Organização' para ativar a validação territorial.",
                "Acesse 'Gestão de Regiões', clique em '+ Nova Região', defina nome, cor e selecione quais técnicos estão autorizados a atuar ali.",
                "Utilize o cursor para clicar nos pontos do mapa e desenhar um polígono correspondente ao limite geográfico da área de atuação. Clique em salvar.",
                "Ao abrir uma OS ou agendar/editar uma Visita Técnica, o sistema valida por meio do Turf.js se o endereço do cliente está contido no polígono.",
                "Se o cliente estiver em uma região demarcada, apenas os técnicos autorizados para ela estarão ativos para agendamento. Técnicos não permitidos aparecem com opacidade reduzida e um ícone de bloqueio, impedindo o salvamento e emitindo um aviso em caso de seleção incorreta."
            ],
            technicalDetails: "Executa cálculos espaciais de Point-in-Polygon utilizando a biblioteca Turf.js no client-side para verificar se as coordenadas geográficas do cliente intersectam os polígonos GeoJSON gravados no PostgreSQL."
        },
        {
            id: 'equip',
            title: "Gestão de Ativos (Equipamentos)",
            category: 'workflow',
            stepRelation: 4,
            icon: Box,
            menuPath: "Menu Lateral > Ativos",
            filePath: "src/components/admin/EquipmentManagement.tsx",
            dbTable: "public.equipments",
            description: "Inventário de máquinas e equipamentos instalados nos clientes. Controla o ciclo de manutenção individual, histórico de trocas de peças e período de garantia ativa.",
            steps: [
                "Associe a máquina a um cliente anteriormente cadastrado no sistema.",
                "Insira dados como Número de Série, Marca, Modelo, Tag/Identificação e número de patrimônio corporativo.",
                "Preencha a data de fabricação/instalação e os meses de cobertura de garantia contratual.",
                "O sistema calcula e exibe um selo verde ('Em Garantia') ou vermelho ('Fora de Garantia') na tela da OS.",
                "Permite o upload de manual técnico e fotos do ativo para consulta do técnico no local pelo App."
            ],
            technicalDetails: "Permite o cálculo retroativo de garantia por meio de scripts Javascript e avisa o técnico no app celular antes do início do diagnóstico."
        },
        {
            id: 'stock',
            title: "Estoque e Emissão de Etiquetas QR Code",
            category: 'workflow',
            stepRelation: 4,
            icon: Package,
            menuPath: "Menu Lateral > Estoque",
            filePath: "src/components/admin/StockManagement.tsx",
            dbTable: "public.stock_items & public.stock_logs",
            description: "Almoxarifado digital de peças, ferramentas e consumíveis. Habilita a leitura e baixa física via QR Code no local do serviço.",
            steps: [
                "Cadastre as peças, insumos ou ferramentas informando SKU/Código, categoria, custo médio e o saldo atual em estoque.",
                "Selecione os itens desejados na tabela de estoque e clique no botão de impressão de etiquetas.",
                "Imprima os QR Codes no layout de folha A4 (laser) ou fitas de impressora térmica portátil.",
                "Coloque o adesivo no produto. O técnico fará a leitura no App usando a câmera do celular para baixa automática do inventário ao utilizar o item em uma OS."
            ],
            technicalDetails: "Regras CSS de impressão scoped `@media print` ocultam cabeçalhos administrativos e organizam a quebra de página de forma limpa."
        },
        {
            id: 'forms',
            title: "Checklists e Formulários Customizados",
            category: 'design',
            stepRelation: 5,
            icon: Workflow,
            menuPath: "Menu Lateral > Formulários",
            filePath: "src/components/admin/FormManagement.tsx",
            dbTable: "public.forms & public.form_questions",
            description: "Substitui relatórios físicos por checklists digitais flexíveis e com validações condicionais no aplicativo móvel do técnico.",
            steps: [
                "Crie o formulário e monte as perguntas (respostas em texto, fotos obrigatórias, números ou assinatura digital).",
                "Defina as Regras de Ativação do checklist (ex: apenas quando a OS for 'Instalação' e a categoria do Ativo for 'Ar Condicionado').",
                "Quando o técnico inicia a OS correspondente em campo, o formulário é carregado automaticamente na aba de execução.",
                "O preenchimento completo é obrigatório caso haja perguntas marcadas com tal restrição, bloqueando a finalização da OS no App."
            ],
            technicalDetails: "As respostas são persistidas no banco em estrutura de dados JSONB para flexibilidade de relatórios futuros."
        },
        {
            id: 'contracts',
            title: "Contratos e Automação de PMOC",
            category: 'workflow',
            stepRelation: 6,
            icon: Calendar,
            menuPath: "Menu Lateral > Contratos",
            filePath: "src/components/admin/PlannedMaintenance.tsx",
            dbTable: "public.contracts & public.contract_assets",
            description: "Automação para planos de manutenção preventiva sistemática de longa duração, atendendo aos requisitos legais do PMOC.",
            steps: [
                "Selecione o Cliente, vincule o valor de faturamento recorrente mensal e as máquinas cobertas pelo plano.",
                "Escolha a periodicidade das visitas preventivas (mensal, bimestral, trimestral, etc.).",
                "Defina a data de vigência final. O motor do Duno gerará as Ordens de Serviço preventivas na data correta automaticamente de forma programada."
            ]
        },
        {
            id: 'quotes',
            title: "Orçamentos e Links Públicos de Aprovação",
            category: 'workflow',
            stepRelation: 6,
            icon: FileText,
            menuPath: "Menu Lateral > Orçamentos",
            filePath: "src/components/admin/QuoteManagement.tsx",
            dbTable: "public.quotes & public.quote_items",
            description: "Propostas comerciais contendo peças e mão de obra, prontas para aprovação digital externa pelo cliente final.",
            steps: [
                "Adicione peças e defina valores e condições de pagamento do orçamento.",
                "Clique em 'Link Público' para obter a URL externa e envie-a para o cliente por WhatsApp ou e-mail.",
                "O cliente acessa a proposta (responsiva, sem necessidade de login), assina digitalmente e aprova ou recusa.",
                "A aprovação atualiza o status do painel imediatamente e desconta a reserva do estoque."
            ],
            technicalDetails: "Tabela de itens calcula impostos e margens de lucro dinamicamente em React antes de salvar o payload."
        },
        {
            id: 'orders',
            title: "Abertura e Cockpit de Ordens de Serviço (OS)",
            category: 'workflow',
            stepRelation: 6,
            icon: ClipboardList,
            menuPath: "Menu Lateral > Atividade",
            filePath: "src/components/admin/AdminDashboard.tsx",
            dbTable: "public.orders",
            description: "O centro nervoso de despacho. Gerencia o andamento do técnico, visitas, fotos tiradas em campo e timelines.",
            steps: [
                "Crie uma OS no assistente de 5 etapas (Cliente, Tipo, Detalhes, Técnico e Agendamento).",
                "Acompanhe o painel da OS: veja as mídias salvas em tempo real, timelines detalhadas e logs de impedimento do técnico.",
                "Ao finalizar, clique em 'Exportar Relatório' para gerar o documento PDF A4 completo com fotos e assinaturas."
            ]
        },
        {
            id: 'map',
            title: "Visão de Campo (Logística & GPS)",
            category: 'workflow',
            stepRelation: 6,
            icon: Map,
            menuPath: "Menu Lateral > Visão de Campo",
            filePath: "src/components/admin/TechnicianMap.tsx",
            dbTable: "public.technicians_locations",
            description: "Painel geográfico de despacho que mostra a localização atual dos técnicos em campo e os endereços de clientes ativos.",
            steps: [
                "Monitore pins coloridos de técnicos se deslocando em tempo real.",
                "Passe o mouse ou clique no pino para ver o contato do profissional, OS em andamento e status do veículo.",
                "O sistema utiliza a API de mapas para ajudar a otimizar a distribuição geográfica de novos chamados."
            ],
            technicalDetails: "Alimenta-se de coordenadas coletadas e enviadas por requisições em background do celular do técnico."
        },
        {
            id: 'financial',
            title: "Dashboard Financeiro e Faturamento",
            category: 'workflow',
            stepRelation: 6,
            icon: DollarSign,
            menuPath: "Menu Lateral > Financeiro",
            filePath: "src/components/admin/FinancialDashboard.tsx",
            dbTable: "public.orders & public.quotes",
            description: "Agregador de receitas de serviços finalizados e orçamentos aprovados. Fornece relatórios executivos de lucros.",
            steps: [
                "Defina o período desejado na barra de filtros superiores.",
                "Analise gráficos de receitas por tipo de serviço e faturamento por técnico.",
                "Exporte relatórios consolidados no formato A4, formatados especificamente para auditoria interna."
            ]
        },
        {
            id: 'integrations',
            title: "Integrações, Chaves de API e Webhooks",
            category: 'engineering',
            stepRelation: 6,
            icon: Code2,
            menuPath: "Menu Lateral > Integrações",
            filePath: "src/components/admin/IntegrationsPage.tsx",
            dbTable: "public.api_keys & public.webhooks",
            description: "Conecta a plataforma Duno a outros ERPs do mercado ou ferramentas de automação externa.",
            steps: [
                "Gere chaves Bearer com o prefixo 'nx_live_' para autenticar requisições REST externas.",
                "Configure webhooks apontando a URL de recebimento e selecionando os eventos (OS criada, alterada, etc.).",
                "Valide requisições em seu servidor utilizando a assinatura HMAC presente no cabeçalho HTTP."
            ],
            technicalDetails: "As chaves de API sofrem hash criptográfico SHA-256 no momento da gravação, impedindo vazamento de tokens."
        },
        {
            id: 'dashboard',
            title: "Dashboard de Indicadores Operacionais",
            category: 'workflow',
            stepRelation: 6,
            icon: LayoutDashboard,
            menuPath: "Menu Lateral > Dashboard",
            filePath: "src/components/admin/Dashboard.tsx",
            dbTable: "public.orders & public.customers",
            description: "Painel executivo com visão geral de SLA, Ordens de Serviço abertas, status de atendimento em tempo real e eficiência da equipe.",
            steps: [
                "Visualize o painel para ver as OS em andamento, em atraso ou finalizadas hoje.",
                "Acompanhe a taxa de SLA em relação à meta parametrizada nas Configurações.",
                "Monitore os indicadores de produtividade diária e mensal da sua operação."
            ]
        },
        {
            id: 'calendar',
            title: "Calendário e Agenda de Visitas",
            category: 'workflow',
            stepRelation: 6,
            icon: Calendar,
            menuPath: "Menu Lateral > Calendário",
            filePath: "src/components/admin/OrderCalendar.tsx",
            dbTable: "public.orders & public.service_visits",
            description: "Agenda interativa estilo drag-and-drop para planejar visitas, acompanhar cronogramas e distribuir serviços visualmente.",
            steps: [
                "Visualize os chamados agendados por dia, semana ou mês.",
                "Clique em qualquer card de visita para abrir o painel lateral com detalhes da OS.",
                "Filtre por técnico para entender a ocupação individual de cada profissional."
            ]
        },
        {
            id: 'ai',
            title: "Duno IA (Copilot Inteligente)",
            category: 'engineering',
            stepRelation: 6,
            icon: Bot,
            menuPath: "Menu Lateral > Duno IA",
            filePath: "src/components/admin/DunoBrain.tsx",
            dbTable: "Sem tabela (Processamento LLM)",
            description: "Assistente virtual integrado que analisa o código-fonte, dados operacionais e auxilia administradores a esclarecerem dúvidas de uso.",
            steps: [
                "Abra o painel da Duno IA no menu lateral.",
                "Digite sua dúvida sobre procedimentos operacionais ou técnicos (ex: 'como criar etiquetas de estoque?').",
                "A IA analisará a documentação interna e as tabelas para retornar uma resposta explicativa passo a passo."
            ]
        },
        {
            id: 'whatsapp',
            title: "Caixa de Entrada WhatsApp (Agente de IA)",
            category: 'workflow',
            stepRelation: 6,
            icon: MessageCircle,
            menuPath: "Menu Lateral > WhatsApp",
            filePath: "src/components/admin/WhatsAppInbox.tsx",
            dbTable: "public.whatsapp_messages & public.whatsapp_sessions",
            description: "Canal integrado de atendimento multicanal via WhatsApp. Possui um Agente de IA Duno nativo ('Lia') capaz de fazer triagem de clientes antes do transbordo humano.",
            steps: [
                "Visualize as conversas em andamento ou na fila de espera.",
                "O Agente de IA fará a triagem inicial do cliente e responderá dúvidas genéricas.",
                "Quando necessário, o operador pode assumir a conversa (transbordo humano), pausando temporariamente a IA Duno."
            ],
            technicalDetails: "Baseia-se em webhooks em tempo real e um sistema de fila para transbordo humano persistente."
        },
        {
            id: 'solicitacoes',
            title: "Central de Solicitações e Validações",
            category: 'workflow',
            stepRelation: 6,
            icon: ShieldCheck,
            menuPath: "Menu Lateral > Solicitações",
            filePath: "src/components/admin/SolicitacoesPage.tsx",
            dbTable: "public.solicitacoes_os",
            description: "Portal de aprovações onde o backoffice (supervisores) analisa e libera solicitações especiais originadas pelos técnicos em campo ou sistema.",
            steps: [
                "Abra a página de Solicitações para visualizar o painel Kanban com os cards de análise pendentes.",
                "Selecione uma solicitação para revisar os motivos ou evidências anexadas.",
                "Aprove ou Recuse a solicitação, emitindo uma justificativa para registro."
            ]
        }
    ];

    const faqs = [
        {
            q: "Como o isolamento de dados (Multi-Tenant RLS) garante a segurança das informações?",
            a: "Todas as tabelas do Duno possuem a política Row Level Security (RLS) habilitada no PostgreSQL. Quando qualquer query é feita, o banco de dados executa a função interna 'get_user_tenant_id()' para capturar a credencial de segurança do usuário autenticado. Isso impede fisicamente que uma empresa acesse os dados ou estoque de outra, mesmo em requisições de API."
        },
        {
            q: "Por que as etiquetas de código QR de estoque são cruciais para a operação em campo?",
            a: "O principal erro operacional em campo é o preenchimento incorreto de códigos de peças no relatório final do chamado. O sistema de etiquetas gera um QR Code exclusivo com base no SKU do item de estoque. O técnico simplesmente scaneia a etiqueta física com a câmera do smartphone usando o App Duno, o que valida e desconta o item de forma automatizada e com precisão absoluta."
        },
        {
            q: "Como o Duno lida com fotos e checklists obrigatórios?",
            a: "Ao criar um formulário no painel web, você pode configurar perguntas do tipo 'Foto Obrigatória'. O aplicativo móvel bloqueia o botão de conclusão do atendimento até que o técnico ative a câmera e registre a imagem. O envio de mídias é assíncrono e persistido em buckets específicos de armazenamento na nuvem."
        },
        {
            q: "Qual a diferença entre excluir um técnico e inativar seu cadastro?",
            a: "Ao excluir um técnico, você pode causar problemas de integridade referencial nas Ordens de Serviço históricas que ele executou. O método recomendado para profissionais afastados é a inativação: basta marcar o status como indisponível no painel. O técnico perde acesso ao App móvel e deixa de aparecer para agendamentos, mas todas as OS antigas continuam com o nome dele preservado."
        },
        {
            q: "Como funciona a validação territorial de Geofencing?",
            a: "Quando o Geofencing está ativo, o sistema valida se a latitude/longitude do cliente (calculada a partir do seu endereço e obrigatoriamente exigindo o número da residência) está contida dentro de algum polígono de região ativa cadastrada. Se o cliente estiver dentro de uma região, o operador só poderá agendar técnicos designados para aquela área específica. O sistema bloqueia visualmente outros técnicos e impede o salvamento de visitas/OS com técnicos não autorizados."
        },
        {
            q: "O que acontece se o cliente não estiver dentro de nenhuma região de atendimento?",
            a: "Caso as coordenadas do cliente não correspondam a nenhum polígono de região ativa demarcada no mapa, as regras de Geofencing não serão aplicadas. Todos os técnicos cadastrados e disponíveis na plataforma ficarão liberados para agendamento normalmente."
        },
        {
            q: "De onde a Duno IA retira as informações para responder às perguntas?",
            a: "A Duno IA lê a estrutura do código-fonte do projeto, metadados do banco de dados, dicionários de tradução e os manuais de ajuda do sistema em tempo real. Isso garante respostas ultra-precisas e atualizadas de acordo com a versão atualizada da plataforma de cada cliente."
        },
        {
            q: "Como o Agente de IA lida com arquivos de áudio e mídia no WhatsApp?",
            a: "Atualmente, a Lia (Agente de IA) intercepta tentativas de envio de áudios, imagens e mídias por parte do cliente final no WhatsApp. Ela responderá de forma humanizada e profissional informando que ainda não consegue processar ou escutar arquivos multimidia, pedindo que o cliente digite sua solicitação em texto."
        },
        {
            q: "O que é e para que serve o painel de Solicitações?",
            a: "O painel de Solicitações é uma central de auditoria que atua como um 'funil' de aprovação. Em vez de permitir ações destrutivas (ex: cancelamentos de OS sensíveis ou liberações excepcionais), o sistema cria um card no painel de solicitações para que os supervisores validem antes da execução. Isso mantém o controle e segurança sobre a operação."
        }
    ];

    // Helper para normalizar caracteres especiais e acentos em português
    const normalizeString = (str: string) => {
        return str
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase();
    };

    // Resetar filtros e buscar
    const handleClearFilters = () => {
        setSearchTerm('');
        setActiveSection('all');
        setSelectedStep(null);
    };

    // Filtragem de módulos dinâmica, ultra robusta e insensível a acentos (normalizada)
    const filteredModules = useMemo(() => {
        const cleanSearch = normalizeString(searchTerm.trim());
        
        return modules.filter(mod => {
            const matchesCategory = activeSection === 'all' || mod.category === activeSection;
            const matchesStep = selectedStep === null || mod.stepRelation === selectedStep;
            
            if (!cleanSearch) {
                return matchesCategory && matchesStep;
            }

            // Realiza busca normalizada ampla por palavras-chave em todos os metadados do módulo
            const matchesSearch = 
                normalizeString(mod.title).includes(cleanSearch) ||
                normalizeString(mod.description).includes(cleanSearch) ||
                normalizeString(mod.menuPath).includes(cleanSearch) ||
                normalizeString(mod.filePath).includes(cleanSearch) ||
                (mod.dbTable && normalizeString(mod.dbTable).includes(cleanSearch)) ||
                (mod.technicalDetails && normalizeString(mod.technicalDetails).includes(cleanSearch)) ||
                mod.steps.some(step => normalizeString(step).includes(cleanSearch));
            
            return matchesSearch;
        });
    }, [searchTerm, activeSection, selectedStep]);

    // Filtra as FAQs com base no termo buscado (normalizado)
    const filteredFaqs = useMemo(() => {
        const cleanSearch = normalizeString(searchTerm.trim());
        if (!cleanSearch) return faqs;
        return faqs.filter(faq => 
            normalizeString(faq.q).includes(cleanSearch) || 
            normalizeString(faq.a).includes(cleanSearch)
        );
    }, [searchTerm]);

    // Abre os módulos automaticamente se o usuário estiver buscando algo específico
    const autoExpandModules = useMemo(() => {
        if (searchTerm.trim().length > 1) {
            return filteredModules.map(m => m.id);
        }
        return [];
    }, [filteredModules, searchTerm]);

    // Função de scroll suave para elementos específicos
    const scrollToSection = (ref: React.RefObject<HTMLDivElement>) => {
        if (ref.current) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Toggle para seleção de etapa da pipeline
    const handleStepClick = (stepNum: number) => {
        if (selectedStep === stepNum) {
            setSelectedStep(null); // Desmarca se clicar de novo
        } else {
            setSelectedStep(stepNum);
            // Limpa filtro de categorias e busca para focar apenas nos módulos daquela etapa
            setActiveSection('all');
            setSearchTerm('');
        }
    };

    // Helper para destacar os termos buscados
    const renderHighlightedText = (text: string, search: string) => {
        if (!search.trim()) return text;
        const normalizedSearch = normalizeString(search);
        
        // Expressão regular tolerante a acentos
        const regex = new RegExp(`(${search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')})`, 'gi');
        const parts = text.split(regex);
        
        return parts.map((part, index) => {
            const isMatch = normalizeString(part) === normalizedSearch || regex.test(part);
            return isMatch 
                ? <mark key={index} className="bg-amber-100 text-slate-950 px-0.5 rounded font-semibold">{part}</mark> 
                : part;
        });
    };

    return (
        <div className="min-h-screen bg-[#f4f7f6] text-slate-700 flex flex-col relative overflow-hidden">
            {/* Grid de background azul transparente quase branco */}
            <div className="absolute inset-0 bg-[linear-gradient(to_right,#e0e7ff_1px,transparent_1px),linear-gradient(to_bottom,#e0e7ff_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_80%,transparent_100%)] opacity-35 pointer-events-none" />

            {/* Brilhos translúcidos azuis */}
            <div className="absolute top-0 right-1/4 w-[600px] h-[600px] bg-blue-400/10 rounded-full blur-[140px] pointer-events-none" />
            <div className="absolute top-1/4 left-1/4 w-[500px] h-[500px] bg-emerald-400/5 rounded-full blur-[120px] pointer-events-none" />

            <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10 flex flex-col lg:flex-row gap-8">
                
                {/* Coluna Principal da Esquerda: Conteúdo */}
                <div className="flex-1 min-w-0 flex flex-col gap-8">
                    {/* Header */}
                    <div className="flex flex-col gap-4 border-b border-slate-200 pb-6">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-blue-500/10 rounded-xl border border-blue-500/20 text-blue-600">
                                <BookOpen size={24} />
                            </div>
                            <span className="text-[10px] font-semibold tracking-[0.3em] uppercase text-blue-600">Portal Duno Docs</span>
                        </div>
                        <h1 className="text-3xl font-semibold text-slate-950 tracking-tight sm:text-4xl">
                            Documentação do Sistema & FAQ
                        </h1>
                        <p className="text-slate-500 text-sm max-w-3xl leading-relaxed">
                            Aprenda a parametrizar e usar os fluxos e integrações do Duno. Desenvolvido para administradores e equipes técnicas de alto desempenho.
                        </p>

                        {/* Busca e Filtros */}
                        <div className="mt-4 flex flex-col sm:flex-row gap-3">
                            <div className="relative flex-1">
                                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                                <input
                                    type="text"
                                    placeholder="Buscar por módulo, funcionalidade, termo..."
                                    value={searchTerm}
                                    onChange={(e) => {
                                        setSearchTerm(e.target.value);
                                        // Limpa filtros de etapa e categoria ao digitar para buscar no sistema inteiro
                                        if (e.target.value.trim() !== '') {
                                            setSelectedStep(null);
                                            setActiveSection('all');
                                        }
                                    }}
                                    className="w-full pl-11 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-slate-700 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all text-sm shadow-sm"
                                />
                            </div>
                            <div className="flex gap-1.5 overflow-x-auto pb-1 sm:pb-0">
                                {[
                                    { key: 'all', label: 'Todos' },
                                    { key: 'workflow', label: 'Operação' },
                                    { key: 'security', label: 'Segurança' },
                                    { key: 'engineering', label: 'TI & Código' }
                                ].map((cat) => (
                                    <button
                                        key={cat.key}
                                        onClick={() => {
                                            setActiveSection(cat.key as any);
                                            setSelectedStep(null); // Reseta etapa para não conflitar
                                            setSearchTerm(''); // Limpa busca
                                        }}
                                        className={`px-4 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-wider border transition-all whitespace-nowrap ${
                                            activeSection === cat.key && selectedStep === null && !searchTerm
                                                ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/10'
                                                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                        }`}
                                    >
                                        {cat.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Desenho 🗺️ Mapa de Implantação e Dependência Lógica - Responsivo e Sem Rolagem Lateral */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm max-w-full">
                        <div className="flex items-center gap-2 mb-6 border-b border-slate-100 pb-3">
                            <span className="text-lg">🗺️</span>
                            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">Mapa de Implantação e Dependência Lógica</h2>
                        </div>
                        
                        <div className="flex flex-col gap-5 text-center text-xs">
                            
                            {/* Fase 1 */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div className="p-3 bg-indigo-50/50 border border-indigo-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-indigo-600 uppercase">1. Parametrização</div>
                                    <div className="font-semibold text-slate-900 mt-1">Configuração do Sistema</div>
                                </div>
                                <div className="p-3 bg-indigo-50/50 border border-indigo-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-indigo-600 uppercase">2. Acesso</div>
                                    <div className="font-semibold text-slate-900 mt-1">Usuários e Permissões</div>
                                </div>
                            </div>

                            <div className="text-slate-300 font-bold text-sm">↓</div>

                            {/* Fase 2 */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3 bg-emerald-50/50 border border-emerald-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-emerald-600 uppercase">3. Clientes</div>
                                    <div className="font-semibold text-slate-900 mt-1">Clientes e Endereços</div>
                                </div>
                                <div className="p-3 bg-emerald-50/50 border border-emerald-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-emerald-600 uppercase">4. Operacional</div>
                                    <div className="font-semibold text-slate-900 mt-1">Técnicos de Campo</div>
                                </div>
                                <div className="p-3 bg-emerald-50/50 border border-emerald-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-emerald-600 uppercase">5. Território</div>
                                    <div className="font-semibold text-slate-900 mt-1">Regiões e Geofencing</div>
                                </div>
                            </div>

                            <div className="text-slate-300 font-bold text-sm">↓</div>

                            {/* Fase 3 */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3 bg-amber-50/50 border border-amber-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-amber-600 uppercase">6. Inventário</div>
                                    <div className="font-semibold text-slate-900 mt-1">Ativos e Equipamentos</div>
                                </div>
                                <div className="p-3 bg-amber-50/50 border border-amber-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-amber-600 uppercase">7. Almoxarifado</div>
                                    <div className="font-semibold text-slate-900 mt-1">Estoque e QR Code</div>
                                </div>
                                <div className="p-3 bg-amber-50/50 border border-amber-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-amber-600 uppercase">8. Segurança</div>
                                    <div className="font-semibold text-slate-900 mt-1">Checklists e Formulários</div>
                                </div>
                            </div>

                            <div className="text-slate-300 font-bold text-sm">↓</div>

                            {/* Fase 4 */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                <div className="p-3 bg-blue-50/50 border border-blue-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-blue-600 uppercase">9. Prevenção</div>
                                    <div className="font-semibold text-slate-900 mt-1">Contratos e PMOC</div>
                                </div>
                                <div className="p-3 bg-blue-50/50 border border-blue-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-blue-600 uppercase">10. Comercial</div>
                                    <div className="font-semibold text-slate-900 mt-1">Orçamentos e Propostas</div>
                                </div>
                                <div className="p-3 bg-blue-50/50 border border-blue-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-blue-600 uppercase">11. Escala</div>
                                    <div className="font-semibold text-slate-900 mt-1">Calendário e Agenda</div>
                                </div>
                            </div>

                            <div className="text-slate-300 font-bold text-sm">↓</div>

                            {/* Fase 5 */}
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                <div className="p-3 bg-rose-50/50 border border-rose-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-rose-600 uppercase">12. Atividades</div>
                                    <div className="font-semibold text-slate-900 mt-1">Ordens de Serviço (OS)</div>
                                </div>
                                <div className="p-3 bg-slate-900 border border-slate-950 rounded-xl shadow-xs text-white">
                                    <div className="text-[10px] font-bold text-blue-400 uppercase">13. Mobilidade</div>
                                    <div className="font-semibold mt-1">App do Técnico</div>
                                </div>
                                <div className="p-3 bg-emerald-50/50 border border-emerald-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-emerald-600 uppercase">14. Faturamento</div>
                                    <div className="font-semibold text-slate-900 mt-1">Financeiro & Receitas</div>
                                </div>
                                <div className="p-3 bg-rose-50/50 border border-rose-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-rose-600 uppercase">15. Performance</div>
                                    <div className="font-semibold text-slate-900 mt-1">Dashboard de Indicadores</div>
                                </div>
                            </div>

                            <div className="text-slate-300 font-bold text-sm">↓</div>

                            {/* Fase 6 */}
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                                <div className="p-3 bg-blue-50/50 border border-blue-150 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-blue-600 uppercase">16. Auditoria</div>
                                    <div className="font-semibold text-slate-900 mt-1">Central de Solicitações</div>
                                </div>
                                <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-slate-600 uppercase">17. Integrações</div>
                                    <div className="font-semibold text-slate-900 mt-1">APIs & Webhooks</div>
                                </div>
                                <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-indigo-700 uppercase">18. Comunicação</div>
                                    <div className="font-semibold text-indigo-900 mt-1">WhatsApp IA Inbox</div>
                                </div>
                                <div className="p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl shadow-xs">
                                    <div className="text-[10px] font-bold text-indigo-700 uppercase">19. Inteligência</div>
                                    <div className="font-semibold text-indigo-900 mt-1">Duno IA Copilot</div>
                                </div>
                            </div>

                        </div>
                    </div>

                    {/* Pipeline Interativo */}
                    <div ref={pipelineRef} className="bg-white/80 border border-slate-200/80 rounded-2xl p-6 backdrop-blur-md shadow-sm">
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <Layers size={18} className="text-emerald-500" />
                                <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-900">Etapas do Processo de Implantação</h2>
                            </div>
                            {selectedStep !== null && (
                                <button 
                                    onClick={() => setSelectedStep(null)}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold"
                                >
                                    Limpar filtro de fluxo
                                </button>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                            💡 **Dica Interativa:** Clique em qualquer etapa abaixo para filtrar na lista os módulos relacionados àquela fase da implantação.
                        </p>

                        {/* Grid de Passos */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 relative">
                            {[
                                { step: 1, title: '1. Configurações', desc: 'Configurações de Org, SLA e logomarca da sua empresa.' },
                                { step: 2, title: '2. Usuários e Perfis', desc: 'Convide seus gerentes, comercial e configure permissões.' },
                                { step: 3, title: '3. Clientes e Técnicos', desc: 'Base de dados básica. Localiza clientes no mapa de despacho.' },
                                { step: 4, title: '4. Equipamentos e Estoque', desc: 'Inventário de máquinas de clientes e estoque de peças.' },
                                { step: 5, title: '5. Checklists (Formulários)', desc: 'Criação de questionários e regras de disparo.' },
                                { step: 6, title: '6. Operação, Comunicação e OS', desc: 'Ordens de Serviço em campo, Caixa de Entrada WhatsApp, Solicitações e Faturamento.' }
                            ].map((item, idx) => {
                                const isSelected = selectedStep === item.step;
                                return (
                                    <button
                                        key={idx}
                                        onClick={() => handleStepClick(item.step)}
                                        className={`text-left p-4 rounded-xl flex gap-3 hover:border-slate-400 border transition-all group relative overflow-hidden cursor-pointer ${
                                            isSelected 
                                                ? 'bg-blue-50/70 border-blue-500 ring-2 ring-blue-500/20 shadow-md shadow-blue-500/5' 
                                                : 'bg-white border-slate-200/80 shadow-sm'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg font-semibold text-sm flex items-center justify-center shrink-0 transition-colors ${
                                            isSelected ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600'
                                        }`}>
                                            {item.step}
                                        </div>
                                        <div className="flex flex-col gap-1">
                                            <h3 className={`text-xs font-semibold transition-colors ${
                                                isSelected ? 'text-blue-900' : 'text-slate-900 group-hover:text-blue-600'
                                            }`}>{item.title}</h3>
                                            <p className="text-[11px] text-slate-500 leading-normal">{item.desc}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* Lista de Módulos (Estilo Stripe) */}
                    <div ref={modulesRef} className="flex flex-col gap-4">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                            <h2 className="text-lg font-semibold text-slate-950 tracking-tight">Detalhamento dos Módulos ({filteredModules.length})</h2>
                            {(searchTerm || activeSection !== 'all' || selectedStep !== null) && (
                                <button
                                    onClick={handleClearFilters}
                                    className="text-xs text-blue-600 hover:text-blue-700 font-semibold flex items-center gap-1"
                                >
                                    Limpar todos os filtros ({[
                                        searchTerm ? 'busca' : '',
                                        activeSection !== 'all' ? 'categoria' : '',
                                        selectedStep !== null ? 'etapa' : ''
                                    ].filter(Boolean).join(', ')})
                                </button>
                            )}
                        </div>

                        {filteredModules.length === 0 ? (
                            <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center flex flex-col items-center gap-3 shadow-sm">
                                <Info size={36} className="text-slate-400" />
                                <h3 className="text-sm font-semibold text-slate-900">Nenhum módulo encontrado</h3>
                                <p className="text-xs text-slate-500">Tente ajustar a busca ou limpar os filtros de categoria e fluxo acima.</p>
                                <button
                                    onClick={handleClearFilters}
                                    className="mt-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold uppercase tracking-wider transition-all"
                                >
                                    Limpar Filtros
                                </button>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-3">
                                {filteredModules.map((mod) => {
                                    const isExpanded = expandedModule === mod.id || autoExpandModules.includes(mod.id);
                                    return (
                                        <div
                                            key={mod.id}
                                            className={`bg-white border rounded-2xl transition-all overflow-hidden ${
                                                isExpanded ? 'border-blue-500 shadow-md shadow-blue-500/5' : 'border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            {/* Cabeçalho do Card */}
                                            <button
                                                onClick={() => {
                                                    setExpandedModule(isExpanded && !autoExpandModules.includes(mod.id) ? null : mod.id);
                                                }}
                                                className="w-full p-5 flex items-start gap-4 text-left transition-all hover:bg-slate-50/50"
                                            >
                                                <div className={`p-2.5 rounded-xl border shrink-0 ${
                                                    isExpanded ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-500 border-slate-200'
                                                }`}>
                                                    <mod.icon size={20} />
                                                </div>
                                                <div className="flex-1 flex flex-col gap-1 min-w-0">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <h3 className="text-sm font-semibold text-slate-950">
                                                            {renderHighlightedText(mod.title, searchTerm)}
                                                        </h3>
                                                        <span className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                                                            mod.category === 'workflow' ? 'bg-emerald-50 text-emerald-600 border-emerald-200' :
                                                            mod.category === 'security' ? 'bg-rose-50 text-rose-600 border-rose-200' :
                                                            mod.category === 'engineering' ? 'bg-blue-50 text-blue-600 border-blue-200' :
                                                            'bg-amber-50 text-amber-600 border-amber-200'
                                                        }`}>
                                                            {mod.category === 'workflow' ? 'Operacional' : mod.category === 'security' ? 'Segurança' : mod.category === 'engineering' ? 'TI & Código' : 'Design'}
                                                        </span>
                                                        <span className="text-[9px] bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full font-medium">
                                                            Fluxo: Etapa {mod.stepRelation}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-slate-500 leading-relaxed">
                                                        {renderHighlightedText(mod.description, searchTerm)}
                                                    </p>
                                                    <div className="mt-2 flex items-center gap-4 text-[10px] text-slate-400">
                                                        <span>📍 {renderHighlightedText(mod.menuPath, searchTerm)}</span>
                                                    </div>
                                                </div>
                                                <div className="text-slate-400 self-center">
                                                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                                                </div>
                                            </button>

                                            {/* Detalhes Expandidos */}
                                            {isExpanded && (
                                                <div className="px-5 pb-6 pt-4 border-t border-slate-100 bg-slate-50/20 flex flex-col gap-5">
                                                    {/* Passos */}
                                                    <div className="flex flex-col gap-2.5">
                                                        <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                                                            <PlayCircle size={14} className="text-blue-600" />
                                                            Como Configurar e Operar
                                                        </h4>
                                                        <ol className="list-none flex flex-col gap-2 pl-1">
                                                            {mod.steps.map((step, idx) => (
                                                                <li key={idx} className="text-xs text-slate-600 flex items-start gap-2.5 leading-relaxed">
                                                                    <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5">
                                                                        {idx + 1}
                                                                    </span>
                                                                    <span>{renderHighlightedText(step, searchTerm)}</span>
                                                                </li>
                                                            ))}
                                                        </ol>
                                                    </div>

                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* FAQ Accordion */}
                    <div ref={faqRef} className="border-t border-slate-200 pt-8 flex flex-col gap-4">
                        <div className="flex items-center gap-2">
                            <HelpCircle size={22} className="text-blue-600" />
                            <h2 className="text-xl font-semibold text-slate-950 tracking-tight">Perguntas Frequentes & Arquitetura</h2>
                        </div>
                        <div className="flex flex-col gap-2">
                            {filteredFaqs.length === 0 ? (
                                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-400">
                                    Nenhuma pergunta frequente corresponde ao termo buscado.
                                </div>
                            ) : (
                                filteredFaqs.map((faq, idx) => {
                                    const isExpanded = expandedFaq === idx || searchTerm.trim().length > 1;
                                    return (
                                        <div
                                            key={idx}
                                            className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm"
                                        >
                                            <button
                                                onClick={() => setExpandedFaq(isExpanded && searchTerm.trim().length <= 1 ? null : idx)}
                                                className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50/50 transition-all"
                                            >
                                                <span className="text-xs font-semibold text-slate-900">
                                                    {renderHighlightedText(faq.q, searchTerm)}
                                                </span>
                                                <span className="text-slate-400 shrink-0 ml-4">
                                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                </span>
                                            </button>
                                            {isExpanded && (
                                                <div className="px-4 pb-4 pt-2 text-xs text-slate-500 leading-relaxed border-t border-slate-100 bg-slate-50/10 animate-fade-in">
                                                    {renderHighlightedText(faq.a, searchTerm)}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </div>

                {/* Coluna Direita: ToC & Suporte */}
                <div className="w-full lg:w-72 shrink-0 flex flex-col gap-6 lg:sticky lg:top-8">
                    
                    {/* Navegação Rápida (ToC) */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                        <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Navegação Rápida</span>
                        <div className="flex flex-col gap-2">
                            <button 
                                onClick={() => scrollToSection(pipelineRef)}
                                className="w-full text-left text-xs font-semibold text-slate-600 hover:text-blue-600 py-1 transition-colors flex items-center gap-1.5"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                Fluxo de Implantação
                            </button>
                            <button 
                                onClick={() => scrollToSection(modulesRef)}
                                className="w-full text-left text-xs font-semibold text-slate-600 hover:text-blue-600 py-1 transition-colors flex items-center gap-1.5"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                Detalhes de Módulos
                            </button>
                            <button 
                                onClick={() => scrollToSection(faqRef)}
                                className="w-full text-left text-xs font-semibold text-slate-600 hover:text-blue-600 py-1 transition-colors flex items-center gap-1.5"
                            >
                                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span>
                                Perguntas Frequentes (FAQ)
                            </button>
                        </div>
                    </div>

                    {/* Status da Implantação */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-4 shadow-sm">
                        <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Métricas do Sistema</span>
                        <div className="flex flex-col gap-3">
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Total de Módulos</span>
                                <span className="font-semibold text-slate-900">17</span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Ambiente RLS</span>
                                <span className="font-semibold text-emerald-600 flex items-center gap-1">
                                    <ShieldCheck size={14} /> Ativo
                                </span>
                            </div>
                            <div className="flex justify-between items-center text-xs">
                                <span className="text-slate-500">Versão Core</span>
                                <span className="font-mono text-[10px] bg-slate-50 px-1.5 py-0.5 rounded text-blue-600 border border-slate-100">v2.0.26</span>
                            </div>
                        </div>
                    </div>

                    {/* Copilot Rápido */}
                    <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200 rounded-2xl p-5 flex flex-col gap-4 relative overflow-hidden shadow-sm">
                        <div className="absolute -top-12 -right-12 w-28 h-28 bg-blue-100/50 rounded-full blur-xl pointer-events-none" />
                        <div className="flex items-center gap-2">
                            <Bot className="text-blue-600" size={18} />
                            <span className="text-[10px] font-semibold tracking-widest text-blue-700 uppercase">Duno IA Copilot</span>
                        </div>
                        <p className="text-xs text-slate-600 leading-relaxed">
                            Possui alguma dúvida técnica que não localizou no manual? Converse com a Duno IA. Ela escaneia o código fonte do sistema em tempo real para responder.
                        </p>
                        <a
                            href="#/admin/ai"
                            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold uppercase tracking-wider text-center transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-blue-500/10"
                        >
                            Chamar IA Copilot <ArrowRight size={14} />
                        </a>
                    </div>

                    {/* Link para o Suporte */}
                    <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3 shadow-sm">
                        <span className="text-[10px] font-semibold tracking-wider text-slate-400 uppercase">Precisa de Ajuda Humana?</span>
                        <p className="text-xs text-slate-500 leading-relaxed">
                            Para dúvidas fiscais, suporte no faturamento ou integrações profundas com ERPs legados.
                        </p>
                        <a
                            href="https://wa.me/5535984274972"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="w-full py-2.5 text-center text-xs font-bold text-slate-600 hover:text-slate-800 border border-slate-200 hover:border-slate-300 rounded-xl transition-all flex items-center justify-center gap-1.5 bg-slate-50 hover:bg-slate-100"
                        >
                            Suporte via WhatsApp <ExternalLink size={12} />
                        </a>
                    </div>
                </div>
            </div>
        </div>
    );
};
