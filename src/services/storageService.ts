import { publicSupabase, safeKey, supabase } from '../lib/supabase';

import { getCurrentTenantId } from '../lib/tenantContext';

const isCloudEnabled = !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);



export type NexusModule =
    | 'Ordem_de_Servico'
    | 'Orcamentos'
    | 'Vendas'
    | 'Estoque'
    | 'Financeiro'
    | 'Configuracoes_Empresa'
    | 'Avatares'
    | 'WhatsApp'
    | 'Geral';

export interface TenantStorageMeta {
    companyName?: string;
    tradeName?: string;
    tradingName?: string;
    name?: string;
    cnpj?: string;
    document?: string;
}

// 🛡️ In-Memory Caches de alta performance (0ms overhead para uploads em lote)
const tenantMasterFolderCache = new Map<string, string>();
const tenantMetaCache = new Map<string, TenantStorageMeta>();

export interface UploadedFile {
    id: string;
    url: string;
    fieldId?: string;
    uploadedAt: string;
    uploadedBy?: string;
    signerName?: string;
}

export const StorageService = {
    /**
     * 🏛️ Sanitiza nomes de pasta para o padrão Cloudflare R2 / S3
     * Remove acentos, caracteres proibidos e colapsa underscores
     */
    sanitizeFolderSegment: (raw: string, maxLength = 50): string => {
        if (!raw) return '';
        return raw
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '') // remove acentos
            .replace(/[^a-zA-Z0-9]/g, '_')   // substitui símbolos por _
            .replace(/_+/g, '_')             // remove repetições consecutivas de _
            .replace(/^_|_$/g, '')           // remove _ do início e fim
            .toUpperCase()
            .slice(0, maxLength);
    },

    /**
     * 🔢 Extrai apenas os dígitos limpos do CNPJ ou CPF
     */
    sanitizeCnpjDigits: (rawDoc?: string): string => {
        if (!rawDoc) return '';
        return rawDoc.replace(/\D/g, '');
    },

    /**
     * 🏷️ Registra metadados do tenant em memória para resolução instantânea
     */
    registerTenantMetadata: (tenantId: string, meta: TenantStorageMeta): void => {
        if (!tenantId) return;
        const existing = tenantMetaCache.get(tenantId) || {};
        const updated = { ...existing, ...meta };
        tenantMetaCache.set(tenantId, updated);
        const folder = StorageService.buildTenantMasterFolder(tenantId, updated);
        tenantMasterFolderCache.set(tenantId, folder);
    },

    /**
     * 🏢 Constrói a Pasta Mestre Corporativa no Cloudflare R2
     * Padrão Oficial Inegociável: [NOME_EMPRESA]_[CNPJ]
     * Exemplo: DUNO_SOLUCOES_EM_TECNOLOGIA_44123456000199
     */
    buildTenantMasterFolder: (tenantId: string, meta?: TenantStorageMeta): string => {
        const rawName = meta?.companyName || meta?.tradingName || meta?.tradeName || meta?.name || 'EMPRESA';
        const cleanName = StorageService.sanitizeFolderSegment(rawName, 50) || 'EMPRESA';

        const rawDoc = meta?.cnpj || meta?.document;
        const digits = StorageService.sanitizeCnpjDigits(rawDoc);

        // Se houver CNPJ ou CPF válido, usamos os dígitos limpos
        let cleanDoc = digits;
        if (!cleanDoc || cleanDoc.length < 8) {
            // Fallback determinístico caso o CNPJ ainda não tenha sido cadastrado
            cleanDoc = (tenantId && tenantId !== 'global' && tenantId !== 'anon')
                ? tenantId.replace(/-/g, '').substring(0, 8).toUpperCase()
                : 'GLOBAL';
        }

        return `${cleanName}_${cleanDoc}`;
    },

    /**
     * 🔍 Resolve a Pasta Mestre com multi-layer fallback (Memória -> DB Auth -> DB RPC)
     */
    getTenantMasterFolder: async (tenantIdToUse: string): Promise<string> => {
        if (!tenantIdToUse || tenantIdToUse === 'anon' || tenantIdToUse === 'global') {
            return 'EMPRESA_GLOBAL';
        }

        if (tenantMasterFolderCache.has(tenantIdToUse)) {
            return tenantMasterFolderCache.get(tenantIdToUse)!;
        }

        let meta = tenantMetaCache.get(tenantIdToUse);

        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantIdToUse);
        if (!meta && isUuid) {
            try {
                // 1. Tenta buscar no banco com cliente autenticado
                const { data: tData, error } = await supabase
                    .from('tenants')
                    .select('*')
                    .eq('id', tenantIdToUse)
                    .maybeSingle();

                if (tData && !error) {
                    meta = {
                        companyName: tData.company_name,
                        tradeName: tData.trading_name || tData.trade_name,
                        name: tData.name,
                        cnpj: tData.cnpj,
                        document: tData.document
                    };
                    tenantMetaCache.set(tenantIdToUse, meta);
                }
            } catch (authErr) {
                console.warn('[Storage/R2] Consulta autenticada de tenant falhou:', authErr);
            }

            // 2. Fallback público via RPC caso seja link público / dropzone
            if (!meta) {
                try {
                    const { data: pData } = await publicSupabase.rpc('get_public_tenant_info', { p_tenant_id: tenantIdToUse });
                    if (pData) {
                        meta = {
                            companyName: pData.company_name,
                            tradeName: pData.trading_name || pData.trade_name,
                            name: pData.name,
                            cnpj: pData.cnpj,
                            document: pData.document
                        };
                        tenantMetaCache.set(tenantIdToUse, meta);
                    }
                } catch (rpcErr) {
                    console.warn('[Storage/R2] RPC get_public_tenant_info falhou:', rpcErr);
                }
            }
        }

        const masterFolder = StorageService.buildTenantMasterFolder(tenantIdToUse, meta);
        tenantMasterFolderCache.set(tenantIdToUse, masterFolder);
        return masterFolder;
    },

    /**
     * 🚀 Inicializa no Cloudflare R2 a estrutura completa de pastas mestre e módulos de uma empresa
     * Cria marcadores .nexus_keep para cada módulo oficial:
     * - Ordem_de_Servico
     * - Orcamentos
     * - Vendas
     * - Estoque
     * - Financeiro
     * - Configuracoes_Empresa
     * - Avatares
     * - WhatsApp
     */
    initializeTenantMasterFolder: async (tenant: {
        id: string;
        name?: string;
        company_name?: string;
        companyName?: string;
        trading_name?: string;
        tradingName?: string;
        trade_name?: string;
        cnpj?: string;
        document?: string;
    }): Promise<{ success: boolean; masterFolder: string; createdModules: string[] }> => {
        const meta: TenantStorageMeta = {
            companyName: tenant.company_name || tenant.companyName,
            tradeName: tenant.trading_name || tenant.tradingName || tenant.trade_name,
            name: tenant.name,
            cnpj: tenant.cnpj,
            document: tenant.document
        };

        const masterFolder = StorageService.buildTenantMasterFolder(tenant.id, meta);
        StorageService.registerTenantMetadata(tenant.id, meta);

        const modules: string[] = [
            'Ordem_de_Servico',
            'Orcamentos',
            'Vendas',
            'Estoque/Produtos',
            'Financeiro/Comprovantes',
            'Configuracoes_Empresa/Logos',
            'Avatares/Usuarios',
            'WhatsApp/Conversas'
        ];

        console.log(`[Storage/R2] 📁 Provisionando estrutura corporativa para: ${masterFolder}...`);

        const session = (await supabase.auth.getSession())?.data?.session;
        const token = session?.access_token || safeKey;
        const authHeaders = {
            Authorization: `Bearer ${token}`,
            apikey: safeKey
        };

        const base64Content = btoa(`Nexus Pro - Master Directory: ${masterFolder}\nCreated: ${new Date().toISOString()}`);

        const results = await Promise.allSettled(
            modules.map(async (mod) => {
                const keepPath = `${masterFolder}/${mod}/.nexus_keep`;
                const res = await supabase.functions.invoke('r2-operations', {
                    body: {
                        action: 'direct-upload',
                        path: keepPath,
                        bucketType: 'private',
                        contentType: 'text/plain',
                        base64: base64Content
                    },
                    headers: authHeaders
                });
                if (res.error) throw res.error;
                return keepPath;
            })
        );

        const created = results.filter(r => r.status === 'fulfilled').length;
        console.log(`[Storage/R2] ✅ Pastas criadas no Cloudflare R2: ${created}/${modules.length} módulos em ${masterFolder}`);

        return {
            success: created > 0,
            masterFolder,
            createdModules: modules
        };
    },

    /**
     * 🎛️ Nexus Image Compression Engine (WebP Optimized)
     * Reduz o peso da imagem drasticamente usando o padrão WebP.
     */
    compressImage: async (base64: string, maxWidth = 1200, quality = 0.82): Promise<string> => {
        return new Promise((resolve) => {
            try {
                const img = new Image();
                img.src = base64;
                img.onload = () => {
                    try {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;

                        if (width > maxWidth) {
                            height = Math.round((height * maxWidth) / width);
                            width = maxWidth;
                        }

                        canvas.width = width;
                        canvas.height = height;

                        const ctx = canvas.getContext('2d', { alpha: true });
                        if (!ctx) {
                            console.warn('Canvas context failed, returning original');
                            resolve(base64);
                            return;
                        }

                        ctx.imageSmoothingEnabled = true;
                        ctx.imageSmoothingQuality = 'high';
                        ctx.clearRect(0, 0, width, height);
                        ctx.drawImage(img, 0, 0, width, height);

                        const compressedBase64 = canvas.toDataURL('image/webp', quality);
                        resolve(compressedBase64);
                    } catch (innerErr) {
                        console.error('Error during canvas processing:', innerErr);
                        resolve(base64);
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
     * 🧠 Resolve os paths técnicos para o novo padrão corporativo Cloudflare R2
     * Regra Inegociável:
     * - Toda empresa possui sua pasta mestre: [NOME_EMPRESA]_[CNPJ]
     * - Dentro dela, estritamente as pastas de módulos:
     *   - Ordem_de_Servico
     *   - Orcamentos
     *   - Vendas
     *   - Estoque
     *   - Financeiro
     *   - Configuracoes_Empresa
     *   - Avatares
     *   - WhatsApp
     *   - Geral
     */
    _resolveHumanPath: async (
        originalPath: string,
        providedTenantId?: string
    ): Promise<{
        finalPath: string;
        resolvedTenantId: string;
        masterFolder: string;
        moduleName: NexusModule;
        fileName?: string;
    }> => {
        let cleanPath = originalPath.toString().replace(/^\/+/, '').replace(/\/+$/, '');
        let tenantIdToUse = providedTenantId;
        let moduleName: NexusModule = 'Geral';
        let moduleRelativePath = cleanPath;
        let extractedFileName: string | undefined = undefined;

        // Se o path fornecido já contém um nome de arquivo no final (ex: .webp, .png, .jpg, .pdf, .mp4)
        const parts = cleanPath.split('/');
        const lastPart = parts[parts.length - 1];
        if (/\.[a-zA-Z0-9]{2,5}$/i.test(lastPart)) {
            extractedFileName = lastPart;
            parts.pop();
            cleanPath = parts.join('/');
        }

        try {
            // ─────────────────────────────────────────────────────────────
            // 1. MÓDULO: ORDEM DE SERVIÇO (OS)
            // ─────────────────────────────────────────────────────────────
            if (
                cleanPath.startsWith('orders/') ||
                cleanPath.startsWith('checklist_photos') ||
                cleanPath.startsWith('checklist_videos') ||
                cleanPath.startsWith('service_visits') ||
                cleanPath.startsWith('order_impediments')
            ) {
                moduleName = 'Ordem_de_Servico';

                if (cleanPath.startsWith('orders/')) {
                    const orderParts = cleanPath.split('/');
                    const orderId = orderParts[1];
                    const rawSubfolder = orderParts[2] || '';

                    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orderId);
                    const orderQuery = supabase.from('orders').select('display_id, tenant_id');
                    const { data } = isUuid
                        ? await orderQuery.eq('id', orderId).maybeSingle()
                        : await orderQuery.eq('display_id', orderId).maybeSingle();

                    let orderCode = orderId;
                    if (data) {
                        if (!tenantIdToUse) tenantIdToUse = data.tenant_id;
                        orderCode = data.display_id || orderId.substring(0, 8);
                    } else {
                        // Fallback público para dropzone
                        const { data: pData } = await publicSupabase.rpc('get_public_document', { doc_token: orderId, doc_type: 'order' });
                        if (pData) {
                            if (!tenantIdToUse) tenantIdToUse = pData.tenant_id;
                            orderCode = pData.display_id || pData.id?.substring(0, 8) || orderId.substring(0, 8);
                        }
                    }

                    const cleanCode = StorageService.sanitizeFolderSegment(orderCode, 35) || 'Geral';
                    const orderFolder = cleanCode.startsWith('OS_')
                        ? cleanCode
                        : `OS_${cleanCode.replace(/^OS[-_]/i, '')}`;

                    let subHuman = 'Evidencias';
                    if (rawSubfolder === 'evidence' || rawSubfolder === 'photos' || rawSubfolder === 'extra_photos') subHuman = 'Evidencias';
                    else if (rawSubfolder === 'signatures' || rawSubfolder === 'signature') subHuman = 'Assinaturas';
                    else if (rawSubfolder === 'internal_notes' || rawSubfolder === 'notes') subHuman = 'Observacoes';
                    else if (rawSubfolder === 'block' || rawSubfolder === 'impediments') subHuman = 'Impedimentos';
                    else if (rawSubfolder === 'videos') subHuman = 'Videos';
                    else if (rawSubfolder === 'form_photos' || rawSubfolder === 'checklist' || rawSubfolder === 'checklist_photos') subHuman = 'Checklist';
                    else if (rawSubfolder === 'documents' || rawSubfolder === 'terms') subHuman = 'Documentos';
                    else if (rawSubfolder) subHuman = StorageService.sanitizeFolderSegment(rawSubfolder, 30) || 'Arquivos';

                    moduleRelativePath = `Ordem_de_Servico/${orderFolder}/${subHuman}`;
                } else if (cleanPath.startsWith('checklist_photos')) {
                    moduleRelativePath = `Ordem_de_Servico/Checklist/Fotos`;
                } else if (cleanPath.startsWith('checklist_videos')) {
                    moduleRelativePath = `Ordem_de_Servico/Checklist/Videos`;
                } else {
                    moduleRelativePath = `Ordem_de_Servico/Geral`;
                }
            }

            // ─────────────────────────────────────────────────────────────
            // 2. MÓDULO: ORÇAMENTOS (Prefixo Oficial: Orcamento_)
            // ─────────────────────────────────────────────────────────────
            else if (cleanPath.startsWith('quotes/') || cleanPath.startsWith('orcamentos/')) {
                moduleName = 'Orcamentos';
                const quoteParts = cleanPath.split('/');
                const quoteId = quoteParts[1];
                const rawSubfolder = quoteParts[2] || '';

                const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(quoteId);
                const { data } = await supabase.from('quotes').select('display_id, tenant_id').eq(isUuid ? 'id' : 'display_id', quoteId).maybeSingle();

                let quoteCode = quoteId;
                if (data) {
                    if (!tenantIdToUse) tenantIdToUse = data.tenant_id;
                    quoteCode = data.display_id || quoteId.substring(0, 8);
                } else {
                    const { data: pData } = await publicSupabase.rpc('get_public_document', { doc_token: quoteId, doc_type: 'quote' });
                    if (pData) {
                        if (!tenantIdToUse) tenantIdToUse = pData.tenant_id;
                        quoteCode = pData.display_id || pData.id?.substring(0, 8) || quoteId.substring(0, 8);
                    }
                }

                const cleanQuote = StorageService.sanitizeFolderSegment(quoteCode, 35) || 'Geral';
                const quoteFolder = cleanQuote.startsWith('Orcamento_')
                    ? cleanQuote
                    : `Orcamento_${cleanQuote.replace(/^(ORC|ORCAMENTO)[-_]/i, '')}`;

                let subHuman = 'Arquivos';
                if (rawSubfolder === 'signatures' || rawSubfolder === 'signature') subHuman = 'Assinaturas';
                else if (rawSubfolder === 'rejections' || rawSubfolder === 'rejection') subHuman = 'Rejeicoes';
                else if (rawSubfolder === 'proposals' || rawSubfolder === 'pdf') subHuman = 'Propostas';
                else if (rawSubfolder === 'evidence' || rawSubfolder === 'photos') subHuman = 'Evidencias';
                else if (rawSubfolder) subHuman = StorageService.sanitizeFolderSegment(rawSubfolder, 30) || 'Arquivos';

                moduleRelativePath = `Orcamentos/${quoteFolder}/${subHuman}`;
            }

            // ─────────────────────────────────────────────────────────────
            // 3. MÓDULO: VENDAS / PEDIDOS DE VENDA (Prefixo Oficial: Pedido_Venda_)
            // ─────────────────────────────────────────────────────────────
            else if (cleanPath.startsWith('sales_orders/') || cleanPath.startsWith('sales/') || cleanPath.startsWith('vendas/')) {
                moduleName = 'Vendas';
                const salesParts = cleanPath.split('/');
                const saleId = salesParts[1] || 'Geral';
                const rawSub = salesParts[2] || 'Arquivos';
                const cleanSub = rawSub === 'signatures' ? 'Assinaturas' : rawSub === 'receipts' ? 'Comprovantes' : 'Arquivos';

                const cleanSale = StorageService.sanitizeFolderSegment(saleId, 35) || 'Geral';
                const saleFolder = cleanSale.startsWith('Pedido_Venda_')
                    ? cleanSale
                    : `Pedido_Venda_${cleanSale.replace(/^(PV|PEDIDO|PEDIDO_VENDA|VENDA)[-_]/i, '')}`;

                moduleRelativePath = `Vendas/${saleFolder}/${cleanSub}`;
            }

            // ─────────────────────────────────────────────────────────────
            // 4. MÓDULO: ESTOQUE / PRODUTOS (Prefixo Oficial: Produto_)
            // ─────────────────────────────────────────────────────────────
            else if (cleanPath.startsWith('inventory/') || cleanPath.startsWith('stock/') || cleanPath.startsWith('items/') || cleanPath.startsWith('estoque/')) {
                moduleName = 'Estoque';
                const stockParts = cleanPath.split('/');
                const itemCode = stockParts[2] || stockParts[1] || 'Geral';
                const cleanItem = StorageService.sanitizeFolderSegment(itemCode, 40) || 'Geral';
                const productFolder = cleanItem.startsWith('Produto_')
                    ? cleanItem
                    : `Produto_${cleanItem.replace(/^(PROD|PRODUTO|ITEM)[-_]/i, '')}`;

                moduleRelativePath = `Estoque/Produtos/${productFolder}`;
            }

            // ─────────────────────────────────────────────────────────────
            // 5. MÓDULO: FINANCEIRO (Prefixo Oficial: Comprovante_)
            // ─────────────────────────────────────────────────────────────
            else if (cleanPath.startsWith('financial/') || cleanPath.startsWith('receipts/') || cleanPath.startsWith('financeiro/')) {
                moduleName = 'Financeiro';
                const finParts = cleanPath.split('/');
                const subCategory = finParts[1] === 'receipts' ? 'Comprovantes' : finParts[1] || 'Comprovantes';
                const folderIdentifier = finParts[2] || new Date().toISOString().slice(0, 7).replace('-', '_');
                const cleanFinId = StorageService.sanitizeFolderSegment(folderIdentifier, 35);
                const compFolder = cleanFinId.startsWith('Comprovante_')
                    ? cleanFinId
                    : `Comprovante_${cleanFinId.replace(/^COMPROVANTE[-_]/i, '')}`;

                moduleRelativePath = `Financeiro/Comprovantes/${compFolder}`;
            }

            // ─────────────────────────────────────────────────────────────
            // 6. MÓDULO: CONFIGURAÇÕES DA EMPRESA (Logos, Documentos)
            // ─────────────────────────────────────────────────────────────
            else if (cleanPath.startsWith('tenants/') || cleanPath.startsWith('company/') || cleanPath.startsWith('logos/')) {
                moduleName = 'Configuracoes_Empresa';
                const tenantParts = cleanPath.split('/');
                const possibleId = tenantParts[1];
                if (possibleId && possibleId !== 'new' && possibleId !== 'new_tenant' && possibleId !== 'company') {
                    if (!tenantIdToUse || tenantIdToUse === 'anon' || tenantIdToUse === 'global') {
                        tenantIdToUse = possibleId;
                    }
                }
                const subType = tenantParts[2] === 'logo' || tenantParts[1] === 'logo' ? 'Logos' : 'Logos';
                moduleRelativePath = `Configuracoes_Empresa/${subType}`;
            }

            // ─────────────────────────────────────────────────────────────
            // 7. MÓDULO: AVATARES DE USUÁRIOS E TÉCNICOS (Prefixo Oficial: Usuario_)
            // ─────────────────────────────────────────────────────────────
            else if (cleanPath.startsWith('avatars/')) {
                moduleName = 'Avatares';
                const avatarParts = cleanPath.split('/');
                const userId = avatarParts[2] || avatarParts[1];
                let userName = userId || 'Usuario';

                if (userId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
                    try {
                        const { data } = await supabase.from('users').select('name, tenant_id').eq('id', userId).maybeSingle();
                        if (data) {
                            if (data.name) userName = StorageService.sanitizeFolderSegment(data.name, 40);
                            if (!tenantIdToUse && data.tenant_id) tenantIdToUse = data.tenant_id;
                        }
                    } catch (_) {}
                }

                const cleanUser = StorageService.sanitizeFolderSegment(userName, 40) || 'Usuario';
                const userFolder = cleanUser.startsWith('Usuario_')
                    ? cleanUser
                    : `Usuario_${cleanUser.replace(/^USUARIO[-_]/i, '')}`;

                moduleRelativePath = `Avatares/Usuarios/${userFolder}`;
            }

            // ─────────────────────────────────────────────────────────────
            // 8. MÓDULO: WHATSAPP (CRM / Conversas — Prefixo Oficial: Conversa_)
            // ─────────────────────────────────────────────────────────────
            else if (cleanPath.startsWith('whatsapp/')) {
                moduleName = 'WhatsApp';
                const wppParts = cleanPath.split('/');
                const possibleTenant = wppParts[1];
                const hasTenantInPath = possibleTenant && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(possibleTenant);
                if (hasTenantInPath && !tenantIdToUse) {
                    tenantIdToUse = possibleTenant;
                }

                const rawPhone = hasTenantInPath ? (wppParts[2] || 'Geral') : (possibleTenant || 'Geral');
                const cleanPhone = rawPhone.replace(/\D/g, '') || StorageService.sanitizeFolderSegment(rawPhone, 25) || 'Geral';
                const conversaFolder = cleanPhone.startsWith('Conversa_')
                    ? cleanPhone
                    : `Conversa_${cleanPhone.replace(/^CONVERSA[-_]/i, '')}`;

                const tipoIndex = hasTenantInPath ? 3 : 2;
                const dateIndex = hasTenantInPath ? 4 : 3;

                const tipoRaw = (wppParts[tipoIndex] || 'Midia').toLowerCase();
                let tipo = 'Midia';
                if (tipoRaw.includes('imagem') || tipoRaw.includes('foto') || tipoRaw.includes('image')) tipo = 'Imagens';
                else if (tipoRaw.includes('doc') || tipoRaw.includes('pdf')) tipo = 'Documentos';
                else if (tipoRaw.includes('audio') || tipoRaw.includes('voz') || tipoRaw.includes('ptt')) tipo = 'Audios';

                const dateSub = wppParts[dateIndex] ? `/${StorageService.sanitizeFolderSegment(wppParts[dateIndex], 20)}` : '';
                moduleRelativePath = `WhatsApp/Conversas/${conversaFolder}/${tipo}${dateSub}`;
            }

            // ─────────────────────────────────────────────────────────────
            // 9. CATCH-ALL DEFENSIVO (Zero arquivos fora do tenant)
            // ─────────────────────────────────────────────────────────────
            else {
                moduleName = 'Geral';
                moduleRelativePath = `Geral/${cleanPath}`;
            }

            // Resolver o Tenant ID definitivo
            if (!tenantIdToUse || tenantIdToUse === 'anon') {
                tenantIdToUse = getCurrentTenantId() || 'global';
            }

            // Obter a Pasta Mestre corporativa da empresa: [NOME_EMPRESA]_[CNPJ]
            const masterFolder = await StorageService.getTenantMasterFolder(tenantIdToUse);

            // Montar o caminho final canônico
            const finalPath = `${masterFolder}/${moduleRelativePath}`.replace(/\/+/g, '/');

            return {
                finalPath,
                resolvedTenantId: tenantIdToUse,
                masterFolder,
                moduleName,
                fileName: extractedFileName
            };

        } catch (e) {
            console.error('[StorageService] ⚠️ Falha ao resolver HumanPath:', e);
            const fallbackMaster = (tenantIdToUse && tenantIdToUse !== 'global')
                ? `EMPRESA_${tenantIdToUse.substring(0, 8).toUpperCase()}`
                : 'EMPRESA_GLOBAL';
            return {
                finalPath: `${fallbackMaster}/Geral/${cleanPath}`.replace(/\/+/g, '/'),
                resolvedTenantId: tenantIdToUse || 'global',
                masterFolder: fallbackMaster,
                moduleName: 'Geral',
                fileName: extractedFileName
            };
        }
    },

    /**
     * 🛡️ NASA-Grade Storage Engine (Internal Version 5 - RESILIENT)
     */
    _uploadCore: async (
        blobOrFile: Blob | File,
        path: string,
        retryCount = 2,
        signal?: AbortSignal,
        options?: { contentType?: string; extension?: string; tenantId?: string }
    ): Promise<string> => {
        const pathTenant = path.startsWith('tenants/') ? path.split('/')[1] : undefined;
        const validPathTenant = (pathTenant && pathTenant !== 'company' && pathTenant !== 'new' && pathTenant !== 'new_tenant') ? pathTenant : undefined;
        const authTenantId = options?.tenantId || validPathTenant || getCurrentTenantId() || 'global';

        const resolved = await StorageService._resolveHumanPath(path, authTenantId);

        const ext = options?.extension || 'webp';
        const finalFileName = resolved.fileName || `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${ext}`;
        const fullPath = `${resolved.finalPath}/${finalFileName}`.replace(/\/+/g, '/');
        const contentType = options?.contentType || 'image/webp';

        console.log(`[Storage/R2] 📤 Uploading ${fullPath} (${(blobOrFile.size / 1024).toFixed(0)}KB)...`);

        const session = (await supabase.auth.getSession())?.data?.session;
        const token = session?.access_token || safeKey;
        const authHeaders = {
            Authorization: `Bearer ${token}`,
            apikey: safeKey
        };

        for (let i = 0; i <= retryCount; i++) {
            if (signal?.aborted) throw new Error('AbortError');

            try {
                // 1. Pede a URL assinada para a Edge Function
                let signData: any = null;
                let signError: any = null;

                try {
                    const res = await supabase.functions.invoke('r2-operations', {
                        body: { action: 'upload', path: fullPath, bucketType: 'private', contentType },
                        headers: authHeaders
                    });
                    signData = res.data;
                    signError = res.error;
                } catch (invokeErr: any) {
                    signError = invokeErr;
                }

                // Fallback resiliente via publicSupabase com anon key se o cliente principal falhar
                if (signError || !signData?.signedUrl) {
                    console.warn(`[Storage/R2] ⚠️ Tentativa ${i + 1} com cliente principal falhou (${signError?.message || 'sem URL'}). Tentando via publicSupabase...`);
                    try {
                        const pubRes = await publicSupabase.functions.invoke('r2-operations', {
                            body: { action: 'upload', path: fullPath, bucketType: 'private', contentType },
                            headers: {
                                Authorization: `Bearer ${safeKey}`,
                                apikey: safeKey
                            }
                        });
                        if (pubRes.data?.signedUrl) {
                            signData = pubRes.data;
                            signError = null;
                        } else if (pubRes.error) {
                            signError = pubRes.error;
                        }
                    } catch (pubErr: any) {
                        signError = pubErr;
                    }
                }

                // 2. Faz o upload direto via PUT HTTP pro Cloudflare R2
                if (!signError && signData?.signedUrl) {
                    try {
                        const uploadPromise = fetch(signData.signedUrl, {
                            method: 'PUT',
                            body: blobOrFile,
                            headers: {
                                'Content-Type': contentType
                            },
                            signal
                        });

                        const networkTimeout = new Promise<Response>((_, rej) => setTimeout(() => rej(new Error('NETWORK_TIMEOUT_45S')), 45000));
                        const response = await Promise.race([uploadPromise, networkTimeout]);

                        if (response.ok) {
                            const envUrl = import.meta.env.VITE_R2_PUBLIC_URL;
                            if (envUrl) {
                                return envUrl.endsWith('/') ? `${envUrl}${fullPath}` : `${envUrl}/${fullPath}`;
                            }
                            return signData.publicUrl;
                        }

                        console.warn(`[Storage/R2] ⚠️ Direct PUT retornou status ${response.status}. Tentando direct-upload via Edge Function...`);
                    } catch (putErr: any) {
                        if (putErr.name === 'AbortError' || signal?.aborted) throw putErr;
                        console.warn(`[Storage/R2] ⚠️ Direct PUT falhou (${putErr.message}). Acionando fallback direct-upload via Edge Function...`);
                    }
                }

                // 3. Fallback Resiliente: Upload direto via Edge Function (evita bloqueios de CSP/Adblockers no cliente)
                console.log(`[Storage/R2] 🔄 Executando fallback direct-upload no servidor...`);
                const base64Data = await new Promise<string>((res, rej) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result as string);
                    reader.onerror = rej;
                    reader.readAsDataURL(blobOrFile);
                });

                let directRes = await supabase.functions.invoke('r2-operations', {
                    body: { action: 'direct-upload', path: fullPath, bucketType: 'private', contentType, base64: base64Data },
                    headers: authHeaders
                });

                if (directRes.error || !directRes.data?.publicUrl) {
                    directRes = await publicSupabase.functions.invoke('r2-operations', {
                        body: { action: 'direct-upload', path: fullPath, bucketType: 'private', contentType, base64: base64Data },
                        headers: {
                            Authorization: `Bearer ${safeKey}`,
                            apikey: safeKey
                        }
                    });
                }

                if (directRes.data?.publicUrl) {
                    console.log(`[Storage/R2] ✅ Fallback direct-upload concluído:`, directRes.data.publicUrl);
                    const envUrl = import.meta.env.VITE_R2_PUBLIC_URL;
                    if (envUrl) {
                        return envUrl.endsWith('/') ? `${envUrl}${fullPath}` : `${envUrl}/${fullPath}`;
                    }
                    return directRes.data.publicUrl;
                }

                throw new Error(directRes.error?.message || signError?.message || 'Falha ao enviar arquivo para o Cloudflare R2');

            } catch (err: any) {
                if (err.name === 'AbortError' || signal?.aborted) throw err;
                console.warn(`[Storage/R2] ⚠️ Tentativa ${i + 1} falhou:`, err.message);

                if (i === retryCount) throw err;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error("STORAGE_R2_UNREACHABLE");
    },

    /**
     * 🛡️ Cloudflare R2 Public Dropzone Engine (Upload direto e exclusivo para R2)
     */
    _uploadDropzoneCore: async (blobOrFile: Blob | File, path: string, retryCount = 2, signal?: AbortSignal): Promise<string> => {
        const resolved = await StorageService._resolveHumanPath(path);

        const finalFileName = resolved.fileName || `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.webp`;
        const fullPath = `${resolved.finalPath}/${finalFileName}`.replace(/\/+/g, '/');
        const contentType = 'image/webp';

        console.log(`[Storage/Dropzone-R2] 📤 Uploading strictly to Cloudflare R2: ${fullPath} (${(blobOrFile.size / 1024).toFixed(0)}KB)...`);

        const authHeaders = {
            Authorization: `Bearer ${safeKey}`,
            apikey: safeKey
        };

        for (let i = 0; i <= retryCount; i++) {
            if (signal?.aborted) throw new Error('AbortError');

            try {
                // 1. Pede a URL assinada publicSupabase com credenciais explícitas de anon
                let signData: any = null;
                let signError: any = null;

                try {
                    const res = await publicSupabase.functions.invoke('r2-operations', {
                        body: { action: 'upload', path: fullPath, bucketType: 'dropzone', contentType },
                        headers: authHeaders
                    });
                    signData = res.data;
                    signError = res.error;
                } catch (invokeErr: any) {
                    signError = invokeErr;
                }

                // 2. Faz o upload direto via PUT HTTP pro Cloudflare R2
                if (!signError && signData?.signedUrl) {
                    try {
                        const uploadPromise = fetch(signData.signedUrl, {
                            method: 'PUT',
                            body: blobOrFile,
                            headers: {
                                'Content-Type': contentType
                            },
                            signal
                        });

                        const networkTimeout = new Promise<Response>((_, rej) => setTimeout(() => rej(new Error('NETWORK_TIMEOUT_45S')), 45000));
                        const response = await Promise.race([uploadPromise, networkTimeout]);

                        if (response.ok) {
                            console.log(`[Storage/Dropzone-R2] ✅ Upload concluído com sucesso no Cloudflare R2:`, signData.publicUrl);
                            return signData.publicUrl;
                        }
                        console.warn(`[Storage/Dropzone-R2] ⚠️ Direct PUT retornou status ${response.status}. Tentando direct-upload...`);
                    } catch (putErr: any) {
                        if (putErr.name === 'AbortError' || signal?.aborted) throw putErr;
                        console.warn(`[Storage/Dropzone-R2] ⚠️ Direct PUT falhou (${putErr.message}). Tentando direct-upload...`);
                    }
                }

                // 3. Fallback direct-upload via Edge Function
                const base64Data = await new Promise<string>((res, rej) => {
                    const reader = new FileReader();
                    reader.onloadend = () => res(reader.result as string);
                    reader.onerror = rej;
                    reader.readAsDataURL(blobOrFile);
                });

                const directRes = await publicSupabase.functions.invoke('r2-operations', {
                    body: { action: 'direct-upload', path: fullPath, bucketType: 'dropzone', contentType, base64: base64Data },
                    headers: authHeaders
                });

                if (directRes.data?.publicUrl) {
                    console.log(`[Storage/Dropzone-R2] ✅ Fallback direct-upload concluído:`, directRes.data.publicUrl);
                    return directRes.data.publicUrl;
                }

                throw new Error(directRes.error?.message || signError?.message || 'Falha no upload para o Cloudflare R2');

            } catch (err: any) {
                if (err.name === 'AbortError' || signal?.aborted) throw err;
                console.warn(`[Storage/Dropzone-R2] ⚠️ Tentativa ${i + 1} falhou:`, err.message);

                if (i === retryCount) throw err;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        throw new Error("STORAGE_DROPZONE_R2_UNREACHABLE");
    },

    /**
     * 🎯 AGGRESSIVE INTELLIGENT COMPRESSOR (V5 - MEMORY SAFE)
     */
    processAndCompress: async (file: File, signal?: AbortSignal): Promise<Blob> => {
        const TARGET_SIZE = 200 * 1024; // Limit strictly set to 200 KB
        const fileName = (file.name || '').toLowerCase();
        const fileType = (file.type || '').toLowerCase();

        let workingFile: Blob | File = file;

        const isHeic = fileType.includes('heic') || fileType.includes('heif') ||
            fileName.endsWith('.heic') || fileName.endsWith('.heif') || fileName.endsWith('.hif');

        if (isHeic) {
            try {
                let heic2any = (window as any).heic2any;
                if (!heic2any) {
                    console.warn("heic2any library not found for HEIC conversion");
                }

                if (heic2any) {
                    const converted = await heic2any({
                        blob: file,
                        toType: 'image/jpeg',
                        quality: 0.6
                    });
                    workingFile = Array.isArray(converted) ? converted[0] : converted;
                }
            } catch (e) {
                console.warn("[Compress] ⚠️ HEIC Decode Failed:", e);
                throw new Error('HEIC_DECODE_ERROR');
            }
        }

        const url = URL.createObjectURL(workingFile);
        try {
            const img = new Image();
            const loadPromise = new Promise((res, rej) => {
                img.onload = () => res(true);
                img.onerror = () => rej(new Error(`IMG_LOAD_FAIL: ${file.name}`));
                img.src = url;
            });
            const loadTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('IMG_LOAD_TIMEOUT')), 15000));
            await Promise.race([loadPromise, loadTimeout]);

            const strategies = [
                { w: 1200, q: 0.75 },
                { w: 1024, q: 0.65 },
                { w: 800, q: 0.55 },
                { w: 640, q: 0.45 },
                { w: 500, q: 0.35 }
            ];

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
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                const blob = await new Promise<Blob>((res, rej) => {
                    canvas.toBlob((b) => b ? res(b) : rej(new Error('BLOB_NULL')), 'image/webp', s.q);
                });

                canvas.width = 0; canvas.height = 0;

                if (blob.size <= TARGET_SIZE) return blob;
                if (s === strategies[strategies.length - 1]) return blob;
            }

            throw new Error('COMPRESSION_FAILED');
        } finally {
            URL.revokeObjectURL(url);
        }
    },

    /**
     * 🏷️ Otimizador Especial de Logo (WebP com preservação total de canal Alpha / Transparência)
     */
    compressLogo: async (fileOrBlob: File | Blob, signal?: AbortSignal): Promise<Blob> => {
        const fileName = (fileOrBlob instanceof File ? fileOrBlob.name : '').toLowerCase();
        const fileType = (fileOrBlob.type || '').toLowerCase();

        let workingFile: Blob | File = fileOrBlob;

        const isHeic = fileType.includes('heic') || fileType.includes('heif') ||
            fileName.endsWith('.heic') || fileName.endsWith('.heif') || fileName.endsWith('.hif');

        if (isHeic) {
            try {
                let heic2any = (window as any).heic2any;
                if (heic2any) {
                    const converted = await heic2any({
                        blob: fileOrBlob,
                        toType: 'image/png',
                        quality: 0.95
                    });
                    workingFile = Array.isArray(converted) ? converted[0] : converted;
                }
            } catch (e) {
                console.warn("[CompressLogo] ⚠️ HEIC Decode Failed:", e);
            }
        }

        const url = URL.createObjectURL(workingFile);
        try {
            const img = new Image();
            const loadPromise = new Promise((res, rej) => {
                img.onload = () => res(true);
                img.onerror = () => rej(new Error(`Falha ao carregar imagem da logo: ${fileName || 'arquivo'}`));
                img.src = url;
            });
            const loadTimeout = new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo limite excedido ao processar logo')), 15000));
            await Promise.race([loadPromise, loadTimeout]);

            if (signal?.aborted) throw new Error('AbortError');

            const MAX_DIM = 800; // Logos para web, documentos e relatórios
            let width = img.width;
            let height = img.height;

            if (width > MAX_DIM || height > MAX_DIM) {
                const ratio = Math.min(MAX_DIM / width, MAX_DIM / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;

            // PRESERVA O CANAL ALPHA (transparência de logos PNG/WebP)
            const ctx = canvas.getContext('2d', { alpha: true });
            if (!ctx) throw new Error('Falha ao inicializar renderizador de imagem');

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            // Garante transparência total
            ctx.clearRect(0, 0, width, height);
            ctx.drawImage(img, 0, 0, width, height);

            const blob = await new Promise<Blob>((res, rej) => {
                // Converte para image/webp com alta fidelidade preservando transparência
                canvas.toBlob((b) => b ? res(b) : rej(new Error('Falha ao gerar WebP')), 'image/webp', 0.90);
            });

            canvas.width = 0;
            canvas.height = 0;
            return blob;
        } finally {
            URL.revokeObjectURL(url);
        }
    },

    /**
     * 🛡️ Optimized Blob Upload
     */
    uploadBlob: async (blob: Blob, path: string, signal?: AbortSignal, options?: { contentType?: string, extension?: string, tenantId?: string }): Promise<string> => {
        if (!isCloudEnabled) return URL.createObjectURL(blob);
        return StorageService._uploadCore(blob, path, 2, signal, options);
    },

    /**
     * 🛡️ Nexus Storage Interface (Base64 wrapper)
     */
    uploadFile: async (base64: string, path: string): Promise<string> => {
        if (!isCloudEnabled || !base64.startsWith('data:image')) return base64;
        try {
            const compressedBase64 = await StorageService.compressImage(base64);
            const base64Data = compressedBase64.split(',')[1];
            const binaryData = atob(base64Data);
            const uint8Array = new Uint8Array(binaryData.length);
            for (let i = 0; i < binaryData.length; i++) {
                uint8Array[i] = binaryData.charCodeAt(i);
            }
            const blob = new Blob([uint8Array], { type: 'image/webp' });
            return StorageService._uploadCore(blob, path);
        } catch (err) {
            console.error("UploadFile Error:", err);
            throw err;
        }
    },

    /**
     * 🛡️ Cloudflare R2 Public Dropzone Interface (Upload estrito no R2)
     */
    uploadDropzoneFile: async (base64: string, path: string): Promise<string> => {
        if (!isCloudEnabled) return base64;
        if (!base64.startsWith('data:image')) {
            // Já é uma URL (ex: do R2)
            return base64;
        }

        const compressedBase64 = await StorageService.compressImage(base64);
        const base64Data = compressedBase64.split(',')[1];
        const binaryData = atob(base64Data);
        const uint8Array = new Uint8Array(binaryData.length);
        for (let i = 0; i < binaryData.length; i++) {
            uint8Array[i] = binaryData.charCodeAt(i);
        }
        const blob = new Blob([uint8Array], { type: 'image/webp' });

        // Envio estrito e exclusivo para o Cloudflare R2
        return await StorageService._uploadDropzoneCore(blob, path);
    },

    /**
     * 👤 Upload Oficial de Avatares de Usuários e Técnicos
     * Salva estritamente em: ${tenantId}/avatars/users/${userId}/avatar_${timestamp}.webp
     */
    uploadUserAvatar: async (fileOrBase64: File | Blob | string, userId: string, signal?: AbortSignal): Promise<string> => {
        const cleanUserId = userId || 'user';
        const folderPath = `avatars/users/${cleanUserId}`;

        if (typeof fileOrBase64 === 'string') {
            return await StorageService.uploadFile(fileOrBase64, folderPath);
        }

        if (!isCloudEnabled) return URL.createObjectURL(fileOrBase64);

        if (fileOrBase64 instanceof File) {
            const isImage = fileOrBase64.type.startsWith('image/');
            if (isImage) {
                const compressedBlob = await StorageService.processAndCompress(fileOrBase64, signal);
                const webpFile = new File([compressedBlob], `avatar_${Date.now()}.webp`, { type: 'image/webp' });
                return await StorageService._uploadCore(webpFile, folderPath, 2, signal, { contentType: 'image/webp', extension: 'webp' });
            }
            return await StorageService._uploadCore(fileOrBase64, folderPath, 2, signal);
        }

        return await StorageService.uploadBlob(fileOrBase64, folderPath, signal);
    },

    /**
     * 🏢 Upload Oficial de Logo da Empresa
     * Converte estritamente para WebP preservando transparência e envia para o Cloudflare R2
     * Salva em: ${tenantId}/Configuracoes_Empresa/Logos/logo_${timestamp}.webp
     */
    uploadTenantLogo: async (
        file: File | Blob,
        tenantId: string,
        signal?: AbortSignal,
        tenantMetadata?: TenantStorageMeta
    ): Promise<string> => {
        const cleanTenantId = tenantId && tenantId !== 'undefined' && tenantId !== 'null' ? tenantId : 'global';
        if (tenantMetadata && cleanTenantId !== 'global') {
            StorageService.registerTenantMetadata(cleanTenantId, tenantMetadata);
        }
        const folderPath = `tenants/${cleanTenantId}/logo`;
        if (!isCloudEnabled) return URL.createObjectURL(file);
        try {
            const compressedBlob = await StorageService.compressLogo(file, signal);
            const webpFile = new File([compressedBlob], `logo_${Date.now()}.webp`, { type: 'image/webp' });
            return await StorageService._uploadCore(webpFile, folderPath, 2, signal, {
                contentType: 'image/webp',
                extension: 'webp',
                tenantId: cleanTenantId
            });
        } catch (err: any) {
            console.error(`[LogoUpload] ❌ Falha:`, err.message);
            throw err;
        }
    },

    /**
     * Upload de evidência de OS (Alias para compatibilidade)
     */
    uploadServiceOrderEvidence: async (file: File, orderId: string, signal?: AbortSignal): Promise<string> => {
        if (!isCloudEnabled) return URL.createObjectURL(file);
        try {
            const compressedBlob = await StorageService.processAndCompress(file, signal);
            const webpFile = new File([compressedBlob], `photo_${Date.now()}.webp`, { type: 'image/webp' });
            return await StorageService.uploadBlob(webpFile, `orders/${orderId}/evidence`, signal);
        } catch (err: any) {
            console.error(`[PhotoUpload] ❌ Falha:`, err.message);
            throw err;
        }
    },

    /**
     * Upload de Comprovante Financeiro (Imagens viram WebP, Docs são mantidos)
     */
    uploadFinancialReceipt: async (file: File, pathFolder: string, signal?: AbortSignal): Promise<string> => {
        if (!isCloudEnabled) return URL.createObjectURL(file);

        try {
            const isImage = file.type.startsWith('image/');
            if (isImage) {
                const compressedBlob = await StorageService.processAndCompress(file, signal);
                const webpFile = new File([compressedBlob], `receipt_${Date.now()}.webp`, { type: 'image/webp' });
                return await StorageService._uploadCore(webpFile, pathFolder, 2, signal, { contentType: 'image/webp', extension: 'webp' });
            } else {
                if (file.size > 15 * 1024 * 1024) throw new Error("O arquivo excede o limite de 15MB");
                const extMatch = file.name.match(/\.([^.]+)$/);
                const ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';
                return await StorageService._uploadCore(file, pathFolder, 2, signal, { contentType: file.type, extension: ext });
            }
        } catch (err: any) {
            console.error(`[ReceiptUpload] ❌ Falha:`, err.message);
            throw err;
        }
    },

    /**
     * Upload de anexo de Observação Interna (Imagens viram WebP, Docs são mantidos)
     */
    uploadInternalNoteAttachment: async (file: File, orderId: string, signal?: AbortSignal): Promise<{ url: string, name: string, type: string, size: number }> => {
        if (!isCloudEnabled) {
            return { url: URL.createObjectURL(file), name: file.name, type: file.type.includes('image') ? 'image' : 'document', size: file.size };
        }

        try {
            const isImage = file.type.startsWith('image/');
            if (isImage) {
                const compressedBlob = await StorageService.processAndCompress(file, signal);
                const webpFile = new File([compressedBlob], `photo_${Date.now()}.webp`, { type: 'image/webp' });
                const url = await StorageService._uploadCore(webpFile, `orders/${orderId}/internal_notes`, 2, signal, { contentType: 'image/webp', extension: 'webp' });
                return { url, name: file.name, type: 'image', size: webpFile.size };
            } else {
                if (file.size > 15 * 1024 * 1024) throw new Error("O arquivo excede o limite de 15MB");
                const extMatch = file.name.match(/\.([^.]+)$/);
                const ext = extMatch ? extMatch[1].toLowerCase() : 'pdf';
                const url = await StorageService._uploadCore(file, `orders/${orderId}/internal_notes`, 2, signal, { contentType: file.type, extension: ext });
                return { url, name: file.name, type: 'document', size: file.size };
            }
        } catch (err: any) {
            console.error(`[AttachmentUpload] ❌ Falha:`, err.message);
            throw err;
        }
    },

    /**
     * Upload de foto genérica (Compatibilidade com antigo StorageService)
     */
    uploadPhoto: async (orderId: string, fieldId: string, file: File, uploadedBy?: string): Promise<UploadedFile> => {
        const url = await StorageService.uploadServiceOrderEvidence(file, orderId);
        return {
            id: `photo-${Date.now()}`,
            url,
            fieldId,
            uploadedAt: new Date().toISOString(),
            uploadedBy
        };
    },

    /**
     * Upload de assinatura (Compatibilidade)
     */
    uploadSignature: async (orderId: string, fieldId: string, signatureData: string | Blob, signerName?: string): Promise<UploadedFile> => {
        let url: string;
        if (typeof signatureData === 'string') {
            url = await StorageService.uploadFile(signatureData, `orders/${orderId}/signatures`);
        } else {
            url = await StorageService.uploadBlob(signatureData, `orders/${orderId}/signatures`);
        }

        return {
            id: `signature-${Date.now()}`,
            url,
            fieldId,
            uploadedAt: new Date().toISOString(),
            signerName
        };
    },

    /**
     * Deleta um arquivo do Storage baseado na sua URL pública
     */
    deleteFile: async (url: string): Promise<void> => {
        if (!url || !isCloudEnabled) return;
        try {
            let path = url;
            let bucketType = 'private';

            // Tratamento retrocompatível (caso aponte pro Supabase antigo)
            if (url.includes('/nexus-files/')) {
                path = url.split('/nexus-files/')[1].split('?')[0];
                bucketType = 'private';
            } else if (url.includes('/nexus-public-dropzone/')) {
                path = url.split('/nexus-public-dropzone/')[1].split('?')[0];
                bucketType = 'dropzone';
            }
            // Formato R2 .r2.dev
            else if (url.includes('.r2.dev/')) {
                path = url.split('.r2.dev/')[1].split('?')[0];
                bucketType = url.includes('dropzone') ? 'dropzone' : 'private';
            }
            // URL absoluta genérica (custom domain)
            else if (url.startsWith('http://') || url.startsWith('https://')) {
                try {
                    const u = new URL(url);
                    path = u.pathname.replace(/^\/+/, '');
                    bucketType = url.includes('dropzone') ? 'dropzone' : 'private';
                } catch (_) {}
            }

            // Exclui via Edge Function no R2
            const session = (await supabase.auth.getSession())?.data?.session;
            const token = session?.access_token || safeKey;
            const { error } = await supabase.functions.invoke('r2-operations', {
                body: { action: 'delete', path: decodeURIComponent(path), bucketType },
                headers: {
                    Authorization: `Bearer ${token}`,
                    apikey: safeKey
                }
            });

            if (error) {
                console.error(`[Storage/R2] ⚠️ Falha na Edge Function R2 (fallback pro antigo):`, error);
                if (bucketType === 'dropzone') {
                    await publicSupabase.storage.from('nexus-public-dropzone').remove([decodeURIComponent(path)]);
                } else {
                    await supabase.storage.from('nexus-files').remove([decodeURIComponent(path)]);
                }
            } else {
                console.log(`[Storage/R2] 🗑️ Arquivo deletado: ${path}`);
            }

        } catch (err) {
            console.error('[StorageService] ❌ Falha ao deletar arquivo:', err);
        }
    }
};
