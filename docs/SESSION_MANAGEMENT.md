# ⏰ Nexus Pro - Gestão de Sessão e Tokens

## 📊 Tempos de Expiração Configurados

### **Supabase (Backend)**
| Token | Tempo de Expiração | Renovação |
|-------|-------------------|-----------|
| Access Token (JWT) | **1 hora (3600s)** | Automática via Refresh Token |
| Refresh Token | **Indefinido** | N/A (dura até ser revogado) |
| Auto-refresh | **Sim** | Ativado por padrão |

### **Frontend (Nexus Pro)**
| Mecanismo | Tempo | Ação |
|-----------|-------|------|
| **Auto-logout Inatividade** | **1h30min (90min)** | Logout automático + reload |
| **Renovação Proativa** | **50min** | Refresh token antes de expirar |
| **Verificação de Inatividade** | **1min** | Checagem contínua |
| **Toast de Aviso** | **2s antes** | Notifica usuário |

---

## 🔄 Estratégia de Proteção em Camadas

### **Camada 1: Renovação Proativa** (50 minutos)
```
Usuário logado
    ↓
  50min → Renovação automática do token
    ↓
Token renovado (válido por +1h)
```

**Objetivo:** Evitar que o token expire durante uso ativo

### **Camada 2: Auto-logout Preventivo** (1h30min)
```
Usuário inativo
    ↓
  90min → Auto-logout preventivo
    ↓
Sessão limpa + Reload → Tela de login
```

**Objetivo:** Fazer logout ANTES do Supabase ter problemas (margem de segurança de 30min)

### **Camada 3: Detecção de Falha** (Qualquer momento)
```
Requisição ao banco
    ↓
Erro JWT/Auth detectado
    ↓
Logout imediato + Reload
```

**Objetivo:** Recuperação instantânea se algo falhar

---

## 📅 Linha do Tempo Completa

```
Minuto 0:   Login ✅
            |
Minuto 50:  🔄 Renovação proativa de token (automática)
            |
Minuto 60:  (Token do Supabase expiraria, mas já foi renovado aos 50min)
            |
Minuto 90:  ⏰ Auto-logout por inatividade (SE usuário não interagiu)
            |
Minuto 100: 🔄 Nova renovação proativa (SE usuário ainda ativo)
            |
Minuto 120: (Sem risco - sistema já fez logout ou renovou várias vezes)
```

---

## 🎯 Por Que 1h30 e Não 2h?

### ❌ **Problema com 2 horas:**
- Supabase expira access token em **1h**
- Refresh token pode falhar por diversos motivos:
  - Rede instável
  - Servidor ocupado
  - Conflitos de concorrência
  - Cache corrompido

Se falhar, usuário fica **TRAVADO** na tela de loading.

### ✅ **Solução com 1h30:**
- **Margem de segurança de 30min** antes do Supabase ter problemas
- Renovação proativa a cada **50min** garante token sempre válido
- Se renovação falhar → Auto-logout limpo aos **90min**
- Nunca chegamos perto dos **120min** problemáticos

---

## 🔧 Configurações Técnicas

### **App.tsx - Renovação Proativa**
```typescript
// Renova token a cada 50min (ANTES de expirar em 1h)
const tokenRefreshInterval = setInterval(async () => {
  if (auth.isAuthenticated) {
    const { supabase } = await import('./lib/supabase');
    const { data, error } = await supabase.auth.refreshSession();
    if (error) {
      // Se falhar, faz logout preventivo
      SessionStorage.clear();
      window.location.reload();
    }
  }
}, 50 * 60 * 1000); // 50 minutos
```

### **App.tsx - Auto-logout Inatividade**
```typescript
// Verifica inatividade a cada 1min
const checkInactivity = setInterval(() => {
  const ONE_HOUR_THIRTY = 1.5 * 60 * 60 * 1000; // 90min
  if (Date.now() - lastActivityRef.current > ONE_HOUR_THIRTY) {
    logger.warn('Auto-logout: 1.5h de inatividade');
    setToast({ message: 'Sessão expirada...', type: 'info' });
    setTimeout(() => {
      SessionStorage.clear();
      window.location.reload();
    }, 2000);
  }
}, 60000); // 1 minuto
```

