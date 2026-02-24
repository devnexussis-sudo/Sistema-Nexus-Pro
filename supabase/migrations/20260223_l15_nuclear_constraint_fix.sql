-- 🛡️ Nexus Pro - Tech Stock Nuclear Constraint Fix (L15)
-- Este script expurga todas as restrições invisíveis e duplicatas fantasma
-- usando a propriedade física (CTID) do banco, e força a criação da restrição UNIQUE.

BEGIN;

-- 1. Explodir qualquer restrição existente conflitante
ALTER TABLE public.tech_stock DROP CONSTRAINT IF EXISTS tech_stock_user_id_stock_item_id_key CASCADE;
ALTER TABLE public.tech_stock DROP CONSTRAINT IF EXISTS tech_stock_tenant_id_user_id_stock_item_id_key CASCADE;
DROP INDEX IF EXISTS tech_stock_user_item_idx CASCADE;

-- 2. Saneamento Físico de Duplicatas (O método absoluto no PostgreSQL via CTID)
-- Isso apagará todas as réplicas de estoque para o mesmo usuário/item mantendo apenas o mais antigo físico.
DELETE FROM public.tech_stock
WHERE ctid NOT IN (
    SELECT MIN(ctid)
    FROM public.tech_stock
    GROUP BY user_id, stock_item_id
);

-- 3. Forçar a Criação do Unique Index (Exigência absoluta do "ON CONFLICT")
CREATE UNIQUE INDEX tech_stock_user_item_idx ON public.tech_stock(user_id, stock_item_id);

-- Vincular o index à tabela como uma constraint formal (Faz o ON CONFLICT funcionar 100%)
ALTER TABLE public.tech_stock ADD CONSTRAINT tech_stock_user_id_stock_item_id_key UNIQUE USING INDEX tech_stock_user_item_idx;

-- 4. Re-atualizar a função com a garantia de que as chaves estão exatas
CREATE OR REPLACE FUNCTION public.transfer_stock_to_tech(
    p_tech_id UUID,
    p_item_id TEXT,
    p_quantity NUMERIC,
    p_created_by UUID
) RETURNS void AS $$
DECLARE
    v_tenant_id UUID;
    v_current_stock NUMERIC;
BEGIN
    SELECT tenant_id, quantity INTO v_tenant_id, v_current_stock 
    FROM public.stock_items 
    WHERE id = p_item_id;

    IF NOT FOUND THEN RAISE EXCEPTION 'Item de estoque não localizado.'; END IF;
    IF v_current_stock < p_quantity THEN RAISE EXCEPTION 'Saldo insuficiente no estoque geral.'; END IF;

    UPDATE public.stock_items 
    SET quantity = quantity - p_quantity, updated_at = NOW()
    WHERE id = p_item_id;

    INSERT INTO public.tech_stock (tenant_id, user_id, stock_item_id, quantity, updated_at)
    VALUES (v_tenant_id, p_tech_id, p_item_id, p_quantity, NOW())
    ON CONFLICT (user_id, stock_item_id) 
    DO UPDATE SET 
        quantity = public.tech_stock.quantity + EXCLUDED.quantity,
        updated_at = NOW();

    INSERT INTO public.stock_movements (tenant_id, stock_item_id, user_id, type, quantity, source, destination, created_by) 
    VALUES (v_tenant_id, p_item_id, p_tech_id, 'TRANSFER', p_quantity, 'GENERAL', 'TECH', p_created_by);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'L15 Aplicado: Restrições nucleadas e RPC reescrito com sucesso!' as status;
