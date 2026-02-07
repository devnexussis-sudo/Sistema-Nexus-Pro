
import React from 'react';
import { OrderPriority, OrderStatus } from '../../types';

export const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const styles = {
    [OrderStatus.PENDING]: 'bg-slate-100 text-slate-500 border-slate-200',
    [OrderStatus.ASSIGNED]: 'bg-slate-100 text-primary-500 border-primary-200',
    [OrderStatus.IN_PROGRESS]: 'bg-primary-50 text-primary-600 border-primary-200',
    [OrderStatus.COMPLETED]: 'bg-success-50 text-success-700 border-success-200',
    [OrderStatus.CANCELED]: 'bg-rose-50 text-rose-600 border-rose-200',
    [OrderStatus.BLOCKED]: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  const labels = {
    [OrderStatus.PENDING]: 'Pendente',
    [OrderStatus.ASSIGNED]: 'Atribuído',
    [OrderStatus.IN_PROGRESS]: 'Em Execução',
    [OrderStatus.COMPLETED]: 'Concluída',
    [OrderStatus.CANCELED]: 'Cancelada',
    [OrderStatus.BLOCKED]: 'Impedida',
  };

  const dotColors = {
    [OrderStatus.PENDING]: 'bg-slate-400',
    [OrderStatus.ASSIGNED]: 'bg-primary-400',
    [OrderStatus.IN_PROGRESS]: 'bg-primary-600',
    [OrderStatus.COMPLETED]: 'bg-success-500',
    [OrderStatus.CANCELED]: 'bg-rose-500',
    [OrderStatus.BLOCKED]: 'bg-amber-500',
  };

  return (
    <span className={`px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider border inline-flex items-center gap-1.5 ${styles[status]}`}>
      <span className={`w-1 h-1 rounded-full ${dotColors[status]}`} />
      {labels[status]}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: OrderPriority }> = ({ priority }) => {
  const styles = {
    [OrderPriority.LOW]: 'text-slate-500 bg-slate-50 border-slate-100',
    [OrderPriority.MEDIUM]: 'text-primary-600 bg-primary-50 border-primary-100',
    [OrderPriority.HIGH]: 'text-amber-600 bg-amber-50 border-amber-100',
    [OrderPriority.CRITICAL]: 'text-rose-700 bg-rose-50 border-rose-100 font-black',
  };

  const labels = {
    [OrderPriority.LOW]: 'Baixa',
    [OrderPriority.MEDIUM]: 'Média',
    [OrderPriority.HIGH]: 'Alta',
    [OrderPriority.CRITICAL]: 'Crítica',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest border ${styles[priority]}`}>
      {labels[priority]}
    </span>
  )
}
