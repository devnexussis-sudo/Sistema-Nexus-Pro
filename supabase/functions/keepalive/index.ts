import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

// Configuração do CORS para ser chamada pelo frontend
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Lidar com a preflight request do CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    // Resposta simples de ping/keepalive
    return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
});
