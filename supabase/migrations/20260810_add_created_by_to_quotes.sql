-- Adiciona a coluna created_by na tabela quotes caso não exista
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS created_by TEXT DEFAULT NULL;
