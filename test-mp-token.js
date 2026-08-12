import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testMpSettings() {
    const tenantId = '2c5a36fd-a5de-4637-9c32-3d153d45dfb7';
    
    // Simulate exactly what frontend does
    const payload = {
        tenant_id: tenantId,
        mp_user_id: undefined, // Supabase ignores undefined
        mp_access_token: 'APP_USR-1234567890123456-123456-1234567890abcdef1234567890abcdef-123456789',
        account_email: 'Credencial Vinculada Direta',
        account_name: 'Conta Mercado Pago',
        status: 'active',
        updated_at: new Date().toISOString()
    };
    
    // Remove undefined fields just like supabase-js does
    Object.keys(payload).forEach(key => payload[key] === undefined ? delete payload[key] : {});

    console.log("Payload:", payload);
    const { data, error } = await supabase
        .from('tenant_mercadopago_settings')
        .upsert([payload], { onConflict: 'tenant_id' })
        .select();

    console.log("Upsert Error:", error);
    console.log("Upsert Data:", data);
}

testMpSettings();
