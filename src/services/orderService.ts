
import { supabase, publicSupabase, ensureValidSession } from '../lib/supabase';
import { AuthService } from './authService';
import { StorageService } from './storageService';
import { getCurrentTenantId } from '../lib/tenantContext';
import { CacheManager } from '../lib/cache';
import { ServiceOrder, OrderStatus, OrderItem, ServiceVisit, VisitStatus, OrderTimelineEvent } from '../types';
import type { DbOrder, DbOrderInsert, DbOrderUpdate, DbOrderItem, DbServiceVisit } from '../types/database';
import { logger } from '../lib/logger';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const STORAGE_KEYS = { ORDERS: 'nexus_orders_v2' }; // Replication of constant



// getServiceClient() REMOVIDO — use `supabase` diretamente.
// O RLS garante o isolamento por tenant via get_user_tenant_id().
// ensureValidSession importado de lib/supabase (versão sem refresh manual).


export const OrderService = {

    // Helper para mapear ServiceOrder do Front (camelCase) para o DB (snake_case)
    _mapOrderToDB: (order: Partial<ServiceOrder>): Omit<DbOrderInsert, 'tenant_id'> => {
        return {
            title: order.title ?? '',
            description: order.description ?? '',
            customer_name: order.customerName ?? '',
            customer_address: order.customerAddress ?? '',
            status: (order.status?.toUpperCase() === 'CANCELED' ? 'CANCELADO' : order.status) as DbOrderInsert['status'],
            priority: order.priority as DbOrderInsert['priority'],
            operation_type: order.operationType,
            assigned_to: order.assignedTo,
            form_id: order.formId,
            form_data: order.formData as Record<string, unknown>,
            equipment_name: order.equipmentName,
            equipment_model: order.equipmentModel,
            equipment_serial: order.equipmentSerial,
            scheduled_date: order.scheduledDate ?? '',
            scheduled_time: order.scheduledTime,
            start_date: order.startDate,
            end_date: order.endDate,
            notes: order.notes,
            items: order.items as DbOrderItem[],
            show_value_to_client: order.showValueToClient,
            billing_status: order.billingStatus,
            payment_method: order.paymentMethod,
            paid_at: order.paidAt,
            billing_notes: order.billingNotes,
            linked_quotes: order.linkedQuotes ?? [],
            timeline: order.timeline,
            checkin_location: order.checkinLocation,
            checkout_location: order.checkoutLocation,
            pause_reason: order.pauseReason,
            updated_at: new Date().toISOString()
        };
    },

    // Helper para mapear ServiceOrder do DB (snake_case) para o Front (camelCase)
    _mapOrderFromDB: (data: DbOrder): ServiceOrder => {
        // Mapeamento extra-resiliente para garantir que nada se perca entre Snake e Camel
        return {
            id: data.id,
            displayId: data.display_id,
            publicToken: data.public_token,
            tenantId: data.tenant_id,
            title: data.title,
            description: data.description,
            customerName: data.customer_name,
            customerAddress: data.customer_address,
            status: data.status as ServiceOrder['status'],
            priority: data.priority as ServiceOrder['priority'],
            operationType: data.operation_type ?? '',
            assignedTo: data.assigned_to,
            formId: data.form_id,
            formData: OrderService.migrateSignatureData(
                (data.form_data ?? {}) as Record<string, unknown>
            ),
            equipmentName: data.equipment_name,
            equipmentModel: data.equipment_model,
            equipmentSerial: data.equipment_serial,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            scheduledDate: data.scheduled_date ?? '',
            scheduledTime: data.scheduled_time ?? '',
            startDate: data.start_date,
            endDate: data.end_date,
            notes: data.notes,
            items: (data.items ?? []) as OrderItem[],
            showValueToClient: data.show_value_to_client ?? false,
            billingStatus: data.billing_status ?? 'PENDING',
            paymentMethod: data.payment_method,
            paidAt: data.paid_at,
            billingNotes: data.billing_notes,
            timeline: data.timeline ?? {},
            checkinLocation: data.checkin_location,
            checkoutLocation: data.checkout_location,
            pauseReason: data.pause_reason
        };
    },

    /**
     * 🔄 Nexus Migration Engine (Backward Compatibility)
     * Normaliza dados de assinatura em OS antigas para o novo formato semântico.
     */
    migrateSignatureData: (formData: Record<string, any>): Record<string, any> => {
        if (!formData || Object.keys(formData).length === 0) return formData;

        const migrated = { ...formData };
        let signatureFound = false;

        // Procura por campos de assinatura com nomes antigos/genéricos
        Object.entries(formData).forEach(([key, value]) => {
            const isImage = typeof value === 'string' && value.startsWith('data:image');
            const keyLower = key.toLowerCase();

            // Se encontrou uma imagem que parece ser assinatura mas não tem nome semântico
            if (isImage && !signatureFound &&
                (keyLower.includes('assinat') || keyLower.includes('sign') ||
                    keyLower === 'signature' || !isNaN(Number(key)))) {

                // Renomeia para o padrão esperado se ainda não existir
                if (!migrated['Assinatura do Cliente']) {
                    migrated['Assinatura do Cliente'] = value;
                    signatureFound = true;

                    // Se o campo original era um ID numérico, remove para evitar duplicação
                    if (!isNaN(Number(key))) {
                        delete migrated[key];
                    }
                }
            }
        });

        // Normaliza campos de metadados de assinatura
        const nameKeys = Object.keys(migrated).filter(k => k.toLowerCase().includes('nome') && !k.toLowerCase().includes('customer'));
        const cpfKeys = Object.keys(migrated).filter(k => k.toLowerCase().includes('cpf'));
        const birthKeys = Object.keys(migrated).filter(k => k.toLowerCase().includes('nascimento') || k.toLowerCase().includes('birth'));

        if (nameKeys.length > 0 && !migrated['Assinatura do Cliente - Nome']) {
            migrated['Assinatura do Cliente - Nome'] = migrated[nameKeys[0]];
        }
        if (cpfKeys.length > 0 && !migrated['Assinatura do Cliente - CPF']) {
            migrated['Assinatura do Cliente - CPF'] = migrated[cpfKeys[0]];
        }
        if (birthKeys.length > 0 && !migrated['Assinatura do Cliente - Nascimento']) {
            migrated['Assinatura do Cliente - Nascimento'] = migrated[birthKeys[0]];
        }

        return migrated;
    },


    /**
     * 📊 Nexus Stats Engine - Lightweight Fetch
     * Fetches orders optimized for dashboard statistics (up to 5000 records).
     */
    getOrdersForStats: async (startDate?: string, endDate?: string): Promise<ServiceOrder[]> => {
        if (isCloudEnabled) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];

            // Timeout e Error Handling encapsulados
            try {
                let query = supabase
                    .from('orders')
                    .select('id, display_id, created_at, scheduled_date, status, assigned_to, end_date, customer_name, title')
                    .eq('tenant_id', tenantId)
                    .order('created_at', { ascending: false })
                    .limit(5000);

                if (startDate) query = query.gte('created_at', startDate);
                if (endDate) query = query.lte('created_at', endDate);

                const { data, error } = await query;

                if (error) {
                    console.error("❌ Erro ao buscar estatísticas:", error);
                    return [];
                }

                // Mapeamento manual otimizado
                return (data || []).map((d: Pick<DbOrder, 'id' | 'display_id' | 'status' | 'created_at' | 'scheduled_date' | 'end_date' | 'assigned_to' | 'customer_name' | 'title'>) => ({
                    id: d.id,
                    displayId: d.display_id,
                    status: d.status as ServiceOrder['status'],
                    createdAt: d.created_at,
                    scheduledDate: d.scheduled_date,
                    endDate: d.end_date,
                    assignedTo: d.assigned_to,
                    customerName: d.customer_name,
                    title: d.title,
                    // Campos obrigatórios do tipo ServiceOrder preenchidos com defaults
                    tenantId: tenantId,
                    description: '',
                    customerAddress: '',
                    priority: 'MÉDIA' as ServiceOrder['priority'],
                    operationType: '',
                    items: [],
                    showValueToClient: false,
                    billingStatus: 'PENDING' as const
                } as ServiceOrder));
            } catch (e) {
                console.error("Nexus Stats Error:", e);
                return [];
            }
        }
        return [];
    },

    getOrders: async (): Promise<ServiceOrder[]> => {
        if (isCloudEnabled) {
            const MAX_RETRIES = 2;

            for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
                try {
                    // 🛡️ Session Guard: Validate/refresh token BEFORE the query
                    const sessionOk = await ensureValidSession();
                    if (!sessionOk) {
                        console.error(`❌ [getOrders] Attempt ${attempt + 1}: Session inválida.`);
                        if (attempt < MAX_RETRIES - 1) {
                            await new Promise(r => setTimeout(r, 1500));
                            continue;
                        }
                        throw new Error('SESSION_EXPIRED_AUTH');
                    }

                    let tenantId = getCurrentTenantId();
                    if (!tenantId) {
                        throw new Error('SESSION_EXPIRED_NO_TENANT');
                    }

                    console.log(`📡 Nexus DataSync: Buscando Ordens (tentativa ${attempt + 1})...`);

                    // 🛡️ Timeout Protection: 20s
                    const controller = new AbortController();
                    const timeoutId = setTimeout(() => controller.abort(), 20000);

                    const { data, error } = await supabase.from('orders')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .order('created_at', { ascending: false })
                        .limit(100)
                        .abortSignal(controller.signal);

                    clearTimeout(timeoutId);

                    if (error) {
                        // 🔒 Check for auth/session errors
                        if (error.message?.includes('JWT') ||
                            error.message?.includes('expired') ||
                            error.message?.includes('auth') ||
                            error.code === 'PGRST301') {

                            if (attempt < MAX_RETRIES - 1) {
                                // ⚠️ NÃO chamar refreshSession() manualmente — causa race condition
                                // com autoRefreshToken do SDK e invalida o refresh token.
                                // Aguarda o SDK renovar automaticamente e tenta novamente.
                                await new Promise(r => setTimeout(r, 2000));
                                continue;
                            }
                            throw new Error('SESSION_EXPIRED_AUTH');
                        }
                        throw error;
                    }

                    if (data && data.length > 0) {
                        console.log('🔍 DEBUG_DB_COLUMNS: Banco retornou as colunas:', Object.keys(data[0]));
                    }
                    const mapped = (data || []).map(d => OrderService._mapOrderFromDB(d));

                    // Atualiza cache local silenciosamente
                    localStorage.setItem(STORAGE_KEYS.ORDERS, JSON.stringify(mapped));

                    return mapped;

                } catch (err: any) {
                    if (err?.name === 'AbortError') {
                        if (attempt < MAX_RETRIES - 1) continue;
                        return [];
                    }
                    // Generic error on last attempt
                    if (attempt >= MAX_RETRIES - 1) {
                        console.error("❌ Erro ao buscar ordens:", err.message);
                        const cached = localStorage.getItem(STORAGE_KEYS.ORDERS);
                        if (cached) {
                            console.warn("⚠️ Usando dados em cache devido a erro.");
                            return JSON.parse(cached);
                        }
                        return [];
                    }
                }
            }
            return [];
        }
        return [];
    },

    /**
     * 🚀 Nexus Paginated Orders - Server-Side Pagination
     */
    getOrdersPaginated: async (
        page: number = 1,
        limit: number = 5,
        technicianId?: string,
        filters?: { status?: OrderStatus; startDate?: string; endDate?: string }
    ): Promise<{ orders: ServiceOrder[]; total: number }> => {
        if (isCloudEnabled) {
            const tenantId = getCurrentTenantId();

            if (!tenantId) {
                console.warn("⚠️ Tenant ID não encontrado.");
                return { orders: [], total: 0 };
            }

            const from = (page - 1) * limit;
            const to = from + limit - 1;

            let query = supabase
                .from('orders')
                .select('*', { count: 'exact' })
                .eq('tenant_id', tenantId);

            // Filtra por técnico se especificado
            if (technicianId) {
                query = query.eq('assigned_to', technicianId);
            }

            // 🔍 Filtros Avançados
            if (filters?.status && filters.status !== 'ALL' as any) {
                query = query.eq('status', filters.status);
            }
            if (filters?.startDate) {
                query = query.gte('scheduled_date', filters.startDate); // ou created_at
            }
            if (filters?.endDate) {
                query = query.lte('scheduled_date', filters.endDate);
            }

            const { data, error, count } = await query
                .order('created_at', { ascending: false })
                .range(from, to);

            if (error) {
                console.error("❌ Erro ao buscar ordens paginadas:", error.message);
                return { orders: [], total: 0 };
            }

            const mapped = (data || []).map(d => OrderService._mapOrderFromDB(d));
            return { orders: mapped, total: count || 0 };
        }

        return { orders: [], total: 0 };
    },

    createOrder: async (order: Omit<ServiceOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceOrder> => {
        // 🛡️ Nexus Timeout Protection (20s)
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_20S')), 20000));

        try {
            const createFlow = (async () => {
                const tid = getCurrentTenantId();

                if (!tid) {
                    throw new Error("Tenant ID não encontrado.");
                }

                if (isCloudEnabled) {
                    console.log("🚀 DEBUG_V3_DIRECT_DB: Iniciando criação de OS...");

                    // 1. GERAR ID SEQUENCIAL (RPC)
                    const { data: seqNum, error: seqError } = await supabase.rpc('get_next_order_id', {
                        p_tenant_id: tid
                    });

                    if (seqError) {
                        console.error("❌ Erro RPC get_next_order_id:", seqError);
                        throw new Error(`Falha ao gerar número da OS (RPC): ${seqError.message}`);
                    }

                    // 2. OBTER PREFIXO DO TENANT
                    const { data: tenantData } = await supabase
                        .from('tenants')
                        .select('os_prefix')
                        .eq('id', tid)
                        .single();

                    const prefix = tenantData?.os_prefix || 'OS-';
                    const protocol = `${prefix}${seqNum}`;

                    // 3. PREPARAR PAYLOAD (Mapeamento snake_case)
                    const dbPayload = {
                        ...OrderService._mapOrderToDB(order),
                        display_id: protocol, // Protocolo formatado
                        tenant_id: tid,
                        created_at: new Date().toISOString()
                    };

                    // 4. INSERIR NO BANCO
                    const { data: insertedData, error: insertError } = await supabase
                        .from('orders')
                        .insert(dbPayload)
                        .select()
                        .single();

                    if (insertError) {
                        console.error("❌ Erro ao inserir OS:", insertError);
                        throw new Error(`Falha no banco de dados: ${insertError.message}`);
                    }

                    return OrderService._mapOrderFromDB(insertedData);
                }
                throw new Error('Cloud required for creating orders.');
            })();

            return await Promise.race([createFlow, timeoutPromise]) as ServiceOrder;

        } catch (err: any) {
            if (err.message === 'TIMEOUT_20S') {
                throw new Error("O servidor demorou muito para processar a criação. Verifique sua conexão e tente novamente.");
            }
            throw err;
        }
    },

    updateOrder: async (updatedOrder: ServiceOrder): Promise<ServiceOrder> => {
        if (isCloudEnabled) {
            // 🛡️ Nexus Timeout Protection (15s)
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT_15S')), 15000));

            try {
                const updatePromise = (async () => {
                    const dbPayload = OrderService._mapOrderToDB(updatedOrder);

                    const tid = getCurrentTenantId();
                    if (!tid) throw new Error("Tenant não identificado.");

                    const { data, error } = await supabase.from('orders')
                        .update(dbPayload)
                        .eq('id', updatedOrder.id)
                        .eq('tenant_id', tid)
                        .select()
                        .single();

                    if (error) throw error;
                    return OrderService._mapOrderFromDB(data);
                })();

                return await Promise.race([updatePromise, timeoutPromise]) as ServiceOrder;

            } catch (err: any) {
                if (err.message === 'TIMEOUT_15S') {
                    throw new Error("O sistema demorou muito para responder. Verifique sua conexão e tente novamente.");
                }
                throw err;
            }
        }
        return updatedOrder;
    },

    updateOrderStatus: async (id: string, status: OrderStatus, notes?: string, data?: any, items?: OrderItem[]): Promise<void> => {
        if (!isCloudEnabled) return;

        let processedData = data;

        // 1. Processamento de Imagens (Opcional - usando StorageService agora)
        if (data && typeof data === 'object') {
            processedData = { ...data };

            const safeUpload = async (base64: string): Promise<string> => {
                const timeout = new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000));
                try {
                    const result = await Promise.race([StorageService.uploadFile(base64, `orders/${id}/evidence`), timeout]);
                    return result as string;
                } catch (err) {
                    console.error("Upload falhou ou timeout:", err);
                    return '[FALHA_NO_UPLOAD - TENTE NOVAMENTE]';
                }
            };

            for (const [key, value] of Object.entries(processedData)) {
                if (typeof value === 'string' && value.startsWith('data:image')) {
                    processedData[key] = await safeUpload(value);
                } else if (Array.isArray(value)) {
                    const newArray = [];
                    for (const item of value) {
                        newArray.push((typeof item === 'string' && item.startsWith('data:image')) ? await safeUpload(item) : item);
                    }
                    processedData[key] = newArray;
                }
            }
        }

        // 2. Preparação do Payload
        const updatePayload: DbOrderUpdate = {
            status,
            updated_at: new Date().toISOString()
        };

        if (notes !== undefined) updatePayload.notes = notes;
        if (processedData !== undefined) updatePayload.form_data = processedData as Record<string, unknown>;
        if (items !== undefined) updatePayload.items = items as DbOrderItem[];

        if (status === OrderStatus.IN_PROGRESS) {
            updatePayload.start_date = new Date().toISOString();
        } else if (status === OrderStatus.COMPLETED || status === OrderStatus.BLOCKED) {
            updatePayload.end_date = new Date().toISOString();
        }

        // 📍 Tratamento Especial para Campos de Fluxo (Extrai de 'data' se vier misturado)
        if (processedData) {
            const specialFields = ['timeline', 'checkinLocation', 'checkoutLocation', 'pauseReason'];

            if (processedData.timeline) {
                updatePayload.timeline = processedData.timeline;
                delete processedData.timeline;
            }
            if (processedData.checkinLocation) {
                updatePayload.checkin_location = processedData.checkinLocation;
                delete processedData.checkinLocation;
            }
            if (processedData.checkoutLocation) {
                updatePayload.checkout_location = processedData.checkoutLocation;
                delete processedData.checkoutLocation;
            }
            if (processedData.pauseReason) {
                updatePayload.pause_reason = processedData.pauseReason;
                delete processedData.pauseReason;
            }
        }

        // 3. Sync Database
        const tid = getCurrentTenantId();

        const dbPromise = supabase.from('orders').update(updatePayload)
            .eq('id', id)
            .eq('tenant_id', tid);

        const timeoutPromise = new Promise<{ error: any }>((_, reject) =>
            setTimeout(() => reject(new Error("Database Request Timeout")), 10000)
        );

        const { error } = await Promise.race([dbPromise, timeoutPromise]) as any;

        if (error) {
            throw {
                message: "Erro ao salvar no Banco de Dados",
                code: error.code,
                pg_message: error.message
            };
        }
    },

    getPublicOrderById: async (id: string, retryCount = 0): Promise<ServiceOrder | null> => {
        if (isCloudEnabled) {
            // 🛡️ ESTRATÉGIA 1: Tentar RPC Seguro (Ideal)
            try {
                const { data, error } = await publicSupabase.rpc('get_public_order', { search_term: id });

                if (!error && data && (Array.isArray(data) ? data.length > 0 : true)) {
                    const orderData = Array.isArray(data) ? data[0] : data;
                    return OrderService._mapOrderFromDB(orderData);
                }

            } catch (err: any) {
                if (err?.name === 'AbortError' || err?.message?.includes('Lock')) {
                    if (retryCount < 3) {
                        await new Promise(r => setTimeout(r, 1000 + (retryCount * 500)));
                        return OrderService.getPublicOrderById(id, retryCount + 1);
                    }
                }
            }

            // 🔄 ESTRATÉGIA 2: Fallback - Admin Bypassing RLS
            try {
                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id) ||
                    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

                let query = supabase.from('orders').select('*');

                if (isUuid) {
                    query = query.eq('public_token', id);
                } else {
                    query = query.eq('id', id);
                }

                const { data, error } = await query.single();
                if (error || !data) return null;
                return OrderService._mapOrderFromDB(data);
            } catch (fallbackErr) {
                return null;
            }
        }
        return null;
    },

    subscribeToOrders: (onUpdate: () => void) => {
        if (!isCloudEnabled) return { unsubscribe: () => { } };

        let channel: ReturnType<typeof supabase.channel> | null = null;
        let isActive = true;
        let reconnectAttempts = 0;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

        const connect = async () => {
            if (!isActive) return;

            const tenantId = getCurrentTenantId();
            if (!tenantId) return;

            await ensureValidSession();

            channel = supabase
                .channel(`orders-live-${tenantId}`)
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'orders', filter: `tenant_id=eq.${tenantId}` },
                    (payload) => {
                        if (!isActive) return;
                        onUpdate();
                    }
                )
                .subscribe(async (status) => {
                    if (!isActive) return;
                    if (status === 'SUBSCRIBED') {
                        reconnectAttempts = 0;
                    }
                    if (status === 'CHANNEL_ERROR' || status === 'CLOSED' || status === 'TIMED_OUT') {
                        if (reconnectAttempts < 5) {
                            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
                            reconnectAttempts++;
                            reconnectTimer = setTimeout(async () => {
                                if (channel) await supabase.removeChannel(channel).catch(() => { });
                                connect();
                            }, delay);
                        }
                    }
                });
        };

        connect();

        return {
            unsubscribe: () => {
                isActive = false;
                if (reconnectTimer) clearTimeout(reconnectTimer);
                if (channel) supabase.removeChannel(channel).catch(() => { });
            }
        };
    },

    // =========================================================================
    // SERVIÇOS DE VISITAS (SERVICE VISITS)
    // =========================================================================

    _mapVisitFromDB: (data: DbServiceVisit): ServiceVisit => {
        return {
            id: data.id,
            tenantId: data.tenant_id,
            orderId: data.order_id,
            technicianId: data.technician_id,
            status: data.status as VisitStatus,
            pauseReason: data.pause_reason,
            scheduledDate: data.scheduled_date,
            scheduledTime: data.scheduled_time,
            arrivalTime: data.arrival_time,
            departureTime: data.departure_time,
            notes: data.notes,
            createdBy: data.created_by,
            createdAt: data.created_at,
            updatedAt: data.updated_at
        };
    },

    /**
     * Pausa a visita atual de uma Ordem de Serviço.
     * Deve ser chamada pelo app do técnico.
     */
    pauseVisit: async (visitId: string, orderId: string, reason: string): Promise<void> => {
        if (!isCloudEnabled) return;
        const tenantId = getCurrentTenantId();
        if (!tenantId) throw new Error("Tenant não identificado.");

        // 1. Atualizar Visita para pausada
        const { error: visitError } = await supabase.from('service_visits')
            .update({
                status: 'paused',
                pause_reason: reason,
                departure_time: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
            .eq('id', visitId)
            .eq('tenant_id', tenantId);

        if (visitError) throw new Error(`Erro ao pausar visita: ${visitError.message}`);

        // 2. Atualizar OS para pausada (Status macro)
        const { error: orderError } = await supabase.from('orders')
            .update({
                status: 'PAUSADO',
                pause_reason: reason,
                updated_at: new Date().toISOString()
            })
            .eq('id', orderId)
            .eq('tenant_id', tenantId);

        if (orderError) throw new Error(`Erro ao atualizar status da OS: ${orderError.message}`);
    },

    /**
     * Cria uma nova visita para uma OS existente.
     * Utilizado pelo Admin para reagendamento após pausa ou retorno.
     */
    scheduleNewVisit: async (orderId: string, technicianId: string, date: string, time?: string, notes?: string): Promise<ServiceVisit> => {
        if (!isCloudEnabled) throw new Error("Apenas operações na nuvem suportadas.");
        const tenantId = getCurrentTenantId();
        if (!tenantId) throw new Error("Tenant não identificado.");

        // Buscar usuário atual (Criador)
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id;

        const { data, error } = await supabase.from('service_visits')
            .insert([{
                tenant_id: tenantId,
                order_id: orderId,
                technician_id: technicianId,
                status: 'pending',
                scheduled_date: date,
                scheduled_time: time,
                notes: notes,
                created_by: userId
            }])
            .select()
            .single();

        if (error) throw new Error(`Erro ao agendar nova visita: ${error.message}`);

        // Também pode querer alterar a OS de volta para alguma prioridade ou status pendente
        await supabase.from('orders').update({ updated_at: new Date().toISOString() }).eq('id', orderId);

        return OrderService._mapVisitFromDB(data);
    },

    /**
     * Busca o histórico cronológico de uma OS, suas visitas e interrupções (RPC)
     */
    getOrderTimeline: async (orderId: string): Promise<OrderTimelineEvent[]> => {
        if (!isCloudEnabled) return [];
        const tenantId = getCurrentTenantId();
        if (!tenantId) return [];

        const { data, error } = await supabase.rpc('get_order_timeline', {
            p_order_id: orderId,
            p_tenant_id: tenantId
        });

        if (error) {
            console.error("Erro ao carregar timeline:", error);
            return [];
        }

        return (data || []).map((event: any) => ({
            eventId: event.event_id,
            eventType: event.event_type,
            eventDate: event.event_date,
            userId: event.user_id,
            userName: event.user_name,
            details: event.details
        }));
    }
};
