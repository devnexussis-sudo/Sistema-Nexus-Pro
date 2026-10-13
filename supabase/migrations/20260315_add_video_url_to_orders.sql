-- Adiciona a coluna video_url na tabela orders (se não existir)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'video_url') THEN
        ALTER TABLE public.orders ADD COLUMN video_url text;
    END IF;
END $$;
