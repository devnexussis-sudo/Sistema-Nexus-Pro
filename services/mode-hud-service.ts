/**
 * 🎛️ Mode HUD Service — Gerenciador de Feedback do Modo Online/Offline
 *
 * Padrão Big Tech: Ao invés de travar ou exibir mensagens espremidas dentro
 * do botão no header, emite eventos para um HUD flutuante moderno na tela,
 * que acompanha o processo passo-a-passo e já exibe o resultado do modo ativado.
 */

export type ModeHUDType = 'online' | 'offline';
export type ModeHUDStatus = 'progress' | 'success' | 'error';

export interface ModeHUDState {
    visible: boolean;
    type: ModeHUDType;
    status: ModeHUDStatus;
    title: string;
    subtitle: string;
    progress?: number; // 0 a 1
    actionLabel?: string;
    onAction?: () => void;
}

type ModeHUDListener = (state: ModeHUDState) => void;

class ModeHUDService {
    private listeners: Set<ModeHUDListener> = new Set();
    private state: ModeHUDState = {
        visible: false,
        type: 'online',
        status: 'progress',
        title: '',
        subtitle: '',
    };
    private autoDismissTimer: ReturnType<typeof setTimeout> | null = null;

    subscribe(listener: ModeHUDListener): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        this.listeners.forEach(cb => {
            try { cb(this.state); } catch (e) { console.error('[ModeHUD] Listener error:', e); }
        });
    }

    show(config: {
        type: ModeHUDType;
        status?: ModeHUDStatus;
        title: string;
        subtitle: string;
        progress?: number;
        actionLabel?: string;
        onAction?: () => void;
        autoDismissMs?: number;
    }): void {
        if (this.autoDismissTimer) {
            clearTimeout(this.autoDismissTimer);
            this.autoDismissTimer = null;
        }

        const status = config.status || 'progress';

        this.state = {
            visible: true,
            type: config.type,
            status,
            title: config.title,
            subtitle: config.subtitle,
            progress: config.progress,
            actionLabel: config.actionLabel,
            onAction: config.onAction,
        };
        this.notify();

        if (status === 'success' || config.autoDismissMs) {
            const delay = config.autoDismissMs || (status === 'success' ? 3500 : 5000);
            this.autoDismissTimer = setTimeout(() => {
                this.dismiss();
            }, delay);
        }
    }

    update(config: Partial<Omit<ModeHUDState, 'visible'>>): void {
        if (!this.state.visible) return;

        this.state = {
            ...this.state,
            ...config,
        };
        this.notify();

        if (config.status === 'success') {
            if (this.autoDismissTimer) clearTimeout(this.autoDismissTimer);
            this.autoDismissTimer = setTimeout(() => {
                this.dismiss();
            }, 3500);
        }
    }

    dismiss(): void {
        if (this.autoDismissTimer) {
            clearTimeout(this.autoDismissTimer);
            this.autoDismissTimer = null;
        }
        this.state = {
            ...this.state,
            visible: false,
        };
        this.notify();
    }

    getState(): ModeHUDState {
        return this.state;
    }
}

export const modeHUDService = new ModeHUDService();
