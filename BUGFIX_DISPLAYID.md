# 🔧 CORREÇÃO GLOBAL - DisplayID vs UUID

**Problema Identificado:** Em todo o sistema aparece o UUID ao invés do DisplayID formatado (OS-xxxxxx)

**Data:** 17/02/2026  
**Status:** 🚧 EM CORREÇÃO

---

## 🎯 RAIZ DO PROBLEMA

O sistema possui dois identificadores para cada OS:

| Campo | Tipo | Exemplo | Uso |
|-------|------|---------|-----|
| `id` | UUID | `97673F05-F3E3-4624-A1F8-0C6966DD9020` | Identificador único do banco |
| `displayId` | String | `OS-123456` | Protocolo formatado para exibição |

**PROBLEMA:** Vários componentes estão usando `order.id` quando deveriam usar `order.displayId`

---

## 📋 ARQUIVOS JÁ CORRIGIDOS

### ✅ 1. AdminDashboard.tsx
- **Linha 656:** Modal header agora mostra `displayId`
- **Linha 557:** Já estava usando fallback correto

### ✅ 2. PublicOrderView.tsx  
- **Linha 148:** PDF/Impressão agora mostra `displayId`
- **Linha 425:** Viewer web agora mostra `displayId`

---

## 🔍 DIAGNÓSTICO NECESSÁRIO

Execute este script SQL no Supabase para verificar o banco:

```sql
-- 1. Verificar OSs com e sem displayId
SELECT 
    COUNT(*) as total,
    COUNT("displayId") as with_display_id,
    COUNT(*) - COUNT("displayId") as without_display_id
FROM service_orders;

-- 2. Ver exemplos
SELECT 
    substring(id::text, 1, 36) as uuid_id,
    "displayId" as protocol,
    title,
    "createdAt"
FROM service_orders
ORDER BY "createdAt" DESC
LIMIT 10;

-- 3. Ver OSs SEM displayId
SELECT 
    substring(id::text, 1, 36) as uuid_id,
    title,
    "customerName",
    "createdAt"
FROM service_orders
WHERE "displayId" IS NULL
ORDER BY "createdAt" DESC;

-- 4. Verificar configuração do tenant
SELECT 
    id,
    name,
    "orderPrefix",
    "orderCounter"
FROM tenants;
```

---

## 🛠️ CORREÇÕES PENDENTES

Encontrei outros lugares que podem estar mostrando UUID:

### 🔴 AdminDashboard.tsx
- ❌ **Linha 975:** `{selectedOrder.id}-VALID-{new Date(...` → Usar `displayId`

### 🔴 FinancialDashboard.tsx
- ❌ **Linha 263:** `O.S. #${item.id.slice(0, 8)}` → Usar `displayId`
- ❌ **Linha 295:** `O.S. #${item.id.slice(0, 8)}` → Usar `displayId`

### 🔴 QuoteManagement.tsx
- ❌ **Linha 257:** `{quote.linkedOrderId.slice(0, 8)}` → Procurar OS e mostrar displayId

---

## 📋 CHECKLIST DE CORREÇÕES

- [x] AdminDashboard linha 656 (título modal)
- [x] PublicOrderView linha 148 (PDF)
- [x] PublicOrderView linha 425 (web)
- [ ] AdminDashboard linha 975 (validação)
- [ ] FinancialDashboard linha 263 (billing notes)
- [ ] FinancialDashboard linha 295 (descrição)
- [ ] QuoteManagement linha 257 (vínculo OS)
- [ ] Pesquisa/busca usando `displayId`
- [ ] Excel export usando `displayId`

---

## 🔧 PADRÃO DE CORREÇÃO

### ANTES (ERRADO):
```typescript
<span>{order.id}</span>
// Mostra: 97673F05-F3E3-4624-A1F8-0C6966DD9020
```

### DEPOIS (CORRETO):
```typescript
<span>{order.displayId || order.id}</span>
// Mostra: OS-123456
// Fallback para UUID se displayId não existir
```

---

## ⚠️ IMPORTANTE

### Por que usar fallback `|| order.id`?

1. **OSs antigas** podem não ter `displayId` (criadas antes da implementação)
2. **Migração de dados** pode não estar completa
3. **Garantir que sempre mostre algo** ao invés de vazio

---

## 🔄 PRÓXIMOS PASSOS

### 1. Execute o diagnóstico SQL
Copie o script acima e execute no Supabase

### 2. Me envie o resultado
Preciso saber:
- Quantas OSs tem `displayId` NULL?
- Qual é o `orderPrefix` configurado no tenant?
- Qual é o `orderCounter` atual?

### 3. Se houver OSs sem displayId
Vou criar um script de migração para gerar `displayId` para OSs antigas

### 4. Corrigir componentes restantes
Depois vou corrigir todos os lugares pendentes listados acima

---

## ⚙️ COMO EXECUTAR O DIAGNÓSTICO

### No Supabase Dashboard:

1. Acesse: https://supabase.com/dashboard
2. Selecione seu projeto
3. Clique em "SQL Editor"
4. Cole o script de diagnóstico
5. Clique em "Run"
6. Me envie uma screenshot do resultado

### Ou via terminal:

```bash
# Cole este comando (com suas credenciais)
psql "postgresql://postgres:[SUA_SENHA]@[SEU_HOST]:5432/postgres" -c "
SELECT 
    COUNT(*) as total,
    COUNT(\"displayId\") as with_display_id
FROM service_orders;
"
```

---

## 📊 RESULTADO ESPERADO

Após todas as correções, **EM TODO O SISTEMA** deve aparecer:

```
OS-123456  ✅
```

Ao invés de:

```
97673F05-F3E3-4624-A1F8-0C6966DD9020  ❌
```

---

**AGUARDANDO DIAGNÓSTICO DO BANCO DE DADOS PARA CONTINUAR** 🔍

Me confirme se consegue executar o script SQL ou precisa de ajuda!
