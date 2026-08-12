import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testMpSettings() {
    console.log("Checking all records in tenant_mercadopago_settings...");
    const { data, error } = await supabase
        .from('tenant_mercadopago_settings')
        .select('tenant_id, account_email, account_name, status, updated_at');

    if (error) {
        console.error("Read Error:", error);
    } else {
        console.log("Read Data:", data);
    }
}

testMpSettings();
