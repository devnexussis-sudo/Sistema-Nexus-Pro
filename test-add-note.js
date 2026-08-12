import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

async function testAddNote() {
    console.log("Fetching a CONCLUÍDO order...");
    const { data: dbOrders, error: fetchErr } = await supabase
        .from('orders')
        .select('id, form_data, items, tenant_id')
        .eq('status', 'CONCLUÍDO')
        .limit(1);

    if (fetchErr || !dbOrders || dbOrders.length === 0) {
        console.error("Failed to fetch order", fetchErr);
        return;
    }

    const dbOrder = dbOrders[0];
    console.log(`Found Order: ${dbOrder.id}`);
    console.log(`items type: ${typeof dbOrder.items}, length: ${Array.isArray(dbOrder.items) ? dbOrder.items.length : 'N/A'}`);

    const existingFormData = dbOrder.form_data || {};
    const currentNotes = Array.isArray(existingFormData._internalNotes) ? existingFormData._internalNotes : [];
    
    const newNote = {
        text: "Teste Final " + new Date().getTime(),
        user: "Sistema",
        date: new Date().toISOString()
    };

    const updatedNotes = [...currentNotes, newNote];
    const existingItems = Array.isArray(dbOrder.items) && dbOrder.items.length > 0 ? dbOrder.items : undefined;

    const updatePayload = {
        form_data: { ...existingFormData, _internalNotes: updatedNotes },
        updated_at: new Date().toISOString()
    };
    if (existingItems) {
        updatePayload.items = existingItems;
        console.log("Including items in update payload");
    } else {
        console.log("No items to include (empty array or null)");
    }

    console.log("\nUpdating order with new note...");
    const { error: updateErr } = await supabase
        .from('orders')
        .update(updatePayload)
        .eq('id', dbOrder.id);

    if (updateErr) {
        console.error("❌ Update failed:", updateErr);
    } else {
        console.log("✅ Update call succeeded!");
        const { data: checkData } = await supabase.from('orders').select('form_data').eq('id', dbOrder.id).single();
        const savedNotes = checkData?.form_data?._internalNotes;
        if (savedNotes && savedNotes.length > 0) {
            console.log(`✅ SUCCESS: ${savedNotes.length} note(s) saved in DB!`);
            console.log("Last note:", savedNotes[savedNotes.length - 1]);
        } else {
            console.log("❌ STILL NOT SAVING - notes count:", savedNotes?.length ?? 'null/undefined');
        }
    }
}

testAddNote();
