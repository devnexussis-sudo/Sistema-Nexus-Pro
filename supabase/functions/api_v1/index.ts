import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Crypto para fazer o hash do token (Web Crypto API padrão do Deno)
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Tratamento de requisições OPTIONS (CORS) para chamadas vindas de navegadores
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Não autorizado. Falta o header Authorization: Bearer <chave>' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const token = authHeader.replace('Bearer ', '').trim();
    if (!token.startsWith('nx_live_')) {
      return new Response(JSON.stringify({ error: 'Formato de chave inválido. Use chaves no padrão nx_live_...' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Calcula o hash da chave enviada pelo usuário
    const hashToVerify = await hashToken(token);

    // Conecta no Supabase usando a Service Role Key
    // IMPORTANTE: Isso ignora o RLS, então NÓS MESMOS garantimos o isolamento por tenant na query abaixo.
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verifica se o Hash existe no banco e se a chave está ativa
    const { data: keyData, error: keyError } = await supabaseAdmin
      .from('api_keys')
      .select('id, tenant_id, status')
      .eq('key_hash', hashToVerify)
      .eq('status', 'active')
      .single();

    if (keyError || !keyData) {
      return new Response(JSON.stringify({ error: 'Acesso Negado: Chave de API inválida ou revogada.' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const tenantId = keyData.tenant_id;

    // Atualiza a data de 'último uso' (sem usar await para não bloquear e atrasar a resposta da API)
    supabaseAdmin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyData.id).then();

    // =============== ROTEAMENTO DA API ===============
    // Pega o caminho da URL após o nome da função. 
    const url = new URL(req.url);
    const path = url.pathname.split('/api_v1')[1] || '/'; // Ex: se a URL for .../api_v1/orders, o path é /orders

    // Endpoint: GET /orders (Pega as últimas 50 ordens do Tenant)
    if (path === '/orders') {
      const { data: orders, error: ordersError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (ordersError) throw ordersError;

      return new Response(JSON.stringify({
        success: true,
        count: orders.length,
        data: orders
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Endpoint: GET /customers
    if (path === '/customers') {
      const { data: customers, error: custError } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
        .limit(50);

      if (custError) throw custError;

      return new Response(JSON.stringify({
        success: true,
        count: customers.length,
        data: customers
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Endpoint: GET /equipments
    if (path === '/equipments') {
      const { data: equipments, error: eqError } = await supabaseAdmin
        .from('equipments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
        .limit(50);

      if (eqError) throw eqError;

      return new Response(JSON.stringify({
        success: true,
        count: equipments.length,
        data: equipments
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Endpoint: GET /quotes
    if (path === '/quotes') {
      const { data: quotes, error: qError } = await supabaseAdmin
        .from('quotes')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (qError) throw qError;

      return new Response(JSON.stringify({
        success: true,
        count: quotes.length,
        data: quotes
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Fallback: Endpoint não existe
    return new Response(JSON.stringify({ 
      error: 'Endpoint não encontrado.',
      available_endpoints: ['/orders', '/customers', '/equipments', '/quotes']
    }), {
      status: 404,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('API Error:', error.message);
    return new Response(JSON.stringify({ error: 'Erro interno no servidor de API.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
