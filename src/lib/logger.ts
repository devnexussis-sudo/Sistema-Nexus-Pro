/**
 * 🛡️ Nexus Secure Logger
 * 
 * Logger inteligente que:
 * - Desabilita logs automaticamente em produção
 * - Mascara dados sensíveis (IDs, emails, tokens)
 * - Fornece níveis de log (debug, info, warn, error)
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

    constructor() {
        this.isDevelopment = import.meta.env.DEV;
        this.isProduction = import.meta.env.PROD;
    }

    /**
     * Mascara dados sensíveis em objetos
     */
    private sanitize(data: any): any {
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
            const sanitized: any = Array.isArray(data) ? [] : {};

            for (const key in data) {
                // Lista de campos sensíveis
                const sensitiveFields = [
                    'id', 'userId', 'user_id', 'tenantId', 'tenant_id',
                    'email', 'password', 'token', 'apiKey', 'api_key',
                    'secret', 'sessionId', 'session_id'
                ];

                if (sensitiveFields.includes(key)) {
                    sanitized[key] = '***REDACTED***';
                } else {
                    sanitized[key] = this.sanitize(data[key]);
                }
            }
            return sanitized;
        }

        return data;
    }

    /**
     * 🐛 DEBUG: Logs detalhados para debugging (NUNCA em produção)
     */
    debug(message: string, ...args: any[]) {
        if (!this.isDevelopment) return;

        const sanitizedArgs = args.map(arg => this.sanitize(arg));
        console.log(`🐛 [DEBUG] ${message}`, ...sanitizedArgs);
    }

    /**
     * ℹ️ INFO: Logs informativos gerais (NUNCA em produção)
     */
    info(message: string, ...args: any[]) {
        if (!this.isDevelopment) return;

        const sanitizedArgs = args.map(arg => this.sanitize(arg));
        console.log(`ℹ️ [INFO] ${message}`, ...sanitizedArgs);
    }

    /**
     * ⚠️ WARN: Avisos importantes (somente em dev)
     */
    warn(message: string, ...args: any[]) {
        if (!this.isDevelopment) return;

        const sanitizedArgs = args.map(arg => this.sanitize(arg));
        console.warn(`⚠️ [WARN] ${message}`, ...sanitizedArgs);
    }

    /**
     * ❌ ERROR: Erros críticos (sempre logados, mas sanitizados)
     */
    error(message: string, ...args: any[]) {
        // Errors são sempre logados, mas com dados sensíveis removidos
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

        console.error(`❌ [ERROR] ${message}`, ...sanitizedArgs);
    }

    /**
     * 🚀 PRODUCTION ONLY: Log mínimo e seguro para produção
     * Útil para telemetria sem expor dados
     */
    track(event: string, metadata?: Record<string, any>) {
        if (!this.isProduction) return;

        // Em produção, apenas rastreia eventos sem dados sensíveis
        const safeMetadata = {
            timestamp: new Date().toISOString(),
            event,
            // Não inclui dados do usuário, apenas métricas
            ...(metadata && {
                count: metadata.count,
                status: metadata.status,
                type: metadata.type
            })
        };

        // Aqui você poderia enviar para um serviço de analytics
        // Ex: Sentry, LogRocket, Google Analytics, etc.
        console.log('[TRACK]', safeMetadata);
    }

    /**
     * 🧹 Gerencia o silenciamento de logs em produção.
     * MANTÉM console.error e console.warn ativos por padrão para diagnóstico.
     */
    disableNativeLogsInProduction() {
        if (this.isProduction) {
            // Silencia apenas informações triviais
            console.log = (...args) => {
                // Se o primeiro argumento for uma tag de sistema do Nexus, permite o log
                if (typeof args[0] === 'string' && (args[0].includes('[SYSTEM]') || args[0].includes('[Supabase'))) {
                    this.originalConsole.log(...args);
                }
            };
            console.debug = () => { };
            console.info = () => { };

            // console.warn e console.error CONTINUAM ATIVOS em produção
            // para permitir diagnóstico de falhas silenciosas.
        }
    }
}

export const logger = new Logger();

// Auto-disable native console in production on load
if (import.meta.env.PROD) {
    logger.disableNativeLogsInProduction();
}
