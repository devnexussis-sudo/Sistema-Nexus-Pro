-- ⏰ CRON JOB: Reset Diário de Posições dos Técnicos
-- Este script configura um job automático para rodar às 00:00 todos os dias

-- 🔧 PASSO 1: Habilitar extensão pg_cron (uma vez só)
-- IMPORTANTE: Se der erro, significa que seu plano do Supabase não tem pg_cron
-- Neste caso, use o PASSO 3 (alternativa) abaixo

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 🔧 PASSO 2: Agendar o reset para rodar às 00:00 (meia-noite) todos os dias

-- Remove job anterior se existir (para evitar duplicação)
SELECT cron.unschedule('reset-tech-positions-daily');

-- Cria novo job
SELECT cron.schedule(
    'reset-tech-positions-daily',           -- Nome do job
    '0 0 * * *',                            -- Cron expression: 00:00 todo dia
    $$SELECT reset_technician_positions_daily()$$  -- Comando SQL a executar
);

-- 🔍 PASSO 3: Verificar se o job foi criado
SELECT * FROM cron.job WHERE jobname = 'reset-tech-positions-daily';

-- Deve retornar algo assim:
-- jobid | schedule  | command                                    | jobname
-- ------|-----------|--------------------------------------------|--------------------------
-- 1     | 0 0 * * * | SELECT reset_technician_positions_daily()  | reset-tech-positions-daily

-- ✅ Se você VER a linha acima, está configurado!

-- ================================================================================
-- 🚨 ALTERNATIVA SE pg_cron NÃO ESTIVER DISPONÍVEL:
-- ================================================================================
-- Se você receber erro "extension pg_cron does not exist", seu plano do Supabase
-- não tem suporte a pg_cron. Neste caso, use uma destas alternativas:
--
-- OPÇÃO A: Configure via Supabase Dashboard (sem SQL)
-- 1. Vá em: Database → Functions → Create a new function
-- 2. Nome: daily_tech_reset
-- 3. Return type: void
-- 4. Definition: SELECT reset_technician_positions_daily();
-- 5. Em Database → Cron Jobs → Create job
-- 6. Schedule: 0 0 * * *
-- 7. Function: daily_tech_reset
--
-- OPÇÃO B: Reset Manual
-- Execute este comando TODO DIA às 00:00:
-- SELECT reset_technician_positions_daily();
--
-- OPÇÃO C: Use serviço externo (Zapier, n8n, etc)
-- Configure webhook para chamar:
-- POST https://seu-projeto.supabase.co/rest/v1/rpc/reset_technician_positions_daily
-- ================================================================================

-- 📝 LOGS: Para ver se o job está rodando
-- Execute isso depois das 00:00 para ver se funcionou:
SELECT * FROM cron.job_run_details 
WHERE jobname = 'reset-tech-positions-daily' 
ORDER BY start_time DESC 
LIMIT 10;

-- ✅ FIM DO SCRIPT
