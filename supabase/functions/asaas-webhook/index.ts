import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, DELETE, PUT',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const event = body.event;
    const payment = body.payment;
    const invoiceNfse = body.invoice;

    console.log(`[Asaas Webhook NASA-Log] 📥 Evento recebido: ${event}`);

    if (!event) {
      return new Response(JSON.stringify({ message: 'Payload inválido: evento ausente' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    // =========================================================================
    // 🚀 HANDLER 1: NFS-E WEBHOOK EVENTS FROM ASAAS (INVOICE_AUTHORIZED, etc.)
    // =========================================================================
    if (invoiceNfse || (event && event.startsWith('INVOICE_'))) {
      const nfObj = invoiceNfse || {};
      const asaasNfseId = nfObj.id;
      const externalReference = nfObj.externalReference;
      const nfStatus = nfObj.status || event.replace('INVOICE_', '');

      console.log(
        `[Asaas Webhook NFS-e] 🧾 Evento: ${event}, ID Asaas: ${asaasNfseId}, Status: ${nfStatus}, ExtRef: ${externalReference}`,
      );

      let nfseRecord = null;
      if (asaasNfseId) {
        const { data: rec1 } = await supabase.from('invoice_nfse').select('*').eq(
          'asaas_nfse_id',
          asaasNfseId,
        ).maybeSingle();
        if (rec1) nfseRecord = rec1;
      }
      if (!nfseRecord && externalReference) {
        const { data: rec2 } = await supabase.from('invoice_nfse').select('*').eq(
          'invoice_id',
          externalReference,
        ).maybeSingle();
        if (rec2) nfseRecord = rec2;
      }

      if (nfseRecord) {
        const updateData: any = {
          status: nfStatus,
          updated_at: new Date().toISOString(),
        };
        if (nfObj.number) updateData.nfse_number = nfObj.number;
        if (nfObj.pdfUrl) updateData.pdf_url = nfObj.pdfUrl;
        if (nfObj.xmlUrl) updateData.xml_url = nfObj.xmlUrl;
        if (nfObj.invoiceUrl) updateData.invoice_url = nfObj.invoiceUrl;
        if (nfObj.observations && (nfStatus === 'ERROR' || nfStatus === 'CANCELLATION_DENIED')) {
          updateData.error_message = nfObj.observations;
        }

        await supabase.from('invoice_nfse').update(updateData).eq('id', nfseRecord.id);

        // 🛰️ Broadcast Realtime Push
        if (nfseRecord.tenant_id) {
          const ch = supabase.channel(`nexus-realtime-${nfseRecord.tenant_id}`);
          ch.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              ch.send({
                type: 'broadcast',
                event: 'INVOICE_UPDATED',
                payload: { invoiceId: nfseRecord.invoice_id, type: 'NFSE', status: nfStatus },
              }).then(() => {
                supabase.removeChannel(ch);
              });
            }
          });
        }

        return new Response(
          JSON.stringify({
            success: true,
            type: 'INVOICE_NFSE',
            id: nfseRecord.id,
            status: nfStatus,
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
          },
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'NFS-e não encontrada no banco local' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    // =========================================================================
    // 🚀 HANDLER 2: PAYMENT & CHECKOUT WEBHOOK EVENTS FROM ASAAS
    // =========================================================================

    // Normalize checkout object into payment object for generic processing
    let paymentObj = body.payment;
    if (
      !paymentObj && body.checkout && (event === 'CHECKOUT_PAID' || event === 'CHECKOUT_CREATED')
    ) {
      paymentObj = body.checkout;
      // O objeto checkout não tem a chave 'checkout' dentro de si, ele É o checkout.
      // O checkout.id é o UUID (ex: 582e...). Vamos mapear para que o código abaixo o encontre via chkId.
      paymentObj.checkout = body.checkout.id;
    }

    if (!paymentObj) {
      return new Response(JSON.stringify({ message: 'Payload de pagamento/checkout ausente' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    if (event === 'PAYMENT_CREATED' || event === 'CHECKOUT_CREATED') {
      return new Response(
        JSON.stringify({ success: true, message: 'Evento de criação ignorado' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    let newStatus = 'PENDING';
    if (
      event === 'PAYMENT_RECEIVED' || event === 'PAYMENT_CONFIRMED' || event === 'CHECKOUT_PAID' ||
      event === 'PAYMENT_ANTICIPATED' || event === 'PAYMENT_AUTHORIZED' ||
      event === 'PAYMENT_RECEIVED_IN_CASH'
    ) {
      newStatus = 'PAID';
    } else if (event === 'PAYMENT_DELETED' || event === 'PAYMENT_REFUNDED') {
      newStatus = 'CANCELED';
    } else if (event === 'PAYMENT_OVERDUE') {
      newStatus = 'OVERDUE';
    } else {
      return new Response(JSON.stringify({ message: 'Evento ignorado.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      });
    }

    const payId = paymentObj.id || '';
    const instId = paymentObj.installment || '';
    const chkId = paymentObj.checkout || '';
    const linkId = paymentObj.paymentLink || '';
    const extRef = paymentObj.externalReference || '';
    const paidAtDate = paymentObj.clientPaymentDate || paymentObj.paymentDate ||
      paymentObj.confirmedDate ||
      paymentObj.creditDate || (newStatus === 'PAID' ? new Date().toISOString() : null);

    console.log(
      `[Asaas Webhook Payment] 💳 Evento: ${event}, PayID: ${payId}, InstID: ${instId}, ChkID: ${chkId}, LinkID: ${linkId}, ExtRef: ${extRef}`,
    );

    let processed = false;
    let targetTenantId: string | null = null;
    let targetInvoiceId: string | null = null;

    const searchKeys = [payId, instId, chkId, linkId].filter(Boolean);

    // -------------------------------------------------------------------------
    // STEP 0: Procurar em Invoice Installments
    // -------------------------------------------------------------------------
    let installment: any = null;

    for (const key of searchKeys) {
      if (!installment) {
        const { data: i1 } = await supabase.from('invoice_installments').select('*').or(
          `gateway_payment_id.eq.${key},payment_gateway_id.eq.${key}`,
        ).maybeSingle();
        if (i1) installment = i1;
      }
    }

    if (!installment && extRef) {
      const { data: i2 } = await supabase.from('invoice_installments').select('*').eq(
        'invoice_id',
        extRef,
      ).eq('status', 'PENDING').limit(1).maybeSingle();
      if (i2) installment = i2;
    }

    // FALLBACK ROBUSTO PARA CHECKOUTS
    // Se o Asaas não enviar extRef nem chkId no webhook do checkout, tentamos buscar pela descrição
    if (!installment && paymentObj.description) {
      const match = paymentObj.description.match(/#([a-zA-Z0-9-]+)/);
      if (match && match[1]) {
        const shortId = match[1];
        const { data: possibleInvoices } = await supabase.from('invoices')
          .select('id')
          .or(`display_id.eq.${shortId},id.ilike.${shortId}%`);

        if (possibleInvoices && possibleInvoices.length > 0) {
          const invId = possibleInvoices[0].id;
          const { data: i3 } = await supabase.from('invoice_installments')
            .select('*')
            .eq('invoice_id', invId)
            .eq('status', 'PENDING')
            .limit(1)
            .maybeSingle();

          if (i3) {
            installment = i3;
            // Atualiza o DB com o ID real do pagamento gerado pelo checkout
            if (payId && event.startsWith('PAYMENT_')) {
              await supabase.from('invoices').update({
                gateway_payment_id: payId,
                payment_gateway_id: payId,
              }).eq('id', invId);
            }
          }
        }
      }
    }

    if (installment) {
      await supabase.from('invoice_installments').update({
        status: newStatus,
        paid_at: newStatus === 'PAID' ? paidAtDate : null,
        gateway_payment_id: payId || undefined,
        payment_gateway_id: payId || undefined,
        payment_method: paymentObj.billingType === 'PIX'
          ? 'Pix'
          : (paymentObj.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto'),
      }).eq('id', installment.id);

      targetTenantId = installment.tenant_id;
      targetInvoiceId = installment.invoice_id;

      if (newStatus === 'PAID') {
        const { data: existingCf } = await supabase.from('cash_flow').select('id').eq(
          'reference_id',
          installment.id,
        ).maybeSingle();
        if (!existingCf) {
          const { data: invInfo } = await supabase.from('invoices').select('display_id, tenant_id')
            .eq('id', installment.invoice_id).maybeSingle();
          const invoiceDisplayId = invInfo
            ? (invInfo.display_id || installment.invoice_id.slice(0, 8))
            : installment.invoice_id.slice(0, 8);
          await supabase.from('cash_flow').insert({
            tenant_id: installment.tenant_id || (invInfo ? invInfo.tenant_id : null),
            type: 'INCOME',
            category: 'Recebimento de Fatura (Parcela)',
            amount: paymentObj.value,
            description:
              `Pagamento de parcela ${installment.installment_number} via Asaas - Fatura ${invoiceDisplayId}`,
            reference_id: installment.id,
            reference_type: 'INSTALLMENT',
            payment_method: paymentObj.billingType === 'PIX'
              ? 'Pix'
              : (paymentObj.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto'),
            entry_date: paidAtDate || new Date().toISOString(),
            created_by: 'webhook-asaas',
          });
        }
      }

      processed = true;

      const { data: allInsts } = await supabase.from('invoice_installments').select('status').eq(
        'invoice_id',
        installment.invoice_id,
      );
      const allResolved = allInsts && allInsts.length > 0 &&
        allInsts.every((i: any) => i.status === 'PAID' || i.status === 'CANCELED');
      const allCanceled = allInsts && allInsts.length > 0 &&
        allInsts.every((i: any) => i.status === 'CANCELED');
      const hasPaid = allInsts && allInsts.some((i: any) => i.status === 'PAID');
      const hasOverdue = allInsts && allInsts.some((i: any) => i.status === 'OVERDUE');

      let invoiceStatus = 'PENDING';
      if (allResolved && hasPaid) invoiceStatus = 'PAID';
      else if (hasPaid) invoiceStatus = 'PARTIALLY_PAID';
      else if (allCanceled) invoiceStatus = 'CANCELED';
      else if (hasOverdue) invoiceStatus = 'OVERDUE';

      const invUpdatePayload: any = {
        status: invoiceStatus,
        paid_at: invoiceStatus === 'PAID' ? paidAtDate : null,
      };
      const asaasInvoiceNum = paymentObj.invoiceNumber || paymentObj.invoice_number;
      if (asaasInvoiceNum) {
        invUpdatePayload.invoice_number = asaasInvoiceNum;
      }

      // Update root invoice gateway ID to ensure NF-e always finds it
      if (payId && payId.startsWith('pay_')) {
        invUpdatePayload.gateway_payment_id = payId;
        invUpdatePayload.payment_gateway_id = payId;
      }

      await supabase.from('invoices').update(invUpdatePayload).eq('id', installment.invoice_id);

      // 🔄 Atualização das Ordens de Serviço (OS) e Orçamentos vinculados
      try {
        const { data: items } = await supabase.from('invoice_items').select('*').eq(
          'invoice_id',
          installment.invoice_id,
        );
        if (items && items.length > 0) {
          for (const item of items) {
            if (item.reference_type === 'ORDER' || !item.reference_type) {
              await supabase.from('orders').update({
                billing_status: invoiceStatus,
                status: invoiceStatus === 'PAID' ? 'CONCLUÍDO' : undefined,
                paid_at: invoiceStatus === 'PAID' ? paidAtDate : null,
                tenant_id: installment.tenant_id,
                updated_at: new Date().toISOString(),
              }).eq('id', item.reference_id);
            } else if (item.reference_type === 'QUOTE') {
              await supabase.from('quotes').update({
                billing_status: invoiceStatus,
                status: invoiceStatus === 'PAID' ? 'APPROVED' : invoiceStatus,
                paid_at: invoiceStatus === 'PAID' ? paidAtDate : null,
                tenant_id: installment.tenant_id,
                updated_at: new Date().toISOString(),
              }).eq('id', item.reference_id);
            }
          }
        }
      } catch (itemErr) {
        console.error('[Asaas Webhook] Erro ao atualizar OS vinculadas da parcela:', itemErr);
      }
    }

    // -------------------------------------------------------------------------
    // STEP 1: Procurar em Invoices
    // -------------------------------------------------------------------------
    if (!processed) {
      let invoice: any = null;

      for (const key of searchKeys) {
        if (!invoice) {
          const { data: inv1 } = await supabase.from('invoices').select('*').or(
            `gateway_payment_id.eq.${key},payment_gateway_id.eq.${key}`,
          ).maybeSingle();
          if (inv1) invoice = inv1;
        }
      }

      if (!invoice && extRef) {
        const { data: inv2 } = await supabase.from('invoices').select('*').eq('id', extRef)
          .maybeSingle();
        if (inv2) invoice = inv2;
      }

      if (!invoice && extRef) {
        const cleanDisplayId = extRef.replace('#', '').trim();
        const { data: inv3 } = await supabase.from('invoices').select('*').eq(
          'display_id',
          cleanDisplayId,
        ).maybeSingle();
        if (inv3) invoice = inv3;
      }

      if (invoice) {
        const invUpdatePayload: any = {
          gateway_status: event,
          status: newStatus,
          paid_at: newStatus === 'PAID' ? paidAtDate : null,
          tenant_id: invoice.tenant_id,
          updated_at: new Date().toISOString(),
        };
        const asaasInvoiceNum = payment.invoiceNumber || payment.invoice_number;
        if (asaasInvoiceNum) {
          invUpdatePayload.invoice_number = asaasInvoiceNum;
        }

        if (payId && payId.startsWith('pay_')) {
          invUpdatePayload.gateway_payment_id = payId;
          invUpdatePayload.payment_gateway_id = payId;
        }

        await supabase.from('invoices').update(invUpdatePayload).eq('id', invoice.id);

        try {
          const { data: items } = await supabase.from('invoice_items').select('*').eq(
            'invoice_id',
            invoice.id,
          );
          if (items && items.length > 0) {
            for (const item of items) {
              if (item.reference_type === 'ORDER' || !item.reference_type) {
                await supabase.from('orders').update({
                  billing_status: newStatus,
                  status: newStatus === 'PAID' ? 'CONCLUÍDO' : undefined,
                  paid_at: newStatus === 'PAID' ? paidAtDate : null,
                  tenant_id: invoice.tenant_id,
                  updated_at: new Date().toISOString(),
                }).eq('id', item.reference_id);
              } else if (item.reference_type === 'QUOTE') {
                await supabase.from('quotes').update({
                  billing_status: newStatus,
                  status: newStatus === 'PAID' ? 'APPROVED' : undefined,
                  paid_at: newStatus === 'PAID' ? paidAtDate : null,
                  tenant_id: invoice.tenant_id,
                  updated_at: new Date().toISOString(),
                }).eq('id', item.reference_id);
              }
            }
          }
        } catch (itemErr) {
          console.error('[Asaas Webhook] Erro ao atualizar itens vinculados da fatura:', itemErr);
        }

        targetTenantId = invoice.tenant_id;
        targetInvoiceId = invoice.id;

        if (newStatus === 'PAID') {
          const { data: existingCf } = await supabase.from('cash_flow').select('id').eq(
            'reference_id',
            invoice.id,
          ).maybeSingle();
          if (!existingCf) {
            await supabase.from('cash_flow').insert({
              tenant_id: invoice.tenant_id,
              type: 'INCOME',
              category: 'Recebimento de Fatura',
              amount: payment.value,
              description: `Pagamento integral via Asaas - Fatura ${
                invoice.display_id || invoice.id.slice(0, 8)
              }`,
              reference_id: invoice.id,
              reference_type: 'INVOICE',
              payment_method: payment.billingType === 'PIX'
                ? 'Pix'
                : (payment.billingType === 'CREDIT_CARD' ? 'Cartão de Crédito' : 'Boleto'),
              entry_date: paidAtDate || new Date().toISOString(),
              created_by: 'webhook-asaas',
            });
          }
        } else if (newStatus === 'CANCELED' || newStatus === 'PENDING') {
          await supabase.from('cash_flow').delete().eq('reference_id', invoice.id).eq(
            'created_by',
            'webhook-asaas',
          );
        }

        processed = true;
      }
    }

    // -------------------------------------------------------------------------
    // STEP 2: Procurar em Orders e Quotes (pelo gateway_payment_id OU por extRef)
    // -------------------------------------------------------------------------
    if (!processed) {
      // Busca em Orders
      for (const key of searchKeys) {
        if (!processed) {
          const { data: ord } = await supabase.from('orders').select('id, tenant_id').or(
            `gateway_payment_id.eq.${key},payment_gateway_id.eq.${key}`,
          ).maybeSingle();
          if (ord) {
            await supabase.from('orders').update({
              gateway_status: event,
              billing_status: newStatus,
              status: newStatus === 'PAID' ? 'CONCLUÍDO' : undefined,
              paid_at: newStatus === 'PAID' ? paidAtDate : null,
              tenant_id: ord.tenant_id,
              updated_at: new Date().toISOString(),
            }).eq('id', ord.id);
            targetTenantId = ord.tenant_id;
            targetInvoiceId = ord.id;
            processed = true;
          }
        }
      }

      if (!processed && extRef) {
        const { data: ordExt } = await supabase.from('orders').select('id, tenant_id').eq(
          'id',
          extRef,
        ).maybeSingle();
        if (ordExt) {
          await supabase.from('orders').update({
            gateway_status: event,
            billing_status: newStatus,
            status: newStatus === 'PAID' ? 'CONCLUÍDO' : undefined,
            paid_at: newStatus === 'PAID' ? paidAtDate : null,
            tenant_id: ordExt.tenant_id,
            updated_at: new Date().toISOString(),
          }).eq('id', ordExt.id);
          targetTenantId = ordExt.tenant_id;
          targetInvoiceId = ordExt.id;
          processed = true;
        }
      }

      // Busca em Quotes
      if (!processed) {
        for (const key of searchKeys) {
          if (!processed) {
            const { data: q } = await supabase.from('quotes').select('id, tenant_id').or(
              `gateway_payment_id.eq.${key},payment_gateway_id.eq.${key}`,
            ).maybeSingle();
            if (q) {
              await supabase.from('quotes').update({
                gateway_status: event,
                billing_status: newStatus,
                status: newStatus === 'PAID' ? 'APPROVED' : undefined,
                paid_at: newStatus === 'PAID' ? paidAtDate : null,
                tenant_id: q.tenant_id,
                updated_at: new Date().toISOString(),
              }).eq('id', q.id);
              targetTenantId = q.tenant_id;
              targetInvoiceId = q.id;
              processed = true;
            }
          }
        }
      }

      if (!processed && extRef) {
        const { data: qExt } = await supabase.from('quotes').select('id, tenant_id').eq(
          'id',
          extRef,
        ).maybeSingle();
        if (qExt) {
          await supabase.from('quotes').update({
            gateway_status: event,
            billing_status: newStatus,
            status: newStatus === 'PAID' ? 'APPROVED' : undefined,
            paid_at: newStatus === 'PAID' ? paidAtDate : null,
            tenant_id: qExt.tenant_id,
            updated_at: new Date().toISOString(),
          }).eq('id', qExt.id);
          targetTenantId = qExt.tenant_id;
          targetInvoiceId = qExt.id;
          processed = true;
        }
      }
    }

    if (!targetTenantId && targetInvoiceId) {
      const { data: invT } = await supabase.from('invoices').select('tenant_id').eq(
        'id',
        targetInvoiceId,
      ).maybeSingle();
      if (invT?.tenant_id) targetTenantId = invT.tenant_id;
    }

    // 📡 Broadcast Realtime Push para qualquer fatura/parcela/OS atualizada
    if (targetTenantId) {
      console.log(`[Asaas Webhook] ⚡ Enviando Realtime Broadcast para Tenant: ${targetTenantId}`);
      try {
        const chNexus = supabase.channel(`nexus-realtime-${targetTenantId}`, {
          config: { broadcast: { self: true } },
        });
        const chFin = supabase.channel(`financial-realtime-${targetTenantId}`, {
          config: { broadcast: { self: true } },
        });

        await Promise.all([
          new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              try {
                supabase.removeChannel(chNexus);
              } catch {}
              resolve();
            }, 4000);

            chNexus.subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                Promise.all([
                  chNexus.send({
                    type: 'broadcast',
                    event: 'INVOICE_UPDATED',
                    payload: {
                      invoiceId: targetInvoiceId,
                      status: newStatus,
                      tenantId: targetTenantId,
                    },
                  }),
                  chNexus.send({
                    type: 'broadcast',
                    event: 'PAYMENT_APPROVED',
                    payload: {
                      invoiceId: targetInvoiceId,
                      status: newStatus,
                      tenantId: targetTenantId,
                    },
                  }),
                ]).then(() => {
                  clearTimeout(timeout);
                  setTimeout(() => {
                    try {
                      supabase.removeChannel(chNexus);
                    } catch {}
                    resolve();
                  }, 500);
                }).catch(() => {
                  clearTimeout(timeout);
                  try {
                    supabase.removeChannel(chNexus);
                  } catch {}
                  resolve();
                });
              }
            });
          }),
          new Promise<void>((resolve) => {
            const timeout = setTimeout(() => {
              try {
                supabase.removeChannel(chFin);
              } catch {}
              resolve();
            }, 4000);

            chFin.subscribe((status) => {
              if (status === 'SUBSCRIBED') {
                Promise.all([
                  chFin.send({
                    type: 'broadcast',
                    event: 'INVOICE_UPDATED',
                    payload: {
                      invoiceId: targetInvoiceId,
                      status: newStatus,
                      tenantId: targetTenantId,
                    },
                  }),
                  chFin.send({
                    type: 'broadcast',
                    event: 'PAYMENT_APPROVED',
                    payload: {
                      invoiceId: targetInvoiceId,
                      status: newStatus,
                      tenantId: targetTenantId,
                    },
                  }),
                ]).then(() => {
                  clearTimeout(timeout);
                  setTimeout(() => {
                    try {
                      supabase.removeChannel(chFin);
                    } catch {}
                    resolve();
                  }, 500);
                }).catch(() => {
                  clearTimeout(timeout);
                  try {
                    supabase.removeChannel(chFin);
                  } catch {}
                  resolve();
                });
              }
            });
          }),
        ]);
      } catch (bcErr) {
        console.error('[Asaas Webhook] Erro na rotina de broadcast:', bcErr);
      }
    }

    if (processed) {
      return new Response(
        JSON.stringify({
          success: true,
          message: 'Processado com sucesso',
          invoiceId: targetInvoiceId,
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200,
        },
      );
    }

    return new Response(
      JSON.stringify({ message: 'Pagamento não vinculado a nenhuma fatura local.' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error: any) {
    console.error('Asaas Webhook NASA Error:', error.message);
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );
  }
});
