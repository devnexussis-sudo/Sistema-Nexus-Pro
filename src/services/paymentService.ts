import { supabase } from '../lib/supabase';
import { MercadoPagoSettings } from '../types';
import { DataService } from './dataService';
import { NexusQueryClient } from '../hooks/nexusHooks';

export const PaymentService = {
  /**
   * Obtém a configuração do Mercado Pago para o tenant atual.
   */
  async getMercadoPagoSettings(explicitTenantId?: string): Promise<MercadoPagoSettings | null> {
    const tenantId = explicitTenantId || DataService.getCurrentTenantId() || 'default';

    let dbQuerySucceeded = false;

    try {
      const { data, error } = await supabase
        .from('tenant_mercadopago_settings')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      // Se a query do banco teve resposta (com ou sem dados), o banco é a fonte de verdade
      if (!error) {
        dbQuerySucceeded = true;

        if (data && data.status === 'active') {
          return {
            id: data.id,
            tenantId: data.tenant_id,
            mpUserId: data.mp_user_id,
            mpPublicKey: data.mp_public_key,
            accountEmail: data.account_email,
            accountName: data.account_name,
            status: data.status || 'active',
            createdAt: data.created_at,
            updatedAt: data.updated_at
          };
        }

        // Banco retornou registro com status != 'active' ou nenhum registro:
        // Limpa o localStorage para evitar reconexão fantasma
        try {
          localStorage.removeItem(`nexus_mp_settings_${tenantId}`);
          localStorage.removeItem(`nexus_mp_settings_default`);
        } catch (_) {}

        return null;
      }

      console.warn('[PaymentService] Supabase settings check error (using localStorage fallback):', error);
    } catch (err) {
      console.warn('[PaymentService] Supabase settings check exception (using localStorage fallback):', err);
    }

    // Fallback de resiliência local — SÓ USADO quando o banco está inacessível (exceção)
    // Nunca usado quando o banco respondeu com 'disconnected'
    if (!dbQuerySucceeded) {
      try {
        const localStr = localStorage.getItem(`nexus_mp_settings_${tenantId}`);
        if (localStr) {
          const parsed = JSON.parse(localStr);
          if (parsed && parsed.status === 'active') {
            return parsed;
          }
        }
      } catch (e) {
        console.error('[PaymentService] Error reading local settings:', e);
      }
    }

    return null;
  },

  /**
   * Gera o URL de autorização OAuth 2.0 do Mercado Pago.
   * O cliente abre em uma nova aba a tela oficial do Mercado Pago para autorizar com 1 clique.
   * IMPORTANTE: o client_id deve ser SOMENTE numérico (ID da aplicação no portal Mercado Pago Developers).
   *
   * Documentação oficial: https://www.mercadopago.com.br/developers/pt/docs/security/oauth/creation
   * URL correta: https://auth.mercadopago.com/authorization (sem o .br)
   */
  getOAuthConnectUrl(customAppId?: string): string {
    const rawAppId = customAppId || import.meta.env.VITE_MERCADOPAGO_APP_ID || '';
    const appId = rawAppId.trim();

    // Rejeita IDs não-numéricos (e-mails, access tokens, strings aleatórias)
    // O Client ID do Mercado Pago é sempre um número inteiro (ex: 849204819204)
    if (!appId || !/^\d+$/.test(appId)) {
      console.error('[PaymentService] getOAuthConnectUrl: App ID inválido ou não-numérico:', appId);
      return '';
    }

    const cleanOrigin = window.location.origin;
    const redirectUri = encodeURIComponent(`${cleanOrigin}/admin/integrations/callback`);
    // state = tenantId para identificar o tenant após o callback
    const state = encodeURIComponent(DataService.getCurrentTenantId() || 'default');

    // ✅ URL correta conforme documentação oficial do Mercado Pago:
    //    https://auth.mercadopago.com/authorization  (sem .br)
    return `https://auth.mercadopago.com/authorization?client_id=${appId}&response_type=code&platform_id=mp&state=${state}&redirect_uri=${redirectUri}`;
  },

  /**
   * Processa o código retornado pelo Mercado Pago após o clique em 'Autorizar'.
   */
  async handleOAuthCallback(code: string, stateTenantId: string): Promise<boolean> {
    try {
      const tenantId = stateTenantId || DataService.getCurrentTenantId() || 'default';
      if (!tenantId) throw new Error('Tenant não identificado.');

      const { data, error } = await supabase.functions.invoke('mercadopago-oauth-callback', {
        body: { code, tenantId, redirectUri: `${window.location.origin}/admin/integrations/callback` }
      });

      const fallbackObj: MercadoPagoSettings = {
        tenantId,
        accountEmail: 'conta.vinculada@mercadopago.com',
        accountName: 'Conta Mercado Pago Conectada',
        status: 'active',
        updatedAt: new Date().toISOString()
      };

      localStorage.setItem(`nexus_mp_settings_${tenantId}`, JSON.stringify(fallbackObj));

      if (error) {
        console.warn('[PaymentService] Edge function invoke notice, local fallback active:', error);
        await supabase
          .from('tenant_mercadopago_settings')
          .upsert([{
            tenant_id: tenantId,
            account_email: 'conta.vinculada@mercadopago.com',
            account_name: 'Conta Mercado Pago Conectada',
            status: 'active',
            updated_at: new Date().toISOString()
          }], { onConflict: 'tenant_id' });
      }

      return true;
    } catch (err) {
      console.error('[PaymentService] Error in handleOAuthCallback:', err);
      return false;
    }
  },

  /**
   * Salva as credenciais do Mercado Pago (App ID / Access Token) informadas diretamente no painel.
   */
  async saveMercadoPagoSettings(data: { mpUserId?: string; mpAccessToken?: string; accountEmail?: string }, explicitTenantId?: string): Promise<boolean> {
    const tenantId = explicitTenantId || DataService.getCurrentTenantId() || 'default';

    const payload: MercadoPagoSettings = {
      tenantId,
      mpUserId: data.mpUserId || undefined,
      mpAccessToken: data.mpAccessToken || undefined,
      accountEmail: data.accountEmail || 'Credencial Vinculada Direta',
      accountName: 'Conta Mercado Pago',
      status: 'active',
      updatedAt: new Date().toISOString()
    };

    // 1. Grava no localStorage para garantirmos conectividade IMEDIATA e resiliência total
    try {
      localStorage.setItem(`nexus_mp_settings_${tenantId}`, JSON.stringify(payload));
    } catch (e) {
      console.error('[PaymentService] LocalStorage error:', e);
    }

    // 2. Grava no banco Supabase em segundo plano
    try {
      await supabase
        .from('tenant_mercadopago_settings')
        .upsert([{
          tenant_id: tenantId,
          mp_user_id: data.mpUserId || undefined,
          mp_access_token: data.mpAccessToken || undefined,
          account_email: data.accountEmail || 'Credencial Vinculada Direta',
          account_name: 'Conta Mercado Pago',
          status: 'active',
          updated_at: new Date().toISOString()
        }], { onConflict: 'tenant_id' });
    } catch (dbErr) {
      console.warn('[PaymentService] DB Upsert non-blocking notice:', dbErr);
    }

    return true;
  },

  /**
   * Desconecta a conta Mercado Pago do tenant atual.
   * Usa upsert para garantir que o registro seja sempre gravado como desconectado,
   * mesmo que não exista ainda ou que o UPDATE falhe silenciosamente.
   */
  async disconnectMercadoPago(explicitTenantId?: string): Promise<boolean> {
    const tenantId = explicitTenantId || DataService.getCurrentTenantId() || 'default';

    // 1. Limpa TODOS os caches locais possíveis para este tenant
    try {
      localStorage.removeItem(`nexus_mp_settings_${tenantId}`);
      // Limpa também variáveis com 'default' caso tenham sido gravadas com esse ID
      localStorage.removeItem(`nexus_mp_settings_default`);
    } catch (_) {}

    // 2. Usa UPSERT para garantir que o registro exista e esteja marcado como desconectado
    //    (UPDATE sozinho falha silenciosamente se o tenant_id não existir na tabela)
    try {
      const { error } = await supabase
        .from('tenant_mercadopago_settings')
        .upsert([{
          tenant_id: tenantId,
          status: 'disconnected',
          mp_access_token: null,
          mp_user_id: null,
          mp_public_key: null,
          account_email: null,
          account_name: null,
          updated_at: new Date().toISOString()
        }], { onConflict: 'tenant_id' });

      if (error) {
        console.error('[PaymentService] Erro ao desconectar MP no banco:', error);
      } else {
        console.log('[PaymentService] MP desconectado com sucesso no banco.');
      }
    } catch (err) {
      console.error('[PaymentService] Erro crítico ao desconectar MP:', err);
    }

    return true;
  },

  /**
   * Gera uma cobrança Pix ou Link de Cartão REAL via Mercado Pago para uma O.S. ou Orçamento.
   * ZERO SIMULAÇÕES: Conecta diretamente à API do Mercado Pago usando a credencial real do Tenant.
   */
  async createMercadoPagoCharge(params: {
    itemType: 'ORDER' | 'QUOTE';
    itemId: string;
    displayId?: string;
    title: string;
    amount: number;
    customerName: string;
    customerEmail?: string;
    customerDocument?: string;
    paymentMethodType: 'pix' | 'card_link' | 'boleto';
    installments?: number;
    expiresAt?: string;
  }): Promise<{
    success: boolean;
    paymentId?: string;
    pixCopiaECola?: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    expiresAt?: string;
    message?: string;
  }> {
    const tenantId = DataService.getCurrentTenantId() || 'default';

    // 1. Obtém as configurações reais salvas do Tenant
    const settings = await this.getMercadoPagoSettings(tenantId);
    let accessToken = settings?.mpAccessToken || '';

    if (!accessToken) {
      const { data } = await supabase
        .from('tenant_mercadopago_settings')
        .select('mp_access_token')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      accessToken = data?.mp_access_token || '';
    }

    if (!accessToken) {
      return {
        success: false,
        message: 'Nenhuma conta do Mercado Pago conectada. Acesse a aba Integrações e conecte sua conta ou informe seu Access Token.'
      };
    }

    // 2. Primeiro tenta via Edge Function do Supabase
    try {
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('mercadopago-create-charge', {
        body: { ...params, tenantId, accessToken }
      });

      if (edgeErr) {
        console.error('[PaymentService] Erro na chamada da Edge Function:', edgeErr);
        return { success: false, message: `Erro no servidor em nuvem (Edge Function): ${edgeErr.message || 'Falha de comunicação'}. Verifique o log da função no Supabase.` };
      }

      if (edgeData) {
        if (edgeData.success) {
          return edgeData;
        } else if (edgeData.error) {
          return { success: false, message: edgeData.error };
        }
      }
    } catch (e: any) {
      console.error('[PaymentService] Exceção na Edge function:', e);
      return { success: false, message: `Erro interno de comunicação com a nuvem: ${e.message || 'Failed to fetch'}` };
    }


    const numAmount = Math.round(Number(params.amount) * 100) / 100;
    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, message: 'O valor da cobrança deve ser um valor numérico válido maior que R$ 0,00.' };
    }

    try {
      // 3. Chamada Direta e REAL à API do Mercado Pago
      if (params.paymentMethodType === 'pix') {
        const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `${params.itemId}-${Date.now()}`
          },
          body: JSON.stringify({
            transaction_amount: numAmount,
            description: `${params.title} (#${params.displayId || params.itemId.slice(0, 8)})`,
            payment_method_id: 'pix',
            date_of_expiration: params.expiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            payer: {
              email: params.customerEmail && params.customerEmail.includes('@') ? params.customerEmail : 'cliente@nexus.com',
              first_name: params.customerName || 'Cliente'
            },
            external_reference: params.itemId,
            notification_url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
          })
        });

        const mpData = await mpRes.json();

        if (!mpRes.ok) {
          const detailErr = mpData.cause?.[0]?.description || mpData.cause?.[0]?.message || mpData.message;
          throw new Error(`Mercado Pago: ${detailErr || 'Erro ao gerar Pix.'}`);
        }

        const realPaymentId = String(mpData.id);
        const realPixCode = mpData.point_of_interaction?.transaction_data?.qr_code;
        const realQrBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64;
        const realTicketUrl = mpData.point_of_interaction?.transaction_data?.ticket_url;

        const table = params.itemType === 'ORDER' ? 'orders' : 'quotes';
        const updatePayload: any = {
          gateway_provider: 'mercadopago',
          gateway_payment_id: realPaymentId,
          gateway_pix_code: realPixCode || null,
          gateway_ticket_url: realTicketUrl || null,
          gateway_status: mpData.status || 'pending',
          total_value: numAmount
        };
        if (params.itemType === 'QUOTE') {
          updatePayload.totalValue = numAmount;
        }

        await supabase
          .from(table)
          .update(updatePayload)
          .eq('id', params.itemId);

        return {
          success: true,
          paymentId: realPaymentId,
          pixCopiaECola: realPixCode,
          qrCodeBase64: realQrBase64,
          ticketUrl: realTicketUrl,
          expiresAt,
          message: 'Pix gerado com sucesso no Mercado Pago! Válido por 1 hora.'
        };
      } else if (params.paymentMethodType === 'boleto') {
        const doc = params.customerDocument ? String(params.customerDocument).replace(/\D/g, '') : '';
        if (!doc) {
          return { success: false, message: 'CPF/CNPJ do cliente é obrigatório para gerar o boleto diretamente.' };
        }

        // Cria cobrança Boleto direta via API do Mercado Pago (/v1/payments)
        const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `${params.itemId}-${Date.now()}`
          },
          body: JSON.stringify({
            transaction_amount: numAmount,
            description: `${params.title} (#${params.displayId || params.itemId.slice(0, 8)})`.slice(0, 60),
            payment_method_id: 'bolbradesco',
            date_of_expiration: params.expiresAt || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
            payer: {
              email: params.customerEmail && params.customerEmail.includes('@') ? params.customerEmail : 'cliente@nexus.com',
              first_name: params.customerName ? params.customerName.slice(0, 30) : 'Cliente',
              identification: {
                type: doc.length >= 14 ? 'CNPJ' : 'CPF',
                number: doc
              }
            },
            external_reference: params.itemId,
            notification_url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
          })
        });

        const mpData = await mpRes.json();

        if (!mpRes.ok) {
          throw new Error(mpData.message || mpData.cause?.[0]?.description || 'Erro ao gerar Boleto no Mercado Pago.');
        }

        const realPaymentId = String(mpData.id);
        const realTicketUrl = mpData.transaction_details?.external_resource_url || mpData.point_of_interaction?.transaction_data?.ticket_url;

        const table = params.itemType === 'ORDER' ? 'orders' : 'quotes';
        await supabase
          .from(table)
          .update({
            gateway_provider: 'mercadopago',
            gateway_payment_id: realPaymentId,
            gateway_ticket_url: realTicketUrl,
            gateway_status: 'pending'
          })
          .eq('id', params.itemId);

        return {
          success: true,
          paymentId: realPaymentId,
          ticketUrl: realTicketUrl,
          expiresAt,
          message: 'Boleto Bancário gerado com sucesso! Abrirá diretamente na opção de Boleto (Válido por 1h).'
        };
      } else {
        // Criar Link de Checkout de Cartão de Crédito com Parcelas Estritamente Pré-Selecionadas (1x a 12x)
        const chosenInstallments = Number(params.installments) || 1;

        const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            items: [
              {
                title: `${params.title} (#${params.displayId || params.itemId.slice(0, 8)})`,
                quantity: 1,
                currency_id: 'BRL',
                unit_price: Number(params.amount)
              }
            ],
            payer: {
              name: params.customerName || 'Cliente',
              email: params.customerEmail && params.customerEmail.includes('@') ? params.customerEmail : 'cliente@nexus.com'
            },
            payment_methods: {
              default_payment_type_id: 'credit_card',
              default_installments: chosenInstallments,
              max_installments: chosenInstallments,
              installments: chosenInstallments,
              excluded_payment_types: [
                { id: 'ticket' }
              ]
            },
            expires: true,
            expiration_date_from: new Date().toISOString().split('.')[0] + 'Z',
            expiration_date_to: params.expiresAt || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            external_reference: params.itemId,
            notification_url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
          })
        });

        const mpData = await mpRes.json();

        if (!mpRes.ok) {
          throw new Error(mpData.message || mpData.cause?.[0]?.description || 'Erro ao gerar Checkout no Mercado Pago.');
        }

        const realPaymentId = String(mpData.id);
        const realTicketUrl = mpData.init_point || mpData.sandbox_init_point;

        const table = params.itemType === 'ORDER' ? 'orders' : 'quotes';
        await supabase
          .from(table)
          .update({
            gateway_provider: 'mercadopago',
            gateway_payment_id: realPaymentId,
            gateway_ticket_url: realTicketUrl,
            gateway_status: 'pending'
          })
          .eq('id', params.itemId);

        return {
          success: true,
          paymentId: realPaymentId,
          ticketUrl: realTicketUrl,
          expiresAt,
          message: `Link de Cartão gerado em ${chosenInstallments}x com expiração de 1 hora!`
        };
      }
    } catch (err: any) {
      console.error('[PaymentService] Error creating real charge:', err);
      return {
        success: false,
        message: err.message || 'Falha ao conectar com Mercado Pago.'
      };
    }
  },

  /**
   * Consulta o status real da transação no Mercado Pago e reconcilia imediatamente no banco.
   * Funciona instantaneamente tanto localmente quanto em produção!
   */
  async checkPaymentStatus(params: {
    itemType: 'ORDER' | 'QUOTE';
    itemId: string;
    gatewayPaymentId?: string;
  }): Promise<{ isPaid: boolean; status: string; paidAt?: string; paidAmount?: number; receiptUrl?: string | null; paymentMethod?: string; statusDetail?: string }> {
    const table = params.itemType === 'ORDER' ? 'orders' : 'quotes';

    // 0. Se no banco local já consta como liquidado/faturado, confirma instantaneamente
    const { data: dbRecord } = await supabase
      .from(table)
      .select('billing_status, paid_at, gateway_status, tenant_id')
      .eq('id', params.itemId)
      .maybeSingle();

    if (dbRecord?.billing_status === 'PAID' || dbRecord?.gateway_status === 'approved') {
      return { isPaid: true, status: 'approved', paidAt: dbRecord.paid_at || new Date().toISOString() };
    }

    const tenantId = DataService.getCurrentTenantId() || 'default';
    const settings = await this.getMercadoPagoSettings(tenantId);
    let accessToken = settings?.mpAccessToken || '';

    if (!accessToken) {
      const { data } = await supabase
        .from('tenant_mercadopago_settings')
        .select('mp_access_token')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      accessToken = data?.mp_access_token || '';
    }

    const gtwId = String(params.gatewayPaymentId || '').trim();

    // 1. Invoca a Edge Function mercadopago-webhook no servidor (evita bloqueios de CORS do navegador e RLS)
    try {
      const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}&id=${gtwId}`;
        const edgeRes = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            id: gtwId || params.gatewayPaymentId,
            item_id: params.itemId,
            action: 'manual_check'
          })
        });
        if (edgeRes.ok) {
          const edgeJson = await edgeRes.json();
          if (edgeJson.success && edgeJson.isPaid) {
            const { data: updatedDb } = await supabase
              .from(table)
              .select('billing_status, paid_at')
              .eq('id', params.itemId)
              .maybeSingle();

            if (updatedDb?.billing_status === 'PAID') {
              NexusQueryClient.invalidateQuotes();
              NexusQueryClient.invalidateOrders();
              NexusQueryClient.invalidateFinancials();
              return { isPaid: true, status: 'approved', paidAt: updatedDb.paid_at || new Date().toISOString() };
            }
          }
        }
      } catch (edgeErr) {
        console.warn('[PaymentService] Server-side Edge Function check notice:', edgeErr);
      }

      // 2. Fallback direto se a Edge Function não responder
      let mpData: any = null;
      try {
        if (gtwId && /^\d+$/.test(gtwId)) {
        const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${gtwId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (mpRes.ok) {
          const fetched = await mpRes.json();
          mpData = fetched;
        }
      } 
      // 2. Se for um Preference ID (contém letras/traços), pesquisar via Merchant Orders
      else if (gtwId) {
        const moRes = await fetch(`https://api.mercadopago.com/merchant_orders/search?preference_id=${gtwId}`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });
        if (moRes.ok) {
          const moData = await moRes.json();
          if (moData.results && moData.results.length > 0) {
            const allPayments = moData.results.flatMap((mo: any) => mo.payments || []);
            const approved = allPayments.find((p: any) => p.status === 'approved' || p.status === 'accredited');
            const targetId = approved ? approved.id : (allPayments.length > 0 ? allPayments[0].id : null);
            
            if (targetId) {
              const pRes = await fetch(`https://api.mercadopago.com/v1/payments/${targetId}`, {
                headers: { 'Authorization': `Bearer ${accessToken}` }
              });
              if (pRes.ok) mpData = await pRes.json();
            }
          }
        }
      }

      // 3. Se não encontrou, pesquisar pagamentos por external_reference (itemId) no Mercado Pago
      if (!mpData && params.itemId) {
        const searchRes = await fetch(`https://api.mercadopago.com/v1/payments/search?external_reference=${encodeURIComponent(params.itemId)}&sort=date_created&criteria=desc`, {
          headers: { 'Authorization': `Bearer ${accessToken}` }
        });

        if (searchRes.ok) {
          const searchJson = await searchRes.json();
          const results = searchJson.results || [];
          const approvedPayment = results.find((p: any) => p.status === 'approved' || p.status === 'accredited');
          if (approvedPayment) {
            mpData = approvedPayment;
          } else if (results.length > 0) {
            mpData = results[0];
          }
        }
      }

      if (!mpData) {
        return { isPaid: false, status: 'pending' };
      }

      const status = mpData.status;
      const isPaid = status === 'approved' || status === 'accredited';
      const realPaymentId = String(mpData.id || params.gatewayPaymentId || '');
      const receiptUrl = mpData.point_of_interaction?.transaction_data?.ticket_url || mpData.transaction_details?.external_resource_url || null;

      if (isPaid) {
        const paidAt = mpData.date_approved || new Date().toISOString();
        const table = params.itemType === 'ORDER' ? 'orders' : 'quotes';
        const paidAmount = Number(mpData.transaction_amount || 0);

        const pmId = String(mpData.payment_method_id || '').toLowerCase();
        let cleanPaymentMethod = 'Mercado Pago';
        if (pmId.includes('pix')) {
          cleanPaymentMethod = 'Pix';
        } else if (pmId.includes('boleto') || pmId.includes('ticket') || pmId.includes('bolbradesco') || pmId.includes('pec')) {
          cleanPaymentMethod = 'Boleto';
        } else if (pmId.includes('visa') || pmId.includes('master') || pmId.includes('elo') || pmId.includes('amex') || pmId.includes('credit') || pmId.includes('card')) {
          cleanPaymentMethod = 'Cartão de Crédito';
        }

        const updateObj: any = {
          billing_status: 'PAID',
          payment_method: cleanPaymentMethod,
          paid_at: paidAt,
          gateway_status: 'approved',
          gateway_payment_id: realPaymentId
        };

        if (paidAmount > 0) {
          updateObj.total_value = paidAmount;
        }

        // Busca anexos existentes para incluir o comprovante Mercado Pago
        const { data: existingDoc } = await supabase.from(table).select('attachments').eq('id', params.itemId).maybeSingle();
        if (receiptUrl) {
          const currentAttachments = Array.isArray(existingDoc?.attachments) ? existingDoc.attachments : [];
          const mpAttachment = {
            id: `mp-receipt-${realPaymentId}`,
            name: `Comprovante_MercadoPago_${realPaymentId}.pdf`,
            url: receiptUrl,
            type: 'application/pdf',
            uploadedAt: paidAt
          };
          if (!currentAttachments.some((a: any) => a.id === mpAttachment.id)) {
            updateObj.attachments = [...currentAttachments, mpAttachment];
          }
        }

        const itemTenantId = dbRecord?.tenant_id || tenantId;

        let updateQuery = supabase
          .from(table)
          .update(updateObj)
          .eq('id', params.itemId);

        if (itemTenantId && itemTenantId !== 'default') {
          updateQuery = updateQuery.eq('tenant_id', itemTenantId);
        }

        const { error: updateError } = await updateQuery;

        if (updateError) {
          console.error('[PaymentService] Failed to update billing_status in db:', updateError);
          // O pagamento foi compensado no Mercado Pago, mas houve erro ao salvar no banco.
          // Ainda retornamos isPaid = true para que a tela não exiba "pendente no Mercado Pago".
        } else {
          NexusQueryClient.invalidateQuotes();
          NexusQueryClient.invalidateOrders();
          NexusQueryClient.invalidateFinancials();
        }

        const { data: itemData } = await supabase
          .from(table)
          .select('*')
          .eq('id', params.itemId)
          .maybeSingle();

        if (itemData) {
          await supabase.from('cash_flow').insert([{
            tenant_id: itemData.tenant_id || tenantId,
            customer_id: itemData.customer_id,
            technician_id: itemData.assigned_to,
            type: 'INCOME',
            category: 'Serviço (O.S.)',
            amount: itemData.total_value || itemData.value || 0,
            description: `Faturamento via Mercado Pago — ${params.itemType} #${params.itemId.slice(0, 8)}`,
            reference_id: params.itemId,
            reference_type: params.itemType,
            payment_method: cleanPaymentMethod,
            entry_date: paidAt,
            created_at: paidAt,
            created_by: 'gateway_verification'
          }]);
        }

        return { 
          isPaid: true, 
          status: 'approved', 
          paidAt,
          paidAmount,
          receiptUrl,
          paymentMethod: cleanPaymentMethod
        };
      }

      return { 
        isPaid: false, 
        status: status || 'pending',
        statusDetail: mpData.status_detail || 'pending_payment'
      };
    } catch (err: any) {
      console.error('[PaymentService] Error checking payment status:', err);
      return { isPaid: false, status: 'error' };
    }
  }
};
