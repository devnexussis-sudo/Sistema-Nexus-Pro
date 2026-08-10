import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.7.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code, tenantId, redirectUri } = await req.json();

    if (!code || !tenantId) {
      return new Response(
        JSON.stringify({ error: "Parâmetros 'code' e 'tenantId' são obrigatórios." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientSecret = Deno.env.get("MERCADOPAGO_CLIENT_SECRET") || "";
    const clientId = Deno.env.get("MERCADOPAGO_CLIENT_ID") || "";

    // Troca o código de autorização pelos tokens de acesso do Mercado Pago
    const tokenRes = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_secret: clientSecret,
        client_id: clientId,
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri
      })
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok) {
      console.error("[MP OAuth Edge] Mercado Pago token exchange failed:", tokenData);
      return new Response(
        JSON.stringify({ error: tokenData.message || "Erro ao trocar token no Mercado Pago." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Inicializa o cliente do Supabase com Service Role Key para gravação segura
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { error: dbError } = await supabaseAdmin
      .from("tenant_mercadopago_settings")
      .upsert([
        {
          tenant_id: tenantId,
          mp_user_id: String(tokenData.user_id),
          mp_public_key: tokenData.public_key,
          mp_access_token: tokenData.access_token,
          mp_refresh_token: tokenData.refresh_token,
          account_email: tokenData.user_id ? `user_${tokenData.user_id}@mercadopago.com` : "Conectado",
          account_name: "Conta Mercado Pago",
          status: "active",
          updated_at: new Date().toISOString()
        }
      ], { onConflict: "tenant_id" });

    if (dbError) {
      throw dbError;
    }

    return new Response(
      JSON.stringify({ success: true, message: "Conta Mercado Pago vinculada com sucesso!" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[MP OAuth Edge] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno do servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
