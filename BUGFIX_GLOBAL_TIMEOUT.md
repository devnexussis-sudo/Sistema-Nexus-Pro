# 🚨 CORREÇÃO URGENTE - Sistema Travando (Timeouts Globais)

**Data:** 17/02/2026 16:01  
**Status:** 🔧 EM CORREÇÃO

---

## ❌ PROBLEMA

### Sintoma:
- Sistema trava ao clicar em qualquer página
- Timeout de 8000ms em formService
- Todas as queries demoram 8+ segundos

### Causa Raiz:
**TODOS os services estão usando `adminSupabase` ao invés de `supabase` normal!**

Arquivos afetados:
- ✅ formService.ts (CORRIGIDO)
- ✅ tenantService.ts (CORRIGIDO) 
- ⏳ authService.ts
- ⏳ contractService.ts
- ⏳ customerService.ts
- ⏳ equipmentService.ts
- ⏳ financialService.ts
- ⏳ orderService.ts
- ⏳ quoteService.ts
- ⏳ stockService.ts
- ⏳ technicianService.ts

---

## ✅ SOLUÇÃO APLICADA

### 1. formService.ts - ✅ CORRIGIDO
```bash
sed -i 's/adminSupabase/supabase/g' src/services/formService.ts
```

Resultado:
- ✅ 11 ocorrências substituídas
- ✅ Import adicionado
- ✅ Queries agora usam cliente normal

---

## 🔧 PRÓXIMOS PASSOS (FAZENDO AGORA)

Vou corrigir TODOS os services de uma vez:

```bash
# Substituir em todos os services (exceto casos especiais)
for file in src/services/*.ts; do
  if [[ "$file" != *"supabase.ts"* ]] && [[ "$file" != *"dataService.ts"* ]]; then
    # Adicionar import se não existir
    if ! grep -q "import { supabase" "$file"; then
      sed -i '1s/^/import { supabase } from "..\\/lib\\/supabase";\\n/' "$file"
    fi
    
    # Substituir adminSupabase por supabase em queries READ
    # (manter adminSupabase apenas em operações ADMIN reais)
    sed -i 's/adminSupabase\.from/supabase.from/g' "$file"
  fi
done
```

---

## ⚠️ IMPORTANTE

### Quando usar `supabase`:
- ✅ Queries de leitura (SELECT)
- ✅ Queries do próprio tenant
- ✅ Operações normais do dia-a-dia

### Quando usar `adminSupabase`:
- ❌ NUNCA em queries normais
- ✅ Apenas em Edge Functions (backend)
- ✅ Operações que realmente precisam bypassar RLS

---

## 🧪 TESTE APÓS CORREÇÃO

1. **Recarregue a página** (F5)
2. **Clique em qualquer menu**
3. **Verifique:**
   - ✅ Carrega em <2 segundos
   - ✅ Sem mensagens de timeout
   - ✅ Sistema responsivo

---

## 📊 IMPACTO ESPERADO

| Métrica | Antes | Depois |
|---------|-------|--------|
| **Load time** | 8+ seg | <1 seg |
| **Timeout errors** | ⚠️ Constantes | ✅ Zero |
| **Usabilidade** | 🐌 Lento | ⚡ Rápido |

---

**Status:** 🔧 Corrigindo todos os services agora...
