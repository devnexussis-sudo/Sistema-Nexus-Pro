import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

// Carrega variáveis de ambiente em execução local / VPS / Docker (no Vercel já vêm injetadas)
dotenv.config();

// ============================================================================
// 🛡️ CAMADA 1: RATE LIMITER EM MEMÓRIA (ANTI-DoS / ANTI-EXAUSTÃO DE CPU)
// ============================================================================
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const RATE_LIMIT_MAX_REQUESTS = 15; // Máx 15 PDFs por minuto por IP
const ipRequestMap = new Map();

function checkRateLimit(ip) {
    const now = Date.now();
    const record = ipRequestMap.get(ip);

    if (!record || now - record.windowStart > RATE_LIMIT_WINDOW_MS) {
        ipRequestMap.set(ip, { windowStart: now, count: 1 });
        return true;
    }

    if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
        return false;
    }

    record.count += 1;
    return true;
}

// ============================================================================
// 🛡️ CAMADA 2: VALIDAÇÃO E SANITIZAÇÃO ESTRITA DE ENTRADA
// ============================================================================
const SAFE_ID_REGEX = /^[a-zA-Z0-9_-]{4,128}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAFE_HOST_REGEX = /^[a-zA-Z0-9.-]+(:\d{1,5})?$/;

function sanitizeFilename(raw, prefix = 'OS') {
    const clean = String(raw || prefix)
        .replace(/^#/, '')
        .trim()
        .replace(/[^a-zA-Z0-9_-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 50);

    if (!clean) return `${prefix}-DOCUMENTO`;
    return clean.toUpperCase().startsWith(prefix.toUpperCase()) ? clean : `${prefix}-${clean}`;
}

// ============================================================================
// 🌐 RESOLUÇÃO PORTÁVEL DO CHROMIUM (VERCEL SERVERLESS / DOCKER / VPS / LOCAL)
// ============================================================================
async function launchIsolatedBrowser() {
    const isServerless = Boolean(
        process.env.VERCEL ||
        process.env.AWS_LAMBDA_FUNCTION_NAME ||
        process.env.AWS_EXECUTION_ENV
    );

    const puppeteerCore = await import('puppeteer-core');

    // 1. Ambiente Serverless (Vercel / AWS Lambda) -> @sparticuz/chromium
    if (isServerless) {
        const chromiumModule = await import('@sparticuz/chromium');
        const chromium = chromiumModule.default || chromiumModule;

        return puppeteerCore.default.launch({
            args: [
                ...chromium.args,
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--font-render-hinting=none',
            ],
            defaultViewport: { width: 1024, height: 1440, deviceScaleFactor: 2 },
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
        });
    }

    // 2. Ambiente Local / VPS / Container -> Tenta binário do Puppeteer ou Chrome nativo
    let executablePath = process.env.CHROME_EXECUTABLE_PATH || '';

    if (!executablePath) {
        try {
            const fullPuppeteer = await import('puppeteer');
            const p = fullPuppeteer.default || fullPuppeteer;
            if (typeof p.executablePath === 'function') {
                const candidate = p.executablePath();
                if (candidate && fs.existsSync(candidate)) {
                    executablePath = candidate;
                }
            }
        } catch {
            // Segue para candidatos nativos do sistema operacional
        }
    }

    if (!executablePath) {
        const systemCandidates = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium',
        ];
        for (const candidate of systemCandidates) {
            if (fs.existsSync(candidate)) {
                executablePath = candidate;
                break;
            }
        }
    }

    if (!executablePath) {
        const chromiumModule = await import('@sparticuz/chromium');
        const chromium = chromiumModule.default || chromiumModule;
        executablePath = await chromium.executablePath();
    }

    return puppeteerCore.default.launch({
        executablePath,
        headless: true,
        defaultViewport: { width: 1024, height: 1440, deviceScaleFactor: 2 },
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--font-render-hinting=none',
        ],
    });
}

