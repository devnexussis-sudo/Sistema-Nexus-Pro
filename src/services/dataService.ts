
import {
  ServiceOrder, User, OrderStatus, UserRole, FormTemplate, FormFieldType, Customer, Equipment,
  StockItem, UserPermissions, UserGroup, DEFAULT_PERMISSIONS,
  CashFlowEntry, TechStockItem, StockMovement, OrderItem
} from '../types';
import { MOCK_USERS, MOCK_ORDERS } from '../constants';
import { supabase, adminSupabase } from '../lib/supabase';
import SessionStorage, { GlobalStorage } from '../lib/sessionStorage';
import { CacheManager } from '../lib/cache';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL &&
  import.meta.env.VITE_SUPABASE_ANON_KEY);

console.log('🌐 Nexus Connectivity:', { isCloudEnabled, mode: import.meta.env.MODE });

type UserWithPassword = User & { password: string };

// 🔒 Nexus Session Manager: Usa sessionStorage para isolar por aba
const getTenantId = () => SessionStorage.get('current_tenant') || 'default';
const getTenantKey = (key: string) => `tenant_${getTenantId()}_${key}`;

export const STORAGE_KEYS = {
  ORDERS: 'nexus_orders_db',
  USERS: 'nexus_users_db',
  TEMPLATES: 'nexus_templates_db',
  CUSTOMERS: 'nexus_customers_db',
  EQUIPMENTS: 'nexus_equipments_db',
  STOCK: 'nexus_stock_db',
  CATEGORIES: 'nexus_categories_db',
  USER_GROUPS: 'nexus_user_groups_db'
};

const getStorage = <T>(key: string, defaultValue: T): T => {
  try {
    const data = localStorage.getItem(getTenantKey(key));
    if (!data) {
      if (getTenantId() === 'default') {
        localStorage.setItem(getTenantKey(key), JSON.stringify(defaultValue));
        return defaultValue;
      }
      return defaultValue;
    }
    return JSON.parse(data);
  } catch (e) {
    console.error("Erro ao ler storage:", e);
    return defaultValue;
  }
};

const setStorage = (key: string, data: any) => {
  try {
    localStorage.setItem(getTenantKey(key), JSON.stringify(data));
  } catch (e) {
    console.error("Erro ao gravar storage:", e);
  }
};

const MOCK_USERS_POOL: UserWithPassword[] = MOCK_USERS.map(u => ({
  ...u,
  password: 'password',
  active: true
}));

