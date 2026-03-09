-- 🛡️ Nexus Pro - Stock Return Transaction (L18)
-- Implementa The "Devolução" (Return) transaction para retornar itens não utilizados
-- do estoque do técnico de volta para o inventário geral, com log impecável.

BEGIN;

-- Criando a função RPC para garantir Atomicidade, seguindo nosso padrão Big Tech.
CREATE OR REPLACE FUNCTION public.return_stock_from_tech(
    p_tech_id UUID,
    p_item_id TEXT,
    p_quantity NUMERIC,
    p_created_by UUID
) RETURNS void AS $$
DECLARE
    v_tenant_id UUID;
    v_current_tech_stock NUMERIC;
BEGIN
    -- 1. Obter tenant_id e validar existência/saldo exato nas mãos do técnico
    SELECT tenant_id, quantity INTO v_tenant_id, v_current_tech_stock 
    FROM public.tech_stock 
    WHERE user_id = p_tech_id AND stock_item_id = p_item_id;

    IF NOT FOUND OR v_current_tech_stock IS NULL THEN
        RAISE EXCEPTION 'Item de estoque não encontrado nas mãos do técnico.';
    END IF;

    IF v_current_tech_stock < p_quantity THEN
        RAISE EXCEPTION 'O técnico não possui quantidade suficiente para devolver (Atual: %, Requerido para devolução: %)', v_current_tech_stock, p_quantity;
    END IF;

    -- 2. Deduzir o saldo do Técnico rigorosamente
    UPDATE public.tech_stock 
    SET quantity = quantity - p_quantity, 
        updated_at = NOW()
    WHERE user_id = p_tech_id AND stock_item_id = p_item_id;

    -- 3. Devolver (somar) o saldo de volta ao Estoque Geral
    UPDATE public.stock_items
    SET quantity = quantity + p_quantity,
        updated_at = NOW()
    WHERE id = p_item_id;

    -- 4. Gravar a Log no Audit Trail ("RESTOCK" de origem do tipo "TECH")
    INSERT INTO public.stock_movements (
        tenant_id, stock_item_id, user_id, type, quantity, source, destination, created_by
    ) VALUES (
        v_tenant_id, p_item_id, p_tech_id, 'RETURN', p_quantity, 'TECH', 'GENERAL', p_created_by
    );

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'L18 Aplicado: Transação atômica "return_stock_from_tech" criada.' as status;
