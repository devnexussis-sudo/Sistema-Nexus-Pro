
import { OrderStatus, ServiceOrder } from '@/constants/mock-data';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decode } from 'base64-arraybuffer';
import * as FileSystem from 'expo-file-system/legacy';
import { authService } from './auth-service';
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
}

export class OrderService {

    public static async uploadFile(uri: string, folder: string, manualTenantId?: string): Promise<string | null> {
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
            const fileName = `${finalFolder}/${Date.now()}_${Math.random().toString(36).substring(7)}.webp`.replace(/\/+/g, '/');

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
                    contentType: 'image/webp',
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

        return {
            id: dbOrder.id,
            tenantId: dbOrder.tenant_id,
            customer: dbOrder.customer_name || 'Cliente Desconhecido',
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
            rawStatus: dbOrder.status
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
                    .select('*')
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
            const startDateStr = startDate ? (statusFilter === 'completed' || statusFilter === 'blocked' ? `${formatLocalISO(startDate)}T00:00:00Z` : formatLocalISO(startDate)) : null;
            const endDateStr = endDate ? (statusFilter === 'completed' || statusFilter === 'blocked' ? `${formatLocalISO(nextDay!)}T02:59:59Z` : formatLocalISO(endDate)) : null;

            // Helper to get which date column to filter by based on status
            const getDateCol = (statusFilterKey: string) => {
                switch (statusFilterKey) {
                    case 'completed': return 'end_date';
                    case 'blocked': return 'updated_at'; // Impeded follows block date
                    case 'in_progress': return 'start_date';
                    default: return 'scheduled_date';
                }
            };

            // 1. Get User Profile for Role Check
            const { data: userProfile } = await supabase.from('users').select('role').eq('id', userId).single();
            const isAdmin = userProfile?.role === 'ADMIN' || userProfile?.role === 'MANAGER';

            const STATUS_GROUPS_DB: Record<string, string[]> = {
                in_progress: ['EM ANDAMENTO'],
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
                if (startDateStr) q = q.gte(dateCol, startDateStr);
                if (endDateStr) q = q.lte(dateCol, endDateStr);
                const { count } = await q;
                return { [key]: count || 0 };
            });

            // "All" Stat always uses scheduled_date as base index
            let allQuery = supabase.from('orders').select('*', { count: 'exact', head: true });
            if (!isAdmin) allQuery = allQuery.eq('assigned_to', userId);
            if (startDateStr) allQuery = allQuery.gte('scheduled_date', startDateStr);
            if (endDateStr) allQuery = allQuery.lte('scheduled_date', endDateStr);

            const [dbStatsResults, allResult] = await Promise.all([
                Promise.all(dbStatsPromises),
                allQuery
            ]);

            dbStatsResults.forEach(r => Object.assign(statsMap, r));
            statsMap.all = allResult.count || 0;

            // "Pending" Stat uses scheduled_date
            let pendingCountQuery = supabase.from('orders').select('status');
            if (!isAdmin) pendingCountQuery = pendingCountQuery.eq('assigned_to', userId);
            if (startDateStr) pendingCountQuery = pendingCountQuery.gte('scheduled_date', startDateStr);
            if (endDateStr) pendingCountQuery = pendingCountQuery.lte('scheduled_date', endDateStr);

            const { data: allStatuses } = await pendingCountQuery;
            if (allStatuses) {
                statsMap.pending = allStatuses.filter(
                    (o: any) => o.status && (
                        o.status.toUpperCase().includes('ATRIBU') ||
                        o.status.toUpperCase().includes('PENDENT') ||
                        o.status.toUpperCase().includes('ABERTA')
                    )
                ).length;
            }

            // 🛠️ Main Data Query
            let query = supabase.from('orders').select('*', { count: 'exact' });
            if (!isAdmin) query = query.eq('assigned_to', userId);

            const activeDateCol = getDateCol(statusFilter);

            if (statusFilter !== 'pending') {
                if (statusFilter !== 'all' && STATUS_GROUPS_DB[statusFilter]) {
                    query = query.in('status', STATUS_GROUPS_DB[statusFilter]);
                }

                // Special case: in_progress/traveling shows ALL regardless of date
                if (statusFilter !== 'in_progress' && statusFilter !== 'traveling') {
                    if (startDateStr) query = query.gte(activeDateCol, startDateStr);
                    if (endDateStr) query = query.lte(activeDateCol, endDateStr);
                }
            } else {
                // Pending filter in DB (if possible) or at least date filter
                if (startDateStr) query = query.gte('scheduled_date', startDateStr);
                if (endDateStr) query = query.lte('scheduled_date', endDateStr);
                // We keep the memory filter for pending statuses since they are varied
                query = query.order('created_at', { ascending: false });
            }

            if (statusFilter !== 'pending') {
                query = query
                    .order(activeDateCol, { ascending: statusFilter === 'completed' ? false : true })
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
                    return s.includes('ATRIBU') || s.includes('PENDENT') || s.includes('ABERTA');
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
                let query = supabase.from('orders').select('*');
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
                billing_status: itemsValue > 0 ? 'PENDING' : undefined
            };

            const { error } = await supabase
                .from('orders')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;

            // 5. Update service_visits
            try {
                const { data: userData } = await supabase.auth.getUser();
                if (userData?.user?.id) {
                    await supabase.from('service_visits')
                        .update({
                            status: 'completed',
                            departure_time: new Date().toISOString(),
                            updated_at: new Date().toISOString()
                        })
                        .eq('order_id', id)
                        .eq('technician_id', userData.user.id)
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

    static async blockOrder(id: string, reason: string): Promise<void> {
        try {
            // Let's fetch first to be safe
            const { data: current } = await supabase.from('orders').select('form_data').eq('id', id).single();
            const currentForm = current?.form_data || {};

            const newForm = {
                ...currentForm,
                blockReason: reason,
                blockedAt: new Date().toISOString()
            };

            const { error } = await supabase
                .from('orders')
                .update({
                    status: 'IMPEDIDO',
                    form_data: newForm
                })
                .eq('id', id);

            if (error) throw error;
            logger.log(`Order ${id} blocked`, 'info');

        } catch (error) {
            logger.log(`Error blocking order: ${error}`, 'error');
            throw error;
        }
    }

    static async startDisplacement(id: string): Promise<void> {
        try {
            const { error } = await supabase
                .from('orders')
                .update({
                    status: 'EM DESLOCAMENTO',
                    updated_at: new Date().toISOString()
                })
                .eq('id', id);

            if (error) throw error;
            logger.log(`Order ${id} displacement started`, 'info');
        } catch (error) {
            logger.log(`Error starting displacement: ${error}`, 'error');
            throw error;
        }
    }

    static async startExecution(id: string): Promise<void> {
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
}
