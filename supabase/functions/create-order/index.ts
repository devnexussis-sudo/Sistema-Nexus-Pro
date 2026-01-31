import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  // Adicionado x-supabase-client-platform para evitar erros de CORS com versões recentes do cliente Supabase
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Debug: Log Headers
    const authHeader = req.headers.get('Authorization');
    console.log("📨 Request Received. Header:", authHeader?.substring(0, 20) + "...");

    if (!authHeader) {
      throw new Error("Missing Authorization Header");
    }

    // Initialize Client with SERVICE ROLE (Bypass RLS and infraestructura issues)
    // We still validate the USER token below for security.
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // Use Service Role for internal stability
      {
        auth: {
          persistSession: false
        }
      }
    )

    // 1. Explicitly Verify User Token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(token)

    if (userError || !user) {
      console.error("❌ Auth Validation Failed:", userError);
      return new Response(JSON.stringify({
        error: 'Autenticação Inválida',
        details: userError?.message || 'Token não reconhecido'
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    console.log("✅ User Authenticated:", user.id);

    // 2. Parse Request Body
    const { order } = await req.json()
    if (!order) {
      throw new Error("Order data is missing")
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

    // 6. Map Frontend Data (CamelCase) to DB (snake_case)
    const dbPayload = {
      id: finalId,
      tenant_id: tenantId,
      title: order.title,
      description: order.description, // some fronts use description_text
      customer_name: order.customerName,
      customer_address: order.customerAddress,
      status: order.status || 'PENDENTE',
      priority: order.priority,
      operation_type: order.operationType,
      assigned_to: order.assignedTo,
      form_id: order.formId,
      form_data: order.formData || {},
      equipment_name: order.equipmentName,
      equipment_model: order.equipmentModel,
      equipment_serial: order.equipmentSerial,
      scheduled_date: order.scheduledDate,
      scheduled_time: order.scheduledTime,
      start_date: order.startDate,
      end_date: order.endDate,
      notes: order.notes,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }

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
