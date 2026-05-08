-- ============================================================
-- Nexus Pro — Backfill public_token em orçamentos existentes
-- Autor: Antigravity AI
-- Data: 2026-05-06
--
-- PROBLEMA: Orçamentos criados antes desta migração não possuem
-- public_token, fazendo a RLS "quotes_public_read" bloquear
-- acesso anônimo (a policy exige public_token IS NOT NULL).
--
-- SOLUÇÃO: Preencher public_token com gen_random_uuid() para
-- todos os registros onde o campo é NULL.
-- ============================================================

BEGIN;

-- Garante que a extensão pgcrypto está ativa (já deve estar no Supabase)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Preenche public_token para todos os orçamentos que não têm
UPDATE public.quotes
SET public_token = gen_random_uuid()
WHERE public_token IS NULL;

-- Log para confirmação
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.quotes WHERE public_token IS NOT NULL;
  RAISE NOTICE '[Nexus] Backfill concluído. Total de orçamentos com public_token: %', v_count;
END;
$$;

-- Adiciona constraint NOT NULL para novos registros (opcional, mas recomendado)
-- ALTER TABLE public.quotes ALTER COLUMN public_token SET NOT NULL;
-- Comentado pois pode quebrar inserts legados que não passam o campo.

NOTIFY pgrst, 'reload schema';

COMMIT;
