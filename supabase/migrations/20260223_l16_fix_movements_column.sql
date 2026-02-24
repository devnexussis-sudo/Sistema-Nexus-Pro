-- 🛡️ Nexus Pro - Stock Movements Column Fix (L16)
-- Como a tabela 'stock_movements' era de uma versão muito antiga, a coluna chamava-se 'item_id'
-- e o novo sistema transacional tenta inserir usando o padrão 'stock_item_id'.
-- Este script renomeia a coluna ou a cria caso ela ainda não exista.

BEGIN;

DO $$ 
BEGIN 
    -- 1. Se a coluna antiga 'item_id' existir, vamos renomeá-la para o novo padrão 'stock_item_id'
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='item_id') THEN
        ALTER TABLE public.stock_movements RENAME COLUMN item_id TO stock_item_id;
    END IF;

    -- 2. Se depois da tentativa de renomear, nem a nova (stock_item_id) nem a velha existirem:
    -- Vamos criar a coluna limpa
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='stock_item_id') THEN
        ALTER TABLE public.stock_movements ADD COLUMN stock_item_id TEXT;
        
        -- Vamos também religar a restrição de FK
        ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_stock_item_id_fkey 
        FOREIGN KEY (stock_item_id) REFERENCES public.stock_items(id) ON DELETE CASCADE;
    END IF;

    -- 3. Assegurar que os tipos das outras colunas essenciais transacionais também estão compatíveis
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='reference_id') THEN
        ALTER TABLE public.stock_movements ADD COLUMN reference_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='created_by') THEN
        ALTER TABLE public.stock_movements ADD COLUMN created_by UUID;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='source') THEN
        ALTER TABLE public.stock_movements ADD COLUMN source TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='stock_movements' AND column_name='destination') THEN
        ALTER TABLE public.stock_movements ADD COLUMN destination TEXT;
    END IF;

END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Migração L16 Aplicada: Coluna stock_item_id mapeada e resolvida.' as status;
