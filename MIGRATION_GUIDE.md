# 🔄 Guia de Migração - Estrutura Frontend/Backend

Este guia ajudará você a migrar o código existente para a nova estrutura organizada.

## ✅ O Que Foi Feito

### 1. **Nova Estrutura de Pastas Criada**
```
✅ /backend/          # Lógica do servidor
✅ /shared/           # Código compartilhado
✅ /src/              # Frontend (já existente)
✅ /supabase/         # Migrações do banco
```

### 2. **Arquivos Compartilhados Criados**
- ✅ `/shared/types/index.ts` - Tipos TypeScript compartilhados
- ✅ `/shared/constants/index.ts` - Constantes compartilhadas
- ✅ `/shared/utils/index.ts` - Funções utilitárias compartilhadas

### 3. **Backend (Edge Functions)**
- ✅ `/backend/functions/get-orders/` - Buscar ordens
- ✅ `/backend/functions/create-order/` - Criar ordens
- ✅ Exemplos de integração com Supabase

### 4. **Frontend Service**
- ✅ `/src/services/edgeFunctionService.ts` - Integração com Edge Functions

### 5. **Configurações Atualizadas**
- ✅ `tsconfig.json` - Paths aliases para `@`, `@shared`, `@backend`
- ✅ `vite.config.ts` - Resolve aliases
- ✅ `.gitignore` - Entradas atualizadas

### 6. **Documentação**
- ✅ `PROJECT_STRUCTURE.md` - Visão geral da estrutura
- ✅ `backend/README.md` - Documentação do backend

---

## 📋 Próximos Passos (Recomendados)

### Passo 1: Migrar Tipos para Shared (OPCIONAL)

**Antes:**
```typescript
// src/types/index.ts
import { User } from '../types/index'
```

**Depois:**
```typescript
// Use os tipos compartilhados
import { User } from '@shared/types'
```

**Ação:**
- Os tipos em `/src/types/index.ts` já existem
- Os tipos em `/shared/types/index.ts` são uma cópia melhorada
- **VOCÊ DECIDE**: Manter ambos OU migrar completamente para `@shared/types`
- Para migrar: atualizar imports em todos os arquivos do frontend

### Passo 2: Migrar Constantes (OPCIONAL)

**Antes:**
```typescript
// src/constants/index.ts
import { MOCK_USERS } from '../constants'
```

**Depois:**
```typescript
// Use as constantes compartilhadas
import { PERMISSIONS_PRESETS, OPERATION_TYPES } from '@shared/constants'
```

**Ação:**
- Mover constantes úteis para `/shared/constants/index.ts`
- Manter mocks de teste em `/src/constants/` se necessário

### Passo 3: Usar Utilitários Compartilhados

**Exemplo:**
```typescript
import { 
  formatCPF, 
  formatPhone, 
  isValidEmail,
  formatDate 
} from '@shared/utils'

// Agora você pode usar em qualquer lugar (frontend ou backend)
const cpfFormatado = formatCPF('12345678900')
```

### Passo 4: Implementar Edge Functions (QUANDO NECESSÁRIO)

As Edge Functions já têm exemplos prontos em `/backend/functions/`.

**Para usar:**

1. **Instalar Supabase CLI** (se ainda não instalado):
```bash
npm install -g supabase
```

2. **Fazer login:**
```bash
supabase login
```

3. **Vincular projeto:**
```bash
supabase link --project-ref SEU_PROJECT_REF
```

4. **Deploy das funções:**
```bash
cd backend
npm run deploy
```

5. **Usar no frontend:**
```typescript
import { edgeFunctionService } from '@/services/edgeFunctionService'

// Buscar ordens com filtros
const result = await edgeFunctionService.orders.get({
  status: 'PENDENTE',
  page: 1,
  pageSize: 20
})

// Criar nova ordem
const newOrder = await edgeFunctionService.orders.create({
  title: 'Nova Ordem',
  description: 'Descrição',
  customerName: 'Cliente',
  customerAddress: 'Endereço',
  priority: 'ALTA',
  scheduledDate: '2026-02-01'
})
```