// ============================================================================
// 🔒 HANDLER PRINCIPAL DA API DE EXPORTAÇÃO DE PDF (O.S. E ORÇAMENTOS)
// ============================================================================
export default async function handler(req, res) {
    // Cabeçalhos de Segurança Estritos
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'GET' && req.method !== 'POST') {
        return res.status(405).json({ error: 'Método não permitido. Use GET ou POST.' });
    }

    // 1. Rate Limit por IP
    const clientIp =
        (req.headers['x-forwarded-for'] || '').toString().split(',')[0].trim() ||
        req.socket?.remoteAddress ||
        'unknown';

    if (!checkRateLimit(clientIp)) {
        return res.status(429).json({
            error: 'Muitas solicitações de geração de PDF. Aguarde um instante e tente novamente.',
        });
    }

    // 2. Extração e Validação de Parâmetros
    const query = req.query || {};
    const body = typeof req.body === 'object' && req.body !== null ? req.body : {};

    const rawType = (body.type || query.type || (body.quoteId || query.quoteId ? 'quote' : 'order'))
        .toString()
        .trim()
        .toLowerCase();
    const isQuote = rawType === 'quote';

    const rawOrderId = (body.quoteId || query.quoteId || body.orderId || query.orderId || '').toString().trim();
    const rawToken = (body.token || query.token || '').toString().trim();

    if (!rawOrderId && !rawToken) {
        return res.status(400).json({
            error: isQuote ? 'Identificador do Orçamento ausente.' : 'Identificador da Ordem de Serviço ausente.',
        });
    }

    if (rawOrderId && !SAFE_ID_REGEX.test(rawOrderId)) {
        return res.status(400).json({ error: 'Formato de identificador inválido.' });
    }

    if (rawToken && !SAFE_ID_REGEX.test(rawToken)) {
        return res.status(400).json({ error: 'Formato de token inválido.' });
    }

    // 3. Configuração Supabase para Verificação Multi-Tenant e Autenticação
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('❌ [order-pdf] Variáveis Supabase ausentes no servidor.');
        return res.status(500).json({ error: 'Configuração de servidor incompleta.' });
    }

    const authHeader = (req.headers['authorization'] || req.headers['Authorization'] || '').toString();
    const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

    let verifiedRenderToken = '';
    let verifiedDisplayId = '';

    try {
        if (bearerToken) {
            // 🔐 MODO AUTENTICADO (PAINEL ADMIN): Valida JWT + Isolamento Multi-Tenant Estrito
            const userClient = createClient(supabaseUrl, supabaseAnonKey, {
                auth: { persistSession: false, autoRefreshToken: false },
                global: { headers: { Authorization: `Bearer ${bearerToken}` } },
            });

            const { data: authData, error: authError } = await userClient.auth.getUser(bearerToken);
            if (authError || !authData?.user) {
                return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
            }

            const user = authData.user;

            // Busca o tenant_id real do usuário autenticado na tabela users (ou metadata)
            const adminOrUserClient = supabaseServiceKey
                ? createClient(supabaseUrl, supabaseServiceKey, {
                      auth: { persistSession: false, autoRefreshToken: false },
                  })
                : userClient;

            const { data: profileData } = await adminOrUserClient
                .from('users')
                .select('tenant_id, role')
                .eq('id', user.id)
                .maybeSingle();

            const userTenantId =
                profileData?.tenant_id ||
                user.user_metadata?.tenantId ||
                user.user_metadata?.tenant_id ||
                user.app_metadata?.tenant_id;

            const lookupKey = rawOrderId || rawToken;
            const tableName = isQuote ? 'quotes' : 'orders';

            // Busca o documento (OS ou Orçamento) garantindo correspondência
            let docRecord = null;
            const { data: byId } = await adminOrUserClient
                .from(tableName)
                .select('id, display_id, tenant_id, public_token')
                .eq('id', lookupKey)
                .maybeSingle();

            if (byId) {
                docRecord = byId;
            } else if (rawToken) {
                const { data: byToken } = await adminOrUserClient
                    .from(tableName)
                    .select('id, display_id, tenant_id, public_token')
                    .eq('public_token', rawToken)
                    .maybeSingle();
                docRecord = byToken;
            }

            if (!docRecord && lookupKey) {
                const { data: byDisplayId } = await adminOrUserClient
                    .from(tableName)
                    .select('id, display_id, tenant_id, public_token')
                    .eq('display_id', lookupKey)
                    .maybeSingle();
                docRecord = byDisplayId;
            }

            if (!docRecord) {
                return res.status(404).json({
                    error: isQuote ? 'Orçamento não encontrado.' : 'Ordem de Serviço não encontrada.',
                });
            }

            // 🛡️ TRAVA MULTI-TENANT: Impede que uma empresa gere PDF de outra empresa
            const isSuperAdmin = profileData?.role === 'super_admin' || user.user_metadata?.role === 'super_admin';
            if (!isSuperAdmin && userTenantId && docRecord.tenant_id !== userTenantId) {
                console.warn(
                    `🚨 [SECURITY] Violação Multi-Tenant bloqueada! User ${user.id} (Tenant ${userTenantId}) tentou exportar ${isQuote ? 'Orçamento' : 'OS'} ${docRecord.id} (Tenant ${docRecord.tenant_id}).`
                );
                return res.status(403).json({
                    error: `Acesso negado: Este ${isQuote ? 'Orçamento' : 'documento'} pertence a outra organização.`,
                });
            }

            verifiedRenderToken = docRecord.public_token || docRecord.id;
            verifiedDisplayId = docRecord.display_id || docRecord.id.slice(0, 8);
        } else {
            // 🌐 MODO PÚBLICO (LINK DO CLIENTE): Exige token criptográfico UUID válido
            const candidateToken = rawToken || rawOrderId;
            if (!UUID_REGEX.test(candidateToken)) {
                return res.status(401).json({
                    error: 'Token público criptográfico inválido ou não autorizado.',
                });
            }

            const publicClient = createClient(supabaseUrl, supabaseAnonKey, {
                auth: { persistSession: false, autoRefreshToken: false },
            });

            if (isQuote) {
                const { data: rpcQuote, error: rpcQuoteError } = await publicClient.rpc('get_public_document', {
                    doc_token: candidateToken,
                    doc_type: 'quote',
                });
                const quoteData = Array.isArray(rpcQuote) ? rpcQuote[0] : rpcQuote;
                if (rpcQuoteError || !quoteData || !quoteData.id) {
                    return res.status(404).json({ error: 'Orçamento público não encontrado.' });
                }
                verifiedRenderToken = quoteData.public_token || candidateToken;
                verifiedDisplayId = quoteData.display_id || quoteData.id.slice(0, 8);
            } else {
                const { data: rpcData, error: rpcError } = await publicClient.rpc('get_public_order_full', {
                    search_term: candidateToken,
                });

                const orderData = Array.isArray(rpcData) ? rpcData[0] : rpcData;
                if (rpcError || !orderData || !orderData.id) {
                    return res.status(404).json({ error: 'Ordem de Serviço pública não encontrada.' });
                }

                verifiedRenderToken = orderData.public_token || candidateToken;
                verifiedDisplayId = orderData.display_id || orderData.id.slice(0, 8);
            }
        }
    } catch (secErr) {
        console.error('❌ [order-pdf] Erro na validação de segurança:', secErr);
        return res.status(500).json({ error: 'Erro interno ao validar permissões do documento.' });
    }

    // 4. Construção Anti-SSRF da URL Interna (Nunca aceita URL externa do cliente)
    const rawHost = (req.headers['x-forwarded-host'] || req.headers['host'] || 'localhost:3001')
        .toString()
        .split(',')[0]
        .trim();

    if (!SAFE_HOST_REGEX.test(rawHost)) {
        return res.status(400).json({ error: 'Host de origem inválido.' });
    }

    const isLocalhost = rawHost.startsWith('localhost') || rawHost.startsWith('127.0.0.1');
    const protocol = isLocalhost
        ? 'http'
        : (req.headers['x-forwarded-proto'] || 'https').toString().split(',')[0].trim();

    const baseOrigin = process.env.PUBLIC_APP_URL
        ? process.env.PUBLIC_APP_URL.replace(/\/$/, '')
        : `${protocol}://${rawHost}`;

    const routePath = isQuote ? '/#/view-quote/' : '/#/order/view/';
    const docPrefix = isQuote ? 'ORC' : 'OS';
    const targetUrl = `${baseOrigin}${routePath}${encodeURIComponent(verifiedRenderToken)}?pdf=true&t=${Date.now()}`;
    const filename = `${sanitizeFilename(verifiedDisplayId, docPrefix)}.pdf`;

    // 5. Renderização Isolada em Headless Chromium
    let browser = null;
    let context = null;

    try {
        browser = await launchIsolatedBrowser();
        context = await browser.createBrowserContext();
        const page = await context.newPage();

        // Bloqueia acesso a metadados de nuvem interna (AWS/GCP metadata) por segurança extra Anti-SSRF
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            const url = request.url();
            if (url.includes('169.254.169.254') || url.includes('metadata.google.internal') || url.startsWith('file://')) {
                request.abort();
                return;
            }
            request.continue();
        });

        // Ativa o modo de mídia de impressão (@media print -> exibe .print-only-layout / <PrintLayout />)
        await page.emulateMediaType('print');

        await page.goto(targetUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000,
        });

        // Aguarda o sinal determinístico de que dados assíncronos (empresa, visitas, checklists, itens, fotos) carregaram
        try {
            await page.waitForFunction(
                () => window.__NEXUS_PDF_READY === true || document.body?.getAttribute('data-pdf-ready') === 'true',
                { timeout: 12000 }
            );
        } catch {
            // Fallback seguro caso alguma imagem externa demore mais que 12s
        }

        // Garante que as fontes (Poppins) e decodificação final de imagens estejam prontas
        await page.evaluate(async () => {
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }
            const printImgs = Array.from(document.querySelectorAll('.print-only-layout img, .print-quote-layout img, img'));
            await Promise.all(
                printImgs.map((img) => {
                    if (img.complete) return Promise.resolve();
                    return new Promise((resolve) => {
                        img.addEventListener('load', resolve, { once: true });
                        img.addEventListener('error', resolve, { once: true });
                        setTimeout(resolve, 2500);
                    });
                })
            );
        });

        // Gera o binário PDF vetorial mantendo 100% do @page e CSS do PrintLayout
        const pdfUint8 = await page.pdf({
            format: 'A4',
            printBackground: true,
            preferCSSPageSize: true,
        });

        const pdfBuffer = Buffer.from(pdfUint8);

        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Length', pdfBuffer.length);
        return res.status(200).send(pdfBuffer);
    } catch (renderError) {
        console.error('❌ [order-pdf] Falha ao renderizar PDF no Chromium:', renderError);
        return res.status(500).json({
            error: `Não foi possível gerar o arquivo PDF ${isQuote ? 'do Orçamento' : 'da Ordem de Serviço'} no momento.`,
        });
    } finally {
        if (context) {
            try {
                await context.close();
            } catch {}
        }
        if (browser) {
            try {
                await browser.close();
            } catch {}
        }
    }
}
