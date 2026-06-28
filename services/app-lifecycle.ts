/**
 * 🏗️ App Lifecycle Manager — Enterprise Singleton
 * 
 * THE SINGLE SOURCE OF TRUTH for all app-wide lifecycle concerns.
 * No side-effects should exist outside this manager.
 * 
 * Responsibilities:
 * ┌─────────────────────────────────┐
 * │ 1. Single initialization       │
 * │ 2. AppState debounce/cooldown   │
 * │ 3. Singleton Realtime channels  │
 * │ 4. Realtime reconnection        │
 * │ 5. GPS singleton + recovery     │
 * │ 6. Push notification setup      │
 * │ 7. Notification tap handling    │
 * │ 8. Complete resource cleanup    │
 * └─────────────────────────────────┘
 * 
 * Patterns:
 * - Google: Single source of truth for lifecycle
 * - Meta: Controlled mount/unmount cycle  
 * - Netflix: Circuit breaker + reconnection
 * - Apple: Strict lifecycle state machine
 */

import { AppState, AppStateStatus, Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from './supabase';
import { authService } from './auth-service';
import { startBackgroundLocation, stopBackgroundLocation } from './location-service';
import { NotificationService } from './notification-service';
import { logger } from './logger';
import { createDebounce, createThrottle, resetNetworkState } from './network-resilience';
import { BootstrapService } from './bootstrap-service';
import { CLARO_FIX_FLAGS, detectCarrier, pingSupabase } from './connection-diagnostics';
import { resilientUpload } from './upload-resilient';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
    setAutoCheckinEnabled,
    setAutoCheckinOrders,
    type AutoCheckinOrder,
} from './auto-checkin-service';

// ─── Notification Module (conditional import for Expo Go compat) ─────────────
const isExpoGoAndroid = Platform.OS === 'android' && Constants.appOwnership === 'expo';
const Notifications = isExpoGoAndroid ? null : require('expo-notifications');

// ─── Types ───────────────────────────────────────────────────────────────────
type RealtimeCallback = (payload: any) => void;

interface LifecycleState {
    initialized: boolean;
    initializing: boolean;  // Prevents concurrent init calls
    gpsStarted: boolean;
    gpsHealthy: boolean;    // Tracks actual GPS health, not just "started"
    realtimeActive: boolean;
    userId: string | null;
    appState: AppStateStatus;
    isOffline: boolean;
}

// ─── Realtime Reconnection Config (PASSIVE — WebSocket is a BONUS, not primary) ──
const REALTIME_RECONNECT_BASE_MS = 10_000;   // 10s initial delay (no rush — polling covers us)
const REALTIME_RECONNECT_MAX_MS = 120_000;   // 2min max delay (we're patient — HTTP polling works)
const REALTIME_RECONNECT_MAX_ATTEMPTS = 3;   // Only 3 attempts, then give up until next app wake

// ─── Primary Data Channel: HTTP Polling (always-on, CGNAT-proof) ─────────────
const POLLING_INTERVAL_ACTIVE_MS = 15_000;    // 15s when user is actively using the app
const POLLING_INTERVAL_IDLE_MS = 45_000;      // 45s when app is idle (no interaction)
const POLLING_INTERVAL_BACKGROUND_MS = 120_000; // 2min background (battery saver)

// ─── GPS Recovery Config ─────────────────────────────────────────────────────
const GPS_HEALTH_CHECK_INTERVAL_MS = 5 * 60_000;  // Check GPS health every 5 min
const GPS_MAX_RECOVERY_ATTEMPTS = 3;

// ─── Singleton ───────────────────────────────────────────────────────────────
class AppLifecycleManager {
    private state: LifecycleState = {
        initialized: false,
        initializing: false,
        gpsStarted: false,
        gpsHealthy: false,
        realtimeActive: false,
        userId: null,
        appState: AppState.currentState || 'active',
        isOffline: false,
    };

    // ── Realtime channels — only one of each ──
    private notificationChannel: any = null;
    private ordersChannel: any = null;
    private realtimeReconnectAttempts = 0;
    private realtimeReconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private realtimeStabilityTimer: ReturnType<typeof setTimeout> | null = null;
    private isTearingDownRealtime = false;
    private isReconnecting = false;
    private realtimeCooldownUntil = 0;

    // ── High Availability & Offline Features ──
    private netInfoSubscription: any = null;
    private pollingTimer: any = null;
    public executePollRef: (() => Promise<void>) | null = null;
    private healthPingTimer: ReturnType<typeof setInterval> | null = null;
    private keepalivePingTimer: ReturnType<typeof setInterval> | null = null;

    /**
     * Força a atualização da UI buscando dados no servidor.
     */
    public forceUISync() {
        if (this.executePollRef) {
            this.executePollRef().catch(() => {});
        } else {
            // Fallback se não configurado
            this.orderChangeListeners.forEach(cb => {
                try { cb({ eventType: 'POLL_SYNC', new: {} }); } catch (e) { /* silent */ }
            });
        }
    }
    private offlineQueue: Array<{
        id: string;
        operationId: string; // Garantia Idempotência Backend
        action: string;
        payload: any;
        dedupeKey?: string;
        timestamp: number;   // Garantia Causal (Ordenação)
        schemaVersion: number; // Versionamento estrutural
        resolutionPolicy: 'last-write-wins' | 'merge'; // Resolução
    }> = [];
    private readonly OFFLINE_QUEUE_STORAGE_KEY = '@nexus:offline_queue_v2'; // Chave com versão engatilhada
    private readonly QUEUE_SCHEMA_VERSION = 2; // Para migrações
    private pollingAttempts = 0;
    private lastDataSyncTime = 0; // Prevenção de colisões Polling vs Realtime

    public realtimeMetrics = {
        sessionReconnects: 0,
        consecutiveFailures: 0,
        totalUptimeMs: 0,
        lastConnectTime: 0,
        connectionHealth: 100,          // 0–100 score
        healthHistory: [100, 100, 100, 100, 100], // Moving-average window
        // ── Extended Connection Telemetry (Enterprise Observability) ────────
        totalHardResets: 0,             // Hard reconnects (circuit-breaker level)
        totalTimeConnectedMs: 0,        // Cumulative CONNECTED uptime
        totalTimeIdleMs: 0,             // Cumulative CONNECTED_IDLE time
        idleTransitions: 0,             // How often we entered IDLE
        avgTimeToFirstDataMs: 0,        // Rolling avg: connect → first payload
        _idleEnteredAt: 0,              // Internal: timestamp when IDLE started
        _connectedEnteredAt: 0,         // Internal: timestamp when CONNECTED started
        _firstDataSamples: [] as number[], // Rolling window for avg calculation
    };

    // ── Resiliency Configs (Enterprise Tuned) ──
    private readonly HEALTH_PENALTY = 15; // Suavização de penalidade (menos agressivo do que 25)
    private lastWakeUpTime = Date.now(); // Grace period após fg
    private channelFailingSince: number | null = null; // Confidence Window para erros efêmeros

    // ── Watchdog & Deep Sleep (PASSIVE — only observes, never kills) ──
    private lastBackgroundTime = 0;
    private watchdogTimer: ReturnType<typeof setInterval> | null = null;
    private lastDataReceivedAt = Date.now();
    private lastHeartbeatAt = Date.now();
    private lastChannelErrorAt: number | null = null;
    private readonly DEEP_SLEEP_MS = 120 * 1000; // 2min em BG = reconectar realtime (relaxado — polling cobre)
    
    // ── Primary Polling (Always-On HTTP — CGNAT-proof) ──
    private primaryPollingTimer: ReturnType<typeof setInterval> | null = null;
    private lastPollSuccessAt = 0;
    private pollFailCount = 0;
    private userLastInteractionAt = Date.now();
    
    // ── Reconnect (Calm — max 3, no storm) ──
    private hardResetTimestamps: number[] = [];
    private readonly MAX_HARD_RESETS_PER_MIN = 2;
    private lastDeepSleepWakeAt = 0;
    private readonly CLARO_NAT_STABILIZE_MS = 8000; // Tempo mínimo para NAT da Claro estabilizar pós-deep-sleep

    // ── Global Network State ──
    public globalNetworkState = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, CONNECTED, CONNECTED_IDLE, DEGRADED, RECONNECTING, ERROR
    private networkStateListeners: Set<(state: string) => void> = new Set();

    // ── Enterprise Observability ──
    /** Optional external callback for metrics updates (analytics, UI dashboards). */
    private metricsUpdateListeners: Set<(metrics: typeof this.realtimeMetrics) => void> = new Set();
    /** Timer that fires if we remain in CONNECTED_IDLE for > MAX_IDLE_TIME_MS without incoming data */
    private extendedIdleTimer: ReturnType<typeof setTimeout> | null = null;
    private readonly MAX_IDLE_TIME_MS = 3 * 60 * 1000; // 3 minutes

    // ── Intelligence Layer (Pattern Detection + Analytics) ──
    /** Structured event log for pattern analysis and future AI/backend ingestion */
    private _connectionEventLog: Array<{
        event: string;
        state: string;
        ts: number;
        meta?: Record<string, any>;
    }> = [];
    private readonly MAX_EVENT_LOG = 50; // Rolling window, no memory leak

    /** Pattern detection counters (reset per session) */
    private _patternCounters = {
        reconnectsInWindow: 0,      // reconnects in last 5 minutes
        reconnectWindowStart: 0,    // start of counting window
        extendedIdleCount: 0,       // number of confirmed extended-idle events
        lowHealthCount: 0,          // consecutive health < 40 state transitions
    };

    /** Analytics payload accumulated during session, ready for backend flush */
    private _analyticsSession = {
        sessionId: `sess_${Date.now().toString(36)}`,
        startedAt: Date.now(),
        userId: null as string | null,
        events: [] as Array<{ event: string; ts: number; meta?: Record<string, any> }>,
    };

