
import { supabase } from '../lib/supabase';
import { FormTemplate, DefectType } from '../types';
import { CacheManager } from '../lib/cache';
import { getCurrentTenantId, tenantContext } from '../lib/tenantContext';

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

    // 🛡️ Resolution Guard para F5 / Reloads de Página
    _resolveTenantId: async (): Promise<string | undefined> => {
        let tenantId = getCurrentTenantId();
        if (tenantId) return tenantId;

        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (session?.user) {
                const metadata = session.user.user_metadata;
                tenantId = metadata?.tenantId || metadata?.tenant_id;
                if (!tenantId && session.user.id) {
                    const { data: u } = await supabase
                        .from('users')
                        .select('tenant_id')
                        .eq('id', session.user.id)
                        .maybeSingle();
                    if (u?.tenant_id) tenantId = u.tenant_id;
                }
                if (tenantId) {
                    tenantContext.setTenantId(tenantId);
                }
            }
        } catch (e) {
            console.warn('[FormService] Falha no fallback de resolução de tenant:', e);
        }
        return tenantId;
    },

    // 🛡️ Garante que a sessão do Supabase está ativa e renovada
    _ensureFreshSession: async (): Promise<boolean> => {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                const refresh = await supabase.auth.refreshSession();
                return !!refresh.data?.session;
            }
            if (session.expires_at && (session.expires_at * 1000 - Date.now() < 60000)) {
                console.log('[FormService] 🔄 Sessão prestes a expirar. Renovando token...');
                const refresh = await supabase.auth.refreshSession();
                return !!refresh.data?.session;
            }
            return true;
        } catch (e) {
            console.warn('[FormService] Erro ao verificar/renovar sessão:', e);
            return false;
        }
    },

    // 🛡️ Sincroniza o tenant_id ativo nos metadados do JWT do Supabase (necessário quando o Super Admin / Master acessa conta de empresa ou em usuários sem claim snake_case)
    _syncPromise: null as Promise<void> | null,
    _lastSyncedTenantId: null as string | null,
    _ensureTenantSessionSync: async (targetTenantId?: string, force = false): Promise<void> => {
        const tid = targetTenantId || await FormService._resolveTenantId();
        if (!tid || !isCloudEnabled) return;

        if (!force && FormService._lastSyncedTenantId === tid) {
            return;
        }

        if (FormService._syncPromise) {
            await FormService._syncPromise;
            if (!force && FormService._lastSyncedTenantId === tid) return;
        }

        FormService._syncPromise = (async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session?.user) return;

                const meta = session.user.user_metadata || {};
                const hasSnake = meta.tenant_id === tid;
                const hasCamel = meta.tenantId === tid;

                let jwtHasClaims = false;
                try {
                    const payloadPart = session.access_token?.split('.')[1];
                    if (payloadPart) {
                        const decoded = JSON.parse(atob(payloadPart.replace(/-/g, '+').replace(/_/g, '/')));
                        const jwtMeta = decoded?.user_metadata || {};
                        jwtHasClaims = jwtMeta.tenant_id === tid && jwtMeta.tenantId === tid;
                    }
                } catch {
                    jwtHasClaims = hasSnake && hasCamel;
                }

                if (force || !hasSnake || !hasCamel || !jwtHasClaims) {
                    console.log(`[FormService] 🔐 Sincronizando tenant_id (${tid}) no JWT para compatibilidade RLS...`);
                    const { error: updateErr } = await supabase.auth.updateUser({
                        data: {
                            ...meta,
                            tenant_id: tid,
                            tenantId: tid,
                        }
                    });
                    if (updateErr) {
                        console.warn('[FormService] Aviso ao atualizar user_metadata:', updateErr.message);
                    }
                    const { data: refreshData, error: refreshErr } = await supabase.auth.refreshSession();
                    if (refreshErr) {
                        console.warn('[FormService] Aviso ao renovar token após sync de tenant:', refreshErr.message);
                    } else if (refreshData?.session) {
                        FormService._lastSyncedTenantId = tid;
                    }
                } else {
                    FormService._lastSyncedTenantId = tid;
                }
            } catch (e) {
                console.warn('[FormService] Falha ao sincronizar metadata de tenant:', e);
            } finally {
                FormService._syncPromise = null;
            }
        })();

        await FormService._syncPromise;
    },

    getServiceTypes: async (signal?: AbortSignal): Promise<any[]> => {
        await FormService._ensureFreshSession();
        const tenantId = await FormService._resolveTenantId();
        if (isCloudEnabled) {
            if (!tenantId) return [];

            try {
                let query = supabase
                    .from('service_types')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('name')
                    .limit(100);

                if (signal) {
                    query = query.abortSignal(signal);
                }

                let { data, error } = await query;

                if (error) {
                    console.warn('[FormService] Erro em service_types, tentando refresh de sessão:', error.message);
                    await supabase.auth.refreshSession();
                    let retryQuery = supabase
                        .from('service_types')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .order('name')
                        .limit(100);
                    if (signal) retryQuery = retryQuery.abortSignal(signal);
                    const retryResult = await retryQuery;
                    data = retryResult.data;
                    error = retryResult.error;
                }

                if (error) {
                    console.error('[FormService] ❌ Erro ao buscar service_types:', error);
                    throw new Error(`Erro ao buscar tipos de atendimento: ${error.message}`);
                }

                let types = (data || []).map(t => ({
                    ...t,
                    name: t.name || (t as any).title,
                    active: t.active ?? t.is_active ?? true
                }));

                return types;
            } catch (e) {
                console.error('[FormService] Erro crítico ao buscar service_types:', e);
                throw e;
            }
        }
        return [];
    },

    getFormTemplates: async (signal?: AbortSignal): Promise<FormTemplate[]> => {
        await FormService._ensureFreshSession();
        const tenantId = await FormService._resolveTenantId();
        if (isCloudEnabled) {
            if (!tenantId) return [];

            try {
                let query = supabase
                    .from('form_templates')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (signal) {
                    query = query.abortSignal(signal);
                }

                let result = await query;

                // Se falhou por falta de coluna created_at, tenta novamente sem ordenar
                if (result.error && (result.error.message.includes('created_at') || result.error.code === '42703')) {
                    console.warn('[FormService] Coluna created_at ausente em form_templates, tentando sem ordenação.');
                    let fallbackQuery = supabase
                        .from('form_templates')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .limit(100);

                    if (signal) {
                        fallbackQuery = fallbackQuery.abortSignal(signal);
                    }

                    result = await fallbackQuery;
                }

                // Se result.error persistir, tenta refresh de sessão e retry
                if (result.error && !result.error.message.includes('created_at')) {
                    console.warn('[FormService] Erro em form_templates, tentando refresh de sessão:', result.error.message);
                    await supabase.auth.refreshSession();
                    let retryQuery = supabase
                        .from('form_templates')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .limit(100);
                    if (signal) retryQuery = retryQuery.abortSignal(signal);
                    result = await retryQuery;
                }

                const { data, error } = result;

                if (error) {
                    console.error('[FormService] ❌ Falha crítica ao buscar form_templates:', {
                        message: error.message,
                        code: error.code,
                        tenantId: tenantId
                    });
                    throw new Error(`Falha ao buscar modelos de formulário: ${error.message}`);
                }

                const templates = (data || []).map(f => {
                    const rawCat = (f.schema as any)?.category || f.category || (f as any).category_type || (f as any).type || '';
                    const cleanCat = String(rawCat).toUpperCase().trim();
                    const titleLower = String(f.title || (f as any).name || '').toLowerCase();
                    const isFinancial = cleanCat === 'FINANCIAL' || cleanCat === 'FINANCEIRO' || cleanCat === 'CUSTOS' || titleLower.includes('financeir') || titleLower.includes('custo');

                    return {
                        ...f,
                        title: f.title || (f as any).name,
                        active: f.is_active ?? true,
                        category: isFinancial ? 'FINANCIAL' : 'TECHNICAL',
                        serviceTypes: (f.schema as any)?.serviceTypes || [],
                        targetFamily: (f.schema as any)?.targetFamily || 'Todos',
                        fields: (f.schema as any)?.fields || []
                    };
                });

                return templates;
            } catch (e) {
                console.error('[FormService] Erro ao buscar form_templates:', e);
                throw e;
            }
        }
        return [];
    },

    saveServiceType: async (type: any): Promise<any> => {
        const tid = getCurrentTenantId();
        if (isCloudEnabled) {
            try {
                const isActiveVal = type.active ?? true;
                if (type.id) {
                    // Atualização explícita
                    let { data, error } = await supabase.from('service_types')
                        .update({ name: type.name, is_active: isActiveVal })
                        .eq('id', type.id)
                        .eq('tenant_id', tid)
                        .select()
                        .single();

                    if (error && (error.message.includes('is_active') || error.code === '42703')) {
                        console.warn('[FormService] Coluna is_active ausente em service_types, atualizando apenas name');
                        const retry = await supabase.from('service_types')
                            .update({ name: type.name })
                            .eq('id', type.id)
                            .eq('tenant_id', tid)
                            .select()
                            .single();
                        if (retry.error) throw retry.error;
                        data = retry.data;
                    } else if (error) {
                        throw error;
                    }

                    return { ...data, active: isActiveVal };
                } else {
                    const payload: any = {
                        name: type.name,
                        is_active: isActiveVal,
                        tenant_id: tid
                    };

                    let { data, error } = await supabase.from('service_types')
                        .insert([payload])
                        .select()
                        .single();

                    if (error && (error.message.includes('is_active') || error.code === '42703')) {
                        console.warn('[FormService] Coluna is_active ausente em service_types, inserindo apenas name');
                        const retry = await supabase.from('service_types')
                            .insert([{ name: type.name, tenant_id: tid }])
                            .select()
                            .single();
                        if (retry.error) throw retry.error;
                        data = retry.data;
                    } else if (error) {
                        throw error;
                    }

                    return { ...data, active: isActiveVal };
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

    getDefectTypes: async (signal?: AbortSignal): Promise<DefectType[]> => {
        await FormService._ensureFreshSession();
        const tenantId = await FormService._resolveTenantId();
        if (isCloudEnabled) {
            if (!tenantId) return [];
            await FormService._ensureTenantSessionSync(tenantId);

            try {
                let query = supabase
                    .from('defect_types')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('code', { ascending: true })
                    .limit(200);

                if (signal) {
                    query = query.abortSignal(signal);
                }

                let { data, error } = await query;

                if (error) {
                    console.warn('[FormService] Erro em defect_types, tentando sincronizar sessão e repetir:', error.message);
                    await FormService._ensureTenantSessionSync(tenantId, true);
                    let retryQuery = supabase
                        .from('defect_types')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .order('code', { ascending: true })
                        .limit(200);
                    if (signal) retryQuery = retryQuery.abortSignal(signal);
                    const retryResult = await retryQuery;
                    data = retryResult.data;
                    error = retryResult.error;
                }

                if (error) {
                    console.error('[FormService] ❌ Erro ao buscar defect_types:', error);
                    return [];
                }

                return (data || []).map((d: any) => ({
                    id: d.id,
                    tenantId: d.tenant_id,
                    tenant_id: d.tenant_id,
                    code: d.code,
                    name: d.name,
                    description: d.description || '',
                    active: d.active ?? true,
                    createdAt: d.created_at,
                    updatedAt: d.updated_at,
                }));
            } catch (e) {
                console.error('[FormService] Erro crítico ao buscar defect_types:', e);
                return [];
            }
        }
        return [];
    },

    saveDefectType: async (defect: Partial<DefectType>): Promise<DefectType> => {
        const tid = (await FormService._resolveTenantId()) || getCurrentTenantId();
        if (isCloudEnabled) {
            try {
                if (!tid) throw new Error('Empresa (Tenant ID) não identificada na sessão.');
                await FormService._ensureTenantSessionSync(tid);

                const isActiveVal = defect.active ?? true;
                const codeVal = (defect.code || '').trim();
                const nameVal = (defect.name || '').trim();
                const descVal = defect.description?.trim() || null;

                if (defect.id) {
                    const updatePayload = {
                        code: codeVal,
                        name: nameVal,
                        description: descVal,
                        active: isActiveVal,
                        updated_at: new Date().toISOString()
                    };

                    let { data, error } = await supabase.from('defect_types')
                        .update(updatePayload)
                        .eq('id', defect.id)
                        .eq('tenant_id', tid)
                        .select()
                        .single();

                    if (error && (error.code === '42501' || error.message?.includes('row-level security'))) {
                        await FormService._ensureTenantSessionSync(tid, true);
                        const retry = await supabase.from('defect_types')
                            .update(updatePayload)
                            .eq('id', defect.id)
                            .eq('tenant_id', tid)
                            .select()
                            .single();
                        data = retry.data;
                        error = retry.error;
                    }

                    if (error) throw error;
                    return {
                        id: data.id,
                        tenantId: data.tenant_id,
                        code: data.code,
                        name: data.name,
                        description: data.description,
                        active: data.active,
                        createdAt: data.created_at,
                        updatedAt: data.updated_at
                    };
                } else {
                    const insertPayload = {
                        tenant_id: tid,
                        code: codeVal,
                        name: nameVal,
                        description: descVal,
                        active: isActiveVal
                    };

                    let { data, error } = await supabase.from('defect_types')
                        .insert([insertPayload])
                        .select()
                        .single();

                    if (error && (error.code === '42501' || error.message?.includes('row-level security'))) {
                        await FormService._ensureTenantSessionSync(tid, true);
                        const retry = await supabase.from('defect_types')
                            .insert([insertPayload])
                            .select()
                            .single();
                        data = retry.data;
                        error = retry.error;
                    }

                    if (error) throw error;
                    return {
                        id: data.id,
                        tenantId: data.tenant_id,
                        code: data.code,
                        name: data.name,
                        description: data.description,
                        active: data.active,
                        createdAt: data.created_at,
                        updatedAt: data.updated_at
                    };
                }
            } catch (err: any) {
                console.error("❌ FormService: Erro ao salvar Defeito:", err);
                throw err;
            }
        }
        return defect as DefectType;
    },

    deleteDefectType: async (id: string): Promise<void> => {
        if (isCloudEnabled) {
            const tid = (await FormService._resolveTenantId()) || getCurrentTenantId();
            if (tid) await FormService._ensureTenantSessionSync(tid);

            let { error } = await supabase.from('defect_types')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tid);

            if (error && tid && (error.code === '42501' || error.message?.includes('row-level security'))) {
                await FormService._ensureTenantSessionSync(tid, true);
                const retry = await supabase.from('defect_types')
                    .delete()
                    .eq('id', id)
                    .eq('tenant_id', tid);
                error = retry.error;
            }
            if (error) throw error;
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
                        category: template.category || 'TECHNICAL',
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
                            category: (retry.data.schema as any)?.category || 'TECHNICAL',
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
                    category: (data.schema as any)?.category || 'TECHNICAL',
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

            // 1. Remover regras de ativação vinculadas diretamente a este modelo
            // Isso previne a restrição de chave estrangeira (activation_rules_form_template_id_fkey)
            try {
                const { error: ruleDeleteErr } = await supabase
                    .from('activation_rules')
                    .delete()
                    .eq('form_template_id', id)
                    .eq('tenant_id', tid);

                if (ruleDeleteErr) {
                    console.warn('[FormService] Falha ao deletar regras por form_template_id, tentando desvincular:', ruleDeleteErr);
                    await supabase
                        .from('activation_rules')
                        .update({ form_template_id: null })
                        .eq('form_template_id', id)
                        .eq('tenant_id', tid);
                }
            } catch (errRule) {
                console.warn('[FormService] Erro ao tratar regras vinculadas:', errRule);
            }

            // 2. Se houver regras cujo conditions.financial_form_id seja esse id, desvincula
            try {
                const { data: condRules } = await supabase
                    .from('activation_rules')
                    .select('id, conditions')
                    .eq('tenant_id', tid);

                if (condRules && Array.isArray(condRules)) {
                    for (const r of condRules) {
                        if (r.conditions && (r.conditions as any).financial_form_id === id) {
                            const updatedCond = { ...(r.conditions as any), financial_form_id: null };
                            await supabase
                                .from('activation_rules')
                                .update({ conditions: updatedCond })
                                .eq('id', r.id)
                                .eq('tenant_id', tid);
                        }
                    }
                }
            } catch (condErr) {
                console.warn('[FormService] Falha ao limpar conditions.financial_form_id:', condErr);
            }

            // 3. Exclui o modelo de formulário
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

    getActivationRules: async (signal?: AbortSignal): Promise<any[]> => {
        if (isCloudEnabled) {
            await FormService._ensureFreshSession();
            const tenantId = await FormService._resolveTenantId();
            if (!tenantId) return [];

            try {
                let query = supabase
                    .from('activation_rules')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('created_at', { ascending: false })
                    .limit(100);

                if (signal) {
                    query = query.abortSignal(signal);
                }

                let result = await query;

                // Se falhou por falta de coluna created_at, tenta novamente sem ordenar
                if (result.error && (result.error.message.includes('created_at') || result.error.code === '42703')) {
                    console.warn('[FormService] Coluna created_at ausente em activation_rules, tentando sem ordenação.');
                    let fallbackQuery = supabase
                        .from('activation_rules')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .limit(100);

                    if (signal) {
                        fallbackQuery = fallbackQuery.abortSignal(signal);
                    }

                    result = await fallbackQuery;
                }

                if (result.error && !result.error.message.includes('created_at')) {
                    console.warn('[FormService] Erro em activation_rules, tentando refresh de sessão:', result.error.message);
                    await supabase.auth.refreshSession();
                    let retryQuery = supabase
                        .from('activation_rules')
                        .select('*')
                        .eq('tenant_id', tenantId)
                        .limit(100);
                    if (signal) retryQuery = retryQuery.abortSignal(signal);
                    result = await retryQuery;
                }

                const { data, error } = result;

                if (error) {
                    console.warn('[FormService] activation_rules erro:', error.message);
                    throw new Error(`Erro ao buscar regras de ativação: ${error.message}`);
                }

                return (data || []).map(r => ({
                    ...r,
                    id: r.id,
                    serviceTypeId: r.service_type_id,
                    formId: r.form_template_id,
                    financialFormId: (r.conditions as any)?.financial_form_id || null,
                    equipmentFamily: (r.conditions as any)?.equipment_family || 'Todos'
                }));
            } catch (e) {
                console.error('[FormService] Erro ao buscar activation_rules:', e);
                throw e;
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
                        equipment_family: rule.equipmentFamily || 'Todos',
                        financial_form_id: rule.financialFormId || null
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
                            financialFormId: (retry.data.conditions as any)?.financial_form_id || null,
                            equipmentFamily: (retry.data.conditions as any)?.equipment_family || 'Todos'
                        };
                    }
                    throw error;
                }

                return {
                    id: data.id,
                    serviceTypeId: data.service_type_id,
                    formId: data.form_template_id,
                    financialFormId: (data.conditions as any)?.financial_form_id || null,
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
