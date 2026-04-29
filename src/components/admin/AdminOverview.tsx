import React, { useMemo, useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, User, Customer, OrderPriority } from '../../types';
import {
  ClipboardList, CheckCircle, Clock, AlertCircle, TrendingUp, BarChart3,
  Briefcase, Activity, ShieldAlert, Timer, ArrowRight, Calendar, Zap, Layers, Target, Boxes, PieChart, BarChart,
  Search, Filter, UserCheck, Users, ChevronRight, Gauge, ZapOff, Settings
} from 'lucide-react';

interface AdminOverviewProps {
  orders: ServiceOrder[];
  contracts: any[];
  techs: User[];
  customers: Customer[];
  startDate: string;
  endDate: string;
  onDateChange: (start: string, end: string) => void;
  onSwitchView: (view: 'dashboard' | 'orders' | 'contracts' | 'quotes' | 'techs' | 'map' | 'equip' | 'clients' | 'forms' | 'settings' | 'superadmin' | 'users' | 'stock' | 'financial' | 'calendar') => void;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({
  orders, contracts, techs, customers, startDate, endDate, onDateChange, onSwitchView
}) => {
  // Filtros Avançados (Mesma lógica da página de atividades)
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [techFilter, setTechFilter] = useState<string>('ALL');
  const [customerFilter, setCustomerFilter] = useState<string>('ALL');
  const [dateTypeFilter, setDateTypeFilter] = useState<'scheduled' | 'created' | 'completed'>('scheduled');
  const [showFilters, setShowFilters] = useState(false);
  const [slaTarget, setSlaTarget] = useState<number>(85);

  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // 1. Busca por texto
      const term = searchTerm.toLowerCase();
      const matchesSearch = (order.title || '').toLowerCase().includes(term) ||
        (order.customerName || '').toLowerCase().includes(term) ||
        (order.id || '').toLowerCase().includes(term) ||
        (order.displayId || '').toLowerCase().includes(term);

      // 2. Filtro de Status
      const matchesStatus = statusFilter === 'ALL' || order.status === statusFilter;

      // 3. Filtro de Técnico
      const assignedTech = order.assignedTo ? techs.find(t => t.id === order.assignedTo) : null;
      const techName = assignedTech?.name?.toLowerCase() || '';
      const matchesTech = techFilter === 'ALL' || techName.includes(techFilter.toLowerCase());

      // 4. Filtro de Cliente
      const matchesCustomer = customerFilter === 'ALL' || (order.customerName || '').toLowerCase().includes(customerFilter.toLowerCase());

      // 5. Filtro de Data
      const sDate = order.scheduledDate ? order.scheduledDate.substring(0, 10) : null;
      const cDate = order.createdAt ? order.createdAt.substring(0, 10) : null;
      const eDate = order.endDate ? order.endDate.substring(0, 10) : null;
      let targetDate = sDate;
      if (dateTypeFilter === 'created') targetDate = cDate;
      if (dateTypeFilter === 'completed') targetDate = eDate;

      let matchesTime = true;
      if (startDate || endDate) {
        if (!targetDate) {
          matchesTime = false;
        } else {
          if (startDate && targetDate < startDate) matchesTime = false;
          if (endDate && targetDate > endDate) matchesTime = false;
        }
      }

      return matchesSearch && matchesStatus && matchesTech && matchesCustomer && matchesTime;
    });
  }, [orders, techs, searchTerm, statusFilter, startDate, endDate, techFilter, customerFilter, dateTypeFilter]);

  const activeContracts = useMemo(() => contracts.filter(c => c.status !== 'CANCELADO'), [contracts]);
  const total = filteredOrders.length;

  // Cálculos de KPI de Fechamento (Cumulativos: 24h, 36h, 48h)
  const closureKPIs = useMemo(() => {
    const validScheduledOrders = filteredOrders.filter(o => o.status !== OrderStatus.CANCELED);
    const totalScheduledContext = validScheduledOrders.length;

    const completed = validScheduledOrders.filter(o => o.status === OrderStatus.COMPLETED && o.createdAt && o.endDate);

    let within24 = 0;
    let within36 = 0;
    let within48 = 0;
    let between24and48 = 0;
    let over24 = 0;
    let over48 = 0;

    completed.forEach(o => {
      if (!o.createdAt || !o.endDate) return;
      try {
        const created = new Date(o.createdAt).getTime();
        const closed = new Date(o.endDate).getTime();
        const diffHours = (closed - created) / (1000 * 60 * 60);

        if (diffHours <= 24) { within24++; within36++; within48++; }
        else if (diffHours <= 36) { within36++; within48++; over24++; between24and48++; }
        else if (diffHours <= 48) { within48++; over24++; between24and48++; }
        else { over24++; over48++; }
      } catch (e) {
        console.warn("Nexus Analytics: Erro ao calcular diffHours", e);
      }
    });

    const slaEfficiency24 = totalScheduledContext > 0 ? Math.round((within24 / totalScheduledContext) * 100) : 0;
    const slaEfficiency48 = totalScheduledContext > 0 ? Math.round((within48 / totalScheduledContext) * 100) : 0;
    const between24and48Pct = totalScheduledContext > 0 ? Math.round((between24and48 / totalScheduledContext) * 100) : 0;
    const over24Percentage = completed.length > 0 ? Math.round((over24 / completed.length) * 100) : 0;
    const over48Percentage = completed.length > 0 ? Math.round((over48 / completed.length) * 100) : 0;

    return { within24, within36, within48, between24and48, between24and48Pct, over24, over48, over24Percentage, over48Percentage, slaEfficiency24, slaEfficiency48, totalCompleted: completed.length };
  }, [filteredOrders]);

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

  const overdueUnstartedCount = useMemo(() => {
    const nowFilter = new Date().toISOString().split('T')[0];
    return filteredOrders.filter(o =>
      [OrderStatus.PENDING, OrderStatus.ASSIGNED].includes(o.status) &&
      o.scheduledDate && o.scheduledDate.substring(0, 10) < nowFilter
    ).length;
  }, [filteredOrders]);

  const operationData = useMemo(() => {
    const counts: Record<string, number> = {};
    const validOrders = filteredOrders.filter(o => o.status !== OrderStatus.CANCELED);
    validOrders.forEach(o => {
      let type = o.operationType;

      // Fallback analítico para OS antigas que não possuem operationType salvo no banco
      if (!type || type === 'Outro' || type.trim() === '') {
        const titleLower = (o.title || '').toLowerCase();
        if (titleLower.includes('fora de garantia')) type = 'Fora de Garantia';
        else if (titleLower.includes('estendida')) type = 'Garantia Estendida';
        else if (titleLower.includes('garantia')) type = 'Garantia';
        else if (titleLower.includes('orçamento') || titleLower.includes('orcamento')) type = 'Orçamento';
        else if (titleLower.includes('preventiva') || titleLower.includes('pmoc')) type = 'Preventiva';
        else type = 'Outro';
      }

      counts[type] = (counts[type] || 0) + 1;
    });

    const totalOps = validOrders.length;
    const colors = ['#3b82f6', '#10b981', '#f43f5e', '#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];

    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([type, count], i) => ({
        type,
        count,
        percentage: totalOps > 0 ? Math.round((count / totalOps) * 100) : 0,
        color: colors[i % colors.length]
      }));
  }, [filteredOrders]);

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

  const pieColors: Record<string, string> = {
    [OrderStatus.COMPLETED]: '#10b981', // emerald-500
    [OrderStatus.IN_PROGRESS]: '#f59e0b', // amber-500
    [OrderStatus.ASSIGNED]: '#3b82f6', // primary-500
    [OrderStatus.PENDING]: '#94a3b8', // slate-400
    [OrderStatus.BLOCKED]: '#f43f5e', // rose-500
    [OrderStatus.CANCELED]: '#4b5563', // gray-600
  };

  const getPieGradient = () => {
    let accumulated = 0;
    const filteredStatusData = statusData.filter(s => s.percentage > 0);
    if (filteredStatusData.length === 0) return 'linear-gradient(#f1f5f9, #f1f5f9)';

    const parts = filteredStatusData.map(s => {
      const start = accumulated;
      accumulated += s.percentage;
      const color = pieColors[s.status] || '#cbd5e1';
      return `${color} ${start}% ${accumulated}%`;
    });
    return `conic-gradient(${parts.join(', ')})`;
  };

  const getOperationGradient = () => {
    if (operationData.length === 0) return 'linear-gradient(#f1f5f9, #f1f5f9)';
    let accumulated = 0;
    const parts = operationData.map(o => {
      const start = accumulated;
      accumulated += o.percentage;
      return `${o.color} ${start}% ${accumulated}%`;
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
    <div className="p-3 sm:p-6 lg:p-8 space-y-5 sm:space-y-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">

      {/* HEADER & FILTERS */}
      <div className="space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight lowercase">visão geral</h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">Monitore o desempenho operacional e SLAs em tempo real</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center bg-white border border-slate-200 p-1.5 rounded-lg shadow-lg shadow-slate-200/50">
              <select
                value={dateTypeFilter}
                onChange={(e) => setDateTypeFilter(e.target.value as 'scheduled' | 'created' | 'completed')}
                className="bg-slate-50 text-[10px] font-bold  text-slate-600 px-3 py-1.5 rounded-md border border-slate-100 outline-none cursor-pointer"
              >
                <option value="scheduled">Agenda</option>
                <option value="created">Abertura</option>
                <option value="completed">Conclusão</option>
              </select>
              <div className="h-6 w-px bg-slate-200 mx-2 sm:mx-3 hidden sm:block"></div>
              <div className="flex gap-1 mr-2 sm:mr-3">
                {[
                  { id: 'today', label: 'Hoje' },
                  { id: 'week', label: '7 dias' },
                  { id: 'month', label: 'Trinta' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleFastFilter(f.id as any)}
                    className="px-2 sm:px-3 py-1.5 text-[10px] font-bold  rounded-md transition-all text-slate-500 hover:text-[#1c2d4f] hover:bg-slate-50 active:scale-95"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="h-6 w-px bg-slate-200 mr-2 sm:mr-3 hidden sm:block"></div>
              <div className="flex items-center gap-2 sm:gap-3 px-1">
                <input type="date" value={startDate} onChange={e => onDateChange(e.target.value, endDate)} className="bg-transparent text-[11px] font-semibold text-slate-700 outline-none w-24 sm:w-28" />
                <span className="text-[10px] font-bold text-slate-300 ">Até</span>
                <input type="date" value={endDate} onChange={e => onDateChange(startDate, e.target.value)} className="bg-transparent text-[11px] font-semibold text-slate-700 outline-none w-24 sm:w-28" />
              </div>
            </div>
          </div>
        </div>

        <div className="mb-2 sm:mb-4 p-2 sm:p-3 rounded-2xl border border-[#1c2d4f]/20 bg-white/40 shadow-sm backdrop-blur-md flex flex-col gap-3">
            <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2 sm:gap-3">
              <div className="relative flex-1 min-w-[200px] w-full lg:w-auto">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input
                  type="text"
                  placeholder="Pesquisar por cliente, título ou protocolo..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="w-full h-10 bg-white border border-[#1c2d4f]/20 rounded-xl pl-9 pr-4 text-xs font-bold text-slate-700 placeholder-slate-400 outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 transition-all shadow-sm"
                />
              </div>

              <div className="flex items-center gap-2 w-full lg:w-auto justify-end shrink-0">
                <button
                   onClick={() => setShowFilters(!showFilters)}
                   className={`flex items-center gap-2 px-4 h-10 rounded-xl border transition-all text-[10px] font-bold ${showFilters ? 'bg-primary-50 border-primary-200 text-primary-600 shadow-inner' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 shadow-sm'}`}
                >
                   <Filter size={14} /> {showFilters ? 'Ocultar Filtros' : 'Filtros'}
                </button>
              </div>
            </div>
        </div>

        {showFilters && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-slate-50/50 rounded-2xl border border-dashed border-slate-200 animate-in fade-in slide-in-from-top-2 duration-200">
             <div className="flex flex-col gap-1.5">
               <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Período Analítico</label>
               <div className="flex flex-col bg-white border border-slate-200 p-1.5 rounded-xl shadow-lg shadow-slate-200/50">
                  <div className="flex items-center gap-2 mb-1.5 border-b border-slate-200 pb-1.5 px-1">
                    <select
                      value={dateTypeFilter}
                      onChange={(e) => setDateTypeFilter(e.target.value as 'scheduled' | 'created' | 'completed')}
                      className="bg-slate-50 text-[10px] font-bold text-slate-600 px-2 py-1 rounded border border-slate-100 outline-none cursor-pointer w-full"
                    >
                      <option value="scheduled">Agenda</option>
                      <option value="created">Abertura</option>
                      <option value="completed">Conclusão</option>
                    </select>
                  </div>
                  <div className="flex items-center gap-2 px-1">
                    <input type="date" value={startDate} onChange={e => onDateChange(e.target.value, endDate)} className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full" />
                    <span className="text-[9px] font-bold text-slate-300">ATÉ</span>
                    <input type="date" value={endDate} onChange={e => onDateChange(startDate, e.target.value)} className="bg-transparent text-[10px] font-bold text-slate-700 outline-none w-full" />
                  </div>
               </div>
             </div>

             <div className="flex flex-col gap-1.5">
               <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Responsável</label>
               <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 h-[58px] shadow-lg shadow-slate-200/50">
                 <UserCheck size={14} className="text-slate-400 mr-2" />
                 <select className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-full cursor-pointer" value={techFilter} onChange={e => setTechFilter(e.target.value)}>
                   <option value="ALL">Todos Técnicos</option>
                   {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                 </select>
               </div>
             </div>

             <div className="flex flex-col gap-1.5">
               <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-1">Carteira de Clientes</label>
               <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 h-[58px] shadow-lg shadow-slate-200/50">
                 <Users size={14} className="text-slate-400 mr-2" />
                 <select className="bg-transparent text-[10px] font-bold text-slate-600 outline-none w-full cursor-pointer" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
                   <option value="ALL">Todos Clientes</option>
                   {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                 </select>
               </div>
             </div>

             <div className="flex items-end pb-1.5">
               <button
                 onClick={() => {
                   setSearchTerm(''); setTechFilter('ALL'); setCustomerFilter('ALL'); setDateTypeFilter('scheduled');
                   onDateChange('', '');
                 }}
                 className="w-full h-10 text-[9px] font-bold uppercase tracking-widest text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all border border-slate-200 hover:border-rose-200 shadow-sm"
               >
                 Limpar Tudo
               </button>
             </div>
          </div>
        )}
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-2 md:grid-cols-2 xl:grid-cols-5 gap-3 sm:gap-4 lg:gap-6">

        {/* KPI: SLA 24H (Vibrant Gradient) */}
        <div className="bg-gradient-to-br from-indigo-600 to-[#1c2d4f] rounded-2xl p-6 shadow-xl shadow-indigo-900/20 flex flex-col justify-between text-white relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl transition-all duration-700 group-hover:bg-white/20" />
          <div className="flex justify-between items-start relative z-10 w-full mb-4">
            <div>
              <p className="text-[11px] font-bold   text-indigo-200">Eficiência SLA (24h)</p>
              <div className="flex items-baseline gap-2 mt-1.5">
                <h2 className="text-4xl font-bold tracking-tighter drop-shadow-md">{closureKPIs.slaEfficiency24}%</h2>
                <span className="text-lg font-bold text-indigo-300/80 tracking-tight">({closureKPIs.within24})</span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-2">
              <div className="p-2.5 bg-white/10 rounded-xl text-indigo-100 backdrop-blur-sm border border-white/20 shadow-inner group-hover:scale-110 transition-transform"><Gauge size={22} /></div>
              <div className="flex items-center gap-1 bg-white/10 backdrop-blur-sm px-2 py-1 rounded-lg border border-white/20 mt-1 cursor-pointer hover:bg-white/20 transition-all">
                <Settings size={10} className="text-indigo-200" />
                <input
                  type="number"
                  value={slaTarget}
                  onChange={(e) => setSlaTarget(Number(e.target.value))}
                  className="bg-transparent w-7 text-center text-[10px] font-bold text-white outline-none appearance-none m-0 p-0"
                  title="Ajustar Meta % SLA"
                />
                <span className="text-[10px] font-bold text-indigo-200">%</span>
              </div>
            </div>
          </div>
          <div className="mt-4 relative z-10">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-[10px] font-bold text-indigo-200  ">Meta: {slaTarget}%</span>
              <span className={`text-[10px] font-bold   px-2 py-0.5 rounded-full ${closureKPIs.slaEfficiency24 >= slaTarget ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                {closureKPIs.within24} OS ({closureKPIs.slaEfficiency24 >= slaTarget ? 'Ating.' : 'Abaixo'})
              </span>
            </div>
            <div className="w-full h-2 bg-indigo-900/50 rounded-full overflow-hidden border border-indigo-400/20">
              <div
                className={`h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(255,255,255,0.4)] ${closureKPIs.slaEfficiency24 >= slaTarget ? 'bg-gradient-to-r from-emerald-400 to-emerald-300' : 'bg-gradient-to-r from-rose-400 to-rose-300'}`}
                style={{ width: `${Math.min(closureKPIs.slaEfficiency24, 100)}%` }}>
              </div>
            </div>
          </div>
        </div>

        {/* KPI: SLA 48H (Emerald Gradient) */}
        <div className="bg-gradient-to-br from-emerald-500 to-teal-700 rounded-2xl p-6 shadow-xl shadow-emerald-900/20 flex flex-col justify-between text-white relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl transition-all duration-700 group-hover:bg-white/20" />
          <div className="flex justify-between items-start relative z-10 w-full mb-4">
            <div>
              <p className="text-[11px] font-bold   text-emerald-100">Eficiência SLA (24h a 48h)</p>
              <div className="flex items-baseline gap-2 mt-1.5">
                <h2 className="text-4xl font-bold tracking-tighter drop-shadow-md">{closureKPIs.between24and48Pct}%</h2>
                <span className="text-lg font-bold text-emerald-300/80 tracking-tight">({closureKPIs.between24and48})</span>
              </div>
              <p className="text-[10px] font-bold   text-emerald-200 mt-2 border-t border-emerald-400/20 pt-1.5">Total &lt; 48h: {closureKPIs.within48}</p>
            </div>
            <div className="p-2.5 bg-white/10 rounded-xl text-emerald-100 backdrop-blur-sm border border-white/20 shadow-inner group-hover:scale-110 transition-transform"><Target size={22} /></div>
          </div>
          <div className="mt-4 relative z-10">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-[10px] font-bold text-emerald-100  ">Meta: {Math.min(slaTarget + 5, 100)}%</span>
              <span className={`text-[10px] font-bold   px-2 py-0.5 rounded-full ${closureKPIs.between24and48Pct >= (slaTarget + 5) ? 'bg-white/20 text-white' : 'bg-rose-500/40 text-rose-100'}`}>
                {closureKPIs.between24and48Pct >= (slaTarget + 5) ? 'Excelente' : 'Atenção'}
              </span>
            </div>
            <div className="w-full h-2 bg-emerald-900/50 rounded-full overflow-hidden border border-emerald-400/20">
              <div
                className={`h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(255,255,255,0.4)] ${closureKPIs.between24and48Pct >= (slaTarget + 5) ? 'bg-white' : 'bg-rose-300'}`}
                style={{ width: `${Math.min(closureKPIs.between24and48Pct, 100)}%` }}>
              </div>
            </div>
          </div>
        </div>

        {/* KPI: FORA DO PRAZO (Atrasos) */}
        <div className="bg-gradient-to-br from-red-600 to-rose-900 rounded-2xl p-6 shadow-xl shadow-red-900/20 flex flex-col justify-between text-white relative overflow-hidden group">
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl transition-all duration-700 group-hover:bg-white/20" />
          <div className="flex justify-between items-start relative z-10 w-full mb-4">
            <div>
              <p className="text-[11px] font-bold   text-red-200">Atrasos SLA</p>
              <h2 className="text-4xl font-bold mt-2 tracking-tighter drop-shadow-md">{closureKPIs.over24}</h2>
            </div>
            <div className="p-2.5 bg-white/10 rounded-xl text-red-100 backdrop-blur-sm border border-white/20 shadow-inner group-hover:scale-110 transition-transform"><AlertCircle size={22} /></div>
          </div>
          <div className="mt-4 relative z-10">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-red-400/20 shadow-sm">
                <span className="block text-[9px] font-bold text-red-200   mb-1">&gt; 24h</span>
                <p className="text-sm font-bold text-white">{closureKPIs.over24} <span className="text-[10px] text-red-200 font-normal">({closureKPIs.over24Percentage}%)</span></p>
              </div>
              <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-red-400/20 shadow-sm">
                <span className="block text-[9px] font-bold text-red-200   mb-1">&gt; 48h</span>
                <p className="text-sm font-bold text-white">{closureKPIs.over48} <span className="text-[10px] text-red-200 font-normal">({closureKPIs.over48Percentage}%)</span></p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI: FILA OPERACIONAL */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-lg shadow-slate-200/50 flex flex-col justify-between group hover:border-[#1c2d4f] transition-all hover:shadow-xl hover:-translate-y-1 duration-300">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400  ">Fila Operacional</p>
              <h3 className="text-4xl font-bold text-slate-800 mt-2 tracking-tighter">
                {filteredOrders.filter(o => [OrderStatus.PENDING, OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(o.status)).length}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shadow-inner group-hover:scale-110 transition-transform"><Activity size={22} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-gradient-to-b from-slate-50 to-white rounded-xl p-3 border border-slate-100 shadow-sm">
              <span className="block text-[9px] font-bold text-slate-400   mb-1">Em Andamento</span>
              <p className="text-lg font-bold text-blue-600">{filteredOrders.filter(o => o.status === OrderStatus.IN_PROGRESS).length}</p>
            </div>
            <div className="bg-gradient-to-b from-amber-50 to-white rounded-xl p-3 border border-amber-200 shadow-sm relative overflow-hidden flex flex-col justify-between group/alert">
              <div className="absolute top-0 right-0 w-8 h-8 bg-amber-500/10 rounded-full -mr-4 -mt-4 transition-all duration-500 group-hover/alert:scale-[2]" />
              <div className="relative z-10 w-full">
                <span className="block text-[9px] font-bold text-amber-600   mb-1">Não Iniciadas</span>
                <p className="text-lg font-bold text-amber-700 leading-none">{filteredOrders.filter(o => [OrderStatus.PENDING, OrderStatus.ASSIGNED].includes(o.status)).length}</p>
              </div>
              {overdueUnstartedCount > 0 && (
                <div className="mt-2.5 flex items-center justify-center gap-1.5 text-[9px] font-bold text-rose-600 bg-rose-50 border border-rose-200/60 px-2 py-1 rounded w-full shadow-sm">
                  <AlertCircle size={10} /> {overdueUnstartedCount} Atrasada{overdueUnstartedCount !== 1 && 's'}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* KPI: IMPEDIMENTOS */}
        <div className="bg-gradient-to-br from-rose-50 to-white rounded-2xl p-6 border border-rose-100 shadow-sm flex flex-col justify-between group hover:border-rose-300 transition-all hover:shadow-xl hover:-translate-y-1 duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full -mr-16 -mt-16 transition-all duration-700 group-hover:scale-150" />
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold text-rose-400  ">Impedimentos</p>
              <h3 className="text-4xl font-bold text-rose-600 mt-2 tracking-tighter">
                {filteredOrders.filter(o => o.status === OrderStatus.BLOCKED).length}
              </h3>
            </div>
            <div className="p-3 bg-rose-100/50 text-rose-600 rounded-xl border border-rose-200 shadow-inner group-hover:scale-110 transition-transform"><ZapOff size={22} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 relative z-10">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 border border-rose-100 shadow-lg shadow-slate-200/50">
              <span className="block text-[9px] font-bold text-rose-400   mb-1">Canceladas</span>
              <p className="text-lg font-bold text-rose-700">{filteredOrders.filter(o => o.status === OrderStatus.CANCELED).length}</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 border border-slate-200 shadow-lg shadow-slate-200/50">
              <span className="block text-[9px] font-bold text-slate-400   mb-1">Bloqueios</span>
              <p className="text-lg font-bold text-slate-700">{filteredOrders.filter(o => o.status === OrderStatus.BLOCKED).length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 mb-6">
        {/* VOLUME CHART */}
        <div className="bg-gradient-to-b from-white to-slate-50/50 rounded-2xl border border-slate-200 p-6 flex flex-col shadow-sm relative overflow-hidden h-fit">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(226,232,240,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(226,232,240,0.4)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none" />

          <div className="flex flex-col md:flex-row items-start md:items-center justify-between relative z-10 mb-2 gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900  tracking-tight flex items-center gap-2">
                <BarChart3 className="text-primary-500" size={18} /> fluxo volumétrico
              </h3>
              <p className="text-[11px] text-slate-500 font-bold mt-1  ">Distribuição por Status de Operação</p>
            </div>
            <div className="text-right bg-white p-2.5 px-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
              <div className="text-left border-r border-slate-100 pr-4">
                <p className="text-[9px] font-bold text-slate-400  ">Concluídas</p>
                <p className="text-lg font-bold text-emerald-600 leading-none mt-1">{statusData.find(s => s.status === OrderStatus.COMPLETED)?.count || 0}</p>
              </div>
              <div>
                <p className="text-[9px] font-bold text-slate-400  ">Total Período</p>
                <p className="text-2xl font-bold text-[#1c2d4f] leading-none mt-1">{total}</p>
              </div>
            </div>
          </div>

          <div className="flex items-end justify-between gap-2 sm:gap-4 md:gap-6 h-[155px] px-2 pt-6 border-b-2 border-slate-200 relative z-10 mt-auto">
            {statusData.map(s => {
              const heightPercentage = total > 0 ? (s.count / total) * 100 : 0;
              const hasData = s.count > 0;
              return (
                <div key={s.status} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                  {/* Custom Tooltip */}
                  <div className="absolute -top-14 px-3 py-2 bg-slate-900/95 backdrop-blur-sm text-white text-[11px] font-bold rounded-xl opacity-0 scale-90 group-hover:opacity-100 group-hover:scale-100 transition-all shadow-xl z-20 pointer-events-none origin-bottom border border-slate-700 whitespace-nowrap">
                    <span className="text-slate-400 mr-2">{s.status}:</span> {s.count} OS <span className="ml-1 text-primary-400">({s.percentage}%)</span>
                    <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-slate-900/95 rotate-45 border-r border-b border-slate-700"></div>
                  </div>

                  {/* The Bar */}
                  <div className="w-full relative flex flex-col items-center justify-end h-full">
                    {hasData && (
                      <span className="text-[10px] font-bold text-slate-600 mb-2 opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all">{s.count}</span>
                    )}
                    <div
                      className="w-full max-w-[64px] rounded-t-xl shadow-sm transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:brightness-110 group-hover:shadow-lg relative overflow-hidden"
                      style={{
                        height: hasData ? `${Math.max(heightPercentage, 4)}%` : '4px',
                        background: `linear-gradient(180deg, ${pieColors[s.status]} 0%, ${pieColors[s.status]}dd 100%)`,
                        boxShadow: hasData ? `0 0 20px ${pieColors[s.status]}40` : 'none',
                      }}
                    >
                      <div className="absolute inset-0 w-full h-full bg-gradient-to-b from-white/20 to-transparent pointer-events-none"></div>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-1 text-center min-h-[44px] mt-3">
                    <span className="text-[10px] font-bold text-slate-500  tracking-tighter leading-tight w-20 line-clamp-2 group-hover:text-slate-900 transition-colors">{s.status}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legenda */}
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mt-4 relative z-10 w-full max-w-4xl mx-auto">
            {statusData.map(s => (
              <div key={s.status} className="flex justify-between items-center p-2.5 rounded-xl bg-white border border-slate-200 hover:border-slate-300 transition-all shadow-sm hover:shadow-md group cursor-default">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: pieColors[s.status], boxShadow: `0 0 8px ${pieColors[s.status]}80` }} />
                  <span className="text-[9px] font-bold text-slate-400  truncate max-w-[60px]">{s.status}</span>
                </div>
                <p className="text-sm font-bold text-slate-800 leading-none">{s.count}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PIE CHART */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col justify-between items-center shadow-lg shadow-slate-200/50 h-full">
          <div className="w-full text-center">
            <h4 className="text-[10px] font-bold text-slate-400  tracking-[0.15em] mb-6">Resumo de Qualidade</h4>
          </div>
          <div className="w-40 h-40 rounded-full relative border-[8px] border-slate-50 shadow-inner group transition-transform duration-500 hover:scale-105" style={{ background: getPieGradient() }}>
            <div className="absolute inset-3.5 bg-white rounded-full flex flex-col items-center justify-center shadow-md border border-slate-200">
              <p className="text-2xl font-bold text-slate-900 leading-none">{(statusData.find(s => s.status === OrderStatus.COMPLETED)?.percentage || 0)}%</p>
              <p className="text-[9px] font-bold text-emerald-600  mt-1.5 ">Resolvido</p>
            </div>
          </div>
          <div className="mt-8 space-y-3 w-full">
            <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 ">
              <span>Finalizadas com Sucesso</span>
              <span className="text-slate-900">{statusData.find(s => s.status === OrderStatus.COMPLETED)?.count}</span>
            </div>
            <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(statusData.find(s => s.status === OrderStatus.COMPLETED)?.percentage || 0)}%` }} />
            </div>
          </div>
        </div>

        {/* OPERATION DISTRIBUTION PIE CHART */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col items-center shadow-lg shadow-slate-200/50 relative overflow-hidden h-full">
          <div className="w-full text-center">
            <h4 className="text-[10px] font-bold text-slate-400  tracking-[0.15em] mb-6">Tipos de Modalidade</h4>
          </div>
          <div className="w-36 h-36 rounded-full relative border-[8px] border-slate-50 shadow-sm group transition-transform duration-500 hover:scale-105 shrink-0" style={{ background: getOperationGradient() }}>
            <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center shadow-lg shadow-slate-200/50 border border-slate-200 z-10 transition-transform group-hover:scale-110">
              <PieChart size={18} className="text-slate-300 mb-1" />
            </div>
          </div>
          <div className="mt-6 space-y-2 w-full max-h-[140px] overflow-y-auto custom-scrollbar pr-1 flex-1">
            {operationData.map(o => (
              <div key={o.type} className="flex justify-between items-center text-[10px] font-bold  p-2 border border-slate-100 rounded-lg hover:bg-slate-50 transition-colors cursor-default group/op">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: o.color }} />
                  <span className="text-slate-500 group-hover/op:text-slate-800 truncate max-w-[120px]" title={o.type}>{o.type}</span>
                </div>
                <div className="text-right flex items-center gap-2">
                  <span className="text-slate-900">{o.count}</span>
                  <span className="text-[8px] font-bold text-slate-400 bg-slate-100 px-1 py-0.5 rounded leading-none w-8 text-center">{o.percentage}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* PMOC MODULE */}
        <div className="bg-[#1c2d4f] rounded-xl shadow-lg shadow-[#1c2d4f20] p-6 flex flex-col justify-between text-white relative overflow-hidden group h-full">
          <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-1000"><Briefcase size={160} /></div>

          <div className="relative z-10">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-white/10 text-white rounded-lg border border-white/5"><Activity size={14} /></div>
                <div>
                  <h3 className="text-[11px] font-bold   text-[#60a5fa] leading-tight">Módulo PMOC</h3>
                  <p className="text-[9px] text-white/40 font-bold ">Gestão de Ativos</p>
                </div>
              </div>
              <span className="px-2.5 py-1 bg-white/10 rounded-full text-[9px] font-bold border border-white/10">{activeContracts.length} Contrat.</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-6">
              <div className="p-3 bg-white/5 rounded-lg border border-white/5 group-hover:bg-white/[0.08] transition-colors">
                <p className="text-[8px] font-bold text-rose-400  mb-1">Urgência (3d)</p>
                <p className="text-xl font-bold">{pmocAnalysis.counts.urgent}</p>
              </div>
              <div className="p-3 bg-white/5 rounded-lg border border-white/5 group-hover:bg-white/[0.08] transition-colors">
                <p className="text-[8px] font-bold text-amber-400  mb-1">Atenção (7d)</p>
                <p className="text-xl font-bold">{pmocAnalysis.counts.critical}</p>
              </div>
            </div>

            <div className="space-y-2 mb-6">
              {pmocAnalysis.visits.slice(0, 3).map((v, i) => (
                <div key={i} className="flex justify-between items-center p-2.5 bg-white/5 rounded-lg border border-white/5 text-[10px] hover:bg-white/10 transition-colors cursor-default group/item">
                  <span className="font-bold  truncate max-w-[140px] text-white/80 group-hover/item:text-white">{v.customerName}</span>
                  <span className={`font-bold px-1.5 py-0.5 rounded text-[8px] ${v.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-300' : 'bg-primary-500/20 text-primary-300'}`}>D-{v.daysUntil}</span>
                </div>
              ))}
            </div>

            <button
              onClick={() => onSwitchView('contracts')}
              className="w-full py-2.5 text-[10px] font-bold  text-white/90 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all flex items-center justify-center gap-2 group/btn"
            >
              Cronograma <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
