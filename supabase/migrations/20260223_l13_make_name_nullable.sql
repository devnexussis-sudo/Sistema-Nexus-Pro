-- 🛡️ Nexus Pro - Stock Items Structural Fix (L13)
-- Desacopla a obrigatoriedade da coluna `name` para tabelas de sistemas antigos (legado).
-- O campo `description` é o novo padrão para cadastro de produtos no módulo financeiro.

BEGIN;

DO $$ 
BEGIN 
    -- 1. Remover a restrição NOT NULL da coluna legada 'name', se existir
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='name') THEN
        ALTER TABLE public.stock_items ALTER COLUMN name DROP NOT NULL;
    END IF;
    
    -- 2. Garantir que todo registro antigo que s\u00f3 tem nome receba a descrição preenchida
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_items' AND column_name='description') THEN
        UPDATE public.stock_items SET description = name WHERE description IS NULL OR description = '';
    END IF;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Migração L13 (Tolerância a colunas legadas) aplicada!' as status;
