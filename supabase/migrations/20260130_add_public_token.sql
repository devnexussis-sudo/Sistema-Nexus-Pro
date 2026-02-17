-- Adicionar coluna de Token de Compartilhamento Seguro
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS public_token UUID DEFAULT uuid_generate_v4();

-- Criar um índice para busca rápida por esse token
CREATE INDEX IF NOT EXISTS idx_orders_public_token ON public.orders(public_token);

-- Garantir que o token seja gerado em inserts antigos ou novos que venham sem ele
UPDATE public.orders SET public_token = uuid_generate_v4() WHERE public_token IS NULL;
