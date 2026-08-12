import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

// Test with authenticated session — login with real credentials
const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

const TEST_EMAIL = process.env.TEST_EMAIL || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

async function testWithAuth() {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
        console.error("Set TEST_EMAIL and TEST_PASSWORD in .env to run this test");
        return;
    }

    console.log("Logging in as:", TEST_EMAIL);
    const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email: TEST_EMAIL,
        password: TEST_PASSWORD
    });

    if (authErr || !authData.session) {
        console.error("Login failed:", authErr?.message);
        return;
    }

    console.log("✅ Logged in!");
    console.log("JWT user_metadata:", JSON.stringify(authData.user?.user_metadata));

    // Fetch a CONCLUÍDO order
    const { data: orders, error: fetchErr } = await supabase
        .from('orders')
        .select('id, status, form_data, tenant_id')
        .eq('status', 'CONCLUÍDO')
        .limit(1);

    if (fetchErr || !orders?.length) {
        console.error("No CONCLUÍDO order found or error:", fetchErr?.message);
        return;
    }

    const order = orders[0];
    console.log(`Order ID: ${order.id}`);
    console.log(`Order tenant_id: ${order.tenant_id}`);
    console.log(`JWT tenantId: ${authData.user?.user_metadata?.tenantId}`);
    console.log(`Match: ${order.tenant_id === authData.user?.user_metadata?.tenantId}`);

    // Try to update
    const existingFormData = order.form_data || {};
    const updatedNotes = [...(existingFormData._internalNotes || []), {
        text: "Auth Test " + Date.now(),
        user: authData.user?.email,
        date: new Date().toISOString()
    }];

    const { error: updateErr } = await supabase
        .from('orders')
        .update({
            form_data: { ...existingFormData, _internalNotes: updatedNotes },
            updated_at: new Date().toISOString()
        })
        .eq('id', order.id);

    if (updateErr) {
        console.error("❌ Update error:", updateErr.message);
    } else {
        const { data: check } = await supabase.from('orders').select('form_data').eq('id', order.id).single();
        const savedCount = check?.form_data?._internalNotes?.length;
        console.log(savedCount ? `✅ Notes saved! Count: ${savedCount}` : "❌ Notes NOT saved (RLS blocking silently)");
    }
}

testWithAuth();
