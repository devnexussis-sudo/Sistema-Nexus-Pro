# Admin Operations Edge Function

Esta Edge Function processa operações administrativas sensíveis de forma segura.

## Segurança

- ✅ Service Role Key NUNCA exposta ao cliente
- ✅ Validação JWT do usuário
- ✅ Verificação de permissões super admin
- ✅ CORS configurado
- ✅ Error handling robusto

## Uso

### Deploy

```bash
supabase functions deploy admin-operations
```

### Configurar Secrets

```bash
# No Supabase Dashboard > Edge Functions > Secrets
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-SECRETA
```

### Chamar do Cliente

```typescript
const response = await fetch(
  'https://seu-projeto.supabase.co/functions/v1/admin-operations',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${userToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      action: 'create_user',
      payload: {
        email: 'user@example.com',
        password: 'secure-password',
        user_metadata: { name: 'User Name' }
      }
    })
  }
);

const data = await response.json();
```

## Ações Disponíveis

- `create_user` - Criar novo usuário
- `delete_user` - Deletar usuário
- `update_user` - Atualizar usuário
- `list_users` - Listar todos os usuários

## Permissões Necessárias

O usuário que chama esta função DEVE ter:
- `permissions.accessSuperAdmin = true` na tabela `users`
