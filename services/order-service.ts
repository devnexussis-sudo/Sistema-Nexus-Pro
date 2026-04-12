import { OrderStatus, ServiceOrder } from '@/constants/mock-data';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system';
import { authService } from './auth-service';
import { appLifecycle } from './app-lifecycle';
import { CacheService } from './cache-service';
import { logger } from './logger';
import { BUCKET_NAME, supabase } from './supabase';

const DISK_CACHE_FORM_TEMPLATES = '@nexus_form_templates';
const DISK_CACHE_ACTIVATION_RULES = '@nexus_activation_rules';
const DISK_CACHE_SERVICE_TYPES = '@nexus_service_types';

// Polyfill for arrayBuffer if needed, or assume ArrayBuffer global exists.
// Ideally we install base64-arraybuffer: npm install base64-arraybuffer

// Types for Dynamic Forms
export enum FormFieldType {
    TEXT = 'TEXT',
    LONG_TEXT = 'LONG_TEXT',
    SELECT = 'SELECT',
    PHOTO = 'PHOTO',
    SIGNATURE = 'SIGNATURE'
}

export interface FormFieldCondition {
    fieldId: string;
    value: string;
    operator?: 'equals' | 'not_equals';
}

export interface FormField {
    id: string;
    label: string;
    type: FormFieldType;
    required: boolean;
    options?: string[];
    condition?: FormFieldCondition;
}

export interface FormTemplate {
    id: string;
    title: string;
    targetType?: string;
    targetFamily?: string;
    serviceTypes?: string[];
    fields: FormField[];
    active: boolean;
}

export interface ActivationRule {
    id: string;
    formId: string;
    serviceTypeId?: string;
    equipmentFamily?: string;
    active: boolean;
}

export interface OrderItem {
    id?: string;
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
    fromStock?: boolean;
    stockItemId?: string;
    equipmentId?: string;
    equipmentName?: string;
    equipmentSerial?: string;
}

export interface ExtendedServiceOrder extends ServiceOrder {
    items?: OrderItem[];
    executionDetails?: {
        technicalReport: string;
        partsUsed: string;
        photos: string[];
        signature: string | null;
    };
    blockReason?: string;
    tenantId?: string;
    type?: string;
    priority?: string;
    displayId?: string; // Short ID for display
    rawStatus?: string;
    formId?: string;
    formData?: any; // The initial form data from opening
    operationType?: string;
    equipmentModel?: string;
    equipmentSerial?: string;
    equipmentFamily?: string;
    scheduledDate?: string;
    scheduledTime?: string;
    equipments?: any[];
    publicToken?: string;
    startedDate?: string;
    completedDate?: string;
    videoUrl?: string | null;
    title?: string;
    rawDescription?: string;
    visitCount?: number;
}

export class OrderService {

    public static async uploadFile(uri: string, folder: string, manualTenantId?: string, contentType?: string): Promise<string | null> {
        try {
            console.log(`[OrderService] 📤 Iniciando upload. URI local: ${uri.substring(0, 60)}...`);

            // 1. Obter Tenant ID para bater com a estrutura do Storage do Admix
            let tenantId = manualTenantId;

            if (!tenantId) {
                const userId = authService.getCurrentUserId();
                if (userId) {
                    const { data } = await supabase.from('users').select('tenant_id').eq('id', userId).single();
                    tenantId = data?.tenant_id;
                }
            }

            console.log(`[OrderService] 🏢 Tenant detectado para upload: ${tenantId || 'N/A'}`);

            const cleanFolder = folder.replace(/^\/+/, '').replace(/\/+$/, '');
            const finalFolder = tenantId ? `${tenantId}/${cleanFolder}` : cleanFolder;

            // Determinar extensão pelo contentType
            let ext = 'webp';
            if (contentType) {
                if (contentType.includes('video/mp4')) ext = 'mp4';
                else if (contentType.includes('image/jpeg')) ext = 'jpg';
                else if (contentType.includes('image/png')) ext = 'png';
            }

            const fileName = `${finalFolder}/${Date.now()}_${Math.random().toString(36).substring(7)}.${ext}`.replace(/\/+/g, '/');

            // 2. Obter os dados base64 (Lidando com arquivos locais ou Data URIs de assinatura)
            let base64: string;

            if (uri.startsWith('data:')) {
                console.log(`[OrderService] 📝 Processando Data URI (Assinatura)...`);
                base64 = uri.split(',')[1];
            } else {
                const fileUri = (uri.startsWith('/') && !uri.startsWith('file://')) ? `file://${uri}` : uri;
                base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: 'base64' });
            }

            if (!base64 || base64.length === 0) {
                console.error(`[OrderService] ❌ Erro: Base64 vazio para URI: ${uri.substring(0, 50)}...`);
                return null;
            }

            // 3. Converter base64 para ArrayBuffer usando decode importado
            const arrayBuffer = decode(base64);
            console.log(`[OrderService] 📦 Buffer criado: ${(arrayBuffer.byteLength / 1024).toFixed(1)} KB para ${fileName}`);

            // 4. Upload para o Supabase
            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(fileName, arrayBuffer, {
                    contentType: contentType || 'image/webp',
                    upsert: false
                });

