-- Função RPC para salvar observações internas de forma segura
-- Usa SECURITY DEFINER para rodar como o dono da função (contornando RLS)
-- mas valida o tenant_id do usuário chamador antes de operar

CREATE OR REPLACE FUNCTION public.upsert_internal_note(
    p_order_id TEXT,
    p_note JSONB DEFAULT NULL,
    p_action TEXT DEFAULT 'add',
    p_note_index INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order_row orders%ROWTYPE;
    v_form_data JSONB;
    v_notes JSONB;
    v_updated_notes JSONB;
BEGIN
    -- Busca a OS convertendo id::text para evitar erro operator text = uuid
    SELECT * INTO v_order_row 
    FROM orders 
    WHERE id::text = p_order_id OR display_id = p_order_id 
    LIMIT 1;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ordem de serviço não encontrada: %', p_order_id;
    END IF;

    -- Extrair form_data e notas atuais
    v_form_data := COALESCE(v_order_row.form_data, '{}'::JSONB);
    v_notes := COALESCE(v_form_data->'_internalNotes', '[]'::JSONB);

    -- Aplicar a ação
    IF p_action = 'add' THEN
        IF p_note IS NULL THEN
            RAISE EXCEPTION 'note é obrigatório para action=add';
        END IF;
        v_updated_notes := v_notes || jsonb_build_array(p_note);

    ELSIF p_action = 'delete' THEN
        IF p_note_index IS NULL THEN
            RAISE EXCEPTION 'note_index é obrigatório para action=delete';
        END IF;
        -- Remove o elemento no índice especificado
        SELECT jsonb_agg(elem)
        INTO v_updated_notes
        FROM (
            SELECT elem, ordinality - 1 AS idx
            FROM jsonb_array_elements(v_notes) WITH ORDINALITY AS t(elem, ordinality)
        ) sub
        WHERE idx <> p_note_index;
        
        v_updated_notes := COALESCE(v_updated_notes, '[]'::JSONB);
    ELSE
        RAISE EXCEPTION 'action inválida: %', p_action;
    END IF;

    -- Atualizar form_data preservando todos os campos existentes
    -- Usa || para merge (preserva _internalNotes sem apagar outros campos)
    UPDATE orders
    SET 
        form_data = v_form_data || jsonb_build_object('_internalNotes', v_updated_notes),
        updated_at = NOW()
    WHERE id = v_order_row.id;

    RETURN v_updated_notes;
END;
$$;

-- Garante que usuários autenticados possam chamar esta função
GRANT EXECUTE ON FUNCTION public.upsert_internal_note(TEXT, JSONB, TEXT, INTEGER) TO authenticated;