### **dataService.ts - Detecção de Falha**
```typescript
// Detecta erros de autenticação em qualquer requisição
if (error.message?.includes('JWT') || 
    error.message?.includes('expired') ||
    error.code === 'PGRST301') {
  throw new Error('SESSION_EXPIRED_AUTH');
}

// Logout forçado quando detectado
if (err.message === 'SESSION_EXPIRED_AUTH') {
  SessionStorage.clear();
  window.location.reload();
}
```

---

## 🧪 Como Testar

### **Teste 1: Renovação Proativa Funciona**
1. Faça login
2. Aguarde **55 minutos** sem interagir
3. Abra Console → Network
4. Veja requisição de `refreshSession` sendo feita
5. ✅ Token renovado automaticamente

### **Teste 2: Auto-logout Após Inatividade**
1. Faça login
2. Aguarde **95 minutos** SEM tocar no sistema
3. ✅ Toast aparece: "Sessão expirada por inatividade"
4. ✅ Sistema recarrega e vai para login

### **Teste 3: Atividade Reseta Timer**
1. Faça login
2. Aguarde **80 minutos**
3. Mova o mouse ou clique em algo
4. Timer de inatividade reseta para 0
5. Aguarde mais **95 minutos**
6. ✅ Só então faz logout

### **Teste 4: Simular 90min (Rápido)**
```javascript
// Cole no DevTools Console
lastActivityRef.current = Date.now() - (100 * 60 * 1000); // 100min atrás
// Aguarde 1 minuto
// ✅ Sistema faz logout
```

---

## 📈 Benefícios da Nova Abordagem

| Aspecto | Antes (2h) | Depois (1h30 + Proativa) |
|---------|-----------|--------------------------|
| **Risco de travamento** | Alto | Muito baixo |
| **Sessões expiradas** | Comum | Raro |
| **Experiência do usuário** | Frustante | Suave |
| **Manutenção manual** | Necessária | Automática |
| **Margem de segurança** | 0min | 30min |
| **Renovações proativas** | 0 | Infinitas (a cada 50min) |

---

## ⚙️ Como Ajustar se Necessário

### **Para AUMENTAR tempo antes do logout:**
```typescript
// App.tsx linha ~231
const ONE_HOUR_THIRTY = 2 * 60 * 60 * 1000; // Mude para 2h (120min)
```

⚠️ **NÃO RECOMENDADO:** Aumenta risco de travamento

### **Para DIMINUIR tempo antes do logout:**
```typescript
const ONE_HOUR = 1 * 60 * 60 * 1000; // 60min
```

✅ **MAIS SEGURO:** Maior margem de segurança

### **Para ajustar frequência de renovação:**
```typescript
// App.tsx linha ~265
}, 45 * 60 * 1000); // Renova a cada 45min (mais frequente)
```

---

## 🚨 Avisos Importantes

### **⚠️ NUNCA configure auto-logout para MAIS de 2 horas**
- Supabase pode ter problemas após esse período
- Renovação automática pode falhar
- Usuário ficará travado

### **✅ Recomendação: 1h a 1h30**
- Equilíbrio perfeito entre segurança e UX
- Margem suficiente para renovações
- Nunca chega perto do limite do Supabase

### **🔧 Se precisar de sessões muito longas:**
- Configure no **Supabase Dashboard** para aumentar tempo de access token
- Settings → Auth → JWT Expiry
- Aumente de 3600s (1h) para 7200s (2h)
- Ajuste o frontend proporcionalmente

---

**Última atualização:** 2026-02-10  
**Versão:** 2.0  
**Mantenedor:** Nexus Development Team
