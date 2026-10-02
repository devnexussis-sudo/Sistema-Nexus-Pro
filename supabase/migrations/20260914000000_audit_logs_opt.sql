-- =========================================================================
-- MIGRATION: AUDIT LOGS OPTIMIZATION & CLEANUP
-- =========================================================================

-- 1. Modificar a função de expurgo para 30 dias (antes era 90)
CREATE OR REPLACE FUNCTION public.prune_audit_logs()
RETURNS void AS $$
BEGIN
    -- Usa changed_at ou created_at dependendo de como a tabela foi finalizada
    DELETE FROM public.audit_logs
    WHERE COALESCE(changed_at, created_at) < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualiza o agendamento no pg_cron para rodar todo dia às 04:00 AM
DO $$
BEGIN
  PERFORM cron.unschedule('prune_audit_job');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
SELECT cron.schedule('prune_audit_job', '0 4 * * *', 'SELECT public.prune_audit_logs();');


-- 3. Remover triggers de log para tabelas de alto volume (seguro contra tabelas inexistentes)
DO $$
BEGIN
  BEGIN
    DROP TRIGGER IF EXISTS audit_whatsapp_messages ON public.whatsapp_messages;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DROP TRIGGER IF EXISTS audit_whatsapp_conversations ON public.whatsapp_conversations;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DROP TRIGGER IF EXISTS audit_technician_gps_pings ON public.technician_gps_pings;
  EXCEPTION WHEN undefined_table THEN NULL; END;

  BEGIN
    DROP TRIGGER IF EXISTS audit_service_visits ON public.service_visits;
  EXCEPTION WHEN undefined_table THEN NULL; END;
END $$;


-- 4. Otimizar trigger de OS e Orçamentos (Não logar INSERT, apenas UPDATE/DELETE)
-- NOTA DA NASA: Mantemos o UPDATE na tabela 'orders' pois a funcionalidade de 
-- Timeline da OS (get_order_timeline) lê os audit_logs para mostrar a mudança 
-- de status e atribuição de técnico. Ignoramos o INSERT (Criação) pois já fica salvo na própria tabela.

DROP TRIGGER IF EXISTS audit_orders ON public.orders;
CREATE TRIGGER audit_orders
AFTER UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();

DROP TRIGGER IF EXISTS audit_quotes ON public.quotes;
CREATE TRIGGER audit_quotes
AFTER UPDATE OR DELETE ON public.quotes
FOR EACH ROW EXECUTE FUNCTION public.audit_trigger_func();
