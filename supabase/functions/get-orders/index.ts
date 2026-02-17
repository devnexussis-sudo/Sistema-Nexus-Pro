import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

/**
 * Edge Function: Get Orders
 * 
 * Retorna ordens de serviço com filtros e paginação
 * 
 * Exemplo de uso:
 * POST /functions/v1/get-orders
 * Body: {
 *   "page": 1,
 *   "pageSize": 20,
 *   "status": "PENDENTE",
 *   "priority": "ALTA",
 *   "assignedTo": "tech-id"
 * }
 */

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GetOrdersRequest {
    page?: number
    pageSize?: number
    status?: string
    priority?: string
    assignedTo?: string
    tenantId?: string
}

serve(async (req) => {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Criar cliente Supabase com autenticação do usuário
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_ANON_KEY') ?? '',
            {
                global: {
                    headers: { Authorization: req.headers.get('Authorization')! },
                },
            }
        )

        // Verificar autenticação
        const { data: { user }, error: authError } = await supabaseClient.auth.getUser()

        if (authError || !user) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                    status: 401
                }
            )
        }

        // Parse request body
        const body: GetOrdersRequest = await req.json()
        const {
            page = 1,
            pageSize = 20,
            status,
            priority,
            assignedTo,
            tenantId
        } = body

        // Build query
        let query = supabaseClient
            .from('orders')
            .select('*', { count: 'exact' })

        // Apply filters
        if (tenantId) {
            query = query.eq('tenantId', tenantId)
        }

        if (status) {
            query = query.eq('status', status)
        }

        if (priority) {
            query = query.eq('priority', priority)
        }

        if (assignedTo) {
            query = query.eq('assignedTo', assignedTo)
        }

        // Apply pagination
        const from = (page - 1) * pageSize
        const to = from + pageSize - 1
        query = query.range(from, to)

        // Order by creation date (newest first)
        query = query.order('createdAt', { ascending: false })

        // Execute query
        const { data, error, count } = await query

        if (error) {
            throw error
        }

        // Calculate pagination metadata
        const totalPages = count ? Math.ceil(count / pageSize) : 0

        return new Response(
            JSON.stringify({
                success: true,
                data,
                pagination: {
                    page,
                    pageSize,
                    totalCount: count ?? 0,
                    totalPages,
                },
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 200
            }
        )

    } catch (error) {
        console.error('Error in get-orders function:', error)

        return new Response(
            JSON.stringify({
                success: false,
                error: {
                    message: error.message || 'Internal Server Error',
                    code: 'INTERNAL_ERROR'
                }
            }),
            {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 500
            }
        )
    }
})
