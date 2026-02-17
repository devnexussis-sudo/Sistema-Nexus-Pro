# 🔐 Isolamento de Sessões por Aba - Implementação

## 🚨 Problema Identificado

Quando abrimos **2 abas diferentes** (Admin e App Técnico), **ambas sincronizam** e mudam para o mesmo modo. Isso acontece porque:

1. O sistema usa `localStorage` que é **compartilhado** entre todas as abas
2. Quando você faz login em uma aba, **todas as outras abas** recebem a atualização
3. Não há isolamento de sessão entre os acessos

### Exemplo do Problema:
```
Aba 1: Login como Admin → localStorage.setItem('nexus_user', admin)
Aba 2: Estava como Técnico → MUDA para Admin (BUG!)
```

## ✅ Solução Implementada

Criei um **Sistema de Sessões Isoladas** usando `sessionStorage`:

### Como Funciona:

```typescript
// ANTES (localStorage - compartilhado)
localStorage.setItem('nexus_user', JSON.stringify(user));

// DEPOIS (sessionStorage - isolado por aba)
SessionStorage.set('user', user);
```

### Características:

- ✅ **Cada aba** tem sua própria sessão independente
- ✅ **Não há sincronização** entre abas
- ✅ Aba Admin **NÃO afeta** Aba Técnico
- ✅ Aba Master **NÃO afeta** outras abas
- ✅ **Fechou a aba** = sessão encerrada automaticamente

## 📝 Arquivo Criado

**`src/lib/sessionStorage.ts`**

Este arquivo fornece:

### 1. `SessionStorage` - Dados Isolados por Aba
```typescript
// Cada aba tem seus próprios dados
SessionStorage.set('user', adminUser);      // Aba 1
SessionStorage.set('user', techUser);       // Aba 2 (independente)
SessionStorage.set('user', masterUser);     // Aba 3 (independente)
```

### 2. `GlobalStorage` - Dados Compartilhados (opcional)
```typescript
// Para dados que DEVEM ser compartilhados (tema, idioma, etc)
GlobalStorage.set('theme', 'dark');
```

### 3. Migração Automática
- Detecta dados antigos do `localStorage`
- Migra automaticamente para `sessionStorage`
- Mantém compatibilidade

## 🔧 Próximos Passos para Implementação

### PASSO 1: Atualizar App.tsx

Substituir todas as chamadas de `localStorage` relacionadas a autenticação por `SessionStorage`:

**Linhas a modificar no App.tsx:**
- Linha 101: `localStorage.getItem('nexus_is_impersonating')`
- Linha 105: `localStorage.getItem('nexus_master_session_v2')`  
- Linha 138, 142, 145, 156: `localStorage.getItem('nexus_user')`
- Linha 150-151: `localStorage.removeItem()`
- Linha 222: `localStorage.removeItem('nexus_user')`
- Linha 346-347: Login handlers
- Linha 406-407: Impersonation cleanup

**Exemplo de mudança:**
```typescript
// ANTES
const stored = localStorage.getItem('nexus_user');
if (stored) setAuth({ user: JSON.parse(stored), isAuthenticated: true });

// DEPOIS  
import SessionStorage from './lib/sessionStorage';
const stored = SessionStorage.get('user');
if (stored) setAuth({ user: stored, isAuthenticated: true });
```

### PASSO 2: Atualizar dataService.ts

Substituir chamadas de `localStorage` para dados de sessão:

**Funções que precisam ser atualizadas:**
- `getCurrentTenantId()` - Linha 62-74
- `login()` - Linhas 223-224
- `refreshUser()` - Linha 243

**Exemplo:**
```typescript
// ANTES
localStorage.setItem('nexus_user', JSON.stringify(user));
localStorage.setItem('nexus_current_tenant', tenantId);

//DEPOIS
SessionStorage.set('user', user);
SessionStorage.set('current_tenant', tenantId);
```

### PASSO 3: Atualizar SuperAdminPage.tsx

Substituir localStorage usado no modo Master:

**Linhas a modificar:**
- Linha 88-90: Logout handler
- Linha 205: `localStorage.setItem('nexus_current_tenant')`
- Linha 218-220: Impersonation setup

### PASSO 4: Testar Isolamento

**Teste 1: Abas Independentes**
1. Aba 1: Login como **Admin**
2. Aba 2: Login como **Técnico**
3. Aba 3: Login como **Master**
4. ✅ Cada aba deve manter seu próprio estado

**Teste 2: Logout Isolado  **
1. Aba 1: Logout do Admin
2. Aba 2: Técnico **continua logado** ✅
3. Aba 3: Master **continua logado** ✅

**Teste 3: Fechamento de Aba**
1. Fechar Aba 1 (Admin)
2. Reabrir a mesma URL
3. ✅ Deve pedir login novamente (sessão perdida)

## 🎯 Resultado Esperado

Após a implementação completa:

- ✅ **3 painéis isolados**: Admin, Técnico, Master
- ✅ Abrir **múltiplas abas** do mesmo painel (ex: 2 abas Admin)
- ✅ Cada aba **mantém sua própria sessão**
- ✅ **Nenhuma aba interfere** com outra
- ✅ **Segurança aumentada**: dados sensíveis não persistem após fechar aba

## ⚠️ Notas Importantes

### Quando usar SessionStorage:
- ✅ Dados de autenticação (user, token, tenant_id)
- ✅ Estado de impersonation
- ✅ Sessão Master
- ✅ Qualquer dado que NÃO deve ser compartilhado entre abas

### Quando usar GlobalStorage (localStorage):
- ✅ Preferências do usuário (tema, idioma)
- ✅ Configurações de UI
- ✅ Cache de dados não sensíveis
- ✅ Dados que DEVEM persistir após fechar aba

### Não usar nenhum dos dois:
- ❌ Tokens de API (usar cookies HTTP-only)
- ❌ Senhas (NUNCA armazenar)
- ❌ Dados muito grandes (usar IndexedDB)

## 🚀 Implementação Recomendada

Posso ajudar a implementar essas mudanças em etapas:

1. **Fase 1**: Criar testes para validar funcionalidade atual
2. **Fase 2**: Atualizar App.tsx gradualmente
3. **Fase 3**: Atualizar dataService.ts
4. **Fase 4**: Atualizar demais componentes
5. **Fase 5**: Remover localStorage legado (após validação)

Quer que eu comece a implementação agora?
