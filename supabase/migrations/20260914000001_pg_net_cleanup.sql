-- =========================================================================
-- MIGRATION: PG_NET HTTP RESPONSE CLEANUP
-- =========================================================================

-- Função para limpar respostas HTTP antigas (7 dias)
CREATE OR REPLACE FUNCTION public.prune_http_responses()
RETURNS void AS $$
BEGIN
    DELETE FROM net._http_response WHERE created_at < NOW() - INTERVAL '7 days';
EXCEPTION WHEN undefined_table THEN
    -- Ignora se a extensão pg_net não estiver instalada ou a tabela não existir
    NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualiza o agendamento no pg_cron para rodar todo dia às 05:00 AM
DO $$
BEGIN
  PERFORM cron.unschedule('prune_http_responses_job');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule('prune_http_responses_job', '0 5 * * *', 'SELECT public.prune_http_responses();');
