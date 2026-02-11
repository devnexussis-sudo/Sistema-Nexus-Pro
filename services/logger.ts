
import { Alert, Share } from 'react-native';

class LoggerService {
    private logs: string[] = [];
    private maxLogs = 1000;
    // Store original console methods
    private originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    };
    private isCapturing = false;

    constructor() {
        // Clean start
    }

    // Logs a message to internal storage AND original console (if not capturing)
    log(message: string, type: 'info' | 'error' | 'warn' = 'info') {
        const timestamp = new Date().toISOString();
        const entry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        this.logs.unshift(entry);

        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }

        // Since we are overriding global console, we should NOT print to console inside log() 
        // IF the call came from the override itself (which already prints).
        // However, distinguishing the caller is tricky.
        // Easy way: The override prints via originalConsole, then calls this.log().
        // So if someone calls logger.log() directly, we should print via originalConsole to be safe.
        // BUT if capture is ON, calling console.log() calls override -> prints -> calls logger.log().
        // So logger.log() should NEVER print to console if it's designed to be called by the override.

        // BUT what if I call logger.log('foo') manually? It won't show in console.
        // That's acceptable for now as 'logger' is mostly for internal storage.
        // Or I can add a flag to log() to output to console.

        // For now: Just store. The override handles the printing.
    }

    enableGlobalCapture() {
        if (this.isCapturing) return;

        this.isCapturing = true;

        console.log = (...args) => {
            this.originalConsole.log(...args); // Print to terminal/device log
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            // Store in memory without printing again
            this.log(message, 'info');
        };

        console.warn = (...args) => {
            this.originalConsole.warn(...args);
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            this.log(message, 'warn');
        };

        console.error = (...args) => {
            this.originalConsole.error(...args);
            const message = args.map(arg =>
                typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
            ).join(' ');
            this.log(message, 'error');
        };

        this.log(' Global console capture ENABLED: All logs are now being recorded.', 'info');
    }

    getLogs() {
        return this.logs;
    }

    async shareLogs() {
        try {
            const logContent = this.logs.join('\n');
            if (!logContent.trim()) {
                Alert.alert('Logs Vazios', 'Não há logs para compartilhar.');
                return;
            }

            const result = await Share.share({
                message: logContent,
                title: 'Nexus Mobile System Logs',
            });

        } catch (error: any) {
            Alert.alert('Erro ao compartilhar', error.message);
        }
    }

    clearLogs() {
        this.logs = [];
    }
}

export const logger = new LoggerService();
