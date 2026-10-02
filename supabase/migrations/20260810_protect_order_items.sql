BEGIN;

-- 🛡️ Nexus Bulletproof Trigger: Impede que aplicativos legados ou em cache limpem a coluna items acidentalmente.
CREATE OR REPLACE FUNCTION public.protect_order_items_on_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Se a nova atualização tentar definir items como NULL ou array vazio
    -- e o registro antigo JÁ TINHA items válidos, nós forçamos a preservação.
    IF (NEW.items IS NULL OR jsonb_array_length(NEW.items) = 0) AND 
       (OLD.items IS NOT NULL AND jsonb_array_length(OLD.items) > 0) THEN
        NEW.items = OLD.items;
        
        -- Garante que o form_data.items também reflita os itens reais para retrocompatibilidade
        IF NEW.form_data IS NOT NULL THEN
            NEW.form_data = jsonb_set(NEW.form_data, '{items}', OLD.items);
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

COMMIT;
