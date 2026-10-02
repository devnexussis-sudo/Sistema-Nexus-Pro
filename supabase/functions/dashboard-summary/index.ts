import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: req.headers.get('Authorization')! },
                },
            }
        )

        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: authError?.message || 'Unauthorized' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
            )
        }

        const body = await req.json().catch(() => ({}));
        let tenantId = body.tenantId;

        if (!tenantId) {
            tenantId = user?.user_metadata?.tenantId;
        }

        if (!tenantId) {
            return new Response(
                JSON.stringify({ error: 'Tenant ID is missing' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // Parallel data fetching for Dashboard
        const [
            { data: orders },
            { data: technicians },
            { data: customers },
            { data: users },
            { data: userGroups },
            { data: forms },
            { data: serviceTypes },
            { data: rules },
            { data: contracts }
        ] = await Promise.all([
            // Limit orders to prevent massive payloads, ideally we should filter by date/status
            // but preserving the original logic which just fetches all (or recent 500)
            supabaseClient.from('orders').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }).limit(500),
            supabaseClient.from('technicians').select('*').eq('tenant_id', tenantId),
            supabaseClient.from('customers').select('*').eq('tenant_id', tenantId),
            supabaseClient.from('users').select('*').eq('tenant_id', tenantId),
            supabaseClient.from('user_groups').select('*').eq('tenant_id', tenantId),
            supabaseClient.from('forms').select('*').eq('tenant_id', tenantId),
            supabaseClient.from('service_types').select('*').eq('tenant_id', tenantId),
            supabaseClient.from('activation_rules').select('*').eq('tenant_id', tenantId),
            supabaseClient.from('contracts').select('*').eq('tenant_id', tenantId)
        ]);

        return new Response(
            JSON.stringify({
                orders: orders || [],
                technicians: technicians || [],
                customers: customers || [],
                users: users || [],
                userGroups: userGroups || [],
                forms: forms || [],
                serviceTypes: serviceTypes || [],
                activationRules: rules || [],
                contracts: contracts || []
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        )

    } catch (error) {
        return new Response(
            JSON.stringify({ error: error.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
        )
    }
})
