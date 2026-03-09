# 🔧 Correção de Duplicação de Grupos de Usuários

## 📋 Problema Identificado

Ao criar uma nova empresa no painel Super Admin (Master), o sistema estava criando grupos padrão duplicados:
- ✅ **Administradores** - Já tinha verificação de duplicatas
- ❌ **Operadores** - NÃO tinha verificação (estava duplicando)
- ❌ **Técnicos de Campo** - NÃO tinha verificação (estava duplicando)

## ✅ Correções Implementadas

### 1. **Código Frontend Corrigido** ✨
- **Arquivo**: `src/services/dataService.ts`
- **Função**: `createTenant` (linhas 1592-1659)
- **Mudança**: Adicionada verificação de existência para TODOS os grupos padrão antes de criar
- **Resultado**: Agora verifica se os grupos "Operadores" e "Técnicos de Campo" já existem antes de tentar criar

### 2. **Scripts SQL Criados** 📝

#### a) **verify_duplicate_groups.sql**
- Script de diagnóstico para verificar se há grupos duplicados no banco
- Execute PRIMEIRO no SQL Editor do Supabase para ver se há duplicatas

#### b) **20260130_remove_duplicate_groups.sql**
- Remove grupos duplicados existentes no banco
- Mantém apenas o grupo mais antigo de cada tipo
- Revincula usuários órfãos aos grupos corretos
- Execute SOMENTE se o script de verificação confirmar duplicatas

#### c) **20260130_fix_admin_permissions.sql**
- Atualiza permissões de usuários administradores que estão sem permissões
- Garante que todos os admins tenham as permissões completas

#### d) **20260130_create_tenant_stats_view.sql**
- Cria uma view otimizada para estatísticas globais de empresas
- Melhora performance do painel Super Admin

## 📝 Passos para Aplicar as Correções

### PASSO 1: Verificar se há duplicatas
1. Acesse o Supabase SQL Editor: https://supabase.com/dashboard/project/gbwkfumodaqbmmiwayhf/sql/new
2. Copie e execute o conteúdo de `verify_duplicate_groups.sql`
3. Verifique se aparece alguma linha no resultado
   - Se SIM → Prossiga para o Passo 2
   - Se NÃO → Pule para o Passo 3

### PASSO 2: Remover duplicatas existentes (SE NECESSÁRIO)
1. No SQL Editor, execute o conteúdo de `20260130_remove_duplicate_groups.sql`
2. Verifique os logs de NOTICE para confirmar remoções
3. Execute novamente `verify_duplicate_groups.sql` para confirmar que não há mais duplicatas

### PASSO 3: Aplicar migrações de correção
1. Execute `20260130_fix_admin_permissions.sql`
2. Execute `20260130_create_tenant_stats_view.sql`

### PASSO 4: Testar criação de nova empresa
1. Acesse http://localhost:3000/master
2. Clique em "Provisionar Empresa"
3. Preencha os dados e crie uma nova empresa de teste
4. Após criar, volte ao SQL Editor e execute novamente `verify_duplicate_groups.sql`
5. **DEVE retornar 0 linhas** (sem duplicatas)

### PASSO 5: Verificar vinculação de usuários
Execute no SQL Editor:
```sql
SELECT 
  u.name,
  u.email,
  u.role,
  ug.name as grupo,
  t.name as empresa
FROM users u
LEFT JOIN user_groups ug ON ug.id = u.group_id
LEFT JOIN tenants t ON t.id = u.tenant_id
WHERE u.role = 'ADMIN'
ORDER BY t.name, u.name;
```
Todos os usuários ADMIN devem ter um grupo associado.

## 🎯 Resultado Esperado

Após aplicar todas as correções:
- ✅ Não haverá mais grupos duplicados ao criar novas empresas
- ✅ Usuários administradores serão criados já vinculados ao grupo "Administradores"
- ✅ Todos os admins terão permissões completas
- ✅ O painel Super Admin mostrará estatísticas corretas

## 🔍 Monitoramento

Para verificar a saúde do sistema a qualquer momento, execute:
```sql
-- Ver total de grupos por empresa
SELECT 
  t.name,
  COUNT(ug.id) as total_grupos
FROM tenants t
LEFT JOIN user_groups ug ON ug.tenant_id = t.id AND ug.is_system = true
GROUP BY t.id, t.name
ORDER BY t.name;
```
Cada empresa deve ter exatamente **3 grupos** padrão.
