import React, { useMemo } from 'react';
import { ServiceOrder, OrderStatus } from '../../types';
import {
  ClipboardList, CheckCircle, Clock, AlertCircle, TrendingUp, BarChart3,
  Briefcase, Activity, ShieldAlert, Timer, ArrowRight, Calendar, Zap, Layers, Target, Boxes, PieChart, BarChart
} from 'lucide-react';

interface AdminOverviewProps {
  orders: ServiceOrder[];
  contracts: any[];
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  orders, contracts, startDate, endDate, onDateChange
}) => {
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      if (!startDate || !endDate) return true;

      const sDate = order.scheduledDate;
      const eDate = order.endDate ? order.endDate.split('T')[0] : null;

      // Lógica de Sincronização Nexus:
      // 1. Se está concluída, conta pela data de conclusão (endDate)
      // 2. Se não, conta pela data de agendamento (scheduledDate)
      if (order.status === OrderStatus.COMPLETED && eDate) {
        return eDate >= startDate && eDate <= endDate;
      }

      // Caso padrão: agendamento
      if (sDate) {
        return sDate >= startDate && sDate <= endDate;
      }

      // Fallback para criação apenas se não houver agenda (evita que OS fiquem invisíveis)
      const cDate = order.createdAt ? order.createdAt.split('T')[0] : null;
      if (cDate) return cDate >= startDate && cDate <= endDate;

      return false;
    });
  }, [orders, startDate, endDate]);

  const activeContracts = useMemo(() => contracts.filter(c => c.status !== 'CANCELADO'), [contracts]);
  const total = filteredOrders.length;

  // Status breakdown with percentages
  const statusData = useMemo(() => {
    const counts = {
      [OrderStatus.COMPLETED]: filteredOrders.filter(o => o.status === OrderStatus.COMPLETED).length,
      [OrderStatus.IN_PROGRESS]: filteredOrders.filter(o => o.status === OrderStatus.IN_PROGRESS).length,
      [OrderStatus.ASSIGNED]: filteredOrders.filter(o => o.status === OrderStatus.ASSIGNED).length,
      [OrderStatus.PENDING]: filteredOrders.filter(o => o.status === OrderStatus.PENDING).length,
      [OrderStatus.BLOCKED]: filteredOrders.filter(o => o.status === OrderStatus.BLOCKED).length,
      [OrderStatus.CANCELED]: filteredOrders.filter(o => o.status === OrderStatus.CANCELED).length,
    };

    return Object.entries(counts).map(([status, count]) => ({
      status,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));
  }, [filteredOrders, total]);

  const completionRate = total > 0 ? Math.round((statusData.find(s => s.status === OrderStatus.COMPLETED)?.count || 0) / total * 100) : 0;

  const pmocAnalysis = useMemo(() => {
    const todayNum = new Date().getDate();
    const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
    const counts = { urgent: 0, critical: 0, planned: 0 };
    const visits = activeContracts.map(c => {
      const day = Number(c.maintenanceDay) || 1;
      let daysUntil = day >= todayNum ? day - todayNum : (daysInMonth - todayNum) + day;
      if (daysUntil <= 3) counts.urgent++;
      else if (daysUntil <= 7) counts.critical++;
      else counts.planned++;
      return { ...c, daysUntil };
    }).sort((a, b) => a.daysUntil - b.daysUntil);
    return { counts, visits };
  }, [activeContracts]);

  // CSS Pie Chart Colors
  const pieColors: Record<string, string> = {
    [OrderStatus.COMPLETED]: '#10b981', // emerald-500
    [OrderStatus.IN_PROGRESS]: '#f59e0b', // amber-500
    [OrderStatus.ASSIGNED]: '#6366f1', // indigo-500
    [OrderStatus.PENDING]: '#94a3b8', // slate-400
    [OrderStatus.BLOCKED]: '#f43f5e', // rose-500
    [OrderStatus.CANCELED]: '#4b5563', // gray-600
  };

  // Generate Conic Gradient for CSS Pie
  const getPieGradient = () => {
    let accumulated = 0;
    const parts = statusData.map(s => {
      const start = accumulated;
      accumulated += s.percentage;
      return `${pieColors[s.status]} ${start}% ${accumulated}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  };

  const handleFastFilter = (type: 'today' | 'week' | 'month') => {
    const now = new Date();
    const getLocalISO = (date: Date) => {
      const offset = date.getTimezoneOffset() * 60000;
      return new Date(date.getTime() - offset).toISOString().split('T')[0];
    };
    const today = getLocalISO(now);
    if (type === 'today') onDateChange(today, today);
    else if (type === 'week') {
      const date = new Date(now); date.setDate(now.getDate() - 7);
      onDateChange(getLocalISO(date), today);
    } else if (type === 'month') {
      const date = new Date(now); date.setMonth(now.getMonth() - 1);
      onDateChange(getLocalISO(date), today);
    }
  };

  return (
    <div className="p-5 space-y-6 animate-fade-in bg-[#f8fafc] h-full overflow-y-auto custom-scrollbar">

      {/* HEADER COMPACTO */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 uppercase italic tracking-tighter leading-none">Nexus Analytics</h1>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Operational BI Framework</p>
        </div>

        <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-xl shadow-sm border border-slate-100">
          <div className="flex bg-slate-50 p-1 rounded-lg">
            {['today', 'week', 'month'].map((f) => (
              <button
                key={f}
                onClick={() => handleFastFilter(f as any)}
                className="px-3 py-1.5 text-[8px] font-black uppercase rounded-md transition-all text-slate-500 hover:text-indigo-600 hover:bg-white active:scale-95"
              >{f === 'today' ? 'Hoje' : f === 'week' ? 'Semana' : 'Mês'}</button>
            ))}
          </div>
          <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>
          <div className="flex items-center gap-2 px-2">
            <Calendar size={12} className="text-slate-400" />
            <input type="date" value={startDate} onChange={e => onDateChange(e.target.value, endDate)} className="bg-transparent text-[9px] font-black text-slate-600 outline-none w-20" />
            <span className="text-[9px] font-black text-slate-300">/</span>
            <input type="date" value={endDate} onChange={e => onDateChange(startDate, e.target.value)} className="bg-transparent text-[9px] font-black text-slate-600 outline-none w-20" />
          </div>
          <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>
          <button
            onClick={() => onDateChange('', '')}
            className="px-3 py-1.5 text-[8px] font-black uppercase text-rose-500 hover:bg-rose-50 rounded-md transition-all active:scale-95 border border-dashed border-rose-100"
          >
            Limpar
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">

        {/* OS SEGMENT - MAIS COMPACTO */}
        <div className="xl:col-span-2 bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-50 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-md"><ClipboardList size={20} /></div>
              <div>
                <h3 className="text-sm font-black text-slate-900 uppercase italic tracking-tighter">Status de Atendimento</h3>
                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest">Base de Dados Sincronizada</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-black text-indigo-600 uppercase">Protocolos</p>
              <p className="text-2xl font-black text-slate-900 italic tracking-tighter leading-none">{total}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-8 items-center">
            <div className="md:col-span-2 flex flex-col items-center gap-4">
              <div className="w-32 h-32 rounded-full relative border-4 border-white shadow-lg" style={{ background: getPieGradient() }}>
                <div className="absolute inset-2 bg-white rounded-full flex items-center justify-center shadow-inner">
                  <PieChart className="text-slate-100" size={24} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 w-full">
                {statusData.slice(0, 4).map(s => (
                  <div key={s.status} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pieColors[s.status] }}></div>
                    <span className="text-[7px] font-black text-slate-500 uppercase italic truncate">{s.count} ({s.percentage}%)</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Status List with Vibrant Progress Bars */}
            <div className="md:col-span-3 space-y-3">
              {statusData.map(s => (
                <div key={s.status} className="space-y-1">
                  <div className="flex justify-between items-end">
                    <span className="text-[8px] font-black text-slate-600 uppercase">{s.status}</span>
                    <span className="text-[9px] font-black text-slate-900">{s.count} <span className="text-slate-400 ml-1">({s.percentage}%)</span></span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-50 rounded-full overflow-hidden border border-slate-100/50">
                    <div
                      className="h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${s.percentage}%`, backgroundColor: pieColors[s.status] }}
                    ></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 3. PERFORMANCE SEGMENT - QUADRADO COLORIDO (ZAP) */}
        <div className="bg-indigo-600 rounded-[2rem] shadow-lg p-6 text-white flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute -right-6 -top-6 opacity-10 group-hover:rotate-12 transition-transform duration-1000"><Zap size={160} /></div>
          <div className="relative z-10 flex flex-col h-full items-center justify-center text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-60 mb-2">Efficiency Rating</p>
            <div className="relative w-32 h-32 mb-4">
              <svg className="w-full h-full transform -rotate-90">
                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="8" fill="transparent" className="text-white/5" />
                <circle cx="64" cy="64" r="58" stroke="currentColor" strokeWidth="10" fill="transparent"
                  strokeDasharray={364}
                  strokeDashoffset={364 - (364 * completionRate / 100)}
                  className="text-white transition-all duration-1000 stroke-round"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-4xl font-black italic tracking-tighter">{completionRate}%</p>
                <p className="text-[7px] font-black uppercase tracking-widest text-white/40">SLA Global</p>
              </div>
            </div>
            <div className="bg-white/10 border border-white/10 rounded-xl p-3 backdrop-blur-sm w-full">
              <p className="text-[8px] font-black uppercase tracking-tight">Status da Operação</p>
              <p className="text-[10px] font-bold italic text-white mt-1">RESOLUTIVIDADE POSITIVA</p>
            </div>
          </div>
        </div>

        {/* 4. CONTRACTS SEGMENT - PMOC */}
        <div className="bg-[#1e1e2d] rounded-[2rem] shadow-xl p-6 text-white flex flex-col justify-between relative overflow-hidden group">
          <div className="absolute right-0 bottom-0 p-6 opacity-5"><ShieldAlert size={120} /></div>

          <div className="relative z-10 space-y-6">
            <div className="flex items-center justify-between border-b border-white/5 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center text-white"><Briefcase size={20} /></div>
                <div>
                  <h3 className="text-sm font-black uppercase italic tracking-tighter">Gestão PMOC</h3>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black italic">{activeContracts.length}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="bg-white/5 p-3 rounded-2xl border border-white/5 h-16 flex flex-col justify-center">
                <p className="text-[7px] font-black text-rose-400 uppercase">Urgente</p>
                <p className="text-lg font-black italic">{pmocAnalysis.counts.urgent}</p>
              </div>
              <div className="bg-white/5 p-3 rounded-2xl border border-white/5 h-16 flex flex-col justify-center">
                <p className="text-[7px] font-black text-amber-400 uppercase">Projetado</p>
                <p className="text-lg font-black italic">{pmocAnalysis.counts.critical}</p>
              </div>
            </div>

            <div className="space-y-2">
              {pmocAnalysis.visits.slice(0, 2).map((v, i) => (
                <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-xl border border-white/5 text-[9px]">
                  <span className="font-black uppercase italic truncate max-w-[120px]">{v.customerName}</span>
                  <span className="font-black px-2 py-0.5 bg-sky-600 rounded-md">D-{v.daysUntil}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 5. VOLUME SEGMENT - GRÁFICO DE BARRAS DINÂMICO */}
        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-6 xl:col-span-2 flex flex-col space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white"><BarChart size={20} /></div>
              <div>
                <h3 className="text-sm font-black uppercase italic tracking-tighter">Escala de Demanda</h3>
              </div>
            </div>
          </div>

          <div className="flex-1 flex items-end justify-between gap-3 pt-6 min-h-[120px] px-2">
            {statusData.map(s => (
              <div key={s.status} className="flex-1 flex flex-col items-center gap-2 group relative">
                <div className="relative w-full flex flex-col items-center">
                  {/* Tooltip for count */}
                  {/* <div className="absolute -top-8 px-2 py-1 bg-slate-900 text-white text-[10px] font-black rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 shadow-xl">{s.count} UN</div> */}
                  <div
                    className="w-full max-w-[28px] rounded-t-lg transition-all duration-700 shadow-md"
                    style={{
                      height: `${total > 0 ? (s.count / total) * 100 : 2}px`, // Adjusted max height for compactness
                      backgroundColor: pieColors[s.status],
                      minHeight: '4px'
                    }}
                  ></div>
                </div>
                <p className="text-[7px] font-black text-slate-400 uppercase text-center truncate w-full">{s.status.split(' ')[0]}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};
