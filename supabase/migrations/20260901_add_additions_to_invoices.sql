-- Migration para adicionar colunas de frete e outros acréscimos na tabela invoices
ALTER TABLE public.invoices
ADD COLUMN shipping_amount numeric NOT NULL DEFAULT 0,
ADD COLUMN other_additions_amount numeric NOT NULL DEFAULT 0;
