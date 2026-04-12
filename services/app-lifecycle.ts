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
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

// ─── Realtime Reconnection Config ────────────────────────────────────────────
const REALTIME_RECONNECT_BASE_MS = 2_000;    // 2s initial delay
const REALTIME_RECONNECT_MAX_MS = 60_000;    // 60s max delay
const REALTIME_RECONNECT_MAX_ATTEMPTS = 10;  // Give up after 10 attempts

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
    private healthPingTimer: ReturnType<typeof setInterval> | null = null;
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
    };

    // ── UI callbacks registered by components ──
    private orderChangeListeners: Set<RealtimeCallback> = new Set();

    // ── AppState subscription ──
    private appStateSubscription: ReturnType<typeof AppState.addEventListener> | null = null;

    // ── Notification subscriptions (moved from _layout.tsx) ──
    private notificationReceivedSub: any = null;
    private notificationResponseSub: any = null;
    private notificationResponseHandler: ((orderId: string) => void) | null = null;

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

            // 7. Setup realtime channels (singleton, with reconnection)
            await this.setupRealtime();

            // 8. High Availability Connectivity Listener + Health Check
            await this.loadOfflineQueue();
            this.setupConnectivityListener();
            this.startActiveHealthCheck();

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
        if (this.healthPingTimer) clearInterval(this.healthPingTimer);
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
        this.gpsRecoveryAttempts = 0;
        this.realtimeReconnectAttempts = 0;
        this.realtimeCooldownUntil = 0;
        this.realtimeMetrics = { sessionReconnects: 0, consecutiveFailures: 0, totalUptimeMs: 0, lastConnectTime: 0 };

        console.log('[Lifecycle] ✅ Lifecycle destroyed — zero resources remaining');
    }

    /**
     * Register a handler for notification taps (deep linking to OS).
     * Called by _layout.tsx so the router can handle navigation.
     */
    setNotificationResponseHandler(handler: (orderId: string) => void) {
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
     * Get current lifecycle state (for observability/debugging).
     */
    getState(): Readonly<LifecycleState> {
        return { ...this.state };
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

            // Only act on background → active transition
            if (prevState.match(/inactive|background/) && nextState === 'active') {
                console.log('[Lifecycle] 💓 App returned to foreground');

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

                // Check realtime health on foreground return
                this.checkRealtimeHealth();
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
                        const notif = payload.new;
                        NotificationService.triggerLocalNotification(
                            '📋 Nova Notificação',
                            notif.title || `OS #${notif.order_id}`,
                            { orderId: notif.order_id }
                        );
                    }
                )
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
                        console.log('[Lifecycle] 🔄 Order change:', payload.eventType);

                        // Throttled dispatch to all listeners
                        this.orderChangeThrottle(() => {
                            this.orderChangeListeners.forEach(cb => {
                                try { cb(payload); } catch (e) { /* silent */ }
                            });
                        });

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
                .subscribe((status: string, err?: Error) => {
                    console.log(`[Lifecycle] 📡 Orders channel: ${status}`);
                    this.handleChannelStatus('orders', status, err);
                });

            this.state.realtimeActive = true;
            console.log('[Lifecycle] 📡 Realtime channels established (awaiting stability)');

        } catch (error) {
            console.error('[Lifecycle] ❌ Realtime setup failed:', error);
            this.scheduleRealtimeReconnect();
        }
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
            
            // Atualiza métricas 
            this.realtimeMetrics.lastConnectTime = Date.now();
            this.realtimeMetrics.consecutiveFailures = 0;
            if (this.pollingTimer) clearInterval(this.pollingTimer);

            if (this.realtimeStabilityTimer) clearTimeout(this.realtimeStabilityTimer);
            this.realtimeStabilityTimer = setTimeout(() => {
                console.log(`[Lifecycle] 📡 Realtime estável por 15s. Resetting reconnect backoff.`);
                this.realtimeReconnectAttempts = 0;
            }, 15000);
            return;
        }

        if (status === 'TIMED_OUT' || status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            const reason = err?.message || 'unknown';
            console.warn(`[Lifecycle] ⚠️ Channel "${channelName}" dropped: ${status} (Reason: ${reason})`);
            
            // Coleta de métricas (Uptime e falhas consecutivas)
            if (this.realtimeMetrics.lastConnectTime > 0) {
                this.realtimeMetrics.totalUptimeMs += (Date.now() - this.realtimeMetrics.lastConnectTime);
                this.realtimeMetrics.lastConnectTime = 0;
            }
            this.realtimeMetrics.consecutiveFailures++;

            // Mark as inactive and schedule reconnect
            this.state.realtimeActive = false;
            this.scheduleRealtimeReconnect();
            this.managePollingFallback(); // Engata polling enquanto rede flutua
        }
    }

    /**
     * Reconnection with exponential backoff.
     * Tears down existing channels and recreates them cleanly.
     */
    private scheduleRealtimeReconnect() {
        if (this.realtimeReconnectTimer || !this.state.initialized || this.isTearingDownRealtime) return;

        // 1. Implementar Lock de Reconexão (Controle de Concorrência)
        if (this.isReconnecting) {
            console.log('[Lifecycle] 🔒 Reconnect already in progress. Ignoring duplicate trigger.');
            return;
        }

        // 6. Fail-safe adicional: Pausa caso exceda limites extremos contínuos
        if (Date.now() < this.realtimeCooldownUntil) {
            console.warn(`[Lifecycle] 🛑 Realtime in cooldown until ${new Date(this.realtimeCooldownUntil).toLocaleTimeString()}. Paused.`);
            return;
        }

        if (this.realtimeReconnectAttempts >= REALTIME_RECONNECT_MAX_ATTEMPTS) {
            console.error(`[Lifecycle] ❌ Realtime reconnect exhausted (${REALTIME_RECONNECT_MAX_ATTEMPTS} attempts). Engaging 60s fail-safe wait.`);
            this.realtimeCooldownUntil = Date.now() + 60_000;
            this.realtimeReconnectAttempts = 0; // reset for next cycle
            this.isReconnecting = false;
            return;
        }

        this.realtimeReconnectAttempts++;
        this.realtimeMetrics.sessionReconnects++;

        const delay = Math.min(
            REALTIME_RECONNECT_BASE_MS * Math.pow(2, this.realtimeReconnectAttempts - 1),
            REALTIME_RECONNECT_MAX_MS
        );

        console.log(`[Lifecycle] 🔄 Realtime reconnect #${this.realtimeReconnectAttempts} scheduling in ${Math.round(delay / 1000)}s`);

        this.realtimeReconnectTimer = setTimeout(async () => {
            this.realtimeReconnectTimer = null;
            if (!this.state.initialized) return;

            this.isReconnecting = true; // Lock the execution
            try {
                // Enforce sequential teardown -> recreate race condition mitigation
                await this.teardownRealtime();
                await this.setupRealtime();
            } catch (e) {
                console.error('[Lifecycle] ❌ Reconnect flow failed violently:', e);
            } finally {
                this.isReconnecting = false; // Release lock even if it crashed
            }
        }, delay);
    }

    /**
     * Proactive realtime health check on foreground return.
     * If channels are stale, triggers reconnection.
     */
    private checkRealtimeHealth() {
        if (!this.state.realtimeActive && this.state.initialized) {
            // 5. Hardening do Lifecycle Mobile
            // Quando iOS/Android voltam pro foreground após uns segs o SDK interno tenta religar os canais nativamente.
            // Não devemos agredir com teardown instintivo se já houver estrutura na memórica. Apenas monitorar.
            if (this.notificationChannel || this.ordersChannel) {
                console.log('[Lifecycle] 📡 Mobile foreground return: Channels exist in memory but inactive. Trusting SDK to auto-resume...');
                return; // Deixamos o timeout passivo/drop resolver, não entramos matando.
            }

            console.log('[Lifecycle] 📡 Realtime entirely dead on foreground — attempting health recovery');
            this.scheduleRealtimeReconnect();
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

    /**
     * C3: Estado global de conectividade + Ajuste de Cooldown (C5)
     */
    private setupConnectivityListener() {
        if (this.netInfoSubscription) return;
        
        this.netInfoSubscription = NetInfo.addEventListener(state => {
            const wasOffline = this.state.isOffline;
            const isNowOffline = !(state.isConnected && state.isInternetReachable !== false);
            
            if (wasOffline !== isNowOffline) {
                this.state.isOffline = isNowOffline;
                console.log(`[Lifecycle] 🌐 Connectivity changed: ${isNowOffline ? 'OFFLINE' : 'ONLINE'}`);
                
                if (!isNowOffline) {
                    // C5: Rede voltou - Bypass total no cooldown, permitimos religadura brutal
                    this.realtimeCooldownUntil = 0; 
                    this.flushOfflineQueue();
                    
                    if (!this.state.realtimeActive && this.state.initialized) {
                        console.log('[Lifecycle] 📡 Network restored violently. Triggering instant realtime recovery.');
                        this.scheduleRealtimeReconnect();
                    }
                } else {
                    this.managePollingFallback();
                }
            }
        });
    }

    /**
     * C1: Fallback progressivo de polling inteligente e adaptativo
     */
    private managePollingFallback() {
        if (this.pollingTimer) {
            clearTimeout(this.pollingTimer);
            this.pollingTimer = null;
        }
        
        if (!this.state.isOffline && !this.state.realtimeActive) {
            console.log('[Lifecycle] 🔄 Activating HTTP Polling Fallback (Realtime indisponível)...');
            this.pollingAttempts = 0;
            this.scheduleNextPoll();
        }
    }

    private scheduleNextPoll() {
        if (this.state.realtimeActive || this.state.isOffline) return;

        this.pollingAttempts++;
        // Progresso lento exponencial (máx 120s)
        const interval = Math.min(10000 * Math.pow(2, this.pollingAttempts - 1), 120000);

        this.pollingTimer = setTimeout(async () => {
            if (this.state.realtimeActive || this.state.isOffline) return;

            try {
                // C4: Estratégia contra colisões - Respeitamos `lastDataSyncTime` (updated_at)
                // Se realtime voltar abruptamente no meio deste request, ignoraremos a resposta se o Socket mandou algo mais fresco.
                const currentSyncMark = Date.now();
                console.log(`[Lifecycle] 🔄 Executing backend adaptive poll (Delay: ${interval/1000}s)...`);
                
                const { data, error } = await supabase
                    .from('orders')
                    .select('id, updated_at')
                    .order('updated_at', { ascending: false })
                    .limit(1);

                if (!error) {
                    if (currentSyncMark > this.lastDataSyncTime) {
                        this.lastDataSyncTime = currentSyncMark;
                        console.log('[Lifecycle] 🔄 Poll reached DB securely without chronological overlap.');
                    } else {
                        console.log('[Lifecycle] ⚠️ Poll response discarded. Realtime socket already provided fresher data.');
                    }
                }
            } catch (e) {
                console.warn('[Lifecycle] 🔄 Poll failure block. End-node unreachable.');
            }
             
            this.scheduleNextPoll();
        }, interval) as any;
    }

    /**
     * C6: Health Check ativo (Inteligente)
     */
    private startActiveHealthCheck() {
        if (this.healthPingTimer) clearInterval(this.healthPingTimer);

        this.healthPingTimer = setInterval(async () => {
             // Só fazer ping se a tela estiver aberta e não estamos intencionalmente offline. 
             if (this.state.isOffline || !this.state.userId || this.state.appState !== 'active') return;

             try {
                 const start = Date.now();
                 // "Ping" super leve no node Postgres
                 await supabase.from('orders').select('id', { count: 'exact', head: true });
                 const lat = Date.now() - start;

                 if (lat > 5000) {
                     console.warn(`[Lifecycle] 🐢 Extremely high DB Gateway latency: ${lat}ms`);
                 }
             } catch (err) {
                 console.warn(`[Lifecycle] ❌ Active health ping failed. Dropping active illusion.`);
                 if (this.state.realtimeActive) {
                     this.state.realtimeActive = false;
                     this.scheduleRealtimeReconnect();
                 }
             }
        }, 60_000);
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
        const payload = {
            timestamp: new Date().toISOString(),
            connectivity: {
                isOffline: this.state.isOffline,
                realtimeActive: this.state.realtimeActive,
                gpsHealthy: this.state.gpsHealthy,
            },
            telemetry: {
                ...this.realtimeMetrics,
                uptimeTotalMs: this.realtimeMetrics.totalUptimeMs + 
                    (this.realtimeMetrics.lastConnectTime > 0 ? (Date.now() - this.realtimeMetrics.lastConnectTime) : 0),
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
