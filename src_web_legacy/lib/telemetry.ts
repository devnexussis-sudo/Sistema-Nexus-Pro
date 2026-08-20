
// 📡 NEXUS TELEMETRY SYSTEM
// Captura logs do console para diagnósticos em produção.
// Este é o ÚNICO ponto de hijack do console do sistema.

interface LogEntry {
    type: 'log' | 'info' | 'warn' | 'error' | 'debug';
    args: any[];
    timestamp: string;
}

class TelemetrySystem {
    private logs: LogEntry[] = [];
    private maxLogs = 1000; // Aumentado para mais contexto
    private isProduction = import.meta.env.PROD;

    // Armazena as funções originais para uso interno
    public originalConsole = {
        log: console.log.bind(console),
        info: console.info.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        debug: console.debug.bind(console),
    };

    constructor() {
        this.hijackConsole();
        this.logInternal('🚀 Telemetry Engine v2.5 Online');
    }

    private hijackConsole() {
        const self = this;

        console.log = function (...args: any[]) {
            self.capture('log', args);
            // Em produção, silenciamos log comum a menos que tenha a tag [SYSTEM] ou [Supabase]
            const shouldShow = !self.isProduction ||
                (typeof args[0] === 'string' && (args[0].includes('[SYSTEM]') || args[0].includes('[Supabase')));
            if (shouldShow) self.originalConsole.log(...args);
        };

        console.info = function (...args: any[]) {
            self.capture('info', args);
            if (!self.isProduction) self.originalConsole.info(...args);
        };

        console.debug = function (...args: any[]) {
            self.capture('debug', args);
            if (!self.isProduction) self.originalConsole.debug(...args);
        };

        console.warn = function (...args: any[]) {
            self.capture('warn', args);
            // Avisos SEMPRE aparecem no console nativo para facilitar debug remoto
            self.originalConsole.warn(...args);
        };

        console.error = function (...args: any[]) {
            self.capture('error', args);
            // Erros SEMPRE aparecem no console nativo
            self.originalConsole.error(...args);
        };
    }

    private capture(type: LogEntry['type'], args: any[]) {
        try {
            // Evita processar logs do próprio sistema de telemetria para não gerar loop
            if (typeof args[0] === 'string' && args[0].includes('[Telemetry]')) return;

            this.logs.push({
                type,
                args: args.map(a => {
                    try {
                        if (a instanceof Error) return { name: a.name, message: a.message, stack: a.stack };
                        return typeof a === 'object' ? JSON.parse(JSON.stringify(a)) : a;
                    } catch {
                        return String(a);
                    }
                }),
                timestamp: new Date().toISOString()
            });

            if (this.logs.length > this.maxLogs) {
                this.logs.shift();
            }
        } catch (e) {
            // Fail silent
        }
    }

    private logInternal(msg: string) {
        this.originalConsole.log(`%c[Telemetry] ${msg}`, 'color: #3b82f6; font-weight: bold');
    }

    public getRecentLogs() {
        return this.logs;
    }

    public clearLogs() {
        this.logs = [];
        this.logInternal('Logs cleared.');
    }

    public downloadLogs() {
        const content = this.logs.map(l => {
            const time = new Date(l.timestamp).toLocaleTimeString();
            const argsStr = l.args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)).join(' ');
            return `[${time}] [${l.type.toUpperCase()}] ${argsStr}`;
        }).join('\n');

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexus_diag_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

export const telemetry = new TelemetrySystem();
(window as any).NexusTelemetry = telemetry;
