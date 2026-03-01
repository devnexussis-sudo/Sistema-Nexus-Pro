
import { supabase, publicSupabase } from '../lib/supabase';
import { StorageService } from './storageService';
import { CacheManager } from '../lib/cache';
import { getCurrentTenantId } from '../lib/tenantContext';
import { logger } from '../lib/logger';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);



export const QuoteService = {

    _mapQuoteFromDB: (data: any): any => {
        if (!data) return null;
        return {
            id: data.id,
            // display_id: Identificador Soberano (ORC-...) gerado pela app.
            // Separado da PK UUID para retrocompatibilidade.
            displayId: data.display_id || null,
            publicToken: data.public_token,
            tenantId: data.tenant_id,
            customerName: data.customer_name,
            customerAddress: data.customer_address,
            title: data.title,
            description: data.description,
            items: data.items || [],
            totalValue: data.total_value || 0,
            status: data.status || 'ABERTO',
            notes: data.notes,
            validUntil: data.valid_until,
            linkedOrderId: data.linked_order_id,
            // Campos de Aprovação
            approvalDocument: data.approval_document,
            approvalBirthDate: data.approval_birth_date,
            approvalSignature: data.approval_signature,
            approvedByName: data.approved_by_name,
            approvedAt: data.approved_at,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            billingStatus: data.billing_status || 'PENDING',
            paymentMethod: data.payment_method,
            paidAt: data.paid_at,
            billingNotes: data.billing_notes
        };
    },

    getQuotes: async (signal?: AbortSignal): Promise<any[]> => {
        if (isCloudEnabled) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];

            const cacheKey = `quotes_${tenantId}`;
            const cached = CacheManager.get<any[]>(cacheKey);
            if (cached) return cached;

            return CacheManager.deduplicate(cacheKey, async (currentSignal) => {
                let query = supabase.from('quotes')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (currentSignal || signal) {
                    query = query.abortSignal((currentSignal || signal) as AbortSignal);
                }

                const { data, error } = await query;

                if (error) {
                    throw error;
                }
                const mapped = (data || []).map(d => QuoteService._mapQuoteFromDB(d));
                CacheManager.set(cacheKey, mapped, CacheManager.TTL.MEDIUM); // 5 min
                return mapped;
            }, signal);
        }
        return [];
    },

    /**
     * 🏗️ Nexus ID Generator (Quotes)
     */
    createQuote: async (quote: any): Promise<any> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled) {
            // 🚀 Gerador de Identificador Soberano Nexus: ORC + 2Dig Doc + YYMM + 3Dig Sequencer
            // Salvo em `display_id` (TEXT) — a PK `id` continua sendo UUID gerado pelo Postgres
            const docClean = (quote.customerDocument || '0000').replace(/\D/g, '');
            const docPart = docClean.substring(0, 2).padStart(2, '0');

            const now = new Date();
            const yy = String(now.getFullYear()).substring(2);
            const mm = String(now.getMonth() + 1).padStart(2, '0');

            // Conta orçamentos deste mês para o sequenciador
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            const { count } = await supabase.from('quotes')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tid)
                .gte('created_at', startOfMonth);

            const sequencer = String((count || 0) + 1).padStart(3, '0');
            const sovereignId = `ORC-${docPart}${yy}${mm}${sequencer}`;

            const dbPayload = {
                // Não inclui `id` — deixa o Postgres gerar o UUID automaticamente
                display_id: sovereignId,   // ← Identificador Soberano aqui
                tenant_id: tid,
                customer_name: quote.customerName,
                customer_address: quote.customerAddress,
                title: quote.title,
                description: quote.description,
                items: quote.items || [],
                total_value: quote.totalValue,
                status: quote.status || 'ABERTO',
                notes: quote.notes,
                valid_until: quote.validUntil,
                linked_order_id: quote.linkedOrderId,
                created_at: now.toISOString()
            };

            const { data, error } = await supabase.from('quotes').insert([dbPayload]).select().single();
            if (error) throw error;

            CacheManager.invalidate(`quotes_${tid}`);
            return QuoteService._mapQuoteFromDB(data);
        }
        return quote;
    },

    updateQuote: async (quote: any): Promise<any> => {
        if (isCloudEnabled) {
            const dbPayload = {
                title: quote.title,
                description: quote.description,
                items: quote.items,
                total_value: quote.totalValue,
                status: quote.status,
                notes: quote.notes,
                valid_until: quote.validUntil,
                linked_order_id: quote.linkedOrderId,
                billing_status: quote.billingStatus,
                payment_method: quote.paymentMethod,
                paid_at: quote.paidAt,
                billing_notes: quote.billingNotes,
                updated_at: new Date().toISOString()
            };

            const tid = getCurrentTenantId();
            if (!tid) throw new Error("Tenant não identificado.");

            const { data, error } = await supabase.from('quotes')
                .update(dbPayload)
                .eq('id', quote.id)
                .eq('tenant_id', tid)
                .select()
                .single();

            if (error) throw error;

            CacheManager.invalidate(`quotes_${tid}`);
            return QuoteService._mapQuoteFromDB(data);
        }
        return quote;
    },

    deleteQuote: async (id: string): Promise<boolean> => {
        if (isCloudEnabled) {
            const tid = getCurrentTenantId();
            const { error } = await supabase.from('quotes')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tid);

            if (error) throw error;
            CacheManager.invalidate(`quotes_${tid}`);
            return true;
        }
        return false;
    },

    getPublicQuoteById: async (id: string): Promise<any> => {
        if (isCloudEnabled) {
            try {
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

                let query = supabase.from('quotes').select('*');

                if (isUuid) {
                    query = query.eq('public_token', id);
                } else {
                    query = query.eq('id', id);
                }

                const { data, error } = await query.single();

                if (!error && data) {
                    return QuoteService._mapQuoteFromDB(data);
                }
            } catch (err: any) {
                if (err?.name === 'AbortError') return null;
                console.error("Erro silencioso buscar orcamento:", err);
            }
        }
        return null;
    },

    approveQuote: async (id: string, approvalData: { document: string, birthDate: string, signature: string, name: string, metadata?: any, lat?: number, lng?: number }): Promise<boolean> => {
        if (isCloudEnabled) {
            console.log(`[📝 Nexus Approve] Iniciando aprovação do orçamento ${id}...`);

            let finalSignature = approvalData.signature;
            if (finalSignature && finalSignature.startsWith('data:image')) {
                console.log(`[📝 Nexus Approve] Fazendo upload da assinatura...`);
                finalSignature = await StorageService.uploadFile(finalSignature, `quotes/${id}/signatures`);
                console.log(`[📝 Nexus Approve] Assinatura enviada com sucesso!`);
            }

            console.log(`[📝 Nexus Approve] Chamando função RPC approve_quote_public (SECURITY DEFINER)...`);

            // 🚀 USA publicSupabase (sem sessão) — a função é SECURITY DEFINER e valida o token público
            const { data, error } = await publicSupabase
                .rpc('approve_quote_public', {
                    p_quote_id: id,
                    p_document: approvalData.document,
                    p_birth_date: approvalData.birthDate,
                    p_signature: finalSignature,
                    p_name: approvalData.name,
                    p_metadata: approvalData.metadata || {},
                    p_lat: approvalData.lat,
                    p_lng: approvalData.lng
                });

            if (error) {
                console.error(`[❌ Nexus Approve] ERRO NA RPC:`, error);
                throw error;
            }

            console.log(`[✅ Nexus Approve] RPC executada com sucesso!`);

            if (data?.error) {
                throw new Error(data.error);
            }

            return true;
        }
        return false;
    },

    rejectQuote: async (id: string, rejectionData: { document: string, birthDate: string, signature: string, name: string, reason: string, metadata?: any, lat?: number, lng?: number }): Promise<boolean> => {
        if (isCloudEnabled) {
            console.log(`[🚫 Nexus Reject] Iniciando recusa do orçamento ${id}...`);

            let finalSignature = rejectionData.signature;
            if (finalSignature && finalSignature.startsWith('data:image')) {
                console.log(`[🚫 Nexus Reject] Fazendo upload da assinatura de recusa...`);
                finalSignature = await StorageService.uploadFile(finalSignature, `quotes/${id}/rejections`);
            }

            console.log(`[🚫 Nexus Reject] Chamando RPC reject_quote_public (SECURITY DEFINER)...`);

            // 🚀 USA publicSupabase (sem sessão) — a função é SECURITY DEFINER e valida o token público
            const { data, error } = await publicSupabase
                .rpc('reject_quote_public', {
                    p_quote_id: id,
                    p_document: rejectionData.document,
                    p_birth_date: rejectionData.birthDate,
                    p_signature: finalSignature,
                    p_name: rejectionData.name,
                    p_reason: rejectionData.reason,
                    p_metadata: rejectionData.metadata || {},
                    p_lat: rejectionData.lat,
                    p_lng: rejectionData.lng
                });

            if (error) {
                console.error(`[❌ Nexus Reject] ERRO NA RPC:`, error);
                throw error;
            }

            if (data?.error) {
                throw new Error(data.error);
            }

            return true;
        }
        return false;
    }
};
