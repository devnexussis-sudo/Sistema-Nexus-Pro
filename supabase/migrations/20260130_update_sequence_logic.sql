-- Atualizar a função para respeitar o número inicial definido no Cadastro da Empresa
CREATE OR REPLACE FUNCTION public.get_next_order_id(p_tenant_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_start_number INTEGER;
    v_current_count INTEGER;
    v_next_val INTEGER;
BEGIN
    -- 1. Pega o número inicial configurado para esta empresa (Painel Master)
    SELECT os_start_number INTO v_start_number 
    FROM public.tenants 
    WHERE id = p_tenant_id;
    
    -- Fallback se não estiver configurado
    IF v_start_number IS NULL THEN v_start_number := 1000; END IF;

    -- 2. Conta quantas OS esta empresa já tem gravadas
    SELECT count(*) INTO v_current_count 
    FROM public.orders 
    WHERE tenant_id = p_tenant_id;

    -- 3. O próximo número é o Start + quantidade atual
    -- Isso garante que se você mudar o número inicial no Admin, a próxima OS já segue a nova regra
    v_next_val := v_start_number + v_current_count;

    RETURN v_next_val;
END;
$$;
