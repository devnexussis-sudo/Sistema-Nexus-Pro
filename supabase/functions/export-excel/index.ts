import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { orderIds } = await req.json();

        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return new Response(JSON.stringify({ error: 'Nenhuma O.S. selecionada.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 400,
            });
        }

        // Verifica Autenticação e passa o Token para manter o RLS ativo
        const authHeader = req.headers.get('Authorization')!;
        const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
        const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: authHeader } },
        });

        // Puxa as O.S. e relacionamentos
        const { data: orders, error: ordersError } = await supabase
            .from('orders')
            .select(`
                *,
                customers(*),
                service_visits(*)
            `)
            .in('id', orderIds)
            .order('created_at', { ascending: false });

        if (ordersError) throw ordersError;
        if (!orders || orders.length === 0) {
            return new Response(JSON.stringify({ error: 'Nenhuma O.S. encontrada.' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                status: 404,
            });
        }

        // Puxa Técnicos para de-para do nome (Edge function tem que ser rápida)
        const { data: users } = await supabase
            .from('users')
            .select('id, name');
            
        const techMap = new Map();
        users?.forEach(u => techMap.set(u.id, u.name));

        const formatDate = (isoStr) => isoStr ? new Date(isoStr).toLocaleDateString('pt-BR') : 'N/A';
        const formatDateTime = (isoStr) => {
            if (!isoStr) return 'N/A';
            const d = new Date(isoStr);
            return `${d.toLocaleDateString('pt-BR')} ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
        };

        const rows = orders.map(o => {
            const customer = o.customers || {};
            const techName = techMap.get(o.assigned_to) || 'N/A';
            
            let totalDist = 0;
            let totalTime = 0;
            if (o.service_visits) {
                o.service_visits.forEach(v => {
                    totalDist += Number(v.displacement_distance) || 0;
                    totalTime += Number(v.displacement_time) || 0;
                });
            }

            let equipments = 'N/A';
            let serials = 'N/A';
            if (o.service_order_equipments && o.service_order_equipments.length > 0) {
                equipments = o.service_order_equipments.map(e => e.equipment_model).join(', ');
                serials = o.service_order_equipments.map(e => e.equipment_serial).join(', ');
            } else if (o.equipment_name) {
                equipments = o.equipment_name;
                serials = o.equipment_serial || 'N/A';
            }

            return {
                ID: o.display_id || o.id,
                'Data Agendada': formatDate(o.scheduled_date),
                'Hora Agendada': o.scheduled_time || 'N/A',
                'Cliente': o.customer_name,
                'CNPJ/Documento': customer.document || 'N/A',
                'Telefone': customer.phone || 'N/A',
                'WhatsApp': customer.whatsapp || 'N/A',
                'Email': customer.email || 'N/A',
                'CEP': customer.zip_code || 'N/A',
                'Estado': customer.state || 'N/A',
                'Cidade': customer.city || 'N/A',
                'Endereço': customer.address || 'N/A',
                'Título': o.title,
                'Tipo de Atendimento': o.operation_type || 'N/A',
                'Técnico': techName,
                'Status': o.status,
                'Prioridade': o.priority,
                'Status Financeiro': o.billing_status || 'PENDENTE',
                'Abertura': formatDateTime(o.created_at),
                'Distância Total Percorrida (km)': totalDist.toFixed(2),
                'Tempo Total Deslocamento (min)': totalTime.toFixed(2),
                'Equipamentos': equipments,
                'Séries': serials,
            };
        });

        // Gera o CSV nativamente sem depender de bibliotecas externas sujeitas a bugs de versão
        const columns = Object.keys(rows[0]);
        const csvRows = [
            columns.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')
        ];
        
        for (const row of rows) {
            const values = columns.map(col => {
                const val = row[col] === null || row[col] === undefined ? '' : row[col];
                // Escapa aspas duplas para o padrão do Excel
                return `"${String(val).replace(/"/g, '""')}"`;
            });
            csvRows.push(values.join(','));
        }
        
        const csvString = csvRows.join('\r\n');

        // Retorna o arquivo formatado para Download Direto (Padrão Backend Data API)
        const BOM = "\uFEFF"; // Garante compatibilidade UTF-8 no Excel
        return new Response(BOM + csvString, {
            headers: {
                ...corsHeaders,
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': 'attachment; filename="Exportacao_Nexus.csv"',
            },
            status: 200,
        });

    } catch (error) {
        console.error('[export-excel] Erro crítico:', error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
        });
    }
});
