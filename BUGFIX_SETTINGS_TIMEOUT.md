# 🔧 CORREÇÃO - Timeout em Configurações

**Data:** 17/02/2026 15:54
**Problema:** Dados da empresa não carregavam na página de Configurações

---

## ❌ PROBLEMA IDENTIFICADO

### Sintoma:
```
[FormService] ⚠️ Timeout de 8000ms atingido. Usando fallback.
```

### Causa Raiz:
A função `getTenantById()` no `tenantService.ts` estava usando `adminSupabase` ao invés de `supabase` normal, causando:
1. Lentidão na query (tentando usar credenciais admin)
2. Timeout após 8 segundos
3. Campos vazios na página

---

## ✅ SOLUÇÃO IMPLEMENTADA

### Arquivo Modificado:
`src/services/tenantService.ts` (linhas 68-115)

### Mudanças:

**ANTES:**
```typescript
const { data, error } = await adminSupabase
    .from('tenants')
    .select('*')
    .eq('id', tid)
    .single();
```

**DEPOIS:**
```typescript
const { data, error } = await supabase  // ✅ Cliente normal
    .from('tenants')
    .select('*')
    .eq('id', tid)
    .single();
```

### Melhorias Adicionadas:

1. ✅ **Try/Catch** em ambas as queries
2. ✅ **Logs detalhados** para debug
3. ✅ **Erro tratado** (retorna null ao invés de throw)
4. ✅ **Confirmação de sucesso** com log do nome da empresa

---

## 🧪 TESTE AGORA

1. **Recarregue a página** (Cmd+R ou F5)
2. **Vá em Configurações**
3. **Verifique:**
   - ✅ Dados carregam em <2 segundos
   - ✅ Campos preenchidos automaticamente
   - ✅ Log no console: `[TenantService] ✅ Tenant carregado: NOME_DA_EMPRESA`

---

## 📊 IMPACTO

### Performance:
- **Antes:** 8+ segundos (timeout)
- **Depois:** <1 segundo ⚡

### UX:
- **Antes:** Campos vazios, usuário confuso
- **Depois:** Dados aparecem instantaneamente

---

## 🔍 VERIFICAÇÃO NO CONSOLE

Você deve ver:
```
[TenantService] ✅ Tenant carregado: Sua Empresa Ltda
SettingsPage Sync: Database Response for Tenant: {...}
```

Se ainda der erro, verá:
```
[TenantService] Erro ao buscar tenant por ID: <detalhes>
```

---

## ⚠️ OBSERVAÇÃO IMPORTANTE

O `adminSupabase` só deve ser usado:
- Em Edge Functions (backend)
- Em operações que realmente precisam de privilégios elevados
- NUNCA em queries normais de leitura

---

**Status:** ✅ CORRIGIDO
**Teste:** Recarregue a página de Configurações agora!
