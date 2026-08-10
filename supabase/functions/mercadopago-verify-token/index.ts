import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: "Token é obrigatório." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Chama a API do Mercado Pago do lado do servidor para evitar CORS
    const mpRes = await fetch("https://api.mercadopago.com/users/me", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await mpRes.json();

    if (!mpRes.ok) {
      return new Response(
        JSON.stringify({
          valid: false,
          error: data.message || "Token inválido ou não autorizado.",
          status: mpRes.status,
        }),
        {
          // IMPORTANTE: Retornar 200 aqui para evitar que o client do Supabase 
          // ache que o usuário do painel perdeu a sessão e force um logout.
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Token é válido, extrai dados
    const accountEmail = data.email || data.nickname || "Conectado";
    let accountName = data.nickname || "Conta Mercado Pago";
    
    if (data.first_name) {
      accountName = `${data.first_name} ${data.last_name || ""}`.trim();
    }

    return new Response(
      JSON.stringify({
        valid: true,
        userId: String(data.id),
        accountEmail,
        accountName,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[MP Verify Token] Error:", err);
    return new Response(
      JSON.stringify({ valid: false, error: err.message || "Erro interno do servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
