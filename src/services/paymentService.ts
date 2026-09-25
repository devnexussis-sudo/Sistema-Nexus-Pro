import { supabase } from '../lib/supabase';
import { AsaasSettings } from '../types';
import { getCurrentTenantId } from '../lib/tenantContext';
import { NexusQueryClient } from '../hooks/nexusHooks';

export const PaymentService = {
  /**
   * Obtém a configuração do Asaas para o tenant atual.
   */
  async getAsaasSettings(explicitTenantId?: string): Promise<AsaasSettings | null> {
    const tenantId = explicitTenantId || getCurrentTenantId() || 'default';

    try {
      const { data, error } = await supabase
        .from('tenant_asaas_settings')
        .select('id, tenant_id, asaas_wallet_id, is_active, created_at, updated_at, is_sandbox')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!error && data && data.is_active) {
        // Busca a chave mascarada do Cofre (Vault)
        const { data: vaultData } = await supabase.rpc('get_integration_status', { p_tenant_id: tenantId });
        const maskedKey = vaultData?.has_asaas ? (vaultData?.masked_asaas || 'sk_live_********') : '';

        return {
          id: data.id,
          tenantId: data.tenant_id,
          asaasApiKey: maskedKey, // Agora expõe apenas a chave mascarada
          asaasWalletId: data.asaas_wallet_id,
          isActive: data.is_active,
          createdAt: data.created_at,
          updatedAt: data.updated_at,
          is_sandbox: data.is_sandbox
        };
      }
    } catch (err) {
      console.warn('[PaymentService] Error fetching Asaas settings:', err);
    }

    return null;
  },

  /**
   * Salva as configurações do Asaas inseridas manualmente pelo usuário
   */
  async saveAsaasSettings(data: { asaasApiKey: string; asaasWalletId?: string; is_sandbox?: boolean }, explicitTenantId?: string): Promise<boolean> {
    const tenantId = explicitTenantId || getCurrentTenantId();
    if (!tenantId || tenantId === 'default') {
      console.error('saveAsaasSettings: No valid tenantId context found.');
      return false;
    }

    const payload = {
      tenant_id: tenantId,
      asaas_wallet_id: data.asaasWalletId,
      is_sandbox: data.is_sandbox !== undefined ? data.is_sandbox : true,
      is_active: true,
      updated_at: new Date().toISOString()
    };

    try {
      // 1. Salva apenas os metadados na tabela normal (sem a chave de API)
      const { error } = await supabase
        .from('tenant_asaas_settings')
        .upsert(payload, { onConflict: 'tenant_id' });

      if (error) {
        console.error('[PaymentService] Erro ao salvar configurações do Asaas:', JSON.stringify(error));
        return false;
      }
      
      // 2. Salva a chave REAL no Cofre de Segredos (Vault) via RPC
      // Só atualiza se o usuário digitou uma nova chave (evita sobrescrever com a mascarada)
      if (data.asaasApiKey && !data.asaasApiKey.includes('****')) {
         await supabase.rpc('update_tenant_secrets', { 
           p_tenant_id: tenantId, 
           p_asaas_api_key: data.asaasApiKey 
         });
      }
      
      // 🚀 AUTOMATIZAÇÃO DO WEBHOOK
      // Chama a Edge Function para configurar o webhook automaticamente no Asaas
      try {
        const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/asaas-webhook`;
        await supabase.functions.invoke('asaas-create-charge', {
          body: {
            action: 'setup_webhook',
            tenantId: tenantId,
            webhookUrl: webhookUrl
          }
        });
        console.log('[PaymentService] Webhook do Asaas configurado automaticamente com sucesso!');
      } catch (webhookErr) {
        // Apenas loga o erro, não impede o salvamento da chave
        console.error('[PaymentService] Erro ao configurar Webhook no Asaas automaticamente:', webhookErr);
      }

      return true;
    } catch (e) {
      console.error('[PaymentService] Exceção ao salvar configurações do Asaas:', e);
      return false;
    }
  },

  /**
   * Desconecta o Asaas do Tenant, desativando a integração e apagando a chave
   */
  async disconnectAsaas(explicitTenantId?: string): Promise<boolean> {
    const tenantId = explicitTenantId || getCurrentTenantId();
    if (!tenantId || tenantId === 'default') return false;

    try {
      const { error } = await supabase
        .from('tenant_asaas_settings')
        .delete()
        .eq('tenant_id', tenantId);

      if (error) {
        console.error('[PaymentService] Erro ao desconectar Asaas:', error);
        return false;
      }

      return true;
    } catch (err) {
      console.error('[PaymentService] Exceção ao desconectar Asaas:', err);
      return false;
    }
  },

  /**
   * Cria uma cobrança via Edge Function (Asaas)
   */
  async createAsaasCharge(params: {
    itemType: 'ORDER' | 'QUOTE' | 'INVOICE';
    itemId: string;
    displayId?: string;
    title?: string;
    amount: number;
    paymentMethodType?: string; // 'boleto', 'pix', 'credit_card'
    customerName?: string;
    customerEmail?: string;
    customerDocument?: string;
    customerId?: string;
    installments?: number;
    expiresAt?: string;
  }): Promise<{ success: boolean; paymentId?: string; pixCopiaECola?: string; qrCode?: string; qrCodeBase64?: string; ticketUrl?: string; hostedCheckoutUrl?: string; status?: string; message?: string }> {
    const tenantId = getCurrentTenantId();
    if (!tenantId) {
      return { success: false, message: 'Nenhum tenant selecionado' };
    }

    try {
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('asaas-create-charge', {
        body: { ...params, tenantId }
      });

      if (edgeErr) {
        throw new Error(edgeErr.message || 'Erro ao invocar Edge Function do Asaas');
      }

      if (!edgeData?.success) {
        return { success: false, message: edgeData?.message || 'Erro desconhecido retornado pela integração.' };
      }

      return {
        success: true,
        paymentId: edgeData.paymentId,
        pixCopiaECola: edgeData.pixCopiaECola,
        qrCodeBase64: edgeData.qrCodeBase64,
        ticketUrl: edgeData.ticketUrl,
        hostedCheckoutUrl: edgeData.hostedCheckoutUrl,
        status: edgeData.status
      };
    } catch (err: any) {
      console.error('Erro no createAsaasCharge:', err);
      return { success: false, message: err.message || 'Erro de rede ou permissão ao criar cobrança.' };
    }
  },

  /**
   * Cancela uma cobrança no Asaas
   */
  async cancelPayment(paymentId: string, tenantId?: string): Promise<{ success: boolean; message?: string }> {
    const tid = tenantId || getCurrentTenantId();
    if (!tid) return { success: false, message: 'Nenhum tenant selecionado' };

    try {
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('asaas-create-charge', {
        body: {
          action: 'cancel_payment',
          paymentId: paymentId,
          tenantId: tid
        }
      });

      if (edgeErr) {
        throw new Error(edgeErr.message || 'Erro ao invocar Edge Function para cancelamento');
      }

      if (!edgeData?.success) {
        return { success: false, message: edgeData?.message || 'Erro ao cancelar cobrança no Asaas.' };
      }

      return { success: true, message: 'Cobrança cancelada com sucesso.' };
    } catch (err: any) {
      console.error('Erro no cancelPayment:', err);
      return { success: false, message: err.message || 'Erro inesperado ao cancelar.' };
    }
  },

  /**
   * Sincroniza o status de um boleto/pix consultando o Asaas
   */
  async syncInstallment(paymentId: string | null | undefined, tenantId?: string, referenceId?: string, referenceType?: 'INVOICE' | 'ORDER' | 'QUOTE'): Promise<{ success: boolean; message?: string; newStatus?: string }> {
    const tid = tenantId || getCurrentTenantId();
    if (!tid) return { success: false, message: 'Nenhum tenant selecionado' };

    try {
      const payload: any = {
        action: 'sync_payment',
        paymentId: paymentId || '',
        tenantId: tid
      };

      if (referenceId) {
        if (referenceType === 'ORDER') payload.orderId = referenceId;
        else if (referenceType === 'QUOTE') payload.quoteId = referenceId;
        else payload.invoiceId = referenceId; // INVOICE by default
      }

      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('asaas-create-charge', {
        body: payload
      });

      if (edgeErr) {
        throw new Error(edgeErr.message || 'Erro ao invocar Edge Function para sincronização com o Asaas');
      }

      console.log('--- DEBUG ASAAS SYNC ---');
      console.log('edgeErr:', edgeErr);
      console.log('edgeData:', edgeData);
      console.log('paymentId sent:', paymentId);
      console.log('tenantId sent:', tid);
      console.log('------------------------');

      
      const statusText = edgeData.newStatus === 'PAID' ? 'PAGO / LIQUIDADO' : (edgeData.newStatus === 'OVERDUE' ? 'VENCIDO / ATRASADO' : (edgeData.newStatus === 'CANCELED' ? 'CANCELADO' : 'PENDENTE'));
      return { 
        success: true, 
        message: edgeData.message || `Status no Asaas: ${statusText}`, 
        newStatus: edgeData.newStatus || 'PENDING' 
      };
    } catch (err: any) {
      console.error('Erro no syncInstallment:', err);
      return { success: false, message: err.message || 'Erro inesperado ao sincronizar boleto.' };
    }
  },

  /**
   * Agenda emissão de NFS-e (Nota Fiscal de Serviço Eletrônica) no Asaas
   */
  async createNfse(invoiceId: string, serviceDescription?: string, tenantId?: string): Promise<{ success: boolean; message?: string; nfse?: any }> {
    const tid = tenantId || getCurrentTenantId();
    if (!tid) return { success: false, message: 'Nenhum tenant selecionado' };

    try {
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('asaas-nfse', {
        body: {
          action: 'create_nfse',
          invoiceId,
          tenantId: tid,
          serviceDescription
        }
      });

      if (edgeErr) {
        throw new Error(edgeErr.message || 'Erro ao invocar Edge Function de NFS-e');
      }

      return {
        success: edgeData?.success ?? false,
        message: edgeData?.message || 'Erro desconhecido',
        nfse: edgeData?.nfse
      };
    } catch (err: any) {
      console.error('Erro no createNfse:', err);
      return { success: false, message: err.message || 'Erro inesperado ao emitir NFS-e.' };
    }
  },

  /**
   * Consulta status de uma NFS-e já agendada no Asaas
   */
  async checkNfseStatus(invoiceId: string, nfseId?: string, tenantId?: string): Promise<{ success: boolean; message?: string; nfse?: any }> {
    const tid = tenantId || getCurrentTenantId();
    if (!tid) return { success: false, message: 'Nenhum tenant selecionado' };

    try {
      const { data: edgeData, error: edgeErr } = await supabase.functions.invoke('asaas-nfse', {
        body: {
          action: 'check_nfse_status',
          invoiceId,
          nfseId,
          tenantId: tid
        }
      });

      if (edgeErr) {
        throw new Error(edgeErr.message || 'Erro ao invocar Edge Function para status NFS-e');
      }

      return {
        success: edgeData?.success ?? false,
        message: edgeData?.message || 'Erro desconhecido',
        nfse: edgeData?.nfse
      };
    } catch (err: any) {
      console.error('Erro no checkNfseStatus:', err);
      return { success: false, message: err.message || 'Erro inesperado ao verificar NFS-e.' };
    }
  }
};
