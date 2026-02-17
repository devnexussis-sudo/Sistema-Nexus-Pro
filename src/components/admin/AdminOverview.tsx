import React, { useMemo, useState, useEffect } from 'react';
import { ServiceOrder, OrderStatus, User, Customer, OrderPriority } from '../../types';
import {
  ClipboardList, CheckCircle, Clock, AlertCircle, TrendingUp, BarChart3,
  Briefcase, Activity, ShieldAlert, Timer, ArrowRight, Calendar, Zap, Layers, Target, Boxes, PieChart, BarChart,
  Search, Filter, UserCheck, Users, ChevronRight, Gauge, ZapOff
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

  // Cálculos de KPI de Fechamento (Exclusivos: 24h, 36h, 48h)
  const closureKPIs = useMemo(() => {
    const completed = filteredOrders.filter(o => o.status === OrderStatus.COMPLETED && o.createdAt && o.endDate);

    let within24 = 0;
    let within36 = 0;
    let within48 = 0;

    completed.forEach(o => {
      if (!o.createdAt || !o.endDate) return;
      try {
        const created = new Date(o.createdAt).getTime();
        const closed = new Date(o.endDate).getTime();
        const diffHours = (closed - created) / (1000 * 60 * 60);

        if (diffHours <= 24) within24++;
        else if (diffHours <= 36) within36++;
        else if (diffHours <= 48) within48++;
      } catch (e) {
        console.warn("Nexus Analytics: Erro ao calcular diffHours", e);
      }
    });

    const slaEfficiency = completed.length > 0 ? Math.round((within24 / completed.length) * 100) : 0;

    return { within24, within36, within48, slaEfficiency, totalCompleted: completed.length };
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
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">Visão Geral</h1>
            <p className="text-xs text-slate-500 font-medium mt-1">Monitore o desempenho operacional em tempo real</p>
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
              placeholder="Pesquisar por cliente, título ou código..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-10 pr-4 py-2.5 text-xs font-medium text-slate-700 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-[#1c2d4f10] focus:border-[#1c2d4f] transition-all shadow-sm"
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* KPI: SLA */}
        <div className="bg-[#1c2d4f] rounded-xl p-6 shadow-xl shadow-[#1c2d4f15] flex flex-col justify-between text-white border border-[#1c2d4f] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 transition-all duration-700 group-hover:scale-110" />
          <div className="flex justify-between items-start relative z-10">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Eficiência SLA (24h)</p>
              <h2 className="text-4xl font-bold mt-2 tracking-tighter">{closureKPIs.slaEfficiency}%</h2>
            </div>
            <div className="p-2.5 bg-white/10 rounded-lg text-white/80 border border-white/10"><Gauge size={20} /></div>
          </div>
          <div className="mt-6 relative z-10">
            <div className="flex justify-between items-baseline mb-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Meta: 85%</span>
              <span className={`text-[10px] font-bold uppercase ${closureKPIs.slaEfficiency >= 85 ? 'text-emerald-400' : 'text-amber-400'}`}>
                {closureKPIs.slaEfficiency >= 85 ? 'Excelente' : 'Atenção'}
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${Math.min(closureKPIs.slaEfficiency, 100)}%` }}></div>
            </div>
          </div>
        </div>

        {/* KPI: RESOLVIDOS */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-[#1c2d4f] transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Resolvidos 24h</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-2 tracking-tighter">{closureKPIs.within24}</h3>
            </div>
            <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-lg border border-emerald-100"><Zap size={20} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 group-hover:bg-white transition-colors">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Total 36h</span>
              <p className="text-sm font-bold text-slate-700">{closureKPIs.within36}</p>
            </div>
            <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 group-hover:bg-white transition-colors">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Total 48h</span>
              <p className="text-sm font-bold text-slate-700">{closureKPIs.within48}</p>
            </div>
          </div>
        </div>

        {/* KPI: EM ANDAMENTO */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-[#1c2d4f] transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Fila Operacional</p>
              <h3 className="text-3xl font-bold text-slate-900 mt-2 tracking-tighter">
                {filteredOrders.filter(o => [OrderStatus.PENDING, OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(o.status)).length}
              </h3>
            </div>
            <div className="p-2.5 bg-[#1c2d4f05] text-[#1c2d4f] rounded-lg border border-[#1c2d4f10]"><Activity size={20} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 group-hover:bg-white transition-colors">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Check-in</span>
              <p className="text-sm font-bold text-[#1c2d4f]">{filteredOrders.filter(o => o.status === OrderStatus.IN_PROGRESS).length}</p>
            </div>
            <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 group-hover:bg-white transition-colors">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Aguardando</span>
              <p className="text-sm font-bold text-slate-700">{filteredOrders.filter(o => [OrderStatus.PENDING, OrderStatus.ASSIGNED].includes(o.status)).length}</p>
            </div>
          </div>
        </div>

        {/* KPI: ANOMALIAS */}
        <div className="bg-white rounded-xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between group hover:border-rose-300 transition-all hover:shadow-md">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Impedimentos</p>
              <h3 className="text-3xl font-bold text-rose-600 mt-2 tracking-tighter">
                {filteredOrders.filter(o => o.status === OrderStatus.BLOCKED).length}
              </h3>
            </div>
            <div className="p-2.5 bg-rose-50 text-rose-600 rounded-lg border border-rose-100"><ZapOff size={20} /></div>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-6">
            <div className="bg-rose-50/50 rounded-lg p-3 border border-rose-100/50 group-hover:bg-white transition-colors">
              <span className="block text-[10px] font-bold text-rose-400 uppercase mb-1">Canceladas</span>
              <p className="text-sm font-bold text-rose-700">{filteredOrders.filter(o => o.status === OrderStatus.CANCELED).length}</p>
            </div>
            <div className="bg-slate-50/50 rounded-lg p-3 border border-slate-100 group-hover:bg-white transition-colors">
              <span className="block text-[10px] font-bold text-slate-400 uppercase mb-1">Bloqueios</span>
              <p className="text-sm font-bold text-slate-700">{filteredOrders.filter(o => o.status === OrderStatus.BLOCKED).length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* VOLUME CHART */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-8 space-y-8 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Fluxo por Status</h3>
              <p className="text-[10px] text-slate-500 font-medium mt-1">Distribuição volumétrica das Ordens de Serviço</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Período</p>
              <p className="text-2xl font-bold text-[#1c2d4f]">{total}</p>
            </div>
          </div>

          <div className="flex items-end justify-between gap-6 h-[220px] px-2 pt-6 border-b border-slate-100">
            {statusData.map(s => (
              <div key={s.status} className="flex-1 flex flex-col items-center gap-4 group">
                <div className="w-full relative flex flex-col items-center">
                  {/* Tooltip */}
                  <div className="absolute -top-12 px-3 py-1.5 bg-slate-900 text-white text-[10px] font-bold rounded-lg opacity-0 group-hover:opacity-100 transition-all shadow-xl z-20 pointer-events-none translate-y-2 group-hover:translate-y-0">
                    {s.count} Ordens ({s.percentage}%)
                  </div>
                  {/* Bar */}
                  <div
                    className="w-full max-w-[36px] rounded-t-lg shadow-sm transition-all duration-700 ease-out cursor-pointer hover:brightness-95"
                    style={{
                      height: `${total > 0 ? (s.count / total) * 200 : 4}px`,
                      backgroundColor: pieColors[s.status],
                      minHeight: '8px'
                    }}
                  />
                </div>
                <div className="flex flex-col items-center gap-1 text-center min-h-[40px]">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-tighter leading-tight w-16 line-clamp-2">{s.status}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Legenda */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {statusData.map(s => (
              <div key={s.status} className="flex flex-col p-3 rounded-lg bg-slate-50/50 border border-slate-100 transition-all hover:bg-white hover:shadow-md hover:border-[#1c2d4f20] group cursor-default">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pieColors[s.status] }} />
                  <span className="text-[8px] font-bold text-slate-400 uppercase truncate">{s.status}</span>
                </div>
                <p className="text-base font-bold text-slate-900 group-hover:text-[#1c2d4f] transition-colors">{s.count}</p>
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
