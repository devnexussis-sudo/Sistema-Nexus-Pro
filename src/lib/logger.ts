/**
 * 🛡️ Nexus Secure Logger v3.1
 *
 * Logger inteligente com proteção contra silent failures.
 *
 * GOVERNANÇA:
 *  ✅ NÃO faz hijack do console — essa responsabilidade é exclusiva do telemetry.ts
 *  ✅ Usa referências ao console original salvas ANTES de qualquer hijack
 *  ✅ Mascara dados sensíveis (IDs, emails, tokens)
 *  ✅ Fornece níveis de log (debug, info, warn, error)
 *  ✅ Em produção: debug/info são silenciados, warn/error SEMPRE logam
 *
 * CAUSA RAIZ DO BUG ANTERIOR:
 *  O método disableNativeLogsInProduction() referenciava this.originalConsole
 *  que nunca era definido, causando um throw silencioso que impedia TODOS
 *  os logs em produção — inclusive erros críticos de conexão.
 *
 * SOLUÇÃO:
 *  Salvar referências ao console original no constructor (antes do hijack
 *  do telemetry.ts) e NUNCA substituir o console global aqui.
 *  O hijack é responsabilidade EXCLUSIVA do telemetry.ts.
 *
 * @example
 * logger.debug('User loaded', { userId: '123' }); // Only in dev
 * logger.info('Order created'); // Only in dev
 * logger.error('Critical error', error); // Always logged
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class Logger {
    private isDevelopment: boolean;
    private isProduction: boolean;

    /**
     * Referências ao console nativo, salvas ANTES de qualquer hijack.
     * Garante que os logs funcionem mesmo que outro sistema substitua o console.
     */
    private readonly _nativeLog: typeof console.log;
    private readonly _nativeInfo: typeof console.info;
    private readonly _nativeWarn: typeof console.warn;
    private readonly _nativeError: typeof console.error;
    private readonly _nativeDebug: typeof console.debug;

    constructor() {
        this.isDevelopment = import.meta.env.DEV;
        this.isProduction = import.meta.env.PROD;

        // Captura ANTES do hijack do telemetry.ts
        this._nativeLog = console.log.bind(console);
        this._nativeInfo = console.info.bind(console);
        this._nativeWarn = console.warn.bind(console);
        this._nativeError = console.error.bind(console);
        this._nativeDebug = console.debug.bind(console);
    }

    /**
     * Mascara dados sensíveis em objetos
     */
    private sanitize(data: unknown): unknown {
        if (!data) return data;

        if (typeof data === 'string') {
            // Mascara IDs longos (UUIDs)
            if (data.length > 20 && data.includes('-')) {
                return `***${data.slice(-4)}`;
            }
            // Mascara emails
            if (data.includes('@')) {
                const [user, domain] = data.split('@');
                return `${user.slice(0, 2)}***@${domain}`;
            }
            return data;
        }

        if (typeof data === 'object') {
            const sanitized: Record<string, unknown> = {};

            for (const key in data as Record<string, unknown>) {
                const sensitiveFields = [
                    'id', 'userId', 'user_id', 'tenantId', 'tenant_id',
                    'email', 'password', 'token', 'apiKey', 'api_key',
                    'secret', 'sessionId', 'session_id'
                ];

                if (sensitiveFields.includes(key)) {
                    sanitized[key] = '***REDACTED***';
                } else {
                    sanitized[key] = this.sanitize((data as Record<string, unknown>)[key]);
                }
            }
            return sanitized;
        }

        return data;
    }

    /**
     * 🐛 DEBUG: Logs detalhados para debugging (NUNCA em produção)
     */
    debug(message: string, ...args: unknown[]): void {
        if (!this.isDevelopment) return;
        const sanitizedArgs = args.map(arg => this.sanitize(arg));
        this._nativeDebug(`🐛 [DEBUG] ${message}`, ...sanitizedArgs);
    }

    /**
     * ℹ️ INFO: Logs informativos gerais (NUNCA em produção)
     */
    info(message: string, ...args: unknown[]): void {
        if (!this.isDevelopment) return;
        const sanitizedArgs = args.map(arg => this.sanitize(arg));
        this._nativeLog(`ℹ️ [INFO] ${message}`, ...sanitizedArgs);
    }

    /**
     * ⚠️ WARN: Avisos importantes (SEMPRE logados — inclusive em produção)
     * Necessários para diagnóstico remoto de silent failures.
     */
    warn(message: string, ...args: unknown[]): void {
        const sanitizedArgs = args.map(arg => this.sanitize(arg));
        this._nativeWarn(`⚠️ [WARN] ${message}`, ...sanitizedArgs);
    }

    /**
     * ❌ ERROR: Erros críticos (SEMPRE logados, dados sanitizados)
     */
    error(message: string, ...args: unknown[]): void {
        const sanitizedArgs = args.map(arg => {
            if (arg instanceof Error) {
                return {
                    name: arg.name,
                    message: arg.message,
                    // Stack trace só em dev
                    ...(this.isDevelopment && { stack: arg.stack })
                };
            }
            return this.sanitize(arg);
        });

        this._nativeError(`❌ [ERROR] ${message}`, ...sanitizedArgs);
    }

    /**
     * 🚀 PRODUCTION ONLY: Log mínimo e seguro para produção
     * Útil para telemetria sem expor dados
     */
    track(event: string, metadata?: Record<string, unknown>): void {
        if (!this.isProduction) return;

        const safeMetadata = {
            timestamp: new Date().toISOString(),
            event,
            ...(metadata && {
                count: metadata.count,
                status: metadata.status,
                type: metadata.type
            })
        };

        this._nativeLog('[TRACK]', safeMetadata);
    }
}

export const logger = new Logger();

// ⛔ REMOVIDO: disableNativeLogsInProduction()
// A responsabilidade de gerenciar o console global é EXCLUSIVA do telemetry.ts
// O logger apenas usa suas referências _native* salvas no constructor.
