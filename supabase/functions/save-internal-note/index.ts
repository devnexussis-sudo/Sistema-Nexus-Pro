import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Verificar autenticação do chamador
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) throw new Error('Autenticação obrigatória.');

        const anonClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
            global: { headers: { Authorization: authHeader } }
        });

        const { data: { user }, error: authErr } = await anonClient.auth.getUser();
        if (authErr || !user) throw new Error('Usuário não autenticado.');

        const body = await req.json();
        const { orderId, note, action } = body;

        if (!orderId) throw new Error('orderId é obrigatório.');

        // Usar service role para contornar RLS (o auth já foi verificado acima)
        const adminClient = createClient(supabaseUrl, serviceRoleKey);

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);

        // Buscar a OS
        let fetchQuery = adminClient.from('orders').select('id, form_data, items, tenant_id');
        if (isUuid) {
            fetchQuery = fetchQuery.eq('id', orderId);
        } else {
            fetchQuery = fetchQuery.eq('display_id', orderId);
        }

        const { data: rows, error: fetchErr } = await fetchQuery.limit(1);

        if (fetchErr || !rows || rows.length === 0) {
            throw new Error(`OS não encontrada: ${orderId}`);
        }

        const dbOrder = rows[0];
        const existingFormData = dbOrder.form_data || {};
        let currentNotes: any[] = Array.isArray(existingFormData._internalNotes)
            ? existingFormData._internalNotes
            : [];

        if (action === 'add') {
            if (!note) throw new Error('note é obrigatório para action=add.');
            currentNotes = [...currentNotes, note];
        } else if (action === 'delete') {
            const { noteIndex } = body;
            if (typeof noteIndex !== 'number') throw new Error('noteIndex é obrigatório para action=delete.');
            currentNotes = currentNotes.filter((_, i) => i !== noteIndex);
        } else {
            throw new Error(`action desconhecida: ${action}`);
        }

        const newFormData = { ...existingFormData, _internalNotes: currentNotes };

        // Preservar items para não ativar o trigger protect_order_items de forma errada
        const updatePayload: Record<string, any> = {
            form_data: newFormData,
            updated_at: new Date().toISOString(),
        };
        if (Array.isArray(dbOrder.items) && dbOrder.items.length > 0) {
            updatePayload.items = dbOrder.items;
        }

        const { error: updateErr } = await adminClient
            .from('orders')
            .update(updatePayload)
            .eq('id', dbOrder.id);

        if (updateErr) throw updateErr;

        console.log(`[save-internal-note] ✅ ${action} note for order ${dbOrder.id} | notes count: ${currentNotes.length}`);

        return new Response(JSON.stringify({ notes: currentNotes }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });

    } catch (err: any) {
        console.error('[save-internal-note] ❌', err.message);
        return new Response(JSON.stringify({ error: err.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 400,
        });
    }
});
