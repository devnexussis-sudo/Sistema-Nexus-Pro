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

        // 🛡️ EGRESS GUARD — Projeção de colunas (somente o que o AdminOverview consome).
        // ANTES: select('*') em 9 tabelas → orders.form_data (assinaturas/fotos base64),
        // avatares, templates de formulário etc. trafegavam a cada login (PostgREST egress).
        // users/userGroups/forms/serviceTypes/activationRules NÃO são lidos pelo front
        // a partir deste endpoint → não são mais buscados (resposta mantém o mesmo shape).
        const [
            { data: orders },
            { data: technicians },
            { data: customers },
            { data: contracts }
        ] = await Promise.all([
            supabaseClient.from('orders')
                .select('id, tenant_id, display_id, created_at, scheduled_date, status, assigned_to, end_date, customer_name, title, operation_type')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false })
                .limit(500),
            supabaseClient.from('technicians').select('id, tenant_id, name, active').eq('tenant_id', tenantId),
            supabaseClient.from('customers').select('id, tenant_id, name, active').eq('tenant_id', tenantId),
            supabaseClient.from('contracts').select('*').eq('tenant_id', tenantId)
        ]);
        const users: any[] = [];
        const userGroups: any[] = [];
        const forms: any[] = [];
        const serviceTypes: any[] = [];
        const rules: any[] = [];

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
