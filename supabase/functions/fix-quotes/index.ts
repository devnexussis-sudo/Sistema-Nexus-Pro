import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3"

serve(async (req) => {
  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: quotes, error: selErr } = await supabaseClient
      .from('quotes')
      .select('id, status, billing_status')
      .neq('status', 'FATURADO')

    if (selErr) throw selErr

    let toUpdate = []
    for (const q of quotes) {
      if (q.billing_status === 'PAID') {
        toUpdate.push(q.id)
      } else {
        const { data: itm } = await supabaseClient
          .from('invoice_items')
          .select('id')
          .eq('reference_id', q.id)
          .maybeSingle()
        if (itm) {
          toUpdate.push(q.id)
        }
      }
    }

    if (toUpdate.length > 0) {
      const { error: updErr } = await supabaseClient
        .from('quotes')
        .update({ status: 'FATURADO' })
        .in('id', toUpdate)

      if (updErr) throw updErr
    }

    return new Response(
      JSON.stringify({ success: true, migrated: toUpdate.length }),
      { headers: { "Content-Type": "application/json" } },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    )
  }
})