### Passo 5: Adicionar Row Level Security (RLS) no Supabase

Certifique-se de que as políticas RLS estão ativas:

```sql
-- Exemplo: Somente o próprio tenant pode ver suas ordens
CREATE POLICY "Users can view their tenant orders"
ON orders FOR SELECT
USING (auth.uid() IN (
  SELECT id FROM auth.users WHERE tenant_id = orders.tenant_id
));
```

---

## 🔄 Migração Gradual (Recomendado)

Você **NÃO precisa** migrar tudo de uma vez. A estrutura atual continua funcionando!

### Abordagem Recomendada:

1. ✅ **Comece usando os novos arquivos compartilhados** em novos componentes
2. ✅ **Mantenha o código existente funcionando** sem alterações
3. ✅ **Migre gradualmente** conforme necessário
4. ✅ **Use Edge Functions** apenas para lógica complexa ou segura

---

## 🎯 Quando Usar Edge Functions?

### ✅ USE Edge Functions para:
- Lógica de negócio complexa
- Operações que exigem segurança extra
- Integração com APIs externas (que precisam de chaves secretas)
- Processamento pesado de dados
- Envio de emails/notificações
- Geração de relatórios

### ❌ NÃO USE Edge Functions para:
- Operações CRUD simples (use Supabase client diretamente)
- Leitura de dados públicos
- Operações que já são seguras com RLS

---

## 📝 Exemplo de Migração Gradual

### Cenário: Você quer criar uma nova funcionalidade

**Opção 1 - Simples (Supabase Client Direto):**
```typescript
// src/services/dataService.ts
import { supabase } from '@/lib/supabase'

export const getOrders = async () => {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .eq('status', 'PENDENTE')
  
  return { data, error }
}
```

**Opção 2 - Com Edge Function (Lógica Complexa):**
```typescript
// Use a Edge Function se precisar de:
// - Validações complexas
// - Geração automática de IDs
// - Logging de auditoria
// - Integração com outras APIs

import { edgeFunctionService } from '@/services/edgeFunctionService'

export const getOrders = async () => {
  return await edgeFunctionService.orders.get({
    status: 'PENDENTE'
  })
}
```

---

## 🚨 Importante: Não Perca Funcionalidades!

### ✅ Funcionalidades Preservadas:
- ✅ Login de Admin e Técnico
- ✅ Gerenciamento de Ordens
- ✅ Gerenciamento de Clientes
- ✅ Gerenciamento de Técnicos
- ✅ Gerenciamento de Equipamentos
- ✅ Formulários e Checklists
- ✅ Dashboard e Visualizações
- ✅ Multi-tenancy
- ✅ Todas as migrações do banco de dados

### 📦 O Que Foi Adicionado (Não Substituído):
- ➕ Estrutura organizada de pastas
- ➕ Tipos e constantes compartilhados
- ➕ Utilitários reutilizáveis
- ➕ Exemplos de Edge Functions
- ➕ Documentação completa
- ➕ Path aliases para imports limpos

---

## 🔍 Verificação Rápida

Execute estes comandos para verificar que tudo está funcionando:

```bash
# 1. Verificar dependências
npm install

# 2. Verificar se o projeto compila
npm run build

# 3. Rodar em modo desenvolvimento
npm run dev
```

Se tudo funcionar, sua aplicação está pronta e a nova estrutura está disponível para uso gradual! 🎉

---

## 💡 Dicas Finais

1. **Use `@shared` para código reutilizável** entre frontend e backend
2. **Use `@` para imports do frontend** (exemplo: `@/components/...`)
3. **Documente suas Edge Functions** seguindo os exemplos
4. **Teste localmente** antes de fazer deploy
5. **Mantenha a simplicidade** - nem tudo precisa ser uma Edge Function

---

## 📞 Precisa de Ajuda?

- Consulte `PROJECT_STRUCTURE.md` para visão geral
- Consulte `backend/README.md` para detalhes do backend
- Veja exemplos em `/backend/functions/`

---

**Status**: ✅ Estrutura pronta para uso gradual, sem quebrar funcionalidades existentes!
