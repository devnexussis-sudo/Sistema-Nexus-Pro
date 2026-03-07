/**
 * 🎨 Nexus Design System - Order Status Colors
 * 
 * Sistema centralizado de cores para status de Ordens de Serviço
 * Garante consistência visual em toda a aplicação
 * 
 * @example
 * import { getStatusColor, getStatusBadge } from '@/lib/statusColors';
 * 
 * const badgeClass = getStatusBadge(OrderStatus.IN_PROGRESS);
 * const colorConfig = getStatusColor(OrderStatus.COMPLETED);
 */

import { OrderStatus } from '../types';

/**
 * Configuração completa de cores por status
 */
export interface StatusColorConfig {
    bg: string;          // Classe background
    text: string;        // Classe de texto
    border: string;      // Classe de borda
    icon: string;        // Cor do ícone
    label: string;       // Label em português
    hex: string;         // Cor hexadecimal principal
}

/**
 * 🎨 Paleta de Cores por Status (Design System)
 */
export const STATUS_COLORS: Record<OrderStatus, StatusColorConfig> = {
    [OrderStatus.PENDING]: {
        bg: 'bg-slate-50',
        text: 'text-slate-700',
        border: 'border-slate-200',
        icon: 'text-slate-500',
        label: 'Pendente',
        hex: '#64748b'
    },
    [OrderStatus.ASSIGNED]: {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        icon: 'text-blue-500',
        label: 'Atribuído',
        hex: '#3b82f6'
    },
    [OrderStatus.TRAVELING]: {
        bg: 'bg-indigo-50',
        text: 'text-indigo-700',
        border: 'border-indigo-200',
        icon: 'text-indigo-500',
        label: 'Em Deslocamento',
        hex: '#6366f1'
    },

    [OrderStatus.IN_PROGRESS]: {
        bg: 'bg-amber-50',
        text: 'text-amber-700',
        border: 'border-amber-200',
        icon: 'text-amber-500',
        label: 'Em Andamento',
        hex: '#f59e0b'
    },

    [OrderStatus.COMPLETED]: {
        bg: 'bg-emerald-50',
        text: 'text-emerald-700',
        border: 'border-emerald-200',
        icon: 'text-emerald-500',
        label: 'Concluído',
        hex: '#10b981'
    },
    [OrderStatus.CANCELED]: {
        bg: 'bg-gray-50',
        text: 'text-gray-700',
        border: 'border-gray-300',
        icon: 'text-gray-500',
        label: 'Cancelado',
        hex: '#6b7280'
    },
    [OrderStatus.BLOCKED]: {
        bg: 'bg-rose-50',
        text: 'text-rose-700',
        border: 'border-rose-200',
        icon: 'text-rose-500',
        label: 'Impedido',
        hex: '#f43f5e'
    }
};

/**
 * Retorna a configuração completa de cores para um status
 */
export function getStatusColor(status: OrderStatus): StatusColorConfig {
    return STATUS_COLORS[status] || STATUS_COLORS[OrderStatus.PENDING];
}

/**
 * Retorna as classes CSS combinadas para um badge de status
 * @example getStatusBadge(OrderStatus.IN_PROGRESS) 
 * => "bg-amber-50 text-amber-700 border border-amber-200"
 */
export function getStatusBadge(status: OrderStatus, withBorder: boolean = true): string {
    const config = getStatusColor(status);
    return withBorder
        ? `${config.bg} ${config.text} border ${config.border}`
        : `${config.bg} ${config.text}`;
}

/**
 * Retorna apenas a classe de cor do texto
 */
export function getStatusTextColor(status: OrderStatus): string {
    return getStatusColor(status).text;
}

/**
 * Retorna apenas a classe de background
 */
export function getStatusBgColor(status: OrderStatus): string {
    return getStatusColor(status).bg;
}

/**
 * Retorna o label traduzido do status
 */
export function getStatusLabel(status: OrderStatus): string {
    return getStatusColor(status).label;
}

/**
 * Retorna a cor hexadecimal do status (útil para gráficos)
 */
export function getStatusHex(status: OrderStatus): string {
    return getStatusColor(status).hex;
}

/**
 * 📅 CALENDAR-SPECIFIC STYLES
 * Retorna estilos vibrantes e de alto contraste para visualização no calendário
 * Cores mais saturadas e visíveis para se destacarem no layout do calendário
 */
export function getStatusCalendarStyle(status: OrderStatus): string {
    switch (status) {
        case OrderStatus.COMPLETED:
            return 'bg-emerald-600 text-white border-2 border-emerald-700 shadow-emerald-500/30';

        case OrderStatus.IN_PROGRESS:
            return 'bg-amber-500 text-white border-2 border-amber-600 shadow-amber-500/30';

        case OrderStatus.ASSIGNED:
            // CHANGED: Azul vibrante em vez de primary (que se funde com o calendário)
            return 'bg-sky-500 text-white border-2 border-sky-600 shadow-sky-500/30';

        case OrderStatus.TRAVELING:
            return 'bg-indigo-500 text-white border-2 border-indigo-600 shadow-indigo-500/30';

        case OrderStatus.PENDING:
            return 'bg-slate-400 text-white border-2 border-slate-500 shadow-slate-500/30';

        case OrderStatus.CANCELED:
            return 'bg-gray-500 text-white border-2 border-gray-600 shadow-gray-500/30';

        case OrderStatus.BLOCKED:
            return 'bg-rose-600 text-white border-2 border-rose-700 shadow-rose-500/30';

        default:
            return 'bg-sky-500 text-white border-2 border-sky-600 shadow-sky-500/30';
    }
}

/**
 * Componente React pronto para uso
 * @example <StatusBadge status={OrderStatus.COMPLETED} />
 */
export const StatusBadge: React.FC<{
    status: OrderStatus;
    className?: string;
    showIcon?: boolean;
}> = ({ status, className = '', showIcon = false }) => {
    const config = getStatusColor(status);

    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wide ${getStatusBadge(status)} ${className}`}>
            {showIcon && <span className={`w-1.5 h-1.5 rounded-full ${config.bg.replace('bg-', 'bg-')}`} />}
            {config.label}
        </span>
    );
};

