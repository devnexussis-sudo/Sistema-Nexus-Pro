
import { supabase } from '../lib/supabase';
import { FormTemplate } from '../types';
import { CacheManager } from '../lib/cache';
import { getCurrentTenantId } from '../lib/tenantContext';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
const STORAGE_KEYS = { TEMPLATES: 'nexus_templates_v2' };



export const FormService = {

    // 🛡️ Nexus Timeout Guard
    _withTimeout: async <T>(promise: Promise<T>, ms = 8000, fallbackValue: T): Promise<T> => {
        // Timeout Promise correto:
        const timeoutPromise = new Promise<T>((resolve) => {
            setTimeout(() => {
                console.warn(`[FormService] ⚠️ Timeout de ${ms}ms atingido. Usando fallback.`);
                resolve(fallbackValue);
            }, ms);
        });

        try {
            return await Promise.race([promise, timeoutPromise]);
        } catch (e) {
            console.error("[FormService] Erro na requisição (catch):", e);
            return fallbackValue;
        }
    },

    getServiceTypes: async (): Promise<any[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled) {
            if (!tenantId) return [];

            try {
                const { data, error } = await supabase
                    .from('service_types')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('name')
                    .limit(100);

                if (error) {
                    console.error('[FormService] Erro ao buscar service_types:', error);
                    return [];
                }

                let types = (data || []).map(t => ({
                    ...t,
                    name: t.name || (t as any).title
                }));

                if (types.length === 0) {
                    console.warn('[FormService] ⚠️ Nenhum tipo de serviço encontrado.');
                }

                return types;
            } catch (e) {
                console.error('[FormService] Erro crítico ao buscar service_types:', e);
                return [];
            }
        }
        return [];
    },

    getFormTemplates: async (): Promise<FormTemplate[]> => {
        const tenantId = getCurrentTenantId();
        if (isCloudEnabled) {
            if (!tenantId) return [];

            try {
                let result = await supabase
                    .from('form_templates')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('created_at', { ascending: false })
                    .limit(100);

                // Se falhou por falta de coluna created_at, tenta novamente sem ordenar
                if (result.error && (result.error.message.includes('created_at') || result.error.code === '42703')) {
                    console.warn('[FormService] Coluna created_at ausente em form_templates, tentando sem ordenação.');
                    result = await supabase
                        .from('form_templates')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .limit(100);
                }

                const { data, error } = result;

                if (error) {
                    console.warn('[FormService] form_templates não encontrado:', error.message);
                    return [];
                }

                const templates = (data || []).map(f => ({
                    ...f,
                    title: f.title || (f as any).name,
                    active: f.is_active ?? true,
                    serviceTypes: (f.schema as any)?.serviceTypes || [],
                    targetFamily: (f.schema as any)?.targetFamily || 'Todos',
                    fields: (f.schema as any)?.fields || []
                }));

                return templates;
            } catch (e) {
                console.warn('[FormService] Erro ao buscar form_templates:', e);
                return [];
            }
        }
        return [];
    },

    saveServiceType: async (type: any): Promise<any> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled) {
            try {
                if (type.id) {
                    // Atualização explícita
                    const { data, error } = await supabase.from('service_types')
                        .update({ name: type.name }) // Atualiza apenas campos permitidos
                        .eq('id', type.id)
                        .eq('tenant_id', tid)
                        .select()
                        .single();

                    if (error) throw error;
                    return data;
                } else {
                    const payload = {
                        name: type.name,
                        tenant_id: tid
                    };

                    const { data, error } = await supabase.from('service_types')
                        .insert([payload])
                        .select()
                        .single();

                    if (error) throw error;
                    return data;
                }
            } catch (err: any) {
                console.error("❌ FormService: Erro ao salvar Tipo de Serviço:", err);
                throw err;
            }
        }
        return type;
    },

    deleteServiceType: async (id: string) => {
        if (isCloudEnabled) {
            const tid = getCurrentTenantId();
            await supabase.from('service_types')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tid);
        }
    },

    saveFormTemplate: async (template: FormTemplate): Promise<FormTemplate> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled) {
            try {
                const dbPayload: any = {
                    title: template.title,
                    tenant_id: tid,
                    schema: {
                        fields: template.fields || [],
                        serviceTypes: template.serviceTypes || [],
                        targetFamily: template.targetFamily || 'Todos'
                    },
                    is_active: template.active ?? true
                };

                if (template.id && !template.id.startsWith('f-') && !template.id.startsWith('mock-')) {
                    dbPayload.id = template.id;
                }

                const { data, error } = await supabase.from('form_templates')
                    .upsert([dbPayload])
                    .select()
                    .single();

                if (error) {
                    if (error.message.includes('null value in column "id"')) {
                        dbPayload.id = crypto.randomUUID();
                        const retry = await supabase.from('form_templates').upsert([dbPayload]).select().single();
                        if (retry.error) throw retry.error;
                        return {
                            ...retry.data,
                            title: retry.data.title,
                            active: retry.data.is_active ?? true,
                            serviceTypes: (retry.data.schema as any)?.serviceTypes || [],
                            targetFamily: (retry.data.schema as any)?.targetFamily || 'Todos',
                            fields: (retry.data.schema as any)?.fields || []
                        };
                    } else {
                        throw error;
                    }
                }

                return {
                    ...data,
                    title: data.title,
                    active: data.is_active ?? true,
                    serviceTypes: (data.schema as any)?.serviceTypes || [],
                    targetFamily: (data.schema as any)?.targetFamily || 'Todos',
                    fields: (data.schema as any)?.fields || []
                };
            } catch (err) {
                console.error("Erro crítico ao salvar checklist:", err);
                throw err;
            }
        }
        return template;
    },

    deleteFormTemplate: async (id: string) => {
        if (isCloudEnabled) {
            const tid = getCurrentTenantId();
            if (!tid) throw new Error('Tenant ID não encontrado.');

            const { data, error } = await supabase
                .from('form_templates')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tid)
                .select();

            if (error) throw new Error(`Falha ao excluir formulário: ${error.message}`);
            return data;
        }
    },

    getActivationRules: async (): Promise<any[]> => {
        if (isCloudEnabled) {
            const tenantId = getCurrentTenantId();
            if (!tenantId) return [];

            try {
                let result = await supabase
                    .from('activation_rules')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('created_at', { ascending: false })
                    .limit(100);

                // Se falhou por falta de coluna created_at, tenta novamente sem ordenar
                if (result.error && (result.error.message.includes('created_at') || result.error.code === '42703')) {
                    console.warn('[FormService] Coluna created_at ausente em activation_rules, tentando sem ordenação.');
                    result = await supabase
                        .from('activation_rules')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .limit(100);
                }

                const { data, error } = result;

                if (error) {
                    console.warn('[FormService] activation_rules não encontrado:', error.message);
                    return [];
                }

                return (data || []).map(r => ({
                    ...r,
                    id: r.id,
                    serviceTypeId: r.service_type_id,
                    formId: r.form_template_id,
                    equipmentFamily: (r.conditions as any)?.equipment_family || 'Todos'
                }));
            } catch (e) {
                console.warn('[FormService] Erro ao buscar activation_rules:', e);
                return [];
            }
        }
        return [];
    },

    saveActivationRule: async (rule: any): Promise<any> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled) {
            try {
                const dbRule: any = {
                    tenant_id: tid,
                    service_type_id: rule.serviceTypeId || rule.serviceType,
                    form_template_id: rule.formId || rule.formTemplateId,
                    conditions: {
                        equipment_family: rule.equipmentFamily || 'Todos'
                    }
                };

                if (rule.id && !rule.id.toString().startsWith('r-')) {
                    dbRule.id = rule.id;
                }

                const { data, error } = await supabase.from('activation_rules').upsert([dbRule]).select().single();

                if (error) {
                    if (error.message.includes('null value in column "id"')) {
                        dbRule.id = crypto.randomUUID();
                        const retry = await supabase.from('activation_rules').upsert([dbRule]).select().single();
                        if (retry.error) throw retry.error;
                        return {
                            id: retry.data.id,
                            serviceTypeId: retry.data.service_type_id,
                            formId: retry.data.form_template_id,
                            equipmentFamily: (retry.data.conditions as any)?.equipment_family || 'Todos'
                        };
                    }
                    throw error;
                }

                return {
                    id: data.id,
                    serviceTypeId: data.service_type_id,
                    formId: data.form_template_id,
                    equipmentFamily: (data.conditions as any)?.equipment_family || 'Todos'
                };
            } catch (err) {
                console.error("Erro ao salvar regra cloud:", err);
                throw err;
            }
        }
        return rule;
    },

    deleteActivationRule: async (id: string) => {
        if (isCloudEnabled) {
            const tid = getCurrentTenantId();
            await supabase.from('activation_rules')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tid);
        }
    }
};
