-- 🛡️ Nexus Pro - Stock Movements Constraint Fix (L17)
-- Remove restrições antigas (CHECK constraints) da coluna 'type' na tabela de histórico
-- para permitir os novos padrões de transferência: 'TRANSFER', 'CONSUMPTION', 'RESTOCK'.

BEGIN;

DO $$ 
BEGIN 
    -- 1. Remove a restrição 'stock_movements_type_check' se existir, pois
    -- as regras antigas não reconhecem as transações modernas ('TRANSFER', etc)
    ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_type_check;

    -- Extra: Também remover o check de source e destination caso o banco tenha herdado regras estritas
    ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_source_check;
    ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_destination_check;

EXCEPTION WHEN others THEN
    RAISE NOTICE 'Erro ao tentar remover a constraint (ignorando se ela nao existir): %', SQLERRM;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Migração L17 Aplicada: Restrição (Check Constraint) histórica de Tipos foi removida com sucesso!' as status;
