
import React from 'react';
import { OrderPriority, OrderStatus } from '../../types';

export const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const styles = {
    [OrderStatus.PENDING]: 'bg-slate-100 text-slate-500',
    [OrderStatus.ASSIGNED]: 'bg-primary-50 text-primary-600',
    [OrderStatus.TRAVELING]: 'bg-sky-50 text-sky-600',
    [OrderStatus.ARRIVED]: 'bg-teal-50 text-teal-600',
    [OrderStatus.IN_PROGRESS]: 'bg-indigo-50 text-indigo-600',
    [OrderStatus.PAUSED]: 'bg-gray-100 text-gray-600',
    [OrderStatus.COMPLETED]: 'bg-emerald-50 text-emerald-600',
    [OrderStatus.CANCELED]: 'bg-rose-50 text-rose-500',
    [OrderStatus.BLOCKED]: 'bg-amber-50 text-amber-600',
  };

  const labels = {
    [OrderStatus.PENDING]: 'Pendente',
    [OrderStatus.ASSIGNED]: 'Atribuído',
    [OrderStatus.TRAVELING]: 'Deslocamento',
    [OrderStatus.ARRIVED]: 'No Local',
    [OrderStatus.IN_PROGRESS]: 'Em Execução',
    [OrderStatus.PAUSED]: 'Pausada',
    [OrderStatus.COMPLETED]: 'Concluída',
    [OrderStatus.CANCELED]: 'Cancelada',
    [OrderStatus.BLOCKED]: 'Impedida',
  };

  const dotColors = {
    [OrderStatus.PENDING]: 'bg-slate-400',
    [OrderStatus.ASSIGNED]: 'bg-primary-400',
    [OrderStatus.TRAVELING]: 'bg-sky-500',
    [OrderStatus.ARRIVED]: 'bg-teal-500',
    [OrderStatus.IN_PROGRESS]: 'bg-indigo-500',
    [OrderStatus.PAUSED]: 'bg-gray-500',
    [OrderStatus.COMPLETED]: 'bg-emerald-500',
    [OrderStatus.CANCELED]: 'bg-rose-500',
    [OrderStatus.BLOCKED]: 'bg-amber-500',
  };

  return (
    <span className={`px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-2 shadow-sm/5 ${styles[status] || 'bg-slate-100 text-slate-500'}`}>
      <span className={`w-1.5 h-1.5 rounded-full animate-pulse-subtle ${dotColors[status] || 'bg-slate-400'}`} />
      {labels[status] || status}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: OrderPriority }> = ({ priority }) => {
  const styles = {
    [OrderPriority.LOW]: 'text-slate-400 bg-slate-50',
    [OrderPriority.MEDIUM]: 'text-primary-500 bg-primary-50',
    [OrderPriority.HIGH]: 'text-amber-500 bg-amber-50',
    [OrderPriority.CRITICAL]: 'text-rose-500 bg-rose-50 font-black',
  };

  const labels = {
    [OrderPriority.LOW]: 'Baixa',
    [OrderPriority.MEDIUM]: 'Média',
    [OrderPriority.HIGH]: 'Alta',
    [OrderPriority.CRITICAL]: 'Crítica',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-[0.2em] ${styles[priority]}`}>
      {labels[priority]}
    </span>
  )
}
