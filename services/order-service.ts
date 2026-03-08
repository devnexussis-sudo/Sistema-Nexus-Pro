
import { OrderStatus, ServiceOrder } from '@/constants/mock-data';
import { logger } from './logger';
import { supabase, BUCKET_NAME } from './supabase';
import { authService } from './auth-service';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import { CacheService } from './cache-service';

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

export interface ExtendedServiceOrder extends ServiceOrder {
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

    private static mapDbOrderToApp(dbOrder: any): ExtendedServiceOrder {
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

            // Smart concatenation to avoid duplication (e.g. prefix="OS-1002", seq="1002")
            if (seq && prefix.includes(seq)) {
                displayId = prefix;
            } else {
                displayId = `${prefix}${seq}`;
            }
        }
        // Priority 2: Fallback for raw UUIDs
        else if (dbOrder.id && dbOrder.id.length > 20) {
            displayId = `OS-${dbOrder.id.substring(0, 8).toUpperCase()}`;
        }

        return {
            id: dbOrder.id, // Keep original ID for API calls
            tenantId: dbOrder.tenant_id,
            // PROBLEM: We cannot change the ID if we use it for lookups.
            // SOLUTION: Add a `displayId` field to ExtendedServiceOrder and update UI to use it.
            // ALTERNATIVE: Use the real ID for logic, but format it in the UI. 
            // But the user asked to fix it "no lugar do numero... apareceu o numero enorme".
            // I'll update the ServiceOrder interface to include `displayId`.

            // Actually, let's just make the 'id' the UUID, and I'll modify the UI to format it if it looks like a UUID.
            // OR, I can add `displayId` here.

            // Let's add displayId to the object. I need to update the Interface first.
            // I'll just append it to the return object and cast it/add to interface.

            customer: dbOrder.customer_name || 'Cliente Desconhecido',
            address: dbOrder.customer_address || 'Endereço não informado',
            date: dbOrder.scheduled_date ? new Date(dbOrder.scheduled_date).toLocaleDateString('pt-BR') : 'Data n/d',
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
            priority: dbOrder.priority,
            displayId: displayId,
            publicToken: dbOrder.public_token,
            formId: dbOrder.form_id,
            formData: dbOrder.form_data,
            scheduledDate: dbOrder.scheduled_date,
            scheduledTime: dbOrder.scheduled_time,
            // 🏷️ DEBUG: Store raw status to identify the "missing" OS status
            rawStatus: dbOrder.status
        };
    }

    static async getOrderById(id: string): Promise<ExtendedServiceOrder | undefined> {
        try {
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

            return mapped;
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
    } = {}): Promise<{ orders: ExtendedServiceOrder[], total: number, stats: Record<string, number> }> {
        const { data: { session } } = await supabase.auth.getSession();
        const userId = session?.user?.id || authService.getCurrentUserId();
        if (!userId) {
            logger.log('Cannot fetch orders: No user logged in', 'warn');
            return { orders: [], total: 0, stats: {} };
        }

        const { page = 1, pageSize = 100, statusFilter = 'all', startDate, endDate } = options;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        const cacheKey = `orders_${userId}_${statusFilter}_${startDate?.getTime() || 0}_${endDate?.getTime() || 0}_${page}`;
        
        const cached = await CacheService.get<any>(cacheKey);
        if (cached) return cached;

        return await CacheService.fetcher(cacheKey, async () => {
            const formatLocalISO = (date: Date) => {
                const y = date.getFullYear();
                const m = String(date.getMonth() + 1).padStart(2, '0');
                const d = String(date.getDate()).padStart(2, '0');
                return `${y}-${m}-${d}`;
            };

            const startDateStr = startDate ? formatLocalISO(startDate) : null;
            const endDateStr = endDate ? formatLocalISO(endDate) : null;

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
            const dbStatsPromises = Object.entries(STATUS_GROUPS_DB).map(async ([key, statuses]) => {
                let q = supabase.from('orders').select('*', { count: 'exact', head: true });
                if (!isAdmin) q = q.eq('assigned_to', userId);
                q = q.in('status', statuses);
                if (startDateStr) q = q.gte('scheduled_date', startDateStr);
                if (endDateStr) q = q.lte('scheduled_date', endDateStr);
                const { count } = await q;
                return { [key]: count || 0 };
            });

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

            let pendingCountQuery = supabase.from('orders').select('status');
            if (!isAdmin) pendingCountQuery = pendingCountQuery.eq('assigned_to', userId);
            const { data: allStatuses } = await pendingCountQuery;
            if (allStatuses) {
                statsMap.pending = allStatuses.filter(
                    (o: any) => o.status && (o.status.toUpperCase().includes('ATRIBU') || o.status.toUpperCase().includes('PENDENT'))
                ).length;
            }

            let query = supabase.from('orders').select('*', { count: 'exact' });
            if (!isAdmin) query = query.eq('assigned_to', userId);

            if (statusFilter !== 'pending') {
                if (statusFilter !== 'all' && STATUS_GROUPS_DB[statusFilter]) {
                    query = query.in('status', STATUS_GROUPS_DB[statusFilter]);
                }
                if (startDateStr) query = query.gte('scheduled_date', startDateStr);
                if (endDateStr) query = query.lte('scheduled_date', endDateStr);
            }

            if (statusFilter === 'pending') {
                query = query.order('created_at', { ascending: false });
            } else {
                query = query
                    .order('scheduled_date', { ascending: true })
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
                    return s.includes('ATRIBU') || s.includes('PENDENT') || s.includes('ABERT');
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

    static async getCalendarOrders(year: number, month: number): Promise<ExtendedServiceOrder[]> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            const userId = session?.user?.id || authService.getCurrentUserId();
            if (!userId) return [];

            const startDate = new Date(year, month - 1, 1).toLocaleDateString("en-CA");
            const endDate = new Date(year, month, 0).toLocaleDateString("en-CA");

            const cacheKey = `calendar_${userId}_${year}_${month}`;
            const cached = await CacheService.get<ExtendedServiceOrder[]>(cacheKey);
            if (cached) return cached;

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

            // 3. Update DB
            const updateData: any = {
                status: 'CONCLUÍDO',
                end_date: new Date().toISOString(),
                form_data: {
                    ...currentFormData,
                    technicalReport: details.technicalReport,
                    partsUsed: details.partsUsed,
                    photos: uploadedPhotos,
                    completedAt: new Date().toISOString(),
                    clientName: details.clientName, // Save Client Name
                    clientDoc: details.clientDoc,   // Save Client Doc (CPF)
                    ...(details.formData || {}) // Include dynamic form data
                },
                signature_url: signatureUrl
                // signature_doc column does not exist on orders yet, only client_signature_name
            };

            // If the schema supports client_signature_name, we can save it directly too
            // updateData.client_signature_name = details.clientName; 

            const { error } = await supabase
                .from('orders')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;

            // Update service_visits
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

            return (data || []).map(dt => {
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
        } catch (error) {
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

            return (data || []).map(r => ({
                id: r.id,
                formId: r.form_template_id,
                serviceTypeId: r.service_type_id,
                equipmentFamily: r.conditions?.equipment_family || 'Todos',
                active: r.is_active
            }));
        } catch (error) {
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
            return data || [];
        } catch (error) {
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
