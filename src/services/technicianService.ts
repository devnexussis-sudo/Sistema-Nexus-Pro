
import { CacheManager } from '../lib/cache';
import { adminAuthProxy, publicSupabase, supabase } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';
import SessionStorage from '../lib/sessionStorage';
import { UserRole, AppScope } from '../types';
import { StorageService } from './storageService';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

// ─────────────────────────────────────────────────────────────
// 🔑 Nexus Tech Code Engine — Código Único do Técnico (6 dígitos numéricos)
// ─────────────────────────────────────────────────────────────

function _generateTechCode(): string {
    return String(Math.floor(100000 + Math.random() * 900000));
}

export async function generateUniqueUnifiedCode(tenantId: string): Promise<string> {
    for (let i = 0; i < 25; i++) {
        const code = _generateTechCode();
        const { count: techCount } = await supabase
            .from('technicians')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('tech_code', code);
            
        const { count: userCount } = await supabase
            .from('users')
            .select('id', { count: 'exact', head: true })
            .eq('tenant_id', tenantId)
            .eq('user_code', code);

        if ((techCount ?? 0) === 0 && (userCount ?? 0) === 0) {
            return code;
        }
    }
    return String(Date.now()).slice(-6);
}

async function _generateUniqueTechCode(tenantId: string): Promise<string> {
    return generateUniqueUnifiedCode(tenantId);
}

export function formatTechCode(code: string | undefined | null): string {
    if (!code || code === '---' || code.length > 10) return '---';
    return code;
}

export function formatUserCode(code: string | undefined | null): string {
    if (!code || code === '---' || code.length > 10) return '---';
    return code;
}

