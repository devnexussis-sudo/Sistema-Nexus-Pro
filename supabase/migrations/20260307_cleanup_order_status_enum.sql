-- ============================================================
-- Migration: Safely Upgrade order_status enum and Migrate Data
-- Date: 2026-03-07
-- ============================================================

-- 1. Adicionar os novos status permitidos ao ENUM (IGNORANDO se já existirem)
-- Adições a Enums devem ocorrer fora de blocos de transação explícitos em algumas versões,
-- ADD VALUE IF NOT EXISTS é suportado nativamente pelo Postgres
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'PENDENTE';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'ATRIBUÍDO';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'EM DESLOCAMENTO';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'EM ANDAMENTO';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'CONCLUÍDO';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'CANCELADO';
ALTER TYPE order_status ADD VALUE IF NOT EXISTS 'IMPEDIDO';

-- 2. Atualizar todos os registros existentes na tabela para usar os novos valores
UPDATE public.orders SET status = 'EM ANDAMENTO' WHERE status::text IN ('NO LOCAL', 'IN_PROGRESS');
UPDATE public.orders SET status = 'IMPEDIDO' WHERE status::text IN ('PAUSADO', 'PAUSED', 'BLOCKED');
UPDATE public.orders SET status = 'CANCELADO' WHERE status::text IN ('CANCELED');
UPDATE public.orders SET status = 'PENDENTE' WHERE status::text IN ('PENDING');
UPDATE public.orders SET status = 'CONCLUÍDO' WHERE status::text IN ('COMPLETED');
UPDATE public.orders SET status = 'ATRIBUÍDO' WHERE status::text IN ('ASSIGNED');
UPDATE public.orders SET status = 'EM DESLOCAMENTO' WHERE status::text IN ('TRAVELING');

-- 3. Consertar o valor default da coluna
ALTER TABLE public.orders ALTER COLUMN status SET DEFAULT 'PENDENTE'::order_status;

-- 4. Atualizar a trigger function que ainda tentava escrever valores em Inglês / Obsoletos
CREATE OR REPLACE FUNCTION public.sync_order_status_from_visit()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status::text = 'paused' AND OLD.status::text IS DISTINCT FROM 'paused' THEN
        UPDATE public.orders 
        SET status = 'IMPEDIDO', pause_reason = NEW.pause_reason, updated_at = NOW()
        WHERE id = NEW.order_id;
    END IF;

    IF NEW.status::text = 'completed' AND OLD.status::text IS DISTINCT FROM 'completed' THEN
        UPDATE public.orders 
        SET status = 'CONCLUÍDO', end_date = NOW(), updated_at = NOW()
        WHERE id = NEW.order_id;
    END IF;

    IF NEW.status::text = 'ongoing' AND OLD.status::text IS DISTINCT FROM 'ongoing' THEN
        UPDATE public.orders 
        SET status = 'EM ANDAMENTO', start_date = COALESCE(start_date, NOW()), updated_at = NOW()
        WHERE id = NEW.order_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
