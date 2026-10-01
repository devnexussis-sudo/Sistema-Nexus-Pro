
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
    }

    private hijackConsole() {
        const self = this;

        // BigTech Standard: Silence all non-error console outputs in the browser.
        // Logs are recorded in memory for diagnostic export (NexusTelemetry.downloadLogs()).
        console.log = function (...args: any[]) {
            self.capture('log', args);
        };

        console.info = function (...args: any[]) {
            self.capture('info', args);
        };

        console.debug = function (...args: any[]) {
            self.capture('debug', args);
        };

        console.warn = function (...args: any[]) {
            self.capture('warn', args);
        };

        console.error = function (...args: any[]) {
            self.capture('error', args);
            // Critical unhandled errors remain visible in native console
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
        this.capture('info', [`[Telemetry] ${msg}`]);
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
