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

// Configuração de Rate Limiting na memória (Segurança contra sobrecarga)
// Limite: 100 requisições por minuto por tenant
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 100;
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(tenantId: string): { allowed: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const record = rateLimitCache.get(tenantId);

  if (!record || now > record.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateLimitCache.set(tenantId, { count: 1, resetAt });
    return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, reset: resetAt };
  }

  if (record.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, remaining: 0, reset: record.resetAt };
  }

  record.count += 1;
  return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - record.count, reset: record.resetAt };
}

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

    // =============== CONTROLE DE RATE LIMITING ===============
    const now = Date.now();
    const rateLimit = checkRateLimit(tenantId);
    const rateLimitHeaders = {
      'X-RateLimit-Limit': String(MAX_REQUESTS_PER_WINDOW),
      'X-RateLimit-Remaining': String(rateLimit.remaining),
      'X-RateLimit-Reset': String(Math.ceil((rateLimit.reset - now) / 1000))
    };

    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: 'Muitas requisições. Limite de 100 requisições por minuto excedido.' 
      }), {
        status: 429,
        headers: { 
          ...corsHeaders, 
          ...rateLimitHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(Math.ceil((rateLimit.reset - now) / 1000))
        }
      });
    }

    // Helper para gerar respostas padronizadas com cabeçalhos de rate limit
    const apiResponse = (body: any, status = 200) => {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 
          ...corsHeaders, 
          ...rateLimitHeaders, 
          'Content-Type': 'application/json' 
        }
      });
    };

    // Atualiza a data de 'último uso' (sem usar await para não bloquear e atrasar a resposta da API)
    supabaseAdmin.from('api_keys').update({ last_used_at: new Date().toISOString() }).eq('id', keyData.id).then();

    // =============== ROTEAMENTO DA API ===============
    const url = new URL(req.url);
    const path = url.pathname.split('/api_v1')[1] || '/'; 

    // Endpoint: GET /orders (Pega as últimas 50 ordens do Tenant)
    if (path === '/orders') {
      const { data: orders, error: ordersError } = await supabaseAdmin
        .from('orders')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (ordersError) throw ordersError;

      return apiResponse({
        success: true,
        count: orders.length,
        data: orders
      });
    }

    // Endpoint: GET /customers (Pega as primeiras 50 empresas/clientes do Tenant)
    if (path === '/customers') {
      const { data: customers, error: custError } = await supabaseAdmin
        .from('customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
        .limit(50);

      if (custError) throw custError;

      return apiResponse({
        success: true,
        count: customers.length,
        data: customers
      });
    }

    // Endpoint: GET /equipments (Pega as primeiras 50 máquinas/equipamentos do Tenant)
    if (path === '/equipments') {
      const { data: equipments, error: eqError } = await supabaseAdmin
        .from('equipments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name', { ascending: true })
        .limit(50);

      if (eqError) throw eqError;

      return apiResponse({
        success: true,
        count: equipments.length,
        data: equipments
      });
    }

    // Endpoint: GET /quotes (Pega os últimos 50 orçamentos do Tenant)
    if (path === '/quotes') {
      const { data: quotes, error: qError } = await supabaseAdmin
        .from('quotes')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (qError) throw qError;

      return apiResponse({
        success: true,
        count: quotes.length,
        data: quotes
      });
    }

    // Fallback: Endpoint não existe
    return apiResponse({ 
      error: 'Endpoint não encontrado.',
      available_endpoints: ['/orders', '/customers', '/equipments', '/quotes']
    }, 404);

  } catch (error: any) {
    console.error('API Error:', error.message);
    return new Response(JSON.stringify({ error: 'Erro interno no servidor de API.' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
