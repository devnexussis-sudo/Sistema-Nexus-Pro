# 🌙 Sistema de Reset Diário e Histórico de Movimentação

## 📋 Resumo

Implementação de duas funcionalidades principais:
1. **Reset automático do mapa às 00:00** - Limpa posições antigas para começar o dia com mapa limpo
2. **Registro diário de movimentação** - Histórico completo de todos os pings dos técnicos para consulta

---

## 🗄️ Banco de Dados

### Tabela: `technician_location_history`

Armazena todo o histórico de localizações dos técnicos:

```sql
- id: UUID (chave primária)
- technician_id: UUID (referência ao técnico)
- tenant_id: UUID (referência à empresa)
- latitude: DOUBLE PRECISION
- longitude: DOUBLE PRECISION
- recorded_at: TIMESTAMPTZ (quando foi registrado)
- date: DATE (data do registro)
- hour: INTEGER (hora do registro 0-23)
```

### Funções SQL

#### 1. `save_technician_location_history()`
- **Trigger automático** que salva no histórico toda vez que um técnico atualiza sua posição
- Só registra se a posição realmente mudou (evita spam)
- Executa automaticamente, sem necessidade de código adicional

#### 2. `reset_technician_positions_daily()`
- Limpa as posições (`last_latitude`, `last_longitude`, `last_seen`) de todos os técnicos
- Só reseta técnicos que foram vistos antes do dia atual
- **Deve ser executada às 00:00 todos os dias**

#### 3. `get_daily_tech_movement_report(p_tenant_id, p_date)`
- Gera relatório completo de movimentação para uma data específica
- Retorna para cada técnico:
  - Total de pings no dia
  - Primeiro e último ping
  - Horas ativas (diferença entre primeiro e último ping)
  - Número de locais visitados

---

## ⚙️ Configuração Necessária

### 1. Rodar a Migração SQL

**No Supabase Dashboard → SQL Editor:**

Cole e execute o arquivo:
```
/supabase/migrations/20260203_tech_location_history.sql
```

### 2. Configurar Cron Job (IMPORTANTE!)

Para o reset automático às 00:00, configure um cron job no Supabase:

**Opção A - Via pg_cron (Recomendado):**

```sql
-- Ativa extensão pg_cron (uma vez só)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Agenda reset diário às 00:00 (meia-noite)
SELECT cron.schedule(
    'reset-tech-positions-daily',
    '0 0 * * *', -- Executa às 00:00 todos os dias
    $$SELECT reset_technician_positions_daily()$$
);
```

**Opção B - Via Supabase Dashboard:**

1. Vá em: **Database → Cron Jobs**
2. Clique em "Create a new cron job"
3. **Name:** Reset Tech Positions Daily
4. **Schedule:** `0 0 * * *` (meia-noite)
5. **Command:** `SELECT reset_technician_positions_daily()`
6. Salve

**Opção C - Reset Manual (Temporário):**

Se não puder configurar cron job agora, rode manualmente todo dia:

```sql
SELECT reset_technician_positions_daily();
```

---

## 🎯 Funcionalidades Implementadas

### Frontend

#### 1. **Reset Automático Local** (`TechnicianMap.tsx`)
- Verifica a cada 5 minutos se virou o dia
- Quando detecta novo dia:
  - Limpa cache local
  - Recarrega técnicos
  - Registra log no console
- Complementa o reset do backend

#### 2. **Botão de Refresh Manual**
- Botão circular com ícone de refresh
- Invalida cache e busca dados frescos
- Animação de spin enquanto carrega
- Fica na barra superior do mapa

#### 3. **Componente de Relatório** (`TechnicianMovementReport.tsx`)
- Visualização completa do histórico diário
- Seletor de data
- Cards de resumo:
  - Técnicos ativos no dia
  - Total de pings
  - Média de horas ativas
- Tabela detalhada por técnico:
  - Avatar e nome
  - Total de pings
  - Primeiro/último ping
  - Horas ativas
  - Locais visitados

---

## 📊 Como Usar o Relatório

### Adicionar ao Dashboard

No seu componente Dashboard principal, importe e adicione:

```tsx
import { TechnicianMovementReport } from './components/admin/TechnicianMovementReport';

// No seu JSX
<TechnicianMovementReport />
```

### Integrar em Nova Aba

Ou crie uma aba dedicada para relatórios:

```tsx
{activeTab === 'relatorios' && (
  <TechnicianMovementReport />
)}
```

---

## 🔍 Consultando Histórico Manualmente

### Via SQL

```sql
-- Movimentação de hoje
SELECT * FROM get_daily_tech_movement_report(
    'seu-tenant-id'::uuid,
    CURRENT_DATE
);

-- Movimentação de data específica
SELECT * FROM get_daily_tech_movement_report(
    'seu-tenant-id'::uuid,
    '2026-02-03'::date
);

-- Histórico bruto de um técnico
SELECT 
    recorded_at,
    latitude,
    longitude
FROM technician_location_history
WHERE technician_id = 'id-do-tecnico'
  AND date = '2026-02-03'
ORDER BY recorded_at;
```

---

## 🛡️ Segurança

✅ **RLS Ativado** - Usuários só veem histórico do próprio tenant
✅ **Triggers Seguros** - `SECURITY DEFINER` para bypass controlado
✅ **Índices Otimizados** - Queries rápidas mesmo com muito histórico
✅ **Cascade Delete** - Histórico é removido se técnico for deletado

---

## 📈 Benefícios

### Para Gestão:
- ✅ Saber quantas horas cada técnico trabalhou
- ✅ Verificar se técnico realmente visitou o local
- ✅ Analisar produtividade diária
- ✅ Auditoria completa de movimentação

### Para Sistema:
- ✅ Mapa sempre limpo no início do dia
- ✅ Sem técnicos "fantasmas" parados
- ✅ Melhor experiência visual
- ✅ Histórico preservado para consulta

---

## 🚀 Próximos Passos

1. ✅ **Rodar migração SQL**
2. ✅ **Configurar cron job para reset diário**
3. ✅ **Adicionar componente de relatório ao dashboard**
4. ✅ **Testar reset manual:**
   ```sql
   SELECT reset_technician_positions_daily();
   ```
5. ✅ **Verificar histórico:**
   - Fazer técnico enviar alguns pings
   - Consultar relatório do dia

---

## 🐛 Troubleshooting

**Histórico não está salvando?**
- Verifique se o trigger foi criado:
  ```sql
  SELECT * FROM pg_trigger WHERE tgname = 'trigger_save_tech_location_history';
  ```

**Reset não executa automaticamente?**
- Verifique se o cron job está ativo:
  ```sql
  SELECT * FROM cron.job WHERE jobname = 'reset-tech-positions-daily';
  ```

**Relatório vazio?**
- Verifique se há registros:
  ```sql
  SELECT COUNT(*) FROM technician_location_history WHERE date = CURRENT_DATE;
  ```

---

**Desenvolvido com precisão de engenheiro do MIT! 🎓**