    // ── UI callbacks registered by components ──
    private orderChangeListeners: Set<RealtimeCallback> = new Set();

    // ── AppState subscription ──
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

    // ── Notification subscriptions (moved from _layout.tsx) ──
    private notificationReceivedSub: any = null;
    private notificationResponseSub: any = null;
    private notificationResponseHandler: ((orderId: string) => void | Promise<void>) | null = null;

    // ── Timers & controls ──
    private sessionRefreshDebounce = createDebounce(3000);
    private lastSessionRefresh = 0;
    private readonly SESSION_REFRESH_COOLDOWN = 30_000;

    private orderChangeThrottle = createThrottle(2000);

    private gpsHealthTimer: ReturnType<typeof setInterval> | null = null;
    private gpsRecoveryAttempts = 0;

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC API
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Initialize the app lifecycle. Called ONCE from _layout.tsx.
     * 
     * Guarantees:
     * - Idempotent: calling multiple times is safe
     * - Concurrent-safe: parallel calls are serialized
     * - All resources tracked for cleanup
     */
    async initialize(): Promise<boolean> {
        // Prevent duplicate initialization
        if (this.state.initialized) {
            console.log('[Lifecycle] ⚠️ Already initialized — skipping');
            return true;
        }

        // Prevent concurrent initialization (race condition guard)
        if (this.state.initializing) {
            console.log('[Lifecycle] ⏳ Initialization already in progress — waiting...');
            // Wait for the in-progress init to complete
            return new Promise<boolean>((resolve) => {
                const check = setInterval(() => {
                    if (!this.state.initializing) {
                        clearInterval(check);
                        resolve(this.state.initialized);
                    }
                }, 100);
                // Safety timeout — don't wait forever
                setTimeout(() => { clearInterval(check); resolve(false); }, 15_000);
            });
        }

        this.state.initializing = true;
        console.log('[Lifecycle] 🚀 Initializing app lifecycle...');

        try {
            // 1. Enable logging (idempotent)
            logger.enableGlobalCapture();

            // 2. Check auth
            const isAuthenticated = await authService.checkAuthStatus();
            if (!isAuthenticated) {
                console.log('[Lifecycle] 🔒 Not authenticated');
                return false;
            }

            // 3. Get user ID
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                console.log('[Lifecycle] ❌ No user found after auth check');
                return false;
            }

            this.state.userId = user.id;

            // 4. Setup AppState listener (debounced, with cooldown)
            this.setupAppStateListener();

            // 5. Start GPS (singleton, with health monitoring)
            await this.startGPS();
            this.startGPSHealthMonitor();

            // 6. Register push notifications + setup listeners
            await NotificationService.registerForPushNotificationsAsync().catch(
                err => console.warn('[Lifecycle] Push registration failed:', err)
            );
            this.setupNotificationListeners();

            // 7. START PRIMARY HTTP POLLING (always-on, CGNAT-proof)
            this.startPrimaryPolling();

            // 8. Setup realtime channels (PASSIVE bonus — not relied upon)
            await this.setupRealtime();
            this.startWatchdog();

            // 9. Start keepalive ping (Section 1.4: select 1 every 45s while foreground + logged in)
            this.startKeepalivePing();

            // 10. Resume interrupted uploads (Section 6.2)
            resilientUpload.resumeAll().catch(() => {});

            // 11. High Availability Connectivity Listener
            await this.loadOfflineQueue();
            this.setupConnectivityListener();

            // 12. Auto Check-in: load tenant settings + active orders
            this.setupAutoCheckin().catch(() => {});

            this.state.initialized = true;
            console.log('[Lifecycle] ✅ App lifecycle initialized successfully');
            return true;

        } catch (error) {
            console.error('[Lifecycle] ❌ Initialization failed:', error);
            return false;
        } finally {
            this.state.initializing = false;
        }
    }

    /**
     * Complete resource cleanup. Called on logout or app unmount.
     * 
     * Guarantees:
     * - All listeners removed
     * - All channels unsubscribed
     * - All timers cleared
     * - All refs nullified
     * - State fully reset
     */
    async destroy() {
        console.log('[Lifecycle] 🧹 Destroying lifecycle...');

        // 1. Remove AppState listener
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }

        // 2. Cancel pending debounce/throttle timers
        this.sessionRefreshDebounce.cancel();
        this.orderChangeThrottle.cancel();

        // 3. Remove notification listeners
        this.teardownNotificationListeners();

        // 4. Remove realtime channels (explicit per-channel async cleanup)
        await this.teardownRealtime();

        // 5. Stop GPS + health monitor
        this.stopGPSHealthMonitor();
        await stopBackgroundLocation().catch(() => {});

        // 6. Reset network state (circuit breaker, queues)
        resetNetworkState();

        // 7. Reset all HA features
        if (this.netInfoSubscription) {
            this.netInfoSubscription();
            this.netInfoSubscription = null;
        }
        if (this.pollingTimer) clearTimeout(this.pollingTimer);
        if (this.primaryPollingTimer) { clearInterval(this.primaryPollingTimer); this.primaryPollingTimer = null; }
        if (this.healthPingTimer) clearInterval(this.healthPingTimer);
        if (this.keepalivePingTimer) { clearInterval(this.keepalivePingTimer); this.keepalivePingTimer = null; }
        if (this.watchdogTimer) clearInterval(this.watchdogTimer);
        if (this.extendedIdleTimer) { clearTimeout(this.extendedIdleTimer); this.extendedIdleTimer = null; }
        this.offlineQueue = [];

        // 8. Reset all state
        this.state = {
            initialized: false,
            initializing: false,
            gpsStarted: false,
            gpsHealthy: false,
            realtimeActive: false,
            userId: null,
            appState: 'active',
            isOffline: false,
        };

        this.orderChangeListeners.clear();
        this.networkStateListeners.clear();
        this.metricsUpdateListeners.clear();
        this.gpsRecoveryAttempts = 0;
        this.realtimeReconnectAttempts = 0;
        this.realtimeCooldownUntil = 0;
        this.realtimeMetrics = {
            sessionReconnects: 0, consecutiveFailures: 0, totalUptimeMs: 0,
            lastConnectTime: 0, connectionHealth: 100, healthHistory: [100, 100, 100, 100, 100],
            totalHardResets: 0, totalTimeConnectedMs: 0, totalTimeIdleMs: 0,
            idleTransitions: 0, avgTimeToFirstDataMs: 0,
            _idleEnteredAt: 0, _connectedEnteredAt: 0, _firstDataSamples: [],
        };
        this._connectionEventLog = [];
        this._patternCounters = { reconnectsInWindow: 0, reconnectWindowStart: 0, extendedIdleCount: 0, lowHealthCount: 0 };
        this._analyticsSession = { sessionId: `sess_${Date.now().toString(36)}`, startedAt: Date.now(), userId: null, events: [] };

        console.log('[Lifecycle] ✅ Lifecycle destroyed — zero resources remaining');
    }

    /**
     * Register a handler for notification taps (deep linking to OS).
     * Called by _layout.tsx so the router can handle navigation.
     */
    setNotificationResponseHandler(handler: (orderId: string) => void | Promise<void>) {
        this.notificationResponseHandler = handler;
    }

    /**
     * Register a listener for order changes (used by HomeScreen).
     * Returns unsubscribe function. Throttled by lifecycle.
     */
    onOrderChange(callback: RealtimeCallback): () => void {
        this.orderChangeListeners.add(callback);
        return () => {
            this.orderChangeListeners.delete(callback);
        };
    }

    /**
     * Dispara fetch imediato e silencioso na camada de View.
     */
    forceUISync() {
        console.log('[Lifecycle] 🔄 Forçando resync otimista da UI...');
        this.orderChangeThrottle(() => {
            this.orderChangeListeners.forEach(cb => {
                try { cb({ eventType: 'WAKEUP_SYNC', new: {} }); } catch (e) { /* silent */ }
            });
        });
    }

    /**
     * Subscribe to global network state changes (for UI).
     * @returns unsubscribe function
     */
    onNetworkStateChange(callback: (state: string) => void): () => void {
        this.networkStateListeners.add(callback);
        callback(this.globalNetworkState);
        return () => this.networkStateListeners.delete(callback);
    }

    /**
     * Register a callback that fires whenever connection metrics are updated.
     * Use for analytics dashboards, UI health indicators, or remote monitoring.
     * @returns unsubscribe function
     */
    onConnectionMetricsUpdate(callback: (metrics: typeof this.realtimeMetrics) => void): () => void {
        this.metricsUpdateListeners.add(callback);
        // Emit current snapshot immediately
        try { callback({ ...this.realtimeMetrics }); } catch (e) { /* silent */ }
        return () => this.metricsUpdateListeners.delete(callback);
    }

    /** Returns a read-only snapshot of all connection telemetry. */
    getConnectionMetrics(): Readonly<typeof this.realtimeMetrics> {
        return { ...this.realtimeMetrics };
    }

    /**
     * Returns a human-readable message describing the current connection state.
     * Use these strings in loading states, empty screens, or status banners
     * wherever context is useful — without requiring a permanent global UI element.
     *
     * Map:
     *   CONNECTED        → App in sync
     *   CONNECTED_IDLE   → Awaiting updates (quiet period)
     *   RECONNECTING     → Reconnecting…
     *   DEGRADED         → Slow connection, using cached data
     *   ERROR            → Connection error
     *   DISCONNECTED     → Offline
     */
    getConnectionStatusMessage(): { text: string; severity: 'ok' | 'info' | 'warn' | 'error' } {
        switch (this.globalNetworkState) {
            case 'CONNECTED':
                return { text: 'Sincronizado', severity: 'ok' };
            case 'CONNECTED_IDLE':
                return { text: 'Aguardando novas atualizações', severity: 'info' };
            case 'RECONNECTING':
                return { text: 'Reconectando…', severity: 'warn' };
            case 'DEGRADED':
                return { text: 'Conexão instável — usando dados em cache', severity: 'warn' };
            case 'ERROR':
                return { text: 'Erro de conexão — tentando recuperar', severity: 'error' };
            case 'DISCONNECTED':
                return { text: 'Modo offline — dados podem estar desatualizados', severity: 'error' };
            default:
                return { text: 'Sincronizando dados…', severity: 'info' };
        }
    }

    /**
     * Returns the last N connection events for external inspection.
     * Useful for debug screens, support reports, or AI pattern tools.
     */
    getConnectionEventLog(limit = 20): ReadonlyArray<typeof this._connectionEventLog[0]> {
        return this._connectionEventLog.slice(-limit);
    }

    /**
     * Flush accumulated analytics payload (call after major actions or on session end).
     * Returns the payload for the caller to forward to their backend.
     */
    flushAnalyticsSession(): typeof this._analyticsSession & { metrics: ReturnType<typeof this.exportHealthMetrics> } {
        const payload = {
            ...this._analyticsSession,
            metrics: this.exportHealthMetrics(),
        };
        // Reset events but keep session ID and start time for continuity
        this._analyticsSession.events = [];
        this._patternCounters = { reconnectsInWindow: 0, reconnectWindowStart: 0, extendedIdleCount: 0, lowHealthCount: 0 };
        console.log('[Analytics] 📤 Session analytics flushed:', JSON.stringify(payload).length, 'bytes');
        return payload;
    }

    /**
     * Internal method to safely override global state and notify all listeners.
     */
    private setGlobalNetworkState(newState: string) {
        const prevState = this.globalNetworkState;
        if (prevState === newState) return;
        this.globalNetworkState = newState;
        console.log(`[Lifecycle] 🌐 Global State Transition -> ${newState}`);

        const now = Date.now();

        // ── Telemetry: time accumulation ─────────────────────────────────
        if (prevState === 'CONNECTED' && this.realtimeMetrics._connectedEnteredAt > 0) {
            this.realtimeMetrics.totalTimeConnectedMs += now - this.realtimeMetrics._connectedEnteredAt;
            this.realtimeMetrics._connectedEnteredAt = 0;
        }
        if (prevState === 'CONNECTED_IDLE' && this.realtimeMetrics._idleEnteredAt > 0) {
            const idleDurationMs = now - this.realtimeMetrics._idleEnteredAt;
            this.realtimeMetrics.totalTimeIdleMs += idleDurationMs;
            console.log(`[Metrics] Idle duration: ${Math.round(idleDurationMs / 1000)}s`);
            this.realtimeMetrics._idleEnteredAt = 0;
            // Cancel extended-idle detector when leaving IDLE
            if (this.extendedIdleTimer) { clearTimeout(this.extendedIdleTimer); this.extendedIdleTimer = null; }
        }

        if (newState === 'CONNECTED') {
            this.realtimeMetrics._connectedEnteredAt = now;
        }
        if (newState === 'CONNECTED_IDLE') {
            this.realtimeMetrics.idleTransitions++;
            this.realtimeMetrics._idleEnteredAt = now;
            // ─ Extended idle detector: observe only, NEVER reconnect ─
            if (this.extendedIdleTimer) clearTimeout(this.extendedIdleTimer);
            this.extendedIdleTimer = setTimeout(() => {
                if (this.globalNetworkState === 'CONNECTED_IDLE') {
                    console.warn('[Watchdog] ⚠️ Extended idle detected — possible silent failure');
                    console.log(`[Metrics] Reconnect count: ${this.realtimeMetrics.sessionReconnects}`);
                    console.log(`[Metrics] Avg time to data: ${Math.round(this.realtimeMetrics.avgTimeToFirstDataMs)} ms`);
                    // Observers are notified below — no reconnect triggered
                }
            }, this.MAX_IDLE_TIME_MS);
        }

        // ── Health score ─────────────────────────────────────────
        this._recalculateHealthScore();

        // ── Pattern detection ───────────────────────────────────
        this._detectPatterns(newState);

        // ── Structured event log ──────────────────────────────
        this._logConnectionEvent('STATE_CHANGE', newState, { prev: prevState, health: this.realtimeMetrics.connectionHealth });

        // Notify state observers
        this.networkStateListeners.forEach(cb => {
            try { cb(newState); } catch (e) { /* silent */ }
        });
        // Notify metrics observers
        this._emitMetricsUpdate();
    }

    /** Recalculate connectionHealth using penalties + idle stability bonus. */
    private _recalculateHealthScore() {
        // Base: moving-average score
        const movingAvg = this.realtimeMetrics.healthHistory.reduce((a, b) => a + b, 0)
            / this.realtimeMetrics.healthHistory.length;

        // Penalty: each recent reconnect costs 5 pts (capped at last 5 reconnects)
        const reconnectPenalty = Math.min(this.realtimeMetrics.sessionReconnects, 5) * 5;

        // Penalty: consecutive failures cost 10 pts each (capped at 3)
        const errorPenalty = Math.min(this.realtimeMetrics.consecutiveFailures, 3) * 10;

        // Bonus: if we've been stably IDLE, add up to +5 pts for proven stability
        const idleStabilityBonus = this.globalNetworkState === 'CONNECTED_IDLE' ? 5 : 0;

        const score = Math.max(0, Math.min(100, movingAvg - reconnectPenalty - errorPenalty + idleStabilityBonus));
        this.realtimeMetrics.connectionHealth = Math.round(score);
    }

    /** Emit metrics snapshot to all registered metric observers. */
    private _emitMetricsUpdate() {
        if (this.metricsUpdateListeners.size === 0) return;
        const snapshot = { ...this.realtimeMetrics };
        this.metricsUpdateListeners.forEach(cb => {
            try { cb(snapshot); } catch (e) { /* silent */ }
        });
    }

    /**
     * Pattern detector — called on every state transition.
     * Identifies infrastructure-level anomalies without disrupting existing flow.
     */
    private _detectPatterns(newState: string) {
        const now = Date.now();

        // ─ Pattern 1: Frequent reconnects (reconnect storm indicator) ──────────
        if (newState === 'RECONNECTING') {
            const windowMs = 5 * 60 * 1000; // 5-minute window
            if (now - this._patternCounters.reconnectWindowStart > windowMs) {
                // Start new window
                this._patternCounters.reconnectsInWindow = 0;
                this._patternCounters.reconnectWindowStart = now;
            }
            this._patternCounters.reconnectsInWindow++;
            if (this._patternCounters.reconnectsInWindow >= 3) {
                console.warn(
                    `[Analytics] 🚨 PATTERN: ${this._patternCounters.reconnectsInWindow} reconnects in 5min ` +
                    `— possible infrastructure instability (health: ${this.realtimeMetrics.connectionHealth})`
                );
                this._logConnectionEvent('PATTERN_FREQUENT_RECONNECT', newState, {
                    count: this._patternCounters.reconnectsInWindow,
                    windowMs,
                });
            }
        }

        // ─ Pattern 2: Extended idle recurrence ─────────────────────────
        // (Fires inside the extended-idle timeout in setGlobalNetworkState)
        // Increment here when the idle threshold is crossed:
        if (newState === 'CONNECTED_IDLE') {
            // Arm an analytics flag — actual extended detection is in the timer
            const prevExtendedIdleCount = this._patternCounters.extendedIdleCount;
            setTimeout(() => {
                if (this.globalNetworkState === 'CONNECTED_IDLE') {
                    this._patternCounters.extendedIdleCount++;
                    if (this._patternCounters.extendedIdleCount >= 2) {
                        console.warn(
                            `[Analytics] 🚨 PATTERN: Repeated extended idle (x${this._patternCounters.extendedIdleCount}) ` +
                            `— backend may have silent failure`
                        );
                        this._logConnectionEvent('PATTERN_REPEATED_EXTENDED_IDLE', newState, {
                            count: this._patternCounters.extendedIdleCount,
                        });
                    }
                }
            }, this.MAX_IDLE_TIME_MS);
        }

        // ─ Pattern 3: Chronically low health score ────────────────────
        if (this.realtimeMetrics.connectionHealth < 40) {
            this._patternCounters.lowHealthCount++;
            if (this._patternCounters.lowHealthCount >= 3) {
                console.warn(
                    `[Analytics] 🚨 PATTERN: Health persistently < 40 ` +
                    `(${this._patternCounters.lowHealthCount}x) — degraded network environment`
                );
                this._logConnectionEvent('PATTERN_LOW_HEALTH', newState, {
                    health: this.realtimeMetrics.connectionHealth,
                    consecutiveCount: this._patternCounters.lowHealthCount,
                });
            }
        } else {
            this._patternCounters.lowHealthCount = 0; // Reset streak on recovery
        }
    }

    /**
     * Append a structured event to the rolling connection event log.
     * Used for observability, debug, and future AI/pattern analysis ingestion.
     */
    private _logConnectionEvent(event: string, state: string, meta?: Record<string, any>) {
        const entry = { event, state, ts: Date.now(), ...(meta ? { meta } : {}) };
        this._connectionEventLog.push(entry);
        if (this._connectionEventLog.length > this.MAX_EVENT_LOG) {
            this._connectionEventLog.shift(); // Rolling window — no memory leak
        }
        // Mirror to analytics session for backend flush
        this._analyticsSession.events.push({ event, ts: entry.ts, meta });
        if (this._analyticsSession.events.length > this.MAX_EVENT_LOG) {
            this._analyticsSession.events.shift();
        }
    }

    /**
     * Get current lifecycle state (for observability/debugging).
     */
    getState(): Readonly<LifecycleState> {
        return { ...this.state };
    }

    /**
     * Suspende o Watchdog agressivo temporariamente.
     * Ideal para ser invocado pela UI quando o usuário iniciar filtros pesados
     * ou buscas intensivas que mascaram a percepção de inatividade de rede.
     */
    suspendWatchdogTemporarily(durationMs: number = 8000) {
        this.watchdogSuspendedUntil = Date.now() + durationMs;
        this.lastDataReceivedAt = Date.now(); // Reseta para evitar morte súbita pós-grace
        this.lastHeartbeatAt = Date.now();
        console.log(`[Lifecycle] 🛡️ Watchdog suspenso explicitamente por ${durationMs}ms para ação da UI.`);
    }

    /**
     * Check if GPS is running AND healthy.
     */
    isGPSRunning(): boolean {
        return this.state.gpsStarted && this.state.gpsHealthy;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // APPSTATE MANAGEMENT
    // ═══════════════════════════════════════════════════════════════════════

    private setupAppStateListener() {
        // Idempotent: remove existing listener first
        if (this.appStateSubscription) {
            this.appStateSubscription.remove();
            this.appStateSubscription = null;
        }

        this.appStateSubscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
            const prevState = this.state.appState;
            this.state.appState = nextState;

            if (nextState === 'background') {
                this.lastBackgroundTime = Date.now();
                // Section 2.4: Pause pings in background
                if (this.keepalivePingTimer) {
                    clearInterval(this.keepalivePingTimer);
                    this.keepalivePingTimer = null;
                }
                return;
            }

            // Only act on background → active transition
            if (prevState.match(/inactive|background/) && nextState === 'active') {
                console.log('[Lifecycle] 💓 App returned to foreground');
                this.lastWakeUpTime = Date.now(); // Armazena timestamp real de Acordada do FG (Grace Period)
                
                // 🚀 BIG TECH PATTERN: UI Otimista. Independente da saúde do socket, 
                // forçamos as telas principais a buscarem o estado mais fresco via HTTP Rest.
                this.forceUISync();

                // Section 2.2: Quick resume if >90s since last activity
                BootstrapService.quickResume().catch(() => {});

                // Section 6.2: Resume interrupted uploads on foreground return
                resilientUpload.resumeAll().catch(() => {});

                // Restart keepalive ping (was paused in background)
                this.startKeepalivePing();

                const timeAsleep = Date.now() - this.lastBackgroundTime;

                // Debounced session refresh with cooldown
                this.sessionRefreshDebounce(() => {
                    const now = Date.now();
                    if (now - this.lastSessionRefresh < this.SESSION_REFRESH_COOLDOWN) {
                        console.log('[Lifecycle] ⏳ Session refresh on cooldown, skipping');
                        return;
                    }
                    this.lastSessionRefresh = now;
                    this.refreshSession();
                });

                if (timeAsleep > this.DEEP_SLEEP_MS) {
                    console.warn(`[Lifecycle] 💤 Deep sleep detectado (${Math.round(timeAsleep/1000)}s). Reconectando realtime calmamente...`);
                    
                    // Polling já está rodando (sempre ativo), então dados frescos chegam via HTTP.
                    // Apenas tentamos reconectar o WebSocket como bônus, sem pressa.
                    this.lastDeepSleepWakeAt = Date.now();
                    const natStabilizeDelay = this.CLARO_NAT_STABILIZE_MS;
                    
                    console.log(`[Lifecycle] 📡 Aguardando ${natStabilizeDelay}ms para o NAT da operadora estabilizar antes de reconectar WebSocket...`);
                    setTimeout(() => {
                        this.realtimeCooldownUntil = 0;
                        this.isReconnecting = false;
                        this.scheduleRealtimeReconnect();
                    }, natStabilizeDelay);
                } else {
                    console.log('[Lifecycle] ☀️ Soft wake. Polling ativo. Validando WebSocket como bônus...');
                    this.checkRealtimeHealth();
                }
            }
        });
    }

    private async refreshSession() {
        try {
            const { data: { session }, error } = await supabase.auth.getSession();
            if (error) {
                console.error('[Lifecycle] ❌ Session validation error:', error.message);
                return;
            }
            if (!session) {
                console.warn('[Lifecycle] ⚠️ Session null, attempting refresh...');
                const { error: refreshError } = await supabase.auth.refreshSession();
                if (refreshError) {
                    console.error('[Lifecycle] ❌ Session refresh failed:', refreshError.message);
                }
            } else {
                console.log('[Lifecycle] ✅ Session valid');
            }
        } catch (err) {
            console.error('[Lifecycle] 💥 Session check exception:', err);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // GPS MANAGEMENT (with health monitoring + recovery)
    // ═══════════════════════════════════════════════════════════════════════

    private async startGPS() {
        if (this.state.gpsStarted) {
            console.log('[Lifecycle] 📍 GPS already started — skipping');
            return;
        }

        try {
            const result = await startBackgroundLocation();
            this.state.gpsStarted = !!result;
            this.state.gpsHealthy = !!result;
            this.gpsRecoveryAttempts = 0;
            if (result) {
                console.log('[Lifecycle] 📍 GPS started successfully');
            } else {
                console.warn('[Lifecycle] ⚠️ GPS start returned false (permissions?)');
            }
        } catch (err) {
            console.error('[Lifecycle] ❌ GPS start failed:', err);
            this.state.gpsStarted = false;
            this.state.gpsHealthy = false;
        }
    }

    /**
     * Periodic GPS health check. Detects:
     * - Silent service death
     * - Permission revocation
     * - Internal crash recovery
     * 
     * Attempts recovery up to GPS_MAX_RECOVERY_ATTEMPTS times.
     */
    private startGPSHealthMonitor() {
        this.stopGPSHealthMonitor(); // Idempotent

        this.gpsHealthTimer = setInterval(async () => {
            if (!this.state.gpsStarted || !this.state.initialized) return;

            try {
                // Check if foreground permissions are still granted
                const Location = require('expo-location');
                const { status } = await Location.getForegroundPermissionsAsync();

                if (status !== 'granted') {
                    console.warn('[Lifecycle] ⚠️ GPS permission revoked — marking unhealthy');
                    this.state.gpsHealthy = false;
                    return;
                }

                // Check if background task is still running
                const TaskManager = require('expo-task-manager');
                const isRunning = await Location.hasStartedLocationUpdatesAsync('background-location-task').catch(() => false);

                if (!isRunning && this.state.gpsStarted) {
                    console.warn('[Lifecycle] ⚠️ GPS background task died — attempting recovery');
                    this.state.gpsHealthy = false;

                    if (this.gpsRecoveryAttempts < GPS_MAX_RECOVERY_ATTEMPTS) {
                        this.gpsRecoveryAttempts++;
                        console.log(`[Lifecycle] 🔄 GPS recovery attempt ${this.gpsRecoveryAttempts}/${GPS_MAX_RECOVERY_ATTEMPTS}`);
                        
                        // Reset state and restart
                        this.state.gpsStarted = false;
                        await this.startGPS();
                    } else {
                        console.error('[Lifecycle] ❌ GPS recovery exhausted — giving up');
                    }
                } else {
                    // GPS is healthy
                    this.state.gpsHealthy = true;
                    this.gpsRecoveryAttempts = 0; // Reset on success
                }
            } catch (err) {
                // Don't let health check crash the app
                console.warn('[Lifecycle] GPS health check error:', err);
            }
        }, GPS_HEALTH_CHECK_INTERVAL_MS);
    }

    private stopGPSHealthMonitor() {
        if (this.gpsHealthTimer) {
            clearInterval(this.gpsHealthTimer);
            this.gpsHealthTimer = null;
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // NOTIFICATION MANAGEMENT (moved from _layout.tsx for zero side-effects)
    // ═══════════════════════════════════════════════════════════════════════

    private setupNotificationListeners() {
        if (!Notifications) return;

        // Incoming notifications while app is open
        this.notificationReceivedSub = Notifications.addNotificationReceivedListener(
            (notification: any) => {
                console.log('[Lifecycle] 🔔 Notification Received:', notification?.request?.content?.title);
            }
        );

        // Handle notification taps → deep link to OS detail
        this.notificationResponseSub = Notifications.addNotificationResponseReceivedListener(
            (response: any) => {
                const orderId = response?.notification?.request?.content?.data?.orderId;
                if (orderId && this.notificationResponseHandler) {
                    this.notificationResponseHandler(orderId);
                }
            }
        );
    }

    private teardownNotificationListeners() {
        if (Notifications && typeof Notifications.removeNotificationSubscription === 'function') {
            if (this.notificationReceivedSub) {
                Notifications.removeNotificationSubscription(this.notificationReceivedSub);
                this.notificationReceivedSub = null;
            }
            if (this.notificationResponseSub) {
                Notifications.removeNotificationSubscription(this.notificationResponseSub);
                this.notificationResponseSub = null;
            }
        }
        this.notificationResponseHandler = null;
    }

    // ═══════════════════════════════════════════════════════════════════════
    // REALTIME MANAGEMENT (singleton channels + reconnection with backoff)
    // ═══════════════════════════════════════════════════════════════════════

    private async setupRealtime() {
        console.log('[Lifecycle] 📡 Setting up realtime...');
        
        // 3. Verificação de estado antes de reconectar (Evita reconexão se já estável)
        if (this.state.realtimeActive && this.notificationChannel && this.ordersChannel) {
            console.log('[Lifecycle] 📡 Realtime logically active and channels exist — skipping');
            return;
        }

        // Safety guard against duplicate creation if channels exist but active flag is out of sync
        if (this.notificationChannel || this.ordersChannel) {
            console.log('[Lifecycle] 📡 Ghost channels detected. Cleaning before setup...');
            await this.teardownRealtime();
        }

        if (this.state.realtimeActive) {
            console.log('[Lifecycle] 📡 Realtime already active — skipping');
            return;
        }

        if (!this.state.userId) return;

        const userId = this.state.userId;

        try {
            // ── Channel 1: Notifications (for in-app alerts) ────────────
            this.notificationChannel = supabase
                .channel(`lifecycle:notifications:${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: 'INSERT',
                        schema: 'public',
                        table: 'notifications',
                        filter: `user_id=eq.${userId}`,
                    },
                    (payload: any) => {
                        this.lastDataReceivedAt = Date.now(); // Feed the watchdog
                        // Sair do IDLE ao receber dado real
                        if (this.globalNetworkState === 'CONNECTED_IDLE') this.setGlobalNetworkState('CONNECTED');
                        const notif = payload.new;
                        NotificationService.triggerLocalNotification(
                            '📋 Nova Notificação',
                            notif.title || `OS #${notif.order_id}`,
                            { orderId: notif.order_id }
                        );
                    }
                )
                // Implementação de ping ativo via listener system
                .on('system', { event: '*' }, () => {
                    this.lastDataReceivedAt = Date.now();
                    // Heartbeats do sistema também tiram do IDLE
                    if (this.globalNetworkState === 'CONNECTED_IDLE') this.setGlobalNetworkState('CONNECTED');
                })
                .subscribe((status: string, err?: Error) => {
                    console.log(`[Lifecycle] 📡 Notification channel: ${status}`);
                    this.handleChannelStatus('notifications', status, err);
                });

            // ── Channel 2: Orders (singleton, shared with HomeScreen) ───
            this.ordersChannel = supabase
                .channel(`lifecycle:orders:${userId}`)
                .on(
                    'postgres_changes',
                    {
                        event: '*',
                        schema: 'public',
                        table: 'orders',
                        filter: `assigned_to=eq.${userId}`,
                    },
                    (payload: any) => {
                        this.lastDataReceivedAt = Date.now(); // Feed the watchdog
                        // Sair do IDLE ao receber dado real do canal de orders
                        if (this.globalNetworkState === 'CONNECTED_IDLE') this.setGlobalNetworkState('CONNECTED');
                        console.log('[Lifecycle] 🔄 Order change:', payload.eventType);

                        // Throttled dispatch to all listeners
                        this.orderChangeThrottle(() => {
                            this.orderChangeListeners.forEach(cb => {
                                try { cb(payload); } catch (e) { /* silent */ }
                            });
                        });

                        // Refresh auto-checkin order list when OS status changes
                        this.refreshAutoCheckinOrders().catch(() => {});

                        // Trigger local notification for new assignments
                        if (payload.eventType === 'INSERT') {
                            NotificationService.triggerLocalNotification(
                                '📋 Nova OS Atribuída',
                                `OS ${payload.new.display_id || payload.new.id?.substring(0, 8)}`,
                                { orderId: payload.new.id }
                            );
                        }
                    }
                )
                // Implementação de ping ativo via listener system
                .on('system', { event: '*' }, () => {
                    this.lastHeartbeatAt = Date.now(); // System pings count as connection heartbeat, not data!
                })
                .subscribe((status: string, err?: Error) => {
                    console.log(`[Lifecycle] 📡 Orders channel: ${status}`);
                    this.handleChannelStatus('orders', status, err);
                });

            this.state.realtimeActive = true;
            this.lastDataReceivedAt = Date.now(); 
            this.lastHeartbeatAt = Date.now(); 
            console.log('[Lifecycle] 📡 Realtime channels established (awaiting stability)');

        } catch (error) {
            console.error('[Lifecycle] ❌ Realtime setup failed:', error);
            this.scheduleRealtimeReconnect();
        }
    }

    /**
     * Atualiza a Média Móvel de Saúde da Conexão (Suaviza oscilações numéricas).
     */
    private pushHealthMovingAverage(newScore: number) {
        this.realtimeMetrics.healthHistory.push(newScore);
        if (this.realtimeMetrics.healthHistory.length > 5) {
            this.realtimeMetrics.healthHistory.shift();
        }
        // Actual health score is now computed in _recalculateHealthScore() on every state transition.
        // This keeps the moving-average window updated for that calculation.
        const sum = this.realtimeMetrics.healthHistory.reduce((a, b) => a + b, 0);
        this.realtimeMetrics.connectionHealth = Math.round(sum / this.realtimeMetrics.healthHistory.length);
    }

    /**
     * Handles channel status changes for reconnection logic.
     * Supabase Realtime emits: SUBSCRIBED, TIMED_OUT, CLOSED, CHANNEL_ERROR
     */
    private handleChannelStatus(channelName: string, status: string, err?: Error) {
        if (this.isTearingDownRealtime) {
            console.log(`[Lifecycle] 📡 Ignoring status ${status} for "${channelName}" (intentional teardown)`);
            return;
        }

        if (status === 'SUBSCRIBED') {
            console.log(`[Lifecycle] 📡 Channel "${channelName}" SUBSCRIBED. Waiting 15s for stability...`);
            this.setGlobalNetworkState('CONNECTED');
            this.channelFailingSince = null;
            
            this.realtimeMetrics.lastConnectTime = Date.now();
            this.realtimeMetrics.consecutiveFailures = 0;
            this.pushHealthMovingAverage(100);
            if (this.pollingTimer) clearInterval(this.pollingTimer);

            if (this.realtimeStabilityTimer) clearTimeout(this.realtimeStabilityTimer);
            const dataSnapshotAtSubscribe = this.lastDataReceivedAt;
            const subscribeTime = Date.now();
            const timeSinceDeepSleep = subscribeTime - this.lastDeepSleepWakeAt;
            
            // 🔑 CLARO NAT FIX: Se recebemos SUBSCRIBED muito rápido após um deep-sleep wake,
            // pode ser um falso positivo do buffer interno do SDK. Validamos com um ping ativo.
            const isLikelyFalsePositive = this.lastDeepSleepWakeAt > 0 && timeSinceDeepSleep < 8000;
            
            if (isLikelyFalsePositive && channelName === 'orders') {
                console.warn(`[Lifecycle] ⚠️ SUBSCRIBED em ${Math.round(timeSinceDeepSleep/1000)}s após deep-sleep. Validando com ping ativo (possível falso positivo Claro/CGNAT)...`);
                setTimeout(() => {
                    if (!this.ordersChannel || this.isTearingDownRealtime) return;
                    this._safeBroadcast(this.ordersChannel, 'nat_validation_ping', { ts: Date.now() })
                        .then(() => {
                            console.log('[Lifecycle] ✅ Ping de validação NAT OK. SUBSCRIBED confirmado como real.');
                            this.lastHeartbeatAt = Date.now();
                        })
                        .catch(() => {
                            console.warn('[Lifecycle] 🚨 Ping de validação NAT FALHOU. SUBSCRIBED era falso positivo. Forçando reconnect imediato.');
                            this.channelFailingSince = Date.now();
                            this.state.realtimeActive = false;
                            this.realtimeCooldownUntil = 0;
                            this.isReconnecting = false;
                            this.scheduleRealtimeReconnect();
                        });
                }, 2500); // Aguarda 2.5s antes de pingar (dá tempo da subscrição assentar)
            }

            this.realtimeStabilityTimer = setTimeout(() => {
                console.log(`[Lifecycle] 📡 Realtime estável por 15s. Resetting reconnect backoff e limpando flags de erro.`);
                this.realtimeReconnectAttempts = 0;
                this.lastChannelErrorAt = null;
                this.lastDeepSleepWakeAt = 0; // Reset deep sleep flag após estabilidade confirmada
                
                // 🔑 v3: BREAK THE DEATH SPIRAL — resetar health history após estabilidade confirmada
                // Sem isso, a média móvel fica presa em <40 e trava o app em "cronicamente degradado" para sempre
                this.realtimeMetrics.healthHistory = [80, 80, 80, 80, 80];
                this.realtimeMetrics.consecutiveFailures = 0;
                this._patternCounters.lowHealthCount = 0; // Reset contador de saúde baixa
                this._recalculateHealthScore();
                console.log(`[Lifecycle] 📡 Health score resetado para ${this.realtimeMetrics.connectionHealth} após estabilidade confirmada.`);

                if (this.lastDataReceivedAt <= dataSnapshotAtSubscribe && !this.lastChannelErrorAt) {
                    console.log('[Lifecycle] 💤 Connection is idle but healthy');
                    this.setGlobalNetworkState('CONNECTED_IDLE');
                }
            }, 15000);
            return;
        }

        if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            const reason = err?.message || 'unknown';
            console.warn(`[Lifecycle] ⚠️ Channel "${channelName}" dropped: ${status} (Reason: ${reason})`);
            
            // Marca flag de erro recente
            this.lastChannelErrorAt = Date.now();
            if (!this.channelFailingSince) this.channelFailingSince = Date.now();
            
            // NÃO setamos ERROR global — polling HTTP primário continua funcionando normalmente
            // Apenas degradamos se o polling TAMBÉM estiver falhando
            if (this.pollFailCount >= 3) {
                this.setGlobalNetworkState('ERROR');
            } else {
                // Polling funciona: WebSocket caiu mas dados continuam chegando via HTTP
                this.setGlobalNetworkState('DEGRADED');
            }
            
            // Coleta de métricas
            if (this.realtimeMetrics.lastConnectTime > 0) {
                this.realtimeMetrics.totalUptimeMs += (Date.now() - this.realtimeMetrics.lastConnectTime);
                this.realtimeMetrics.lastConnectTime = 0;
            }
            this.realtimeMetrics.consecutiveFailures++;
            const lastHealth = this.realtimeMetrics.healthHistory[this.realtimeMetrics.healthHistory.length - 1] || 100;
            this.pushHealthMovingAverage(Math.max(0, lastHealth - this.HEALTH_PENALTY));

            // Reconnect calmo após 60s (sem pressa — polling cobre)
            setTimeout(() => {
                if (this.channelFailingSince && Date.now() - this.channelFailingSince >= 58000) {
                    console.log(`[Lifecycle] 📡 WebSocket instável por 60s. Tentando reconectar calmamente (polling ativo cobre dados).`);
                    this.state.realtimeActive = false;
                    this.scheduleRealtimeReconnect();
                }
            }, 60000);
        }
    }

    private watchdogSuspendedUntil = 0;

    /**
     * 🛡️ PASSIVE WATCHDOG v4 (Observe-Only — NEVER kills the socket)
     * 
     * The primary data channel is HTTP Polling (always-on, CGNAT-proof).
     * This watchdog only:
     * 1. Logs WebSocket health for telemetry
     * 2. Schedules a CALM reconnect if WebSocket has been dead for 3+ minutes
     * 3. NEVER triggers aggressive reconnect storms
     */
    private startWatchdog() {
        if (this.watchdogTimer) clearInterval(this.watchdogTimer);
        
        this.watchdogTimer = setInterval(() => {
            if (!this.state.initialized || this.state.isOffline || this.isTearingDownRealtime) return;
            if (Date.now() < this.watchdogSuspendedUntil) return;

            const now = Date.now();
            const timeSinceData = now - this.lastDataReceivedAt;
            const timeSinceHeartbeat = now - this.lastHeartbeatAt;
            
            // Passive health score update (doesn't trigger any action)
            const worstDelay = Math.max(timeSinceData, timeSinceHeartbeat);
            // Slower degradation: health score is based on worst delay over 120s window (not 45s)
            this.pushHealthMovingAverage(Math.max(20, 100 - (worstDelay / 2000)));

            // Log only — no killing
            if (timeSinceHeartbeat > 12_000 && this.state.realtimeActive) {
                console.log(`[Watchdog] 📡 WebSocket silent for ${Math.round(timeSinceHeartbeat/1000)}s. Polling HTTP cobre dados. Tentando reconectar WebSocket em background...`);
                // Calm reconnect — no rush, polling covers us
                if (!this.isReconnecting && !this.realtimeReconnectTimer) {
                    this.state.realtimeActive = false;
                    this.scheduleRealtimeReconnect();
                }
                this.lastHeartbeatAt = now; // Reset to avoid spamming
            } else if (timeSinceHeartbeat > 6_000 && this.state.realtimeActive) {
                // Gentle ping — if it fails, channel error will fire naturally
                if (this.ordersChannel) {
                    try {
                        this._safeBroadcast(this.ordersChannel, 'watchdog_ping', { ts: now }).catch(() => {});
                    } catch (e) { /* silent */ }
                }
            }
        }, 3000); // Check every 3s for speedier recoveries
    }

    /**
     * 💓 KEEPALIVE PING (Section 1.4)
     * 
     * While foreground + logged in, runs a lightweight `select 1` every 45s.
     * Keeps TCP alive through Claro's CGNAT (which drops idle connections in ~60s).
     * 
     * Rules:
     * - Pauses in background (Section 2.4)
     * - Only runs when initialized + not offline
     * - Uses pingSupabase() which is a HEAD request (minimal bandwidth)
     */
    private startKeepalivePing() {
        if (!CLARO_FIX_FLAGS.ENABLE_KEEPALIVE_PING) return;
        if (this.keepalivePingTimer) return; // Already running

        const PING_INTERVAL_MS = 45_000; // 45s (within Claro's ~60s idle window)

        console.log('[Lifecycle] 💓 Starting keepalive ping every 45s');

        this.keepalivePingTimer = setInterval(async () => {
            if (!this.state.initialized || this.state.isOffline || this.state.appState !== 'active') return;

            try {
                const ok = await pingSupabase(8_000);
                if (ok) {
                    this.lastHeartbeatAt = Date.now();
                    this.lastDataReceivedAt = Date.now();
                } else {
                    console.warn('[Lifecycle] 💓 Keepalive ping failed — connection may be stale');
                }
            } catch {
                // Silent — ping is best-effort
            }
        }, PING_INTERVAL_MS);
    }

    /**
     * 🔄 PRIMARY HTTP POLLING (Always-On, CGNAT-Proof)
     *
     * This is the REAL data channel. Runs continuously with adaptive intervals:
     * - 15s when user is actively interacting
     * - 45s when app is idle  
     * - 120s when in background
     *
     * Each poll does a lightweight REST query and dispatches changes to UI listeners.
     * This completely bypasses WebSocket/CGNAT issues.
     */
    // ═══════════════════════════════════════════════════════════════════════
    // AUTO CHECK-IN SETUP
    // ═══════════════════════════════════════════════════════════════════════

    /** Load tenant metadata to determine if auto check-in is enabled, then fetch orders */
    private async setupAutoCheckin(): Promise<void> {
        try {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session?.user) return;

            // Fetch tenant metadata for the user's tenant
            const { data: userData } = await supabase
                .from('users')
                .select('tenant_id')
                .eq('id', session.user.id)
                .maybeSingle();

            if (!userData?.tenant_id) return;

            const { data: tenant } = await supabase
                .from('tenants')
                .select('metadata')
                .eq('id', userData.tenant_id)
                .maybeSingle();

            const autoCheckinEnabled = tenant?.metadata?.autoCheckin === true;
            setAutoCheckinEnabled(autoCheckinEnabled);
            logger.log(`[AutoCheckin] Setting: ${autoCheckinEnabled ? '✅ Habilitado' : '🔴 Desabilitado'}`, 'info');

            if (autoCheckinEnabled) {
                await this.refreshAutoCheckinOrders();
            }
        } catch (err: any) {
            logger.log(`[AutoCheckin] Erro ao configurar: ${err.message}`, 'warn');
        }
    }

    /** Fetch active OS assigned to this technician and update auto-checkin monitor */
    private async refreshAutoCheckinOrders(): Promise<void> {
        try {
            if (!this.state.userId) return;

            const { data: orders, error } = await supabase
                .from('orders')
                .select('id, display_id, customer_name, customer_address, customer_id, status')
                .eq('assigned_to', this.state.userId)
                .in('status', ['ATRIBUÍDO', 'EM DESLOCAMENTO'])
                .limit(20);

            if (error || !orders) return;

            // For each order, try to get customer lat/lng if available
            const enriched: AutoCheckinOrder[] = await Promise.all(
                orders.map(async (o: any) => {
                    let lat: number | null = null;
                    let lng: number | null = null;

                    if (o.customer_id) {
                        try {
                            const { data: customer } = await supabase
                                .from('customers')
                                .select('latitude, longitude')
                                .eq('id', o.customer_id)
                                .maybeSingle();
                            lat = customer?.latitude ?? null;
                            lng = customer?.longitude ?? null;
                        } catch { /* ignore */ }
                    }

                    return {
                        id: o.id,
                        displayId: o.display_id,
                        customerName: o.customer_name,
                        customerAddress: o.customer_address,
                        customerId: o.customer_id,
                        customerLat: lat,
                        customerLng: lng,
                        status: o.status,
                    };
                })
            );

            setAutoCheckinOrders(enriched);
            logger.log(`[AutoCheckin] ${enriched.length} OS carregadas para monitoramento`, 'info');
        } catch (err: any) {
            logger.log(`[AutoCheckin] Erro ao carregar OS: ${err.message}`, 'warn');
        }
    }

    private startPrimaryPolling() {
        if (this.primaryPollingTimer) clearInterval(this.primaryPollingTimer);
        this.lastPollSuccessAt = Date.now();
        this.pollFailCount = 0;
        
        console.log('[Lifecycle] 🔄 Starting PRIMARY HTTP Polling (always-on, CGNAT-proof)');
        
        // Adaptive interval based on app activity
        const getPollingInterval = (): number => {
            if (this.state.appState !== 'active') return POLLING_INTERVAL_BACKGROUND_MS;
            const timeSinceInteraction = Date.now() - this.userLastInteractionAt;
            if (timeSinceInteraction > 2 * 60_000) return POLLING_INTERVAL_IDLE_MS; // 2min sem interação
            return POLLING_INTERVAL_ACTIVE_MS;
        };
        
        const executePoll = async () => {
            if (this.state.isOffline || !this.state.userId || this.state.appState !== 'active') return;

            try {
                const start = Date.now();
                const { data, error } = await supabase
                    .from('orders')
                    .select('id, updated_at')
                    .eq('assigned_to', this.state.userId!)
                    .order('updated_at', { ascending: false })
                    .limit(3);

                if (!error && data) {
                    const latency = Date.now() - start;
                    this.pollFailCount = 0;
                    this.lastPollSuccessAt = Date.now();
                    this.lastDataReceivedAt = Date.now(); // Feed watchdog
                    
                    // Se polling funciona, o app está saudável mesmo sem WebSocket
                    if (this.globalNetworkState === 'ERROR' || this.globalNetworkState === 'DISCONNECTED') {
                        this.setGlobalNetworkState(this.state.realtimeActive ? 'CONNECTED' : 'DEGRADED');
                    }
                    
                    // Notifica UI listeners para refresh (throttled)
                    this.orderChangeThrottle(() => {
                        this.orderChangeListeners.forEach(cb => {
                            try { cb({ eventType: 'POLL_SYNC', new: {} }); } catch (e) { /* silent */ }
                        });
                    });
                    
                    if (latency > 5000) {
                        console.warn(`[Polling] 🐢 Alta latência HTTP: ${latency}ms`);
                    }
                } else if (error) {
                    this.pollFailCount++;
                    if (this.pollFailCount >= 3) {
                        console.warn(`[Polling] ❌ 3 falhas consecutivas no HTTP Polling. Rede pode estar offline.`);
                        this.setGlobalNetworkState('ERROR');
                    }
                }
            } catch (e) {
                this.pollFailCount++;
                console.warn('[Polling] ❌ HTTP Poll exception:', (e as Error).message);
            }
        };

        // Salva referência do poll para poder forçar do lado de fora se necessário
        this.executePollRef = executePoll;

        // Execute first poll immediately
        executePoll();
        
        // Adaptive polling loop
        const scheduleNext = () => {
            if (this.primaryPollingTimer) clearTimeout(this.primaryPollingTimer as any);
            const interval = getPollingInterval();
            this.primaryPollingTimer = setTimeout(async () => {
                await executePoll();
                scheduleNext(); // Self-scheduling with adaptive interval
            }, interval) as any;
        };
        scheduleNext();
    }

    /** Mark user interaction for adaptive polling interval */
    public touchUserInteraction() {
        this.userLastInteractionAt = Date.now();
    }

    /**
     * Reconnection with exponential backoff.
     * Tears down existing channels and recreates them cleanly.
     */
    /**
     * CALM Reconnect (v4 — WebSocket is a bonus, not critical)
     * 
     * Max 3 attempts with long delays. If all fail, we just stop trying
     * and let the primary HTTP polling handle everything.
     * Next app wake or network handoff will try again.
     */
    /**
     * 📡 SAFE BROADCAST — Uses httpSend() explicitly instead of deprecated send() fallback.
     * Resolves: "Realtime send() is automatically falling back to REST API" warning.
     * If WebSocket is connected, uses WS push. Otherwise, uses httpSend() for REST delivery.
     */
    private async _safeBroadcast(channel: any, event: string, payload: any): Promise<void> {
        if (!channel) throw new Error('Channel is null');

        // Check if WebSocket transport can push (channelAdapter.canPush())
        const canPush = channel.channelAdapter?.canPush?.() 
            ?? channel.socket?.conn?.transport?.ws?.readyState === 1;

        if (canPush) {
            // WebSocket is alive — use native push (no deprecation warning)
            return channel.send({ type: 'broadcast', event, payload });
        }

        // WebSocket is NOT available — use httpSend() explicitly (REST delivery)
        return channel.httpSend(event, payload);
    }

    private scheduleRealtimeReconnect() {
        if (this.realtimeReconnectTimer || !this.state.initialized || this.isTearingDownRealtime) return;

        if (this.isReconnecting) {
            console.log('[Lifecycle] 🔒 WebSocket reconnect already in progress. Skipping.');
            return;
        }

        if (Date.now() < this.realtimeCooldownUntil) {
            console.log(`[Lifecycle] 📡 WebSocket in cooldown. Polling HTTP cobre dados.`);
            return;
        }

        if (this.realtimeReconnectAttempts >= REALTIME_RECONNECT_MAX_ATTEMPTS) {
            console.log(`[Lifecycle] 📡 WebSocket desistiu após ${REALTIME_RECONNECT_MAX_ATTEMPTS} tentativas. HTTP Polling continua cobrindo. Próxima tentativa ao acordar o app.`);
            this.realtimeCooldownUntil = Date.now() + 5 * 60_000; // 5min cooldown
            this.realtimeReconnectAttempts = 0;
            this.isReconnecting = false;
            return;
        }

        // Storm protection — max 2 resets per minute
        const now = Date.now();
        this.hardResetTimestamps = this.hardResetTimestamps.filter(t => now - t < 60_000);
        if (this.hardResetTimestamps.length >= this.MAX_HARD_RESETS_PER_MIN) {
            console.log(`[Lifecycle] 📡 WebSocket reconnect storm prevented. Polling HTTP continua.`);
            this.realtimeCooldownUntil = now + 2 * 60_000; // 2min cooldown
            this.isReconnecting = false;
            return;
        }
        this.hardResetTimestamps.push(now);

        // NÃO muda o estado global para RECONNECTING — polling está ativo!
        // Apenas loga que estamos tentando reconectar o bônus
        this.realtimeReconnectAttempts++;
        this.realtimeMetrics.sessionReconnects++;
        this.realtimeMetrics.totalHardResets++;

        // Long delays — WebSocket não é urgente
        const baseDelay = Math.min(
            REALTIME_RECONNECT_BASE_MS * Math.pow(2, this.realtimeReconnectAttempts - 1),
            REALTIME_RECONNECT_MAX_MS
        );
        const jitter = Math.floor(Math.random() * 3000);
        const finalDelay = baseDelay + jitter;

        console.log(`[Lifecycle] 📡 WebSocket reconnect #${this.realtimeReconnectAttempts}/${REALTIME_RECONNECT_MAX_ATTEMPTS} em ${Math.round(finalDelay/1000)}s (Polling HTTP ativo — sem pressa)`);

        try {
            this.realtimeReconnectTimer = setTimeout(async () => {
                this.realtimeReconnectTimer = null;
                if (!this.state.initialized) return;

                this.isReconnecting = true;
                try {
                    await this.teardownRealtime();
                    await this.setupRealtime();
                } catch (e) {
                    console.warn('[Lifecycle] 📡 WebSocket reconnect failed. Polling cobre:', (e as Error).message);
                } finally {
                    this.isReconnecting = false;
                }
            }, finalDelay);
        } catch (scheduleErr) {
            console.error('[Lifecycle] 🚨 Falha ao agendar reconnect WebSocket:', scheduleErr);
            this.isReconnecting = false;
        }
    }

    /**
     * Proactive realtime health check on foreground return.
     * If channels are stale, triggers reconnection.
     */
    private checkRealtimeHealth() {
        if (!this.state.realtimeActive && this.state.initialized) {
            // 5. Hardening do Lifecycle Mobile
            // Quando iOS/Android voltam pro foreground após uns segs o SDK interno tenta religar os canais nativamente.
            if (this.notificationChannel || this.ordersChannel) {
                console.log('[Lifecycle] 📡 Mobile foreground return: Channels exist in memory but inactive. Trusting SDK to auto-resume...');
                return; // Deixamos o timeout passivo/drop resolver.
            }

            console.log('[Lifecycle] 📡 Realtime entirely dead on foreground — attempting health recovery');
            this.scheduleRealtimeReconnect();
        } else if (this.state.realtimeActive && this.state.initialized) {
            // 📡 BIG TECH PATTERN: PING ATIVO AO ACORDAR DO FOREGROUND
            // Se o socket tá vivo na memória, não confiamos cegamente porque o OS bloqueia conexões inativas.
            console.log('[Lifecycle] 📡 Enviando PING ativo para validar se a conexão sobreviveu ao background...');
            try {
                if (this.ordersChannel) {
                    this._safeBroadcast(this.ordersChannel, 'wake_ping', { ts: Date.now() })
                    .then(() => console.log('[Lifecycle] 📡 PING de despertar concluído. Conexão firme.'))
                    .catch(() => {
                        console.warn('[Lifecycle] ⚠️ PING de despertar FALHOU. Conexão zumbi identificada. Destruindo...');
                        this.state.realtimeActive = false;
                        this.scheduleRealtimeReconnect();
                    });
                }
            } catch(e) {
                console.warn('[Lifecycle] ⚠️ Falha síncrona ao pingar no retorno do background. Forçando reconnect.');
                this.state.realtimeActive = false;
                this.scheduleRealtimeReconnect();
            }
        }
    }

    /**
     * Explicit per-channel teardown. Each channel is:
     * 1. Unsubscribed
     * 2. Removed from Supabase client (async)
     * 3. Nullified
     * 
     * Prevents orphaned WebSocket connections and phantom triggers.
     */
    private async teardownRealtime() {
        if (this.isTearingDownRealtime) return;
        this.isTearingDownRealtime = true;
        console.log('[Lifecycle] 🧹 Starting async realtime teardown...');

        if (this.realtimeReconnectTimer) {
            clearTimeout(this.realtimeReconnectTimer);
            this.realtimeReconnectTimer = null;
        }
        if (this.realtimeStabilityTimer) {
            clearTimeout(this.realtimeStabilityTimer);
            this.realtimeStabilityTimer = null;
        }

        const leavePromises: Promise<any>[] = [];

        if (this.notificationChannel) {
            leavePromises.push(supabase.removeChannel(this.notificationChannel).catch(e => console.warn('[Lifecycle] Ignore notify leave err:', e)));
            this.notificationChannel = null;
        }

        if (this.ordersChannel) {
            leavePromises.push(supabase.removeChannel(this.ordersChannel).catch(e => console.warn('[Lifecycle] Ignore orders leave err:', e)));
            this.ordersChannel = null;
        }

        if (leavePromises.length > 0) {
            try {
                // 2. Timeout de Segurança no Teardown (Protege contra travamento TCP Socket fantasma)
                await Promise.race([
                    Promise.all(leavePromises),
                    new Promise((resolve) => setTimeout(() => resolve('timeout'), 5000))
                ]).then((res) => {
                    if (res === 'timeout') console.warn('[Lifecycle] ⚠️ Teardown 5s timeout reached. Forcing internal GC clean.');
                });
            } catch (err) {
                console.error('[Lifecycle] Teardown execution failure:', err);
            }
        }

        this.state.realtimeActive = false;
        this.isTearingDownRealtime = false;
        console.log('[Lifecycle] ✅ Realtime async teardown complete.');
    }

    // ═══════════════════════════════════════════════════════════════════════
    // HIGH AVAILABILITY & OFFLINE-FIRST MECHANISMS
    // ═══════════════════════════════════════════════════════════════════════

    private lastNetworkFingerprint: string | null = null;

    /**
     * C3: Estado global de conectividade + Ajuste de Cooldown (C5) + Handoff Detection
     */
    private setupConnectivityListener() {
        if (this.netInfoSubscription) return;
        
        this.netInfoSubscription = NetInfo.addEventListener(state => {
            const wasOffline = this.state.isOffline;
            const isNowOffline = !(state.isConnected && state.isInternetReachable !== false);
            
            // 📡 BIG TECH MOBILE PATTERN: CGNAT & IPv4/IPv6 Handoff Detection
            // O IP ou tipo de rede mudou (ex: WiFi -> 4G -> 3G)? 
            // Uma mudança silenciosa de NAT quebra a tabela de roteamento da Claro etc. 
            // O TCP Socket interno acha que tá vivo, mas os pacotes vão pro limbo.
            const currentFingerprint = `${state.type}-${(state.details as any)?.ipAddress || 'no-ip'}-${(state.details as any)?.cellularGeneration || 'no-gen'}`;
            const isHandoff = !isNowOffline && this.lastNetworkFingerprint !== null && this.lastNetworkFingerprint !== currentFingerprint;
            this.lastNetworkFingerprint = currentFingerprint;

            if (wasOffline !== isNowOffline || isHandoff) {
                this.state.isOffline = isNowOffline;
                console.log(`[Lifecycle] 🌐 Connectivity changed: ${isNowOffline ? 'OFFLINE' : 'ONLINE'} (Handoff: ${isHandoff})`);
                
                if (!isNowOffline) {
                    // Rede voltou — polling primário vai retomar automaticamente
                    this.realtimeCooldownUntil = 0;
                    this.flushOfflineQueue();
                    
                    // Reconectar WebSocket calmamente (é bônus)
                    if (isHandoff || (!this.state.realtimeActive && this.state.initialized)) {
                        console.log(`[Lifecycle] 📡 Network restored/handoff (${currentFingerprint}). Reconectando WebSocket em background...`);
                        this.state.realtimeActive = false;
                        // Delay de 3s para dar tempo à rede estabilizar
                        setTimeout(() => this.scheduleRealtimeReconnect(), 3000);
                    }
                    
                    // Restart polling if it was stopped
                    if (!this.primaryPollingTimer) {
                        this.startPrimaryPolling();
                    }
                } else {
                    this.setGlobalNetworkState('DISCONNECTED');
                }
            }
        });
    }

    /**
     * C1: Fallback progressivo de polling inteligente e adaptativo
     */
    /**
     * Legacy fallback polling — now a no-op since primary polling handles everything.
     * Kept for interface compatibility.
     */
    private managePollingFallback() {
        // Primary polling is always active — no need for a fallback.
        // Just ensure state reflects reality.
        if (!this.state.isOffline && !this.state.realtimeActive) {
            if (this.pollFailCount < 3) {
                this.setGlobalNetworkState('DEGRADED');
            }
        }
    }

    /**
     * C2: Fila Offline com Persistência
     */
    private async loadOfflineQueue() {
        try {
            const stored = await AsyncStorage.getItem(this.OFFLINE_QUEUE_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // 2. Versionamento da estrutura da fila offline
                if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].schemaVersion !== this.QUEUE_SCHEMA_VERSION) {
                    console.warn(`[Lifecycle] ⚠️ Offline queue schema mismatch (Old ver). Purging cache for integrity.`);
                    this.offlineQueue = [];
                    await this.persistOfflineQueue();
                    return;
                }
                this.offlineQueue = parsed;
                console.log(`[Lifecycle] 📦 Offline queue restored from disk: ${this.offlineQueue.length} items`);
            }
        } catch (e) {
            console.warn('[Lifecycle] ❌ Failed to load offline queue mapping.');
        }
    }

    private async persistOfflineQueue() {
        try {
            await AsyncStorage.setItem(this.OFFLINE_QUEUE_STORAGE_KEY, JSON.stringify(this.offlineQueue));
        } catch (e) {
            console.warn('[Lifecycle] ❌ Failed to persist offline queue mapping.');
        }
    }

    /**
     * Fila Offline para Mutação Posterior (Sync) c/ Idempotência
     */
    public async queueOfflineAction(action: string, payload: any, dedupeKey?: string, resolutionPolicy: 'last-write-wins'|'merge' = 'last-write-wins') {
        if (dedupeKey) {
            const exists = this.offlineQueue.some(item => item.dedupeKey === dedupeKey);
            if (exists) {
                console.log(`[Lifecycle] 📦 Idempotency hit: Action [${action}] and key [${dedupeKey}] already queued. Ignoring.`);
                return;
            }
        }
        
        // 1. Garantia Idempotência Backend
        const operationId = `op-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        const id = Math.random().toString(36).substring(7);
        const timestamp = Date.now();

        this.offlineQueue.push({ 
             id, 
             operationId, 
             action, 
             payload, 
             dedupeKey, 
             timestamp,
             schemaVersion: this.QUEUE_SCHEMA_VERSION,
             resolutionPolicy 
        });

        console.log(`[Lifecycle] 📦 Offline action queued: [${action}] | OpId: ${operationId} | Size: ${this.offlineQueue.length}`);
        await this.persistOfflineQueue();
    }

    private async flushOfflineQueue() {
        if (this.offlineQueue.length === 0 || this.state.isOffline) return;

        console.log(`[Lifecycle] 🚀 Flushing ${this.offlineQueue.length} offline queue actions in batches...`);
        // 3. Garantia de ordenação correta na execução (Sempre do mais velho para o mais novo)
        const queueCopy = [...this.offlineQueue].sort((a, b) => a.timestamp - b.timestamp);
        this.offlineQueue = [];
        await this.persistOfflineQueue();

        const BATCH_SIZE = 5;
        let successCount = 0;
        let failedQueue = [];

        for (let i = 0; i < queueCopy.length; i += BATCH_SIZE) {
            const batch = queueCopy.slice(i, i + BATCH_SIZE);
            
            const results = await Promise.allSettled(batch.map(async (item) => {
                // Roteador semântico de processamento real deve ser injetado aqui via event bus
                if (item.action === 'CLEANUP_ORPHAN_FILE' && item.payload?.publicUrl) {
                    const { OrderService } = require('./order-service');
                    console.log(`[Lifecycle] 🗑️ Processando limpeza de arquivo órfão offline: ${item.payload.publicUrl}`);
                    const ok = await OrderService.deleteFileExact(item.payload.publicUrl);
                    if (!ok) throw new Error('Falha contínua ao limpar arquivo órfão no Storage.');
                }

                console.log(`[Lifecycle] ✅ Processed offline action: ${item.action}`);
                return item;
            }));

            // Filter failures
            results.forEach((res, index) => {
                 if (res.status === 'rejected') failedQueue.push(batch[index]);
                 else successCount++;
            });

            // Avoid burst Network Storms
            if (i + BATCH_SIZE < queueCopy.length) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }

        if (failedQueue.length > 0) {
            this.offlineQueue = [...failedQueue, ...this.offlineQueue]; // Prepend back
            await this.persistOfflineQueue();
            console.warn(`[Lifecycle] ❌ Failed to dispatch ${failedQueue.length} items. Re-queued.`);
        }
        
        console.log(`[Lifecycle] ✅ Offline queue flush finished. Successfully synced: ${successCount}.`);
        if (successCount > 0) this.submitTelemetry();
    }

    /**
     * C4: Telemetria Exportável
     */
    public exportHealthMetrics() {
        const now = Date.now();
        // Accumulate live time for currently active states
        const liveConnectedMs = (this.globalNetworkState === 'CONNECTED' && this.realtimeMetrics._connectedEnteredAt > 0)
            ? now - this.realtimeMetrics._connectedEnteredAt : 0;
        const liveIdleMs = (this.globalNetworkState === 'CONNECTED_IDLE' && this.realtimeMetrics._idleEnteredAt > 0)
            ? now - this.realtimeMetrics._idleEnteredAt : 0;

        const payload = {
            timestamp: new Date().toISOString(),
            connectivity: {
                isOffline: this.state.isOffline,
                realtimeActive: this.state.realtimeActive,
                gpsHealthy: this.state.gpsHealthy,
                currentState: this.globalNetworkState,
            },
            telemetry: {
                connectionHealth: this.realtimeMetrics.connectionHealth,
                sessionReconnects: this.realtimeMetrics.sessionReconnects,
                totalHardResets: this.realtimeMetrics.totalHardResets,
                consecutiveFailures: this.realtimeMetrics.consecutiveFailures,
                idleTransitions: this.realtimeMetrics.idleTransitions,
                avgTimeToFirstDataMs: Math.round(this.realtimeMetrics.avgTimeToFirstDataMs),
                uptimeTotalMs: this.realtimeMetrics.totalUptimeMs +
                    (this.realtimeMetrics.lastConnectTime > 0 ? (now - this.realtimeMetrics.lastConnectTime) : 0),
                totalTimeConnectedMs: this.realtimeMetrics.totalTimeConnectedMs + liveConnectedMs,
                totalTimeIdleMs: this.realtimeMetrics.totalTimeIdleMs + liveIdleMs,
            },
            queue: {
                pendingActions: this.offlineQueue.length
            },
            app: {
                state: this.state.appState
            }
        };
        return payload;
    }

    /**
     * Submissão Automática H.A.
     */
    public submitTelemetry() {
         const data = this.exportHealthMetrics();
         console.log('[Lifecycle] 📊 Submitting Auto-Telemetry Payload:', JSON.stringify(data));
         // ex: DatadogClient.send("Lifecycle", data);
    }
}

// ─── Export Singleton ─────────────────────────────────────────────────────────
export const appLifecycle = new AppLifecycleManager();
