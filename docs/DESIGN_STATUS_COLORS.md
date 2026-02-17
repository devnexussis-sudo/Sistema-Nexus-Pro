# 🎨 Nexus Design System - Status Colors

## Paleta de Cores Padronizada

Este documento apresenta as cores oficiais e padronizadas para os status de Ordens de Serviço (OS) do Nexus Pro.

---

## 📊 Status e Cores

### 1. **PENDENTE** (PENDING)
- **Background:** `bg-slate-50` (#f8fafc)
- **Text:** `text-slate-700` (#334155)
- **Border:** `border-slate-200` (#e2e8f0)
- **Icon:** `text-slate-500` (#64748b)
- **Hex Principal:** `#64748b`
- **Uso:** Ordem criada, aguardando atribuição

```tsx
<div className="bg-slate-50 text-slate-700 border border-slate-200">
  Pendente
</div>
```

---

### 2. **ATRIBUÍDO** (ASSIGNED)
- **Background:** `bg-blue-50` (#eff6ff)
- **Text:** `text-blue-700` (#1d4ed8)
- **Border:** `border-blue-200` (#bfdbfe)
- **Icon:** `text-blue-500` (#3b82f6)
- **Hex Principal:** `#3b82f6`
- **Uso:** Ordem atribuída a um técnico, aguardando início

```tsx
<div className="bg-blue-50 text-blue-700 border border-blue-200">
  Atribuído
</div>
```

---

### 3. **EM ANDAMENTO** (IN_PROGRESS)
- **Background:** `bg-amber-50` (#fffbeb)
- **Text:** `text-amber-700` (#b45309)
- **Border:** `border-amber-200` (#fde68a)
- **Icon:** `text-amber-500` (#f59e0b)
- **Hex Principal:** `#f59e0b`
- **Uso:** Técnico iniciou o atendimento

```tsx
<div className="bg-amber-50 text-amber-700 border border-amber-200">
  Em Andamento
</div>
```

---

### 4. **CONCLUÍDO** (COMPLETED)
- **Background:** `bg-emerald-50` (#ecfdf5)
- **Text:** `text-emerald-700` (#047857)
- **Border:** `border-emerald-200` (#a7f3d0)
- **Icon:** `text-emerald-500` (#10b981)
- **Hex Principal:** `#10b981`
- **Uso:** Serviço finalizado com sucesso

```tsx
<div className="bg-emerald-50 text-emerald-700 border border-emerald-200">
  Concluído
</div>
```

---

### 5. **CANCELADO** (CANCELED)
- **Background:** `bg-gray-50` (#f9fafb)
- **Text:** `text-gray-700` (#374151)
- **Border:** `border-gray-300` (#d1d5db)
- **Icon:** `text-gray-500` (#6b7280)
- **Hex Principal:** `#6b7280`
- **Uso:** Ordem cancelada pelo sistema ou usuário

```tsx
<div className="bg-gray-50 text-gray-700 border border-gray-300">
  Cancelado
</div>
```

---

### 6. **IMPEDIDO** (BLOCKED)
- **Background:** `bg-rose-50` (#fff1f2)
- **Text:** `text-rose-700` (#be123c)
- **Border:** `border-rose-200` (#fecdd3)
- **Icon:** `text-rose-500` (#f43f5e)
- **Hex Principal:** `#f43f5e`
- **Uso:** Atendimento impedido por fatores externos (cliente ausente, chuva, etc.)

```tsx
<div className="bg-rose-50 text-rose-700 border border-rose-200">
  Impedido
</div>
```

---

## 💻 Como Usar

### Importação
```typescript
import { 
  getStatusBadge, 
  getStatusLabel,
  getStatusColor,
  getStatusHex 
} from '@/lib/statusColors';
```

### Uso Básico
```typescript
// Obter classes CSS completas para um badge
const badgeClasses = getStatusBadge(OrderStatus.IN_PROGRESS);
// => "bg-amber-50 text-amber-700 border border-amber-200"

// Obter apenas o label
const label = getStatusLabel(OrderStatus.COMPLETED);
// => "Concluído"

// Obter cor hexadecimal (para gráficos)
const hexColor = getStatusHex(OrderStatus.BLOCKED);
// => "#f43f5e"
```

### Componente React
```tsx
import { StatusBadge } from '@/lib/statusColors';

<StatusBadge status={order.status} showIcon={true} />
```

---

## 🎯 Hierarquia Visual

As cores foram escolhidas seguindo princípios de **UI/UX**:

1. **Verde (Concluído):** Ação positiva e completa
2. **Âmbar (Em Andamento):** Atenção, em processamento
3. **Azul (Atribuído):** Neutro informativo, aguardando ação
4. **Cinza Claro (Pendente):** Neutro passivo
5. **Cinza Médio (Cancelado):** Descontinuado, sem prioridade
6. **Vermelho (Impedido):** Alerta, requer intervenção

---

## 🔄 Atualização de Componentes

Todos os arquivos que exibem status devem usar **apenas** o sistema centralizado:

### ✅ Correto:
```tsx
import { getStatusBadge, getStatusLabel } from '@/lib/statusColors';

<div className={getStatusBadge(order.status)}>
  {getStatusLabel(order.status)}
</div>
```

### ❌ Incorreto:
```tsx
// Não hardcode cores!
<div className={`${
  order.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-600' :
  order.status === 'IN_PROGRESS' ? 'bg-amber-50 text-amber-600' :
  'bg-slate-100'
}`}>
  {order.status}
</div>
```

---

## 📁 Arquivos Atualizados

Os seguintes componentesforam padronizados:

- ✅ `/src/apps/tech/v2/views/TechDashboardV2.tsx`
- ✅ `/src/apps/tech/v2/views/OrderDetailsV2.tsx`
- 🔄 **Próximos:** AdminApp, TechDashboard (v1), PublicApp, etc.

---

## 🛠️ Manutenção

**Para alterar cores no futuro:**
1. Edite apenas `/src/lib/statusColors.tsx`
2. Todas as páginas serão atualizadas automaticamente
3. Não quebre o contrato da API (tipos StatusColorConfig)

---

**Última atualização:** 2026-02-10  
**Versão do Design System:** 1.0.0  
**Autor:** Nexus Development Team
