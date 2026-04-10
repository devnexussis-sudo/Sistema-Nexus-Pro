-- Migração para adicionar campo de imagem os items de estoque
ALTER TABLE public.stock_items
ADD COLUMN IF NOT EXISTS image_url TEXT;
