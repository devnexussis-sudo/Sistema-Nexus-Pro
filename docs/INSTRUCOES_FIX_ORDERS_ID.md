# Instruções para Configurar Geração de IDs de Ordens de Serviço

## Visão Geral

O sistema agora gera automaticamente os IDs das Ordens de Serviço seguindo o padrão configurado para cada empresa no **Painel Super Admin Master**.

## Como Funciona

Cada empresa pode ter sua própria configuração de numeração:
- **Prefixo**: Ex: `OS-`, `CHM-`, `SRV-`, etc.
- **Número Inicial**: Ex: `1000`, `5000`, `10000`, etc.

### Exemplos:
- **Empresa A** (Prefixo: `OS-`, Início: `1000`) → `OS-1000`, `OS-1001`, `OS-1002`...
- **Empresa B** (Prefixo: `CHM-`, Início: `5000`) → `CHM-5000`, `CHM-5001`, `CHM-5002`...
- **Empresa C** (Prefixo: `SRV-`, Início: `10000`) → `SRV-10000`, `SRV-10001`, `SRV-10002`...

## Passo 1: Executar a Migration no Supabase

1. Acesse seu projeto no Supabase: https://supabase.com/dashboard
2. No menu lateral, clique em **SQL Editor**
3. Clique em **New Query**
4. Copie e cole o conteúdo do arquivo `migration_fix_orders_id.sql`
5. Clique em **RUN** para executar

### O que a Migration Faz:

✅ Cria uma função `generate_order_id(tenant_id)` que:
   - Busca o prefixo e número inicial da empresa
   - Conta quantas ordens a empresa já tem
   - Gera o próximo ID na sequência

✅ Cria um TRIGGER que:
   - Executa automaticamente antes de inserir uma nova ordem
   - Gera o ID baseado nas configurações da empresa
   - Garante que IDs sejam únicos mesmo com inserções simultâneas

## Passo 2: Configurar as Empresas

No **Painel Super Admin Master** (acessível via `#nexus-master`):

1. Acesse cada empresa
2. Configure:
   - **Prefixo do Código**: Ex: `OS-`, `CHM-`, `SRV-`
   - **Número Inicial**: Ex: `1000`, `5000`, `10000`
3. Salve as alterações

## Passo 3: Testar

1. Faça login como administrador de uma empresa
2. Crie uma nova Ordem de Serviço
3. O ID será gerado automaticamente seguindo o padrão configurado

### Exemplo de Teste no SQL Editor:

```sql
-- Ver configuração de uma empresa
SELECT id, name, os_prefix, os_start_number 
FROM tenants 
WHERE name = 'Sua Empresa';

-- Testar geração de ID (substitua o UUID pelo ID da sua empresa)
SELECT generate_order_id('fd5421a5-c05d-48ca-9646-177ec337ac91'::UUID);

-- Ver ordens criadas
SELECT id, title, tenant_id, createdAt 
FROM orders 
ORDER BY createdAt DESC 
LIMIT 10;
```

## Código Atualizado

O código do sistema foi atualizado para:

✅ **Validar** que o tenant_id está presente antes de criar ordem
✅ **Remover** campos incompatíveis (id, tenantId) antes de enviar ao banco
✅ **Passar** o tenant_id corretamente para o trigger funcionar
✅ **Logar** informações úteis para debug (tenant_id, id gerado)

## Resolução de Problemas

### Erro: "Tenant ID não encontrado"
**Solução**: Faça logout e login novamente

### Erro: "null value in column id"
**Solução**: Verifique se a migration foi executada corretamente no Supabase

### IDs não seguem o padrão esperado
**Solução**: 
1. Verifique as configurações da empresa no Super Admin
2. Execute no SQL Editor:
   ```sql
   SELECT id, name, os_prefix, os_start_number FROM tenants;
   ```
3. Confirme que `os_prefix` e `os_start_number` estão configurados

### Verificar se o Trigger está ativo
```sql
SELECT trigger_name, event_manipulation, event_object_table
FROM information_schema.triggers 
WHERE event_object_table = 'orders';
```

Deve retornar: `trigger_set_order_id | INSERT | orders`

## Notas Importantes

- ⚠️ A numeração é **sequencial por empresa** (não global)
- ⚠️ Cada empresa tem sua própria sequência independente
- ⚠️ O número incrementa automaticamente a cada nova ordem
- ⚠️ Não é possível ter "buracos" na numeração (ex: pular de 1001 para 1003)
- ✅ O sistema garante unicidade mesmo com múltiplos usuários criando ordens simultaneamente

## Suporte

Se encontrar problemas:
1. Verifique os logs do console do navegador (F12)
2. Verifique se a migration foi executada
3. Confirme que a empresa tem `os_prefix` e `os_start_number` configurados
4. Teste a função SQL diretamente no Supabase SQL Editor
