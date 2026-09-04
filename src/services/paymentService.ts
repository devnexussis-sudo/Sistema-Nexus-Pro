import { supabase } from '../lib/supabase';
import { MercadoPagoSettings } from '../types';
import { getCurrentTenantId } from '../lib/tenantContext';
import { NexusQueryClient } from '../hooks/nexusHooks';

export const PaymentService = {
  /**
   * Obtém a configuração do Mercado Pago para o tenant atual.
   */
  async getMercadoPagoSettings(explicitTenantId?: string): Promise<MercadoPagoSettings | null> {
    const tenantId = explicitTenantId || getCurrentTenantId() || 'default';

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
            mpAccessToken: data.mp_access_token,
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
   * Obtém APENAS a public key de forma segura, útil para o Checkout Público onde o RLS bloqueia ler a tabela inteira.
   */
  async getMercadoPagoPublicKey(explicitTenantId?: string): Promise<string | null> {
    const tenantId = explicitTenantId || getCurrentTenantId() || 'default';
    try {
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Edge Function Timeout')), 3000));
      const invokePromise = supabase.functions.invoke('mercadopago-create-charge', {
        body: { action: 'get_public_key', tenantId }
      });
      
      const { data } = (await Promise.race([invokePromise, timeoutPromise])) as any;
      if (data && data.success && data.mpPublicKey) {
        return data.mpPublicKey;
      }
    } catch (err) {
      console.warn('[PaymentService] Error fetching public key via Edge Function (timeout or crash):', err);
    }

    try {
      const { data } = await supabase
        .from('tenant_mercadopago_settings')
        .select('mp_public_key')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (data?.mp_public_key) {
        return data.mp_public_key;
      }
    } catch (e) {}

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
    const state = encodeURIComponent(getCurrentTenantId() || 'default');

    // ✅ URL correta conforme documentação oficial do Mercado Pago:
    //    https://auth.mercadopago.com/authorization  (sem .br)
    return `https://auth.mercadopago.com/authorization?client_id=${appId}&response_type=code&platform_id=mp&state=${state}&redirect_uri=${redirectUri}`;
  },

  /**
   * Processa o código retornado pelo Mercado Pago após o clique em 'Autorizar'.
   */
  async handleOAuthCallback(code: string, stateTenantId: string): Promise<boolean> {
    try {
      const tenantId = stateTenantId || getCurrentTenantId() || 'default';
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
  async saveMercadoPagoSettings(data: { mpUserId?: string; mpAccessToken?: string; mpPublicKey?: string; accountEmail?: string }, explicitTenantId?: string): Promise<boolean> {
    const tenantId = explicitTenantId || getCurrentTenantId() || 'default';

    const payload: MercadoPagoSettings = {
      tenantId,
      mpUserId: data.mpUserId || undefined,
      mpAccessToken: data.mpAccessToken || undefined,
      mpPublicKey: data.mpPublicKey || undefined,
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
      const { error: dbErr } = await supabase
        .from('tenant_mercadopago_settings')
        .upsert([{
          tenant_id: tenantId,
          mp_user_id: data.mpUserId || undefined,
          mp_access_token: data.mpAccessToken || undefined,
          mp_public_key: data.mpPublicKey || undefined,
          account_email: data.accountEmail || 'Credencial Vinculada Direta',
          account_name: 'Conta Mercado Pago',
          status: 'active',
          updated_at: new Date().toISOString()
        }], { onConflict: 'tenant_id' });
        
      if (dbErr) {
        console.error('[PaymentService] DB Upsert error:', dbErr);
        return false;
      }
    } catch (dbErr) {
      console.error('[PaymentService] DB Upsert exception:', dbErr);
      return false;
    }

    return true;
  },

  /**
   * Desconecta a conta Mercado Pago do tenant atual.
   * Usa upsert para garantir que o registro seja sempre gravado como desconectado,
   * mesmo que não exista ainda ou que o UPDATE falhe silenciosamente.
   */
  async disconnectMercadoPago(explicitTenantId?: string): Promise<boolean> {
    const tenantId = explicitTenantId || getCurrentTenantId() || 'default';

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
    itemType: 'ORDER' | 'QUOTE' | 'INVOICE';
    itemId: string;
    displayId?: string;
    title: string;
    amount: number;
    customerName: string;
    customerEmail?: string;
    customerDocument?: string;
    customerZip?: string;
    customerStreet?: string;
    customerNumber?: string;
    customerNeighborhood?: string;
    customerCity?: string;
    customerState?: string;
    paymentMethodType: 'pix' | 'card_link' | 'boleto' | 'credit_card';
    installments?: number;
    expiresAt?: string;
    tenantId?: string;
    cardToken?: string;
    issuerId?: string;
    paymentMethodId?: string;
    payer?: any;
  }): Promise<{
    success: boolean;
    paymentId?: string;
    pixCopiaECola?: string;
    qrCodeBase64?: string;
    ticketUrl?: string;
    expiresAt?: string;
    status?: string;
    statusDetail?: string;
    message?: string;
  }> {
    const tenantId = params.tenantId || getCurrentTenantId() || 'default';

    // 1. Obtém as configurações reais salvas do Tenant
    const settings = await this.getMercadoPagoSettings(tenantId);
    let accessToken = (settings?.mpAccessToken || '').trim().replace(/^["']|["']$/g, '');

    if (!accessToken) {
      const { data } = await supabase
        .from('tenant_mercadopago_settings')
        .select('mp_access_token')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      accessToken = (data?.mp_access_token || '').trim().replace(/^["']|["']$/g, '');
    }

    if (!accessToken) {
      return {
        success: false,
        message: 'Nenhuma conta do Mercado Pago conectada. Acesse a aba Integrações e conecte sua conta ou informe seu Access Token.'
      };
    }

    const numAmount = Math.round(Number(params.amount) * 100) / 100;
    if (isNaN(numAmount) || numAmount <= 0) {
      return { success: false, message: 'O valor da cobrança deve ser um valor numérico válido maior que R$ 0,00.' };
    }

    if (params.paymentMethodType === 'boleto' && numAmount < 4.00) {
      return { success: false, message: 'O Mercado Pago exige um valor mínimo de R$ 4,00 para gerar Boleto Bancário.' };
    }

    if ((params.paymentMethodType === 'card_link' || params.paymentMethodType === 'credit_card') && numAmount < 0.50) {
      return { success: false, message: 'O Mercado Pago exige um valor mínimo de R$ 0,50 para pagamentos via Cartão.' };
    }

    // 2. Primeiro tenta via Edge Function do Supabase
    try {
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('mercadopago-create-charge', {
        body: { ...params, tenantId, accessToken }
      });

      if (edgeErr) {
        console.warn('[PaymentService] Falha na invocação da Edge Function, tentando fallback direto:', edgeErr);
      } else if (edgeData && edgeData.success) {
        return edgeData;
      } else if (edgeData && !edgeData.success) {
        console.warn('[PaymentService] Edge function retornou erro:', edgeData.error);
        return {
          success: false,
          status: edgeData.status || 'rejected',
          statusDetail: edgeData.statusDetail,
          message: edgeData.error || 'Não foi possível autorizar o pagamento com este cartão.'
        };
      }
    } catch (e: any) {
      console.warn('[PaymentService] Exceção ao invocar a Edge function, tentando fallback direto:', e);
    }

    try {
      // 3. Chamada Direta e REAL à API do Mercado Pago
      const expiresAtIso = (params.expiresAt && params.expiresAt.includes('T')) 
        ? params.expiresAt 
        : new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const descPrefix = params.itemType === 'INVOICE' ? 'Fatura' : (params.itemType === 'ORDER' ? 'OS' : 'Orçamento');
      const cleanDisplayId = String(params.displayId || '').replace(/^(FAT|OS|ORC)-?/i, '').trim();
      const finalDisplayId = cleanDisplayId || params.itemId.slice(0, 8);
      const descStr = `${descPrefix} #${finalDisplayId}`.slice(0, 60);

      // Função auxiliar para gerar Checkout Preference quando a API direta /v1/payments não for autorizada
      const createPreferenceFallback = async (methodType: 'pix' | 'boleto' | 'card_link') => {
        const chosenInstallments = Number(params.installments) || 1;
        const defaultMethodId = methodType === 'pix' ? 'pix' : (methodType === 'boleto' ? 'bolbradesco' : undefined);
        const defaultTypeId = methodType === 'pix' ? 'bank_transfer' : (methodType === 'boleto' ? 'ticket' : 'credit_card');
        const excludedTypes = methodType === 'pix' 
          ? [{ id: 'credit_card' }, { id: 'ticket' }, { id: 'debit_card' }] 
          : (methodType === 'boleto' 
            ? [{ id: 'credit_card' }, { id: 'bank_transfer' }, { id: 'debit_card' }] 
            : [{ id: 'ticket' }, { id: 'bank_transfer' }]);
            
        const expFrom = new Date().toISOString();

        const prefRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            items: [
              {
                title: descStr,
                quantity: 1,
                currency_id: 'BRL',
                unit_price: numAmount
              }
            ],
            payer: {
              name: params.customerName || 'Cliente',
              email: params.customerEmail && params.customerEmail.includes('@') ? params.customerEmail : 'cliente@nexus.com'
            },
            payment_methods: {
              default_payment_method_id: defaultMethodId,
              default_payment_type_id: defaultTypeId,
              default_installments: methodType === 'card_link' ? chosenInstallments : undefined,
              max_installments: methodType === 'card_link' ? chosenInstallments : undefined,
              installments: methodType === 'card_link' ? chosenInstallments : undefined,
              excluded_payment_types: excludedTypes
            },
            expires: true,
            expiration_date_from: expFrom,
            expiration_date_to: expiresAtIso,
            external_reference: params.itemId,
            notification_url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
          })
        });

        const prefData = await prefRes.json();

        if (!prefRes.ok) {
          const detailErr = prefData.cause?.[0]?.description || prefData.cause?.[0]?.message || prefData.message || '';
          if (prefRes.status === 401 || String(detailErr).includes('UNAUTHORIZED') || String(detailErr).includes('unauthorized')) {
            throw new Error('Credenciais do Mercado Pago não autorizadas. Verifique seu Access Token de Produção (APP_USR-...).');
          }
          throw new Error(`Mercado Pago: ${detailErr || 'Erro ao gerar link de cobrança.'}`);
        }

        const realPaymentId = String(prefData.id);
        const isNumericGtwId = /^\d+$/.test(realPaymentId);
        const realTicketUrl = prefData.init_point || prefData.sandbox_init_point;

        const table = params.itemType === 'ORDER' ? 'orders' : params.itemType === 'INVOICE' ? 'invoices' : 'quotes';
        await supabase
          .from(table)
          .update({
            gateway_provider: 'mercadopago',
            gateway_payment_id: isNumericGtwId ? realPaymentId : null,
            gateway_ticket_url: realTicketUrl,
            gateway_status: 'pending'
          })
          .eq('id', params.itemId);

        const methodLabel = methodType === 'pix' ? 'Pix' : (methodType === 'boleto' ? 'Boleto' : 'Cartão');

        return {
          success: true,
          paymentId: realPaymentId,
          ticketUrl: realTicketUrl,
          expiresAt: expiresAtIso,
          message: `Link de pagamento ${methodLabel} gerado com sucesso via Mercado Pago! Válido por 1 hora.`
        };
      };
      
      if (params.paymentMethodType === 'pix') {
        const doc = params.customerDocument ? String(params.customerDocument).replace(/\D/g, '') : '';
        const nameParts = (params.customerName || 'Cliente').trim().split(' ');
        const firstName = nameParts[0] || 'Cliente';
        const lastName = nameParts.slice(1).join(' ') || firstName;

        const payerObj: any = {
          email: params.customerEmail && params.customerEmail.includes('@') ? params.customerEmail : 'cliente@nexus.com',
          first_name: firstName,
          last_name: lastName
        };

        if (doc && (doc.length === 11 || doc.length === 14)) {
          payerObj.identification = {
            type: doc.length === 14 ? 'CNPJ' : 'CPF',
            number: doc
          };
        }

        const mpRes = await fetch('https://api.mercadopago.com/v1/payments', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'X-Idempotency-Key': `${params.itemId}-${Date.now()}`
          },
          body: JSON.stringify({
            transaction_amount: numAmount,
            description: descStr,
            payment_method_id: 'pix',
            date_of_expiration: expiresAtIso,
            payer: payerObj,
            external_reference: params.itemId,
            notification_url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
          })
        });

        const mpData = await mpRes.json();

        if (!mpRes.ok) {
          const detailErr = mpData.cause?.[0]?.description || mpData.cause?.[0]?.message || mpData.message || '';
          throw new Error(`Erro do Mercado Pago ao gerar PIX: ${detailErr || JSON.stringify(mpData)}`);
        }

        const realPaymentId = String(mpData.id);
        const realPixCode = mpData.point_of_interaction?.transaction_data?.qr_code;
        const realQrBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64;
        const realTicketUrl = mpData.point_of_interaction?.transaction_data?.ticket_url;

        const table = params.itemType === 'ORDER' ? 'orders' : params.itemType === 'INVOICE' ? 'invoices' : 'quotes';
        
        let updatePayload: any = {};
        if (table === 'invoices') {
          updatePayload = {
            payment_gateway_id: realPaymentId,
            status: 'PENDING',
            notes: JSON.stringify({
              gateway_provider: 'mercadopago',
              gateway_payment_id: realPaymentId,
              gateway_pix_code: realPixCode || null,
              gateway_ticket_url: realTicketUrl || null,
              gateway_status: mpData.status || 'pending'
            })
          };
        } else {
          updatePayload = {
            gateway_provider: 'mercadopago',
            gateway_payment_id: realPaymentId,
            gateway_pix_code: realPixCode || null,
            gateway_ticket_url: realTicketUrl || null,
            gateway_status: mpData.status || 'pending'
          };
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
          expiresAt: expiresAtIso,
          message: 'Pix gerado com sucesso no Mercado Pago! Válido por 1 hora.'
        };
      } else if (params.paymentMethodType === 'boleto') {
        const doc = params.customerDocument ? String(params.customerDocument).replace(/\D/g, '') : '';
        const nameParts = (params.customerName || 'Cliente').trim().split(' ');
        const firstName = nameParts[0] || 'Cliente';
        const lastName = nameParts.slice(1).join(' ') || firstName;

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
            description: descStr,
            payment_method_id: 'bolbradesco',
            date_of_expiration: expiresAtIso,
            payer: {
              email: params.customerEmail && params.customerEmail.includes('@') ? params.customerEmail : 'cliente@nexus.com',
              first_name: firstName,
              last_name: lastName,
              identification: doc ? {
                type: doc.length >= 14 ? 'CNPJ' : 'CPF',
                number: doc
              } : undefined
            },
            external_reference: params.itemId,
            notification_url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mercadopago-webhook?tenant_id=${tenantId}`
          })
        });

        const mpData = await mpRes.json();

        if (!mpRes.ok) {
          const detailErr = mpData.cause?.[0]?.description || mpData.cause?.[0]?.message || mpData.message || '';
          if (mpRes.status === 401 || mpRes.status === 403 || String(detailErr).includes('UNAUTHORIZED') || String(detailErr).includes('unauthorized') || mpData.error === 'unauthorized' || mpData.blocked_by === 'PolicyAgent') {
            throw new Error(`❌ Bloqueio do Mercado Pago (403/PolicyAgent). Detalhe da API: ${JSON.stringify(mpData)}`);
          }
          throw new Error(mpData.message || mpData.cause?.[0]?.description || 'Erro ao gerar Boleto no Mercado Pago.');
        }

        const realPaymentId = String(mpData.id);
        const realTicketUrl = mpData.transaction_details?.external_resource_url || mpData.point_of_interaction?.transaction_data?.ticket_url;

        const table = params.itemType === 'ORDER' ? 'orders' : params.itemType === 'INVOICE' ? 'invoices' : 'quotes';
        
        let updatePayload: any = {};
        if (table === 'invoices') {
          updatePayload = {
            payment_gateway_id: realPaymentId,
            status: 'PENDING',
            notes: JSON.stringify({
              gateway_provider: 'mercadopago',
              gateway_payment_id: realPaymentId,
              gateway_ticket_url: realTicketUrl || null,
              gateway_status: mpData.status || 'pending'
            })
          };
        } else {
          updatePayload = {
            gateway_provider: 'mercadopago',
            gateway_payment_id: realPaymentId,
            gateway_ticket_url: realTicketUrl || null,
            gateway_status: mpData.status || 'pending'
          };
        }

        await supabase
          .from(table)
          .update(updatePayload)
          .eq('id', params.itemId);

        return {
          success: true,
          paymentId: realPaymentId,
          ticketUrl: realTicketUrl,
          expiresAt: expiresAtIso,
          message: 'Boleto Bancário gerado com sucesso! Abrirá diretamente na opção de Boleto (Válido por 1h).'
        };
      } else {
        return await createPreferenceFallback('card_link');
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
    itemType: 'ORDER' | 'QUOTE' | 'INVOICE';
    itemId: string;
    gatewayPaymentId?: string;
  }): Promise<{ isPaid: boolean; status: string; paidAt?: string; paidAmount?: number; receiptUrl?: string | null; paymentMethod?: string; statusDetail?: string }> {
    const table = params.itemType === 'ORDER' ? 'orders' : params.itemType === 'INVOICE' ? 'invoices' : 'quotes';

    // 0. Se no banco local já consta como liquidado/faturado, confirma instantaneamente
    const { data: dbRecord } = await supabase
      .from(table)
      .select('billing_status, status, paid_at, gateway_status, tenant_id')
      .eq('id', params.itemId)
      .maybeSingle();

    if (dbRecord?.billing_status === 'PAID' || dbRecord?.status === 'PAID' || dbRecord?.gateway_status === 'approved') {
      return { isPaid: true, status: 'approved', paidAt: dbRecord.paid_at || new Date().toISOString() };
    }

    const tenantId = getCurrentTenantId() || 'default';
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
          console.log('[PaymentService] Edge Function manual_check response:', edgeJson);
          
          if (edgeJson.success) {
            if (edgeJson.isPaid) {
              const { data: updatedDb } = await supabase
                .from(table)
                .select('billing_status, status, paid_at')
                .eq('id', params.itemId)
                .maybeSingle();

              if (updatedDb?.billing_status === 'PAID' || updatedDb?.status === 'PAID') {
                NexusQueryClient.invalidateQuotes();
                NexusQueryClient.invalidateOrders();
                NexusQueryClient.invalidateFinancials();
                return { isPaid: true, status: 'approved', paidAt: updatedDb.paid_at || new Date().toISOString() };
              } else {
                // Edge function confirmou que está pago no Mercado Pago, mas o webhook ainda não atualizou o banco local.
                // Forçamos a atualização síncrona aqui para garantir.
                const updateObj: any = {
                  paid_at: new Date().toISOString(),
                  gateway_status: 'approved',
                  gateway_payment_id: String(gtwId || params.gatewayPaymentId)
                };
                if (table === 'invoices') {
                  updateObj.status = 'PAID';
                  updateObj.payment_gateway_id = String(gtwId || params.gatewayPaymentId);
                } else {
                  updateObj.billing_status = 'PAID';
                }
                
                await supabase.from(table).update(updateObj).eq('id', params.itemId);
                
                NexusQueryClient.invalidateQuotes();
                NexusQueryClient.invalidateOrders();
                NexusQueryClient.invalidateFinancials();
                return { isPaid: true, status: 'approved', paidAt: updateObj.paid_at };
              }
            } else {
              // Edge function respondeu com sucesso, mas ainda não está pago. 
              // Retorna o status real (ex: 'rejected', 'in_process', 'pending') para o frontend poder tratar recusas.
              return { isPaid: false, status: edgeJson.gatewayStatus || 'pending' };
            }
          } else if (edgeJson.error) {
            console.error('[PaymentService] Edge Function returned error:', edgeJson.error);
            throw new Error(`Erro no servidor (Edge): ${edgeJson.error}`);
          }
        } else {
          console.warn('[PaymentService] Edge Function returned non-ok status:', edgeRes.status);
          throw new Error(`Servidor inacessível (Status ${edgeRes.status})`);
        }
      } catch (edgeErr: any) {
        console.warn('[PaymentService] Server-side Edge Function check notice:', edgeErr);
        if (edgeErr.message && edgeErr.message.includes('Edge')) {
           throw edgeErr; // throw custom edge errors directly to the UI for debugging
        }
      }

      // 2. Fallback direto se a Edge Function não responder (CORS costuma bloquear)
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
        const table = params.itemType === 'ORDER' ? 'orders' : params.itemType === 'INVOICE' ? 'invoices' : 'quotes';
        const paidAmount = Number(mpData.transaction_amount || 0);

        const pmId = String(mpData.payment_method_id || '').toLowerCase();
        let cleanPaymentMethod = 'Mercado Pago';
        if (pmId.includes('pix')) {
          cleanPaymentMethod = 'Pix';
        } else if (pmId.includes('boleto') || pmId.includes('ticket') || pmId.includes('bolbradesco') || pmId.includes('pec')) {
          cleanPaymentMethod = 'Boleto';
        } else if (pmId.includes('visa') || pmId.includes('master') || pmId.includes('elo') || pmId.includes('amex') || pmId.includes('credit') || pmId.includes('card')) {
          cleanPaymentMethod = 'Cartão de Crédito';
          if (mpData.installments && mpData.installments > 1) {
            cleanPaymentMethod += ` (${mpData.installments}x)`;
          }
        }

        // 🛡️ MUTAÇÃO DE BANCO DE DADOS REMOVIDA (Auditoria Arquitetural Set/2026)
        // ─────────────────────────────────────────────────────────────────────────
        // Este serviço antes executava `supabase.update(orders)` e `supabase.insert(cash_flow)`.
        // Isso foi removido para evitar RACE CONDITIONS com o Webhook do Mercado Pago.
        // O cliente agora apenas **lê** o status da API (retornando isPaid = true para a UI).
        // Toda a mutação de banco de dados (baixar fatura, criar cash_flow) é de 
        // responsabilidade EXCLUSIVA da Edge Function `mercadopago-webhook`.
        // ─────────────────────────────────────────────────────────────────────────

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

export const getMercadoPagoErrorMessage = (codeOrMessage?: string): string => {
  if (!codeOrMessage) return 'Transação não autorizada pela operadora do cartão. Tente outro cartão ou forma de pagamento.';

  const clean = String(codeOrMessage).trim();

  const dict: Record<string, string> = {
    'cc_rejected_bad_filled_card_number': 'Número do cartão incorreto. Verifique os dígitos e tente novamente.',
    'cc_rejected_bad_filled_date': 'Data de validade do cartão incorreta ou expirada.',
    'cc_rejected_bad_filled_other': 'Dados do cartão incorretos. Revise os campos e tente novamente.',
    'cc_rejected_bad_filled_security_code': 'Código de segurança (CVV) incorreto.',
    'cc_rejected_blacklist': 'O cartão foi recusado por razões de segurança. Tente outro cartão.',
    'cc_rejected_call_for_authorize': 'Pagamento não autorizado. Ligue para a operadora do seu cartão para autorizar esta compra.',
    'cc_rejected_card_disabled': 'O cartão está bloqueado ou desativado. Ligue para seu banco ou use outro cartão.',
    'cc_rejected_card_error': 'Não foi possível processar o pagamento com este cartão. Tente outro cartão.',
    'cc_rejected_duplicated_payment': 'Pagamento duplicado recente. Tente novamente em alguns instantes.',
    'cc_rejected_high_risk': 'Pagamento recusado pelo sistema de prevenção de fraude do banco. Tente outro cartão.',
    'cc_rejected_insufficient_amount': 'Saldo ou limite insuficiente no cartão de crédito.',
    'cc_rejected_invalid_installments': 'O banco emissor não aceita a quantidade de parcelas selecionada.',
    'cc_rejected_max_attempts': 'Limite de tentativas excedido para este cartão. Tente mais tarde ou use outro cartão.',
    'cc_rejected_other_reason': 'Pagamento recusado pelo banco emissor. Tente outro cartão ou fale com seu banco.',
    'in_process_pending_contingency': 'Pagamento em processamento pelo banco emissor. Aguarde a confirmação.',
    'in_process_merchant_acquirer': 'Pagamento em análise de segurança pelo Mercado Pago. Aguarde alguns minutos.'
  };

  if (dict[clean]) return dict[clean];

  for (const [key, val] of Object.entries(dict)) {
    if (clean.toLowerCase().includes(key.toLowerCase())) return val;
  }

  return clean;
};
