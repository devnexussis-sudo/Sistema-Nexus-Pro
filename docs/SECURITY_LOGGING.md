# 🛡️ Guia de Segurança de Logs - Nexus Pro

## ⚠️ REGRAS CRÍTICAS

### ❌ NUNCA Faça Isso:
```typescript
// ❌ MAL - Expõe dados sensíveis em produção
console.log('User logged in:', userId, email);
console.log('Token:', authToken);
console.log('Database query:', { id, password });
```

### ✅ SEMPRE Faça Isso:
```typescript
// ✅ BOM - Usa logger seguro
import { logger } from '@/lib/logger';

logger.debug('User logged in'); // Sem dados sensíveis
logger.info('Auth completed'); // Informativo
logger.error('Login failed', error); // Erro sanitizado
```

---

## 📚 Como Usar o Logger

### 1. Importe o Logger
```typescript
import { logger } from '@/lib/logger';
```

### 2. Níveis de Log

#### 🐛 DEBUG (Apenas DEV)
Para debugging detalhado - **NUNCA** aparece em produção
```typescript
logger.debug('Processing order', { orderId, status });
// Produção: 🔇 Silencioso
// Dev: 🔊 Mostra tudo (dados são sanitizados)
```

#### ℹ️ INFO (Apenas DEV)
Para informações gerais
```typescript
logger.info('User logged in successfully');
// Produção: 🔇 Silencioso
// Dev: 🔊 Mostra mensagem
```

#### ⚠️ WARN (Apenas DEV)
Para avisos importantes
```typescript
logger.warn('Cache miss, fetching from database');
// Produção: 🔇 Silencioso
// Dev: 🔊 Mostra aviso
```

#### ❌ ERROR (SEMPRE)
Para erros críticos - **SEMPRE** logado (mas sanitizado)
```typescript
logger.error('Failed to create order', error);
// Produção: ✅ Mostra erro (dados sensíveis removidos)
// Dev: ✅ Mostra erro completo
```

#### 🚀 TRACK (Apenas PRODUÇÃO)
Para métricas e analytics
```typescript
logger.track('order_created', { count: 1, status: 'success' });
// Produção: ✅ Envia para analytics
// Dev: 🔇 Silencioso
```

---

## 🔒 Dados Sanitizados Automaticamente

O logger **remove automaticamente** estes dados:

| Campo | Original | Sanitizado |
|-------|----------|------------|
| `id`, `userId` | `abc-123-def-456` | `***REDACTED***` |
| `email` | `user@example.com` | `us***@example.com` |
| `password` | `mypassword123` | `***REDACTED***` |
| `token` | `eyJhbGc...` | `***REDACTED***` |
| `tenantId` | `tenant-uuid` | `***REDACTED***` |

---

## 🚀 Build de Produção

**AUTOMATICAMENTE** removido no build:
- ✅ Todos `console.log()`
- ✅ Todos `console.debug()`
- ✅ Todos `console.info()`
- ✅ Todos `console.warn()`
- ✅ Todos `debugger;` statements

**Configurado em:** `vite.config.ts`
```typescript
esbuild: {
  drop: ['console', 'debugger']
}
```

---

## 📋 Checklist de Segurança

Antes de commitar código, verifique:

- [ ] Nenhum `console.log` com dados de usuário
- [ ] Nenhum ID/email/token em logs
- [ ] Usou `logger.*` ao invés de `console.*`
- [ ] Erros sensíveis tratados com `logger.error`
- [ ] Sem senhas/tokens em variáveis de debug

---

## 🎯 Exemplos Práticos

### ✅ Exemplo Correto: Login
```typescript
import { logger } from '@/lib/logger';

async function handleLogin(email: string, password: string) {
  try {
    logger.info('Login attempt started');
    
    const user = await authenticateUser(email, password);
    
    logger.info('Login successful');
    logger.track('login_success', { method: 'email' });
    
    return user;
  } catch (error) {
    logger.error('Login failed', error);
    logger.track('login_failed', { method: 'email' });
    throw error;
  }
}
```

### ✅ Exemplo Correto: API Request
```typescript
async function fetchOrders() {
  try {
    logger.debug('Fetching orders from database');
    
    const orders = await db.orders.findMany();
    
    logger.info('Orders fetched successfully', { count: orders.length });
    
    return orders;
  } catch (error) {
    logger.error('Failed to fetch orders', error);
    return [];
  }
}
```

### ❌ Exemplo ERRADO
```typescript
// ❌ NUNCA faça isso!
async function badExample() {
  const user = await getUser();
  console.log('User data:', user); // ❌ Expõe email, id, etc
  
  const token = generateToken(user.id);
  console.log('Generated token:', token); // ❌ Expõe token JWT
  
  return { user, token };
}
```

---

## 🔍 Verificando em Produção

### Como Testar
1. Faça build: `npm run build`
2. Rode em modo preview: `npm run preview`
3. Abra DevTools > Console
4. **NENHUM** log deve aparecer (exceto erros críticos)

### Validação
```bash
# Build o projeto
npm run build

# Procure por console.log no bundle (não deve encontrar)
grep -r "console.log" dist/

# Se encontrar algo, está ERRADO! 🚨
```

---

## 📞 Suporte

Dúvidas sobre o logger? Consulte:
- **Arquivo:** `/src/lib/logger.ts`
- **Config:** `/vite.config.ts`
- **Docs:** Este arquivo

---

**Última atualização:** 2026-02-10
**Versão:** 1.0.0
