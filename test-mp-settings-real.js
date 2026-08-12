import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testMpSettings() {
    const tenantId = '2c5a36fd-a5de-4637-9c32-3d153d45dfb7';

    console.log("Attempting to insert into tenant_mercadopago_settings...");
    const { data, error } = await supabase
        .from('tenant_mercadopago_settings')
        .upsert([{
          tenant_id: tenantId,
          account_email: 'test@test.com',
          account_name: 'Test',
          status: 'active',
          updated_at: new Date().toISOString()
        }], { onConflict: 'tenant_id' })
        .select();

    console.log("Upsert Error:", error);
    console.log("Upsert Data:", data);
}

testMpSettings();
