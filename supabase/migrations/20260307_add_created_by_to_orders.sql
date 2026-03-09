-- Adiciona a coluna created_by na tabela orders caso estivesse faltando
BEGIN;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
NOTIFY pgrst, 'reload schema';
COMMIT;
