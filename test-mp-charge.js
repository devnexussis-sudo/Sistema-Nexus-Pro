import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://esrwwaoirlhcptbxtlsu.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVzcnd3YW9pcmxoY3B0Ynh0bHN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1MTAwOTksImV4cCI6MjA4NjA4NjA5OX0.HOzS5m8CBiZ1PVvYkePKp8Lu20dl4ymomPnxPQrBA5c';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCharge() {
    const tenantId = '2c5a36fd-a5de-4637-9c32-3d153d45dfb7';
    
    // Fetch user's actual token
    const { data } = await supabase
        .from('tenant_mercadopago_settings')
        .select('mp_access_token')
        .eq('tenant_id', tenantId)
        .maybeSingle();
        
    const accessToken = data?.mp_access_token;
    console.log("Token exists:", !!accessToken);
    if (!accessToken) return;
    
    // Try to create PIX
    try {
        const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `TEST-PIX-${Date.now()}`
          },
          body: JSON.stringify({
            transaction_amount: 1.0,
            description: 'Teste API Direta',
            payment_method_id: 'pix',
            payer: {
              email: 'test@nexus.com',
              first_name: 'Tester'
            }
          })
        });
        
        const mpData = await mpRes.json();
        console.log("Status:", mpRes.status);
        if (!mpRes.ok) {
            console.error("MP Error:", mpData);
        } else {
            console.log("MP Success ID:", mpData.id);
        }
    } catch (e) {
        console.error("Fetch Exception:", e);
    }
}

testCharge();
