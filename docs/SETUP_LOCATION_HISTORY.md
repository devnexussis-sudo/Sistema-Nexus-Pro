# 🚀 GUIA RÁPIDO: Configurar Histórico e Reset Diário

## ✅ PASSO 1: Rodar Migração Corrigida

**No Supabase Dashboard → SQL Editor:**

1. Clique em "New Query"
2. Copie e cole TODO o conteúdo de:
   ```
   /supabase/migrations/20260203_tech_location_history_fixed.sql
   ```
3. Clique em **"RUN"** ▶️

**Resultado esperado:**
```
✅ Histórico de localização configurado com sucesso!
```

---

## ⏰ PASSO 2: Configurar Reset Diário às 00:00

### Método 1: Via SQL (Recomendado)

**No Supabase Dashboard → SQL Editor:**

1. Clique em "New Query"
2. Cole este código:

```sql
-- Habilita extensão
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove job antigo se existir
SELECT cron.unschedule('reset-tech-positions-daily');

-- Cria job para rodar às 00:00
SELECT cron.schedule(
    'reset-tech-positions-daily',
    '0 0 * * *',
    $$SELECT reset_technician_positions_daily()$$
);

-- Verifica se criou
SELECT * FROM cron.job WHERE jobname = 'reset-tech-positions-daily';
```

3. Clique **"RUN"**

**✅ Se retornar uma linha com os dados do job = Configurado!**

---

### Método 2: Via Dashboard do Supabase (se Método 1 der erro)

**Se você ver erro: "extension pg_cron does not exist"**

Seu plano do Supabase não tem pg_cron. Use o Dashboard:

1. **Vá em:** Database → Edge Functions (ou Extensions)
2. **Procure por:** Cron Jobs ou Scheduled Tasks
3. **Clique em:** "Create a new cron job"
4. **Preencha:**
   - **Name:** reset-tech-positions-daily
   - **Schedule:** `0 0 * * *`
   - **SQL Command:** `SELECT reset_technician_positions_daily();`
5. **Clique:** Save

---

### Método 3: Reset Manual (Temporário)

Se nenhum método acima funcionar, você pode rodar manualmente todo dia:

**No Supabase SQL Editor, rode às 00:00:**

```sql
SELECT reset_technician_positions_daily();
```

---

## 🧪 COMO TESTAR SE ESTÁ FUNCIONANDO

### Teste 1: Verificar se histórico está salvando

1. Faça um técnico enviar localização (abra app mobile)
2. No SQL Editor, rode:

```sql
-- Ver últimos pings registrados
SELECT 
    t.name,
    h.latitude,
    h.longitude,
    h.recorded_at
FROM technician_location_history h
JOIN technicians t ON t.id = h.technician_id
ORDER BY h.recorded_at DESC
LIMIT 10;
```

**✅ Deve mostrar os pings do técnico!**

### Teste 2: Verificar se o relatório funciona

1. No dashboard admin, clique em **"Relatórios"** no menu
2. Selecione a data de hoje
3. Você deve ver técnicos que enviaram ping hoje

### Teste 3: Testar reset manual

```sql
-- Teste o reset manualmente
SELECT reset_technician_positions_daily();

-- Depois verifique se limpou
SELECT 
    name,
    last_latitude,
    last_longitude,
    last_seen
FROM technicians;

-- ✅ Técnicos antigos devem ter NULL nestes campos
```

---

## 🔍 VERIFICAR SE CRON JOB ESTÁ RODANDO

**Depois das 00:00, rode:**

```sql
-- Ver histórico de execuções
SELECT * FROM cron.job_run_details 
WHERE jobname = 'reset-tech-positions-daily' 
ORDER BY start_time DESC 
LIMIT 5;
```

**Deve mostrar:**
- start_time: quando rodou
- status: "succeeded" se funcionou
- return_message: mensagem de sucesso

---

## ❌ ERROS COMUNS

### Erro: "extension pg_cron does not exist"

**Solução:** Seu plano não tem pg_cron. Use Método 2 (Dashboard) ou Método 3 (Manual).

### Erro: "policy already exists"

**Solução:** Você rodou a migração antiga. Use a versão FIXED:
```
/supabase/migrations/20260203_tech_location_history_fixed.sql
```

### Relatório vazio

**Causas possíveis:**
1. Técnicos não enviaram ping hoje
2. Migração não foi rodada
3. Data selecionada incorreta

**Teste:**
```sql
-- Ver se tem registros
SELECT COUNT(*) FROM technician_location_history WHERE date = CURRENT_DATE;
```

---

## 📞 RESUMO SUPER RÁPIDO

1. ✅ **Rode:** `20260203_tech_location_history_fixed.sql`
2. ⏰ **Configure cron job** (Método 1, 2 ou 3)
3. 🧪 **Teste:** Veja se relatório aparece no menu
4. 🎉 **Pronto!**

---

**Desenvolvido pelo Nexus Team! 🚀**
