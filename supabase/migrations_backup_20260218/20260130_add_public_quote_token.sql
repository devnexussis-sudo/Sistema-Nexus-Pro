-- Adicionar coluna de Token de Compartilhamento Seguro para Orçamentos
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT uuid_generate_v4();

-- Criar um índice para busca rápida por esse token
CREATE INDEX IF NOT EXISTS idx_quotes_public_token ON public.quotes(public_token);

-- Garantir que o token seja gerado em registros antigos
UPDATE public.quotes SET public_token = uuid_generate_v4() WHERE public_token IS NULL;
