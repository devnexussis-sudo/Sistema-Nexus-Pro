import { supabase } from './supabase';

const MAX_IDLE_MS = 12 * 60 * 60 * 1000; // 12 horas

let idleTimer: ReturnType<typeof setTimeout> | null = null;

export function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);

    idleTimer = setTimeout(() => {
        supabase.auth.signOut().then(() => {
            alert('Sessão encerrada por inatividade (12h).');
            window.location.reload();
        });
    }, MAX_IDLE_MS);
}

// Inicializa os listeners para resetar o timer ao haver interação.
// Essa lógica rodará de forma global no frontend.
if (typeof window !== 'undefined') {
    ['click', 'keydown', 'mousemove', 'touchstart'].forEach((ev) =>
        window.addEventListener(ev, resetIdleTimer, { passive: true })
    );

    // Começa a contar
    resetIdleTimer();
}