export const TechnicianService = {

    _mapTechFromDB: (d: any): any => {
        if (!d) return null;
        return {
            id: d.id,
            name: d.name,
            email: d.email,
            phone: d.phone,
            avatar: d.avatar,
            active: d.active,
            tenantId: d.tenant_id,
            techCode: d.tech_code,
            last_latitude: d.last_latitude,
            last_longitude: d.last_longitude,
            last_seen: d.last_seen,
            speed: d.speed,
            battery_level: d.battery_level,
            batteryLevel: d.battery_level,
            device_model: d.device_model,
            motion_state: d.motion_state,
            jobTitle: d.job_title
        };
    },

    getAllTechnicians: async (tenantIdOverride?: string | null, signal?: AbortSignal, skipCache = false): Promise<any[]> => {
        if (isCloudEnabled) {
            let tenantId = tenantIdOverride || getCurrentTenantId();
            if (!tenantId || tenantId === 'default' || tenantId === 'null') {
                tenantId = SessionStorage.get('current_tenant') || localStorage.getItem('nexus_current_tenant') || localStorage.getItem('nexus_tenant_id') || localStorage.getItem('tenant_id');
            }
            if (!tenantId || tenantId === 'default' || tenantId === 'null') {
                try {
                    const sessionRes = await supabase.auth.getSession();
                    const session = sessionRes?.data?.session;
                    tenantId = session?.user?.user_metadata?.tenantId || session?.user?.user_metadata?.tenant_id;
                } catch (e) {}
            }
            if (!tenantId || tenantId === 'default' || tenantId === 'null') {
                try {
                    const sessionRes = await supabase.auth.getSession();
                    const session = sessionRes?.data?.session;
                    if (session?.user?.id) {
                        const { data: dbUser } = await supabase.from('users').select('tenant_id').eq('id', session.user.id).maybeSingle();
                        if (dbUser?.tenant_id) tenantId = dbUser.tenant_id;
                    }
                } catch (e) {}
            }
            if (!tenantId || tenantId === 'default' || tenantId === 'null') {
                console.warn("⚠️ [TechnicianService.getAllTechnicians] TenantID não localizado.");
                return [];
            }

            const clientToUse = supabase;
            const cacheKey = `techs_${tenantId}`;

            if (!skipCache) {
                const cached = CacheManager.get<any[]>(cacheKey);
                if (cached && cached.length > 0) return cached;
            }

            const fetcher = async (currentSignal?: AbortSignal): Promise<any[]> => {
                let query = clientToUse.from('technicians')
                    .select('id, name, email, phone, avatar, active, tenant_id, tech_code, job_title, last_latitude, last_longitude, last_seen, motion_state, battery_level, device_model')
                    .eq('tenant_id', tenantId)
                    .order('name')
                    .limit(100);

                if (currentSignal || signal) {
                    query = query.abortSignal((currentSignal || signal) as AbortSignal);
                }

                let techData: any[] = [];
                let error: any = null;

                try {
                    const queryRes = await query;
                    if (queryRes) {
                        techData = queryRes.data || [];
                        error = queryRes.error;
                    }
                } catch (qErr: any) {
                    if (qErr?.name !== 'AbortError') {
                        console.warn("⚠️ Non-fatal notice querying technicians:", qErr?.message || qErr);
                    }
                }

                if (error) {
                    techData = [];
                }

                // Retorna apenas técnicos cadastrados na tabela `technicians` (isolamento completo de users)
                const result = (techData || []).map(d => TechnicianService._mapTechFromDB(d)).filter(Boolean);
                if (result && result.length > 0) {
                    CacheManager.set(cacheKey, result, CacheManager.TTL.SHORT);
                }
                return result;
            };

            if (skipCache) {
                return await fetcher(signal);
            }

            return CacheManager.deduplicate(cacheKey, fetcher, signal);
        }
        return [];
    },

    getPublicTechnicians: async (tenantId: string, retryCount = 0): Promise<any[]> => {
        if (isCloudEnabled) {
            // 🛡️ ESTRATÉGIA 1: Tentar RPC
            try {
                const { data, error } = await publicSupabase.rpc('get_public_technicians', { p_tenant_id: tenantId });

                if (!error && data) {
                    return (data || []).map((t: any) => ({
                        ...t,
                        role: UserRole.TECHNICIAN,
                        email: '',
                        active: true
                    }));
                }

            } catch (err: any) {
                if (err?.name === 'AbortError' || err?.message?.includes('Lock') || err?.message?.includes('aborted')) {
                    if (retryCount < 3) {
                        console.warn(`⚠️ Conflito de Lock no RPC técnicos (Tentativa ${retryCount + 1}). Retentando...`);
                        await new Promise(r => setTimeout(r, 1000 + (retryCount * 500)));
                        return TechnicianService.getPublicTechnicians(tenantId, retryCount + 1);
                    }
                }
                console.warn("⚠️ Erro RPC técnicos, usando fallback:", err);
            }

            // 🔄 Fallback removido por segurança - RPC é o único caminho autorizado
        }
        return [];
    },

    /**
     * Helper para checar email (precisa importar de AuthService idealmente, 
     * mas para prevenir dependência circular, replicamos check simples aqui ou assumimos que quem chama valida)
     * 
     * SIMPLIFICAÇÃO: O createTechnician valida o email internamente via Auth Admin API que joga erro se duplicado.
     */

    createTechnician: async (tech: any): Promise<any> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) throw new Error("ID da empresa não localizado.");

        // 🔒 LICENSE GUARD (Camada 1 de 2) — Verificação rápida no service antes de provisionar
        // A Camada 2 é o trigger no banco de dados que barra qualquer tentativa direta à API.
        if (isCloudEnabled && tech.active !== false) {
            const { data: tenantRow } = await supabase
                .from('tenants')
                .select('max_technicians, name, company_name')
                .eq('id', tenantId)
                .maybeSingle();

            const limit = tenantRow?.max_technicians ?? 0;

            if (limit > 0) {
                const { count } = await supabase
                    .from('technicians')
                    .select('id', { count: 'exact', head: true })
                    .eq('tenant_id', tenantId)
                    .eq('active', true);

                if ((count ?? 0) >= limit) {
                    const companyName = tenantRow?.name || tenantRow?.company_name || 'sua empresa';
                    throw new Error(
                        `🔒 Limite de licenças atingido: ${companyName} tem plano para até ${limit} técnico(s) ativo(s). ` +
                        `Contate o suporte DUNO para ampliar seu plano.`
                    );
                }
            }
        }

        // 🧹 Cache Invalidation
        CacheManager.invalidate(`techs_${tenantId}`);

        if (isCloudEnabled) {
            // 🔍 Discovery Layer Inteligente: Verifica se o e-mail já existe no Auth
            // Se o e-mail já pertence a um usuário do MESMO tenant, reutiliza a conta Auth (acesso duplo)
            // Se pertence a OUTRO tenant, bloqueia para evitar conflitos
            let userId: string | null = null;
            let existingAuthUser: any = null;

            const cleanEmail = (tech.email || '').trim().toLowerCase();
            try {
                const { data: listData } = await adminAuthProxy.admin.listUsers();
                existingAuthUser = (listData.users || []).find(u => u.email?.toLowerCase() === cleanEmail);

                if (existingAuthUser) {
                    const existingTenantId = existingAuthUser.user_metadata?.tenantId || existingAuthUser.user_metadata?.tenant_id;

                    if (existingTenantId === tenantId) {
                        // ✅ Mesmo tenant: reutiliza a conta Auth existente (o admin já existe como usuário do sistema)
                        userId = existingAuthUser.id;
                        console.log(`🔗 E-mail já existe no mesmo tenant. Reutilizando conta Auth ${userId} para cadastro de técnico.`);

                        // Verifica se já tem cadastro de técnico
                        const { data: existingTech } = await supabase.from('technicians').select('id').eq('id', userId).maybeSingle();
                        if (existingTech) {
                            throw new Error("Este técnico já está cadastrado no sistema. Para editar, utilize o botão de edição na lista de técnicos.");
                        }

                        // 🔄 DUAL-ROLE UPGRADE: Promove app_scope para HYBRID permitindo acesso Web + Mobile
                        // Atualiza a tabela public.users para HYBRID (acesso duplo)
                        const { error: scopeUpdateError } = await supabase
                            .from('users')
                            .update({ app_scope: AppScope.HYBRID })
                            .eq('id', userId);

                        if (scopeUpdateError) {
                            console.warn('⚠️ Falha ao atualizar app_scope para HYBRID na tabela users:', scopeUpdateError);
                        } else {
                            console.log(`✅ app_scope promovido para HYBRID no registro users (${userId}) — acesso Web + Mobile liberado.`);
                        }

                        // Atualiza o user_metadata no Supabase Auth para refletir acesso HYBRID
                        try {
                            const updatedMetadata = {
                                ...(existingAuthUser.user_metadata || {}),
                                app_scope: AppScope.HYBRID,
                                appScope: AppScope.HYBRID,
                            };
                            await adminAuthProxy.admin.updateUserById(userId, {
                                user_metadata: updatedMetadata
                            });
                            console.log(`✅ user_metadata.app_scope atualizado para HYBRID no Auth (${userId}).`);
                        } catch (metaErr) {
                            console.warn('⚠️ Falha ao atualizar user_metadata no Auth:', metaErr);
                        }
                    } else {
                        throw new Error("Este e-mail já está em uso por outra empresa. Para evitar conflitos de acesso, é necessário usar um outro e-mail.");
                    }
                }
            } catch (e: any) {
                if (e.message?.includes("já está em uso") || e.message?.includes("já está cadastrado")) throw e;
                console.warn("⚠️ Falha na busca prévia de usuários (Discovery):", e);
            }

            // 🔑 Gera ou obtém tech_code único do técnico
            const techCode = (tech.techCode && tech.techCode.length <= 10 && tech.techCode !== '— gerado ao salvar —')
                ? tech.techCode
                : (tech.tech_code && tech.tech_code.length <= 10 && tech.tech_code !== '— gerado ao salvar —')
                    ? tech.tech_code
                    : (await _generateUniqueTechCode(tenantId));

            if (!userId) {
                // Provisionamento de novo usuário no Supabase Auth (e-mail novo, nunca cadastrado)
                const tempPassword = Math.random().toString(36).slice(-10) + 'A1!';
                const { data: authData, error: authError } = await adminAuthProxy.admin.createUser({
                    email: cleanEmail,
                    password: tempPassword,
                    user_metadata: {
                        name: tech.name,
                        role: UserRole.TECHNICIAN,
                        tenantId: tenantId,
                        phone: tech.phone || '',
                        avatar: tech.avatar || '',
                        jobTitle: tech.jobTitle || '',
                        app_scope: AppScope.MOBILE,
                        user_code: techCode,
                        tech_code: techCode
                    },
                    email_confirm: true
                });

                if (authError) {
                    const errText = (authError.message || '').toLowerCase();
                    if (errText.includes('unable to validate email') || errText.includes('invalid format') || errText.includes('email address is invalid')) {
                        throw new Error("Formato de e-mail inválido. Por favor, verifique se digitou o endereço de e-mail corretamente.");
                    }
                    throw authError;
                }
                userId = authData.user?.id || null;
            }

            if (!userId) throw new Error("ID de usuário não gerado.");

            // Cadastro isolado: apenas na tabela public.technicians (sem sincronizar com public.users)
            const dbTech: any = {
                id: userId,
                name: tech.name,
                email: tech.email.toLowerCase(),
                active: tech.active ?? true,
                phone: tech.phone || '',
                avatar: tech.avatar || '',
                job_title: tech.jobTitle || '',
                tech_code: techCode,
                tenant_id: tenantId
            };

            const { error: techError } = await supabase.from('technicians').upsert([dbTech]);
            if (techError) {
                if (techError.code === '42703') { // Undefined column
                    throw new Error("Colunas faltantes na tabela 'technicians'. Por favor, execute a migração SQL mais recente no painel do Supabase.");
                }
                if (techError.message?.includes('technicians_id_fkey') || techError.message?.includes('foreign key constraint "technicians_id_fkey"')) {
                    throw new Error("Erro de banco de dados: a tabela 'technicians' ainda possui vínculo com a tabela legada 'users'. Por favor, execute a migração SQL '20261021_fix_technicians_foreign_key_to_auth.sql' no editor SQL do Supabase.");
                }
                // 🔒 Camada 2: Erro do trigger de limite de licenças no banco de dados
                if (techError.message?.includes('NEXUS_LICENSE_LIMIT')) {
                    const match = techError.message.match(/NEXUS_LICENSE_LIMIT: (.+)/);
                    throw new Error(match ? match[1] : '🔒 Limite de licenças de técnicos atingido. Contate o suporte DUNO para upgrade do plano.');
                }
                console.error("Erro ao sincronizar tabela technicians:", techError);
                throw techError;
            }

            return { ...dbTech, tenantId };
        }
        return tech;
    },

    updateTechnician: async (tech: any): Promise<any> => {
        const tenantId = getCurrentTenantId();
        if (!tenantId) throw new Error("ID da empresa não localizado.");

        // 🧹 Cache Invalidation
        CacheManager.invalidate(`techs_${tenantId}`);

        if (isCloudEnabled) {
            console.log("🔄 Atualizando técnico no Auth e na tabela...");

            // Verifica se este técnico também possui cadastro de usuário do sistema (acesso duplo)
            const { data: existingUser } = await supabase
                .from('users')
                .select('id, active')
                .eq('id', tech.id)
                .maybeSingle();

            const hasUserRecord = !!existingUser;

            // 1. Atualiza os metadados no Auth (se houver mudanças de nome, telefone, etc)
            const updateAuthData: any = {
                user_metadata: {
                    name: tech.name,
                    tenantId: tenantId,
                    phone: tech.phone || '',
                    avatar: tech.avatar || '',
                    jobTitle: tech.jobTitle || ''
                }
            };

            // Se o e-mail mudou, atualiza também
            if (tech.email) {
                updateAuthData.email = tech.email.trim().toLowerCase();
            }

            const { error: authError } = await adminAuthProxy.admin.updateUserById(
                tech.id,
                updateAuthData
            );

            if (authError) {
                console.error("Erro ao atualizar Auth:", authError);
                const errText = (authError.message || '').toLowerCase();
                if (errText.includes('unable to validate email') || errText.includes('invalid format') || errText.includes('email address is invalid')) {
                    throw new Error("Formato de e-mail inválido. Por favor, verifique se digitou o endereço de e-mail corretamente.");
                }
                throw authError;
            }

            // CONTROLE DE ACESSO: Bloqueia/Desbloqueia a conta no Auth baseado no status
            if (tech.active === false) {
                if (!hasUserRecord) {
                    // Técnico puro (sem cadastro de admin): desabilita a conta no Auth
                    await adminAuthProxy.admin.updateUserById(tech.id, {
                        ban_duration: '876000h' // ~100 anos = banimento permanente
                    } as any);
                    console.log("🚫 Técnico puro bloqueado no sistema de autenticação");
                } else {
                    // Técnico com cadastro de admin: NÃO bane a conta (preserva acesso ao painel)
                    await adminAuthProxy.admin.updateUserById(tech.id, {
                        ban_duration: 'none'
                    } as any);
                    console.log("ℹ️ Técnico com acesso Admin mantido no Auth (apenas status de técnico inativado)");
                }
            } else {
                // Reabilita o técnico - remove o banimento
                await adminAuthProxy.admin.updateUserById(tech.id, {
                    ban_duration: 'none'
                } as any);
                console.log("✅ Técnico reabilitado no sistema de autenticação");
            }

            // 🔑 Garante código único de 6 dígitos no update de técnico
            let techCode = (tech.techCode && tech.techCode.length <= 10 && tech.techCode !== '---' && tech.techCode !== '— gerado ao salvar —')
                ? tech.techCode
                : (tech.tech_code && tech.tech_code.length <= 10 && tech.tech_code !== '---' && tech.tech_code !== '— gerado ao salvar —')
                    ? tech.tech_code
                    : null;

            if (!techCode) {
                const { data: currentTechRow } = await supabase.from('technicians').select('tech_code').eq('id', tech.id).maybeSingle();
                if (currentTechRow?.tech_code && currentTechRow.tech_code.length <= 10 && currentTechRow.tech_code !== '---') {
                    techCode = currentTechRow.tech_code;
                }
            }
            if (!techCode) {
                const { data: currentUserRow } = await supabase.from('users').select('user_code').eq('id', tech.id).maybeSingle();
                if (currentUserRow?.user_code && currentUserRow.user_code.length <= 10 && currentUserRow.user_code !== '---') {
                    techCode = currentUserRow.user_code;
                }
            }
            if (!techCode) {
                techCode = await generateUniqueUnifiedCode(tenantId);
            }

            // Sincroniza metadados no Auth
            if (techCode) {
                adminAuthProxy.admin.updateUserById(tech.id, {
                    user_metadata: {
                        ...(updateAuthData.user_metadata || {}),
                        techCode: techCode,
                        tech_code: techCode,
                        userCode: techCode,
                        user_code: techCode
                    }
                }).catch(() => {});
            }

            // Atualiza apenas tabela technicians (cadastro isolado de users)
            const dbTechData: any = {
                name: tech.name,
                email: tech.email?.toLowerCase(),
                active: tech.active ?? true,
                phone: tech.phone || '',
                avatar: tech.avatar || '',
                job_title: tech.jobTitle || '',
                tenant_id: tenantId,
                tech_code: techCode || undefined
            };

            const { data, error } = await supabase.from('technicians')
                .update(dbTechData)
                .eq('id', tech.id)
                .eq('tenant_id', tenantId)
                .select()
                .single();

            if (error) {
                if (error.code === '42703') {
                    throw new Error("Colunas faltantes na tabela 'technicians'. Execute a migração SQL.");
                }
                // 🔒 Camada 2: Trigger do banco barrou a reativação por limite de licenças
                if (error.message?.includes('NEXUS_LICENSE_LIMIT')) {
                    const match = error.message.match(/NEXUS_LICENSE_LIMIT: (.+)/);
                    throw new Error(match ? match[1] : '🔒 Limite de licenças atingido. Não é possível reativar este técnico. Contate o suporte DUNO para upgrade do plano.');
                }
                throw error;
            }

            console.log("✅ Técnico atualizado com sucesso!");
            return { ...data, tenantId: data.tenant_id };
        }
        return tech;
    },

    /**
     * 📸 Atualiza o Avatar do Técnico
     */
    updateTechnicianAvatar: async (userId: string, base64Image: string): Promise<string> => {
        if (isCloudEnabled) {
            try {
                console.log(`[Avatar] 📸 Iniciando upload de avatar para ${userId}...`);

                let techName = userId;
                try {
                    const { data: techData } = await supabase.from('users').select('name').eq('id', userId).single();
                    if (techData?.name) {
                        techName = techData.name.replace(/[^a-zA-Z0-9\s]/g, '').trim() || userId;
                    }
                } catch(e) { }

                // 1. Upload da Imagem usando StorageService (Salva sob ${tenantId}/avatars/users/${userId}/...)
                const publicUrl = await StorageService.uploadUserAvatar(base64Image, userId);

                console.log(`[Avatar] ✅ Upload concluído: ${publicUrl}`);

                // 2. Atualiza a tabela technicians ou users
                // Tenta technicians primeiro
                const { error: techError } = await supabase
                    .from('technicians')
                    .update({ avatar: publicUrl })
                    .eq('id', userId);

                if (techError) {
                    console.warn("[Avatar] ⚠️ Falha ao atualizar tabela 'technicians', tentando 'users'...", techError.message);
                    const { error: userError } = await supabase
                        .from('users')
                        .update({ avatar: publicUrl })
                        .eq('id', userId);

                    if (userError) throw userError;
                }

                return publicUrl;
            } catch (error) {
                console.error("[Avatar] ❌ Erro ao atualizar avatar:", error);
                throw error;
            }
        }

        // Fallback Local
        return base64Image;
    },

    updateTechnicianLocation: async (techId: string, lat: number, lng: number, meta?: { accuracy?: number, speed?: number, heading?: number, batteryLevel?: number }): Promise<void> => {
        if (!isCloudEnabled) return;

        try {
            // 1. Tenta usar RPC V2 com Histórico (Mais seguro e rápido, bypass RLS)
            const { error: rpcError } = await supabase
                .rpc('update_tech_location_v2', {
                    p_lat: lat,
                    p_lng: lng,
                    p_accuracy: meta?.accuracy || null,
                    p_speed: meta?.speed || null,
                    p_heading: meta?.heading || null,
                    p_battery: meta?.batteryLevel || null
                });

            if (!rpcError) {
                // success
                return;
            }

            console.warn("[🚀 Nexus Sync] RPC V2 falhou, tentando fallback (sem histórico)...", rpcError);

            // 2. Fallback para Update direto (Apenas última posição, sem histórico)
            const { error } = await supabase
                .from('technicians')
                .update({
                    last_latitude: lat,
                    last_longitude: lng,
                    last_seen: new Date().toISOString()
                })
                .eq('id', techId);

            if (error) throw error;

        } catch (e) {
            console.error("[TechnicianService] Erro ao atualizar localização:", e);
        }
    },

    /**
     * 🔄 Backfill Engine — Atribui tech_code/user_code a técnicos e usuários que ainda não possuem.
     */
    backfillMissingCodes: async (): Promise<number> => {
        try {
            const { TenantService } = await import('./tenantService');
            return await TenantService.backfillMissingUserCodes();
        } catch (e) {
            console.warn("[TechnicianService] Backfill error:", e);
            return 0;
        }
    }
};
