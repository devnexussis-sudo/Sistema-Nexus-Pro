
import { CacheManager } from '../lib/cache';
import { adminAuthProxy, publicSupabase, supabase } from '../lib/supabase';
import { getCurrentTenantId } from '../lib/tenantContext';
import { UserRole } from '../types'; // Adjust import path if needed
import { StorageService } from './storageService';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);



// getServiceClient() REMOVIDO — use `supabase` diretamente (RLS ativo).
// Para operações de Auth Admin, use adminAuthProxy.

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
            last_latitude: d.last_latitude,
            last_longitude: d.last_longitude,
            last_seen: d.last_seen,
            speed: d.speed,
            battery_level: d.battery_level,
            batteryLevel: d.battery_level, // Alias for compatibility
            jobTitle: d.job_title
        };
    },

    getAllTechnicians: async (tenantIdOverride?: string | null, signal?: AbortSignal, skipCache = false): Promise<any[]> => {
        if (isCloudEnabled) {
            const tenantId = tenantIdOverride || getCurrentTenantId();
            if (!tenantId) return [];

            const cacheKey = `techs_${tenantId}`;
            if (!skipCache) {
                const cached = CacheManager.get<any[]>(cacheKey);
                if (cached) return cached;
            }

            // 🔄 Deduplication: Se já houver uma requisição em voo, espera por ela
            return CacheManager.deduplicate(cacheKey, async (currentSignal) => {
                let query = supabase.from('technicians')
                    .select('*')
                    .eq('tenant_id', tenantId)
                    .order('name')
                    .limit(100);

                if (currentSignal || signal) {
                    query = query.abortSignal((currentSignal || signal) as AbortSignal);
                }

                const { data, error } = await query;

                if (error) throw error;
                const result = (data || []).map(d => TechnicianService._mapTechFromDB(d));

                CacheManager.set(cacheKey, result, CacheManager.TTL.SHORT); // Reduzido para 1 min (Standard Cloud)
                return result;
            }, signal);
        }
        // Fallback local removido para focar na arquitetura cloud-first, mas poderia manter se necessário
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

            // 🔄 ESTRATÉGIA 2: Fallback (supabase anon — RLS via public_token ou função pública)
            try {
                const { data, error } = await publicSupabase
                    .from('technicians')
                    .select('id, name, avatar, tenant_id')
                    .eq('tenant_id', tenantId)
                    .eq('active', true)
                    .limit(100);

                if (error) {
                    console.error("❌ Erro ao buscar técnicos públicos (fallback):", error);
                    return [];
                }

                return (data || []).map(t => ({
                    ...t,
                    role: UserRole.TECHNICIAN,
                    email: '',
                    active: true,
                    tenantId: t.tenant_id
                }));
            } catch (fallbackErr) {
                console.error("❌ Erro crítico ao buscar técnicos:", fallbackErr);
                return [];
            }
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

        // 🧹 Cache Invalidation
        CacheManager.invalidate(`techs_${tenantId}`);

        if (isCloudEnabled) {
            // 🔍 Discovery Layer: Verifica se o e-mail já existe no Auth (Provisionamento Inteligente)
            let userId: string | null = null;
            let existingAuthUser: any = null;

            try {
                const { data: listData } = await adminAuthProxy.admin.listUsers();
                existingAuthUser = (listData.users || []).find(u => u.email?.toLowerCase() === tech.email.toLowerCase());

                if (existingAuthUser) {
                    userId = existingAuthUser.id;
                    console.log("📍 Usuário já federado no Auth. Vinculando ID existente:", userId);

                    // Se já existe, atualizamos apenas metadados para incluir o cargo técnico se necessário
                    await adminAuthProxy.admin.updateUserById(userId, {
                        user_metadata: {
                            ...existingAuthUser.user_metadata,
                            phone: tech.phone || existingAuthUser.user_metadata.phone
                        }
                    });
                }
            } catch (e) {
                console.warn("⚠️ Falha na busca prévia de usuários (Discovery):", e);
            }

            if (!userId) {
                // Provisionamento de novo usuário no Supabase Auth
                const tempPassword = Math.random().toString(36).slice(-10) + 'A1!'; // Gera senha aleatória segura
                const { data: authData, error: authError } = await adminAuthProxy.admin.createUser({
                    email: tech.email.toLowerCase(),
                    password: tempPassword,
                    user_metadata: {
                        name: tech.name,
                        role: UserRole.TECHNICIAN,
                        tenantId: tenantId,
                        phone: tech.phone || '',
                        avatar: tech.avatar || '',
                        jobTitle: tech.jobTitle || ''
                    },
                    email_confirm: true
                });

                if (authError) throw authError;
                userId = authData.user?.id || null;
            }

            if (!userId) throw new Error("ID de usuário não gerado.");

            // 1. Sincronizar com a tabela public.users (Base Profile)
            // Se o usuário já existe, não sobrescrevemos o papel (role) para não rebaixar um ADMIN para TECHNICIAN na base users
            // Apenas garantimos que o registro básico exista.
            const { data: existingDbUser } = await supabase.from('users').select('role').eq('id', userId).single();

            const dbUser: any = {
                id: userId,
                name: tech.name,
                email: tech.email.toLowerCase(),
                role: (existingDbUser?.role === UserRole.ADMIN || existingDbUser?.role === 'SUPER_ADMIN' as any)
                    ? existingDbUser.role
                    : UserRole.TECHNICIAN,
                active: tech.active ?? true,
                tenant_id: tenantId,
                avatar: tech.avatar || ''
            };

            const { error: userError } = await supabase.from('users').upsert([dbUser]);
            if (userError) {
                console.error("Erro ao sincronizar tabela users:", userError);
                throw userError;
            }

            // 2. Sincronizar com a tabela public.technicians
            const dbTech: any = {
                id: userId,
                name: tech.name,
                email: tech.email.toLowerCase(), // Pode falhar se não rodou a migração
                active: tech.active ?? true,
                phone: tech.phone || '',
                avatar: tech.avatar || '',
                job_title: tech.jobTitle || '',
                tenant_id: tenantId
            };

            const { error: techError } = await supabase.from('technicians').upsert([dbTech]);
            if (techError) {
                if (techError.code === '42703') { // Undefined column
                    throw new Error("Colunas faltantes na tabela 'technicians'. Por favor, execute a migração SQL mais recente no painel do Supabase.");
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
                updateAuthData.email = tech.email.toLowerCase();
            }

            const { error: authError } = await adminAuthProxy.admin.updateUserById(
                tech.id,
                updateAuthData
            );

            if (authError) {
                console.error("Erro ao atualizar Auth:", authError);
                throw authError;
            }

            // CONTROLE DE ACESSO: Bloqueia/Desbloqueia a conta no Auth baseado no status
            if (tech.active === false) {
                // Desabilita o técnico - bane a conta
                await adminAuthProxy.admin.updateUserById(tech.id, {
                    ban_duration: '876000h' // ~100 anos = banimento permanente
                } as any);
                console.log("🚫 Técnico bloqueado no sistema de autenticação");
            } else {
                // Reabilita o técnico - remove o banimento
                await adminAuthProxy.admin.updateUserById(tech.id, {
                    ban_duration: 'none'
                } as any);
                console.log("✅ Técnico reabilitado no sistema de autenticação");
            }

            // 2. Sincroniza com as tabelas físicas
            const dbData = {
                name: tech.name,
                email: tech.email?.toLowerCase(),
                active: tech.active ?? true,
                phone: tech.phone || '',
                avatar: tech.avatar || '',
                job_title: tech.jobTitle || '',
                tenant_id: tenantId
            };

            // Atualiza tabela users (base)
            await supabase.from('users').update(dbData).eq('id', tech.id).eq('tenant_id', tenantId);

            // Atualiza tabela technicians (específica)
            const { data, error } = await supabase.from('technicians')
                .update(dbData)
                .eq('id', tech.id)
                .eq('tenant_id', tenantId)
                .select()
                .single();

            if (error) {
                if (error.code === '42703') {
                    throw new Error("Colunas faltantes na tabela 'technicians'. Execute a migração SQL.");
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

                // 1. Upload da Imagem usando StorageService
                const publicUrl = await StorageService.uploadFile(base64Image, `technicians/${userId}/avatar`);

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
    }
};
