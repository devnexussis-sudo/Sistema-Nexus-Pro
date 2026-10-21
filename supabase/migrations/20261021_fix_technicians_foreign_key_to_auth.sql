-- ==============================================================================
-- MIGRATION: FIX TECHNICIANS FOREIGN KEY TO AUTH.USERS (DECOUPLE FROM USERS)
-- Data: 2026-10-21
-- Motivo: O cadastro de técnicos agora é 100% independente do cadastro de usuários do sistema.
--         A tabela public.technicians possuía a constraint `technicians_id_fkey` apontando
--         para `public.users(id)`. Como técnicos não precisam existir na tabela `public.users`,
--         o insert falhava com violação de foreign key.
--
-- Solução:
--   1. Altera `technicians.id` para referenciar diretamente `auth.users(id) ON DELETE CASCADE`.
--   2. Altera `service_visits.technician_id` para referenciar `auth.users(id) ON DELETE SET NULL`.
--   3. Altera `tech_stock.user_id` para referenciar `auth.users(id) ON DELETE CASCADE`.
-- ==============================================================================

BEGIN;

-- 1. TABELA TECHNICIANS: Aponta id para auth.users(id)
DO $$
BEGIN
    -- Remove a constraint antiga se existir
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'technicians_id_fkey' AND table_name = 'technicians'
    ) THEN
        ALTER TABLE public.technicians DROP CONSTRAINT technicians_id_fkey;
    END IF;

    -- Adiciona a nova constraint referenciando auth.users(id)
    ALTER TABLE public.technicians 
        ADD CONSTRAINT technicians_id_fkey 
        FOREIGN KEY (id) 
        REFERENCES auth.users(id) 
        ON DELETE CASCADE NOT VALID;
END $$;


-- 2. TABELA SERVICE_VISITS: Ajusta technician_id para auth.users(id)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'service_visits_technician_id_fkey' AND table_name = 'service_visits'
    ) THEN
        ALTER TABLE public.service_visits DROP CONSTRAINT service_visits_technician_id_fkey;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'service_visits'
    ) THEN
        ALTER TABLE public.service_visits 
            ADD CONSTRAINT service_visits_technician_id_fkey 
            FOREIGN KEY (technician_id) 
            REFERENCES auth.users(id) 
            ON DELETE SET NULL NOT VALID;
    END IF;
END $$;


-- 3. TABELA TECH_STOCK: Ajusta user_id para auth.users(id)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'tech_stock_user_id_fkey' AND table_name = 'tech_stock'
    ) THEN
        ALTER TABLE public.tech_stock DROP CONSTRAINT tech_stock_user_id_fkey;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'tech_stock'
    ) THEN
        ALTER TABLE public.tech_stock 
            ADD CONSTRAINT tech_stock_user_id_fkey 
            FOREIGN KEY (user_id) 
            REFERENCES auth.users(id) 
            ON DELETE CASCADE NOT VALID;
    END IF;
END $$;

COMMIT;