            if (error) {
                console.error(`[OrderService] ❌ Erro no Upload Supabase:`, JSON.stringify(error, null, 2));
                logger.log(`Upload error: ${error.message}`, 'error');
                return null;
            }

            console.log(`[OrderService] ✅ Upload concluído com sucesso: ${fileName}`);

            // 5. Gerar URL Pública Estritamente como o Admix espera
            const { data: { publicUrl } } = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(fileName);

            console.log(`[OrderService] 🔗 URL Gerada: ${publicUrl}`);
            return publicUrl;
        } catch (error) {
            console.error(`[OrderService] 💥 Exceção Fatal no Upload:`, error);
            logger.log(`Upload exception: ${error}`, 'error');
            return null;
        }
    }

    /**
     * Remove silenciosamente o arquivo do Supabase Storage com validação arquitetural e blindagem multitenant.
     * @param publicUrl O link público da mídia gerado pelo previewer.
     */
    public static async deleteFile(publicUrl: string): Promise<boolean> {
        try {
            if (!publicUrl) return false;

            // 1. Extração Segura Analítica via Object Proxy
            let urlObj: URL;
            try {
                urlObj = new URL(publicUrl);
            } catch {
                console.warn('[OrderService] ⚠️ URL inválida para exclusão:', publicUrl);
                return false;
            }

            // Suporta links do tipo public, sign, ou authenticated (Bypass de hardcodes vulneráveis)
            const regex = new RegExp(`\\/storage\\/v1\\/object\\/(?:public|sign|authenticated)\\/${BUCKET_NAME}\\/(.+)`);
            const match = urlObj.pathname.match(regex);
            
            if (!match) {
                console.warn('[OrderService] ⚠️ URL não corresponde ao padrão do bucket local:', publicUrl);
                return false;
            }

            // Recuperamos inteiramente o Path limpo da engrenagem do supabase.
            const storagePath = decodeURIComponent(match[1]);

            if (!storagePath) {
                return false;
            }

            // 2. Segurança: Validar Tenant Ownership e Exclusões Inativas
            const userId = authService.getCurrentUserId();
            if (!userId) {
                console.warn('[OrderService] 🚫 Usuário não autenticado. Exclusão de mídia abortada.');
                return false;
            }
            
            const { data: userRow, error: userError } = await supabase.from('users').select('tenant_id').eq('id', userId).single();
            const tenantId = userRow?.tenant_id;

            if (userError) {
                 console.error('[OrderService] ⚠️ Falha ao checar validações de segurança da role corrente:', userError);
                 return false;
            }

            // Firewall: Bloqueio estrito de colisão Cross-Tenant na lixeira
            if (tenantId && !storagePath.startsWith(`${tenantId}/`)) {
                console.error(`[OrderService] 🚨 Tentativa detectada de exclusão CROSS-TENANT. Abortado! Target: ${storagePath}, Owner: ${tenantId}`);
                return false;
            }

            // 3. Obter token fresco para a Edge Function (o SDK nem sempre envia automaticamente no React Native)
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.access_token) {
                console.warn('[OrderService] 🚫 Sem sessão ativa para chamar Edge Function. Abortando.');
                return false;
            }

            // 4. Execução Física com Retry de Resiliência Automático via Edge Function (Service Role)
            const maxAttempts = 3;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                console.log(`[OrderService] 🗑️ [Tentativa ${attempt}/${maxAttempts}] API Edge Function (Service Role): ${storagePath}`);
                try {
                    const { data, error } = await supabase.functions.invoke('delete-storage-file', {
                        body: { bucket: BUCKET_NAME, path: storagePath },
                        headers: {
                            Authorization: `Bearer ${session.access_token}`
                        }
                    });

                    if (error) {
                        // Extrair o corpo real da resposta do Edge Function (o SDK esconde dentro de error.context)
                        let errorBody: any = null;
                        try {
                            if (error.context && typeof error.context.json === 'function') {
                                errorBody = await error.context.json();
                            } else if (error.context && typeof error.context.text === 'function') {
                                const raw = await error.context.text();
                                errorBody = raw;
                            }
                        } catch { /* response body already consumed or unavailable */ }

                        console.error(`[OrderService] ❌ Edge Function erro (tentativa ${attempt}/${maxAttempts}):`, error.message);
                        console.error(`[OrderService] 📋 Corpo real da resposta Edge:`, JSON.stringify(errorBody));

                        // Se o erro interno revelou rejeição de segurança (401/403), não adianta retry
                        if (errorBody?.code === 401 || errorBody?.code === 403) {
                            console.warn(`[OrderService] 🚫 Rejeição definitiva da Edge (Code ${errorBody.code}): ${errorBody.error}`);
                            return false;
                        }

                        if (attempt === maxAttempts) throw error;
                        await new Promise(r => setTimeout(r, 1000 * attempt));
                        continue;
                    }

                    if (data?.error || data?.success === false) {
                         // Erros retornados pelo nosso script interno da Edge Function
                         console.warn(`[OrderService] ⚠️ Rejeição da Edge Function: Code [${data.code}] -> ${data.error}`, data);
                         if (data.code === 403) {
                             logger.log({ action: 'DELETE_STORAGE_DENIED', target: storagePath, reason: 'CROSS_TENANT_VIOLATION' }, 'error');
                         }
                         return false; 
                    }

                    console.log(`[OrderService] ✅ Mídia removida fisicamente e permanente via Edge Admin: ${storagePath}`);
                    // 5. Auditoria Formal
                    logger.log({ action: 'DELETE_STORAGE_SUCCESS', target: storagePath, executor: userId }, 'info');
                    return true;
                } catch (netErr: any) {
                    if (attempt === maxAttempts) throw netErr; // Fallback para a Fila Offline
                    await new Promise(r => setTimeout(r, 1000 * attempt));
                }
            }

            return false;
        } catch (error) {
            console.error(`[OrderService] 💥 Engine de Exclusão Corrompida (Rede/Fatal):`, error);
            
            // 6. Estratégia de Limpeza de Órfãos:
            // A internet caiu totalmente nas 3 tentativas. Adicionamos na Persistent Offline Queue.
            // Quando a rede voltar, o app-lifecycle cuidará de fazer o Trash Cleanup.
            if (publicUrl) {
               console.log(`[OrderService] 📦 Escalonando exclusão órfã para a Fila Offline...`);
               appLifecycle.queueOfflineAction('CLEANUP_ORPHAN_FILE', { publicUrl }, `del_${Date.now()}`);
            }
            
            return false;
        }
    }

    /**
     * Helper direto para o Processador Offline Limpar Sem Loop infinito
     */
    public static async deleteFileExact(publicUrl: string): Promise<boolean> {
        // Redireciona com chamada original evitando enfileirar novamente em caso de falha absoluta
        return await this.deleteFile(publicUrl);
    }

    public static mapDbOrderToApp(dbOrder: any): ExtendedServiceOrder {
        // Map status
        let status: OrderStatus = 'pending';
        switch (dbOrder.status?.toUpperCase()) {
            case 'PENDENTE':
            case 'ABERTA':
            case 'ABERTO':
            case 'NOVA':
                status = 'pending'; break;
            case 'ATRIBUÍDO':
                status = 'assigned'; break;
            case 'EM DESLOCAMENTO':
                status = 'traveling'; break;
            case 'EM ANDAMENTO':
                status = 'in_progress'; break;
            case 'CONCLUÍDO':
                status = 'completed'; break;
            case 'CANCELADO':
                status = 'canceled'; break;
            case 'IMPEDIDO':
                status = 'blocked'; break;
            default: status = 'pending';
        }

        // Map execution details from form_data
        const details = dbOrder.form_data || {};
        const executionDetails = (status === 'completed') ? {
            technicalReport: details.technical_report || details.technicalReport || '',
            partsUsed: details.parts_used || details.partsUsed || '',
            photos: details.photos || [],
            signature: dbOrder.signature_url
        } : undefined;

        // Auto-format ID for display
        let displayId = dbOrder.id;

        // Priority 1: User specified columns (display_id + sequence_number)
        if (dbOrder.display_id || dbOrder.sequence_number) {
            const prefix = dbOrder.display_id ? String(dbOrder.display_id) : '';
            const seq = dbOrder.sequence_number ? String(dbOrder.sequence_number) : '';
            if (seq && prefix.includes(seq)) displayId = prefix;
            else displayId = `${prefix}${seq}`;
        }
        else if (dbOrder.id && dbOrder.id.length > 20) {
            displayId = `OS-${dbOrder.id.substring(0, 8).toUpperCase()}`;
        }

        // Map functional dates
        const completedDate = dbOrder.end_date;
        const startedDate = dbOrder.start_date;
        const blockedDate = status === 'blocked' ? dbOrder.updated_at : undefined;

        // Choose which date to display as the main "date" in UI based on status
        let displayDateRaw = dbOrder.scheduled_date;
        let useUTC = true; // Default for date-only strings from DB

        if (status === 'completed' && completedDate) {
            displayDateRaw = completedDate;
            useUTC = false; // Timestamps should be local
        } else if (status === 'blocked' && dbOrder.updated_at) {
            displayDateRaw = dbOrder.updated_at;
            useUTC = false; // Timestamps should be local
        }

        const dateFormatted = displayDateRaw
            ? new Date(displayDateRaw).toLocaleDateString('pt-BR', useUTC ? { timeZone: 'UTC' } : undefined)
            : 'Data n/d';

        let visitCount = 0;
        if (dbOrder.service_visits && Array.isArray(dbOrder.service_visits)) {
            // PostgREST count query returns [{count: N}], regular select returns array of objects
            visitCount = dbOrder.service_visits.length > 0 && typeof dbOrder.service_visits[0].count === 'number' 
                ? dbOrder.service_visits[0].count 
                : dbOrder.service_visits.length;
        }

        return {
            id: dbOrder.id,
            tenantId: dbOrder.tenant_id,
            customer: dbOrder.customer_name || 'Cliente Desconhecido',
            customerPhone: (() => {
                // Supabase joins can come in various shapes depending on relationship naming
                const rel = dbOrder.customers || dbOrder.customer;
                if (!rel) return dbOrder.customer_phone || '';
                const c = Array.isArray(rel) ? rel[0] : rel;
                return c?.whatsapp || c?.phone || dbOrder.customer_phone || '';
            })(),
            address: dbOrder.customer_address || 'Endereço não informado',
            date: dateFormatted,
            status: status,
            description: dbOrder.title + (dbOrder.description ? `\n${dbOrder.description}` : ''),
            equipment: dbOrder.equipment_name || dbOrder.equipment_model || 'Não informado',
            serialNumber: dbOrder.equipment_serial || '---',
            equipmentModel: dbOrder.equipment_model,
            equipmentSerial: dbOrder.equipment_serial,
            problemReason: '',
            executionDetails: executionDetails,
            blockReason: ((status === 'canceled' || status === 'blocked') && (dbOrder.block_reason || details.blockReason)) ? (dbOrder.block_reason || details.blockReason) : undefined,
            type: dbOrder.operation_type || dbOrder.type,
            operationType: dbOrder.operation_type,
            items: (dbOrder.items || []) as OrderItem[],
            priority: dbOrder.priority,
            displayId: displayId,
            publicToken: dbOrder.public_token,
            formId: dbOrder.form_id,
            formData: dbOrder.form_data,
            scheduledDate: dbOrder.scheduled_date,
            scheduledTime: dbOrder.scheduled_time,
            startedDate: startedDate,
            completedDate: completedDate,
            rawStatus: dbOrder.status,
            videoUrl: dbOrder.video_url || null,
            title: dbOrder.title,
            rawDescription: dbOrder.description,
            visitCount: visitCount,
        };
    }

    static async getOrderById(id: string, forceRefresh = false): Promise<ExtendedServiceOrder | undefined> {
        try {
            const cacheKey = `order_details_${id}`;
            const cached = await CacheService.get<ExtendedServiceOrder>(cacheKey);
            if (cached && !forceRefresh) return cached;

            return await CacheService.fetcher(cacheKey, async () => {
                const { data, error } = await supabase
                    .from('orders')
                    .select('*, customers(*), service_visits(id)')
                    .eq('id', id)
                    .single();

                if (error || !data) {
                    logger.log(`Error fetching order ${id}: ${error?.message}`, 'error');
                    return undefined;
                }

                const { data: equipmentsData } = await supabase.rpc('nexus_get_order_equipments', { p_order_id: id });
                const equipmentsList = Array.isArray(equipmentsData) ? equipmentsData : (equipmentsData ? [equipmentsData] : []);

                const mapped = this.mapDbOrderToApp(data);
                mapped.equipments = equipmentsList;

                await CacheService.set(cacheKey, mapped, CacheService.TTL.APP);
                return mapped;
            });
        } catch (error) {
            logger.log(`Exception fetching order: ${error}`, 'error');
            return undefined;
        }
    }

    static async getAllOrders(options: {
        page?: number;
        pageSize?: number;
        statusFilter?: OrderStatus | 'all';
        startDate?: Date;
        endDate?: Date;
        forceRefresh?: boolean;
    } = {}): Promise<{ orders: ExtendedServiceOrder[], total: number, stats: Record<string, number> }> {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || authService.getCurrentUserId();
        if (!userId) {
            logger.log('Cannot fetch orders: No user logged in', 'warn');
            return { orders: [], total: 0, stats: {} };
        }

        const { page = 1, pageSize = 100, statusFilter = 'all', startDate, endDate, forceRefresh = false } = options;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const cacheKey = `orders_${userId}_${statusFilter}_${startDate?.getTime() || 0}_${endDate?.getTime() || 0}_${page}`;

        const cached = await CacheService.get<any>(cacheKey);
        if (cached && !forceRefresh) return cached;

        return await CacheService.fetcher(cacheKey, async () => {
            const formatLocalISO = (date: Date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };

            // Range adjustment: To catch everything in Brazil (-3h) for a given local day, 
            // we search from 00:00 UTC of that day until 02:59:59 UTC of the NEXT day.
            const nextDay = endDate ? new Date(endDate.getTime() + 24 * 60 * 60 * 1000) : null;
            const getStartDateStr = (col: string) => {
                if (!startDate) return null;
                return (col === 'end_date' || col === 'updated_at') ? `${formatLocalISO(startDate)}T00:00:00Z` : formatLocalISO(startDate);
            };
            const getEndDateStr = (col: string) => {
                if (!endDate) return null;
                return (col === 'end_date' || col === 'updated_at') ? `${formatLocalISO(nextDay!)}T02:59:59Z` : formatLocalISO(endDate);
            };

            // Helper to get which date column to filter by based on status
            const getDateCol = (statusFilterKey: string) => {
                switch (statusFilterKey) {
                    case 'completed': return 'end_date';
                    case 'blocked': return 'updated_at'; // Impeded follows block date
                    case 'in_progress': return 'scheduled_date';
                    default: return 'scheduled_date';
                }
            };

            // 1. Get User Profile for Role Check
            const { data: userProfile } = await supabase.from('users').select('role').eq('id', userId).single();
            const isAdmin = userProfile?.role === 'ADMIN' || userProfile?.role === 'MANAGER';

            const STATUS_GROUPS_DB: Record<string, string[]> = {
                in_progress: ['EM ANDAMENTO', 'EM DESLOCAMENTO'],
                traveling: ['EM DESLOCAMENTO'],
                blocked: ['IMPEDIDO'],
                completed: ['CONCLUÍDO'],
                canceled: ['CANCELADO']
            };

            const statsMap: Record<string, number> = { all: 0, pending: 0 };

            // Stats counting with dynamic date columns
            const dbStatsPromises = Object.entries(STATUS_GROUPS_DB).map(async ([key, statuses]) => {
                let q = supabase.from('orders').select('*', { count: 'exact', head: true });
                if (!isAdmin) q = q.eq('assigned_to', userId);
                q = q.in('status', statuses);
                const dateCol = getDateCol(key);
                const sDate = getStartDateStr(dateCol);
                const eDate = getEndDateStr(dateCol);
                
                if (sDate) q = q.gte(dateCol, sDate);
                if (eDate) q = q.lte(dateCol, eDate);
                
                const { count } = await q;
                return { [key]: count || 0 };
            });

            // "All" Stat always uses scheduled_date as base index
            let allQuery = supabase.from('orders').select('*', { count: 'exact', head: true });
            if (!isAdmin) allQuery = allQuery.eq('assigned_to', userId);
            const allSDate = getStartDateStr('scheduled_date');
            const allEDate = getEndDateStr('scheduled_date');
            if (allSDate) allQuery = allQuery.gte('scheduled_date', allSDate);
            if (allEDate) allQuery = allQuery.lte('scheduled_date', allEDate);

            const [dbStatsResults, allResult] = await Promise.all([
                Promise.all(dbStatsPromises),
                allQuery
            ]);

            dbStatsResults.forEach(r => Object.assign(statsMap, r));
            statsMap.all = allResult.count || 0;

            // "Pending" Stat uses scheduled_date
            let pendingCountQuery = supabase.from('orders').select('status');
            if (!isAdmin) pendingCountQuery = pendingCountQuery.eq('assigned_to', userId);
            const pSDate = getStartDateStr('scheduled_date');
            const pEDate = getEndDateStr('scheduled_date');
            if (pSDate) pendingCountQuery = pendingCountQuery.gte('scheduled_date', pSDate);
            if (pEDate) pendingCountQuery = pendingCountQuery.lte('scheduled_date', pEDate);

            const { data: allStatuses } = await pendingCountQuery;
            if (allStatuses) {
                statsMap.pending = allStatuses.filter(
                    (o: any) => o.status && (
                        o.status.toUpperCase().includes('ATRIBU') ||
                        o.status.toUpperCase().includes('PENDENT') ||
                        o.status.toUpperCase().includes('ABERTA') ||
                        o.status.toUpperCase().includes('DESLOCAMENTO')
                    )
                ).length;
            }

            // 🛠️ Main Data Query
            let query = supabase.from('orders').select('*, customers(*), service_visits(count)', { count: 'exact' });
            if (!isAdmin) query = query.eq('assigned_to', userId);

            const activeDateCol = getDateCol(statusFilter);
            const mainSDate = getStartDateStr(activeDateCol);
            const mainEDate = getEndDateStr(activeDateCol);

            if (statusFilter !== 'pending') {
                if (statusFilter !== 'all' && STATUS_GROUPS_DB[statusFilter]) {
                    query = query.in('status', STATUS_GROUPS_DB[statusFilter]);
                }

                if (mainSDate) query = query.gte(activeDateCol, mainSDate);
                if (mainEDate) query = query.lte(activeDateCol, mainEDate);
            } else {
                // Pending filter in DB (if possible) or at least date filter
                if (mainSDate) query = query.gte('scheduled_date', mainSDate);
                if (mainEDate) query = query.lte('scheduled_date', mainEDate);
                // We keep the memory filter for pending statuses since they are varied
                query = query.order('created_at', { ascending: false });
            }

            if (statusFilter !== 'pending') {
                query = query
                    .order(activeDateCol, { ascending: false })
                    .order('scheduled_time', { ascending: true })
                    .order('created_at', { ascending: false });
            }

            const startRange = statusFilter === 'pending' ? 0 : from;
            const endRange = statusFilter === 'pending' ? 199 : to;
            const { data, error, count } = await query.range(startRange, endRange);

            if (error) throw error;

            let filteredData = data || [];
            if (statusFilter === 'pending') {
                filteredData = filteredData.filter((o: any) => {
                    const s = (o.status || '').toUpperCase();
                    return s.includes('ATRIBU') || s.includes('PENDENT') || s.includes('ABERTA') ||
                        s.includes('DESLOCAMENTO');
                });
            }

            const finalData = statusFilter === 'pending'
                ? filteredData.slice(from, from + pageSize)
                : filteredData;
            const finalTotal = statusFilter === 'pending'
                ? filteredData.length
                : (count || 0);

            const result = {
                orders: finalData.map(o => this.mapDbOrderToApp(o)),
                total: finalTotal,
                stats: statsMap
            };

            await CacheService.set(cacheKey, result, CacheService.TTL.FAST);
            return result;
        });
    }

    static async getCalendarOrders(year: number, month: number, forceRefresh = false): Promise<ExtendedServiceOrder[]> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id || authService.getCurrentUserId();
            if (!userId) return [];

            const startDate = new Date(year, month - 1, 1).toLocaleDateString("en-CA");
            const endDate = new Date(year, month, 0).toLocaleDateString("en-CA");

            const cacheKey = `calendar_${userId}_${year}_${month}`;
            const cached = await CacheService.get<ExtendedServiceOrder[]>(cacheKey);
            if (cached && !forceRefresh) return cached;

            return await CacheService.fetcher(cacheKey, async () => {
                let query = supabase.from('orders').select('*, customers(*), service_visits(count)');
                const { data: userProfile } = await supabase.from('users').select('role').eq('id', userId).single();
                const isAdmin = userProfile?.role === 'ADMIN' || userProfile?.role === 'MANAGER';

                if (!isAdmin) {
                    query = query.eq('assigned_to', userId);
                }

                const { data, error } = await query
                    .gte('scheduled_date', startDate)
                    .lte('scheduled_date', endDate)
                    .order('scheduled_date', { ascending: true })
                    .order('scheduled_time', { ascending: true });

                if (error) throw error;

                const mapped = (data || []).map((o: any) => this.mapDbOrderToApp(o));
                await CacheService.set(cacheKey, mapped, CacheService.TTL.APP);
                return mapped;
            });
        } catch (error) {
            console.error('[OrderService] Fetch calendar orders exception:', error);
            return [];
        }
    }

    static async completeOrder(id: string, details: {
        technicalReport: string;
        partsUsed: string;
        photos: string[];
        videoUrl?: string | null;
        signature: string | null;
        formData?: any;
        clientName?: string;
        clientDoc?: string;
        tenantId?: string;
        items?: OrderItem[];
    }): Promise<void> {
        try {
            // 1. Upload Photos (Standard ones)
            const uploadedPhotos: string[] = [];
            if (details.photos && details.photos.length > 0) {
                for (const photoUri of details.photos) {
                    if (photoUri && typeof photoUri === 'string') {
                        if (photoUri.startsWith('http')) {
                            uploadedPhotos.push(photoUri);
                        } else {
                            const url = await this.uploadFile(photoUri, `orders/${id}/photos`, details.tenantId);
                            if (url) uploadedPhotos.push(url);
                        }
                    }
                }
            }

            // 2. Upload Signature
            let signatureUrl = null;
            if (details.signature) {
                const url = await this.uploadFile(details.signature, `orders/${id}/signatures`, details.tenantId);
                if (url) signatureUrl = url;
            }

            // Fetch current DB order to preserve existing form_data context
            const { data: currentOrder } = await supabase.from('orders').select('form_data').eq('id', id).single();
            const currentFormData = currentOrder?.form_data || {};

            // 3. Process Stock Consumption (only if online and items provided)
            if (details.items && details.items.length > 0) {
                const { data: userData } = await supabase.auth.getUser();
                const uid = userData?.user?.id;

                if (uid) {
                    for (const item of details.items) {
                        if (item.fromStock && item.stockItemId) {
                            try {
                                await supabase.rpc('consume_tech_stock', {
                                    p_tech_id: uid,
                                    p_item_id: item.stockItemId,
                                    p_quantity: item.quantity,
                                    p_order_id: id,
                                    p_created_by: uid
                                });
                            } catch (e) {
                                logger.log(`Error consuming stock for ${item.description}: ${e}`, 'error');
                            }
                        }
                    }
                }
            }

            // 4. Update DB
            const itemsValue = details.items?.reduce((acc, i) => acc + (i.total || 0), 0) ?? 0;
            const updateData: any = {
                status: 'CONCLUÍDO',
                end_date: new Date().toISOString(),
                form_data: {
                    ...currentFormData,
                    technicalReport: details.technicalReport,
                    partsUsed: details.partsUsed,
                    photos: uploadedPhotos,
                    completedAt: new Date().toISOString(),
                    clientName: details.clientName,
                    clientDoc: details.clientDoc,
                    ...(details.formData || {})
                },
                items: details.items || [], // Save items structured list
                signature_url: signatureUrl,
                video_url: details.videoUrl || null,
                billing_status: itemsValue > 0 ? 'PENDING' : undefined
            };

            const { error } = await supabase
                .from('orders')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;

            // 5. Update service_visits — save form_data snapshot per visit
            try {
                const { data: userData2 } = await supabase.auth.getUser();
                if (userData2?.user?.id) {
                    await supabase.from('service_visits')
                        .update({
                            status: 'completed',
                            departure_time: new Date().toISOString(),
                            updated_at: new Date().toISOString(),
                            form_data: {
                                ...(details.formData || {}),
                                technical_report: details.technicalReport,
                                parts_used: details.partsUsed,
                                extra_photos: uploadedPhotos,
                                signature: signatureUrl,
                                clientName: details.clientName,
                                clientDoc: details.clientDoc,
                                video_url: details.videoUrl || null,
                                completedAt: new Date().toISOString(),
                            }
                        })
                        .eq('order_id', id)
                        .eq('technician_id', userData2.user.id)
                        .in('status', ['pending', 'ongoing', 'paused']);
                }
            } catch (vErr) {
                logger.log(`Warning: Failed to update service_visits: ${vErr}`, 'warn');
            }

            logger.log(`Order ${id} completed successfully`, 'info');

        } catch (error) {
            logger.log(`Error completing order: ${error}`, 'error');
            throw error;
        }
    }

    static async blockOrder(
        id: string, 
        reason: string, 
        blockPhotoUrls?: string[] | null,
        additionalData?: { formData?: any, items?: OrderItem[] }
    ): Promise<void> {
        try {
            // Pega tenant_id, form_data e visita atual para o vínculo estruturado
            const { data: order } = await supabase.from('orders').select('tenant_id, form_data').eq('id', id).single();
            const { data: userData } = await supabase.auth.getUser();
            const { data: currentVisit } = await supabase.from('service_visits')
                .select('id')
                .eq('order_id', id)
                .in('status', ['pending', 'ongoing', 'paused'])
                .order('visit_number', { ascending: false })
                .limit(1)
                .single();

            // 1. REGISTRO ESTRUTURADO (Inquebrável)
            const { error: insertErr } = await supabase.from('order_impediments').insert({
                tenant_id: order?.tenant_id,
                order_id: id,
                visit_id: currentVisit?.id,
                technician_id: userData?.user?.id,
                reason: reason,
                photo_url: blockPhotoUrls && blockPhotoUrls.length > 0 ? JSON.stringify(blockPhotoUrls) : null,
            });

            if (insertErr) throw insertErr;

            // 2. ATUALIZAÇÃO DE STATUS DA OS E ANEXOS NO FORM DATA
            const currentFormData = order?.form_data || {};
            
            const updatePayload: any = {
                status: 'IMPEDIDO',
                form_data: {
                    ...currentFormData,
                    ...(additionalData?.formData || {}),
                    blockReason: reason,
                    blockPhotoUrls: blockPhotoUrls || null,
                    blockedAt: new Date().toISOString(),
                }
            };

            if (additionalData?.items) {
                updatePayload.items = additionalData.items;
            }

            const { error } = await supabase
                .from('orders')
                .update(updatePayload)
                .eq('id', id);

            if (error) throw error;

            // 3. ATUALIZAÇÃO DA VISITA — salva form_data completo
            if (userData?.user?.id && currentVisit?.id) {
                await supabase.from('service_visits')
                    .update({
                        status: 'blocked',
                        impediment_reason: reason,
                        departure_time: new Date().toISOString(),
                        form_data: {
                            ...(additionalData?.formData || {}),
                            blockReason: reason,
                            blockPhotoUrls: blockPhotoUrls || null,
                            blockedAt: new Date().toISOString(),
                        }
                    })
                    .eq('id', currentVisit.id);
            }

            logger.log(`Order ${id} blocked structurally`, 'info');

        } catch (error) {
            logger.log(`Error blocking order: ${error}`, 'error');
            throw error;
        }
    }


    static async startDisplacement(id: string, lat?: number, lon?: number): Promise<void> {
        try {
            const { error } = await supabase
                .from('orders')
                .update({
                    status: 'EM DESLOCAMENTO',
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;

            try {
                const { data: userData } = await supabase.auth.getUser();
                if (userData?.user?.id) {
                    const { data: visitData } = await supabase.from('service_visits')
                        .select('id, form_data')
                        .eq('order_id', id)
                        .eq('technician_id', userData.user.id)
                        .in('status', ['pending', 'paused'])
                        .single();

                    if (visitData) {
                        const currentFormData = visitData.form_data || {};
                        const displacement = {
                            start_time: new Date().toISOString(),
                            start_lat: lat,
                            start_lon: lon
                        };
                        await supabase.from('service_visits')
                            .update({
                                form_data: { ...currentFormData, displacement },
                                updated_at: new Date().toISOString()
                            })
                            .eq('id', visitData.id);
                    }
                }
            } catch (vErr) {
                logger.log(`Warning: Failed to update service_visits displacement: ${vErr}`, 'warn');
            }

            logger.log(`Order ${id} displacement started`, 'info');
        } catch (error) {
            logger.log(`Error starting displacement: ${error}`, 'error');
            throw error;
        }
    }

    static async startExecution(id: string, lat?: number, lon?: number): Promise<void> {
        try {
            const { error } = await supabase
                .from('orders')
                .update({
                    status: 'EM ANDAMENTO',
                    start_date: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;

            try {
                const { data: userData } = await supabase.auth.getUser();
                if (userData?.user?.id) {
                    // Get current visit first to append to form_data
                    const { data: visitData } = await supabase.from('service_visits')
                        .select('id, form_data')
                        .eq('order_id', id)
                        .eq('technician_id', userData.user.id)
                        .in('status', ['pending', 'paused'])
                        .single();

                    if (visitData) {
                         const currentFormData = visitData.form_data || {};
                         const existingDisplacement = currentFormData.displacement || {};
                         const updatedDisplacement = {
                             ...existingDisplacement,
                             arrival_time: new Date().toISOString(),
                             arrival_lat: lat,
                             arrival_lon: lon
                         };

                         await supabase.from('service_visits')
                             .update({
                                 status: 'ongoing',
                                 arrival_time: new Date().toISOString(),
                                 updated_at: new Date().toISOString(),
                                 form_data: { ...currentFormData, displacement: updatedDisplacement }
                             })
                             .eq('id', visitData.id);
                    } else {
                         // Fallback just in case
                         await supabase.from('service_visits')
                            .update({
                                status: 'ongoing',
                                arrival_time: new Date().toISOString(),
                                updated_at: new Date().toISOString()
                            })
                            .eq('order_id', id)
                            .eq('technician_id', userData.user.id)
                            .in('status', ['pending', 'paused']);
                    }
                }
            } catch (vErr) {
                logger.log(`Warning: Failed to update service_visits: ${vErr}`, 'warn');
            }

            logger.log(`Order ${id} execution started`, 'info');
        } catch (error) {
            logger.log(`Error starting execution: ${error}`, 'error');
            throw error;
        }
    }

    static async getFormTemplates(): Promise<FormTemplate[]> {
        try {
            const { data, error } = await supabase
                .from('form_templates')
                .select('*')
                .eq('is_active', true);

            if (error) throw error;

            const mapped = (data || []).map(dt => {
                const schema = dt.schema || {};
                return {
                    id: dt.id,
                    title: dt.title || dt.name || 'Sem Título',
                    active: dt.is_active ?? true,
                    targetFamily: schema.targetFamily,
                    serviceTypes: schema.serviceTypes || [],
                    fields: schema.fields || []
                };
            });
            // Persistir no disco para uso offline
            await AsyncStorage.setItem(DISK_CACHE_FORM_TEMPLATES, JSON.stringify(mapped)).catch(() => { });
            return mapped;
        } catch (error) {
            // Tentar do cache de disco (modo offline)
            try {
                const raw = await AsyncStorage.getItem(DISK_CACHE_FORM_TEMPLATES);
                if (raw) return JSON.parse(raw);
            } catch (_) { }
            logger.log(`Error fetching form templates: ${error}`, 'error');
            return [];
        }
    }

    static async getFormTemplate(formId: string): Promise<FormTemplate | null> {
        try {
            const { data, error } = await supabase
                .from('form_templates')
                .select('*')
                .eq('id', formId)
                .single();

            if (error || !data) {
                logger.log(`Error fetching form template ${formId}: ${error?.message}`, 'error');
                return null;
            }

            // Map DB structure to App structure
            const schema = data.schema || {};
            return {
                id: data.id,
                title: data.title || data.name || 'Sem Título',
                active: data.is_active ?? true,
                targetFamily: schema.targetFamily,
                serviceTypes: schema.serviceTypes || [],
                fields: schema.fields || []
            };
        } catch (error) {
            logger.log(`Exception fetching form template: ${error}`, 'error');
            return null;
        }
    }

    static async getActivationRules(): Promise<ActivationRule[]> {
        try {
            const { data, error } = await supabase
                .from('activation_rules')
                .select('*')
                .eq('is_active', true);

            if (error) throw error;

            const mapped = (data || []).map(r => ({
                id: r.id,
                formId: r.form_template_id,
                serviceTypeId: r.service_type_id,
                equipmentFamily: r.conditions?.equipment_family || 'Todos',
                active: r.is_active
            }));
            await AsyncStorage.setItem(DISK_CACHE_ACTIVATION_RULES, JSON.stringify(mapped)).catch(() => { });
            return mapped;
        } catch (error) {
            try {
                const raw = await AsyncStorage.getItem(DISK_CACHE_ACTIVATION_RULES);
                if (raw) return JSON.parse(raw);
            } catch (_) { }
            logger.log(`Error fetching activation rules: ${error}`, 'error');
            return [];
        }
    }

    static async getServiceTypes(): Promise<any[]> {
        try {
            const { data, error } = await supabase
                .from('service_types')
                .select('*')
                .eq('is_active', true);

            if (error) throw error;
            const result = data || [];
            await AsyncStorage.setItem(DISK_CACHE_SERVICE_TYPES, JSON.stringify(result)).catch(() => { });
            return result;
        } catch (error) {
            try {
                const raw = await AsyncStorage.getItem(DISK_CACHE_SERVICE_TYPES);
                if (raw) return JSON.parse(raw);
            } catch (_) { }
            return [];
        }
    }

    static async getEquipmentBySerial(serial: string): Promise<any | null> {
        try {
            const { data, error } = await supabase
                .from('equipments')
                .select('*')
                .eq('serial_number', serial)
                .single();

            if (error || !data) return null;
            return {
                id: data.id,
                serialNumber: data.serial_number,
                model: data.model,
                familyName: data.family_name,
                familyId: data.family_id
            };
        } catch (error) {
            return null;
        }
    }
    static async getOrderVisits(orderId: string): Promise<any[]> {
        try {
            const { data, error } = await supabase
                .from('service_visits')
                .select('id, visit_number, status, technician_id, scheduled_date, scheduled_time, arrival_time, departure_time, impediment_reason, notes, form_data, created_at, updated_at')
                .eq('order_id', orderId)
                .order('created_at', { ascending: true });

            if (error) throw error;
            return data || [];
        } catch (error) {
            logger.log(`Error fetching visits for order ${orderId}: ${error}`, 'error');
            return [];
        }
    }
}