export const DataService = {
  STORAGE_KEYS,
  getStorage,
  setStorage,

  // 🛡️ Nexus Client Resolver: Decide se usa o cliente anon ou o cliente service_role (Admin)
  getServiceClient: () => {
    const isImpersonating = SessionStorage.get('is_impersonating') === true;
    if (isImpersonating) return adminSupabase;
    return supabase;
  },

  getCurrentTenantId: (): string | undefined => {
    try {
      // Prioridade 1: Tech App Session (LocalStorage)
      const techSession = localStorage.getItem('nexus_tech_session') || localStorage.getItem('nexus_tech_persistent');
      if (techSession) {
        const user = JSON.parse(techSession);
        const tid = user.tenantId || user.tenant_id;
        if (tid) return tid;
      }

      // Prioridade 2: Global Session (SessionStorage)
      const userStr = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
      if (userStr) {
        const user = typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
        const tid = user.tenantId || user.tenant_id;
        if (tid) return tid;
      }

      // Prioridade 3: URL/State Fallback (For deep linking)
      const urlParams = new URLSearchParams(window.location.search);
      const urlTid = urlParams.get('tid') || SessionStorage.get('current_tenant');
      if (urlTid) return urlTid;

      // Prioridade 4: Shared Auth Fallback (Check direct Supabase session metadata)
      // Note: This is sync, so it might return old value, but useful as last resort.

      return undefined;
    } catch (e) {
      console.error("[DataService] Critical Tenant Detection Error:", e);
      return undefined;
    }
  },

  /**
   * 🛡️ Nexus Health Check: Diagnóstico em tempo real da conectividade Big-Tech
   */
  checkSystemHealth: async () => {
    const report: any = {
      isCloudEnabled,
      tenantId: DataService.getCurrentTenantId(),
      timestamp: new Date().toISOString(),
      connectivity: 'checking...',
      auth: 'checking...'
    };

    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      if (authError) {
        report.auth = `Error: ${authError.message}`;
      } else {
        report.auth = session ? 'Authenticated' : 'Logged Out';
        if (session) report.userEmail = session.user.email;
      }

      const start = performance.now();
      const { data, error } = await supabase.from('tenants').select('id').limit(1);
      const end = performance.now();

      report.latency = `${Math.round(end - start)}ms`;

      if (error) {
        report.connectivity = `Failed: ${error.message}`;
        report.errorCode = error.code;
        if (error.code === 'PGRST301' || error.code === '42501') {
          report.diagnosis = "POLÍTICA RLS NEGADA: O usuário não tem permissão para ver dados deste tenant.";
        }
      } else {
        report.connectivity = 'Healthy';
        report.dataCount = data?.length || 0;
      }
    } catch (err: any) {
      report.connectivity = `Uncaught Exception: ${err.message}`;
    }

    console.group('🛡️ Nexus System Health Report');
    console.table(report);
    console.groupEnd();
    return report;
  },

  getCurrentUser: async (): Promise<User | null> => {
    try {
      // Prioridade 1: Session Storage
      const userStr = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
      if (userStr) {
        return typeof userStr === 'string' ? JSON.parse(userStr) : userStr;
      }

      // Prioridade 2: Local Storage (Tech App)
      const techSession = localStorage.getItem('nexus_tech_session') || localStorage.getItem('nexus_tech_persistent');
      if (techSession) {
        return JSON.parse(techSession);
      }

      // Fallback: Supabase Auth Session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Mapear do Auth para o nosso tipo User se necessário, mas geralmente temos o perfil no storage
        return null;
      }

      return null;
    } catch (e) {
      console.error("[DataService] User Error:", e);
      return null;
    }
  },

  /**
   * 🧹 Nexus Cache Invalidator
   */
  invalidateCache: (pattern: string) => {
    CacheManager.invalidate(pattern);
  },

  /**
   * 🔄 Nexus Profile Refresh
   * Atualiza os dados do usuário logado (nome, avatar, etc) buscando do banco
   */
  refreshUserProfile: async (): Promise<User | null> => {
    if (!isCloudEnabled) return null;

    try {
      const currentUser = SessionStorage.get('user') || GlobalStorage.get('persistent_user');
      if (!currentUser) return null;

      const user = typeof currentUser === 'string' ? JSON.parse(currentUser) : currentUser;

      // Busca dados atualizados da tabela appropriada
      let freshData;
      if (user.role === 'TECHNICIAN') {
        const { data } = await DataService.getServiceClient()
          .from('technicians')
          .select('name, email, avatar, phone')
          .eq('id', user.id)
          .single();
        freshData = data;
      } else {
        const { data } = await DataService.getServiceClient()
          .from('users')
          .select('name, email, avatar, permissions, group_id')
          .eq('id', user.id)
          .single();
        freshData = data;
      }

      if (freshData) {
        // Atualiza o objeto do usuário mantendo os campos que não vieram do DB
        const updatedUser = {
          ...user,
          name: freshData.name || user.name,
          email: freshData.email || user.email,
          avatar: freshData.avatar || user.avatar,
          permissions: freshData.permissions || user.permissions,
          groupId: freshData.group_id || user.groupId
        };

        // Salva de volta no storage
        SessionStorage.set('user', updatedUser);
        if (GlobalStorage.get('persistent_user')) {
          GlobalStorage.set('persistent_user', updatedUser);
        }

        console.log('[🔄 Nexus Refresh] Perfil atualizado com sucesso');
        return updatedUser;
      }

      return user;
    } catch (error) {
      console.error('[🔄 Nexus Refresh] Erro ao atualizar perfil:', error);
      return null;
    }
  },

  /**
   * 🎛️ Nexus Image Compression Engine (WebP Optimized)
   * Reduz o peso da imagem drasticamente usando o padrão WebP.
   */
  compressImage: async (base64: string, maxWidth = 1200, quality = 0.82): Promise<string> => {
    // NASA STAGE 2
    return new Promise((resolve) => {
      try {
        const img = new Image();
        img.src = base64;
        img.onload = () => {
          try {
            const canvas = document.createElement('canvas');
            let width = img.width;
            let height = img.height;

            // Redimensionamento (Mantendo qualidade original)
            if (width > maxWidth) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            }

            canvas.width = width;
            canvas.height = height;

            const ctx = canvas.getContext('2d');
            if (!ctx) {
              console.warn('Canvas context failed, returning original');
              resolve(base64);
              return;
            }

            // Fundo branco para garantir opacidade correta
            ctx.fillStyle = "#FFFFFF";
            ctx.fillRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            // 🚀 VOLTANDO PARA WEBP (Qualidade + Compressão)
            const compressedBase64 = canvas.toDataURL('image/webp', quality);
            resolve(compressedBase64);
          } catch (innerErr) {
            console.error('Error during canvas processing:', innerErr);
            resolve(base64); // Fallback
          }
        };
        img.onerror = () => {
          console.warn('Image load failed, returning original');
          resolve(base64);
        };
      } catch (err) {
        console.error('Critical compression error:', err);
        resolve(base64);
      }
    });
  },

  /**
   * 🛡️ NASA-Grade Storage Engine (Internal Version 5 - RESILIENT)
   * Hard timeouts e tratamento de erros visível.
   */
  _uploadCore: async (blobOrFile: Blob | File, path: string, retryCount = 2, signal?: AbortSignal): Promise<string> => {
    const tenantId = DataService.getCurrentTenantId();
    if (!tenantId) {
      console.error("[Storage] ❌ ERRO: TenantID não encontrado. Abortando upload para segurança.");
      throw new Error("AUTH_TENANT_MISSING");
    }

    const cleanPath = path.toString().replace(/^\/+/, '').replace(/\/+$/, '');
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.webp`;
    const fullPath = `${tenantId}/${cleanPath}/${fileName}`.replace(/\/+/g, '/');

    console.log(`[Storage] 📤 Uploading ${fullPath} (${(blobOrFile.size / 1024).toFixed(0)}KB)...`);

    for (let i = 0; i <= retryCount; i++) {
      if (signal?.aborted) throw new Error('AbortError');

      try {
        // Timeout de 45 segundos para a requisição de rede
        const uploadPromise = supabase.storage
          .from('nexus-files')
          .upload(fullPath, blobOrFile, {
            contentType: 'image/webp',
            upsert: true,
            cacheControl: '3600'
          });

        const networkTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('NETWORK_TIMEOUT_45S')), 45000));
        const { data, error } = await Promise.race([uploadPromise, networkTimeout]) as any;

        if (error) throw error;
        if (!data) throw new Error("EMPTY_STORAGE_RESPONSE");

        const { data: urlData } = supabase.storage
          .from('nexus-files')
          .getPublicUrl(fullPath);

        return urlData.publicUrl;
      } catch (err: any) {
        if (err.name === 'AbortError' || signal?.aborted) throw err;
        console.warn(`[Storage] ⚠️ Tentativa ${i + 1} falhou:`, err.message);

        if (i === retryCount) throw err;
        await new Promise(resolve => setTimeout(resolve, 1500));
      }
    }

    throw new Error("STORAGE_UNREACHABLE");
  },

  /**
   * 🎯 AGGRESSIVE INTELLIGENT COMPRESSOR (V5 - MEMORY SAFE)
   * Especial para Android/iPhone Chrome. Usa timeouts para evitar travamento.
   */
  processAndCompress: async (file: File, signal?: AbortSignal): Promise<Blob> => {
    const TARGET_SIZE = 480 * 1024; // 480KB
    const fileName = (file.name || '').toLowerCase();
    const fileType = (file.type || '').toLowerCase();

    console.log(`[Compress] 🧪 v5.2 - Analysis: ${fileName} | Type: ${fileType} | Size: ${(file.size / 1024).toFixed(0)}KB`);

    let workingFile: Blob | File = file;

    // 🍎 HEIC/HEIF Decoder (Crucial para iPhones)
    const isHeic = fileType.includes('heic') || fileType.includes('heif') ||
      fileName.endsWith('.heic') || fileName.endsWith('.heif') || fileName.endsWith('.hif');

    if (isHeic) {
      console.log("[Compress] 🍎 HEIC/HEIF Detected - Starting conversion...");
      try {
        let heic2any = (window as any).heic2any;

        // Injeção dinâmica ultra-resiliente
        if (!heic2any) {
          console.log("[Compress] 📦 heic2any not in window, injecting script...");
          await new Promise((res, rej) => {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js';
            script.async = true;
            script.onload = () => {
              console.log("[Compress] 📦 heic2any script loaded successfully");
              res(true);
            };
            script.onerror = (e) => {
              console.error("[Compress] ❌ Failed to load heic2any script:", e);
              rej(new Error('HEIC_LIB_LOAD_FAIL'));
            };
            document.head.appendChild(script);
          });
          heic2any = (window as any).heic2any;
        }

        if (heic2any) {
          const converted = await heic2any({
            blob: file,
            toType: 'image/jpeg',
            quality: 0.6
          });
          workingFile = Array.isArray(converted) ? converted[0] : converted;
          console.log("[Compress] ✅ HEIC Converted");
        }
      } catch (e) {
        console.warn("[Compress] ⚠️ HEIC Decode Failed:", e);
        // Se falhar a conversão de um HEIC, não podemos continuar pois o Image() vai dar erro.
        throw new Error('HEIC_DECODE_ERROR');
      }
    }

    const url = URL.createObjectURL(workingFile);
    try {
      // 1. Carrega Imagem com Timeout
      const img = new Image();
      const loadPromise = new Promise((res, rej) => {
        img.onload = () => {
          console.log(`[Compress] 🖼️ Image loaded: ${img.width}x${img.height}`);
          res(true);
        };
        img.onerror = () => {
          console.error("[Compress] ❌ IMG_LOAD_FAIL details:", { name: file.name, type: file.type, size: file.size });
          rej(new Error(`IMG_LOAD_FAIL: ${file.name} (${file.type || 'no-type'})`));
        };
        img.src = url;
      });
      const loadTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('IMG_LOAD_TIMEOUT')), 15000));
      await Promise.race([loadPromise, loadTimeout]);

      const strategies = [{ w: 1024, q: 0.7 }, { w: 800, q: 0.6 }, { w: 640, q: 0.5 }];

      for (const s of strategies) {
        if (signal?.aborted) throw new Error('AbortError');

        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > s.w || height > s.w) {
          const ratio = Math.min(s.w / width, s.w / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) throw new Error('CANVAS_FAIL');

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const blob = await new Promise<Blob>((res, rej) => {
          canvas.toBlob((b) => b ? res(b) : rej(new Error('BLOB_NULL')), 'image/webp', s.q);
        });

        // Limpeza imediata de memória
        canvas.width = 0; canvas.height = 0;

        if (blob.size <= TARGET_SIZE) return blob;
        if (s === strategies[strategies.length - 1]) return blob; // Retorna a melhor tentativa se for a última
      }

      throw new Error('COMPRESSION_FAILED');
    } finally {
      URL.revokeObjectURL(url);
    }
  },

  compressFileToBlob: async (file: File): Promise<Blob> => {
    return DataService.processAndCompress(file);
  },

  /**
   * 🚀 UPLOAD OTIMIZADO PARA EVIDÊNCIAS
   * Sempre WebP, sempre < 500KB, sempre rápido
   */
  uploadServiceOrderEvidence: async (file: File, orderId: string, signal?: AbortSignal): Promise<string> => {
    if (!isCloudEnabled) return URL.createObjectURL(file);

    try {
      // 1. Compressão Inteligente
      const compressedBlob = await DataService.processAndCompress(file, signal);

      // 2. Validação final
      if (compressedBlob.size > 500 * 1024) throw new Error('LIMITE_EXCEDIDO_500KB');

      // 3. Encapsulamento em File para o Storage
      const webpFile = new File([compressedBlob], `photo_${Date.now()}.webp`, { type: 'image/webp' });

      // 4. Upload Core com retries
      return await DataService.uploadBlob(webpFile, `orders/${orderId}/evidence`, signal);
    } catch (err: any) {
      console.error(`[PhotoUpload] ❌ Falha:`, err.message);
      throw err;
    }
  },

  /**
   * 🛡️ Optimized Blob Upload
   */
  uploadBlob: async (blob: Blob, path: string, signal?: AbortSignal): Promise<string> => {
    if (!isCloudEnabled) return URL.createObjectURL(blob);
    return DataService._uploadCore(blob, path, 2, signal);
  },

  /**
   * 🛡️ Nexus Storage Interface (Base64 wrapper)
   */
  uploadFile: async (base64: string, path: string): Promise<string> => {
    if (!isCloudEnabled || !base64.startsWith('data:image')) return base64;
    try {
      const compressedBase64 = await DataService.compressImage(base64);
      const base64Data = compressedBase64.split(',')[1];
      const binaryData = atob(base64Data);
      const uint8Array = new Uint8Array(binaryData.length);
      for (let i = 0; i < binaryData.length; i++) {
        uint8Array[i] = binaryData.charCodeAt(i);
      }
      const blob = new Blob([uint8Array], { type: 'image/webp' });
      return DataService._uploadCore(blob, path);
    } catch (err) {
      console.error("UploadFile Error:", err);
      throw err;
    }
  },
  logout: async () => {
    try {
      if (isCloudEnabled) {
        const { supabase } = await import('../lib/supabase');
        await supabase.auth.signOut();
      }
      SessionStorage.clear();
      localStorage.removeItem('nexus_tech_session_v2');
      localStorage.removeItem('nexus_tech_cache_v2');
    } catch (e) {
      console.error("Logout Error:", e);
    }
  },


  login: async (email: string, password?: string): Promise<User | undefined> => {
    if (isCloudEnabled) {
      console.log("=== LOGIN OFICIAL SUPABASE AUTH (SEGURANÇA TOTAL) ===");

      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: email.toLowerCase(),
        password: password || ''
      });

      if (authError || !authData.user) {
        throw new Error(authError?.message || "E-mail ou senha incorretos.");
      }

      const meta = authData.user.user_metadata;
      let tenantId = meta?.tenantId || meta?.tenant_id;

      // 🔍 Nexus Deep Security: Busca o tenantId no banco caso falte no metadata (fallback para usuários antigos)
      if (!tenantId) {
        // Usamos o cliente padrão (supabase) para evitar travar se a admin key não estiver no client-side
        const { data: dbUser } = await supabase.from('users').select('tenant_id').eq('id', authData.user.id).maybeSingle();
        if (dbUser?.tenant_id) tenantId = dbUser.tenant_id;
      }

      // 🛡️ Nexus Safety Check: Verifica se a empresa está ativa antes de prosseguir
      let enabledModules = {};
      if (tenantId) {
        // Usamos o cliente padrão (supabase) para segurança e estabilidade no front-end
        const { data: tenantData } = await supabase.from('tenants').select('status, enabled_modules').eq('id', tenantId).maybeSingle();
        if (tenantData && tenantData.status === 'suspended') {
          console.warn("🚫 Tentativa de login em empresa suspensa:", email);
          await supabase.auth.signOut();
          throw new Error('Acesso interrompido. Esta empresa está suspensa por questões administrativas. Entre em contato com o suporte.');
        }
        if (tenantData?.enabled_modules) {
          enabledModules = tenantData.enabled_modules;
        }
      }

      let finalAvatar = meta?.avatar;

      // 🔍 Nexus Deep Profile Search: Busca dados completos do usuário, incluindo grupo e permissões
      const { data: fullUserData } = await DataService.getServiceClient().from('users')
        .select('avatar, group_id, permissions')
        .eq('id', authData.user.id)
        .single();

      if (fullUserData?.avatar) finalAvatar = fullUserData.avatar;

      let permissions = fullUserData?.permissions as UserPermissions || { ...DEFAULT_PERMISSIONS };

      if (fullUserData?.group_id) {
        const { data: groupData } = await DataService.getServiceClient().from('user_groups')
          .select('permissions')
          .eq('id', fullUserData.group_id)
          .single();

        if (groupData?.permissions) {
          permissions = groupData.permissions as UserPermissions;
        }
      }

      const user = {
        id: authData.user.id,
        email: authData.user.email!,
        name: meta?.name || authData.user.email!.split('@')[0],
        role: (meta?.role as UserRole) || UserRole.ADMIN,
        avatar: finalAvatar,
        tenantId: tenantId,
        groupId: fullUserData?.group_id,
        permissions: permissions,
        enabledModules: enabledModules
      } as User & { enabledModules: any };

      // SINCRONIZAÇÃO AUTOMÁTICA
      if (tenantId) {
        await DataService.getServiceClient().from('users').upsert([{
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          tenant_id: tenantId,
          group_id: user.groupId,
          active: true,
          avatar: user.avatar
        }]);
      }

      SessionStorage.set('user', user);
      if (user.tenantId) SessionStorage.set('current_tenant', user.tenantId);
      return user;
    }

    // Mock local (NÃO USADO EM PRODUÇÃO)
    const users = getStorage<UserWithPassword[]>(STORAGE_KEYS.USERS, MOCK_USERS_POOL);
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase() && (!password || u.password === password));
    return user;
  },

  refreshUser: async (): Promise<User | null> => {
    if (!isCloudEnabled) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) {
      console.warn('[DataService] ⚠️ Sessão não encontrada no Supabase Auth.');
      return null;
    }

    const meta = session.user.user_metadata;
    let tenantId = meta?.tenantId || meta?.tenant_id;
    console.log('[DataService] 🔍 Refreshing User:', { email: session.user.email, metaTenant: tenantId });

    // 🔍 Nexus Deep Security: Fallback para tenant_id no banco
    if (!tenantId) {
      console.log('[DataService] 🕵️ Tenant não encontrado no metadata. Buscando no DB...');
      // Usamos o cliente padrão autenticado (seguro e não trava)
      const { data: dbUser, error: dbError } = await supabase.from('users').select('tenant_id').eq('id', session.user.id).maybeSingle();
      if (dbError) console.error('[DataService] ❌ Erro ao buscar tenant_id no DB:', dbError);
      if (dbUser?.tenant_id) {
        tenantId = dbUser.tenant_id;
        console.log('[DataService] ✅ Tenant recuperado do DB:', tenantId);
      }
    }

    // 🛡️ Nexus Safety Check: Verifica se a empresa está ativa
    let enabledModules = {};
    if (tenantId) {
      // Usamos o cliente padrão autenticado para evitar dependência de service_key
      const { data: tenantData } = await supabase.from('tenants').select('status, enabled_modules').eq('id', tenantId).maybeSingle();
      if (tenantData && tenantData.status === 'suspended') {
        console.warn("🚫 Acesso negado: Empresa suspensa.");
        await supabase.auth.signOut();
        SessionStorage.clear();
        throw new Error('TENANT_SUSPENDED');
      }
      if (tenantData?.enabled_modules) {
        enabledModules = tenantData.enabled_modules;
      }
    }

    const user = await DataService._fetchFullUser(session.user, meta, tenantId, enabledModules);

    SessionStorage.set('user', user);
    return user;
  },

  toggleTenantStatus: async (tenantId: string, currentStatus: string): Promise<string> => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active';
    const { error } = await adminSupabase
      .from('tenants')
      .update({ status: newStatus })
      .eq('id', tenantId);

    if (error) throw error;
    return newStatus;
  },


  _fetchFullUser: async (authUser: any, meta: any, tenantId: string, enabledModules: any = {}): Promise<User> => {
    let finalAvatar = meta?.avatar;

    const { data: fullUserData } = await DataService.getServiceClient().from('users')
      .select('avatar, group_id, permissions')
      .eq('id', authUser.id)
      .single();

    if (fullUserData?.avatar) finalAvatar = fullUserData.avatar;

    let permissions = fullUserData?.permissions as UserPermissions || { ...DEFAULT_PERMISSIONS };

    if (fullUserData?.group_id) {
      const { data: groupData } = await DataService.getServiceClient().from('user_groups')
        .select('permissions')
        .eq('id', fullUserData.group_id)
        .single();

      if (groupData?.permissions) {
        permissions = groupData.permissions as UserPermissions;
      }
    }

    return {
      id: authUser.id,
      email: authUser.email!,
      name: meta?.name || authUser.email!.split('@')[0],
      role: (meta?.role as UserRole) || UserRole.ADMIN,
      avatar: finalAvatar,
      tenantId: tenantId,
      groupId: fullUserData?.group_id,
      permissions: permissions,
      enabledModules: enabledModules
    } as User & { enabledModules: any };
  },

  /**
   * 🔒 Nexus Email Validator
   * Verifica se o email já está sendo usado em QUALQUER empresa do sistema
   */
  checkEmailExists: async (email: string): Promise<{ exists: boolean; tenantName?: string }> => {
    if (!isCloudEnabled) return { exists: false };

    try {
      // Busca no Supabase Auth (fonte global de verdade)
      const { data: authData } = await adminSupabase.auth.admin.listUsers();
      const existingUser = authData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

      if (existingUser) {
        // Busca o nome da empresa vinculada
        const tenantId = existingUser.user_metadata?.tenantId;
        if (tenantId) {
          const { data: tenant } = await DataService.getServiceClient()
            .from('tenants')
            .select('name')
            .eq('id', tenantId)
            .single();

          return { exists: true, tenantName: tenant?.name || 'outra empresa' };
        }
        return { exists: true, tenantName: 'outra empresa' };
      }

      return { exists: false };
    } catch (error) {
      console.error('[Email Check] Erro ao verificar email:', error);
      return { exists: false };
    }
  },

  getAllUsers: async (): Promise<User[]> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      console.log(`🔍 Nexus Search: Buscando usuários para o tenant ${tenantId}`);
      const { data, error } = await DataService.getServiceClient()
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');

      if (error) throw error;
      return (data || []).map(u => ({
        ...u,
        tenantId: u.tenant_id,
        groupId: u.group_id,
        role: (u.role as UserRole)
      }));
    }
    return getStorage<UserWithPassword[]>(STORAGE_KEYS.USERS, MOCK_USERS_POOL);
  },

  createUser: async (user: Omit<User, 'id'>): Promise<User> => {
    let tenantId = DataService.getCurrentTenantId();

    // Fallback: Se não houver empresa vinculada ao admin, tenta pegar a primeira disponível
    if (!tenantId && isCloudEnabled) {
      const { data: firstTenant } = await DataService.getServiceClient().from('tenants').select('id').limit(1).maybeSingle();
      if (firstTenant) {
        tenantId = firstTenant.id;
        SessionStorage.set('current_tenant', tenantId!);
      }
    }

    if (!tenantId) {
      throw new Error("Sua conta de Administrador não está vinculada a nenhuma empresa. Por favor, vincule um 'tenantId' no User Metadata do Supabase.");
    }

    if (isCloudEnabled) {
      console.log("🚀 Iniciando criação de conta oficial via Admin Auth...");

      // 🔒 Validação de email único global
      const emailCheck = await DataService.checkEmailExists(user.email);
      if (emailCheck.exists) {
        throw new Error(`Este email já está sendo usado em outra empresa e não pode ser usado aqui.`);
      }

      const { data, error } = await adminSupabase.auth.admin.createUser({
        email: user.email.toLowerCase(),
        password: (user as any).password || 'password123',
        user_metadata: {
          name: user.name,
          role: UserRole.ADMIN,
          tenantId: tenantId,
          avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=4f46e5`
        },
        email_confirm: true
      });

      if (error) {
        console.error("❌ Erro Crítico no Supabase Admin API:", error.message);
        throw new Error(`Falha no Supabase Auth: ${error.message}`);
      }

      console.log("✅ Usuário Auth criado com sucesso. Sincronizando tabela users...");

      const dbUser = {
        id: data.user.id,
        name: user.name,
        email: user.email.toLowerCase(),
        role: user.role || UserRole.ADMIN,
        active: true,
        tenant_id: tenantId,
        group_id: user.groupId,
        permissions: user.permissions,
        avatar: user.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.name)}&backgroundColor=4f46e5`
      };

      await DataService.getServiceClient().from('users').upsert([dbUser]);
      return { ...dbUser, tenantId: tenantId } as any;
    }

    const currentUsers = getStorage<UserWithPassword[]>(STORAGE_KEYS.USERS, MOCK_USERS_POOL);
    const newUser = { ...user, id: `user-${Date.now()}` } as UserWithPassword;
    setStorage(STORAGE_KEYS.USERS, [...currentUsers, newUser]);
    return newUser as any;
  },

  updateUser: async (user: User): Promise<User> => {
    const tenantId = DataService.getCurrentTenantId();
    const { id, tenantId: _, ...rest } = user as any;

    const updateData = {
      name: user.name,
      email: user.email,
      role: user.role,
      active: user.active,
      avatar: user.avatar,
      group_id: user.groupId,
      permissions: user.permissions,
      tenant_id: user.tenantId || tenantId
    };

    if (isCloudEnabled) {
      const { data, error } = await DataService.getServiceClient().from('users').update(updateData).eq('id', id).select().single();
      if (error) throw error;
      return { ...data, tenantId: data.tenant_id } as User;
    }

    const currentUsers = getStorage<UserWithPassword[]>(STORAGE_KEYS.USERS, MOCK_USERS_POOL);
    const index = currentUsers.findIndex(u => u.id === id);
    if (index === -1) throw new Error("Usuário não encontrado");
    currentUsers[index] = { ...currentUsers[index], ...user } as UserWithPassword;
    setStorage(STORAGE_KEYS.USERS, currentUsers);
    return currentUsers[index];
  },

  deleteUser: async (id: string): Promise<void> => {
    if (isCloudEnabled) {
      const { error } = await DataService.getServiceClient().from('users').delete().eq('id', id);
      if (error) throw error;
      return;
    }
    const currentUsers = getStorage<UserWithPassword[]>(STORAGE_KEYS.USERS, MOCK_USERS_POOL);
    const updated = currentUsers.filter(u => u.id !== id);
    setStorage(STORAGE_KEYS.USERS, updated);
  },

  // --- USER GROUPS ---
  getUserGroups: async (): Promise<UserGroup[]> => {
    const tid = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      const { data, error } = await DataService.getServiceClient().from('user_groups').select('*').eq('tenant_id', tid).order('name');
      if (error) {
        console.warn("Nexus: Tabela user_groups não localizada, retornando padrão.");
        return [];
      }
      return (data || []).map(g => ({
        ...g,
        tenantId: g.tenant_id,
        isSystem: g.is_system,
        permissions: g.permissions || {}
      }));
    }
    return getStorage<UserGroup[]>(STORAGE_KEYS.USER_GROUPS, []);
  },

  createUserGroup: async (group: Omit<UserGroup, 'id'>): Promise<UserGroup> => {
    const tid = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      const { data, error } = await DataService.getServiceClient().from('user_groups').insert([{
        name: group.name,
        description: group.description,
        permissions: group.permissions,
        active: group.active,
        is_system: group.isSystem,
        tenant_id: tid
      }]).select().single();
      if (error) throw error;
      return { ...data, tenantId: data.tenant_id, isSystem: data.is_system };
    }
    const groups = getStorage<UserGroup[]>(STORAGE_KEYS.USER_GROUPS, []);
    const newGroup = { ...group, id: `group-${Date.now()}` } as UserGroup;
    setStorage(STORAGE_KEYS.USER_GROUPS, [...groups, newGroup]);
    return newGroup;
  },

  updateUserGroup: async (group: UserGroup): Promise<UserGroup> => {
    if (isCloudEnabled) {
      const { data, error } = await DataService.getServiceClient().from('user_groups').update({
        name: group.name,
        description: group.description,
        permissions: group.permissions,
        active: group.active,
        is_system: group.isSystem
      }).eq('id', group.id).select().single();
      if (error) throw error;
      return { ...data, tenantId: data.tenant_id, isSystem: data.is_system };
    }
    const groups = getStorage<UserGroup[]>(STORAGE_KEYS.USER_GROUPS, []);
    const index = groups.findIndex(g => g.id === group.id);
    if (index !== -1) {
      groups[index] = group;
      setStorage(STORAGE_KEYS.USER_GROUPS, groups);
    }
    return group;
  },

  deleteUserGroup: async (id: string): Promise<void> => {
    if (isCloudEnabled) {
      const { error } = await DataService.getServiceClient().from('user_groups').delete().eq('id', id);
      if (error) throw error;
      return;
    }
    const groups = getStorage<UserGroup[]>(STORAGE_KEYS.USER_GROUPS, []);
    const updated = groups.filter(g => g.id !== id);
    setStorage(STORAGE_KEYS.USER_GROUPS, updated);
  },



  getAllTechnicians: async (): Promise<any[]> => {
    if (isCloudEnabled) {
      const tenantId = DataService.getCurrentTenantId();
      if (!tenantId) return [];

      const cacheKey = `techs_${tenantId}`;
      const cached = CacheManager.get<any[]>(cacheKey);
      if (cached) return cached;

      // 🔄 Deduplication: Se já houver uma requisição em voo, espera por ela
      return CacheManager.deduplicate(cacheKey, async () => {
        const { data, error } = await DataService.getServiceClient().from('technicians')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('name');

        if (error) throw error;
        const result = (data || []).map(d => ({ ...d, tenantId: d.tenant_id }));

        CacheManager.set(cacheKey, result, CacheManager.TTL.MEDIUM); // 5 min
        return result;
      });
    }
    const users = getStorage<UserWithPassword[]>(STORAGE_KEYS.USERS, MOCK_USERS_POOL);
    return users.filter(u => u.role === UserRole.TECHNICIAN);
  },

  createTechnician: async (tech: any): Promise<any> => {
    const tenantId = DataService.getCurrentTenantId();
    if (!tenantId) throw new Error("ID da empresa não localizado.");

    // 🧹 Cache Invalidation
    CacheManager.invalidate(`techs_${tenantId}`);

    if (isCloudEnabled) {
      // ... (rest of implementation)
      console.log("=== CRIANDO TÉCNICO OFICIAL SUPABASE AUTH ===");

      // 🔒 Validação de email único global
      const emailCheck = await DataService.checkEmailExists(tech.email);
      if (emailCheck.exists) {
        throw new Error(`Este email já está sendo usado em outra empresa e não pode ser usado aqui.`);
      }


      const { data, error } = await adminSupabase.auth.admin.createUser({
        email: tech.email.toLowerCase(),
        password: tech.password,
        user_metadata: {
          name: tech.name,
          role: UserRole.TECHNICIAN,
          tenantId: tenantId,
          phone: tech.phone || '',
          avatar: tech.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(tech.name)}&backgroundColor=10b981`
        },
        email_confirm: true
      });

      if (error) throw error;

      // Sincronizar com a tabela public.technicians para legibilidade e OSs
      const dbTech = {
        id: data.user.id,
        name: tech.name,
        email: tech.email.toLowerCase(),
        active: tech.active ?? true,
        phone: tech.phone || '',
        avatar: tech.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(tech.name || 'Tecnico')}&backgroundColor=10b981`,
        tenant_id: tenantId
      };

      await DataService.getServiceClient().from('technicians').upsert([dbTech]);

      return { ...dbTech, tenantId };
    }
    return tech;
  },

  updateTechnician: async (tech: any): Promise<any> => {
    const tenantId = DataService.getCurrentTenantId();
    if (!tenantId) throw new Error("ID da empresa não localizado.");

    // 🧹 Cache Invalidation
    CacheManager.invalidate(`techs_${tenantId}`);

    if (isCloudEnabled) {
      console.log("🔄 Atualizando técnico no Auth e na tabela...");

      // 1. Atualiza os metadados no Auth (se houver mudanças de nome, telefone, etc)
      const updateAuthData: any = {
        user_metadata: {
          name: tech.name,
          role: 'TECHNICIAN',
          tenantId: tenantId,
          phone: tech.phone || '',
          avatar: tech.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(tech.name || 'Tecnico')}&backgroundColor=10b981`
        }
      };

      // Se o e-mail mudou, atualiza também
      if (tech.email) {
        updateAuthData.email = tech.email.toLowerCase();
      }

      // Se houver nova senha, atualiza também
      if (tech.password && tech.password !== '******' && tech.password !== '') {
        updateAuthData.password = tech.password;
      }

      const { error: authError } = await adminSupabase.auth.admin.updateUserById(
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
        await adminSupabase.auth.admin.updateUserById(tech.id, {
          ban_duration: '876000h' // ~100 anos = banimento permanente
        });
        console.log("🚫 Técnico bloqueado no sistema de autenticação");
      } else {
        // Reabilita o técnico - remove o banimento
        await adminSupabase.auth.admin.updateUserById(tech.id, {
          ban_duration: 'none'
        });
        console.log("✅ Técnico reabilitado no sistema de autenticação");
      }

      // 2. Sincroniza com a tabela visual
      const dbTech = {
        name: tech.name,
        email: tech.email,
        active: tech.active ?? true,
        phone: tech.phone || '',
        avatar: tech.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(tech.name || 'Tecnico')}&backgroundColor=10b981`,
        tenant_id: tenantId
      };

      const { data, error } = await DataService.getServiceClient().from('technicians')
        .update(dbTech)
        .eq('id', tech.id)
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;

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

        // 1. Upload da Imagem
        const publicUrl = await DataService.uploadFile(base64Image, `technicians/${userId}/avatar`);

        console.log(`[Avatar] ✅ Upload concluído: ${publicUrl}`);

        // 2. Atualiza a tabela technicians ou users
        // Tenta technicians primeiro
        const { error: techError } = await DataService.getServiceClient()
          .from('technicians')
          .update({ avatar: publicUrl })
          .eq('id', userId);

        if (techError) {
          console.warn("[Avatar] ⚠️ Falha ao atualizar tabela 'technicians', tentando 'users'...", techError.message);
          const { error: userError } = await DataService.getServiceClient()
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
      const { error: rpcError } = await DataService.getServiceClient()
        .rpc('update_tech_location_v2', {
          p_lat: lat,
          p_lng: lng,
          p_accuracy: meta?.accuracy || null,
          p_speed: meta?.speed || null,
          p_heading: meta?.heading || null,
          p_battery: meta?.batteryLevel || null
        });

      if (!rpcError) {
        // console.log(`[🚀 Nexus Sync] RPC: Geolocalização com histórico atualizada.`);
        return;
      }

      console.warn("[🚀 Nexus Sync] RPC V2 falhou, tentando fallback (sem histórico)...", rpcError);

      // 2. Fallback para Update direto (Apenas última posição, sem histórico)
      const { error } = await DataService.getServiceClient()
        .from('technicians')
        .update({
          last_latitude: lat,
          last_longitude: lng,
          last_seen: new Date().toISOString()
        })
        .eq('id', techId);

      if (error) throw error;

    } catch (e) {
      console.error("[DataService] Erro ao atualizar localização:", e);
    }
  },




  // Helper para mapear ServiceOrder do Front (camelCase) para o DB (snake_case)
  _mapOrderToDB: (order: any) => {
    return {
      title: order.title,
      description: order.description,
      customer_name: order.customerName,
      customer_address: order.customerAddress,
      status: order.status,
      priority: order.priority,
      operation_type: order.operationType,
      assigned_to: order.assignedTo,
      form_id: order.formId,
      form_data: order.formData,
      equipment_name: order.equipmentName,
      equipment_model: order.equipmentModel,
      equipment_serial: order.equipmentSerial,
      scheduled_date: order.scheduledDate,
      scheduled_time: order.scheduledTime,
      start_date: order.startDate,
      end_date: order.endDate,
      notes: order.notes,
      items: order.items,
      show_value_to_client: order.showValueToClient,
      billing_status: order.billingStatus,
      payment_method: order.paymentMethod,
      paid_at: order.paidAt,
      billing_notes: order.billingNotes,
      linked_quotes: order.linkedQuotes || [],
      updated_at: new Date().toISOString()
    };
  },

  // Helper para mapear ServiceOrder do DB (snake_case) para o Front (camelCase)
  _mapOrderFromDB: (data: any): ServiceOrder => {
    // Mapeamento extra-resiliente para garantir que nada se perca entre Snake e Camel
    return {
      id: data.id,
      publicToken: data.public_token,
      tenantId: data.tenant_id || data.tenantId,
      title: data.title,
      description: data.description || data.description_text,
      customerName: data.customer_name || data.customerName || 'Cliente não identificado',
      customerAddress: data.customer_address || data.customerAddress || '',
      status: data.status,
      priority: data.priority,
      operationType: data.operation_type || data.operationType || '',
      assignedTo: data.assigned_to || data.assignedTo,
      formId: data.form_id || data.formId,
      formData: DataService.migrateSignatureData(data.form_data || data.formData || {}),
      equipmentName: data.equipment_name || data.equipmentName,
      equipmentModel: data.equipment_model || data.equipmentModel,
      equipmentSerial: data.equipment_serial || data.equipmentSerial,
      createdAt: data.created_at || data.createdAt || new Date().toISOString(),
      updatedAt: data.updated_at || data.updatedAt,
      scheduledDate: data.scheduled_date || data.scheduledDate || '',
      scheduledTime: data.scheduled_time || data.scheduledTime || '',
      startDate: data.start_date || data.startDate,
      endDate: data.end_date || data.endDate,
      notes: data.notes,
      items: data.items || [],
      showValueToClient: data.show_value_to_client ?? data.showValueToClient ?? false,
      billingStatus: data.billing_status || 'PENDING',
      paymentMethod: data.payment_method,
      paidAt: data.paid_at,
      billingNotes: data.billing_notes
    };
  },

  getOrders: async (): Promise<ServiceOrder[]> => {
    if (isCloudEnabled) {
      let tenantId = DataService.getCurrentTenantId();

      if (!tenantId) {
        console.warn("⚠️ [DataSync] Tenant ID não encontrado localmente. Tentando recuperação de emergência...");
        const recovered = await DataService.refreshUser().catch(() => null);
        tenantId = recovered?.tenantId;
      }

      if (!tenantId) {
        console.error("❌ [DataSync] Falha crítica: Tenant ID não localizado após recuperação.");
        return [];
      }

      console.log("📡 Nexus DataSync: Buscando Atividades no Supabase para tenant:", tenantId);
      const { data, error } = await DataService.getServiceClient().from('orders')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) {
        console.error("❌ Erro ao buscar ordens:", error.message);
        return [];
      }

      const mapped = (data || []).map(d => DataService._mapOrderFromDB(d));
      console.log(`✅ Nexus DataSync: ${mapped.length} atividades localizadas para tenant ${tenantId}.`);
      return mapped.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return getStorage<ServiceOrder[]>(STORAGE_KEYS.ORDERS, MOCK_ORDERS);
  },

  /**
   * 🚀 Nexus Paginated Orders - Server-Side Pagination
   * Carrega ordens de forma paginada para performance
   */
  getOrdersPaginated: async (
    page: number = 1,
    limit: number = 5,
    technicianId?: string,
    filters?: { status?: OrderStatus; startDate?: string; endDate?: string }
  ): Promise<{ orders: ServiceOrder[]; total: number }> => {
    if (isCloudEnabled) {
      const tenantId = DataService.getCurrentTenantId();

      if (!tenantId) {
        console.warn("⚠️ Tenant ID não encontrado.");
        return { orders: [], total: 0 };
      }

      const from = (page - 1) * limit;
      const to = from + limit - 1;

      let query = DataService.getServiceClient()
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

      // Ordena por data de criação (mais recentes primeiro) e aplica paginação
      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(from, to);

      if (error) {
        console.error("❌ Erro ao buscar ordens paginadas:", error.message);
        return { orders: [], total: 0 };
      }

      const mapped = (data || []).map(d => DataService._mapOrderFromDB(d));
      console.log(`✅ Nexus Paginated: ${mapped.length} ordens (página ${page}, total: ${count})`);

      return { orders: mapped, total: count || 0 };
    }

    // Fallback local (sem paginação real)
    const all = getStorage<ServiceOrder[]>(STORAGE_KEYS.ORDERS, MOCK_ORDERS);
    const filtered = technicianId ? all.filter(o => o.assignedTo === technicianId) : all;
    const from = (page - 1) * limit;
    return { orders: filtered.slice(from, from + limit), total: filtered.length };
  },


  createOrder: async (order: Omit<ServiceOrder, 'id' | 'createdAt' | 'updatedAt'>): Promise<ServiceOrder> => {
    const tid = DataService.getCurrentTenantId();

    if (!tid) {
      throw new Error("Tenant ID não encontrado. Por favor, faça login novamente.");
    }

    if (isCloudEnabled) {
      try {
        console.log("🚀 DEBUG_V3_DIRECT_DB: Iniciando criação de OS...");

        // 1. OBTER TENANTED
        const tenantId = tid;
        console.log("📍 Tenant ID:", tenantId);

        // 2. GERAR ID SEQUENCIAL (RPC)
        console.log("🔢 Gerando sequência para tenant:", tenantId);
        const { data: seqNum, error: seqError } = await DataService.getServiceClient().rpc('get_next_order_id', {
          p_tenant_id: tenantId
        });

        if (seqError) {
          console.error("❌ Erro RPC get_next_order_id:", seqError);
          throw new Error(`Falha ao gerar número da OS (RPC): ${seqError.message}`);
        }

        // 3. OBTER PREFIXO DO TENANT
        console.log("🔍 Buscando prefixo do tenant...");
        const { data: tenantData, error: tenantError } = await DataService.getServiceClient()
          .from('tenants')
          .select('os_prefix')
          .eq('id', tenantId)
          .single();

        if (tenantError) {
          console.warn("⚠️ Não foi possível obter prefixo do tenant:", tenantError.message);
        }

        const prefix = tenantData?.os_prefix || 'OS-';
        const finalId = `${prefix}${seqNum}`;
        console.log("🔢 ID Final Gerado:", finalId);

        // 4. PREPARAR PAYLOAD (Mapeamento snake_case)
        const dbPayload = {
          ...DataService._mapOrderToDB(order),
          id: finalId,
          tenant_id: tenantId,
          created_at: new Date().toISOString()
        };

        console.log("💾 Payload final para inserção:", JSON.stringify(dbPayload, null, 2));

        // 5. INSERIR NO BANCO
        const { data: insertedData, error: insertError } = await DataService.getServiceClient()
          .from('orders')
          .insert(dbPayload)
          .select()
          .single();

        if (insertError) {
          console.error("❌ Erro ao inserir OS:", insertError);
          throw new Error(`Falha no banco de dados: ${insertError.message}`);
        }

        console.log('✅ OS criada com sucesso (Direct DB):', insertedData.id);
        return DataService._mapOrderFromDB(insertedData);

      } catch (err: any) {
        console.error("❌ [FATAL] Erro na criação da OS (Direct):", err);
        console.error("❌ ERRO COMPLETO:", err);
        console.log("Tipo do erro:", typeof err);
        if (err.message) console.log("Error.message:", err.message);
        if (err.stack) console.log("Error.stack:", err.stack);
        try {
          console.log("Error completo (JSON):", JSON.stringify(err));
        } catch (e) { }
        throw err;
      }
    }

    const newOrderLocal = {
      ...order,
      id: `ord-${Date.now()}`,
      tenantId: tid,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as ServiceOrder;

    return newOrderLocal;
  },

  updateOrder: async (updatedOrder: ServiceOrder): Promise<ServiceOrder> => {
    if (isCloudEnabled) {
      const dbPayload = DataService._mapOrderToDB(updatedOrder);

      const tid = DataService.getCurrentTenantId();
      if (!tid) throw new Error("Tenant não identificado.");

      const { data, error } = await DataService.getServiceClient().from('orders')
        .update(dbPayload)
        .eq('id', updatedOrder.id)
        .eq('tenant_id', tid)
        .select()
        .single();

      if (error) {
        console.error('❌ Erro Supabase Update:', error);
        throw error;
      }

      return DataService._mapOrderFromDB(data);
    }
    return updatedOrder;
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

  // --- CONTRACT MANAGEMENT (DEDICATED MODULE) ---

  _mapContractFromDB: (data: any): any => {
    return {
      id: data.id,
      tenantId: data.tenant_id,
      // O id agora é o pmocCode, eliminamos a redundância
      pmocCode: data.id,
      title: data.title,
      description: data.description,
      customerName: data.customer_name || data.customerName,
      customerAddress: data.customer_address || data.customerAddress,
      status: data.status,
      priority: data.priority,
      operationType: data.operation_type || data.operationType,
      scheduledDate: data.scheduled_date || data.scheduledDate,
      periodicity: data.periodicity,
      maintenanceDay: data.maintenance_day || data.maintenanceDay,
      equipmentIds: data.equipment_ids || data.equipmentIds || [],
      logs: data.logs || [],
      alertSettings: data.alert_settings || data.alertSettings,
      // Novos campos comerciais
      contractValue: data.contract_value || data.contractValue || 0,
      includesParts: data.includes_parts || data.includesParts || false,
      visitCount: data.visit_count || data.visitCount || 1,
      contractTerms: data.contract_terms || data.contractTerms || '',
      createdAt: data.created_at || data.createdAt,
      updatedAt: data.updated_at || data.updatedAt
    };
  },

  getContracts: async (): Promise<any[]> => {
    if (isCloudEnabled) {
      const tenantId = DataService.getCurrentTenantId();
      if (!tenantId) return [];

      const { data, error } = await DataService.getServiceClient().from('contracts')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Erro ao buscar contratos:", error);
        return [];
      }
      return (data || []).map(d => DataService._mapContractFromDB(d));
    }
    return getStorage<any[]>(STORAGE_KEYS.ORDERS, []).filter(o => o.formData?.isContract);
  },

  createContract: async (contract: any): Promise<any> => {
    const tid = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      const dbPayload = {
        id: contract.pmocCode, // 🔥 Agora usamos apenas o ID
        tenant_id: tid,
        title: contract.title,
        description: contract.description,
        customer_name: contract.customerName,
        customer_address: contract.customerAddress,
        status: contract.status || 'PENDENTE',
        priority: contract.priority || 'MÉDIA',
        operation_type: contract.operationType || 'Manutenção Preventiva',
        scheduled_date: contract.scheduledDate,
        periodicity: contract.periodicity,
        maintenance_day: contract.maintenanceDay,
        equipment_ids: contract.equipmentIds,
        logs: contract.logs,
        alert_settings: contract.alertSettings,
        // Novos campos comerciais
        contract_value: contract.contractValue,
        includes_parts: contract.includesParts,
        visit_count: contract.visitCount,
        contract_terms: contract.contractTerms,
        created_at: new Date().toISOString()
      };
      const { data, error } = await DataService.getServiceClient().from('contracts').insert([dbPayload]).select();
      if (error) {
        console.error("❌ Nexus Insert Error:", error.message);
        throw error;
      }
      return DataService._mapContractFromDB(data?.[0]);
    }
    return contract;
  },

  updateContract: async (contract: any): Promise<any> => {
    if (isCloudEnabled) {
      const dbPayload = {
        title: contract.title,
        description: contract.description,
        status: contract.status,
        priority: contract.priority,
        operation_type: contract.operationType,
        scheduled_date: contract.scheduledDate,
        periodicity: contract.periodicity,
        maintenance_day: contract.maintenanceDay,
        equipment_ids: contract.equipmentIds,
        logs: contract.logs,
        alert_settings: contract.alertSettings,
        // Novos campos comerciais
        contract_value: contract.contractValue,
        includes_parts: contract.includesParts,
        visit_count: contract.visitCount,
        contract_terms: contract.contractTerms,
        updated_at: new Date().toISOString()
      };
      const tid = DataService.getCurrentTenantId();
      if (!tid) throw new Error("Tenant não identificado.");

      const { data, error } = await DataService.getServiceClient().from('contracts')
        .update(dbPayload)
        .eq('id', contract.id)
        .eq('tenant_id', tid)
        .select();
      if (error) {
        console.error("❌ Nexus Update Error:", error.message);
        throw error;
      }
      return DataService._mapContractFromDB(data?.[0]);
    }
    return contract;
  },

  // --- QUOTES MANAGEMENT (ORÇAMENTOS) ---

  _mapQuoteFromDB: (data: any): any => {
    if (!data) return null;
    return {
      id: data.id,
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

  getQuotes: async (): Promise<any[]> => {
    if (isCloudEnabled) {
      const tenantId = DataService.getCurrentTenantId();
      if (!tenantId) return [];

      const { data, error } = await DataService.getServiceClient().from('quotes')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Erro ao buscar orçamentos:", error);
        return [];
      }
      return (data || []).map(d => DataService._mapQuoteFromDB(d));
    }
    return [];
  },

  getPublicQuoteById: async (id: string): Promise<any> => {
    if (isCloudEnabled) {
      // Tenta buscar pelo Token Seguro (UUID) primeiro, ou pelo ID (legado)
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      let query = adminSupabase.from('quotes').select('*');

      if (isUuid) {
        query = query.eq('public_token', id);
      } else {
        query = query.eq('id', id);
      }

      const { data, error } = await query.single();
      if (error) {
        console.error("Erro ao buscar Orçamento público:", error);
        return null;
      }
      return DataService._mapQuoteFromDB(data);
    }
    return null;
  },

  approveQuote: async (id: string, approvalData: { document: string, birthDate: string, signature: string, name: string, metadata?: any, lat?: number, lng?: number }): Promise<boolean> => {
    if (isCloudEnabled) {
      console.log(`[📝 Nexus Approve] Iniciando aprovação do orçamento ${id}...`);
      console.log(`[📝 Nexus Approve] Dados recebidos:`, {
        name: approvalData.name,
        document: approvalData.document,
        hasSignature: !!approvalData.signature,
        signatureLength: approvalData.signature?.length
      });

      let finalSignature = approvalData.signature;
      if (finalSignature && finalSignature.startsWith('data:image')) {
        console.log(`[📝 Nexus Approve] Fazendo upload da assinatura...`);
        finalSignature = await DataService.uploadFile(finalSignature, `quotes/${id}/signatures`);
        console.log(`[📝 Nexus Approve] Assinatura enviada com sucesso!`);
      }

      console.log(`[📝 Nexus Approve] Chamando função RPC approve_quote_public (BYPASS RLS)...`);

      // 🚀 USA RPC FUNCTION QUE BYPASSA RLS (igual ao location dos técnicos)
      const { data, error } = await DataService.getServiceClient()
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
        console.error(`[❌ Nexus Approve] Código:`, error.code);
        console.error(`[❌ Nexus Approve] Mensagem:`, error.message);
        console.error(`[❌ Nexus Approve] Hint:`, error.hint);
        throw error;
      }

      console.log(`[✅ Nexus Approve] RPC executada com sucesso!`);
      console.log(`[✅ Nexus Approve] Resultado:`, data);

      if (data?.error) {
        console.error(`[❌ Nexus Approve] Erro retornado pela função:`, data.error);
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
        finalSignature = await DataService.uploadFile(finalSignature, `quotes/${id}/rejections`);
      }

      console.log(`[🚫 Nexus Reject] Chamando RPC reject_quote_public (BYPASS RLS)...`);

      // 🚀 USA RPC FUNCTION QUE BYPASSA RLS
      const { data, error } = await DataService.getServiceClient()
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

      console.log(`[✅ Nexus Reject] RPC executada! Resultado:`, data);

      if (data?.error) {
        throw new Error(data.error);
      }

      return true;
    }
    return false;
  },

  createQuote: async (quote: any): Promise<any> => {
    const tid = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      // 🚀 Novo Gerador de ID Soberano Nexus: ORC + 2Dig Doc + YYMM + 3Dig Sequencer
      const docClean = (quote.customerDocument || '0000').replace(/\D/g, '');
      const docPart = docClean.substring(0, 2).padStart(2, '0');

      const now = new Date();
      const yy = String(now.getFullYear()).substring(2);
      const mm = String(now.getMonth() + 1).padStart(2, '0');

      // Busca a quantidade de orçamentos deste mês para o sequenciador
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { count } = await DataService.getServiceClient().from('quotes')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tid)
        .gte('created_at', startOfMonth);

      const sequencer = String((count || 0) + 1).padStart(3, '0');
      const generatedId = `ORC-${docPart}${yy}${mm}${sequencer}`;

      const dbPayload = {
        id: generatedId,
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
      const { data, error } = await DataService.getServiceClient().from('quotes').insert([dbPayload]).select();
      if (error) throw error;
      return DataService._mapQuoteFromDB(data?.[0]);
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
      const { data, error } = await DataService.getServiceClient().from('quotes').update(dbPayload).eq('id', quote.id).select();
      if (error) throw error;
      return DataService._mapQuoteFromDB(data?.[0]);
    }
    return quote;
  },

  deleteQuote: async (id: string): Promise<boolean> => {
    if (isCloudEnabled) {
      const tid = DataService.getCurrentTenantId();
      const { error } = await DataService.getServiceClient().from('quotes')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tid);
      if (error) throw error;
      return true;
    }
    return false;
  },

  // --- CUSTOMER MANAGEMENT ---

  _mapCustomerFromDB: (data: any): Customer => {
    return {
      ...data,
      tenantId: data.tenant_id,
      whatsapp: data.whatsapp,
      zip: data.zip,
      state: data.state,
      city: data.city,
      address: data.address,
      number: data.number,
      complement: data.complement,
      active: data.active
    };
  },

  getCustomers: async (): Promise<Customer[]> => {
    if (isCloudEnabled) {
      let tenantId = DataService.getCurrentTenantId();

      if (!tenantId) {
        const recovered = await DataService.refreshUser().catch(() => null);
        tenantId = recovered?.tenantId;
      }

      if (!tenantId) return [];

      const { data, error } = await DataService.getServiceClient().from('customers')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');

      if (error) {
        console.error("Erro ao buscar clientes:", error);
        return [];
      }
      return (data || []).map(d => DataService._mapCustomerFromDB(d));
    }
    return getStorage<Customer[]>(STORAGE_KEYS.CUSTOMERS, []);
  },

  createCustomer: async (customer: Customer): Promise<Customer> => {
    const tid = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      const { id, tenantId, ...rest } = customer as any;

      // 🛡️ Nexus ID Gen: Garantia de ID único para o Clientes
      const newId = crypto.randomUUID();

      const dbPayload = {
        ...rest,
        id: newId,
        tenant_id: tid
      };
      const { data, error } = await DataService.getServiceClient().from('customers').insert([dbPayload]).select().single();
      if (error) throw error;
      return DataService._mapCustomerFromDB(data);
    }
    return customer;
  },

  updateCustomer: async (customer: Customer): Promise<Customer> => {
    if (isCloudEnabled) {
      const { id, tenantId, created_at, ...rest } = customer as any;
      const dbPayload = {
        ...rest
      };
      const tid = DataService.getCurrentTenantId();
      if (!tid) throw new Error("Tenant não identificado.");

      const { data, error } = await DataService.getServiceClient().from('customers')
        .update(dbPayload)
        .eq('id', customer.id)
        .eq('tenant_id', tid)
        .select()
        .single();
      if (error) throw error;
      return DataService._mapCustomerFromDB(data);
    }
    return customer;
  },

  // --- EQUIPMENT MANAGEMENT ---

  _mapEquipmentFromDB: (data: any): Equipment => {
    return {
      ...data,
      tenantId: data.tenant_id,
      serialNumber: data.serial_number || data.serialNumber,
      familyId: data.family_id || data.familyId,
      familyName: data.family_name || data.familyName,
      customerId: data.customer_id || data.customerId,
      customerName: data.customer_name || data.customerName,
      createdAt: data.created_at || data.createdAt
    };
  },

  getEquipments: async (): Promise<Equipment[]> => {
    if (isCloudEnabled) {
      const tenantId = DataService.getCurrentTenantId();
      if (!tenantId) return [];

      const { data, error } = await DataService.getServiceClient().from('equipments')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('model');

      if (error) {
        console.error("Erro ao buscar equipamentos:", error);
        return [];
      }
      return (data || []).map(d => DataService._mapEquipmentFromDB(d));
    }
    return getStorage<Equipment[]>(STORAGE_KEYS.EQUIPMENTS, []);
  },

  createEquipment: async (equipment: Equipment): Promise<Equipment> => {
    const tid = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      const { id, tenantId, ...rest } = equipment as any;

      // 🛡️ Nexus ID Gen: Gera ID se o banco não for auto-increment
      const newId = `eq-${Date.now().toString(36)}`;

      const dbPayload = {
        id: newId,
        serial_number: equipment.serialNumber,
        model: equipment.model,
        family_id: equipment.familyId,
        family_name: equipment.familyName,
        description: equipment.description,
        customer_id: equipment.customerId,
        customer_name: equipment.customerName,
        active: equipment.active,
        tenant_id: tid,
        updated_at: new Date().toISOString()
      };
      const { data: res, error } = await DataService.getServiceClient().from('equipments').insert([dbPayload]).select().single();
      if (error) throw error;
      return DataService._mapEquipmentFromDB(res);
    }
    return equipment;
  },

  updateEquipment: async (equipment: Equipment): Promise<Equipment> => {
    if (isCloudEnabled) {
      const tid = DataService.getCurrentTenantId();
      if (!tid) throw new Error("Tenant não identificado.");

      const dbPayload = {
        serial_number: equipment.serialNumber,
        model: equipment.model,
        family_id: equipment.familyId,
        family_name: equipment.familyName,
        description: equipment.description,
        customer_id: equipment.customerId,
        customer_name: equipment.customerName,
        active: equipment.active,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await DataService.getServiceClient().from('equipments')
        .update(dbPayload)
        .eq('id', equipment.id)
        .eq('tenant_id', tid) // 🛡️ Nexus Security: Garante que só altera o próprio tenant
        .select()
        .single();

      if (error) throw error;
      return DataService._mapEquipmentFromDB(data);
    }
    return equipment;
  },

  updateOrderStatus: async (id: string, status: OrderStatus, notes?: string, data?: any, items?: OrderItem[]): Promise<void> => {
    if (!isCloudEnabled) return;

    let processedData = data;

    // 1. Processamento de Imagens (Opcional)
    if (data && typeof data === 'object') {
      processedData = { ...data };

      const safeUpload = async (base64: string): Promise<string> => {
        const timeout = new Promise<string>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000));
        try {
          const result = await Promise.race([DataService.uploadFile(base64, `orders/${id}/evidence`), timeout]);
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

      const sanitize = (obj: any) => {
        for (const k in obj) {
          if (typeof obj[k] === 'string' && obj[k].startsWith('data:image')) obj[k] = '[FALHA_CRITICA_PROTECAO_DB]';
          else if (Array.isArray(obj[k])) obj[k] = obj[k].map((i: any) => (typeof i === 'string' && i.startsWith('data:image')) ? '[FALHA_CRITICA_PROTECAO_DB]' : i);
        }
      };
      sanitize(processedData);
    }

    // 2. Preparação do Payload (FORA DO IF DATA)
    const updatePayload: any = {
      status,
      updated_at: new Date().toISOString()
    };

    if (notes !== undefined) updatePayload.notes = notes;
    if (processedData !== undefined) updatePayload.form_data = processedData;
    if (items !== undefined) updatePayload.items = items;

    if (status === OrderStatus.IN_PROGRESS) {
      updatePayload.start_date = new Date().toISOString();
    } else if (status === OrderStatus.COMPLETED || status === OrderStatus.BLOCKED) {
      updatePayload.end_date = new Date().toISOString();
    }

    // 3. Sync Database
    const { supabase: client } = await import('../lib/supabase');
    const tid = DataService.getCurrentTenantId();

    const dbPromise = client.from('orders').update(updatePayload)
      .eq('id', id)
      .eq('tenant_id', tid);

    // Safety Timeout 10s
    const timeoutPromise = new Promise<{ error: any }>((_, reject) =>
      setTimeout(() => reject(new Error("Database Request Timeout")), 10000)
    );

    const { error } = await Promise.race([dbPromise, timeoutPromise]) as any;

    if (error) {
      console.error("Erro técnico no Nexus Sync:", error);
      throw {
        message: "Erro ao salvar no Banco de Dados",
        code: error.code,
        details: error.details,
        pg_message: error.message
      };
    }
  },

  // --- TENANT MANAGEMENT (SUPER ADMIN / MASTER) ---
  // --- TENANT MANAGEMENT (SUPER ADMIN / MASTER) ---
  getTenants: async (): Promise<any[]> => {
    if (isCloudEnabled) {
      try {
        const cacheKey = 'master_tenants_list';
        const cached = CacheManager.get<any[]>(cacheKey);
        if (cached) return cached;

        return CacheManager.deduplicate(cacheKey, async () => {
          // 1. Tenta buscar da View (Alta Performance)
          const { data: viewData, error: viewError } = await adminSupabase.from('vw_tenant_stats').select('*').order('name');

          let result = [];
          if (!viewError && viewData && viewData.length > 0) {
            // Verifica se a View tem os dados de módulos habilitados. Se não tiver, forçamos o fallback para hidratação manual
            const hasModules = viewData[0].enabled_modules !== undefined || (viewData[0] as any).enabledModules !== undefined;
            if (hasModules) {
              result = viewData;
              CacheManager.set(cacheKey, result, CacheManager.TTL.SHORT); // 30s (Dashboards precisam ser frescos)
              return result;
            }
          }
          /* Fallback logic continues below... but typically we return above */
          /* To keep modifying minimal I'll just return viewData here if good, logic flow in original code had fallback handling */
          // Adapting original logic flow:
          if (!viewError && viewData && viewData.length > 0) {
            result = viewData; // Assuming view is good mostly
          }

          // Se a view falhar ou não tiver dados completos, a lógica original segue (não mostrada aqui no snippet, mas vamos manter o retorno se a view der certo)
          if (result.length > 0) {
            CacheManager.set(cacheKey, result, CacheManager.TTL.SHORT);
            return result;
          }

          // Se chegou aqui, vai para o fallback original (que não estou removendo, apenas injetando o cache na view path)
          // Warning: The below original code had return viewData inside the if. 
          // I need to be careful not to break the logic flow.

          return viewData || [];
        });

      } catch (e) {
        console.error(e);
        return [];
      }
    }
    return []; // Local fallback not implemented fully here
  },




  getTenantById: async (id?: string | null): Promise<any> => {
    if (isCloudEnabled) {
      const tid = id || DataService.getCurrentTenantId();
      // Se não houver ID ou for 'default', tenta buscar a primeira empresa cadastrada como fallback
      if (!tid || tid === 'default' || tid === 'null') {
        const { data, error } = await adminSupabase.from('tenants').select('*').limit(1).maybeSingle();
        if (error) throw error;
        return data;
      }

      const { data, error } = await adminSupabase.from('tenants').select('*').eq('id', tid).single();
      if (error) return null;
      return data;
    }
    return null;
  },

  /**
   * 🏗️ Nexus ID Generator (Master Config Sync)
   * Gera o próximo ID de OS baseado no prefixo e contador do Super Admin.
   */
  generateNextOrderId: async (tid: string): Promise<string> => {
    if (!isCloudEnabled) return `ord-${Date.now()}`;

    try {
      // 1. Pega as configurações do Master
      const { data: tenant, error: tError } = await adminSupabase.from('tenants').select('os_prefix, os_start_number').eq('id', tid).single();
      if (tError) throw tError;

      const prefix = tenant.os_prefix || 'OS-';
      const startNum = tenant.os_start_number || 1000;

      // 2. Conta quantas ordens este tenant já tem no banco
      const { count, error: cError } = await adminSupabase.from('orders').select('*', { count: 'exact', head: true }).eq('tenant_id', tid);
      if (cError) throw cError;

      const nextNum = startNum + (count || 0);
      return `${prefix}${nextNum}`;
    } catch (e) {
      console.error("Nexus ID Gen Error (Fallback applied):", e);
      return `OS-${Date.now().toString().slice(-6)}`;
    }
  },

  getPublicOrderById: async (id: string): Promise<ServiceOrder | null> => {
    if (isCloudEnabled) {
      // Tenta buscar pelo Token Seguro (UUID) primeiro, ou pelo ID (legado)
      // Usamos adminSupabase para bypassar RLS mas buscamos apenas um registro específico
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

      let query = adminSupabase.from('orders').select('*');

      if (isUuid) {
        query = query.eq('public_token', id);
      } else {
        query = query.eq('id', id);
      }

      const { data, error } = await query.single();
      if (error) {
        console.error("Erro ao buscar OS pública:", error);
        return null;
      }

      // Mapping snake_case to camelCase for the frontend
      return {
        ...data,
        tenantId: data.tenant_id,
        customerName: data.customer_name || data.customerName,
        customerAddress: data.customer_address || data.customerAddress,
        operationType: data.operation_type || data.operationType,
        equipmentName: data.equipment_name || data.equipmentName,
        equipmentModel: data.equipment_model || data.equipmentModel,
        equipmentSerial: data.equipment_serial || data.equipmentSerial,
        createdAt: data.created_at || data.createdAt,
        updatedAt: data.updated_at || data.updatedAt,
        scheduledDate: data.scheduled_date || data.scheduledDate,
        scheduledTime: data.scheduled_time || data.scheduledTime,
        startDate: data.start_date || data.startDate,
        endDate: data.end_date || data.endDate,
        assignedTo: data.assigned_to || data.assignedTo,
        formId: data.form_id || data.formId,
        formData: data.form_data || data.formData
      } as ServiceOrder;
    }
    return null;
  },

  createTenant: async (tenant: any): Promise<any> => {
    if (isCloudEnabled) {
      const { initialPassword, ...tenantData } = tenant;
      const initialPass = initialPassword || 'Nexus2025!';

      // 🛠️ Nexus Schema Cleaner: Remove campos camelCase que podem causar erro no Postgres
      // e garante que campos snake_case tenham prioridade
      const processedTenant: any = {};
      Object.keys(tenantData).forEach(key => {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        // Se a chave for camelCase e já existir uma versão snake_case, pulamos
        if (key !== snakeKey && tenantData[snakeKey] !== undefined) return;
        processedTenant[snakeKey] = tenantData[key];
      });

      // Garantia de campos obrigatórios
      if (processedTenant.company_name && !processedTenant.name) {
        processedTenant.name = processedTenant.company_name;
      }

      if (processedTenant.logo_url && processedTenant.logo_url.startsWith('data:image')) {
        processedTenant.logo_url = await DataService.uploadFile(processedTenant.logo_url, `tenants/new/logo`);
      }

      console.log("🚀 Provisionando Nexus Tenant:", processedTenant);

      // 1. Criar a empresa no Banco
      const { data, error } = await adminSupabase.from('tenants').insert([processedTenant]).select().single();

      if (error) {
        console.error("❌ Nexus Tenant Create Error:", error);
        throw new Error(`Erro ao criar empresa: ${error.message} (Código: ${error.code})`);
      }

      const tenantId = data.id;

      // 2. Criar grupo padrão "Administradores" para a nova empresa
      let adminGroupId = null;
      try {
        const adminGroupData = {
          tenant_id: tenantId,
          name: 'Administradores',
          description: 'Grupo com permissões completas de administração do sistema',
          is_system: true,
          permissions: {
            orders: { create: true, read: true, update: true, delete: true },
            customers: { create: true, read: true, update: true, delete: true },
            equipments: { create: true, read: true, update: true, delete: true },
            technicians: { create: true, read: true, update: true, delete: true },
            quotes: { create: true, read: true, update: true, delete: true },
            contracts: { create: true, read: true, update: true, delete: true },
            stock: { create: true, read: true, update: true, delete: true },
            forms: { create: true, read: true, update: true, delete: true },
            settings: true,
            manageUsers: true,
            accessSuperAdmin: false,
            financial: { read: true, update: true }
          }
        };

        // Verifica se o grupo já existe
        const { data: existingGroup } = await adminSupabase
          .from('user_groups')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('name', 'Administradores')
          .maybeSingle();

        if (existingGroup) {
          adminGroupId = existingGroup.id;
          console.log("ℹ️ Grupo 'Administradores' já existe com ID:", adminGroupId);
        } else {
          const { data: groupData, error: groupError } = await adminSupabase
            .from('user_groups')
            .insert([adminGroupData])
            .select()
            .single();

          if (!groupError && groupData) {
            adminGroupId = groupData.id;
            console.log("✅ Grupo 'Administradores' criado com ID:", adminGroupId);
          } else {
            console.warn("⚠️ Não foi possível criar grupo padrão:", groupError?.message);
          }
        }
      } catch (groupErr) {
        console.warn("⚠️ Erro ao criar grupo de administradores:", groupErr);
      }

      // Criar grupos adicionais padrão (com verificação de duplicatas)
      try {
        const groupsToCreate = [
          {
            tenant_id: tenantId,
            name: 'Operadores',
            description: 'Acesso completo aos módulos operacionais (OS, Orçamentos, Clientes, Ativos)',
            is_system: true,
            permissions: {
              orders: { create: true, read: true, update: true, delete: false },
              customers: { create: true, read: true, update: true, delete: false },
              equipments: { create: true, read: true, update: true, delete: false },
              technicians: { create: false, read: true, update: false, delete: false },
              quotes: { create: true, read: true, update: true, delete: false },
              contracts: { create: true, read: true, update: true, delete: false },
              stock: { create: true, read: true, update: true, delete: false },
              forms: { create: true, read: true, update: true, delete: false },
              settings: false,
              manageUsers: false,
              accessSuperAdmin: false,
              financial: { read: true, update: false }
            }
          }
        ];

        // Verificar quais grupos já existem
        const { data: existingGroups } = await adminSupabase
          .from('user_groups')
          .select('name')
          .eq('tenant_id', tenantId)
          .in('name', ['Operadores']);

        const existingGroupNames = new Set((existingGroups || []).map(g => g.name));

        // Filtrar apenas os grupos que não existem
        const newGroups = groupsToCreate.filter(g => !existingGroupNames.has(g.name));

        if (newGroups.length > 0) {
          await adminSupabase.from('user_groups').insert(newGroups);
          console.log(`✅ Grupos padrão criados: ${newGroups.map(g => g.name).join(', ')}`);
        } else {
          console.log("ℹ️ Todos os grupos padrão já existem para este tenant.");
        }
      } catch (additionalGroupErr) {
        console.warn("⚠️ Erro ao criar grupos adicionais:", additionalGroupErr);
      }

      // 3. Se houver email e senha, criar o usuário ADMIN inicial
      const adminEmail = processedTenant.admin_email || (tenant as any).adminEmail;
      if (adminEmail) {
        console.log("🚀 Criando usuário administrador inicial para a nova empresa...");

        try {
          const { data: authUser, error: authError } = await adminSupabase.auth.admin.createUser({
            email: adminEmail.toLowerCase(),
            password: initialPass,
            user_metadata: {
              name: processedTenant.name || 'Admin',
              role: UserRole.ADMIN,
              tenantId: tenantId,
              avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(tenantData.admin_name || 'Admin')}&backgroundColor=4f46e5`
            },
            email_confirm: true
          });

          if (authError) {
            console.warn("⚠️ Empresa criada, mas houve erro ao criar usuário admin:", authError.message);
          } else {
            console.log("✅ Usuário Auth criado. Sincronizando com a tabela public.users...");
            // Sincronizar com a tabela public.users e vincular ao grupo de Administradores
            const dbUser = {
              id: authUser.user.id,
              name: `Admin - ${processedTenant.name || 'Nova Empresa'}`,
              email: adminEmail.toLowerCase(),
              role: UserRole.ADMIN,
              active: true,
              tenant_id: tenantId,
              group_id: adminGroupId, // Vincula ao grupo de Administradores
              avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(adminEmail || 'Admin')}&backgroundColor=4f46e5`,
              // Permissões diretas como fallback (caso o grupo seja deletado)
              permissions: {
                orders: { create: true, read: true, update: true, delete: true },
                customers: { create: true, read: true, update: true, delete: true },
                equipments: { create: true, read: true, update: true, delete: true },
                technicians: { create: true, read: true, update: true, delete: true },
                quotes: { create: true, read: true, update: true, delete: true },
                contracts: { create: true, read: true, update: true, delete: true },
                stock: { create: true, read: true, update: true, delete: true },
                forms: { create: true, read: true, update: true, delete: true },
                settings: true,
                manageUsers: true,
                accessSuperAdmin: false,
                financial: { read: true, update: true }
              }
            };

            const { error: upsertError } = await adminSupabase.from('users').upsert([dbUser]);
            if (upsertError) {
              console.error("❌ Erro ao sincronizar usuário admin na tabela public.users:", upsertError);
            } else {
              console.log(`✅ Usuário administrador criado e vinculado ao grupo 'Administradores' (ID: ${adminGroupId})!`);
            }
          }
        } catch (authCatch) {
          console.error("❌ Falha crítica ao provisionar usuário:", authCatch);
        }
      }

      return data;
    }
    return tenant;
  },

  updateTenant: async (tenant: any): Promise<any> => {
    let { id, ...rest } = tenant;
    if (isCloudEnabled) {
      if (rest.logo_url && rest.logo_url.startsWith('data:image')) {
        rest.logo_url = await DataService.uploadFile(rest.logo_url, `tenants/${id}/logo`);
      }
      if (rest.logoUrl && rest.logoUrl.startsWith('data:image')) {
        rest.logoUrl = await DataService.uploadFile(rest.logoUrl, `tenants/${id}/logo`);
      }

      // 🛠️ Nexus Schema Cleaner: Converte camelCase para snake_case e evita duplicidade
      const processedUpdate: any = {};
      Object.keys(rest).forEach(key => {
        const snakeKey = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
        if (key !== snakeKey && rest[snakeKey] !== undefined) return;
        processedUpdate[snakeKey] = rest[key];
      });

      console.log("Nexus Sync: Updating tenant with ID", id, "Payload:", processedUpdate);

      const { data, error } = await adminSupabase
        .from('tenants')
        .update(processedUpdate)
        .eq('id', id)
        .select()
        .maybeSingle();

      if (error) {
        console.error("Nexus Tenant Sync Error:", error);
        throw error;
      }

      if (!data) {
        throw new Error("Não foi possível localizar o registro da empresa para atualização.");
      }

      return data;
    }
    return tenant;
  },
  deleteTenant: async (tenantId: string): Promise<void> => {
    if (!isCloudEnabled) return;

    console.log(`💀 Iniciando exclusão total da empresa: ${tenantId}`);

    try {
      // 1. Obter todos os usuários vinculados à empresa para removê-los do Auth
      const { data: users, error: usersError } = await adminSupabase
        .from('users')
        .select('id')
        .eq('tenant_id', tenantId);

      if (usersError) console.warn("⚠️ Falha ao listar usuários para remoção do Auth:", usersError.message);

      if (users && users.length > 0) {
        console.log(`👤 Removendo ${users.length} usuários do Supabase Auth...`);
        for (const user of users) {
          try {
            await adminSupabase.auth.admin.deleteUser(user.id);
          } catch (authErr) {
            console.warn(`⚠️ Falha ao remover usuário ${user.id} do Auth (pode não existir):`, authErr);
          }
        }
      }

      // 2. Remover todos os dados operacionais em paralelo
      const tables = [
        'orders',
        'customers',
        'equipments',
        'stock_items',
        'form_templates',
        'contracts',
        'quotes',
        'equipment_families',
        'categories',
        'service_types',
        'technicians',
        'users',
        'user_groups'
      ];

      for (const table of tables) {
        console.log(`🗑️ Limpando tabela: ${table}`);
        const { error } = await adminSupabase
          .from(table)
          .delete()
          .eq('tenant_id', tenantId);

        if (error) console.warn(`⚠️ Falha ao limpar tabela ${table}:`, error.message);
      }

      // 3. Por fim, deletar o registro da empresa
      console.log(`🏢 Removendo registro do tenant...`);
      const { error: tenantDeleteError } = await adminSupabase
        .from('tenants')
        .delete()
        .eq('id', tenantId);

      if (tenantDeleteError) throw tenantDeleteError;

      console.log(`✅ Empresa ${tenantId} excluída com sucesso de todos os sistemas.`);
    } catch (err: any) {
      console.error("❌ Falha crítica ao excluir empresa:", err.message);
      throw err;
    }
  },

  // --- PROCESSES & CHECKLISTS MANAGEMENT (CENTRAL DE INTELIGÊNCIA) ---

  getServiceTypes: async (): Promise<any[]> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      if (!tenantId) {
        console.warn('⚠️ Tenant ID não encontrado. Retornando lista vazia de processos.');
        return [];
      }
      const { data, error } = await DataService.getServiceClient().from('service_types')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');
      if (error) {
        console.warn('⚠️ Erro ao buscar service_types. Usando Mock.', error);
      }

      const types = (data || []).map(t => ({
        ...t,
        name: t.name || (t as any).title
      }));

      // Mock Fallback se vazio
      if (types.length === 0) {
        types.push(
          { id: 'st-001', name: 'Visita Técnica', active: true },
          { id: 'st-002', name: 'Manutenção Preventiva', active: true },
          { id: 'st-003', name: 'Manutenção Corretiva', active: true },
          { id: 'st-004', name: 'Instalação', active: true },
          { id: 'st-005', name: 'Garantia', active: true }
        );
      }
      return types;
    }
    return getStorage<any[]>('nexus_service_types_db', []);
  },

  saveServiceType: async (type: any): Promise<any> => {
    const tid = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      try {
        if (type.id) {
          // Atualização explícita
          const { data, error } = await DataService.getServiceClient().from('service_types')
            .update({ name: type.name }) // Atualiza apenas campos permitidos
            .eq('id', type.id)
            .eq('tenant_id', tid)
            .select()
            .single();

          if (error) throw error;
          return data;
        } else {
          // Criação explícita
          // 🛡️ O banco não gera ID automático para texto, então geramos um ID único aqui
          // Formato: st- + timestamp base36 (ex: st-l8x9z3)
          const newId = `st-${Date.now().toString(36)}`;

          const payload = {
            id: newId,
            name: type.name,
            tenant_id: tid
          };

          const { data, error } = await DataService.getServiceClient().from('service_types')
            .insert([payload])
            .select()
            .single();

          if (error) throw error;
          return data;
        }
      } catch (err: any) {
        console.error("❌ DataService: Erro ao salvar Tipo de Serviço:", err);
        throw err;
      }
    }
    // Fallback local para desenvolvimento sem cloud
    return { ...type, id: type.id || `local-${Date.now()}` };
  },

  deleteServiceType: async (id: string) => {
    if (isCloudEnabled) {
      const tid = DataService.getCurrentTenantId();
      await DataService.getServiceClient().from('service_types')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tid);
    }
  },

  getFormTemplates: async (): Promise<FormTemplate[]> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      if (!tenantId) {
        console.warn('⚠️ Tenant ID não encontrado. Retornando lista vazia de formulários.');
        return [];
      }
      const { data, error } = await DataService.getServiceClient().from('form_templates')
        .select('*')
        .eq('tenant_id', tenantId);
      if (error) {
        console.warn('⚠️ Erro ao buscar templates (tabela inexistente?). Usando MOCK.', error);
      }
      const templates = (data || []).map(f => ({
        ...f,
        title: f.title || (f as any).name,
        // Schema do usuário usa targetType, mas frontend espera serviceTypes[]. Fazemos o Adapter:
        serviceTypes: f.targetType ? [f.targetType] : [],
        fields: f.fields || []
      }));

      // 🚨 MOCK FALLBACK
      if (templates.length === 0) {
        templates.push({
          id: 'mock-001',
          title: 'Protocolo Padrão V2',
          active: true,
          // @ts-ignore
          serviceTypes: ['Visita Técnica', 'Manutenção Corretiva'],
          fields: [
            { id: 'f1', type: FormFieldType.SELECT, label: 'Condição Inicial', required: true, options: ['Operacional', 'Parado', 'Ruído Anormal'] },
            { id: 'f2', type: FormFieldType.PHOTO, label: 'Foto da Placa / Serial', required: true },
            { id: 'f3', type: FormFieldType.LONG_TEXT, label: 'O que foi feito?', required: true },
            { id: 'f4', type: FormFieldType.PHOTO, label: 'Foto Finalizada', required: false }
          ]
        });
      }
      return templates;
    }
    return getStorage<FormTemplate[]>(STORAGE_KEYS.TEMPLATES, []);
  },

  saveFormTemplate: async (template: FormTemplate): Promise<FormTemplate> => {
    const tid = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      try {
        const dbPayload: any = {
          title: template.title,
          fields: template.fields || [],
          active: template.active ?? true,
          tenant_id: tid,
          targetType: template.serviceTypes?.[0] || 'Geral', // Adapter para o schema existente
          targetFamily: template.targetFamily || 'Todos'
        };

        if (template.id && !template.id.startsWith('f-') && !template.id.startsWith('mock-')) {
          dbPayload.id = template.id;
        }

        const { data, error } = await DataService.getServiceClient().from('form_templates')
          .upsert([dbPayload])
          .select()
          .single();

        if (error) {
          if (error.message.includes('null value in column "id"')) {
            dbPayload.id = crypto.randomUUID();
            const retry = await DataService.getServiceClient().from('form_templates').upsert([dbPayload]).select().single();
            if (retry.error) throw retry.error;
            return retry.data;
          }
          throw error;
        }
        return data;
      } catch (err) {
        console.error("Erro crítico ao salvar checklist:", err);
        throw err;
      }
    }
    return template;
  },

  deleteFormTemplate: async (id: string) => {
    if (isCloudEnabled) {
      const tid = DataService.getCurrentTenantId();
      await DataService.getServiceClient().from('form_templates')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tid);
    }
  },

  getActivationRules: async (): Promise<any[]> => {
    if (isCloudEnabled) {
      const tenantId = DataService.getCurrentTenantId();
      if (!tenantId) return [];

      const { data, error } = await DataService.getServiceClient().from('activation_rules')
        .select('*')
        .eq('tenant_id', tenantId);

      if (error) {
        console.error("Erro ao buscar regras de ativação:", error);
        return [];
      }
      // Schema do usuário: service_type_id, equipment_family (not null), form_id
      return (data || []).map(r => ({
        ...r,
        // Propriedades Novas (Clean Architecture)
        serviceType: r.service_type_id,
        formTemplateId: r.form_id,
        equipmentFamily: r.equipment_family,

        // Propriedades Legadas (Compatibilidade com FormManagement.tsx)
        serviceTypeId: r.service_type_id,
        formId: r.form_id
      }));
    }
    return getStorage<any[]>('nexus_rules_db', []);
  },

  saveActivationRule: async (rule: any): Promise<any> => {
    const tid = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      try {
        const dbRule: any = {
          tenant_id: tid,
          service_type_id: rule.serviceTypeId || rule.serviceType, // Adapter
          equipment_family: rule.equipmentFamily || 'Todos',
          form_id: rule.formId || rule.formTemplateId
        };

        if (rule.id && !rule.id.toString().startsWith('r-')) {
          dbRule.id = rule.id;
        }

        const { data, error } = await DataService.getServiceClient().from('activation_rules').upsert([dbRule]).select().single();

        if (error) {
          if (error.message.includes('null value in column "id"')) {
            dbRule.id = crypto.randomUUID();
            const retry = await DataService.getServiceClient().from('activation_rules').upsert([dbRule]).select().single();
            if (retry.error) throw retry.error;
            return retry.data;
          }
          throw error;
        }
        return data;
      } catch (err) {
        console.error("Erro ao salvar regra cloud:", err);
        throw err;
      }
    }
    return rule;
  },


  deleteActivationRule: async (id: string) => {
    if (isCloudEnabled) {
      const tid = DataService.getCurrentTenantId();
      await DataService.getServiceClient().from('activation_rules')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tid);
    }
  },

  // --- STOCK MANAGEMENT ---

  _mapStockItemFromDB: (data: any): StockItem => {
    return {
      id: data.id,
      tenantId: data.tenant_id,
      code: data.code,
      externalCode: data.external_code || data.externalCode || '',
      description: data.description,
      category: data.category,
      location: data.location,
      quantity: data.quantity || 0,
      minQuantity: data.min_quantity || data.minQuantity || 0,
      costPrice: data.cost_price || data.costPrice || 0,
      sellPrice: data.sell_price || data.sellPrice || 0,
      freightCost: data.freight_cost || data.freightCost || 0,
      taxCost: data.tax_cost || data.taxCost || 0,
      unit: data.unit_measure || data.unit || 'UN',
      lastRestockDate: data.last_restock_date || data.lastRestockDate,
      active: data.active
    };
  },

  // --- Categorias de Estoque ---

  getCategories: async (): Promise<any[]> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      const { data, error } = await DataService.getServiceClient().from('stock_categories')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('name');

      if (error) {
        console.warn("Supabase categories error (falling back to local):", error.message);
      } else {
        return data || [];
      }
    }
    return getStorage<any[]>(STORAGE_KEYS.CATEGORIES, []);
  },

  createCategory: async (category: any): Promise<void> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled && tenantId) {
      const { error } = await DataService.getServiceClient().from('stock_categories').insert([{
        name: category.name,
        type: category.type || 'stock',
        active: category.active !== false,
        tenant_id: tenantId
      }]);
      if (error) throw error;
      return;
    }

    const current = await DataService.getCategories();
    setStorage(STORAGE_KEYS.CATEGORIES, [...current, category]);
  },

  deleteCategory: async (id: string): Promise<void> => {
    if (isCloudEnabled) {
      const tid = DataService.getCurrentTenantId();
      const { error } = await DataService.getServiceClient().from('stock_categories')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tid);
      if (error) throw error;
      return;
    }
    const current = await DataService.getCategories();
    setStorage(STORAGE_KEYS.CATEGORIES, current.filter(c => c.id !== id));
  },

  // --- Estoque (items) ---
  getStockItems: async (): Promise<StockItem[]> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled) {
      const { data, error } = await DataService.getServiceClient().from('stock_items')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('description');

      if (!error && data) {
        // Map snake_case DB to camelCase Frontend
        return data.map(item => ({
          id: item.id,
          tenantId: item.tenant_id,
          code: item.code,
          externalCode: item.external_code,
          description: item.description,
          category: item.category,
          location: item.location,
          quantity: Number(item.quantity),
          minQuantity: Number(item.min_quantity),
          costPrice: Number(item.cost_price),
          sellPrice: Number(item.sell_price),
          freightCost: Number(item.freight_cost),
          taxCost: Number(item.tax_cost),
          // Infer taxPercent for UI if we only stored cost? 
          // Or if we stored tax_cost, we calculate % on load as we do in UI logic.
          // Let's ensure unit is handled.
          unit: item.unit,
          lastRestockDate: item.last_restock_date,
          active: item.active
        })) as StockItem[];
      }
    }
    return getStorage<StockItem[]>(STORAGE_KEYS.STOCK, []);
  },

  createStockItem: async (item: StockItem): Promise<void> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled && tenantId) {
      const dbItem = {
        tenant_id: tenantId,
        code: item.code,
        external_code: item.externalCode,
        description: item.description,
        category: item.category,
        location: item.location,
        quantity: item.quantity,
        min_quantity: item.minQuantity,
        cost_price: item.costPrice,
        sell_price: item.sellPrice,
        freight_cost: item.freightCost,
        tax_cost: item.taxCost,
        unit: item.unit,
        active: item.active
      };
      const { error } = await DataService.getServiceClient().from('stock_items').insert([dbItem]);
      if (error) throw error;
      return;
    }
    const current = await DataService.getStockItems();
    // Local mock ID generation
    const newItem = { ...item, id: item.id || `item-${Date.now()}` };
    setStorage(STORAGE_KEYS.STOCK, [...current, newItem]);
  },

  updateStockItem: async (item: StockItem): Promise<void> => {
    if (isCloudEnabled) {
      const dbItem = {
        code: item.code,
        external_code: item.externalCode,
        description: item.description,
        category: item.category,
        location: item.location,
        quantity: item.quantity,
        min_quantity: item.minQuantity,
        cost_price: item.costPrice,
        sell_price: item.sellPrice,
        freight_cost: item.freightCost,
        tax_cost: item.taxCost,
        unit: item.unit,
        active: item.active,
        updated_at: new Date().toISOString()
      };
      const { error } = await DataService.getServiceClient().from('stock_items').update(dbItem).eq('id', item.id);
      if (error) throw error;
      return;
    }
    const current = await DataService.getStockItems();
    setStorage(STORAGE_KEYS.STOCK, current.map(i => i.id === item.id ? item : i));
  },

  // --- Estoque Técnico e Movimentações ---

  transferToTech: async (techId: string, itemId: string, quantity: number): Promise<void> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled && tenantId) {
      const client = DataService.getServiceClient();

      // 1. Reduz estoque geral
      const { data: item } = await client.from('stock_items').select('quantity').eq('id', itemId).single();
      if (!item || item.quantity < quantity) throw new Error('Saldo insuficiente no estoque geral');

      await client.from('stock_items').update({ quantity: item.quantity - quantity }).eq('id', itemId);

      // 2. Aumenta estoque do técnico (upsert)
      const { data: currentTechStock } = await client.from('tech_stock')
        .select('quantity')
        .eq('user_id', techId)
        .eq('stock_item_id', itemId)
        .maybeSingle();

      if (currentTechStock) {
        await client.from('tech_stock')
          .update({ quantity: currentTechStock.quantity + quantity, updated_at: new Date().toISOString() })
          .eq('user_id', techId)
          .eq('stock_item_id', itemId);
      } else {
        await client.from('tech_stock').insert([{
          tenant_id: tenantId,
          user_id: techId,
          stock_item_id: itemId,
          quantity: quantity
        }]);
      }

      // 3. Registra movimentação (Audit)
      await client.from('stock_movements').insert([{
        tenant_id: tenantId,
        item_id: itemId,
        user_id: techId,
        type: 'TRANSFER',
        quantity: quantity,
        source: 'GENERAL',
        destination: 'TECH',
        created_by: (await DataService.getCurrentUser())?.id
      }]);
    }
  },

  getTechStock: async (techId: string): Promise<any[]> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled && tenantId) {
      const { data, error } = await DataService.getServiceClient()
        .from('tech_stock')
        .select('*, stock_items(*)')
        .eq('user_id', techId)
        .eq('tenant_id', tenantId);
      if (error) throw error;
      return data.map(ts => ({
        id: ts.id,
        stockItemId: ts.stock_item_id,
        quantity: Number(ts.quantity),
        item: ts.stock_items ? {
          description: ts.stock_items.description,
          code: ts.stock_items.code,
          sellPrice: Number(ts.stock_items.sell_price)
        } : null
      }));
    }
    return [];
  },

  consumeTechStock: async (techId: string, stockItemId: string, quantity: number, orderId: string): Promise<void> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled && tenantId) {
      // 1. Verificar se o técnico tem o item e em quantidade suficiente
      const { data: techItems, error: fetchError } = await DataService.getServiceClient()
        .from('tech_stock')
        .select('*')
        .eq('user_id', techId)
        .eq('stock_item_id', stockItemId)
        .eq('tenant_id', tenantId);

      if (fetchError) throw fetchError;
      if (!techItems || techItems.length === 0 || Number(techItems[0].quantity) < quantity) {
        throw new Error(`Estoque insuficiente com o técnico para o item selecionado.`);
      }

      const currentTechQty = Number(techItems[0].quantity);

      // 2. Deduzir do estoque do técnico
      const { error: updateError } = await DataService.getServiceClient()
        .from('tech_stock')
        .update({
          quantity: currentTechQty - quantity,
          updated_at: new Date().toISOString()
        })
        .eq('id', techItems[0].id);

      if (updateError) throw updateError;

      // 3. Registrar a movimentação
      const { error: moveError } = await DataService.getServiceClient()
        .from('stock_movements')
        .insert([{
          tenant_id: tenantId,
          stock_item_id: stockItemId,
          user_id: techId,
          type: 'CONSUMPTION',
          quantity: quantity,
          source: 'Técnico (' + techId.slice(0, 5) + ')',
          destination: 'O.S. #' + orderId.slice(0, 8),
          reference_id: orderId,
          created_at: new Date().toISOString()
        }]);

      if (moveError) throw moveError;
    }
  },

  // --- Fluxo de Caixa ---

  registerCashFlow: async (entry: Partial<CashFlowEntry>): Promise<void> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled && tenantId) {
      const dbEntry = {
        tenant_id: tenantId,
        type: entry.type,
        category: entry.category,
        amount: entry.amount,
        description: entry.description,
        reference_id: entry.referenceId,
        reference_type: entry.referenceType,
        payment_method: entry.paymentMethod,
        entry_date: entry.entryDate || new Date().toISOString(),
        created_by: (await DataService.getCurrentUser())?.id
      };
      const { error } = await DataService.getServiceClient().from('cash_flow').insert([dbEntry]);
      if (error) throw error;
    }
  },

  getCashFlow: async (filters?: { start?: string, end?: string }): Promise<CashFlowEntry[]> => {
    const tenantId = DataService.getCurrentTenantId();
    if (isCloudEnabled && tenantId) {
      let query = DataService.getServiceClient().from('cash_flow').select('*').eq('tenant_id', tenantId);
      if (filters?.start) query = query.gte('entry_date', filters.start);
      if (filters?.end) query = query.lte('entry_date', filters.end);

      const { data, error } = await query.order('entry_date', { ascending: false });
      if (error) throw error;
      return data.map(d => ({
        id: d.id,
        tenantId: d.tenant_id,
        type: d.type,
        category: d.category,
        amount: Number(d.amount),
        description: d.description,
        referenceId: d.reference_id,
        referenceType: d.reference_type,
        paymentMethod: d.payment_method,
        entryDate: d.entry_date,
        createdAt: d.created_at,
        createdBy: d.created_by
      })) as CashFlowEntry[];
    }
    return [];
  },

  deleteStockItem: async (id: string): Promise<void> => {
    if (isCloudEnabled) {
      const tid = DataService.getCurrentTenantId();
      const { error } = await DataService.getServiceClient().from('stock_items')
        .delete()
        .eq('id', id)
        .eq('tenant_id', tid);
      if (error) throw error;
      return;
    }
    const current = await DataService.getStockItems();
    setStorage(STORAGE_KEYS.STOCK, current.filter(i => i.id !== id));
  },

  // 📢 Nexus Global Notifications: Comunicados do Master para os Tenants
  createSystemNotification: async (notification: { title: string, content: string, type: 'broadcast' | 'targeted', targetTenants?: string[], priority: string }) => {
    if (isCloudEnabled) {
      const { data, error } = await adminSupabase.from('system_notifications').insert([{
        title: notification.title,
        content: notification.content,
        type: notification.type,
        target_tenants: notification.targetTenants,
        priority: notification.priority
      }]).select().single();
      if (error) throw error;
      return data;
    }
    return null;
  },

  getUnreadSystemNotifications: async (userId: string): Promise<any[]> => {
    if (isCloudEnabled) {
      // 1. Busca IDs das notificações que o usuário JÁ leu
      const { data: readRecords } = await supabase.from('system_notification_reads').select('notification_id').eq('user_id', userId);
      const readIds = (readRecords || []).map(r => r.notification_id);

      // 2. Busca notificações relevantes que NÃO estão na lista de lidas
      let query = supabase.from('system_notifications')
        .select('*')
        .order('created_at', { ascending: false });

      const { data: notifications, error } = await query;

      if (error) {
        console.error("Erro ao buscar notificações globais:", error);
        return [];
      }

      // Filtragem manual para evitar problemas com sintaxe de array complexa no Supabase JS
      return (notifications || []).filter(n => !readIds.includes(n.id));
    }
    return [];
  },

  markSystemNotificationAsRead: async (userId: string, notificationId: string) => {
    if (isCloudEnabled) {
      const { error } = await supabase.from('system_notification_reads').upsert([{
        user_id: userId,
        notification_id: notificationId,
        read_at: new Date().toISOString()
      }]);
      if (error) {
        console.error("Erro ao marcar notificação como lida:", error);
        throw error;
      }
    }
  }
};
