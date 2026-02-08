# 🔐 Enterprise Security & RLS Setup for Supabase

## 📦 O que foi entregue

Este pacote contém tudo que você precisa para alinhar seu banco de dados Supabase (`gbwkfumodaqbmmiwayhf`) aos padrões de segurança de um SaaS enterprise.

### Arquivos Incluídos:

1. **`20260207_enterprise_security_rls.sql`** - Script SQL principal (idempotente)
2. **`SECURITY_VERIFICATION_CHECKLIST.md`** - Guia completo de verificação pós-deploy
3. **`DIAGNOSTIC_QUERIES.sql`** - Queries úteis para diagnóstico e monitoramento

---

## 🚀 Quick Start (3 Passos)

### Passo 1: Aplicar o Script SQL

1. Acesse o **Supabase Dashboard** → **SQL Editor**
2. Abra o arquivo `supabase/migrations/20260207_enterprise_security_rls.sql`
3. Copie todo o conteúdo
4. Cole no SQL Editor
5. Clique em **Run** (ou `Ctrl+Enter`)

**Tempo estimado:** 5-10 segundos

---

### Passo 2: Verificar Aplicação

Execute esta query para confirmar que tudo foi aplicado:

```sql
-- Quick Health Check
SELECT 
  'Tables with RLS' as metric,
  COUNT(*)::text as value
FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = true

UNION ALL

SELECT 
  'Total Policies',
  COUNT(*)::text
FROM pg_policies
WHERE schemaname = 'public'

UNION ALL

SELECT 
  'Helper Functions',
  COUNT(*)::text
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'auth' 
  AND p.proname IN ('get_user_tenant_id', 'is_admin');
```

**Resultados esperados:**
- Tables with RLS: ≥ 10
- Total Policies: ≥ 20
- Helper Functions: 2

---

### Passo 3: Testar API

```bash
# Teste com usuário autenticado
curl -X GET 'https://gbwkfumodaqbmmiwayhf.supabase.co/rest/v1/users' \
  -H "apikey: YOUR_ANON_KEY" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json"
```

**Resultado esperado:**
- ✅ HTTP 200 OK
- ✅ JSON array com dados do tenant do usuário
- ❌ Sem erros 403/406

---

## 📋 O que o Script Faz

### 1. Funções Helper Seguras (SECURITY DEFINER)

- `auth.get_user_tenant_id()` - Extrai tenant_id do JWT ou tabela users
- `auth.is_admin()` - Verifica se usuário é admin
- `auth.get_user_organization_id()` - Alias para compatibilidade

### 2. Habilita RLS em Todas as Tabelas

- ✅ users, tenants, orders, customers, equipments
- ✅ stock_items, stock_categories, stock_movements
- ✅ quotes, contracts, service_types, form_templates
- ✅ user_groups, checklists, e mais...

### 3. Políticas Multi-Tenant

**Padrão para todas as tabelas:**
- SELECT: Apenas dados do mesmo tenant
- INSERT: Apenas no próprio tenant
- UPDATE: Apenas no próprio tenant
- DELETE: Apenas admins no próprio tenant

**Exceções:**
- `users`: Usuários podem ver próprio perfil + outros do tenant
- `orders`: Técnicos podem ver ordens atribuídas a eles

### 4. Índices de Performance

Cria índices em:
- `tenant_id` (todas as tabelas)
- `user_id`, `technician_id`, `customer_id`
- `status`, `created_at`

### 5. Infraestrutura de Auditoria

- Tabela `audit_logs` para rastrear mudanças
- Trigger function `audit_trigger_func()`
- Políticas: apenas admins veem logs do próprio tenant

---

## 🔍 Verificação Completa

Para verificação detalhada, consulte:
- **`SECURITY_VERIFICATION_CHECKLIST.md`** - 18 passos de verificação
- **`DIAGNOSTIC_QUERIES.sql`** - 18 queries de diagnóstico

---

## 🚨 Troubleshooting Rápido

### Erro 403 Forbidden

**Causa:** JWT não contém `metaTenant` ou `tenant_id`

