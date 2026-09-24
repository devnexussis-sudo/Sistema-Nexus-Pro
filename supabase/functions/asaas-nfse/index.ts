import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const payload = await req.json();
    const { action, tenantId, invoiceId, nfseId } = payload;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ========================================
    // Resolve Asaas API Key from tenant settings
    // ========================================
    let tenantSettings: any = null;
    if (tenantId) {
      const { data: stData } = await supabase
        .from('tenant_asaas_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();
      if (stData) tenantSettings = stData;
    }
    if (!tenantSettings) {
      const { data: globalSettings } = await supabase
        .from('tenant_asaas_settings')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();
      if (globalSettings) tenantSettings = globalSettings;
    }

    let ASAAS_API_KEY = tenantSettings?.asaas_api_key?.trim();
    
    // BUSCA CHAVE REAL NO COFRE
    if (tenantSettings?.tenant_id) {
       const { data: vault } = await supabase
           .from('tenant_secrets')
           .select('asaas_api_key')
           .eq('tenant_id', tenantSettings.tenant_id)
           .single();
       if (vault?.asaas_api_key) ASAAS_API_KEY = vault.asaas_api_key.trim();
    }

    if (!ASAAS_API_KEY) {
      ASAAS_API_KEY = (Deno.env.get('ASAAS_API_KEY') || Deno.env.get('ASAAS_ACCESS_TOKEN') || '').trim();
    }
    if (!ASAAS_API_KEY) {
      throw new Error('Configuração do Asaas não encontrada. Verifique se a API Key do Asaas foi cadastrada.');
    }

    const isSandbox = tenantSettings?.is_sandbox !== false;
    const ASAAS_API_URL = isSandbox ? 'https://sandbox.asaas.com/api/v3' : 'https://api.asaas.com/v3';
    const headers = {
      'Content-Type': 'application/json',
      'access_token': ASAAS_API_KEY
    };

    // ==========================================
    // ACTION: list_fiscal_services
    // ==========================================
    if (action === 'list_fiscal_services') {
      const res = await fetch(`${ASAAS_API_URL}/fiscalInfo/services`, { headers });
      const data = await res.json();
      if (data.errors) {
        throw new Error('Erro ao listar serviços fiscais: ' + (data.errors[0]?.description || JSON.stringify(data.errors)));
      }
      return new Response(JSON.stringify({ success: true, services: data.data || data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
      });
    }

    // ==========================================
    // ACTION: create_nfse
    // ==========================================
    if (action === 'create_nfse') {
      if (!invoiceId) throw new Error('invoiceId é obrigatório para emissão de NFS-e.');

      // Check if NFS-e already exists for this invoice
      const { data: existingNfse } = await supabase
        .from('invoice_nfse')
        .select('*')
        .eq('invoice_id', invoiceId)
        .maybeSingle();

      if (existingNfse && existingNfse.status !== 'ERROR' && existingNfse.status !== 'CANCELLATION_DENIED') {
        return new Response(JSON.stringify({
          success: false,
          message: `NFS-e já existe para esta fatura (Status: ${existingNfse.status}). ID Asaas: ${existingNfse.asaas_nfse_id || 'N/A'}`,
          nfse: existingNfse
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
        });
      }

      // 1. Get invoice data
      const { data: invoice, error: invError } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

      if (invError || !invoice) throw new Error('Fatura não encontrada no banco de dados.');

      // 2. Calculate the total value (with discounts and additions)
      const totalAmount = Number(invoice.total_amount || 0);
      const discountAmount = Number(invoice.discount_amount || 0);
      const shippingAmount = Number(invoice.shipping_amount || 0);
      const otherAdditions = Number(invoice.other_additions_amount || 0);
      const nfValue = Math.max(0, totalAmount - discountAmount + shippingAmount + otherAdditions);

      if (nfValue <= 0) throw new Error('Valor total da NF é zero ou negativo. Verifique os dados da fatura.');

      // 3. Build service description from invoice items (orders and quotes)
      const { data: items } = await supabase
        .from('invoice_items')
        .select('reference_type, reference_id, amount')
        .eq('invoice_id', invoiceId);

      let descriptionParts: string[] = [];
      descriptionParts.push(`Fatura ${invoice.display_id || invoiceId.slice(0, 8)}`);
      descriptionParts.push(`Cliente: ${invoice.customer_name || 'N/A'}`);

      if (items && items.length > 0) {
        descriptionParts.push('');
        descriptionParts.push('Itens e Documentos Incluídos no Lote:');

        const orderIds = items.filter(i => i.reference_type === 'ORDER').map(i => i.reference_id);
        const quoteIds = items.filter(i => i.reference_type === 'QUOTE').map(i => i.reference_id);

        // Fetch order details
        if (orderIds.length > 0) {
          const { data: ordersData } = await supabase
            .from('orders')
            .select('id, display_id, title, status, completed_at, updated_at, created_at')
            .in('id', orderIds);

          if (ordersData && ordersData.length > 0) {
            for (const order of ordersData) {
              const completionDate = order.completed_at || order.updated_at || order.created_at;
              const dateStr = completionDate ? new Date(completionDate).toLocaleDateString('pt-BR') : 'N/A';
              const statusMap: Record<string, string> = {
                'COMPLETED': 'Concluída', 'IN_PROGRESS': 'Em Andamento', 'PENDING': 'Pendente',
                'APPROVED': 'Aprovada', 'CANCELED': 'Cancelada'
              };
              const statusStr = statusMap[order.status?.toUpperCase()] || order.status || '';
              descriptionParts.push(`- OS #${order.display_id || order.id.slice(0, 8)}: ${order.title || 'Serviço'} (${statusStr} - ${dateStr})`);
            }
          }
        }

        // Fetch quote details
        if (quoteIds.length > 0) {
          const { data: quotesData } = await supabase
            .from('quotes')
            .select('id, display_id, title, status, approved_at, updated_at, created_at')
            .in('id', quoteIds);

          if (quotesData && quotesData.length > 0) {
            for (const quote of quotesData) {
              const approvalDate = quote.approved_at || quote.updated_at || quote.created_at;
              const dateStr = approvalDate ? new Date(approvalDate).toLocaleDateString('pt-BR') : 'N/A';
              const statusMap: Record<string, string> = {
                'APPROVED': 'Aprovado', 'PENDING': 'Pendente', 'CANCELED': 'Cancelado'
              };
              const statusStr = statusMap[quote.status?.toUpperCase()] || quote.status || '';
              descriptionParts.push(`- Orçamento #${quote.display_id || quote.id.slice(0, 8)}: ${quote.title || 'Orçamento'} (${statusStr} - ${dateStr})`);
            }
          }
        }
      }

      // Payment conditions
      const paymentMethod = invoice.payment_method || 'Não informado';
      descriptionParts.push('');
      descriptionParts.push(`Condições de Pagamento: ${paymentMethod}`);

      if (invoice.paid_at) {
        descriptionParts.push(`Data de Pagamento: ${new Date(invoice.paid_at).toLocaleDateString('pt-BR')}`);
      }

      const serviceDescription = payload.serviceDescription || descriptionParts.join('\n');

      // 4. Resolve the Asaas payment ID to link NFS-e
      const gatewayPaymentId = invoice.gateway_payment_id || invoice.payment_gateway_id;

      // 5. Get fiscal services to determine municipalServiceId, Code, and Name
      let municipalServiceId: string | null = null;
      let municipalServiceCode: string | null = null;
      let municipalServiceName: string | null = null;
      try {
        const servicesRes = await fetch(`${ASAAS_API_URL}/fiscalInfo/services`, { headers });
        const servicesData = await servicesRes.json();
        if (servicesData && servicesData.data && servicesData.data.length > 0) {
          municipalServiceId = servicesData.data[0].id;
          municipalServiceCode = servicesData.data[0].serviceCode || servicesData.data[0].issTaxCode;
          municipalServiceName = servicesData.data[0].description || servicesData.data[0].name;
        }
      } catch (svcErr) {
        console.error('[NFS-e] Erro ao buscar serviços fiscais:', svcErr);
      }

      // 6. Build NFS-e payload for Asaas
      const today = new Date().toISOString().split('T')[0];
      const nfsePayload: any = {
        serviceDescription: serviceDescription,
        observations: `Ref: Fatura ${invoice.display_id || invoiceId.slice(0, 8)} - ${invoice.customer_name || 'Cliente'}`,
        value: nfValue,
        deductions: 0,
        effectiveDate: today,
        externalReference: invoiceId,
        taxes: {
          retainIss: false,
          iss: 0,
          cofins: 0,
          csll: 0,
          inss: 0,
          ir: 0,
          pis: 0
        }
      };

      // Link to payment if available, otherwise link to customer
      if (gatewayPaymentId && gatewayPaymentId.startsWith('pay_')) {
        nfsePayload.payment = gatewayPaymentId;
      } else if (invoice.customer_id) {
        // Try to find or create customer in Asaas
        const { data: custData } = await supabase
          .from('customers')
          .select('document, name, email, phone, street, number, complement, neighborhood, city, state, zip_code')
          .eq('id', invoice.customer_id)
          .maybeSingle();

        if (custData?.document) {
          const cleanDoc = custData.document.replace(/\D/g, '');
          const custRes = await fetch(`${ASAAS_API_URL}/customers?cpfCnpj=${cleanDoc}`, { headers });
          const custAsaas = await custRes.json();
          if (custAsaas?.data && custAsaas.data.length > 0) {
            nfsePayload.customer = custAsaas.data[0].id;
          } else {
            // Create customer in Asaas with full address
            const createCustRes = await fetch(`${ASAAS_API_URL}/customers`, {
              method: 'POST', headers,
              body: JSON.stringify({
                name: custData.name || invoice.customer_name || 'Cliente',
                email: custData.email || 'cliente@nexussis.com',
                phone: custData.phone || '',
                mobilePhone: custData.phone || '',
                cpfCnpj: cleanDoc,
                postalCode: custData.zip_code ? custData.zip_code.replace(/\D/g, '') : '',
                address: custData.street || '',
                addressNumber: custData.number || 'S/N',
                complement: custData.complement || '',
                province: custData.neighborhood || '',
                notificationDisabled: true
              })
            });
            const newCust = await createCustRes.json();
            if (newCust?.id) {
              nfsePayload.customer = newCust.id;
            }
          }
        }
      }

      if (municipalServiceId) {
        nfsePayload.municipalServiceId = municipalServiceId;
        if (municipalServiceCode) nfsePayload.municipalServiceCode = municipalServiceCode;
        if (municipalServiceName) nfsePayload.municipalServiceName = municipalServiceName;
      }

      // Ensure we have either payment or customer
      if (!nfsePayload.payment && !nfsePayload.customer) {
        throw new Error('Não foi possível vincular a NFS-e a um pagamento ou cliente no Asaas. Verifique se a fatura possui um pagamento via Asaas ou se o cliente possui CPF/CNPJ cadastrado.');
      }

      console.log('[NFS-e] Payload para emissão:', JSON.stringify(nfsePayload));

      // 7. Call Asaas API to schedule NFS-e
      const nfseRes = await fetch(`${ASAAS_API_URL}/invoices`, {
        method: 'POST', headers,
        body: JSON.stringify(nfsePayload)
      });
      const nfseData = await nfseRes.json();

      console.log('[NFS-e] Resposta do Asaas:', JSON.stringify(nfseData));

      if (nfseData.errors) {
        const errorMsg = nfseData.errors.map((e: any) => e.description).join('; ');

        // Save error to DB
        if (existingNfse) {
          await supabase.from('invoice_nfse').update({
            status: 'ERROR',
            error_message: errorMsg,
            updated_at: new Date().toISOString()
          }).eq('id', existingNfse.id);
        } else {
          await supabase.from('invoice_nfse').insert({
            tenant_id: tenantId,
            invoice_id: invoiceId,
            status: 'ERROR',
            value: nfValue,
            service_description: serviceDescription,
            effective_date: today,
            error_message: errorMsg
          });
        }

        throw new Error('Erro do Asaas ao agendar NFS-e: ' + errorMsg);
      }

      // 8. Save NFS-e record to database
      const nfseRecord = {
        tenant_id: tenantId,
        invoice_id: invoiceId,
        asaas_nfse_id: nfseData.id,
        status: nfseData.status || 'SCHEDULED',
        nfse_number: nfseData.number || null,
        pdf_url: nfseData.pdfUrl || null,
        xml_url: nfseData.xmlUrl || null,
        invoice_url: nfseData.invoiceUrl || null,
        value: nfValue,
        service_description: serviceDescription,
        effective_date: today,
        error_message: null,
        updated_at: new Date().toISOString()
      };

      if (existingNfse) {
        await supabase.from('invoice_nfse').update(nfseRecord).eq('id', existingNfse.id);
      } else {
        await supabase.from('invoice_nfse').insert(nfseRecord);
      }

      const statusMapPt: Record<string, string> = {
        'SCHEDULED': 'AGENDADA',
        'SYNCHRONIZED': 'ENVIADA À PREFEITURA',
        'AUTHORIZED': 'AUTORIZADA',
        'PROCESSING_CANCELLATION': 'PROCESSANDO CANCELAMENTO',
        'CANCELED': 'CANCELADA',
        'CANCELLATION_DENIED': 'CANCELAMENTO NEGADO',
        'ERROR': 'ERRO'
      };
      const statusPt = statusMapPt[nfseData.status || 'SCHEDULED'] || nfseData.status || 'AGENDADA';

      return new Response(JSON.stringify({
        success: true,
        message: `NFS-e agendada com sucesso! ID: ${nfseData.id}. Status: ${statusPt}.`,
        nfse: {
          id: nfseData.id,
          status: nfseData.status || 'SCHEDULED',
          number: nfseData.number,
          pdfUrl: nfseData.pdfUrl,
          xmlUrl: nfseData.xmlUrl,
          invoiceUrl: nfseData.invoiceUrl
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
      });
    }

    // ==========================================
    // ACTION: check_nfse_status
    // ==========================================
    if (action === 'check_nfse_status') {
      let asaasNfseId = nfseId;

      // If no nfseId provided, look up from our DB
      if (!asaasNfseId && invoiceId) {
        const { data: nfseRecord } = await supabase
          .from('invoice_nfse')
          .select('asaas_nfse_id')
          .eq('invoice_id', invoiceId)
          .maybeSingle();
        if (nfseRecord) asaasNfseId = nfseRecord.asaas_nfse_id;
      }

      if (!asaasNfseId) {
        throw new Error('Nenhuma NFS-e encontrada para consulta. Emita primeiro.');
      }

      const res = await fetch(`${ASAAS_API_URL}/invoices/${asaasNfseId}`, { headers });
      const data = await res.json();

      if (data.errors) {
        throw new Error('Erro ao consultar NFS-e no Asaas: ' + (data.errors[0]?.description || JSON.stringify(data.errors)));
      }

      // Update our DB with latest status
      const updatePayload: any = {
        status: data.status || 'UNKNOWN',
        nfse_number: data.number || null,
        pdf_url: data.pdfUrl || null,
        xml_url: data.xmlUrl || null,
        invoice_url: data.invoiceUrl || null,
        error_message: data.status === 'ERROR' ? (data.observations || 'Erro na emissão') : null,
        updated_at: new Date().toISOString()
      };

      if (invoiceId) {
        await supabase.from('invoice_nfse').update(updatePayload).eq('invoice_id', invoiceId);
      } else {
        await supabase.from('invoice_nfse').update(updatePayload).eq('asaas_nfse_id', asaasNfseId);
      }

      const statusMapPt: Record<string, string> = {
        'SCHEDULED': 'AGENDADA',
        'SYNCHRONIZED': 'ENVIADA À PREFEITURA',
        'AUTHORIZED': 'AUTORIZADA',
        'PROCESSING_CANCELLATION': 'PROCESSANDO CANCELAMENTO',
        'CANCELED': 'CANCELADA',
        'CANCELLATION_DENIED': 'CANCELAMENTO NEGADO',
        'ERROR': 'ERRO'
      };
      const statusPt = statusMapPt[data.status || 'UNKNOWN'] || data.status || 'DESCONHECIDO';

      return new Response(JSON.stringify({
        success: true,
        message: `Status da NFS-e: ${statusPt}`,
        nfse: {
          id: data.id,
          status: data.status,
          number: data.number,
          pdfUrl: data.pdfUrl,
          xmlUrl: data.xmlUrl,
          invoiceUrl: data.invoiceUrl,
          effectiveDate: data.effectiveDate,
          value: data.value,
          serviceDescription: data.serviceDescription
        }
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
      });
    }

    throw new Error(`Ação desconhecida: ${action}. Use: create_nfse, check_nfse_status, list_fiscal_services`);

  } catch (error: any) {
    console.error('[NFS-e Edge Function Error]:', error.message);
    return new Response(JSON.stringify({ success: false, message: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200
    });
  }
});
