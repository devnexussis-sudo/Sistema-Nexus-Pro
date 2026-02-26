
/**
 * 🛡️ Nexus Secure Logger
 * 
 * Agora atua como um facilitador sobre o console nativo,
 * delegando o gerenciamento do hijack ao TelemetrySystem.
 */

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
            if (data.length > 24 && data.includes('-')) return `***${data.slice(-4)}`;
            if (data.includes('@')) {
                const [user, domain] = data.split('@');
                return `${user.slice(0, 2)}***@${domain}`;
            }
            return data;
        }

        if (typeof data === 'object') {
            const sanitized: any = Array.isArray(data) ? [] : {};
            for (const key in data) {
                const sensitiveFields = ['password', 'token', 'apiKey', 'secret', 'api_key'];
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

    debug(message: string, ...args: any[]) {
        if (!this.isDevelopment) return;
        console.debug(`🐛 [DEBUG] ${message}`, ...args.map(a => this.sanitize(a)));
    }

    info(message: string, ...args: any[]) {
        console.log(`ℹ️ [INFO] ${message}`, ...args.map(a => this.sanitize(a)));
    }

    warn(message: string, ...args: any[]) {
        console.warn(`⚠️ [WARN] ${message}`, ...args.map(a => this.sanitize(a)));
    }

    error(message: string, ...args: any[]) {
        console.error(`❌ [ERROR] ${message}`, ...args.map(a => {
            if (a instanceof Error) return a;
            return this.sanitize(a);
        }));
    }

    track(event: string, metadata?: Record<string, any>) {
        if (this.isProduction) {
            console.log('[TRACK]', { event, timestamp: new Date().toISOString(), ...metadata });
        }
    }
}

export const logger = new Logger();