**Solução:**
```sql
-- Verificar JWT
SELECT current_setting('request.jwt.claims', true)::json;

-- Se vazio, adicionar claim no Supabase Auth
-- Dashboard → Authentication → Policies → Custom Claims
```

---

### Erro 406 Not Acceptable

**Causa:** Headers incorretos

**Solução:**
```bash
# Adicionar headers corretos
-H "Content-Type: application/json" \
-H "Accept: application/json"
```

---

### Dados Vazios (mas existem no banco)

**Causa:** RLS filtrando por tenant_id incorreto

**Solução:**
```sql
-- Verificar tenant_id do usuário
SELECT id, email, tenant_id FROM users WHERE id = auth.uid();

-- Verificar se dados têm o mesmo tenant_id
SELECT COUNT(*) FROM orders WHERE tenant_id = (
  SELECT tenant_id FROM users WHERE id = auth.uid()
);
```

---

## 🔄 Rollback (Emergência)

Se precisar reverter (⚠️ **APENAS EM DESENVOLVIMENTO**):

```sql
-- Desabilitar RLS
ALTER TABLE public.users DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders DISABLE ROW LEVEL SECURITY;
-- ... (repetir para todas as tabelas)

-- Dropar funções
DROP FUNCTION IF EXISTS auth.get_user_tenant_id();
DROP FUNCTION IF EXISTS auth.is_admin();
```

---

## 📊 Monitoramento Contínuo

### Query Diária (Performance)

```sql
-- Top 10 queries mais lentas
SELECT 
  substring(query, 1, 100) as query_preview,
  calls,
  mean_time,
  max_time
FROM pg_stat_statements
WHERE query LIKE '%public.%'
ORDER BY mean_time DESC
LIMIT 10;
```

### Query Semanal (Segurança)

```sql
-- Verificar se RLS ainda está ativo
SELECT 
  tablename,
  CASE WHEN rowsecurity THEN '✅' ELSE '❌' END as rls
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
```

---

## 🎯 Checklist de Sucesso

- [ ] Script SQL executado sem erros
- [ ] RLS habilitado em todas as tabelas
- [ ] Políticas criadas (≥ 20)
- [ ] Funções helper existem (2)
- [ ] Índices criados (≥ 15)
- [ ] API retorna 200 (sem 403/406)
- [ ] Cross-tenant access bloqueado
- [ ] Performance aceitável (< 100ms)

---

## 📞 Suporte

Se encontrar problemas:

1. Consulte `SECURITY_VERIFICATION_CHECKLIST.md` (Seção "Troubleshooting")
2. Execute queries de `DIAGNOSTIC_QUERIES.sql`
3. Verifique logs no Supabase Dashboard → Logs → Postgres Logs

---

## 🔐 Notas de Segurança

- ✅ **Nunca** exponha `service_role` key ao frontend
- ✅ Use apenas `anon` e `authenticated` roles no cliente
- ✅ JWT deve conter `metaTenant` ou `tenant_id` claim
- ✅ Funções helper são `SECURITY DEFINER` (executam como postgres)
- ✅ `anon/authenticated` não podem executar funções helper diretamente

---

## 📝 Adaptação para Seu Projeto

Se seus nomes de colunas forem diferentes:

### `organization_id` em vez de `tenant_id`:

```bash
# Find/Replace no script SQL
sed -i '' 's/tenant_id/organization_id/g' 20260207_enterprise_security_rls.sql
```

### JWT claim diferente:

```sql
-- Editar função helper
CREATE OR REPLACE FUNCTION auth.get_user_tenant_id()
RETURNS uuid AS $$
BEGIN
  -- Trocar 'metaTenant' pelo seu claim
  RETURN (current_setting('request.jwt.claims', true)::json->>'SEU_CLAIM')::uuid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

**🚀 Pronto!** Seu Supabase agora está alinhado aos padrões enterprise de segurança SaaS.

**Próximos passos recomendados:**
1. Habilitar audit triggers (comentados no script)
2. Configurar alertas de segurança no Supabase Dashboard
3. Implementar rate limiting no PostgREST
4. Configurar backup automático diário
