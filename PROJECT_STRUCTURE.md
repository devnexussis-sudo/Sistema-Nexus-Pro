# 🏗️ Estrutura do Projeto Nexus Pro

## 📁 Visão Geral da Organização

Este projeto está organizado seguindo as melhores práticas de separação entre **Frontend** e **Backend**, com o backend rodando no **Supabase**.

```
Nexus Pro/
├── 📱 FRONTEND
│   ├── src/                      # Código-fonte principal do React
│   │   ├── components/           # Componentes React
│   │   │   ├── admin/           # Componentes administrativos
│   │   │   ├── tech/            # Componentes do técnico
│   │   │   ├── public/          # Componentes públicos
│   │   │   └── ui/              # Componentes UI reutilizáveis
│   │   ├── services/            # Serviços de integração com backend
│   │   ├── lib/                 # Bibliotecas e configurações (Supabase client)
│   │   ├── types/               # Tipos TypeScript do frontend
│   │   ├── constants/           # Constantes do frontend
│   │   ├── utils/               # Utilitários do frontend
│   │   ├── styles/              # Estilos globais
│   │   ├── App.tsx              # Componente principal
│   │   └── index.tsx            # Ponto de entrada
│   ├── public/                  # Assets estáticos
│   ├── components/              # Componentes legacy (migrar para src/components)
│   ├── index.html               # HTML principal
│   ├── vite.config.ts           # Configuração do Vite
│   └── tsconfig.json            # Configuração TypeScript
│
├── 🔧 BACKEND
│   ├── functions/               # Supabase Edge Functions
│   │   ├── orders/              # Funções relacionadas a ordens
│   │   ├── customers/           # Funções relacionadas a clientes
│   │   ├── technicians/         # Funções relacionadas a técnicos
│   │   └── auth/                # Funções de autenticação customizadas
│   ├── schemas/                 # Schemas de validação (Zod, Yup, etc)
│   └── types/                   # Tipos TypeScript do backend
│
├── 🗄️ SUPABASE
│   ├── migrations/              # Migrações do banco de dados
│   │   ├── supabase_schema.sql
│   │   ├── migration_add_os_config.sql
│   │   └── migration_fix_orders_id.sql
│   └── functions/               # Edge Functions (deploy)
│
├── 🤝 SHARED
│   ├── types/                   # Tipos compartilhados entre frontend/backend
│   ├── constants/               # Constantes compartilhadas
│   └── utils/                   # Utilitários compartilhados
│
└── 📄 CONFIGURAÇÕES
    ├── package.json             # Dependências do projeto
    ├── .env                     # Variáveis de ambiente
    ├── .gitignore              # Arquivos ignorados pelo Git
    └── README.md               # Documentação principal
```

---

## 🎯 Responsabilidades de Cada Camada

### 📱 **Frontend** (`/src`)
- **Objetivo**: Interface do usuário e experiência visual
- **Tecnologias**: React, TypeScript, Vite
- **Responsabilidades**:
  - Renderização de componentes
  - Gerenciamento de estado local
  - Integração com APIs via `services/`
  - Validação de formulários (lado cliente)
  - Navegação e rotas

### 🔧 **Backend** (`/backend`)
- **Objetivo**: Lógica de negócio e processamento no servidor
- **Tecnologias**: Supabase Edge Functions, Deno/TypeScript
- **Responsabilidades**:
  - Lógica de negócio complexa
  - Validação de dados (lado servidor)
  - Integração com APIs externas
  - Processamento de dados
  - Operações seguras (que não devem ser expostas no frontend)

### 🗄️ **Supabase**
- **Objetivo**: Banco de dados e autenticação
- **Tecnologias**: PostgreSQL, Supabase Auth, Row Level Security (RLS)
- **Responsabilidades**:
  - Armazenamento de dados
  - Autenticação de usuários
  - Políticas de segurança (RLS)
  - Triggers e funções do banco
  - Real-time subscriptions

### 🤝 **Shared** (`/shared`)
- **Objetivo**: Código reutilizável entre frontend e backend
- **Responsabilidades**:
  - Definições de tipos comuns
  - Constantes compartilhadas
  - Funções utilitárias puras
  - Validações compartilhadas

---

## 🔄 Fluxo de Dados

```
Frontend (React)
    ↓
Services Layer (dataService.ts)
    ↓
Supabase Client (lib/supabase.ts)
    ↓
Internet (HTTPS)
    ↓
Supabase Backend
    ↓
PostgreSQL Database
```

### Fluxo com Edge Functions:
```
Frontend (React)
    ↓
Services Layer
    ↓
Edge Function (backend/functions)
    ↓
Supabase Database/APIs
    ↓
Response → Frontend
```

---

## 🚀 Scripts Disponíveis

```bash
# Desenvolvimento do Frontend
npm run dev              # Inicia servidor de desenvolvimento (localhost:5173)

# Build de Produção
npm run build            # Gera build otimizado para produção

# Preview de Produção
npm run preview          # Preview do build de produção

# Supabase (quando configurado)
npx supabase start       # Inicia Supabase local
npx supabase functions deploy  # Deploy de Edge Functions
```

---

## 🔐 Variáveis de Ambiente

Arquivo `.env`:
```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_anon_key
```

---

## 📝 Próximos Passos para Desenvolvimento

### 1. **Migrar Componentes Legacy**
- [ ] Mover componentes de `/components` para `/src/components`
- [ ] Atualizar imports

### 2. **Organizar Services**
- [ ] Consolidar serviços em `/src/services`
- [ ] Criar interfaces claras para cada serviço

### 3. **Implementar Edge Functions**
- [ ] Criar funções para operações complexas
- [ ] Implementar autenticação avançada
- [ ] Deploy no Supabase

### 4. **Compartilhar Código**
- [ ] Mover tipos comuns para `/shared/types`
- [ ] Criar constantes compartilhadas
- [ ] Implementar validações reutilizáveis

---

## 🛡️ Segurança

- ✅ **Frontend**: Validação de entrada do usuário (UX)
- ✅ **Backend**: Validação rigorosa (segurança)
- ✅ **Database**: Row Level Security (RLS) habilitado
- ✅ **Auth**: Supabase Auth com JWT
- ✅ **API Keys**: Nunca expor chaves secretas no frontend

---

## 📚 Convenções de Código

### Nomenclatura:
- **Componentes**: PascalCase (`TechDashboard.tsx`)
- **Funções/Variáveis**: camelCase (`getUserData()`)
- **Constantes**: UPPER_SNAKE_CASE (`API_BASE_URL`)
- **Tipos/Interfaces**: PascalCase (`interface User {}`)

### Organização de Imports:
```typescript
// 1. External libraries
import React from 'react';
import { supabase } from '@/lib/supabase';

// 2. Internal modules
import { dataService } from '@/services/dataService';

// 3. Components
import { Button } from '@/components/ui/Button';

// 4. Types
import type { User } from '@/types';

// 5. Styles (if any)
import './styles.css';
```

---

## 🤝 Contribuindo

1. Criar branch para feature: `git checkout -b feature/nome-da-feature`
2. Fazer commit das mudanças: `git commit -m 'feat: descrição'`
3. Push para branch: `git push origin feature/nome-da-feature`
4. Abrir Pull Request

---

## 📞 Suporte

Para dúvidas ou problemas, consulte a documentação ou entre em contato com a equipe de desenvolvimento.

---

**Última atualização**: 2026-01-28
