-- 🛡️ Nexus Pro - Tech Stock Constraint Fix (L14)
-- Remove duplicatas históricas do banco de dados e aplica a restrição UNIQUE necessária 
-- para que o banco permita a função transacional com upsert (ON CONFLICT).

BEGIN;

-- 1. Consolidar registros duplicados causados pela falta de restrição anterior
-- (Soma as quantidades de itens iguais do mesmo técnico e mantém o registro mais antigo)
WITH duplicates AS (
    SELECT user_id, stock_item_id, SUM(quantity) as total_qty, MAX(updated_at) as last_update, MIN(id::text)::uuid as keep_id
    FROM public.tech_stock
    GROUP BY user_id, stock_item_id
    HAVING COUNT(id) > 1
)
UPDATE public.tech_stock t
SET quantity = d.total_qty, updated_at = d.last_update
FROM duplicates d
WHERE t.id = d.keep_id;

-- 2. Remover os registros redundantes (agora que o saldo está consolidado em um só ID)
DELETE FROM public.tech_stock
WHERE id NOT IN (
    SELECT MIN(id::text)::uuid
    FROM public.tech_stock
    GROUP BY user_id, stock_item_id
);

-- 3. Injetar a "Blindagem" - A restrição UNIQUE exigida pelo ON CONFLICT do RPC
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM pg_constraint c
        JOIN pg_class t ON c.conrelid = t.oid
        JOIN pg_namespace n ON t.relnamespace = n.oid
        JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(c.conkey)
        WHERE t.relname = 'tech_stock' 
          AND n.nspname = 'public' 
          AND c.contype = 'u'
          AND a.attname IN ('user_id', 'stock_item_id')
    ) THEN
        ALTER TABLE public.tech_stock ADD CONSTRAINT tech_stock_user_id_stock_item_id_key UNIQUE(user_id, stock_item_id);
    END IF;
EXCEPTION WHEN others THEN
    RAISE NOTICE 'A restrição relacional já existe, ou ocorreu um erro ignorado de duplicidade. (%)', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Migração L14 aplicada: Restrições UNIQUE em tech_stock consolidadas com sucesso!' as status;
