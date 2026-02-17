
// 📡 NEXUS TELEMETRY SYSTEM
// Captura logs do console para diagnósticos em produção

interface LogEntry {
    type: 'log' | 'info' | 'warn' | 'error';
    args: any[];
    timestamp: string;
}

class TelemetrySystem {
    private logs: LogEntry[] = [];
    private maxLogs = 500;
    private originalConsole = {
        log: console.log,
        info: console.info,
        warn: console.warn,
        error: console.error,
    };

    constructor() {
        this.hijackConsole();
        this.logSystem('🚀 Telemetry System Initialized');
    }

    private hijackConsole() {
        console.log = (...args) => {
            this.pushLog('log', args);
            this.originalConsole.log(...args);
        };
        console.info = (...args) => {
            this.pushLog('info', args);
            this.originalConsole.info(...args);
        };
        console.warn = (...args) => {
            this.pushLog('warn', args);
            this.originalConsole.warn(...args);
        };
        console.error = (...args) => {
            this.pushLog('error', args);
            this.originalConsole.error(...args);
        };
    }

    private pushLog(type: LogEntry['type'], args: any[]) {
        try {
            this.logs.push({
                type,
                args: args.map(a => {
                    try {
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
            // Avoid infinite loop if logging fails
        }
    }

    private logSystem(msg: string) {
        this.originalConsole.log(`%c[SYSTEM] ${msg}`, 'color: cyan; font-weight: bold');
    }

    public getRecentLogs() {
        return this.logs;
    }

    public downloadLogs() {
        const content = this.logs.map(l => `[${l.timestamp}] [${l.type.toUpperCase()}] ${l.args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `nexus_logs_${new Date().toISOString()}.txt`;
        a.click();
        this.logSystem('Logs downloaded successfully.');
    }
}

export const telemetry = new TelemetrySystem();

// Expose to window for easy access
(window as any).NexusTelemetry = telemetry;
