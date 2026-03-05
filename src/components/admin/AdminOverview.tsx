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
  const [dateTypeFilter, setDateTypeFilter] = useState<'scheduled' | 'created'>('scheduled');
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
      const targetDate = dateTypeFilter === 'scheduled' ? sDate : cDate;

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
    const completed = filteredOrders.filter(o => o.status === OrderStatus.COMPLETED && o.createdAt && o.endDate);

    let within24 = 0;
    let within36 = 0;
    let within48 = 0;
    let over24 = 0;
    let over48 = 0;

    completed.forEach(o => {
      if (!o.createdAt || !o.endDate) return;
      try {
        const created = new Date(o.createdAt).getTime();
        const closed = new Date(o.endDate).getTime();
        const diffHours = (closed - created) / (1000 * 60 * 60);

        if (diffHours <= 24) { within24++; within36++; within48++; }
        else if (diffHours <= 36) { within36++; within48++; over24++; }
        else if (diffHours <= 48) { within48++; over24++; }
        else { over24++; over48++; }
      } catch (e) {
        console.warn("Nexus Analytics: Erro ao calcular diffHours", e);
      }
    });

    const slaEfficiency24 = completed.length > 0 ? Math.round((within24 / completed.length) * 100) : 0;
    const slaEfficiency48 = completed.length > 0 ? Math.round((within48 / completed.length) * 100) : 0;
    const over24Percentage = completed.length > 0 ? Math.round((over24 / completed.length) * 100) : 0;
    const over48Percentage = completed.length > 0 ? Math.round((over48 / completed.length) * 100) : 0;

    return { within24, within36, within48, over24, over48, over24Percentage, over48Percentage, slaEfficiency24, slaEfficiency48, totalCompleted: completed.length };
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
    [OrderStatus.ASSIGNED]: 'var(--color-primary-500, #3b82f6)', // primary-500
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
    <div className="p-8 space-y-8 bg-slate-50/50 h-full overflow-y-auto custom-scrollbar">

      {/* HEADER & FILTERS */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Visão Geral</h1>
            <p className="text-sm text-slate-500 font-medium mt-1">Monitore o desempenho operacional e SLAs em tempo real</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center bg-white border border-slate-200 p-1.5 rounded-lg shadow-sm">
              <select
                value={dateTypeFilter}
                onChange={(e) => setDateTypeFilter(e.target.value as 'scheduled' | 'created')}
                className="bg-slate-50 text-[10px] font-bold uppercase text-slate-600 px-3 py-1.5 rounded-md border border-slate-100 outline-none cursor-pointer"
              >
                <option value="scheduled">Agenda</option>
                <option value="created">Abertura</option>
              </select>
              <div className="h-6 w-px bg-slate-200 mx-3"></div>
              <div className="flex gap-1 mr-3">
                {[
                  { id: 'today', label: 'Hoje' },
                  { id: 'week', label: '7 dias' },
                  { id: 'month', label: 'Trinta' }
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => handleFastFilter(f.id as any)}
                    className="px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all text-slate-500 hover:text-[#1c2d4f] hover:bg-slate-50 active:scale-95"
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="h-6 w-px bg-slate-200 mr-3"></div>
              <div className="flex items-center gap-3 px-1">
                <input type="date" value={startDate} onChange={e => onDateChange(e.target.value, endDate)} className="bg-transparent text-[11px] font-semibold text-slate-700 outline-none w-28" />
                <span className="text-[10px] font-bold text-slate-300 uppercase">Até</span>
                <input type="date" value={endDate} onChange={e => onDateChange(startDate, e.target.value)} className="bg-transparent text-[11px] font-semibold text-slate-700 outline-none w-28" />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[280px]">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <input
              type="text"
              placeholder="Pesquisar por cliente, título ou protocolo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl pl-10 pr-4 py-3 text-sm font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:ring-4 focus:ring-primary-500/5 focus:border-primary-500 transition-all shadow-sm"
            />
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm h-10 min-w-[180px]">
            <UserCheck size={14} className="text-slate-400 mr-2" />
            <select className="bg-transparent text-[10px] font-bold uppercase text-slate-600 outline-none w-full cursor-pointer" value={techFilter} onChange={e => setTechFilter(e.target.value)}>
              <option value="ALL">Todos Técnicos</option>
              {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm h-10 min-w-[180px]">
            <Users size={14} className="text-slate-400 mr-2" />
            <select className="bg-transparent text-[10px] font-bold uppercase text-slate-600 outline-none w-full cursor-pointer" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
              <option value="ALL">Todos Clientes</option>
              {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          <button
            onClick={() => {
              setSearchTerm(''); setTechFilter('ALL'); setCustomerFilter('ALL'); setDateTypeFilter('scheduled');
              onDateChange('', '');
            }}
            className="px-5 h-10 text-[10px] font-bold uppercase text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-slate-200 hover:border-rose-200 shadow-sm"
          >
            Limpar Filtros
          </button>
        </div>
      </div>

      {/* KPI GRID */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 lg:gap-6">

        {/* KPI: SLA 24H (Vibrant Gradient) */}
        <div className="bg-gradient-to-br from-indigo-600 to-[#1c2d4f] rounded-2xl p-6 shadow-xl shadow-indigo-900/20 flex flex-col justify-between text-white relative overflow-hidden group">
          <div className="absolute -top-10 -right-10 w-40 h-40 bg-white/10 rounded-full blur-2xl transition-all duration-700 group-hover:bg-white/20" />
          <div className="flex justify-between items-start relative z-10 w-full mb-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-indigo-200">Eficiência SLA (24h)</p>
              <h2 className="text-4xl font-black mt-2 tracking-tighter drop-shadow-md">{closureKPIs.slaEfficiency24}%</h2>
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
              <span className="text-[10px] font-bold text-indigo-200 uppercase tracking-widest">Meta: {slaTarget}%</span>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${closureKPIs.slaEfficiency24 >= slaTarget ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'}`}>
                {closureKPIs.slaEfficiency24 >= slaTarget ? 'Atingida' : 'Abaixo'}
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
              <p className="text-[11px] font-black uppercase tracking-widest text-emerald-100">Eficiência SLA (48h)</p>
              <h2 className="text-4xl font-black mt-2 tracking-tighter drop-shadow-md">{closureKPIs.slaEfficiency48}%</h2>
            </div>
            <div className="p-2.5 bg-white/10 rounded-xl text-emerald-100 backdrop-blur-sm border border-white/20 shadow-inner group-hover:scale-110 transition-transform"><Target size={22} /></div>
          </div>
          <div className="mt-4 relative z-10">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-[10px] font-bold text-emerald-100 uppercase tracking-widest">Meta: {Math.min(slaTarget + 5, 100)}%</span>
              <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${closureKPIs.slaEfficiency48 >= (slaTarget + 5) ? 'bg-white/20 text-white' : 'bg-rose-500/40 text-rose-100'}`}>
                {closureKPIs.slaEfficiency48 >= (slaTarget + 5) ? 'Excelente' : 'Atenção'}
              </span>
            </div>
            <div className="w-full h-2 bg-emerald-900/50 rounded-full overflow-hidden border border-emerald-400/20">
              <div
                className={`h-full rounded-full transition-all duration-1000 shadow-[0_0_10px_rgba(255,255,255,0.4)] ${closureKPIs.slaEfficiency48 >= (slaTarget + 5) ? 'bg-white' : 'bg-rose-300'}`}
                style={{ width: `${Math.min(closureKPIs.slaEfficiency48, 100)}%` }}>
              </div>
            </div>
          </div>
        </div>

        {/* KPI: FORA DO PRAZO (Atrasos) */}
        <div className="bg-gradient-to-br from-red-600 to-rose-900 rounded-2xl p-6 shadow-xl shadow-red-900/20 flex flex-col justify-between text-white relative overflow-hidden group">
          <div className="absolute -bottom-10 -left-10 w-40 h-40 bg-white/10 rounded-full blur-2xl transition-all duration-700 group-hover:bg-white/20" />
          <div className="flex justify-between items-start relative z-10 w-full mb-4">
            <div>
              <p className="text-[11px] font-black uppercase tracking-widest text-red-200">Atrasos SLA</p>
              <h2 className="text-4xl font-black mt-2 tracking-tighter drop-shadow-md">{closureKPIs.over24}</h2>
            </div>
            <div className="p-2.5 bg-white/10 rounded-xl text-red-100 backdrop-blur-sm border border-white/20 shadow-inner group-hover:scale-110 transition-transform"><AlertCircle size={22} /></div>
          </div>
          <div className="mt-4 relative z-10">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-red-400/20 shadow-sm">
                <span className="block text-[9px] font-black text-red-200 uppercase tracking-widest mb-1">&gt; 24h</span>
                <p className="text-sm font-black text-white">{closureKPIs.over24} <span className="text-[10px] text-red-200 font-normal">({closureKPIs.over24Percentage}%)</span></p>
              </div>
              <div className="bg-black/20 backdrop-blur-sm rounded-xl p-3 border border-red-400/20 shadow-sm">
                <span className="block text-[9px] font-black text-red-200 uppercase tracking-widest mb-1">&gt; 48h</span>
                <p className="text-sm font-black text-white">{closureKPIs.over48} <span className="text-[10px] text-red-200 font-normal">({closureKPIs.over48Percentage}%)</span></p>
              </div>
            </div>
          </div>
        </div>

        {/* KPI: FILA OPERACIONAL */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-[#1c2d4f] transition-all hover:shadow-xl hover:-translate-y-1 duration-300">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fila Operacional</p>
              <h3 className="text-4xl font-black text-slate-800 mt-2 tracking-tighter">
                {filteredOrders.filter(o => [OrderStatus.PENDING, OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(o.status)).length}
              </h3>
            </div>
            <div className="p-3 bg-blue-50 text-blue-600 rounded-xl border border-blue-100 shadow-inner group-hover:scale-110 transition-transform"><Activity size={22} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4">
            <div className="bg-gradient-to-b from-slate-50 to-white rounded-xl p-3 border border-slate-100 shadow-sm">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Em Andamento</span>
              <p className="text-lg font-black text-blue-600">{filteredOrders.filter(o => o.status === OrderStatus.IN_PROGRESS).length}</p>
            </div>
            <div className="bg-gradient-to-b from-slate-50 to-white rounded-xl p-3 border border-slate-100 shadow-sm">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Aguardando</span>
              <p className="text-lg font-black text-slate-700">{filteredOrders.filter(o => [OrderStatus.PENDING, OrderStatus.ASSIGNED].includes(o.status)).length}</p>
            </div>
          </div>
        </div>

        {/* KPI: IMPEDIMENTOS */}
        <div className="bg-gradient-to-br from-rose-50 to-white rounded-2xl p-6 border border-rose-100 shadow-sm flex flex-col justify-between group hover:border-rose-300 transition-all hover:shadow-xl hover:-translate-y-1 duration-300 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/5 rounded-full -mr-16 -mt-16 transition-all duration-700 group-hover:scale-150" />
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-black text-rose-400 uppercase tracking-widest">Impedimentos</p>
              <h3 className="text-4xl font-black text-rose-600 mt-2 tracking-tighter">
                {filteredOrders.filter(o => o.status === OrderStatus.BLOCKED).length}
              </h3>
            </div>
            <div className="p-3 bg-rose-100/50 text-rose-600 rounded-xl border border-rose-200 shadow-inner group-hover:scale-110 transition-transform"><ZapOff size={22} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-4 relative z-10">
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 border border-rose-100 shadow-sm">
              <span className="block text-[9px] font-black text-rose-400 uppercase tracking-widest mb-1">Canceladas</span>
              <p className="text-lg font-black text-rose-700">{filteredOrders.filter(o => o.status === OrderStatus.CANCELED).length}</p>
            </div>
            <div className="bg-white/80 backdrop-blur-sm rounded-xl p-3 border border-slate-100 shadow-sm">
              <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Bloqueios</span>
              <p className="text-lg font-black text-slate-700">{filteredOrders.filter(o => o.status === OrderStatus.BLOCKED).length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* VOLUME CHART */}
        <div className="lg:col-span-2 bg-gradient-to-b from-white to-slate-50/50 rounded-2xl border border-slate-200 p-8 flex flex-col shadow-sm relative overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(226,232,240,0.4)_1px,transparent_1px),linear-gradient(90deg,rgba(226,232,240,0.4)_1px,transparent_1px)] bg-[size:40px_40px] [mask-image:linear-gradient(to_bottom,white,transparent)] pointer-events-none" />

          <div className="flex items-center justify-between relative z-10 mb-8">
            <div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <BarChart3 className="text-primary-500" size={18} /> Fluxo Volumétrico
              </h3>
              <p className="text-[11px] text-slate-500 font-bold mt-1 uppercase tracking-widest">Distribuição por Status de Operação</p>
            </div>
            <div className="text-right bg-white p-3 rounded-xl border border-slate-100 shadow-sm">
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Período</p>
              <p className="text-3xl font-black text-[#1c2d4f] leading-none mt-1">{total}</p>
            </div>
          </div>

          <div className="flex items-end justify-between gap-2 sm:gap-4 md:gap-6 h-[260px] px-2 pt-10 border-b-2 border-slate-200 relative z-10 mt-auto">
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
                      <span className="text-[10px] font-black text-slate-600 mb-2 opacity-0 group-hover:opacity-100 group-hover:-translate-y-1 transition-all">{s.count}</span>
                    )}
                    <div
                      className="w-full max-w-[48px] rounded-t-xl shadow-sm transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)] group-hover:brightness-110 group-hover:shadow-lg relative overflow-hidden"
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
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tighter leading-tight w-20 line-clamp-2 group-hover:text-slate-900 transition-colors">{s.status}</span>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Legenda */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 mt-8 relative z-10">
            {statusData.map(s => (
              <div key={s.status} className="flex flex-col p-3 rounded-xl bg-white border border-slate-100 hover:border-slate-300 transition-all shadow-sm hover:shadow-md group cursor-default">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: pieColors[s.status], boxShadow: `0 0 8px ${pieColors[s.status]}80` }} />
                  <span className="text-[9px] font-black text-slate-400 uppercase truncate">{s.status}</span>
                </div>
                <p className="text-xl font-black text-slate-800 leading-none">{s.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* SIDEBAR */}
        <div className="space-y-8">
          {/* PIE CHART */}
          <div className="bg-white rounded-xl border border-slate-200 p-8 flex flex-col items-center shadow-sm">
            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em] mb-10 text-center">Resumo de Qualidade</h4>
            <div className="w-48 h-48 rounded-full relative border-[10px] border-slate-50 shadow-inner group transition-transform duration-500 hover:scale-105" style={{ background: getPieGradient() }}>
              <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center shadow-lg border border-slate-50">
                <p className="text-3xl font-bold text-slate-900 leading-none">{(statusData.find(s => s.status === OrderStatus.COMPLETED)?.percentage || 0)}%</p>
                <p className="text-[9px] font-bold text-emerald-600 uppercase mt-2 tracking-widest">Resolvido</p>
              </div>
            </div>
            <div className="mt-10 space-y-3 w-full">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-500 uppercase">
                <span>Finalizadas com Sucesso</span>
                <span className="text-slate-900">{statusData.find(s => s.status === OrderStatus.COMPLETED)?.count}</span>
              </div>
              <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(statusData.find(s => s.status === OrderStatus.COMPLETED)?.percentage || 0)}%` }} />
              </div>
            </div>
          </div>

          {/* PMOC MODULE */}
          <div className="bg-[#1c2d4f] rounded-xl shadow-lg shadow-[#1c2d4f20] p-6 text-white relative overflow-hidden group">
            <div className="absolute -right-8 -bottom-8 opacity-10 group-hover:scale-110 group-hover:-rotate-3 transition-all duration-1000"><Briefcase size={160} /></div>

            <div className="relative z-10">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-white/10 text-white rounded-lg border border-white/5"><Activity size={16} /></div>
                  <div>
                    <h3 className="text-[11px] font-bold uppercase tracking-widest text-[#60a5fa]">Módulo PMOC</h3>
                    <p className="text-[9px] text-white/40 font-bold uppercase mt-0.5">Gestão de Ativos</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold border border-white/10">{activeContracts.length} Contratos</span>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="p-3 bg-white/5 rounded-lg border border-white/5 group-hover:bg-white/[0.08] transition-colors">
                  <p className="text-[8px] font-bold text-rose-400 uppercase mb-1">Urgência (3d)</p>
                  <p className="text-xl font-bold">{pmocAnalysis.counts.urgent}</p>
                </div>
                <div className="p-3 bg-white/5 rounded-lg border border-white/5 group-hover:bg-white/[0.08] transition-colors">
                  <p className="text-[8px] font-bold text-amber-400 uppercase mb-1">Atenção (7d)</p>
                  <p className="text-xl font-bold">{pmocAnalysis.counts.critical}</p>
                </div>
              </div>

              <div className="space-y-2 mb-6">
                {pmocAnalysis.visits.slice(0, 3).map((v, i) => (
                  <div key={i} className="flex justify-between items-center p-3 bg-white/5 rounded-lg border border-white/5 text-[10px] hover:bg-white/10 transition-colors cursor-default group/item">
                    <span className="font-bold uppercase truncate max-w-[150px] text-white/80 group-hover/item:text-white">{v.customerName}</span>
                    <span className={`font-bold px-2 py-0.5 rounded-md text-[9px] ${v.daysUntil <= 3 ? 'bg-rose-500/20 text-rose-300' : 'bg-primary-500/20 text-primary-300'}`}>D-{v.daysUntil}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onSwitchView('contracts')}
                className="w-full py-3 text-[10px] font-bold uppercase text-white/90 bg-white/5 hover:bg-white/10 rounded-lg border border-white/10 transition-all flex items-center justify-center gap-2 group/btn"
              >
                Gerenciar Cronograma <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
