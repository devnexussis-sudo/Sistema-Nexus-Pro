/**
 * 🔄 Nexus VisitStateMachine
 *
 * Single Source of Truth para transições de status de Visitas.
 * Garante que nenhuma transição inválida ocorra — nem no frontend,
 * nem no service layer.
 *
 * Princípio: Open/Closed — aberto para extensão (novos status),
 * fechado para modificação (VALID_VISIT_TRANSITIONS em types/index.ts).
 */

import {
    VisitStatusEnum,
    VALID_VISIT_TRANSITIONS,
    CAN_CREATE_NEW_VISIT_FROM,
} from '../types';

export const VisitStateMachine = {

    /**
     * Verifica se a transição de status é formalmente válida.
     */
    isValidTransition: (from: VisitStatusEnum, to: VisitStatusEnum): boolean => {
        return VALID_VISIT_TRANSITIONS[from]?.includes(to) ?? false;
    },

    /**
     * Retorna as próximas transições disponíveis a partir do status atual.
     * Usado para renderização condicional de botões de ação.
     */
    getAvailableTransitions: (current: VisitStatusEnum): VisitStatusEnum[] => {
        return VALID_VISIT_TRANSITIONS[current] ?? [];
    },

    /**
     * Verifica se a visita atual permite criação de uma nova visita na OS.
     * Uma nova visita só pode ser criada se a anterior estiver PAUSED ou BLOCKED.
     */
    canCreateNewVisit: (lastVisitStatus: VisitStatusEnum): boolean => {
        return CAN_CREATE_NEW_VISIT_FROM.includes(lastVisitStatus);
    },

    /**
     * Verifica se a OS está em estado terminal (não aceita mais visitas).
     */
    isOrderTerminal: (orderStatus: string): boolean => {
        return ['CONCLUÍDO', 'CANCELADO'].includes(orderStatus);
    },

    /**
     * Verifica se a visita pode ser editada pelo técnico.
     * Somente leitura se: isLocked=true OU status terminal.
     */
    isEditable: (visit: { status: VisitStatusEnum; isLocked?: boolean }): boolean => {
        if (visit.isLocked) return false;
        const terminalStatuses: VisitStatusEnum[] = [
            VisitStatusEnum.COMPLETED,
            VisitStatusEnum.BLOCKED,
        ];
        return !terminalStatuses.includes(visit.status);
    },

    /**
     * Mapeia o status da OS para o status de visita correspondente.
     * Útil para sincronização entre as duas entidades.
     */
    orderStatusToVisitStatus: (orderStatus: string): VisitStatusEnum | null => {
        const mapping: Record<string, VisitStatusEnum> = {
            'EM ANDAMENTO': VisitStatusEnum.ONGOING,
            'IMPEDIDO': VisitStatusEnum.BLOCKED,
            'CONCLUÍDO': VisitStatusEnum.COMPLETED,
        };
        return mapping[orderStatus] ?? null;
    },
};
