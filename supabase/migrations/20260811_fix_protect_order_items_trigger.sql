-- Correção do trigger protect_order_items_on_update
-- Problema: o trigger sobrescreve form_data mesmo quando OLD.items é array vazio,
-- impedindo que campos como _internalNotes sejam salvos.
-- Solução: só restaurar items/form_data quando OLD.items tem ITENS REAIS (length > 0).

CREATE OR REPLACE FUNCTION public.protect_order_items_on_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Só restaura items se o registro ANTIGO tinha itens REAIS (não array vazio)
    -- Isso impede que a proteção interfira em updates de outros campos como form_data._internalNotes
    IF (NEW.items IS NULL OR jsonb_array_length(NEW.items) = 0) AND 
       (OLD.items IS NOT NULL AND jsonb_array_length(OLD.items) > 0) THEN
        NEW.items = OLD.items;
        
        -- Garante que o form_data.items também reflita os itens reais para retrocompatibilidade
        -- MAS PRESERVA todos os outros campos do form_data (como _internalNotes)
        IF NEW.form_data IS NOT NULL THEN
            NEW.form_data = NEW.form_data || jsonb_build_object('items', OLD.items);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_protect_order_items ON public.orders;
CREATE TRIGGER trg_protect_order_items
    BEFORE UPDATE ON public.orders
    FOR EACH ROW
    EXECUTE PROCEDURE public.protect_order_items_on_update();
