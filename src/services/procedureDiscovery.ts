// ============================================================
// src/services/procedureDiscovery.ts
// 🧠 Duno IA — Descoberta de Procedimentos no Sistema
// Mapeia intenções de usuário para módulos e telas do Nexus OS
// ============================================================

const SYSTEM_MODULES = [
  {
    keywords: ['cliente', 'clientes', 'novo cliente', 'cadastrar cliente', 'editar cliente'],
    module: 'Clientes',
    path: 'Menu Principal > Clientes',
    action: 'Clique no botão "+ Novo Cliente" no canto superior direito para abrir o formulário de cadastro.'
  },
  {
    keywords: ['os', 'ordem de servico', 'nova os', 'abrir os', 'criar os', 'atividades', 'atividade', 'nova atividade'],
    module: 'Atividades (OS)',
    path: 'Menu Principal > Atividades',
    action: 'Para criar uma nova OS, vá até a tela de Atividades e clique em "+ Nova OS". Preencha os dados do cliente, equipamento e descrição do problema.'
  },
  {
    keywords: ['tecnico', 'tecnicos', 'novo tecnico', 'cadastrar tecnico', 'equipe'],
    module: 'Técnicos',
    path: 'Menu Principal > Técnicos',
    action: 'Na tela de Técnicos, você pode gerenciar sua equipe. Clique em "+ Novo Técnico" para adicionar um novo membro.'
  },
  {
    keywords: ['equipamento', 'ativos', 'maquina', 'aparelho', 'cadastrar equipamento', 'novo equipamento'],
    module: 'Ativos',
    path: 'Menu Principal > Ativos',
    action: 'Para gerenciar equipamentos, vá em Ativos. Você pode vincular um equipamento a um cliente clicando em "+ Novo Equipamento".'
  },
  {
    keywords: ['orcamento', 'proposta', 'novo orcamento', 'fazer orcamento', 'gerar orcamento'],
    module: 'Financeiro > Orçamentos',
    path: 'Menu Principal > Orçamentos',
    action: 'Vá na aba de Orçamentos e clique em "+ Novo Orçamento". Você poderá adicionar peças, serviços e enviar a proposta (PDF) para o cliente.'
  },
  {
    keywords: ['estoque', 'peca', 'pecas', 'produto', 'produtos', 'novo item', 'cadastrar peca'],
    module: 'Estoque',
    path: 'Menu Principal > Estoque',
    action: 'Acesse o módulo de Estoque para ver suas peças. Clique em "+ Novo Item" para cadastrar um produto, definir a quantidade e gerar a etiqueta.'
  },
  {
    keywords: ['contrato', 'pmoc', 'manutencao preventiva', 'novo contrato'],
    module: 'Contratos/PMOC',
    path: 'Menu Principal > Contratos',
    action: 'Para gerenciar contratos recorrentes ou PMOC, vá em Contratos. Clique em "+ Novo Contrato" para definir a periodicidade e os equipamentos incluídos.'
  },
  {
    keywords: ['usuario', 'user', 'acesso', 'senha', 'permissao', 'permissoes', 'novo usuario'],
    module: 'Configurações > Usuários',
    path: 'Menu Principal > Configurações > Usuários',
    action: 'Para adicionar um acesso ao sistema, vá em Configurações e depois em Usuários. Clique em "+ Novo Usuário" e defina o grupo de permissões.'
  },
  {
    keywords: ['grupo', 'grupos', 'cargo', 'cargos', 'funcao', 'funcoes', 'novo grupo'],
    module: 'Configurações > Grupos',
    path: 'Menu Principal > Configurações > Grupos',
    action: 'Para gerenciar os cargos e o que cada usuário pode acessar, vá em Configurações > Grupos.'
  },
  {
    keywords: ['logo', 'logotipo', 'empresa', 'cnpj', 'dados da empresa', 'minha empresa', 'configuracoes da empresa'],
    module: 'Configurações > Empresa',
    path: 'Menu Principal > Configurações > Empresa',
    action: 'Para alterar a logo, CNPJ e endereço da sua empresa, vá em Configurações e clique na aba Empresa.'
  },
  {
    keywords: ['relatorio', 'dashboard', 'grafico', 'graficos', 'resumo', 'indicadores', 'kpi'],
    module: 'Dashboard',
    path: 'Menu Principal > Dashboard',
    action: 'A tela inicial (Dashboard) mostra um resumo financeiro e operacional com gráficos e indicadores de desempenho.'
  }
];

export function discoverProcedure(input: string): string | null {
  const normalizedInput = input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Tenta encontrar um módulo que corresponda a palavras-chave na pergunta do usuário
  let bestMatch = null;
  let maxScore = 0;

  for (const mod of SYSTEM_MODULES) {
    let score = 0;
    for (const kw of mod.keywords) {
      const normalizedKw = kw.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (new RegExp(`(^|\\b|\\s)${normalizedKw}(\\b|\\s|$)`).test(normalizedInput)) {
        score += normalizedKw.length;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      bestMatch = mod;
    }
  }

  // Se encontrou algo com confiança aceitável
  if (bestMatch && maxScore > 3) {
    return `Para isso, você deve acessar o módulo **${bestMatch.module}**.\n\n📍 **Caminho:** ${bestMatch.path}\n💡 **Como fazer:** ${bestMatch.action}`;
  }

  // Fallback caso não encontre um procedimento claro
  return null;
}
