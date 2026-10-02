import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { action, tenantId } = payload;

    if (!tenantId) throw new Error('Tenant ID é obrigatório');

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    
    // Usamos o Service Role (Chave Mestra) apenas para furar o bloqueio do Cofre
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Abre o cofre seguro e pega a chave real
    const { data: vault, error: vaultErr } = await supabase
      .from('tenant_secrets')
      .select('uazapi_token, uazapi_instance')
      .eq('tenant_id', tenantId)
      .single();

    if (vaultErr || !vault?.uazapi_token) {
      throw new Error('Chaves do WhatsApp não configuradas no cofre.');
    }

    // 2. Busca a URL base pública (que ficou na tabela tenants)
    const { data: tData } = await supabase
      .from('tenants')
      .select('whatsapp_settings')
      .eq('id', tenantId)
      .single();

    let baseUrl = tData?.whatsapp_settings?.uazapi_url || 'https://api.uaizap.com.br';
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);
    const token = vault.uazapi_token.trim();
    const instanceName = vault.uazapi_instance?.trim() || '';

    // Cabeçalho de autorização para a Uaizap
    const headers = { 
      'apikey': token,
      'token': token,
      'Content-Type': 'application/json'
    };

    let result = null;

    // Roteamento de Ações do Painel
    if (action === 'status') {
      const res = await fetch(`${baseUrl}/instance/status`, { headers });
      result = await res.json();
    } 
    else if (action === 'qr') {
      const res = await fetch(`${baseUrl}/instance/qr`, { headers });
      result = await res.json();
    }
    else if (action === 'connect') {
      const res = await fetch(`${baseUrl}/instance/connect`, { headers });
      result = await res.json();
    }
    else if (action === 'logout') {
      const res = await fetch(`${baseUrl}/instance/logout`, { method: 'DELETE', headers });
      result = await res.json();
    }
    else if (action === 'restart') {
      const res = await fetch(`${baseUrl}/instance/restart`, { method: 'PUT', headers });
      result = await res.json();
    }
    else {
      throw new Error('Ação inválida solicitada ao whatsapp-admin');
    }

    return new Response(JSON.stringify({ success: true, data: result }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 200 
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, 
      status: 400 
    });
  }
});
