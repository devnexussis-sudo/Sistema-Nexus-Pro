
import { OrderStatus, ServiceOrder } from '@/constants/mock-data';
import { logger } from './logger';
import { supabase, BUCKET_NAME } from './supabase';
import { authService } from './auth-service';
import * as FileSystem from 'expo-file-system';
import { decode } from 'base64-arraybuffer';

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
    // Extra fields from DB
    type?: string;
    priority?: string;
    displayId?: string; // Short ID for display
    formId?: string;
    formData?: any; // The initial form data from opening
    operationType?: string;
    equipmentModel?: string;
    equipmentSerial?: string;
    equipmentFamily?: string;
    scheduledDate?: string;
    scheduledTime?: string;
}

export class OrderService {

    private static async uploadFile(uri: string, folder: string): Promise<string | null> {
        try {
            const fileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}.webp`;

            // Read file as base64
            const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });

            // Convert base64 to ArrayBuffer (we need to implement/import decode)
            // Since we can't easily install packages mid-flight without stopping, 
            // we'll try to use FormData if possible, or include a tiny decode function.
            // Let's use fetch().blob() strategy which is cleaner in Expo.

            const response = await fetch(uri);
            const blob = await response.blob();

            const { data, error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(fileName, blob, {
                    contentType: 'image/webp',
                    upsert: false
                });

            if (error) {
                logger.log(`Upload error: ${error.message}`, 'error');
                return null;
            }

            // Get Public URL
            const { data: { publicUrl } } = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(fileName);

            return publicUrl;
        } catch (error) {
            logger.log(`Upload exception: ${error}`, 'error');
            return null;
        }
    }

    private static mapDbOrderToApp(dbOrder: any): ExtendedServiceOrder {
        // Map status
        let status: OrderStatus = 'pending';
        switch (dbOrder.status) {
            case 'PENDENTE': status = 'pending'; break;
            case 'ATRIBUÍDO': status = 'pending'; break;
            case 'EM ANDAMENTO': status = 'in_progress'; break;
            case 'CONCLUÍDO': status = 'completed'; break;
            case 'CANCELADO': status = 'canceled'; break;
            case 'IMPEDIDO': status = 'canceled'; break;
            default: status = 'pending';
        }

        // Map execution details from form_data
        const details = dbOrder.form_data || {};
        const executionDetails = (status === 'completed') ? {
            technicalReport: details.technicalReport || '',
            partsUsed: details.partsUsed || '',
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
            blockReason: (status === 'canceled' && details.blockReason) ? details.blockReason : undefined,
            type: dbOrder.operation_type || dbOrder.type,
            operationType: dbOrder.operation_type,
            priority: dbOrder.priority,
            displayId: displayId,
            formId: dbOrder.form_id,
            formData: dbOrder.form_data,
            scheduledDate: dbOrder.scheduled_date,
            scheduledTime: dbOrder.scheduled_time
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

            return this.mapDbOrderToApp(data);
        } catch (error) {
            logger.log(`Exception fetching order: ${error}`, 'error');
            return undefined;
        }
    }

    static async getAllOrders(): Promise<ExtendedServiceOrder[]> {
        const userId = authService.getCurrentUserId();
        if (!userId) {
            logger.log('Cannot fetch orders: No user logged in', 'warn');
            return [];
        }

        // Fetch assigned orders. 
        // We select * from orders. RLS handles filtering by tenant, 
        // but we should also filter by assigned_to = userId OR if user is admin/manager.
        // Assuming current user is a technician, let's just filter by assigned_to just in case 
        // or let RLS handle it (but RLS "Orders SELECT" says: tenant_id = ...).
        // Wait, typical Technician RLS is: assigned_to = auth.uid() OR is_admin().
        // The policy "Orders SELECT" in schema.sql only checks tenant_id!
        // "396: CREATE POLICY "Orders SELECT" ON public.orders FOR SELECT USING (tenant_id = public.get_user_tenant_id());"
        // This means ALL technicians in the tenant see ALL orders.
        // So we SHOULD client-side filter by assigned_to if we want them to see only theirs.

        try {
            console.log('[OrderService] Fetching orders for user:', userId);

            // Check User Role to determine visibility
            const { data: userProfile, error: profileError } = await supabase
                .from('users')
                .select('role')
                .eq('id', userId)
                .single();

            // Default to NOT admin for safety if profile can't be loaded
            const isAdmin = !profileError && (userProfile?.role === 'ADMIN' || userProfile?.role === 'MANAGER');

            console.log(`[OrderService] User: ${userId} | Role: ${userProfile?.role || 'Unknown'} | IsAdmin: ${isAdmin}`);

            let query = supabase
                .from('orders')
                .select('*')
                .order('created_at', { ascending: false });

            // If not admin, strictly show only assigned orders
            if (!isAdmin) {
                console.log('[OrderService] 🔒 Applying Technician Filter: assigned_to =', userId);
                query = query.eq('assigned_to', userId);
            } else {
                console.log('[OrderService] 🔓 Admin access: showing all orders');
            }

            const { data, error } = await query;

            console.log('[OrderService] Fetched orders count:', data?.length, 'Current User:', userId);
            if (data && data.length > 0) {
                console.log('[OrderService] First order assigned_to:', data[0].assigned_to);
                console.log('[OrderService] First order details:', JSON.stringify(data[0], null, 2));
            }

            if (error) {
                logger.log(`Fetch orders error: ${error.message}`, 'error');
                return [];
            }

            return (data || []).map(o => this.mapDbOrderToApp(o));
        } catch (error) {
            logger.log(`Fetch orders exception: ${error}`, 'error');
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
    }): Promise<void> {
        try {
            // 1. Upload Photos
            const uploadedPhotos: string[] = [];
            for (const photoUri of details.photos) {
                if (photoUri.startsWith('http')) {
                    uploadedPhotos.push(photoUri);
                } else {
                    const url = await this.uploadFile(photoUri, `orders/${id}/photos`);
                    if (url) uploadedPhotos.push(url);
                }
            }

            // 2. Upload Signature
            let signatureUrl = null;
            if (details.signature) {
                const url = await this.uploadFile(details.signature, `orders/${id}/signatures`);
                if (url) signatureUrl = url;
            }

            // 3. Update DB
            const updateData: any = {
                status: 'CONCLUÍDO',
                end_date: new Date().toISOString(),
                form_data: {
                    technicalReport: details.technicalReport,
                    partsUsed: details.partsUsed,
                    photos: uploadedPhotos,
                    completedAt: new Date().toISOString(),
                    clientName: details.clientName, // Save Client Name
                    ...(details.formData || {}) // Include dynamic form data
                },
                signature_url: signatureUrl
            };

            // If the schema supports client_signature_name, we can save it directly too
            // updateData.client_signature_name = details.clientName; 

            const { error } = await supabase
                .from('orders')
                .update(updateData)
                .eq('id', id);

            if (error) throw error;

            logger.log(`Order ${id} completed successfully`, 'info');

        } catch (error) {
            logger.log(`Error completing order: ${error}`, 'error');
            throw error;
        }
    }

    static async blockOrder(id: string, reason: string): Promise<void> {
        try {
            const updateData = {
                status: 'IMPEDIDO', // Using IMPEDIDO to match DB enum
                form_data: {
                    blockReason: reason,
                    blockedAt: new Date().toISOString()
                }
            };

            // Note: If we want to preserve previous form data, we should fetch-merge or use jsonb_set logic.
            // But simple update merges top-level keys in some libs but Supabase .update() replaces the column value if it's not careful.
            // Wait, for JSONB, standard UPDATE replaces the whole JSON.
            // We should use a helper to merge or fetch first.
            // For simplicity/MVP, we replace form_data but we might lose previous data if any.
            // Since blocking usually happens before execution, it's safer.
            // Ideally: fetch, merge, update.

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
