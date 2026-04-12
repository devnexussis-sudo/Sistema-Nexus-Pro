
import { Alert, Share } from 'react-native';

// ─── Observability Metrics ───────────────────────────────────────────────────
interface NetworkMetrics {
    totalRequests: number;
    failedRequests: number;
    timeouts: number;
    retries: number;
    reconnects: number;
    avgResponseTimeMs: number;
    lastResponseTimeMs: number;
    responseTimes: number[];  // Rolling window for avg calculation
}

class LoggerService {
    private logs: string[] = [];
    private maxLogs = 1000;
    private readonly MAX_RESPONSE_TIMES = 50; // Rolling window size

    // Store original console methods
    private originalConsole = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    };
    private isCapturing = false;

    // ── Observability: network metrics ──
    private metrics: NetworkMetrics = {
        totalRequests: 0,
        failedRequests: 0,
        timeouts: 0,
        retries: 0,
        reconnects: 0,
        avgResponseTimeMs: 0,
        lastResponseTimeMs: 0,
        responseTimes: [],
    };

    constructor() {
        // Clean start
    }

    // ─── Core Logging ────────────────────────────────────────────────────

    /**
     * Logs a message to internal storage.
     * Since console is overridden, this stores without re-printing.
     */
    log(message: string, type: 'info' | 'error' | 'warn' = 'info') {
        const timestamp = new Date().toISOString();
        const entry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        this.logs.unshift(entry);

        if (this.logs.length > this.maxLogs) {
            this.logs.pop();
        }
    }

    private formatArgs(args: any[]) {
        return args.map(arg => {
            if (arg instanceof Error) {
                return `${arg.name}: ${arg.message}\n${arg.stack}`;
            }
            if (typeof arg === 'object' && arg !== null) {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return `[Object]`; // Fallback to avoid circular structure crash
                }
            }
            return String(arg);
        }).join(' ');
    }

    enableGlobalCapture() {
        if (this.isCapturing) return;

        this.isCapturing = true;

        console.log = (...args) => {
            try { this.originalConsole.log(...args); }
            catch { this.originalConsole.log(this.formatArgs(args)); }
            const message = this.formatArgs(args);
            this.log(message, 'info');
        };

        console.warn = (...args) => {
            try { this.originalConsole.warn(...args); }
            catch { this.originalConsole.warn(this.formatArgs(args)); }
            const message = this.formatArgs(args);
            this.log(message, 'warn');
        };

        console.error = (...args) => {
            try { this.originalConsole.error(...args); }
            catch { this.originalConsole.error(this.formatArgs(args)); }
            const message = this.formatArgs(args);
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

    // ─── Observability: Network Metrics ──────────────────────────────────

    /**
     * Record a completed network request with timing.
     * Call this after each Supabase/API call.
     */
    trackRequest(label: string, durationMs: number, success: boolean) {
        this.metrics.totalRequests++;
        this.metrics.lastResponseTimeMs = durationMs;

        // Rolling window for average
        this.metrics.responseTimes.push(durationMs);
        if (this.metrics.responseTimes.length > this.MAX_RESPONSE_TIMES) {
            this.metrics.responseTimes.shift();
        }
        this.metrics.avgResponseTimeMs = Math.round(
            this.metrics.responseTimes.reduce((a, b) => a + b, 0) / this.metrics.responseTimes.length
        );

        if (!success) {
            this.metrics.failedRequests++;
        }

        // Log slow requests
        if (durationMs > 5000) {
            this.log(`[Perf] 🐌 Slow request: ${label} took ${durationMs}ms`, 'warn');
        }
    }

    /**
     * Record a timeout event.
     */
    trackTimeout(label: string) {
        this.metrics.timeouts++;
        this.log(`[Perf] ⏱️ Timeout: ${label} (total: ${this.metrics.timeouts})`, 'warn');
    }

    /**
     * Record a retry event.
     */
    trackRetry(label: string, attempt: number) {
        this.metrics.retries++;
        this.log(`[Perf] 🔄 Retry: ${label} attempt #${attempt} (total retries: ${this.metrics.retries})`, 'warn');
    }

    /**
     * Record a realtime reconnection event.
     */
    trackReconnect(channelName: string) {
        this.metrics.reconnects++;
        this.log(`[Perf] 📡 Reconnect: ${channelName} (total: ${this.metrics.reconnects})`, 'warn');
    }

    /**
     * Get current network metrics for display in settings/debug screen.
     */
    getMetrics(): Readonly<NetworkMetrics> {
        return { ...this.metrics, responseTimes: [...this.metrics.responseTimes] };
    }

    /**
     * Get a human-readable metrics summary for sharing.
     */
    getMetricsSummary(): string {
        const m = this.metrics;
        return [
            `───── Network Metrics ─────`,
            `Total Requests:    ${m.totalRequests}`,
            `Failed Requests:   ${m.failedRequests}`,
            `Timeouts:          ${m.timeouts}`,
            `Retries:           ${m.retries}`,
            `Reconnects:        ${m.reconnects}`,
            `Avg Response Time: ${m.avgResponseTimeMs}ms`,
            `Last Response:     ${m.lastResponseTimeMs}ms`,
            `Failure Rate:      ${m.totalRequests > 0 ? ((m.failedRequests / m.totalRequests) * 100).toFixed(1) : 0}%`,
            `──────────────────────────`,
        ].join('\n');
    }

    /**
     * Share logs WITH metrics summary appended at the top.
     */
    async shareLogsWithMetrics() {
        try {
            const metricsSummary = this.getMetricsSummary();
            const logContent = this.logs.join('\n');
            const fullContent = `${metricsSummary}\n\n${logContent}`;

            if (!fullContent.trim()) {
                Alert.alert('Logs Vazios', 'Não há logs para compartilhar.');
                return;
            }

            await Share.share({
                message: fullContent,
                title: 'Nexus Mobile — Logs + Metrics',
            });
        } catch (error: any) {
            Alert.alert('Erro ao compartilhar', error.message);
        }
    }

    /**
     * Reset all metrics (e.g., on logout).
     */
    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            failedRequests: 0,
            timeouts: 0,
            retries: 0,
            reconnects: 0,
            avgResponseTimeMs: 0,
            lastResponseTimeMs: 0,
            responseTimes: [],
        };
    }
}

export const logger = new LoggerService();
