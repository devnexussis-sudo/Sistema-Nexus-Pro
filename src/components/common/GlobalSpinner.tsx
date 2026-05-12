import React, { useEffect, useRef, useCallback } from 'react';

/**
 * 🚀 NexusProgressBar — Big Tech Navigation Progress Indicator
 * 
 * Inspired by YouTube, GitHub, and Next.js NProgress.
 * 
 * KEY DESIGN DECISIONS (Senior Engineer Standards):
 * ─────────────────────────────────────────────────
 * 1. Pure CSS animations — ZERO React state changes during progress.
 *    React re-renders cause jank. CSS transforms are GPU-accelerated.
 * 
 * 2. Only shows for USER-INITIATED actions (navigation, form submits).
 *    Background fetches (cache revalidation, realtime heartbeats) are SILENT.
 *    This is the #1 difference from amateur implementations.
 * 
 * 3. Debounced start — won't show for fetches that resolve in <400ms.
 *    Most cached data loads in <100ms. Users should never see the bar
 *    unless something genuinely takes time.
 * 
 * 4. Uses a single DOM element manipulated via refs (no re-renders).
 */

// Threshold: only show progress bar if fetch takes longer than this
const SHOW_DELAY_MS = 400;
// Minimum time the bar stays visible once shown (prevents flash)
const MIN_VISIBLE_MS = 600;
// Ignore fetch URLs containing these patterns (background noise)
const IGNORE_PATTERNS = [
    'realtime', 'heartbeat', 'websocket', 'supabase.co/realtime',
    'supabase.co/auth/v1/token', '/rest/v1/', 'googleapis.com',
    'functions/v1/'
];

export const GlobalSpinnerProvider: React.FC = () => {
    const barRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const activeFetches = useRef(0);
    const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const shownAt = useRef(0);
    const isVisible = useRef(false);

    const showBar = useCallback(() => {
        if (isVisible.current) return;
        isVisible.current = true;
        shownAt.current = Date.now();
        
        const container = containerRef.current;
        const bar = barRef.current;
        if (!container || !bar) return;

        // Reset bar to start
        bar.style.transition = 'none';
        bar.style.transform = 'scaleX(0)';
        bar.style.opacity = '1';
        container.style.opacity = '1';

        // Force reflow then animate to 80%
        bar.offsetHeight; // eslint-disable-line
        bar.style.transition = 'transform 8s cubic-bezier(0.1, 0.5, 0.3, 1)';
        bar.style.transform = 'scaleX(0.8)';
    }, []);

    const hideBar = useCallback(() => {
        if (!isVisible.current) return;
        
        const bar = barRef.current;
        const container = containerRef.current;
        if (!bar || !container) return;

        // Animate to 100% quickly
        bar.style.transition = 'transform 200ms ease-out';
        bar.style.transform = 'scaleX(1)';

        // Then fade out
        setTimeout(() => {
            container.style.opacity = '0';
            isVisible.current = false;
        }, 250);
    }, []);

    useEffect(() => {
        const originalFetch = window.fetch;

        window.fetch = function (...args: Parameters<typeof fetch>) {
            const url = typeof args[0] === 'string' ? args[0] : 
                        args[0] instanceof Request ? args[0].url : '';
            
            // Skip background/noise fetches entirely
            const isBackground = IGNORE_PATTERNS.some(p => url.includes(p));
            if (isBackground) {
                return originalFetch.apply(this, args);
            }

            activeFetches.current++;

            // Only schedule showing the bar if this is the first meaningful fetch
            if (activeFetches.current === 1) {
                // Clear any pending hide
                if (hideTimer.current) {
                    clearTimeout(hideTimer.current);
                    hideTimer.current = null;
                }
                // Debounce: only show if still fetching after SHOW_DELAY_MS
                showTimer.current = setTimeout(() => {
                    if (activeFetches.current > 0) {
                        showBar();
                    }
                }, SHOW_DELAY_MS);
            }

            return originalFetch.apply(this, args).then(
                (response) => {
                    decrementAndMaybeHide();
                    return response;
                },
                (error) => {
                    decrementAndMaybeHide();
                    throw error;
                }
            );
        };

        function decrementAndMaybeHide() {
            activeFetches.current = Math.max(0, activeFetches.current - 1);
            
            if (activeFetches.current === 0) {
                // Cancel pending show if fetch resolved before debounce
                if (showTimer.current) {
                    clearTimeout(showTimer.current);
                    showTimer.current = null;
                }

                if (isVisible.current) {
                    // Ensure minimum visible time to prevent flash
                    const elapsed = Date.now() - shownAt.current;
                    const remaining = Math.max(0, MIN_VISIBLE_MS - elapsed);
                    
                    hideTimer.current = setTimeout(() => {
                        hideBar();
                    }, remaining);
                }
            }
        }

        return () => {
            window.fetch = originalFetch;
            if (showTimer.current) clearTimeout(showTimer.current);
            if (hideTimer.current) clearTimeout(hideTimer.current);
        };
    }, [showBar, hideBar]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 99999,
                pointerEvents: 'none',
                opacity: 0,
                transition: 'opacity 300ms ease',
                height: '3px',
            }}
        >
            <div
                ref={barRef}
                style={{
                    height: '100%',
                    width: '100%',
                    transformOrigin: 'left',
                    transform: 'scaleX(0)',
                    background: 'linear-gradient(90deg, #3b82f6, #6366f1, #8b5cf6)',
                    boxShadow: '0 0 8px rgba(99, 102, 241, 0.4), 0 0 2px rgba(99, 102, 241, 0.2)',
                    borderRadius: '0 2px 2px 0',
                }}
            />
        </div>
    );
};
