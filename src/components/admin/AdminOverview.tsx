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
        (order.id || '').toLowerCase().includes(term);

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
    [OrderStatus.ASSIGNED]: '#6366f1', // indigo-500
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
    <div className="p-5 space-y-6 animate-fade-in bg-[#f8fafc] h-full overflow-y-auto custom-scrollbar">
      {/* 🚀 HEADER COM FILTROS AVANÇADOS */}
      <div className="flex flex-col space-y-4">
        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
          <div>
            <h1 className="text-2xl font-black text-primary-500 uppercase italic tracking-tighter leading-none">Nexus Analytics</h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-1">Operational BI Framework</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Fast Filters */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-lg">
              <div className="flex items-center bg-slate-50 rounded-md px-2 py-1 h-full">
                <select
                  value={dateTypeFilter}
                  onChange={(e) => setDateTypeFilter(e.target.value as 'scheduled' | 'created')}
                  className="bg-transparent text-[9px] font-black uppercase text-primary-500 outline-none cursor-pointer"
                >
                  <option value="scheduled">Dt. Agenda</option>
                  <option value="created">Dt. Abertura</option>
                </select>
              </div>
              <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>
              <div className="flex bg-slate-50 p-1 rounded-md">
                {['today', 'week', 'month'].map((f) => (
                  <button
                    key={f}
                    onClick={() => handleFastFilter(f as any)}
                    className="px-3 py-1.5 text-[8px] font-black uppercase rounded-md transition-all text-slate-500 hover:text-primary-500 hover:bg-white active:scale-95"
                  >{f === 'today' ? 'Hoje' : f === 'week' ? 'Semana' : 'Mês'}</button>
                ))}
              </div>
              <div className="h-4 w-[1px] bg-slate-200 mx-1"></div>
              <div className="flex items-center gap-2 px-2">
                <input type="date" value={startDate} onChange={e => onDateChange(e.target.value, endDate)} className="bg-transparent text-[9px] font-black text-slate-600 outline-none w-24" />
                <span className="text-[9px] font-black text-slate-300">até</span>
                <input type="date" value={endDate} onChange={e => onDateChange(startDate, e.target.value)} className="bg-transparent text-[9px] font-black text-slate-600 outline-none w-24" />
              </div>
            </div>
          </div>
        </div>

        {/* Linha 2 de Filtros (Contextuais) */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input
              type="text"
              placeholder="Filtrar por nome ou protocolo..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-4 py-2.5 text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-primary-100 transition-all"
            />
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 px-3 h-10 min-w-[150px]">
            <UserCheck size={14} className="text-slate-400 mr-2" />
            <select className="bg-transparent text-[9px] font-black uppercase text-slate-600 outline-none w-full cursor-pointer" value={techFilter} onChange={e => setTechFilter(e.target.value)}>
              <option value="ALL">Todo Time</option>
              {techs.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
            </select>
          </div>

          <div className="flex items-center bg-white border border-slate-200 rounded-lg p-1 px-3 h-10 min-w-[150px]">
            <Users size={14} className="text-slate-400 mr-2" />
            <select className="bg-transparent text-[9px] font-black uppercase text-slate-600 outline-none w-full cursor-pointer" value={customerFilter} onChange={e => setCustomerFilter(e.target.value)}>
              <option value="ALL">Todos Clientes</option>
              {customers.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>

          <button
            onClick={() => {
              setSearchTerm(''); setTechFilter('ALL'); setCustomerFilter('ALL'); setDateTypeFilter('scheduled');
              onDateChange('', '');
            }}
            className="px-4 h-10 text-[9px] font-black uppercase text-rose-500 hover:bg-rose-50 rounded-lg transition-all border border-dashed border-rose-200"
          >
            Limpar
          </button>
        </div>
      </div>

      {/* 📊 GRID PRINCIPAL DE KPIS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI: EFICIÊNCIA SLA 24H */}
        <div className="bg-primary-500 rounded-lg p-6 shadow-none flex flex-col justify-between text-white relative overflow-hidden group">
          <div className="absolute -right-4 -top-4 opacity-10 rotate-12"><Gauge size={120} /></div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest opacity-70">Eficiência SLA (24h)</p>
            <h2 className="text-4xl font-black italic tracking-tighter mt-1">{closureKPIs.slaEfficiency}%</h2>
          </div>
          <div className="mt-4 bg-white/10 rounded-md p-2.5 backdrop-blur-sm border border-white/10">
            <div className="flex justify-between items-center text-[8px] font-black uppercase">
              <span>Meta: 85%</span>
              <span className={closureKPIs.slaEfficiency >= 85 ? 'text-emerald-400' : 'text-rose-400'}>
                {closureKPIs.slaEfficiency >= 85 ? 'Excelente' : 'Atenção'}
              </span>
            </div>
            <div className="w-full h-1 bg-white/10 mt-1.5 rounded-full overflow-hidden">
              <div className="h-full bg-white rounded-full transition-all duration-1000" style={{ width: `${closureKPIs.slaEfficiency}%` }}></div>
            </div>
          </div>
        </div>

        {/* KPI: FECHAMENTO EM 24H */}
        <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-none flex flex-col justify-between group hover:border-primary-500 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Resolvido 24h</p>
              <h3 className="text-3xl font-black text-slate-900 italic tracking-tighter mt-1">{closureKPIs.within24}</h3>
            </div>
            <div className="p-3 bg-emerald-50 text-emerald-500 rounded-lg group-hover:scale-110 transition-transform"><Zap size={20} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-slate-50 rounded-md p-2">
              <span className="text-[7px] font-black text-slate-400 uppercase">Em 36h</span>
              <p className="text-[10px] font-black text-slate-700">{closureKPIs.within36}</p>
            </div>
            <div className="bg-slate-50 rounded-md p-2">
              <span className="text-[7px] font-black text-slate-400 uppercase">Em 48h</span>
              <p className="text-[10px] font-black text-slate-700">{closureKPIs.within48}</p>
            </div>
          </div>
        </div>

        {/* KPI: ABERTOS / EM ANDAMENTO */}
        <div className="bg-white rounded-lg p-6 border border-slate-200 shadow-none flex flex-col justify-between group hover:border-primary-500 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ativos / Em Execução</p>
              <h3 className="text-3xl font-black text-primary-500 italic tracking-tighter mt-1">
                {filteredOrders.filter(o => [OrderStatus.PENDING, OrderStatus.ASSIGNED, OrderStatus.IN_PROGRESS].includes(o.status)).length}
              </h3>
            </div>
            <div className="p-3 bg-primary-50 text-primary-500 rounded-lg group-hover:scale-110 transition-transform"><Activity size={20} /></div>
          </div>
          <p className="text-[8px] font-bold text-slate-400 uppercase mt-4">Fila de Atendimento Digital</p>
        </div>

        {/* KPI: IMPEDIDOS / CANCELADOS (Separados) */}
        <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-indigo-100 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Anomalias / Parada</p>
              <h3 className="text-3xl font-black text-rose-500 italic tracking-tighter mt-1">
                {filteredOrders.filter(o => o.status === OrderStatus.BLOCKED || o.status === OrderStatus.CANCELED).length}
              </h3>
            </div>
            <div className="p-3 bg-rose-50 text-rose-500 rounded-2xl group-hover:scale-110 transition-transform"><ZapOff size={20} /></div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="bg-rose-50/50 rounded-lg p-2">
              <span className="text-[7px] font-black text-rose-400 uppercase">Impedidas</span>
              <p className="text-[10px] font-black text-rose-700">{filteredOrders.filter(o => o.status === OrderStatus.BLOCKED).length}</p>
            </div>
            <div className="bg-slate-100 rounded-lg p-2">
              <span className="text-[7px] font-black text-slate-500 uppercase">Canceladas</span>
              <p className="text-[10px] font-black text-slate-700">{filteredOrders.filter(o => o.status === OrderStatus.CANCELED).length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* GRÁFICO DE BARRAS - DEMANDA POR STATUS */}
        <div className="xl:col-span-2 bg-white rounded-lg shadow-none border border-slate-200 p-8 space-y-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-primary-500 uppercase italic tracking-tighter">Volume Operacional por Status</h3>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Detalhamento da base filtrada</p>
            </div>
            <div className="text-right">
              <p className="text-[8px] font-black text-primary-500 uppercase italic">Base Total</p>
              <p className="text-2xl font-black text-slate-900 italic">{total}</p>
            </div>
          </div>

          <div className="flex items-end justify-between gap-6 h-[200px] px-4 pt-4 border-b border-slate-50">
            {statusData.map(s => (
              <div key={s.status} className="flex-1 flex flex-col items-center gap-4 group">
                <div className="w-full relative flex flex-col items-center">
                  {/* Tooltip */}
                  <div className="absolute -top-10 px-3 py-1.5 bg-slate-900 text-white text-[9px] font-black rounded-xl opacity-0 group-hover:opacity-100 transition-all shadow-xl z-10 translate-y-2 group-hover:translate-y-0">
                    {s.count} OS
                  </div>
                  {/* Bar */}
                  <div
                    className="w-full max-w-[32px] rounded-t-2xl shadow-lg transition-all duration-1000 ease-out cursor-pointer hover:scale-105 group-hover:brightness-110"
                    style={{
                      height: `${total > 0 ? (s.count / total) * 180 : 4}px`,
                      backgroundColor: pieColors[s.status],
                      minHeight: '8px'
                    }}
                  />
                </div>
                <div className="flex flex-col items-center gap-1">
                  <span className="text-[8px] font-black text-slate-700 uppercase tracking-tighter truncate w-16 text-center">{s.status.split(' ')[0]}</span>
                  <span className="text-[7px] font-black text-slate-300 italic">{s.percentage}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Legenda Dinâmica e Detalhada */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 pt-4">
            {statusData.map(s => (
              <div key={s.status} className="flex flex-col p-3 rounded-lg bg-slate-50 border border-slate-100 hover:border-primary-500 transition-colors">
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: pieColors[s.status] }} />
                  <span className="text-[7px] font-black text-slate-400 uppercase italic truncate">{s.status}</span>
                </div>
                <p className="text-sm font-black text-slate-900">{s.count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* SIDEBAR DASHBOARD - PIE E PMOC (Menor evidência) */}
        <div className="space-y-6">
          {/* Distribuição Circular */}
          <div className="bg-white rounded-lg shadow-none border border-slate-200 p-8 flex flex-col items-center">
            <h4 className="text-[10px] font-black text-primary-500 uppercase tracking-[0.2em] mb-8 italic">Distribuição de Status</h4>
            <div className="w-44 h-44 rounded-full relative border-[8px] border-slate-50 shadow-none group" style={{ background: getPieGradient() }}>
              <div className="absolute inset-4 bg-white rounded-full flex flex-col items-center justify-center shadow-none group-hover:scale-95 transition-transform duration-500">
                <p className="text-2xl font-black text-slate-900 leading-none">{(statusData.find(s => s.status === OrderStatus.COMPLETED)?.percentage || 0)}%</p>
                <p className="text-[7px] font-black text-emerald-500 uppercase mt-1 tracking-widest italic">Resolvido</p>
              </div>
            </div>
            <div className="mt-8 space-y-2 w-full">
              <div className="flex justify-between items-center text-[8px] font-black text-slate-400 uppercase">
                <span>Atividade Finalizada</span>
                <span className="text-slate-900">{statusData.find(s => s.status === OrderStatus.COMPLETED)?.count}</span>
              </div>
              <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500" style={{ width: `${(statusData.find(s => s.status === OrderStatus.COMPLETED)?.percentage || 0)}%` }} />
              </div>
            </div>
          </div>

          {/* PMOC (Menor evidência como solicitado) */}
          <div className="bg-primary-500 rounded-lg shadow-none p-6 text-white relative overflow-hidden group">
            <div className="absolute -right-4 -bottom-4 opacity-5 rotate-12 group-hover:scale-110 transition-transform duration-700 text-sky-400"><Briefcase size={100} /></div>

            <div className="relative z-10">
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/10 text-white rounded-md"><Activity size={14} /></div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest italic">Gestão PMOC</h3>
                </div>
                <span className="px-3 py-1 bg-white/5 rounded-md text-[10px] font-black italic">{activeContracts.length} Ativos</span>
              </div>

              <div className="grid grid-cols-2 gap-3 mb-6">
                <div className="p-3 bg-white/5 rounded-md border border-white/5">
                  <p className="text-[7px] font-black text-rose-400 uppercase mb-1">Impacto 3 d.</p>
                  <p className="text-base font-black italic">{pmocAnalysis.counts.urgent}</p>
                </div>
                <div className="p-3 bg-white/5 rounded-md border border-white/5">
                  <p className="text-[7px] font-black text-amber-400 uppercase mb-1">Impacto 7 d.</p>
                  <p className="text-base font-black italic">{pmocAnalysis.counts.critical}</p>
                </div>
              </div>

              <div className="space-y-1 overflow-hidden max-h-[120px]">
                {pmocAnalysis.visits.slice(0, 3).map((v, i) => (
                  <div key={i} className="flex justify-between items-center p-2.5 bg-white/5 rounded-md border border-white/5 text-[8px] hover:bg-white/10 transition-colors">
                    <span className="font-black uppercase italic truncate max-w-[140px]">{v.customerName}</span>
                    <span className="font-black px-2 py-0.5 bg-sky-500 rounded-md text-[7px]">D-{v.daysUntil}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => onSwitchView('contracts')}
                className="w-full mt-4 py-2 text-[8px] font-black uppercase text-white/70 hover:bg-white/5 rounded-md border border-dashed border-white/20 transition-all flex items-center justify-center gap-2"
              >
                Acessar Módulo <ArrowRight size={10} />
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
