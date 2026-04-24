import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { bucket, path } = await req.json();

    if (!bucket || !path) {
      return new Response(JSON.stringify({ success: false, code: 400, error: "Faltam parâmetros obrigatórios (bucket, path)" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Instanciar client público para validar a autorização passada no header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ success: false, code: 401, error: "Não autorizado. Token não fornecido." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const publicClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: userError } = await publicClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ success: false, code: 401, error: "Usuário inválido ou token expirado.", details: userError }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 2. Instanciar Admin Client para Bypass de RLS e validações no banco
    const adminClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    // 3. Buscar tenant ativo do usuário para Firewall Cross-Tenant
    const { data: userRow } = await adminClient
      .from("users")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    const tenantId = userRow?.tenant_id;

    // 4. Barreira de Segurança
    if (!tenantId) {
      return new Response(JSON.stringify({ success: false, code: 403, error: "Usuário não vinculado firmemente a um tenant." }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!path.startsWith(`${tenantId}/`)) {
      console.error(`🚨 OFENSA CRÍTICA: Usuário ${user.id} (Tenant ${tenantId}) tentou deletar mídia cruzada: ${path}`);
      return new Response(JSON.stringify({ success: false, code: 403, error: "Violação restrita de isolamento Cross-Tenant detectada e abortada.", path, tenantId }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 5. Exclusão física definitiva - Modo Bypass RLS (Service Role)
    const { data, error: storageError } = await adminClient
      .storage
      .from(bucket)
      .remove([path]);

    if (storageError) {
      console.error("Storage Delete API Crash:", storageError);
      return new Response(JSON.stringify({ success: false, code: 500, error: "Falha subjacente na ponte de storage API", details: storageError }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Tratar alerta se array retornado for vazio (Não encontrado fisicamente, mas requisição não falhou)
    if (!data || data.length === 0) {
      console.warn(`[Enterprise Sweep] Arquivo fantasma, deleção sem impacto em disco: ${path}`);
    }

    return new Response(JSON.stringify({ success: true, deletedPath: path }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Fatal falldown na Edge Function delete-storage-file:", err.message);
    return new Response(JSON.stringify({ success: false, code: 500, error: "Panic: " + err.message }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
