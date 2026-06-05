
import React from 'react';
import { OrderPriority, OrderStatus } from '../../types';

/** Normalizes any raw status string (from DB, legacy, English) to the canonical PT-BR enum value. */
export function normalizeOrderStatus(raw: string | undefined | null): OrderStatus {
  if (!raw) return OrderStatus.PENDING;
  const s = raw.trim().toUpperCase();
  if (s === 'PENDENTE'       || s === 'PENDING')            return OrderStatus.PENDING;
  if (s === 'ATRIBUÍDO'      || s === 'ATRIBUIDO'
    || s === 'ASSIGNED')                                     return OrderStatus.ASSIGNED;
  if (s === 'EM DESLOCAMENTO'|| s === 'DESLOCAMENTO'
    || s === 'TRAVELING'     || s === 'TRAVEL')              return OrderStatus.TRAVELING;
  if (s === 'EM ANDAMENTO'   || s === 'ANDAMENTO'
    || s === 'IN_PROGRESS'   || s === 'ONGOING'
    || s === 'IN PROGRESS')                                  return OrderStatus.IN_PROGRESS;
  if (s === 'CONCLUÍDO'      || s === 'CONCLUIDO'
    || s === 'COMPLETED')                                    return OrderStatus.COMPLETED;
  if (s === 'CANCELADO'      || s === 'CANCELED'
    || s === 'CANCELLED')                                    return OrderStatus.CANCELED;
  if (s === 'IMPEDIDO'       || s === 'BLOCKED'
    || s === 'PAUSED'        || s === 'PAUSADO')             return OrderStatus.BLOCKED;
  // fallback — return as-is cast
  return raw as OrderStatus;
}

export const StatusBadge: React.FC<{ status: OrderStatus | string }> = ({ status }) => {
  const normalized = normalizeOrderStatus(status as string);

  const styles = {
    [OrderStatus.PENDING]:    'bg-slate-100 text-slate-500',
    [OrderStatus.ASSIGNED]:   'bg-primary-50 text-primary-600',
    [OrderStatus.TRAVELING]:  'bg-sky-50 text-sky-600',
    [OrderStatus.IN_PROGRESS]:'bg-indigo-50 text-indigo-600',
    [OrderStatus.COMPLETED]:  'bg-emerald-50 text-emerald-600',
    [OrderStatus.CANCELED]:   'bg-rose-50 text-rose-500',
    [OrderStatus.BLOCKED]:    'bg-amber-50 text-amber-600',
  };

  const labels = {
    [OrderStatus.PENDING]:    'Pendente',
    [OrderStatus.ASSIGNED]:   'Atribuído',
    [OrderStatus.TRAVELING]:  'Deslocamento',
    [OrderStatus.IN_PROGRESS]:'Em Execução',
    [OrderStatus.COMPLETED]:  'Concluída',
    [OrderStatus.CANCELED]:   'Cancelada',
    [OrderStatus.BLOCKED]:    'Impedida',
  };

  const dotColors = {
    [OrderStatus.PENDING]:    'bg-slate-400',
    [OrderStatus.ASSIGNED]:   'bg-primary-400',
    [OrderStatus.TRAVELING]:  'bg-sky-500',
    [OrderStatus.IN_PROGRESS]:'bg-indigo-500',
    [OrderStatus.COMPLETED]:  'bg-emerald-500',
    [OrderStatus.CANCELED]:   'bg-rose-500',
    [OrderStatus.BLOCKED]:    'bg-amber-500',
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] inline-flex items-center gap-1.5 shadow-sm/5 ${styles[normalized] || 'bg-slate-100 text-slate-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse-subtle ${dotColors[normalized] || 'bg-slate-400'}`} />
      {labels[normalized] || normalized}
    </span>
  );
};


export const PriorityBadge: React.FC<{ priority: OrderPriority }> = ({ priority }) => {
  const styles = {
    [OrderPriority.LOW]: 'text-slate-500 bg-slate-50',
    [OrderPriority.MEDIUM]: 'text-primary-600 bg-primary-50',
    [OrderPriority.HIGH]: 'text-amber-600 bg-amber-50',
    [OrderPriority.CRITICAL]: 'text-rose-600 bg-rose-50',
  };

  const PRIORITY_TEXT: Record<OrderPriority, string> = {
    [OrderPriority.LOW]: 'Baixa',
    [OrderPriority.MEDIUM]: 'Média',
    [OrderPriority.HIGH]: 'Alta',
    [OrderPriority.CRITICAL]: 'Urgente'
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-[11px] ${styles[priority]}`}>
      {PRIORITY_TEXT[priority]}
    </span>
  )
}
