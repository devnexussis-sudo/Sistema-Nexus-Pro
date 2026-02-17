import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-auth-token',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Debug: Log Headers
    const authHeader = req.headers.get('Authorization');
    console.log("📨 Request received. Auth present:", !!authHeader);
    if (authHeader) console.log("📨 Auth Prefix:", authHeader.substring(0, 15));

    if (!authHeader) {
      console.error("❌ Auth Error: Missing Authorization Header");
      return new Response(JSON.stringify({ error: "Cabeçalho de autorização ausente" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      });
    }

    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!serviceRoleKey || !supabaseUrl || !anonKey) {
      console.error("❌ Critical: Environment variables are missing.");
      return new Response(JSON.stringify({ error: "Erro de configuração no servidor (env missing)" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      });
    }

    // 1. Create client exactly like working get-orders function
    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    })

    // 2. Verify User Identity
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser()

    if (userError || !user) {
      console.error("❌ Auth Error: Token validation failed.", userError);
      return new Response(JSON.stringify({
        error: 'Não autorizado',
        message: userError?.message || 'Sessão inválida',
        code: 'AUTH_FAILED'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    console.log("✅ Identity verified for user:", user.id);

    // 3. Create Admin Client for DB Operations
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    })

    // 4. Parse Request Body
    const body = await req.json().catch(() => ({}));
    const { order } = body;
    if (!order) {
      console.error("❌ Data Error: missing order object in request");
      throw new Error("Dados da OS não fornecidos");
    }

    // 3. Get User Tenant
    const tenantId = user.user_metadata.tenantId || user.user_metadata.tenant_id
    if (!tenantId) {
      throw new Error("User has no tenant assigned")
    }

    // 4. Generate Sequential ID (Atomic via RPC)
    const { data: seqNum, error: seqError } = await supabaseAdmin.rpc('get_next_order_id', {
      p_tenant_id: tenantId
    })

    if (seqError) {
      console.error("Sequence Error:", seqError)
      throw new Error("Failed to generate order sequence")
    }

    // 5. Get Tenant Prefix
    const { data: tenantData } = await supabaseAdmin
      .from('tenants')
      .select('os_prefix')
      .eq('id', tenantId)
      .single()

    // Default prefix if not set
    const prefix = tenantData?.os_prefix || 'OS-'
    const finalId = `${prefix}${seqNum}`

    // 6. Map Frontend Data to DB (Master DB uses CamelCase for many columns)
    const dbPayload = {
      id: finalId,
      tenant_id: tenantId, // Using snake_case for tenant_id as per schema
      title: order.title,
      description: order.description,
      customerName: order.customerName,
      customerAddress: order.customerAddress,
      status: order.status || 'PENDENTE',
      priority: order.priority,
      operationType: order.operationType,
      assignedTo: order.assignedTo,
      formId: order.formId,
      formData: order.formData || {},
      equipmentName: order.equipmentName,
      equipmentModel: order.equipmentModel,
      equipmentSerial: order.equipmentSerial,
      scheduledDate: order.scheduledDate,
      scheduledTime: order.scheduledTime,
      startDate: order.startDate,
      endDate: order.endDate,
      notes: order.notes,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    console.log("💾 Final Payload for Insert:", JSON.stringify(dbPayload, null, 2));

    // 7. Insert into Database
    const { data, error } = await supabaseAdmin
      .from('orders')
      .insert(dbPayload)
      .select()
      .single()

    if (error) {
      console.error("Insert Error:", error)
      throw error
    }

    return new Response(
      JSON.stringify(data),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 },
    )
  }
})
