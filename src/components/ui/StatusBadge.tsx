
import React from 'react';
import { OrderPriority, OrderStatus } from '../../types';

export const StatusBadge: React.FC<{ status: OrderStatus }> = ({ status }) => {
  const styles = {
    [OrderStatus.PENDING]: 'bg-slate-100 text-slate-500 border-slate-200',
    [OrderStatus.ASSIGNED]: 'bg-blue-50 text-blue-600 border-blue-200',
    [OrderStatus.IN_PROGRESS]: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    [OrderStatus.COMPLETED]: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    [OrderStatus.CANCELED]: 'bg-red-50 text-red-600 border-red-200',
    [OrderStatus.BLOCKED]: 'bg-rose-50 text-rose-700 border-rose-200',
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
    [OrderStatus.ASSIGNED]: 'bg-blue-500',
    [OrderStatus.IN_PROGRESS]: 'bg-indigo-600',
    [OrderStatus.COMPLETED]: 'bg-emerald-500',
    [OrderStatus.CANCELED]: 'bg-red-500',
    [OrderStatus.BLOCKED]: 'bg-rose-600',
  };

  return (
    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold tracking-tight border shadow-sm inline-flex items-center gap-1.5 ${styles[status]}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${dotColors[status]}`} />
      {labels[status]}
    </span>
  );
};

export const PriorityBadge: React.FC<{ priority: OrderPriority }> = ({ priority }) => {
  const styles = {
    [OrderPriority.LOW]: 'text-gray-500 bg-gray-50 border-gray-100',
    [OrderPriority.MEDIUM]: 'text-blue-600 bg-blue-50 border-blue-100',
    [OrderPriority.HIGH]: 'text-amber-600 bg-amber-50 border-amber-100',
    [OrderPriority.CRITICAL]: 'text-red-700 bg-red-50 border-red-100 font-bold',
  };

  const labels = {
    [OrderPriority.LOW]: 'Baixa',
    [OrderPriority.MEDIUM]: 'Média',
    [OrderPriority.HIGH]: 'Alta',
    [OrderPriority.CRITICAL]: 'Crítica',
  };

  return (
    <span className={`px-2 py-0.5 rounded text-[9px] uppercase tracking-widest border ${styles[priority]}`}>
      {labels[priority]}
    </span>
  )
}
