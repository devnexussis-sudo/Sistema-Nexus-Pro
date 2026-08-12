import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

const sql = `
CREATE OR REPLACE FUNCTION public.protect_order_items_on_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Só restaura items se o registro ANTIGO tinha itens REAIS (não array vazio)
    -- Isso impede que a proteção interfira em updates de outros campos como form_data._internalNotes
    IF (NEW.items IS NULL OR jsonb_array_length(NEW.items) = 0) AND 
       (OLD.items IS NOT NULL AND jsonb_array_length(OLD.items) > 0) THEN
        NEW.items = OLD.items;
        
        -- CORRIGIDO: usa || (merge) em vez de jsonb_set completo
        -- Isso preserva _internalNotes e outros campos enquanto atualiza apenas items
        IF NEW.form_data IS NOT NULL THEN
            NEW.form_data = NEW.form_data || jsonb_build_object('items', OLD.items);
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
`;

async function applyFix() {
    console.log("Applying trigger fix via RPC...");
    const { error } = await supabase.rpc('exec_sql', { sql });
    if (error) {
        console.error("RPC failed:", error.message);
        // Try direct query via REST
        const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
            method: 'POST',
            headers: {
                'apikey': supabaseServiceKey,
                'Authorization': `Bearer ${supabaseServiceKey}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ sql })
        });
        console.log("REST response:", response.status, await response.text());
    } else {
        console.log("✅ Trigger fixed!");
    }
}

applyFix();
